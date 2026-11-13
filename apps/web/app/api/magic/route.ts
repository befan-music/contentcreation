import { NextResponse } from "next/server";
import { magicConfig } from "@stages/render/magic";

export const runtime = "nodejs";

/** Whether Magic can generate (provider + model). Never returns credentials. */
export async function GET() {
  return NextResponse.json(magicConfig(), { headers: { "Cache-Control": "no-store" } });
}
