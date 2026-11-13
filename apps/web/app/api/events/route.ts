import { NextResponse } from "next/server";
import { appendEvent } from "@/lib/server/store";

export const runtime = "nodejs";

const ALLOWED = /^[a-z_]{3,40}$/;

/** Local analytics sink (used when no PostHog key is configured). Appends to data/events.jsonl. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { event?: string; props?: Record<string, unknown> } | null;
  if (!body?.event || !ALLOWED.test(body.event)) return NextResponse.json({ error: "bad event" }, { status: 400 });
  appendEvent({ event: body.event, props: body.props ?? {} });
  return new NextResponse(null, { status: 204 });
}
