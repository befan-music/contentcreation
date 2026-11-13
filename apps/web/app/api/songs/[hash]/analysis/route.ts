import { NextResponse } from "next/server";
import { analysisState } from "@/lib/server/jobs";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ hash: string }> };

/** Analysis for a song: {status: missing|partial|complete, analysis, job}. Polled by the client. */
export async function GET(_req: Request, { params }: Ctx) {
  const { hash } = await params;
  if (!/^[a-f0-9]{64}$/.test(hash)) return NextResponse.json({ error: "bad hash" }, { status: 400 });
  const { status, analysis, job } = analysisState(hash);
  return NextResponse.json(
    { status, analysis, job: job && { status: job.status, progress: job.progress, message: job.message, error: job.error } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
