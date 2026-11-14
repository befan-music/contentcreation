import { NextResponse } from "next/server";
import type { Photo } from "@stages/project";
import { processPhoto } from "@stages/render/photos";
import { downloadResult, lookupResult } from "@/lib/server/imageSearch";
import { DATA_DIR, getProject, updateProject } from "@/lib/server/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const MAX_PHOTOS = 80;

/**
 * POST { ids: string[] } — add photos picked from the online search.
 * Only ids from a recent search are accepted; the server downloads them itself.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 40) : [];
  if (!ids.length) return NextResponse.json({ error: "No photos picked" }, { status: 400 });
  if (project.photos.length + ids.length > MAX_PHOTOS) return NextResponse.json({ error: `Up to ${MAX_PHOTOS} photos per video.` }, { status: 400 });

  const failed: string[] = [];
  const one = async (rid: string): Promise<Photo | null> => {
    const r = lookupResult(rid);
    if (!r) {
      failed.push(rid);
      return null;
    }
    try {
      const photo = await processPhoto(await downloadResult(r), DATA_DIR);
      return { ...photo, credit: r.credit };
    } catch {
      failed.push(r.credit.title);
      return null;
    }
  };
  // Four at a time, keeping the picked order.
  const results: (Photo | null)[] = [];
  for (let i = 0; i < ids.length; i += 4) results.push(...(await Promise.all(ids.slice(i, i + 4).map(one))));
  const added = results.filter((p): p is Photo => !!p);
  const saved = updateProject(id, (p) => ({ ...p, photos: [...p.photos, ...added] }));
  return NextResponse.json({ project: saved, added: added.length, failed });
}
