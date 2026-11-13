/**
 * Runs the Python music engine (services/analysis) as a child process and
 * parses its line protocol: PROGRESS <p> <msg> | PARTIAL | RESULT <json> | DONE | ERROR <msg>.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { ANALYSIS_DIR, pythonExe } from "./paths.mjs";

function run(script, args, { onLine, timeoutMs, timeoutMessage } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonExe(), [path.join(ANALYSIS_DIR, script), ...args], {
      cwd: ANALYSIS_DIR,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
      windowsHide: true,
    });
    let error = null;
    let result = null;
    const timer = timeoutMs
      ? setTimeout(() => {
          error = timeoutMessage || `${script} timed out`;
          child.kill();
        }, timeoutMs)
      : null;
    let buffer = "";
    const stderr = [];
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let i;
      while ((i = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (!line) continue;
        if (line.startsWith("ERROR ")) error = line.slice(6);
        else if (line.startsWith("RESULT ")) result = JSON.parse(line.slice(7));
        onLine?.(line);
      }
    });
    child.stderr.on("data", (d) => {
      stderr.push(String(d));
      if (stderr.length > 50) stderr.shift();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0 && !error) resolve(result);
      else reject(new Error(error || `${script} exited with code ${code}: ${stderr.join("").slice(-500)}`));
    });
  });
}

/**
 * Analyze a song. Calls onProgress(p, message) and onPartial() when the fast
 * pass (beats, bars, sections, clips) has been written to outJson.
 */
export function analyzeSong(songPath, outJson, { hash, fast = false, onProgress, onPartial } = {}) {
  const args = [songPath, outJson];
  if (hash) args.push("--hash", hash);
  if (fast) args.push("--fast");
  return run("analyze.py", args, {
    onLine(line) {
      if (line === "PARTIAL") onPartial?.();
      else if (line.startsWith("PROGRESS ")) {
        const [, p, ...msg] = line.split(" ");
        onProgress?.(Number(p), msg.join(" "));
      }
    },
  });
}

/** Download a song's audio from a YouTube link into outDir. Resolves to {path, name, title, artist, duration, videoId}. */
export function fetchYouTube(url, outDir, { onProgress } = {}) {
  return run("fetch_song.py", [url, outDir], {
    timeoutMs: 180_000,
    timeoutMessage: "YouTube didn't respond within 3 minutes. Check the connection and try again, or upload the audio file instead.",
    onLine(line) {
      if (line.startsWith("PROGRESS ")) {
        const [, p, ...msg] = line.split(" ");
        onProgress?.(Number(p), msg.join(" "));
      }
    },
  });
}
