import { NextResponse } from "next/server";
import type { StageDef } from "@stages/project";
import { CUSTOM_BEHAVIORS, customStageParams } from "@stages/stages/core";
import { listCustomStages, newId, saveCustomStage } from "@/lib/server/store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(listCustomStages());
}

/** Create or update a Custom Stage (photo look + one of the shared behaviors). */
export async function POST(req: Request) {
  const body = (await req.json()) as Partial<StageDef>;
  const look = body.look;
  if (!look || look.kind !== "photo" || !/^stages\/[\w-]+\.jpg$/.test(look.imageSrc)) return NextResponse.json({ error: "Upload an object photo first." }, { status: 400 });
  if (!look.windows?.length) return NextResponse.json({ error: "Tap at least one window." }, { status: 400 });
  if (!CUSTOM_BEHAVIORS.some((b) => b.id === body.behavior)) return NextResponse.json({ error: "Pick a behavior." }, { status: 400 });

  const windows = look.windows.slice(0, 64).map((w, i) => ({
    id: String(w.id || i),
    order: Number.isFinite(w.order) ? w.order : i,
    polygon: w.polygon.slice(0, 64).map(([x, y]) => [Math.min(1, Math.max(0, Number(x))), Math.min(1, Math.max(0, Number(y)))] as [number, number]),
  }));
  const stage: StageDef = {
    id: body.id && /^custom-[a-f0-9]{12}$/.test(body.id) ? body.id : `custom-${newId()}`,
    name: (body.name || "My Stage").slice(0, 40),
    description: (body.description || "A Custom Stage made from a photo.").slice(0, 160),
    source: "custom",
    look: { kind: "photo", imageSrc: look.imageSrc, width: look.width, height: look.height, windows },
    behavior: body.behavior!,
    params: customStageParams(body.behavior!),
  };
  return NextResponse.json(saveCustomStage(stage), { status: 201 });
}
