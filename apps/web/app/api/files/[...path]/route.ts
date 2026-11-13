import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { thumbnail } from "@stages/render/photos";
import { DATA_DIR } from "@/lib/server/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ path: string[] }> };

const PUBLIC_DIRS = new Set(["songs", "photos", "renders", "stages"]);
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
  ".mp4": "video/mp4",
};

/**
 * Serves songs, photos, Stage images and renders from data/, with HTTP Range
 * support (the preview player seeks inside the song). `?w=320` returns a
 * cached thumbnail for photos; `?download=name` forces a download.
 */
export async function GET(req: Request, { params }: Ctx) {
  const parts = (await params).path;
  if (!parts.length || !PUBLIC_DIRS.has(parts[0])) return new Response("Not found", { status: 404 });
  const base = path.resolve(DATA_DIR);
  let file = path.resolve(base, ...parts);
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  const w = Number(url.searchParams.get("w"));
  if (w && (parts[0] === "photos" || parts[0] === "stages") && [160, 320, 640].includes(w)) {
    const thumbDir = path.join(base, ".cache", "thumbs");
    fs.mkdirSync(thumbDir, { recursive: true });
    const thumbFile = path.join(thumbDir, `${parts.join("_")}-${w}.jpg`);
    if (!fs.existsSync(thumbFile)) fs.writeFileSync(thumbFile, await thumbnail(file, w));
    file = thumbFile;
  }

  const size = fs.statSync(file).size;
  const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": parts[0] === "renders" ? "no-cache" : "public, max-age=31536000, immutable",
  };
  const download = url.searchParams.get("download");
  if (download) headers["Content-Disposition"] = `attachment; filename="${download.replace(/[^\w.\- ]+/g, "")}"`;

  const range = req.headers.get("range");
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, { status: 200, headers: { ...headers, "Content-Length": String(size) } });
}
