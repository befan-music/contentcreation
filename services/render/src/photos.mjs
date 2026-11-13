/**
 * Photo pipeline (roadmap Phase 2): HEIC -> JPEG, EXIF rotation, resize to
 * render size, focal point from sharp's attention strategy (skin tones,
 * saturation, edges) so photos crop well into any window shape.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const MAX_EDGE = 1600;

function isHeic(buf) {
  const brand = buf.subarray(8, 12).toString("ascii");
  return buf.subarray(4, 8).toString("ascii") === "ftyp" && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(brand);
}

/** Focal point, normalized 0..1: centre of the most "interesting" square region. */
async function focalPoint(input, width, height) {
  try {
    const side = Math.min(width, height);
    if (Math.abs(width - height) < 4) return { x: 0.5, y: 0.5 };
    const { info } = await sharp(input)
      .resize(side, side, { fit: "cover", position: sharp.strategy.attention })
      .toBuffer({ resolveWithObject: true });
    if (typeof info.attentionX === "number" && typeof info.attentionY === "number") {
      return { x: clamp(info.attentionX / width), y: clamp(info.attentionY / height) };
    }
    // Older sharp: infer from crop offsets.
    const cx = info.cropOffsetLeft !== undefined ? (-info.cropOffsetLeft + side / 2) / width : 0.5;
    const cy = info.cropOffsetTop !== undefined ? (-info.cropOffsetTop + side / 2) / height : 0.5;
    return { x: clamp(cx), y: clamp(cy) };
  } catch {
    return { x: 0.5, y: 0.5 };
  }
}

const clamp = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.5));

/**
 * Process one uploaded photo into dataDir/photos/<id>.jpg.
 * Returns a Photo record ({id, src, width, height, focal}).
 */
export async function processPhoto(buffer, dataDir) {
  let input = buffer;
  if (isHeic(buffer)) {
    const { default: convert } = await import("heic-convert");
    input = Buffer.from(await convert({ buffer, format: "JPEG", quality: 0.92 }));
  }
  const id = crypto.randomBytes(8).toString("hex");
  const dir = path.join(dataDir, "photos");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${id}.jpg`);
  const { data, info } = await sharp(input, { failOn: "none" })
    .rotate() // apply EXIF orientation
    .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  fs.writeFileSync(out, data);
  await sharp(data).resize(720, 720, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(dir, `${id}-sm.jpg`));
  const focal = await focalPoint(data, info.width, info.height);
  return { id, src: `photos/${id}.jpg`, srcSmall: `photos/${id}-sm.jpg`, width: info.width, height: info.height, focal };
}

/** A small thumbnail for the photo grid. */
export async function thumbnail(srcPath, size = 320) {
  return sharp(srcPath).resize(size, size, { fit: "cover", position: sharp.strategy.attention }).jpeg({ quality: 75 }).toBuffer();
}
