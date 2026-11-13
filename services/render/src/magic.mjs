/**
 * Magic Stage: AI restyling of photos.
 *
 * Provider "higgsfield" (default when credentials are set): Higgsfield API,
 * https://docs.higgsfield.ai. Flow per photo: POST /files/generate-upload-url →
 * PUT the JPEG → POST /<model> with the public URL + prompt → poll
 * /requests/{id}/status → download images[0].url.
 *
 * Provider "mock" (only with STAGES_MAGIC_PROVIDER=mock): a local pixel-art-ish
 * filter for development and tests. It is NOT AI and says so in its model name.
 *
 * Credentials stay on the server: HIGGSFIELD_KEY="<key id>:<secret>"
 * (or HIGGSFIELD_KEY_ID + HIGGSFIELD_KEY_SECRET).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const BASE = (process.env.HIGGSFIELD_BASE_URL || "https://api.higgsfield.ai").replace(/\/$/, "");
const DEFAULT_MODEL = "xai/grok-imagine-image-2.0";

function credentials() {
  const combined = process.env.HIGGSFIELD_KEY || process.env.HF_KEY;
  if (combined && combined.includes(":")) return combined.trim();
  const id = process.env.HIGGSFIELD_KEY_ID || process.env.HF_API_KEY;
  const secret = process.env.HIGGSFIELD_KEY_SECRET || process.env.HF_API_SECRET;
  return id && secret ? `${id.trim()}:${secret.trim()}` : null;
}

export function magicConfig() {
  const forced = process.env.STAGES_MAGIC_PROVIDER;
  const provider = forced === "mock" ? "mock" : credentials() ? "higgsfield" : "none";
  const model = provider === "mock" ? "mock" : (process.env.HIGGSFIELD_IMAGE_MODEL || DEFAULT_MODEL).replace(/^\//, "");
  return { provider, model, configured: provider !== "none" };
}

// ---------------------------------------------------------------------------
// Higgsfield client
// ---------------------------------------------------------------------------

class MagicError extends Error {
  constructor(message, { retryable = false, code } = {}) {
    super(message);
    this.retryable = retryable;
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hf(pathOrUrl, { method = "GET", body, headers = {}, attempt = 0 } = {}) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE}${pathOrUrl}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Key ${credentials()}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 429 && attempt < 5) {
    const wait = Math.min(60, Number(res.headers.get("retry-after")) || 5 * (attempt + 1));
    await sleep(wait * 1000);
    return hf(pathOrUrl, { method, body, headers, attempt: attempt + 1 });
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (res.status === 401 || res.status === 403) throw new MagicError("Higgsfield rejected the API key. Check HIGGSFIELD_KEY in apps/web/.env.local.", { code: "auth" });
  if (res.status === 402) throw new MagicError("Higgsfield says the account is out of credits.", { code: "credits" });
  if (!res.ok) {
    const msg = json?.detail?.[0]?.msg || json?.detail || json?.message || json?.error || text.slice(0, 200) || res.statusText;
    throw new MagicError(`Higgsfield ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`, { retryable: res.status >= 500 });
  }
  return json;
}

async function uploadImage(buffer, contentType = "image/jpeg") {
  const r = await hf("/files/generate-upload-url", { method: "POST", body: { content_type: contentType } });
  if (!r?.upload_url || !r?.public_url) throw new MagicError("Higgsfield didn't return an upload URL.");
  const put = await fetch(r.upload_url, {
    method: "PUT",
    headers: r.upload_headers && Object.keys(r.upload_headers).length ? r.upload_headers : { "Content-Type": contentType },
    body: buffer,
    signal: AbortSignal.timeout(120_000),
  });
  if (!put.ok) throw new MagicError(`Uploading the photo failed (${put.status}).`, { retryable: true });
  return r.public_url;
}

const ASPECTS = [
  ["1:1", 1],
  ["2:3", 2 / 3],
  ["3:2", 3 / 2],
  ["3:4", 3 / 4],
  ["4:3", 4 / 3],
  ["9:16", 9 / 16],
  ["16:9", 16 / 9],
  ["1:2", 1 / 2],
  ["2:1", 2],
];

function closestAspect(width, height) {
  const r = width / height;
  return ASPECTS.reduce((best, a) => (Math.abs(Math.log(a[1] / r)) < Math.abs(Math.log(best[1] / r)) ? a : best))[0];
}

/** Request body per model family. Grok edits from image_urls; Ideogram remixes one image_url. */
function requestBody(model, { prompt, imageUrl, width, height }) {
  const aspect_ratio = closestAspect(width, height);
  if (model.startsWith("ideogram/")) {
    return { prompt: prompt.slice(0, 2048), image_url: imageUrl, image_weight: Number(process.env.HIGGSFIELD_IMAGE_WEIGHT || 55), aspect_ratio, rendering_speed: "DEFAULT" };
  }
  if (model.startsWith("xai/")) {
    return { prompt, image_urls: [imageUrl], aspect_ratio, resolution: process.env.HIGGSFIELD_RESOLUTION || "1k", quality: "medium" };
  }
  return { prompt, image_urls: [imageUrl], aspect_ratio };
}

