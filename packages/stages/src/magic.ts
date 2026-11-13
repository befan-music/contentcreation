/**
 * Magic Stage helpers (pure). The AI generation itself is not deterministic:
 * every run of a model gives a different picture. To keep "what you preview is
 * what you export", each generated picture is stored on the photo under a style
 * key = (normalized prompt, variation). "Regenerate" bumps the variation, which
 * deliberately asks the model for a fresh take.
 */
import { effectiveBlocks, resolveClip, type Analysis, type Photo, type Project } from "@stages/project";

export const MAGIC_STAGE_ID = "magic";

export const MAGIC_PRESETS: { label: string; prompt: string }[] = [
  { label: "Minecraft", prompt: "minecraft" },
  { label: "Anime", prompt: "90s anime cel shading" },
  { label: "Claymation", prompt: "claymation stop-motion" },
  { label: "Pixel art", prompt: "16-bit pixel art" },
  { label: "Lego", prompt: "lego bricks" },
  { label: "Watercolor", prompt: "loose watercolor painting" },
  { label: "Cyberpunk", prompt: "neon cyberpunk" },
  { label: "Van Gogh", prompt: "van gogh oil painting" },
];

export function normalizePrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 200);
}

/** Stable key for (prompt, variation). Same in browser, server and renderer. */
export function styleKey(prompt: string, variation = 0): string {
  const s = `${normalizePrompt(prompt)}|${Math.max(0, Math.floor(variation))}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822507);
  }
  return ((h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0")).slice(0, 12);
}

/** The instruction sent to the image model for one photo. */
export function buildMagicPrompt(style: string): string {
  const s = style.trim().replace(/\s+/g, " ").slice(0, 200);
  return (
    `Transform this photo into ${s} style. ` +
    `Keep the same scene, subjects, poses, composition and framing, so the original is clearly recognizable. ` +
    `Apply the ${s} look to everything in the image. No text, no watermark, no borders.`
  );
}

export type MagicRequest = { prompt: string; variation: number; key: string };

/** Every (prompt, variation) the project's Magic blocks need, deduplicated. */
export function magicRequests(project: Project, analysis: Analysis | null): MagicRequest[] {
  const clip = resolveClip(project, analysis);
  const out = new Map<string, MagicRequest>();
  for (const b of effectiveBlocks(project, clip)) {
    if (b.stageId !== MAGIC_STAGE_ID) continue;
    const prompt = typeof b.params.prompt === "string" ? b.params.prompt : "";
    const variation = typeof b.params.variation === "number" ? b.params.variation : 0;
    if (!normalizePrompt(prompt)) continue;
    const key = styleKey(prompt, variation);
    out.set(key, { prompt, variation, key });
  }
  return [...out.values()];
}

export function styledVersion(photo: Photo, key: string | null) {
  return key ? photo.styles?.[key] : undefined;
}

/** Photos still missing a styled version for any Magic block (render is blocked until this is empty). */
export function missingMagic(project: Project, analysis: Analysis | null): { request: MagicRequest; photoIds: string[] }[] {
  return magicRequests(project, analysis)
    .map((request) => ({ request, photoIds: project.photos.filter((p) => !p.styles?.[request.key]).map((p) => p.id) }))
    .filter((m) => m.photoIds.length > 0);
}

/** True when a Magic block has no style prompt yet. */
export function magicWithoutPrompt(project: Project, analysis: Analysis | null): boolean {
  const clip = resolveClip(project, analysis);
  return effectiveBlocks(project, clip).some((b) => b.stageId === MAGIC_STAGE_ID && !normalizePrompt(typeof b.params.prompt === "string" ? b.params.prompt : ""));
}
