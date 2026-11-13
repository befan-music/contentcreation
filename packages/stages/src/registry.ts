import type { Analysis, Clip, ParamDef, ParamValues, Section, StageBlock, StageDef } from "@stages/project";
import { DENSITY_OPTIONS, TRIGGER_OPTIONS } from "./hits";

const intensity: ParamDef = { key: "intensity", label: "Intensity", type: "range", min: 0, max: 1, step: 0.05, default: 0.7 };
const density: ParamDef = { key: "density", label: "Density", type: "select", options: DENSITY_OPTIONS, default: "every" };
const trigger = (def: string): ParamDef => ({ key: "trigger", label: "Triggers", type: "select", options: TRIGGER_OPTIONS, default: def });

export const BEAT_FLASH: StageDef = {
  id: "beat-flash",
  name: "Beat Flash",
  description: "Photos flash in on a white screen on every beat. On the first beat of each bar, a photo goes full screen.",
  source: "builtin",
  look: { kind: "component", component: "beat-flash" },
  behavior: "beat-flash",
  params: [
    trigger("beat"),
    density,
    intensity,
    { key: "barHit", label: "Full screen on bar start", type: "toggle", default: true },
    { key: "stack", label: "Stack photos", type: "toggle", default: true },
    { key: "background", label: "Background", type: "color", default: "#ffffff" },
  ],
};

export const PIANO: StageDef = {
  id: "piano",
  name: "Piano",
  description: "The song becomes notes. Each note presses its key, and a photo rises out of that key.",
  source: "builtin",
  look: { kind: "component", component: "piano" },
  behavior: "piano",
  params: [
    {
      key: "trigger",
      label: "Notes",
      type: "select",
      options: [
        { value: "notes", label: "All notes" },
        { value: "melody", label: "Melody" },
        { value: "bass", label: "Bass" },
      ],
      default: "notes",
    },
    intensity,
    { key: "rise", label: "Rise time (s)", type: "range", min: 1, max: 4, step: 0.1, default: 2.2 },
    { key: "accent", label: "Key color", type: "color", default: "#ffcf3a" },
    { key: "background", label: "Background", type: "color", default: "#0b0b12" },
  ],
};

export const MAGIC: StageDef = {
  id: "magic",
  name: "Magic",
  description: "AI restyles your photos in any style you type (e.g. “minecraft”). Each bar a photo appears, then turns into its styled version on the beat.",
  source: "builtin",
  look: { kind: "component", component: "magic" },
  behavior: "magic-reveal",
  params: [
    { key: "prompt", label: "Style", type: "text", default: "", placeholder: "minecraft, anime, claymation…" },
    { key: "variation", label: "Variation", type: "range", min: 0, max: 999, step: 1, default: 0, hidden: true },
    {
      key: "reveal",
      label: "Reveal",
      type: "select",
      options: [
        { value: "beat", label: "On the next beat" },
        { value: "alternate", label: "Flip every beat" },
        { value: "styled", label: "Styled only" },
      ],
      default: "beat",
    },
    {
      key: "pace",
      label: "Photo change",
      type: "select",
      options: [
        { value: "bar", label: "Every bar" },
        { value: "bar2", label: "Every 2 bars" },
        { value: "half", label: "Every 2 beats" },
      ],
      default: "bar",
    },
    intensity,
    { key: "motion", label: "Slow push-in", type: "toggle", default: true },
    { key: "glow", label: "Magic color", type: "color", default: "#c6ff3d" },
  ],
};

export const CUT_FLOW: StageDef = {
  id: "cut-flow",
  name: "Cut & Flow",
  description: "Each photo is cut into pieces, zoomed through or washed away by water on the beat, revealing the next one.",
  source: "builtin",
  look: { kind: "component", component: "cut-flow" },
  behavior: "cut-flow",
  params: [
    {
      key: "transition",
      label: "Transition",
      type: "select",
      options: [
        { value: "mix", label: "All, mixed" },
        { value: "pieces", label: "Cut pieces" },
        { value: "zoom-in", label: "Zoom in" },
        { value: "zoom-out", label: "Zoom out" },
        { value: "water", label: "Water flow" },
      ],
      default: "mix",
    },
    {
      key: "pace",
      label: "Photo change",
      type: "select",
      options: [
        { value: "bar", label: "Every bar" },
        { value: "bar2", label: "Every 2 bars" },
        { value: "half", label: "Every 2 beats" },
      ],
      default: "bar",
    },
    {
      key: "shape",
      label: "Piece shape",
      type: "select",
      options: [
        { value: "mix", label: "Mixed" },
        { value: "grid", label: "Squares" },
        { value: "shards", label: "Shards" },
        { value: "strips", label: "Strips" },
      ],
      default: "mix",
    },
    intensity,
    { key: "motion", label: "Slow push-in", type: "toggle", default: true },
    { key: "background", label: "Background", type: "color", default: "#000000" },
  ],
};

export const BUILTIN_STAGES: StageDef[] = [BEAT_FLASH, PIANO, MAGIC, CUT_FLOW];

