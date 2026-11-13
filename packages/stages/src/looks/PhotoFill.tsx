import React from "react";
import { Img } from "remotion";
import type { Photo } from "@stages/project";

const PLACEHOLDER_COLORS = ["#ff5a36", "#3a7bff", "#ffc93a", "#29c785", "#b05cff", "#ff4fa3", "#1fc6d6", "#ff8f1f"];

export function assetUrl(base: string, src: string): string {
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  return `${base.replace(/\/$/, "")}/${src.replace(/^\//, "")}`;
}

/**
 * A photo that fills its box (object-fit: cover), cropped around its focal point.
 * With no photos yet, draws a numbered color block so Stages can be previewed early.
 */
export const PhotoFill: React.FC<{
  photos: Photo[];
  index: number;
  assetBase: string;
  style?: React.CSSProperties;
  zoom?: number;
  /** drawn small (a card or window): use the 720px version */
  small?: boolean;
}> = ({ photos, index, assetBase, style, zoom = 1, small = false }) => {
  const box: React.CSSProperties = { position: "absolute", inset: 0, overflow: "hidden", ...style };
  if (!photos.length) {
    const color = PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length];
    return (
      <div style={{ ...box, background: `linear-gradient(135deg, ${color}, ${color}aa)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 160, fontWeight: 800, fontFamily: "system-ui, sans-serif", transform: `scale(${zoom})` }}>
          {(index % 8) + 1}
        </span>
      </div>
    );
  }
  const photo = photos[index % photos.length];
  const fx = (photo.focal?.x ?? 0.5) * 100;
  const fy = (photo.focal?.y ?? 0.5) * 100;
  return (
    <div style={box}>
      <Img
        src={assetUrl(assetBase, small && photo.srcSmall ? photo.srcSmall : photo.src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: `${fx}% ${fy}%`,
          transform: zoom !== 1 ? `scale(${zoom})` : undefined,
          transformOrigin: `${fx}% ${fy}%`,
        }}
      />
    </div>
  );
};
