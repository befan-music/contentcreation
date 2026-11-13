import React from "react";
import { random } from "../random";
import { PhotoFill } from "./PhotoFill";
import { bool, decay, easeOutCubic, lastEventIndex, num, str, type LookProps } from "./types";

/**
 * Beat Flash: a white screen; on every hit a photo card flashes in (stacking
 * collage-style until the next bar), on bar starts a photo goes full screen.
 */
export const BeatFlashLook: React.FC<LookProps> = ({ t, events, photos, params, assetBase, seed, width, height }) => {
  const background = str(params, "background", "#ffffff");
  const intensity = num(params, "intensity", 0.7);
  const stack = bool(params, "stack", true);
  const idx = lastEventIndex(events, t);

  if (idx < 0) {
    // Before the first hit of the block: hold the first photo.
    return (
      <div style={{ position: "absolute", inset: 0, background }}>
        <PhotoFill photos={photos} index={events[0]?.photo ?? 0} assetBase={assetBase} />
      </div>
    );
  }

  const current = events[idx];
  const since = t - current.t;
  const flash = intensity * decay(since, 0.07);

  if (current.kind === "full") {
    const zoom = 1 + 0.08 * intensity * (1 - easeOutCubic(since / Math.max(0.2, current.dur)));
    return (
      <div style={{ position: "absolute", inset: 0, background }}>
        <PhotoFill photos={photos} index={current.photo} assetBase={assetBase} zoom={zoom} />
        <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} />
      </div>
    );
  }

  // Collage of the flash cards since the last full-screen hit.
  let first = idx;
  while (first > 0 && events[first - 1].kind !== "full" && idx - first < 4) first--;
  const cards = stack ? events.slice(first, idx + 1) : [current];

  const cardW = width * 0.64;
  const cardH = cardW * 1.25;
  return (
    <div style={{ position: "absolute", inset: 0, background, overflow: "hidden" }}>
      {cards.map((e, i) => {
        const isNewest = i === cards.length - 1;
        const r = (k: string) => random(`${seed}:${e.id}:${k}`);
        const cx = width * (0.3 + 0.4 * r("x"));
        const cy = height * (0.28 + 0.44 * r("y"));
        const rot = (r("r") - 0.5) * 10;
        const age = t - e.t;
        const pop = isNewest ? 1 + 0.14 * intensity * (1 - easeOutCubic(age / 0.12)) : 1;
        const dim = isNewest ? 1 : 0.92;
        return (
          <div
            key={e.id}
            style={{
              position: "absolute",
              left: cx - cardW / 2,
              top: cy - cardH / 2,
              width: cardW,
              height: cardH,
              transform: `rotate(${rot}deg) scale(${pop})`,
              background: "#fff",
              padding: 14,
              boxShadow: "0 14px 28px rgba(0,0,0,0.22)",
            }}
          >
            <div style={{ position: "relative", width: "100%", height: "100%" }}>
              <PhotoFill photos={photos} index={e.photo} assetBase={assetBase} small />
              {dim < 1 && <div style={{ position: "absolute", inset: 0, background: "#000", opacity: 1 - dim }} />}
              {isNewest && <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
};
