import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { DATA_DIR, newId } from "@/lib/server/store";

export const runtime = "nodejs";

/**
 * Object photo for a Custom Stage: rotated, then cropped to 9:16 around its most
 * interesting region, at 1080×1920. Window polygons are normalized to this frame.
 */
export async function POST(req: Request) {
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No photo" }, { status: 400 });
  if (file.size > 40 * 1024 * 1024) return NextResponse.json({ error: "Photo is over 40 MB." }, { status: 413 });
  let input = Buffer.from(await file.arrayBuffer());
  if (/\.(heic|heif)$/i.test(file.name)) {
    const { default: convert } = await import("heic-convert");
    input = Buffer.from(await convert({ buffer: input, format: "JPEG", quality: 0.92 }));
  }
  const dir = path.join(DATA_DIR, "stages");
  fs.mkdirSync(dir, { recursive: true });
  const name = `img-${newId()}.jpg`;
  try {
    await sharp(input, { failOn: "none" })
      .rotate()
      .resize(1080, 1920, { fit: "cover", position: sharp.strategy.attention })
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(path.join(dir, name));
  } catch {
    return NextResponse.json({ error: "Couldn't read that photo." }, { status: 415 });
  }
  return NextResponse.json({ imageSrc: `stages/${name}`, width: 1080, height: 1920 });
}
