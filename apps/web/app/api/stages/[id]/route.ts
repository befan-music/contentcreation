import { NextResponse } from "next/server";
import { deleteCustomStage } from "@/lib/server/store";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  deleteCustomStage((await params).id);
  return new NextResponse(null, { status: 204 });
}
