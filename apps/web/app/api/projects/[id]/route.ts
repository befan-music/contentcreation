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
  // A page that hasn't seen the latest song yet must not write its clip, blocks,
  // sections or hit edits (they belong to the previous song).
  const staleSong = (incoming.song?.id ?? null) !== (current.song?.id ?? null);
  const saved = saveProject({
    ...incoming,
    id,
    createdAt: current.createdAt,
    // the song is only changed through the song endpoint
    song: current.song,
    ...(staleSong ? { clip: current.clip, blocks: current.blocks, sections: current.sections, hits: current.hits } : {}),
    // photos can be reordered/removed/pinned, but not invented; AI styles and search credits are server-owned
    photos: incoming.photos
      .filter((p) => current.photos.some((c) => c.id === p.id))
      .map((p) => {
        const c = current.photos.find((x) => x.id === p.id);
        return { ...p, styles: c?.styles, credit: c?.credit };
      }),
  });
  return NextResponse.json(saved);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  deleteProject((await params).id);
  return new NextResponse(null, { status: 204 });
}
