import type { Analysis, Clip, HitEdits, Project, Section, StageBlock } from "./types";

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

/** Two hits closer than this (seconds) are considered the same hit. */
export const HIT_MATCH_TOLERANCE = 0.06;

/**
 * The single rounding rule from song time to video frame, used by preview and
 * render alike: a hit at clip-relative time t lands on the nearest frame.
 */
export function songTimeToFrame(songTime: number, clip: Clip, fps = FPS): number {
  return Math.round((songTime - clip.start) * fps);
}

export function frameToSongTime(frame: number, clip: Clip, fps = FPS): number {
  return clip.start + frame / fps;
}

export function clipDurationInFrames(clip: Clip, fps = FPS): number {
  return Math.max(1, Math.round((clip.end - clip.start) * fps));
}

/** Default clip when the analysis has no suggestion: the first `length` seconds from the first bar. */
export function resolveClip(project: Project, analysis: Analysis | null): Clip {
  if (project.clip) return project.clip;
  const length = project.clipLength || 15;
  const suggested = analysis?.suggestedClips?.[String(length)];
  if (suggested) return suggested;
  const start = analysis?.downbeats?.[0] ?? 0;
  const duration = analysis?.duration ?? length;
  return { start, end: Math.min(duration, start + length) };
}

/**
 * A clip of `length` seconds starting on the bar nearest `start`. Ends on a bar
 * if one falls within the last second, so the video loops cleanly.
 */
export function clipFrom(start: number, length: number, analysis: Analysis): Clip {
  const duration = analysis.duration;
  if (duration <= length) return { start: 0, end: duration };
  let s = snapToBar(Math.max(0, Math.min(start, duration - length)), analysis);
  if (s + length > duration) s = Math.max(0, duration - length);
  let end = s + length;
  const near = analysis.downbeats.filter((d) => d >= end - 1 && d <= end);
  if (near.length) end = near[near.length - 1];
  return { start: round3(s), end: round3(Math.min(end, duration)) };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Snap a song time to the nearest bar start. */
export function snapToBar(time: number, analysis: Analysis): number {
  return nearest(analysis.downbeats, time) ?? time;
}

export function nearest(values: number[], target: number): number | undefined {
  if (!values.length) return undefined;
  let lo = 0;
  let hi = values.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  const a = values[lo];
  const b = lo > 0 ? values[lo - 1] : undefined;
  return b !== undefined && Math.abs(b - target) <= Math.abs(a - target) ? b : a;
}

function isMuted(time: number, edits: HitEdits): boolean {
  return edits.muted.some((m) => Math.abs(m - time) < HIT_MATCH_TOLERANCE);
}

/** Beats and bar starts after the user's Studio edits (muted hits removed, added hits merged). */
export function editedBeats(analysis: Analysis, edits: HitEdits): { beats: number[]; downbeats: number[] } {
  const beats = analysis.beats.filter((t) => !isMuted(t, edits));
  const downbeats = analysis.downbeats.filter((t) => !isMuted(t, edits));
  for (const a of edits.added) {
    if (a.type === "downbeat") downbeats.push(a.time);
    beats.push(a.time);
  }
  const uniq = (xs: number[]) =>
    xs.sort((x, y) => x - y).filter((t, i, arr) => i === 0 || t - arr[i - 1] > HIT_MATCH_TOLERANCE / 2);
  return { beats: uniq(beats), downbeats: uniq(downbeats) };
}

export function effectiveSections(project: Project, analysis: Analysis): Section[] {
  return project.sections ?? analysis.sections;
}

/**
 * The Stage blocks that cover the clip. If the project has no explicit blocks,
 * one block of the chosen Stage covers the whole clip.
 */
export function effectiveBlocks(project: Project, clip: Clip): StageBlock[] {
  if (!project.blocks.length) {
    return [{ id: "main", start: clip.start, end: clip.end, stageId: project.stageId, params: project.stageParams }];
  }
  return project.blocks
    .filter((b) => b.end > clip.start && b.start < clip.end)
    .map((b) => ({ ...b, start: Math.max(b.start, clip.start), end: Math.min(b.end, clip.end) }))
    .sort((a, b) => a.start - b.start);
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}
