/**
 * Behaviors: pure functions from hits to window events.
 *
 * A behavior never draws anything. It decides WHEN which window opens. Looks
 * (src/looks) decide what an open window looks like. Built-in, Custom and SDK
 * Stages all share this interface (roadmap: "Look and behavior are separate").
 */
import type { Analysis, HitEdits, ParamValues, StageBlock } from "@stages/project";
import { random } from "../random";
import { chordGroups, triggerHits, type Density, type Hit, type Trigger } from "../hits";

export type WindowEventKind = "flash" | "full" | "note" | "open";

export type WindowEvent = {
  id: string;
  /** song time */
  t: number;
  /** seconds the window stays open */
  dur: number;
  window: number;
  kind: WindowEventKind;
  velocity: number;
  pitch?: number;
  /** whether a photo appears for this event (e.g. only the top note of a chord) */
  showPhoto: boolean;
  /** index into project.photos, filled in by assignPhotos */
  photo: number;
};

export type BehaviorContext = {
  analysis: Analysis;
  edits: HitEdits;
  block: StageBlock;
  params: ParamValues;
  /** number of windows on the Stage (photo looks); 0 for component looks */
  windowCount: number;
  seed: string;
};

export type BehaviorResult = { events: WindowEvent[]; fellBack: boolean };

export type Behavior = {
  id: string;
  name: string;
  description: string;
  defaultTrigger: Trigger;
  generate: (ctx: BehaviorContext) => BehaviorResult;
};

function str(params: ParamValues, key: string, fallback: string): string {
  const v = params[key];
  return typeof v === "string" ? v : fallback;
}
function bool(params: ParamValues, key: string, fallback: boolean): boolean {
  const v = params[key];
  return typeof v === "boolean" ? v : fallback;
}

function hitsFor(ctx: BehaviorContext, defaultTrigger: Trigger) {
  const trigger = str(ctx.params, "trigger", defaultTrigger) as Trigger;
  const density = str(ctx.params, "density", "every") as Density;
  return triggerHits(ctx.analysis, ctx.edits, ctx.block.start, ctx.block.end, trigger, density);
}

/** Duration until the next hit, capped. */
function gaps(hits: Hit[], end: number, max = 2): number[] {
  return hits.map((h, i) => Math.min(max, (hits[i + 1]?.t ?? end) - h.t));
}

const ev = (blockId: string, i: number, e: Omit<WindowEvent, "id" | "photo">): WindowEvent => ({ id: `${blockId}:${i}`, photo: 0, ...e });

export const beatFlash: Behavior = {
  id: "beat-flash",
  name: "Beat Flash",
  description: "A photo flashes in on every hit; on the first beat of each bar a photo goes full screen.",
  defaultTrigger: "beat",
  generate(ctx) {
    const { hits, fellBack } = hitsFor(ctx, "beat");
    const barHit = bool(ctx.params, "barHit", true);
    const d = gaps(hits, ctx.block.end);
    const events = hits.map((h, i) =>
      ev(ctx.block.id, i, { t: h.t, dur: d[i], window: 0, kind: barHit && h.bar ? "full" : "flash", velocity: h.velocity, showPhoto: true }),
    );
    return { events, fellBack };
  },
};

export const piano: Behavior = {
  id: "piano",
  name: "Piano",
  description: "Each note presses its key; a photo rises out of the key (one per chord).",
  defaultTrigger: "notes",
  generate(ctx) {
    const { hits, fellBack } = hitsFor(ctx, "notes");
    let i = 0;
    const events: WindowEvent[] = [];
    if (fellBack || hits.every((h) => h.pitch === undefined)) {
      // No notes yet: walk a pentatonic pattern on the beat so the Stage still plays.
      const scale = [60, 62, 64, 67, 69, 72, 74, 76];
      hits.forEach((h, k) => {
        const pitch = scale[Math.floor(random(`${ctx.seed}:p:${k}`) * scale.length)];
        events.push(ev(ctx.block.id, i++, { t: h.t, dur: 0.35, window: 0, kind: "note", velocity: h.velocity, pitch, showPhoto: true }));
      });
      return { events, fellBack: true };
    }
    // At most one rising photo per eighth note, so dense songs stay readable.
    const beat = ctx.analysis.tempo > 0 ? 60 / ctx.analysis.tempo : 0.5;
    const minPhotoGap = str(ctx.params, "density", "every") === "half" ? beat : str(ctx.params, "density", "every") === "bar" ? beat * 4 : beat / 2;
    let lastPhoto = -Infinity;
    for (const group of chordGroups(hits)) {
      const top = group.reduce((a, b) => ((b.pitch ?? 0) > (a.pitch ?? 0) ? b : a));
      const photoHere = top.t - lastPhoto >= minPhotoGap - 1e-3;
      if (photoHere) lastPhoto = top.t;
      for (const h of group) {
        events.push(
          ev(ctx.block.id, i++, {
            t: h.t,
            dur: Math.max(0.12, Math.min(3, h.dur ?? 0.3)),
            window: 0,
            kind: "note",
            velocity: h.velocity,
            pitch: h.pitch,
            showPhoto: h === top && photoHere,
          }),
        );
      }
    }
    return { events, fellBack };
  },
};