async function waitForResult(submitted, { timeoutMs = 5 * 60_000 } = {}) {
  const statusUrl = submitted.status_url || `/requests/${submitted.request_id}/status`;
  const started = Date.now();
  let delay = 1500;
  while (Date.now() - started < timeoutMs) {
    await sleep(delay);
    delay = Math.min(5000, delay * 1.3);
    const s = await hf(statusUrl);
    switch (s?.status) {
      case "completed": {
        const url = s.images?.[0]?.url || s.image?.url;
        if (!url) throw new MagicError("Higgsfield finished but returned no image.");
        return url;
      }
      case "nsfw":
        throw new MagicError("The model refused this photo (flagged as unsafe).", { code: "nsfw" });
      case "failed":
        throw new MagicError(`Generation failed${s.error ? `: ${typeof s.error === "string" ? s.error : JSON.stringify(s.error)}` : "."}`, { retryable: true });
      case "canceled":
        throw new MagicError("Generation was canceled.");
      default:
        break; // queued / in_progress
    }
  }
  throw new MagicError("Higgsfield took longer than 5 minutes for one photo.", { retryable: true });
}

async function higgsfieldStylize({ input, width, height, prompt, idempotencyKey, model }) {
  const imageUrl = await uploadImage(input);
  const submitted = await hf(`/${model}`, {
    method: "POST",
    body: requestBody(model, { prompt, imageUrl, width, height }),
    headers: { "Idempotency-Key": idempotencyKey },
  });
  if (!submitted?.request_id) throw new MagicError("Higgsfield didn't accept the request.");
  const url = await waitForResult(submitted);
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new MagicError(`Downloading the result failed (${res.status}).`, { retryable: true });
  return Buffer.from(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Mock provider (development only)
// ---------------------------------------------------------------------------

async function mockStylize({ input, width, prompt }) {
  let h = 0;
  for (const c of prompt) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const tint = { r: 80 + (h % 150), g: 80 + ((h >> 8) % 150), b: 80 + ((h >> 16) % 150) };
  const blocks = Math.max(24, Math.round(width / 28));
  const small = await sharp(input).resize(blocks, null, { kernel: "nearest" }).modulate({ saturation: 1.6 }).toBuffer();
  return sharp(small).resize(width, null, { kernel: "nearest" }).tint(tint).jpeg({ quality: 88 }).toBuffer();
}

// ---------------------------------------------------------------------------
// Public: restyle one photo and store it next to the original
// ---------------------------------------------------------------------------

/**
 * @param {{ photo: {id: string, src: string}, dataDir: string, prompt: string, fullPrompt: string, key: string }} o
 * @returns {Promise<{src: string, srcSmall: string, prompt: string, model: string, createdAt: string}>}
 */
export async function stylizePhoto({ photo, dataDir, prompt, fullPrompt, key }) {
  const { provider, model } = magicConfig();
  if (provider === "none") throw new MagicError("Magic needs a Higgsfield API key. Add HIGGSFIELD_KEY to apps/web/.env.local and restart.", { code: "config" });
  const srcPath = path.join(dataDir, photo.src);
  // Send a 1536 px JPEG: plenty for a 1080×1920 video, fast to upload.
  const { data: input, info } = await sharp(srcPath).resize(1536, 1536, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });

  let output;
  for (let attempt = 0; ; attempt++) {
    try {
      output =
        provider === "mock"
          ? await mockStylize({ input, width: info.width, prompt })
          : await higgsfieldStylize({ input, width: info.width, height: info.height, prompt: fullPrompt, idempotencyKey: `stages-${photo.id}-${key}`, model });
      break;
    } catch (e) {
      if (!(e instanceof MagicError) || !e.retryable || attempt >= 1) throw e;
      await sleep(3000);
    }
  }

  const dir = path.join(dataDir, "photos");
  fs.mkdirSync(dir, { recursive: true });
  const base = `${photo.id}-m-${key}`;
  await sharp(output).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(dir, `${base}.jpg`));
  await sharp(output).resize(720, 720, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(dir, `${base}-sm.jpg`));
  return {
    src: `photos/${base}.jpg`,
    srcSmall: `photos/${base}-sm.jpg`,
    prompt,
    model: provider === "mock" ? "mock (not AI)" : `higgsfield:${model}`,
    createdAt: new Date().toISOString(),
  };
}

/** Cheap credential check for scripts/higgsfield-check.mjs: asks for an upload URL. */
export async function checkHiggsfield() {
  const { provider, model } = magicConfig();
  if (provider !== "higgsfield") return { ok: false, provider, message: "No Higgsfield credentials found (HIGGSFIELD_KEY)." };
  const r = await hf("/files/generate-upload-url", { method: "POST", body: { content_type: "image/jpeg" } });
  return { ok: !!r?.upload_url, provider, model, message: r?.upload_url ? "Credentials work." : "Unexpected response." };
}
