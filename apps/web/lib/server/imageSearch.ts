import "server-only";
import net from "node:net";
import type { PhotoCredit } from "@stages/project";

// Node tries IPv6 and IPv4 in parallel but drops each attempt after 250 ms, which
// fails outright on slow links (phone hotspots). Give each attempt 2 s.
net.setDefaultAutoSelectFamilyAttemptTimeout(2000);

/**
 * Online photo search for the Photos step.
 *
 * Sources: Openverse (api.openverse.org), an open index of ~800M openly
 * licensed images from Flickr, Wikimedia Commons, museums and more. No key needed
 * (anonymous limit: 20 searches/min, 200/day per server IP).
 * Also: Wikimedia Commons (no key, no daily cap). Both are asked at once and the
 * results mixed, so the search still works when Openverse is slow or down.
 *
 * Only licenses that allow commercial use AND changes (a video is a changed work)
 * are returned: CC0, Public Domain Mark, CC BY, CC BY-SA. Most still require a
 * credit line, which we keep on the Photo and show on the Export step.
 *
 * The browser only ever sends back result ids; the server remembers which URL
 * each id points to, so the import route never downloads an arbitrary URL.
 */

export type ImageResult = {
  id: string;
  /** small preview for the results grid */
  thumb: string;
  width: number;
  height: number;
  credit: PhotoCredit;
};

type Stored = ImageResult & { full: string };

const UA = "Stages/0.1 (music video maker; local prototype)";
const TTL_MS = 60 * 60 * 1000;

const g = globalThis as unknown as { __stagesImageResults?: Map<string, { r: Stored; at: number }> };
const remembered = (g.__stagesImageResults ??= new Map());

function remember(results: Stored[]): ImageResult[] {
  const now = Date.now();
  for (const [k, v] of remembered) if (now - v.at > TTL_MS) remembered.delete(k);
  for (const r of results) remembered.set(r.id, { r, at: now });
  return results.map(({ full: _full, ...pub }) => pub);
}

export function lookupResult(id: string): Stored | null {
  const hit = remembered.get(id);
  return hit && Date.now() - hit.at <= TTL_MS ? hit.r : null;
}

async function getJson(url: string, timeoutMs = 15_000): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res.json();
}

// Openverse --------------------------------------------------------------------

type OvImage = {
  id: string;
  title?: string;
  creator?: string;
  url: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  license: string;
  license_version?: string;
  license_url?: string;
  foreign_landing_url?: string;
  source?: string;
};

function licenseName(license: string, version?: string) {
  const l = license.toLowerCase();
  if (l === "cc0") return "CC0";
  if (l === "pdm") return "Public Domain";
  return `CC ${l.toUpperCase()}${version ? ` ${version}` : ""}`;
}

async function openverse(q: string, count: number, page: number): Promise<Stored[]> {
  const params = new URLSearchParams({
    q,
    page_size: String(Math.min(20, count)), // anonymous limit
    page: String(page),
    license_type: "commercial,modification",
    category: "photograph",
    mature: "false",
  });
  const data = (await getJson(`https://api.openverse.org/v1/images/?${params}`, 9_000)) as { results: OvImage[] };
  return data.results
    .filter((r) => r.url && (r.width ?? 1000) >= 500 && (r.height ?? 1000) >= 500)
    .map((r) => ({
      id: `ov_${r.id}`,
      full: r.url,
      thumb: r.thumbnail || r.url,
      width: r.width ?? 0,
      height: r.height ?? 0,
      credit: {
        title: r.title || "Untitled",
        creator: r.creator || "Unknown",
        license: licenseName(r.license, r.license_version),
        licenseUrl: r.license_url,
        sourceUrl: r.foreign_landing_url || r.url,
        provider: r.source ? `Openverse (${r.source})` : "Openverse",
      },
    }));
}

// Wikimedia Commons --------------------------------------------------------------

type CommonsPage = {
  pageid: number;
  title: string;
  imageinfo?: {
    url: string;
    thumburl?: string;
    width: number;
    height: number;
    descriptionurl: string;
    mime: string;
    extmetadata?: Record<string, { value: string }>;
  }[];
};

const stripHtml = (s = "") => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
const COMMONS_OK = /^(cc0|cc by(-sa)? [\d.]+|public domain|pd)/i;

async function commons(q: string, count: number, page: number): Promise<Stored[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `${q} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: String(Math.min(50, count * 2)),
    gsroffset: String((page - 1) * count * 2),
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "1600",
  });
  const data = (await getJson(`https://commons.wikimedia.org/w/api.php?${params}`)) as { query?: { pages: Record<string, CommonsPage & { index: number }> } };
  const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => a.index - b.index);
  const out: Stored[] = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime) || info.width < 500 || info.height < 500) continue;
    const meta = info.extmetadata ?? {};
    const license = stripHtml(meta.LicenseShortName?.value);
    if (!COMMONS_OK.test(license)) continue;
    out.push({
      id: `wc_${p.pageid}`,
      full: info.thumburl || info.url,
      thumb: info.thumburl || info.url,
      width: info.width,
      height: info.height,
      credit: {
        title: p.title.replace(/^File:/, "").replace(/\.\w+$/, ""),
        creator: stripHtml(meta.Artist?.value) || "Unknown",
        license,
        licenseUrl: meta.LicenseUrl?.value,
        sourceUrl: info.descriptionurl,
        provider: "Wikimedia Commons",
      },
    });
    if (out.length >= count) break;
  }
  return out;
}

// ---------------------------------------------------------------------------------

export async function searchImages(q: string, count: number, page = 1): Promise<{ results: ImageResult[]; source: string }> {
  // Ask both at once; Openverse is broader but sometimes slow or down, Commons is steady.
  const [ov, wc] = await Promise.allSettled([openverse(q, count * 2, page), commons(q, count * 2, page)]);
  const a = ov.status === "fulfilled" ? ov.value : [];
  const b = wc.status === "fulfilled" ? wc.value : [];
  if (!a.length && !b.length && ov.status === "rejected" && wc.status === "rejected") throw ov.reason;
  // Alternate between the two so both kinds of photo show up near the top.
  const mixed: Stored[] = [];
  for (let i = 0; i < a.length || i < b.length; i++) {
    if (i < a.length) mixed.push(a[i]);
    if (i < b.length) mixed.push(b[i]);
  }
  // One photographer often uploads a whole batch; keep at most 2 of theirs near the top.
  const perCreator = new Map<string, number>();
  const top: Stored[] = [];
  const rest: Stored[] = [];
  for (const r of mixed) {
    const k = r.credit.creator.toLowerCase();
    const seen = perCreator.get(k) ?? 0;
    perCreator.set(k, seen + 1);
    (seen < 2 ? top : rest).push(r);
  }
  mixed.splice(0, mixed.length, ...top, ...rest);
  const source = [a.length && "Openverse", b.length && "Wikimedia Commons"].filter(Boolean).join(" and ") || "Openverse and Wikimedia Commons";
  return { results: remember(mixed.slice(0, count)), source };
}

/** Download a remembered result (max 25 MB). */
export async function downloadResult(r: Stored): Promise<Buffer> {
  const res = await fetch(r.full, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) throw new Error("Not an image");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 25 * 1024 * 1024) throw new Error("Too large");
  return buf;
}

