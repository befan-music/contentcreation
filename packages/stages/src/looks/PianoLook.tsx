import React, { useMemo } from "react";
import { random } from "../random";
import type { WindowEvent } from "../behaviors";
import { PhotoFill } from "./PhotoFill";
import { decay, easeOutCubic, lastEventIndex, num, str, type LookProps } from "./types";

const BLACK = new Set([1, 3, 6, 8, 10]);

type Key = { pitch: number; black: boolean; x: number; w: number };

/** Fit the keyboard to the notes: 2-4 octaves starting on a C, covering the middle 90% of pitches. */
export function keyRange(events: WindowEvent[]): { lo: number; hi: number } {
  const pitches = events.map((e) => e.pitch).filter((p): p is number => p !== undefined).sort((a, b) => a - b);
  if (!pitches.length) return { lo: 48, hi: 83 };
  const q = (f: number) => pitches[Math.min(pitches.length - 1, Math.floor(f * (pitches.length - 1)))];
  let lo = Math.floor(q(0.05) / 12) * 12;
  let hi = Math.ceil((q(0.95) + 1) / 12) * 12 - 1;
  if (hi - lo + 1 < 24) hi = lo + 23;
  if (hi - lo + 1 > 48) {
    const mid = Math.round(q(0.5) / 12) * 12;
    lo = mid - 24;
    hi = mid + 23;
  }
  return { lo, hi };
}

export function foldPitch(p: number, lo: number, hi: number): number {
  let x = p;
  while (x < lo) x += 12;
  while (x > hi) x -= 12;
  return x;
}

function layout(lo: number, hi: number, width: number): Key[] {
  const whites = [];
  for (let p = lo; p <= hi; p++) if (!BLACK.has(p % 12)) whites.push(p);
  const ww = width / whites.length;
  const keys: Key[] = [];
  let wi = 0;
  for (let p = lo; p <= hi; p++) {
    if (BLACK.has(p % 12)) {
      keys.push({ pitch: p, black: true, x: wi * ww - ww * 0.3, w: ww * 0.6 });
    } else {
      keys.push({ pitch: p, black: false, x: wi * ww, w: ww });
      wi++;
    }
  }
  return keys;
}

export const PianoLook: React.FC<LookProps> = ({ t, events, photos, params, assetBase, seed, width, height }) => {
  const background = str(params, "background", "#0b0b12");
  const accent = str(params, "accent", "#ffcf3a");
  const intensity = num(params, "intensity", 0.7);
  const rise = num(params, "rise", 2.2);

  const { lo, hi } = useMemo(() => keyRange(events), [events]);
  const keys = useMemo(() => layout(lo, hi, width), [lo, hi, width]);
  const keyByPitch = useMemo(() => new Map(keys.map((k) => [k.pitch, k])), [keys]);

  const kbTop = height * 0.7;
  const kbH = height * 0.16;
  const blackH = kbH * 0.62;

  // Recent events: pressed keys (within their duration) and rising photos (within `rise`).
  const idx = lastEventIndex(events, t);
  const pressed = new Map<number, number>(); // pitch -> press strength
  const rising: { e: WindowEvent; key: Key }[] = [];
  for (let i = idx; i >= 0; i--) {
    const e = events[i];
    const age = t - e.t;
    if (age > Math.max(rise, 3)) break;
    const pitch = foldPitch(e.pitch ?? 60, lo, hi);
    const key = keyByPitch.get(pitch);
    if (!key) continue;
    if (age < e.dur) pressed.set(pitch, Math.max(pressed.get(pitch) ?? 0, 0.55 + 0.45 * decay(age, 0.15)));
    if (e.showPhoto && age < rise) rising.push({ e, key });
  }

  const cardW = Math.min(400, Math.max(250, (width / 8) * 2.2));
  const cardH = cardW * 1.25;

  return (
    <div style={{ position: "absolute", inset: 0, background, overflow: "hidden" }}>
      {/* light beams over pressed keys */}
      {[...pressed.entries()].map(([pitch, s]) => {
        const k = keyByPitch.get(pitch)!;
        return (
          <div
            key={`beam-${pitch}`}
            style={{
              position: "absolute",
              left: k.x,
              width: k.w,
              top: kbTop - height * 0.45,
              height: height * 0.45,
              background: `linear-gradient(to top, ${accent}, transparent)`,
              opacity: 0.4 * intensity * s,
            }}
          />
        );
      })}

      {/* photos rising out of their keys; clipped at the keyboard edge */}
      <div style={{ position: "absolute", left: 0, top: 0, width, height: kbTop, overflow: "hidden" }}>
        {rising
          .slice()
          .reverse()
          .map(({ e, key }) => {
            const age = t - e.t;
            const p = easeOutCubic(age / rise);
            const drift = (random(`${seed}:${e.id}:drift`) - 0.5) * 120;
            const cx = Math.min(width - cardW / 2 - 24, Math.max(cardW / 2 + 24, key.x + key.w / 2 + drift * p));
            const top = kbTop - p * (kbTop * 0.92 + cardH * 0.1);
            const fade = age / rise > 0.7 ? 1 - (age / rise - 0.7) / 0.3 : 1;
            const scale = 0.85 + 0.25 * (e.velocity ?? 0.7) * intensity;
            return (
              <div
                key={e.id}
                style={{
                  position: "absolute",
                  left: cx - cardW / 2,
                  top,
                  width: cardW,
                  height: cardH,
                  opacity: fade,
                  transform: `scale(${scale}) rotate(${(random(`${seed}:${e.id}:rot`) - 0.5) * 8}deg)`,
                  borderRadius: 22,
                  overflow: "hidden",
                  boxShadow: `0 0 ${Math.round(18 * intensity)}px ${accent}88`,
                  border: "5px solid rgba(255,255,255,0.92)",
                }}
              >
                <PhotoFill photos={photos} index={e.photo} assetBase={assetBase} small />
              </div>
            );
          })}
      </div>

      {/* keyboard */}
      <div style={{ position: "absolute", left: 0, top: kbTop, width, height: kbH, background: "#111" }}>
        {keys
          .filter((k) => !k.black)
          .map((k) => {
            const s = pressed.get(k.pitch);
            return (
              <div
                key={k.pitch}
                style={{
                  position: "absolute",
                  left: k.x + 1,
                  top: s ? 6 : 0,
                  width: k.w - 2,
                  height: kbH - (s ? 6 : 0),
                  background: s ? accent : "linear-gradient(#fdfdfd, #e6e6e6)",
                  borderRadius: "0 0 10px 10px",
                  boxShadow: s ? `0 0 ${40 * s}px ${accent}` : "inset 0 -8px 0 rgba(0,0,0,0.08)",
                }}
              />
            );
          })}
        {keys
          .filter((k) => k.black)
          .map((k) => {
            const s = pressed.get(k.pitch);
            return (
              <div
                key={k.pitch}
                style={{
                  position: "absolute",
                  left: k.x,
                  top: s ? 4 : 0,
                  width: k.w,
                  height: blackH,
                  background: s ? accent : "linear-gradient(#2a2a2a, #050505)",
                  borderRadius: "0 0 7px 7px",
                  boxShadow: s ? `0 0 ${30 * s}px ${accent}` : "0 4px 6px rgba(0,0,0,0.5)",
                  filter: s ? "brightness(0.85)" : undefined,
                }}
              />
            );
          })}
      </div>
    </div>
  );
};
