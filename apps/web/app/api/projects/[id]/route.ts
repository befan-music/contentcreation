import { NextResponse } from "next/server";
import { migrateProject } from "@stages/project";
import { deleteProject, getProject, saveProject } from "@/lib/server/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const project = getProject((await params).id);
  return project ? NextResponse.json(project) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** Save the whole project (autosave from the editor). Server-owned fields are kept. */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const current = getProject(id);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const incoming = migrateProject({ ...(await req.json()), id });
  const saved = saveProject({
    ...incoming,
    id,
    createdAt: current.createdAt,
    // the song is only changed through the song endpoint
    song: current.song,
    // photos can be reordered/removed/pinned, but not invented
    photos: incoming.photos.filter((p) => current.photos.some((c) => c.id === p.id)),
  });
  return NextResponse.json(saved);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  deleteProject((await params).id);
  return new NextResponse(null, { status: 204 });
}
