import { readAnalysis } from "@stages/render/songs";
import { StageMaker } from "@/components/StageMaker";
import { DATA_DIR, getProject, listCustomStages } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export default async function NewStagePage({ searchParams }: { searchParams: Promise<{ project?: string; edit?: string }> }) {
  const { project: projectId, edit } = await searchParams;
  const project = projectId ? getProject(projectId) : null;
  const raw = project?.song ? readAnalysis(DATA_DIR, project.song.id) : null;
  const analysis = raw && raw.status !== "preview" ? raw : null;
  const existing = edit ? listCustomStages().find((s) => s.id === edit) ?? null : null;
  return <StageMaker project={project} analysis={analysis} existing={existing} />;
}
