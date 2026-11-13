import type { Analysis, ParamValues, Photo, StageBlock, StageDef } from "@stages/project";
import type { WindowEvent } from "../behaviors";

export type LookProps = {
  /** current song time in seconds */
  t: number;
  block: StageBlock;
  stage: StageDef;
  params: ParamValues;
  /** sorted by t */
  events: WindowEvent[];
  photos: Photo[];
  analysis: Analysis;
  assetBase: string;
  seed: string;
  width: number;
  height: number;
};

/** Index of the last event with e.t <= t, or -1. */
export function lastEventIndex(events: WindowEvent[], t: number): number {
  let lo = 0;
  let hi = events.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].t <= t + 1e-6) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function num(params: ParamValues, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
export function str(params: ParamValues, key: string, fallback: string): string {
  const v = params[key];
  return typeof v === "string" && v ? v : fallback;
}
export function bool(params: ParamValues, key: string, fallback: boolean): boolean {
  const v = params[key];
  return typeof v === "boolean" ? v : fallback;
}

/** Exponential decay from 1 at the hit, used for flashes. */
export function decay(since: number, halfLife: number): number {
  if (since < 0) return 0;
  return Math.pow(0.5, since / halfLife);
}

export function easeOutCubic(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return 1 - Math.pow(1 - c, 3);
}
