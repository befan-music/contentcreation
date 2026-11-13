/**
 * Render worker (roadmap Phase 2): project JSON -> MP4 with audio + silent MP4.
 *
 * - The Remotion bundle is cached on disk, keyed by a hash of the Stage source,
 *   so a render starts in seconds instead of re-bundling every time.
 * - Assets (song, photos, object photos) are served to headless Chrome by a
 *   local static server with HTTP Range support (needed for audio seeking).
 * - The silent version is made by dropping the audio track (no second render).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";
import { REPO_ROOT, dataDir as defaultDataDir } from "./paths.mjs";

const require = createRequire(import.meta.url);
const ENTRY = path.join(REPO_ROOT, "packages", "stages", "src", "remotion", "index.ts");
const SOURCE_DIRS = [path.join(REPO_ROOT, "packages", "stages", "src"), path.join(REPO_ROOT, "packages", "project", "src")];

const MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
  ".opus": "audio/ogg",
  ".mp4": "video/mp4",
  ".json": "application/json",
};

function sourceHash() {
  const h = crypto.createHash("sha256");
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(tsx?|mjs|js|css)$/.test(name)) h.update(p).update(fs.readFileSync(p));
    }
  };
  SOURCE_DIRS.forEach(walk);
  return h.digest("hex").slice(0, 16);
}

/** Bundle the Stages composition once per source version. */
export async function getBundle({ onLog } = {}) {
  const cacheRoot = path.join(defaultDataDir(), ".cache");
  const dir = path.join(cacheRoot, `bundle-${sourceHash()}`);
  if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  onLog?.("Bundling Stages (first render after a code change)…");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const tmp = `${dir}.tmp-${process.pid}`;
  await bundle({ entryPoint: ENTRY, outDir: tmp, onProgress: () => {} });
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(tmp, dir);
  // Keep only the 3 newest bundles.
  const old = fs
    .readdirSync(cacheRoot)
    .filter((n) => n.startsWith("bundle-") && !n.includes(".tmp"))
    .map((n) => ({ n, t: fs.statSync(path.join(cacheRoot, n)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(3);
  for (const { n } of old) fs.rmSync(path.join(cacheRoot, n), { recursive: true, force: true });
  return dir;
}

/** Static file server for the data directory, with Range support. Resolves to {url, close}. */
export function serveDirectory(root) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
      const file = path.resolve(base, rel);
      if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end();
        return;
      }
      const size = fs.statSync(file).size;
      const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
      const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
      const headers = { "Content-Type": type, "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*" };
      if (range) {
        const start = range[1] ? Number(range[1]) : size - Number(range[2]);
        const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
        fs.createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { ...headers, "Content-Length": size });
        fs.createReadStream(file).pipe(res);
      }
    } catch {
      res.writeHead(500).end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

const LOCAL_BROWSERS = {
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ],
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
  linux: ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
};

/**
 * Which browser renders frames. STAGES_BROWSER wins; otherwise a locally
 * installed Chrome/Edge (new headless mode); otherwise Remotion downloads its
 * Chrome Headless Shell (the default on servers).
 */
async function browserOptions(onLog) {
  const explicit = process.env.STAGES_BROWSER;
  const local = explicit || (LOCAL_BROWSERS[process.platform] ?? []).find((p) => fs.existsSync(p));
  if (local && process.env.STAGES_BROWSER_MODE !== "headless-shell") {
    return { browserExecutable: local, chromeMode: "chrome-for-testing" };
  }
  onLog?.("Downloading Chrome Headless Shell (one time)…");
  await ensureBrowser();
  return {};
}

function ffmpegPath() {
  const candidates = {
    win32: ["@remotion/compositor-win32-x64-msvc"],
    darwin: ["@remotion/compositor-darwin-arm64", "@remotion/compositor-darwin-x64"],
    linux: ["@remotion/compositor-linux-x64-gnu", "@remotion/compositor-linux-x64-musl", "@remotion/compositor-linux-arm64-gnu", "@remotion/compositor-linux-arm64-musl"],
  }[process.platform] ?? [];
  for (const pkg of candidates) {
    try {
      const dir = path.dirname(require.resolve(`${pkg}/package.json`));
      const exe = path.join(dir, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
      if (fs.existsSync(exe)) return exe;
    } catch {}
  }
  return null;
}

function stripAudio(input, output) {
  const ff = ffmpegPath();
  if (!ff) return Promise.resolve(false);
  return new Promise((resolve) => {
    const p = spawn(ff, ["-y", "-v", "error", "-i", input, "-an", "-c:v", "copy", "-movflags", "+faststart", output], { windowsHide: true, cwd: path.dirname(ff) });
    p.on("close", (code) => resolve(code === 0 && fs.existsSync(output)));
    p.on("error", () => resolve(false));
  });
}

/**
 * Render a project.
 * @param {object} o
 * @param {import("@stages/project").VideoInput} o.input  (assetBase is replaced)
 * @param {string} o.outBase   output path without extension; writes <outBase>.mp4 and <outBase>-silent.mp4
 * @param {string} [o.assetsDir] directory the project's asset paths are relative to (default: data dir)
 * @param {(p: number, stage: string) => void} [o.onProgress]
 */
export async function renderProject({ input, outBase, assetsDir, onProgress, onLog, concurrency }) {
  const started = Date.now();
  onProgress?.(0.01, "Preparing");
  const browser = await browserOptions(onLog);
  const tBundle = Date.now();
  const serveUrl = await getBundle({ onLog });
  onLog?.(`Bundle ready in ${((Date.now() - tBundle) / 1000).toFixed(1)} s`);
  const server = await serveDirectory(assetsDir || defaultDataDir());
  try {
    const inputProps = { ...input, assetBase: server.url };
    const composition = await selectComposition({ serveUrl, id: "Stages", inputProps, ...browser });
    fs.mkdirSync(path.dirname(outBase), { recursive: true });
    const withAudio = `${outBase}.mp4`;
    const silent = `${outBase}-silent.mp4`;
    onProgress?.(0.05, "Rendering");
    const tRender = Date.now();
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      audioCodec: "aac",
      outputLocation: withAudio,
      inputProps,
      imageFormat: "jpeg",
      jpegQuality: 90,
      crf: 18,
      concurrency: concurrency ?? Number(process.env.STAGES_RENDER_CONCURRENCY || os.cpus().length),
      timeoutInMilliseconds: 60000,
      ...browser,
      onProgress: ({ progress }) => onProgress?.(0.05 + 0.9 * progress, "Rendering"),
    });
    onLog?.(`Rendered ${composition.durationInFrames} frames in ${((Date.now() - tRender) / 1000).toFixed(1)} s`);
    onProgress?.(0.96, "Making the silent version");
    const stripped = input.project.song ? await stripAudio(withAudio, silent) : (fs.copyFileSync(withAudio, silent), true);
    if (!stripped) {
      await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: silent, inputProps: { ...inputProps, muted: true }, muted: true, imageFormat: "jpeg", jpegQuality: 90, crf: 18, ...browser });
    }
    onProgress?.(1, "Done");
    return { withAudio, silent, frames: composition.durationInFrames, seconds: (Date.now() - started) / 1000 };
  } finally {
    await server.close();
  }
}
