import React from "react";
import { Img } from "remotion";
import type { Photo } from "@stages/project";
import { normalizePrompt, styleKey } from "../magic";
import { random } from "../random";
import { PhotoFill, assetUrl } from "./PhotoFill";
import { decay, easeOutCubic, lastEventIndex, num, str, bool, type LookProps } from "./types";

const SWEEP = 0.3; // seconds the reveal wipe takes

/** The AI-styled picture, cropped like the original (cover, around its focal point). */
const StyledFill: React.FC<{ photo: Photo; src: string; assetBase: string; zoom: number }> = ({ photo, src, assetBase, zoom }) => {
  const fx = (photo.focal?.x ?? 0.5) * 100;
  const fy = (photo.focal?.y ?? 0.5) * 100;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Img
        src={assetUrl(assetBase, src)}
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${fx}% ${fy}%`, transform: `scale(${zoom})`, transformOrigin: `${fx}% ${fy}%` }}
      />
    </div>
  );
};

/**
 * Magic: each new photo appears as shot, then a glowing wipe on the next beat
 * reveals its AI-styled version; beats in between pulse. Styled pictures come
 * from photo.styles[styleKey(prompt, variation)], generated ahead of time.
 */
export const MagicLook: React.FC<LookProps> = ({ t, events, photos, params, assetBase, seed, width, height }) => {
  const prompt = str(params, "prompt", "");
  const variation = num(params, "variation", 0);
  const reveal = str(params, "reveal", "beat");
  const intensity = num(params, "intensity", 0.7);
  const motion = bool(params, "motion", true);
  const glow = str(params, "glow", "#c6ff3d");
  const key = normalizePrompt(prompt) ? styleKey(prompt, variation) : null;

  const idx = lastEventIndex(events, t);
  // The photo event this moment belongs to (the last one that brought a new photo).
  let p = idx;
  while (p > 0 && !events[p].showPhoto) p--;
  const photoEvent = p >= 0 ? events[p] : null;
  const photoIndex = photoEvent?.photo ?? events.find((e) => e.showPhoto)?.photo ?? 0;
  const photo = photos.length ? photos[photoIndex % photos.length] : null;
  const styled = photo && key ? photo.styles?.[key] : undefined;

  const start = photoEvent?.t ?? t;
  const span = Math.max(0.2, photoEvent?.dur ?? 2);
  const since = t - start;

  // When the styled version takes over.
  const nextBeat = idx >= 0 ? events.slice(p + 1).find((e) => e.t > start + 1e-6) : undefined;
  const revealAt = Math.min(start + span * 0.6, nextBeat ? nextBeat.t : start + span / 2);
  let progress: number; // 0 = original, 1 = styled
  if (reveal === "styled") progress = 1;
  else if (reveal === "alternate") {
    const beatNo = idx >= 0 ? events.slice(p, idx + 1).length - 1 : 0;
    progress = beatNo % 2 === 1 ? 1 : 0;
  } else progress = Math.min(1, Math.max(0, (t - revealAt) / SWEEP));
  if (!styled) progress = 0;

  // Motion: a slow push-in over the photo's time, plus a punch on every beat.
  const current = idx >= 0 ? events[idx] : null;
  const punch = current ? 0.045 * intensity * decay(t - current.t, 0.12) : 0;
  const push = motion ? 0.07 * easeOutCubic(since / (span + 0.5)) : 0;
  const zoom = 1 + push + punch;
  const flash = photoEvent ? 0.8 * intensity * decay(since, 0.07) : 0;

  // Diagonal wipe front (in % of width), slanted by 18%.
  const front = progress * 125;
  const clip = `polygon(0 0, ${front}% 0, ${front - 18}% 100%, 0 100%)`;
  const showFront = progress > 0 && progress < 1;

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000", overflow: "hidden" }}>
      {photo ? (
        <PhotoFill photos={photos} index={photoIndex} assetBase={assetBase} zoom={zoom} />
      ) : (
        <PhotoFill photos={[]} index={photoIndex} assetBase={assetBase} zoom={zoom} />
      )}

      {styled && photo && progress > 0 && (
        <div style={{ position: "absolute", inset: 0, clipPath: progress < 1 ? clip : undefined }}>
          <StyledFill photo={photo} src={styled.src} assetBase={assetBase} zoom={zoom} />
        </div>
      )}

      {showFront && (
        <>
          {/* glowing wipe edge */}
          <div
            style={{
              position: "absolute",
              top: -height * 0.1,
              height: height * 1.2,
              left: `${front - 9}%`,
              width: 70,
              marginLeft: -35,
              transform: `skewX(${-Math.atan((0.18 * width) / height) * (180 / Math.PI)}deg)`,
              background: `linear-gradient(90deg, transparent, ${glow}88 35%, #ffffff 50%, ${glow}88 65%, transparent)`,
              opacity: 0.9 * (1 - Math.abs(progress - 0.5) * 0.6),
            }}
          />
          {/* sparkles riding the edge */}
          {Array.from({ length: 9 }, (_, i) => {
            const r = (k: string) => random(`${seed}:${photoEvent?.id}:spark:${i}:${k}`);
            const y = r("y");
            const x = (front - 18 * y) / 100 + (r("x") - 0.5) * 0.08;
            const size = 10 + 22 * r("s") * intensity;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: x * width - size / 2,
                  top: y * height - size / 2,
                  width: size,
                  height: size,
                  borderRadius: "50%",
                  background: `radial-gradient(circle, #ffffff 0%, ${glow} 35%, transparent 70%)`,
                  opacity: 0.6 + 0.4 * r("o"),
                }}
              />
            );
          })}
        </>
      )}

      {/* the moment a new photo lands */}
      <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} />

      {/* preview-only state: style not generated yet (render is blocked until it is) */}
      {!styled && photos.length > 0 && (
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(115deg, transparent ${((t * 40) % 140) - 40}%, rgba(255,255,255,0.18) ${((t * 40) % 140) - 25}%, transparent ${((t * 40) % 140) - 10}%)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: 520,
              transform: "translateX(-50%)",
              padding: "16px 28px",
              borderRadius: 999,
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
              fontSize: 40,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            ✨ {key ? `“${prompt.trim().slice(0, 24)}” look not generated yet` : "Type a style for Magic"}
          </div>
        </>
      )}
    </div>
  );
};
