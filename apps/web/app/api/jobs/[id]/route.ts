import { NextResponse } from "next/server";
import { getJob } from "@/lib/server/jobs";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const job = getJob((await params).id);
  return job ? NextResponse.json(job, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
