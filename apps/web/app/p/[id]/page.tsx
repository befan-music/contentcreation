import { notFound } from "next/navigation";
import { Editor, type Step } from "@/components/Editor";
import { getProject, listCustomStages } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const STEPS: Step[] = ["song", "photos", "stage", "remix", "export"];

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const { id } = await params;
  const { step } = await searchParams;
  const project = getProject(id);
  if (!project) notFound();
  const initialStep = STEPS.includes(step as Step) ? (step as Step) : project.song ? (project.photos.length ? "stage" : "photos") : "song";
  return <Editor initialProject={project} initialStep={initialStep} customStages={listCustomStages()} />;
}
