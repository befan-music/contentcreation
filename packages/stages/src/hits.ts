import { editedBeats, type Analysis, type HitEdits, type Note } from "@stages/project";

export type HitKind = "beat" | "downbeat" | "kick" | "snare" | "hat" | "note";

export type Hit = {
  t: number;
  kind: HitKind;
  /** for notes */
  pitch?: number;
  dur?: number;
  velocity: number;
  /** true when this hit starts a bar */
  bar?: boolean;
};

export type Trigger = "beat" | "kick" | "snare" | "hat" | "melody" | "bass" | "notes";
export type Density = "every" | "half" | "bar";

export const TRIGGER_OPTIONS: { value: Trigger; label: string }[] = [
  { value: "beat", label: "Beat" },
  { value: "kick", label: "Kick" },
  { value: "snare", label: "Snare" },
  { value: "melody", label: "Melody" },
  { value: "bass", label: "Bass" },
];

export const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "every", label: "Every hit" },
  { value: "half", label: "Every other" },
  { value: "bar", label: "Every bar" },
];

function inRange(t: number, start: number, end: number) {
  return t >= start - 1e-6 && t < end - 1e-6;
}

function isBarStart(t: number, downbeats: number[]): boolean {
  return downbeats.some((d) => Math.abs(d - t) < 0.06);
}

/**
 * The hits that drive a Stage block, after the user's hit edits, trigger choice
 * and density are applied. Falls back to beats when a trigger has no data
 * (e.g. notes are still being analyzed).
 */
export function triggerHits(
  analysis: Analysis,
  edits: HitEdits,
  start: number,
  end: number,
  trigger: Trigger,
  density: Density,
): { hits: Hit[]; fellBack: boolean } {
  const { beats, downbeats } = editedBeats(analysis, edits);
  let hits: Hit[] = [];
  let fellBack = false;

  if (trigger === "beat") {
    hits = beats.filter((t) => inRange(t, start, end)).map((t) => ({ t, kind: "beat", velocity: 1, bar: isBarStart(t, downbeats) }));
  } else if (trigger === "kick" || trigger === "snare" || trigger === "hat") {
    hits = analysis.drums
      .filter((d) => d.type === trigger && inRange(d.time, start, end))
      .map((d) => ({ t: d.time, kind: trigger, velocity: d.strength, bar: isBarStart(d.time, downbeats) }));
  } else {
    hits = notesIn(analysis.notes, start, end, trigger).map((n) => ({
      t: n.start,
      kind: "note",
      pitch: n.pitch,
      dur: n.end - n.start,
      velocity: n.velocity,
      bar: isBarStart(n.start, downbeats),
    }));
  }

  if (hits.length === 0 && trigger !== "beat") {
    fellBack = true;
    hits = beats.filter((t) => inRange(t, start, end)).map((t) => ({ t, kind: "beat", velocity: 1, bar: isBarStart(t, downbeats) }));
  }

  return { hits: applyDensity(hits, downbeats, density), fellBack };
}

export function notesIn(notes: Note[], start: number, end: number, which: Trigger): Note[] {
  return notes.filter((n) => {
    if (!inRange(n.start, start, end)) return false;
    if (which === "melody") return n.stem === "melody";
    if (which === "bass") return n.stem === "bass";
    return true;
  });
}

function applyDensity(hits: Hit[], downbeats: number[], density: Density): Hit[] {
  if (density === "every" || hits.length === 0) return hits;
  if (density === "bar") {
    // First hit at or after each bar start.
    const out: Hit[] = [];
    for (const d of downbeats) {
      const h = hits.find((x) => x.t >= d - 0.06);
      if (h && !out.includes(h) && h.t - d < 0.5) out.push({ ...h, bar: true });
    }
    return out;
  }
  // "half": keep every other hit, counting from each bar start so bar hits survive.
  const out: Hit[] = [];
  let i = 0;
  for (const h of hits) {
    if (h.bar) i = 0;
    if (i % 2 === 0) out.push(h);
    i++;
  }
  return out;
}

/** Group notes that start together (a chord) so only one photo rises per chord. */
export function chordGroups(hits: Hit[], tolerance = 0.04): Hit[][] {
  const groups: Hit[][] = [];
  for (const h of [...hits].sort((a, b) => a.t - b.t)) {
    const last = groups[groups.length - 1];
    if (last && h.t - last[0].t <= tolerance) last.push(h);
    else groups.push([h]);
  }
  return groups;
}
