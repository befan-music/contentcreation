import { NextResponse } from "next/server";
import { resolveClip } from "@stages/project";
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
  if (!analysis) return NextResponse.json({ error: "The song is still being analyzed." }, { status: 409 });
  // Freeze the clip so the video matches what was previewed.
  const frozen = project.clip ? project : saveProject({ ...project, clip: resolveClip(project, analysis) });
  const job = startRender(frozen, analysis, listCustomStages());
  return NextResponse.json({ renderJob: job.id });
}
