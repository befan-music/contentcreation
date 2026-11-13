/**
 * Song storage: every song is stored once under its content hash, and its
 * analysis is cached by the same hash (roadmap: "Each song is analyzed only once").
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fetchYouTube } from "./python.mjs";

export const AUDIO_EXTS = [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".oga", ".opus", ".flac", ".webm", ".mp4"];

export function hashFile(file) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(file));
  return h.digest("hex");
}

/** Copy (or move) an audio file into dataDir/songs/<hash><ext>. Returns a Song record + absolute path. */
export function storeSong(srcPath, dataDir, { name, move = false } = {}) {
  const ext = (path.extname(srcPath) || ".mp3").toLowerCase();
  if (!AUDIO_EXTS.includes(ext)) throw new Error(`Unsupported audio type ${ext}`);
  const hash = hashFile(srcPath);
  const dir = path.join(dataDir, "songs");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${hash}${ext}`);
  if (!fs.existsSync(dest)) {
    if (move) fs.renameSync(srcPath, dest);
    else fs.copyFileSync(srcPath, dest);
  } else if (move) fs.rmSync(srcPath, { force: true });
  const songName = name || path.basename(srcPath, ext);
  return { song: { id: hash, name: songName, src: `songs/${hash}${ext}` }, path: dest };
}

/** Download a YouTube song and store it. Returns {song, path, meta}. */
export async function importYouTube(url, dataDir) {
  const tmp = path.join(dataDir, "songs", "incoming", crypto.randomBytes(6).toString("hex"));
  fs.mkdirSync(tmp, { recursive: true });
  try {
    const meta = await fetchYouTube(url, tmp);
    const stored = storeSong(meta.path, dataDir, { name: meta.name || meta.title, move: true });
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
