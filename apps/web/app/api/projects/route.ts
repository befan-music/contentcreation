import { NextResponse } from "next/server";
import { createAndSaveProject, listProjects } from "@/lib/server/store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(listProjects());
}

export async function POST() {
  return NextResponse.json(createAndSaveProject(), { status: 201 });
}
