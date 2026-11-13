import { NextResponse } from "next/server";
import type { Photo } from "@stages/project";
import { processPhoto } from "@stages/render/photos";
import { DATA_DIR, getProject, updateProject } from "@/lib/server/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 40 * 1024 * 1024;
const MAX_PHOTOS = 80;

/** Add photos (multipart, one or more "file" fields). Each is rotated, resized and given a focal point. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const files = (await req.formData()).getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "No photos" }, { status: 400 });
  if (project.photos.length + files.length > MAX_PHOTOS) return NextResponse.json({ error: `Up to ${MAX_PHOTOS} photos per video.` }, { status: 400 });

  const added: Photo[] = [];
  const failed: string[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      failed.push(file.name);
      continue;
    }
    try {
      added.push(await processPhoto(Buffer.from(await file.arrayBuffer()), DATA_DIR));
    } catch {
      failed.push(file.name);
    }
  }
  const saved = updateProject(id, (p) => ({ ...p, photos: [...p.photos, ...added] }));
  return NextResponse.json({ project: saved, failed });
}