/** Params every Custom Stage gets, whatever its behavior. */
export function customStageParams(behavior: string): ParamDef[] {
  const defaultTrigger = behavior === "like-piano" ? "notes" : "beat";
  const params: ParamDef[] = [intensity, { key: "glow", label: "Glow", type: "color", default: "#ffffff" }];
  if (behavior !== "bar-hit") {
    params.unshift(
      behavior === "like-piano"
        ? {
            key: "trigger",
            label: "Notes",
            type: "select",
            options: [
              { value: "notes", label: "All notes" },
              { value: "melody", label: "Melody" },
              { value: "bass", label: "Bass" },
            ],
            default: defaultTrigger,
          }
        : trigger(defaultTrigger),
      density,
    );
  }
  return params;
}

export function findStage(id: string, custom: StageDef[] = []): StageDef {
  return BUILTIN_STAGES.find((s) => s.id === id) ?? custom.find((s) => s.id === id) ?? BEAT_FLASH;
}

export function defaultParams(stage: StageDef): ParamValues {
  return Object.fromEntries(stage.params.map((p) => [p.key, p.default]));
}

export function withDefaults(stage: StageDef, params: ParamValues): ParamValues {
  return { ...defaultParams(stage), ...params };
}

/**
 * Energy pad: one 2D control. x = sparse → busy, y = calm → intense.
 * Moves density and intensity together so beginners never touch the knobs.
 */
export function energyToParams(x: number, y: number, stage: StageDef): ParamValues {
  const out: ParamValues = { intensity: Math.round(Math.min(1, Math.max(0, y)) * 20) / 20, energyX: x, energyY: y };
  if (stage.params.some((p) => p.key === "density")) out.density = x < 0.33 ? "bar" : x < 0.66 ? "half" : "every";
  if (stage.params.some((p) => p.key === "pace")) out.pace = x < 0.33 ? "bar2" : x < 0.75 ? "bar" : "half";
  if (stage.id === "piano") out.rise = Math.round((3.4 - 2 * x) * 10) / 10;
  return out;
}

// ---------------------------------------------------------------------------
// Auto-pick
// ---------------------------------------------------------------------------

function notesPerSecond(analysis: Analysis, start: number, end: number): number {
  const n = analysis.notes.filter((x) => x.stem === "melody" && x.start >= start && x.start < end).length;
  return n / Math.max(1, end - start);
}

function meanEnergy(analysis: Analysis, start: number, end: number): number {
  const { hop, values } = analysis.energy;
  const a = Math.floor(start / hop);
  const b = Math.max(a + 1, Math.floor(end / hop));
  const slice = values.slice(a, b);
  return slice.length ? slice.reduce((x, y) => x + y, 0) / slice.length : 0;
}

/**
 * Recommended Stage for a clip. Rules first (roadmap Phase 3); later learned from
 * what users pick. Melodic, calmer, slower songs suit Piano; driving songs Beat Flash.
 */
export function recommendStage(analysis: Analysis | null, clip: Clip): { stageId: string; reason: string } {
  if (!analysis) return { stageId: "beat-flash", reason: "Works with any song" };
  const nps = notesPerSecond(analysis, clip.start, clip.end);
  const energy = meanEnergy(analysis, clip.start, clip.end);
  if (analysis.status === "complete" && nps > 1.2 && (analysis.tempo < 105 || energy < 0.45)) {
    return { stageId: "piano", reason: "This part of the song is melodic" };
  }
  return { stageId: "beat-flash", reason: analysis.tempo >= 110 ? "Strong, fast beat" : "Clear beat" };
}

/**
 * Section-aware Auto (roadmap Phase 5): one Stage block per section in the clip.
 * Choruses and drops get Beat Flash at full energy, verses a calmer Beat Flash,
 * intros/bridges/outros Piano when there are notes.
 */
export function autoBlocks(analysis: Analysis, clip: Clip, sections: Section[]): StageBlock[] {
  const inClip = sections.filter((s) => s.end > clip.start && s.start < clip.end);
  const hasNotes = analysis.notes.length > 0;
  const blocks: StageBlock[] = inClip.map((s, i) => {
    const start = Math.max(s.start, clip.start);
    const end = Math.min(s.end, clip.end);
    let stageId = "beat-flash";
    let params: ParamValues = {};
    if (s.label === "chorus" || s.label === "drop") params = { density: "every", intensity: 0.9 };
    else if (s.label === "verse") params = { density: "half", intensity: 0.6 };
    else if (hasNotes) {
      stageId = "piano";
      params = { intensity: 0.6 };
    } else params = { density: "bar", intensity: 0.5 };
    return { id: `auto-${i}`, start, end, stageId, params };
  });
  // Merge neighbours that ended up identical.
  const merged: StageBlock[] = [];
  for (const b of blocks) {
    const last = merged[merged.length - 1];
    if (last && last.stageId === b.stageId && JSON.stringify(last.params) === JSON.stringify(b.params)) last.end = b.end;
    else merged.push({ ...b });
  }
  return merged.length ? merged : [{ id: "auto-0", start: clip.start, end: clip.end, stageId: "beat-flash", params: {} }];
}
