/**
 * Deterministic random number in [0, 1) from a seed (FNV-1a hash + one
 * mulberry32 step). Same seed, same number, in the browser, the server render
 * and server routes alike; no Remotion dependency, so pure modules stay pure.
 */
export function random(seed: string | number): number {
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = (h + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
