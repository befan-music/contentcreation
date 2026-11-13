import { NextResponse } from "next/server";
import { resolveClip } from "@stages/project";
import { magicWithoutPrompt, missingMagic } from "@stages/stages/core";
import { readAnalysis } from "@stages/render/songs";
import { startRender } from "@/lib/server/jobs";
import { DATA_DIR, getProject, listCustomStages, saveProject } from "@/lib/server/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!project.song) return NextResponse.json({ error: "Add a song first." }, { status: 400 });
  const analysis = readAnalysis(DATA_DIR, project.song.id);
  if (!analysis || analysis.status === "preview") return NextResponse.json({ error: "The song is still being analyzed." }, { status: 409 });
  // Magic: the export must match the preview, so every photo needs its styled version first.
  if (magicWithoutPrompt(project, analysis)) return NextResponse.json({ error: "Type a style for the Magic Stage first (Stage or Remix step)." }, { status: 400 });
  const missing = missingMagic(project, analysis);
  if (missing.length) {
    const n = missing.reduce((a, m) => a + m.photoIds.length, 0);
    return NextResponse.json({ error: `Magic still needs to style ${n} photo${n === 1 ? "" : "s"} (“${missing[0].request.prompt}”). Press Generate in the Magic panel first.` }, { status: 409 });
  }
  // Freeze the clip so the video matches what was previewed.
  const frozen = project.clip ? project : saveProject({ ...project, clip: resolveClip(project, analysis) });
  const job = startRender(frozen, analysis, listCustomStages());
  return NextResponse.json({ renderJob: job.id });
}
