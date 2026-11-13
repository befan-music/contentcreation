import React from "react";
import { Img } from "remotion";
import { PhotoFill, assetUrl } from "./PhotoFill";
import { decay, easeOutCubic, lastEventIndex, num, str, type LookProps } from "./types";

/**
 * Custom Stage look: the user's object photo (cropped to 9:16 by the Stage
 * maker) with windows. When a window opens, a project photo appears inside its
 * polygon, then fades as the window closes. "full" events cover the screen.
 */
export const PhotoStageLook: React.FC<LookProps> = ({ t, stage, events, photos, params, assetBase, width, height }) => {
  const look = stage.look;
  if (look.kind !== "photo") return null;
  const intensity = num(params, "intensity", 0.7);
  const glow = str(params, "glow", "#ffffff");
  const windows = [...look.windows].sort((a, b) => a.order - b.order);

  const idx = lastEventIndex(events, t);
  const open: { window: number; photo: number; strength: number; age: number; id: string }[] = [];
  let full: { photo: number; age: number; dur: number } | null = null;
  for (let i = idx; i >= 0; i--) {
    const e = events[i];
    const age = t - e.t;
    if (age > 4) break;
    if (e.kind === "full") {
      if (!full && age < e.dur) full = { photo: e.photo, age, dur: e.dur };
      continue;
    }
    const hold = Math.max(0.25, e.dur);
    const fadeOut = 0.18;
    if (age < hold + fadeOut && !open.some((o) => o.window === e.window)) {
      const strength = age < hold ? 1 : 1 - (age - hold) / fadeOut;
      open.push({ window: e.window, photo: e.photo, strength, age, id: e.id });
    }
  }

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000", overflow: "hidden" }}>
      <Img src={assetUrl(assetBase, look.imageSrc)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      {/* dim the object a little so open windows read clearly */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.18)" }} />
      {open.map((o) => {
        const w = windows[o.window % Math.max(1, windows.length)];
        if (!w || w.polygon.length < 3) return null;
        const xs = w.polygon.map((p) => p[0]);
        const ys = w.polygon.map((p) => p[1]);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const bw = Math.max(0.001, Math.max(...xs) - minX);
        const bh = Math.max(0.001, Math.max(...ys) - minY);
        const clip = `polygon(${w.polygon.map(([x, y]) => `${(((x - minX) / bw) * 100).toFixed(2)}% ${(((y - minY) / bh) * 100).toFixed(2)}%`).join(", ")})`;
        const pop = 1 + 0.08 * intensity * (1 - easeOutCubic(o.age / 0.15));
        return (
          <div
            key={o.id}
            style={{
              position: "absolute",
              left: minX * width,
              top: minY * height,
              width: bw * width,
              height: bh * height,
              opacity: o.strength,
              transform: `scale(${pop})`,
              filter: intensity > 0.05 ? `drop-shadow(0 0 ${Math.round(12 * intensity)}px ${glow})` : undefined,
            }}
          >
            <div style={{ position: "absolute", inset: 0, clipPath: clip }}>
              <PhotoFill photos={photos} index={o.photo} assetBase={assetBase} small={bw * width < 700 && bh * height < 700} />
              <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: intensity * decay(o.age, 0.06) }} />
            </div>
          </div>
        );
      })}
      {full && (
        <div style={{ position: "absolute", inset: 0 }}>
          <PhotoFill photos={photos} index={full.photo} assetBase={assetBase} zoom={1 + 0.06 * (1 - easeOutCubic(full.age / full.dur))} />
          <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: intensity * decay(full.age, 0.07) }} />
        </div>
      )}
    </div>
  );
};