/** Windows ordered like pitches: each note opens the window for its pitch (Custom Stages). */
export const likePiano: Behavior = {
  id: "like-piano",
  name: "Like Piano",
  description: "Windows are ordered like pitches; each note opens its window.",
  defaultTrigger: "notes",
  generate(ctx) {
    const base = piano.generate(ctx);
    const n = Math.max(1, ctx.windowCount);
    const pitches = base.events.map((e) => e.pitch ?? 60);
    const lo = Math.min(...pitches);
    const hi = Math.max(...pitches);
    const span = Math.max(1, hi - lo);
    return {
      fellBack: base.fellBack,
      events: base.events.map((e) => ({
        ...e,
        kind: "open",
        window: Math.min(n - 1, Math.floor((((e.pitch ?? lo) - lo) / span) * n)),
        dur: Math.max(0.25, e.dur),
      })),
    };
  },
};

export const beatOrder: Behavior = {
  id: "beat-order",
  name: "On the beat",
  description: "Windows open in order, one per hit.",
  defaultTrigger: "beat",
  generate(ctx) {
    const { hits, fellBack } = hitsFor(ctx, "beat");
    const n = Math.max(1, ctx.windowCount);
    const d = gaps(hits, ctx.block.end);
    return {
      fellBack,
      events: hits.map((h, i) => ev(ctx.block.id, i, { t: h.t, dur: d[i], window: i % n, kind: "open", velocity: h.velocity, showPhoto: true })),
    };
  },
};

export const randomOrder: Behavior = {
  id: "random",
  name: "Random",
  description: "A random window opens on each hit.",
  defaultTrigger: "beat",
  generate(ctx) {
    const { hits, fellBack } = hitsFor(ctx, "beat");
    const n = Math.max(1, ctx.windowCount);
    const d = gaps(hits, ctx.block.end);
    let prev = -1;
    return {
      fellBack,
      events: hits.map((h, i) => {
        let w = Math.floor(random(`${ctx.seed}:w:${i}`) * n);
        if (n > 1 && w === prev) w = (w + 1) % n;
        prev = w;
        return ev(ctx.block.id, i, { t: h.t, dur: d[i], window: w, kind: "open", velocity: h.velocity, showPhoto: true });
      }),
    };
  },
};

export const barHit: Behavior = {
  id: "bar-hit",
  name: "Bar hit",
  description: "A full-screen photo on each bar start.",
  defaultTrigger: "beat",
  generate(ctx) {
    const { hits, fellBack } = triggerHits(ctx.analysis, ctx.edits, ctx.block.start, ctx.block.end, "beat", "bar");
    const d = gaps(hits, ctx.block.end, 8);
    return {
      fellBack,
      events: hits.map((h, i) => ev(ctx.block.id, i, { t: h.t, dur: d[i], window: 0, kind: "full", velocity: 1, showPhoto: true })),
    };
  },
};

export const BEHAVIORS: Record<string, Behavior> = Object.fromEntries(
  [beatFlash, piano, likePiano, beatOrder, randomOrder, barHit].map((b) => [b.id, b]),
);

/** Behaviors a user can pick for a Custom Stage. */
export const CUSTOM_BEHAVIORS = [likePiano, beatOrder, randomOrder, barHit];

/**
 * Give every photo-showing event a photo: cycle through the project's photos in
 * order, then force pinned photos onto the event closest to their pinned hit.
 */
export function assignPhotos(events: WindowEvent[], photos: { pinnedTo?: number }[], startIndex = 0): WindowEvent[] {
  const n = photos.length;
  if (n === 0) return events;
  let k = startIndex;
  const out = events.map((e) => (e.showPhoto ? { ...e, photo: k++ % n } : e));
  photos.forEach((p, idx) => {
    if (p.pinnedTo === undefined) return;
    let best = -1;
    let bestD = 0.2;
    out.forEach((e, i) => {
      const d = Math.abs(e.t - p.pinnedTo!);
      if (e.showPhoto && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best >= 0) out[best] = { ...out[best], photo: idx };
  });
  return out;
}
