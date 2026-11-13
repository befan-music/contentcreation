#!/usr/bin/env node
/**
 * Check the Higgsfield credentials used by the Magic Stage.
 *
 *   node scripts/higgsfield-check.mjs            # reads apps/web/.env.local
 *   node scripts/higgsfield-check.mjs --style "minecraft" --photo some.jpg --out styled.jpg
 *        (also restyles one photo for real: costs one image)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, "apps", "web", ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const { checkHiggsfield, magicConfig, stylizePhoto } = await import("../services/render/src/magic.mjs");
const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);

console.log("config:", magicConfig());
try {
  const r = await checkHiggsfield();
  console.log(r.ok ? `✓ ${r.message}` : `✗ ${r.message}`);
  if (!r.ok) process.exit(1);
} catch (e) {
  console.log(`✗ ${e.message}`);
  process.exit(1);
}

const style = opt("--style");
const photo = opt("--photo");
if (style && photo) {
  const { buildMagicPrompt, styleKey } = await import("tsx/esm/api").then(({ tsImport }) => tsImport("@stages/stages/core", import.meta.url));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stages-magic-"));
  fs.mkdirSync(path.join(tmp, "photos"));
  fs.copyFileSync(photo, path.join(tmp, "photos", "check.jpg"));
  const t = Date.now();
  const key = styleKey(style, 0);
  const result = await stylizePhoto({ photo: { id: "check", src: "photos/check.jpg" }, dataDir: tmp, prompt: style, fullPrompt: buildMagicPrompt(style), key });
  const out = opt("--out") || "styled.jpg";
  fs.copyFileSync(path.join(tmp, result.src), out);
  console.log(`✓ styled "${style}" in ${((Date.now() - t) / 1000).toFixed(1)} s with ${result.model} → ${out}`);
}
