import { NextResponse } from "next/server";
import { searchImages } from "@/lib/server/imageSearch";

export const runtime = "nodejs";

/** GET /api/images/search?q=berkeley&n=10&page=1 — openly licensed photos from Openverse (Commons as backup). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!q) return NextResponse.json({ error: "Type something to search for" }, { status: 400 });
  const n = Math.min(40, Math.max(1, Number(url.searchParams.get("n")) || 10));
  const page = Math.min(20, Math.max(1, Number(url.searchParams.get("page")) || 1));
  try {
    return NextResponse.json(await searchImages(q, n, page));
  } catch (e) {
    return NextResponse.json({ error: `Photo search is unavailable right now (${(e as Error).message})` }, { status: 502 });
  }
}
