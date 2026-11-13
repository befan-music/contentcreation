import { NextResponse } from "next/server";
import { normalizePrompt } from "@stages/stages/core";
import { magicConfig } from "@stages/render/magic";
import { startMagic } from "@/lib/server/jobs";
import { getProject } from "@/lib/server/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Start AI restyling of the project's photos: body {prompt, variation}. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!magicConfig().configured) {
    return NextResponse.json({ error: "Magic needs a Higgsfield API key. Add HIGGSFIELD_KEY to apps/web/.env.local and restart the app." }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as { prompt?: string; variation?: number };
  const prompt = (body.prompt ?? "").slice(0, 200);
  if (!normalizePrompt(prompt)) return NextResponse.json({ error: "Type a style first, e.g. “minecraft”." }, { status: 400 });
  if (!project.photos.length) return NextResponse.json({ error: "Add photos first." }, { status: 400 });
  const variation = Math.max(0, Math.min(999, Math.floor(Number(body.variation) || 0)));
  const { job, key, total } = startMagic(id, prompt, variation);
  return NextResponse.json({ magicJob: job.id, key, total });
}
