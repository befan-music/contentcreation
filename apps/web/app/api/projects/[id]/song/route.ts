import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { AUDIO_EXTS, storeSong } from "@stages/render/songs";
import { ensureAnalysis, startYouTubeImport } from "@/lib/server/jobs";
import { DATA_DIR, getProject, updateProject } from "@/lib/server/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 60 * 1024 * 1024;

/**
 * Set the project's song, either from an uploaded audio file (multipart "file")
 * or from a YouTube link (JSON {url}). Starts the analysis right away.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const { url } = (await req.json()) as { url?: string };
    if (!url || !/^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//.test(url.trim())) {
      return NextResponse.json({ error: "Paste a YouTube link (youtube.com or youtu.be)." }, { status: 400 });
    }
    const job = startYouTubeImport(id, url.trim());
    return NextResponse.json({ importJob: job.id });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is over 60 MB." }, { status: 413 });
  const ext = path.extname(file.name).toLowerCase();
  if (!AUDIO_EXTS.includes(ext)) return NextResponse.json({ error: `Unsupported file type ${ext || ""}. Try mp3, m4a or wav.` }, { status: 415 });

  const tmp = path.join(os.tmpdir(), `stages-upload-${Date.now()}${ext}`);
  fs.writeFileSync(tmp, Buffer.from(await file.arrayBuffer()));
  try {
    const name = path.basename(file.name, ext);
    const { song, path: songPath } = storeSong(tmp, DATA_DIR, { name, move: true });
    const project = updateProject(id, (p) => ({
      ...p,
      song,
      clip: null,
      blocks: [],
      sections: null,
      hits: { muted: [], added: [] },
      name: p.name === "Untitled video" ? name : p.name,
    }));
    const job = ensureAnalysis(song.id, songPath);
    return NextResponse.json({ project, analysisJob: job?.id ?? null });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
