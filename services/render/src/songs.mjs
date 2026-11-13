/**
 * Song storage: every song is stored once under its content hash, and its
 * analysis is cached by the same hash (roadmap: "Each song is analyzed only once").
 *
 * Every stored song is guaranteed playable in every browser (Safari included)
 * and in the renderer: MP3, AAC (m4a) and WAV are kept as they are; anything
 * else (Opus/WebM from YouTube, OGG, FLAC, ALAC…) is converted to AAC m4a.
 * The analysis runs on the stored file, so timing matches playback exactly.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fetchYouTube } from "./python.mjs";
import { ANALYSIS_DIR } from "./paths.mjs";

const require = createRequire(import.meta.url);

export const AUDIO_EXTS = [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".oga", ".opus", ".flac", ".webm", ".mp4", ".mka", ".aiff", ".aif", ".wma"];

export function hashFile(file) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(file));
  return h.digest("hex");
}

/** A full ffmpeg build (all decoders): STAGES_FFMPEG, the analysis venv's imageio-ffmpeg, Remotion's, or PATH. */
let ffmpegCache;
export function ffmpegExe() {
  if (ffmpegCache) return ffmpegCache;
  const candidates = [process.env.STAGES_FFMPEG];
  for (const lib of [path.join(ANALYSIS_DIR, ".venv", "Lib", "site-packages"), ...globLib(path.join(ANALYSIS_DIR, ".venv", "lib"))]) {
    const dir = path.join(lib, "imageio_ffmpeg", "binaries");
    if (fs.existsSync(dir)) candidates.push(...fs.readdirSync(dir).filter((f) => f.startsWith("ffmpeg")).map((f) => path.join(dir, f)));
  }
  try {
    const pkg = { win32: "@remotion/compositor-win32-x64-msvc", darwin: "@remotion/compositor-darwin-arm64", linux: "@remotion/compositor-linux-x64-gnu" }[process.platform];
    if (pkg) candidates.push(path.join(path.dirname(require.resolve(`${pkg}/package.json`)), process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"));
  } catch {}
  ffmpegCache = candidates.find((c) => c && fs.existsSync(c)) || "ffmpeg";
  return ffmpegCache;
}

function globLib(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((d) => d.startsWith("python")).map((d) => path.join(dir, d, "site-packages"));
}

function runFfmpeg(args, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegExe(), args, { windowsHide: true });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => p.kill(), timeoutMs);
    p.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
    p.on("error", () => {
      clearTimeout(timer);
      resolve({ code: -1, stderr: "ffmpeg not found" });
    });
  });
}

/** Audio codec of the first audio stream (e.g. "aac", "mp3", "opus", "pcm_s16le"), or null. */
export async function probeAudioCodec(file) {
  const { stderr } = await runFfmpeg(["-hide_banner", "-i", file], { timeoutMs: 30_000 });
  const m = /Stream #\d+:\d+.*?: Audio: ([a-z0-9_]+)/i.exec(stderr);
  return m ? m[1].toLowerCase() : null;
}

/** True if browsers (incl. Safari) and the renderer can all play this file as-is. */
export function isUniversallyPlayable(ext, codec) {
  if (!codec) return false;
  if (ext === ".mp3") return codec === "mp3";
  if (ext === ".m4a" || ext === ".aac" || ext === ".mp4") return codec === "aac";
  if (ext === ".wav") return codec.startsWith("pcm_");
  return false;
}

async function remuxFastStart(src, dest) {
  const tmp = `${dest}.tmp.m4a`;
  const { code } = await runFfmpeg(["-hide_banner", "-y", "-i", src, "-vn", "-map", "0:a:0", "-c", "copy", "-movflags", "+faststart", tmp], { timeoutMs: 60_000 });
  if (code !== 0 || !fs.existsSync(tmp)) {
    fs.rmSync(tmp, { force: true });
    return false;
  }
  fs.renameSync(tmp, dest);
  return true;
}

/** Convert any audio to AAC in an m4a container (stereo, 44.1 kHz, 192 kbps, fast start). */
export async function toPlayableM4a(src, dest) {
  const tmp = `${dest}.tmp.m4a`;
  const { code, stderr } = await runFfmpeg(["-hide_banner", "-y", "-i", src, "-vn", "-map", "0:a:0", "-ac", "2", "-ar", "44100", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", tmp], {
    timeoutMs: 300_000,
  });
  if (code !== 0 || !fs.existsSync(tmp)) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`Couldn't read this audio file (${(stderr.split("\n").filter(Boolean).pop() || "unknown format").slice(0, 120)}).`);
  }
  fs.renameSync(tmp, dest);
}

/**
 * Store an audio file under dataDir/songs/<hash>.<ext>, converting it to AAC
 * m4a first when some browser couldn't play it. Returns {song, path, converted}.
 */
export async function storeSong(srcPath, dataDir, { name, move = false } = {}) {
  const ext = (path.extname(srcPath) || ".mp3").toLowerCase();
  if (!AUDIO_EXTS.includes(ext)) throw new Error(`Unsupported audio type ${ext}. Try mp3, m4a or wav.`);
  const hash = hashFile(srcPath);
  const dir = path.join(dataDir, "songs");
  fs.mkdirSync(dir, { recursive: true });
  const songName = name || path.basename(srcPath, ext);
  const done = (file, converted) => {
    if (move && fs.existsSync(srcPath) && path.resolve(srcPath) !== path.resolve(file)) fs.rmSync(srcPath, { force: true });
    return { song: { id: hash, name: songName, src: `songs/${path.basename(file)}` }, path: file, converted };
  };

  // Already stored (same content uploaded before)?
  const existing = fs.readdirSync(dir).find((f) => f.startsWith(`${hash}.`) && !f.endsWith(".tmp.m4a"));
  if (existing) return done(path.join(dir, existing), false);

  const codec = await probeAudioCodec(srcPath);
  if (isUniversallyPlayable(ext, codec)) {
    const dest = path.join(dir, `${hash}${ext === ".mp4" ? ".m4a" : ext}`);
    // MP4/M4A (e.g. YouTube's DASH audio): re-pack without re-encoding so the index
    // sits at the start (browsers start playing and seek instantly). ~0.3 s.
    if ((ext === ".m4a" || ext === ".mp4") && (await remuxFastStart(srcPath, dest))) return done(dest, false);
    if (move) fs.renameSync(srcPath, dest);
    else fs.copyFileSync(srcPath, dest);
    return done(dest, false);
  }
  const dest = path.join(dir, `${hash}.m4a`);
  await toPlayableM4a(srcPath, dest);
  return done(dest, true);
}

/** Download a YouTube song and store it (playable everywhere). Returns {song, path, meta}. */
export async function importYouTube(url, dataDir, { onProgress } = {}) {
  const tmp = path.join(dataDir, "songs", "incoming", crypto.randomBytes(6).toString("hex"));
  fs.mkdirSync(tmp, { recursive: true });
  try {
    const meta = await fetchYouTube(url, tmp, { onProgress: (p, m) => onProgress?.(0.05 + 0.85 * p, m) });
    onProgress?.(0.92, "Preparing the song");
    const stored = await storeSong(meta.path, dataDir, { name: meta.name || meta.title, move: true });
    stored.song.source = { kind: "youtube", videoId: meta.videoId, title: meta.title };
    return { ...stored, meta };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export function analysisPath(dataDir, hash) {
  const dir = path.join(dataDir, "analysis");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${hash}.json`);
}

export function readAnalysis(dataDir, hash) {
  const p = analysisPath(dataDir, hash);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null; // being written
  }
}
