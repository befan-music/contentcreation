import React, { useMemo } from "react";
import type { WindowEvent } from "../behaviors";
import { random } from "../random";
import { PhotoFill } from "./PhotoFill";
import { bool, decay, easeOutCubic, num, str, type LookProps } from "./types";

type Pt = [number, number];
type Piece = { poly: Pt[]; cx: number; cy: number };
type Shape = "grid" | "strips" | "shards";

const FALL = 0.75; // seconds a cut piece takes to fall away
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeIn = (x: number) => clamp01(x) ** 3;
const easeInOut = (x: number) => {
  const c = clamp01(x);
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
};
const safeId = (s: string) => "cf" + s.replace(/[^a-zA-Z0-9]/g, "");
const polyCss = (poly: Pt[]) => `polygon(${poly.map(([x, y]) => `${(x * 100).toFixed(3)}% ${(y * 100).toFixed(3)}%`).join(", ")})`;
const polyPts = (poly: Pt[]) => poly.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(" ");

/** Cut a 9:16 frame into pieces (normalized 0..1 coordinates). */
function makePieces(shape: Shape, seed: string): Piece[] {
  const r = (k: string) => random(`${seed}:${k}`);
  const withCenter = (poly: Pt[]): Piece => ({ poly, cx: poly.reduce((a, p) => a + p[0], 0) / poly.length, cy: poly.reduce((a, p) => a + p[1], 0) / poly.length });

  if (shape === "strips") {
    const n = 9;
    const vertical = r("dir") < 0.6;
    const slant = 0.05 * (r("slant") < 0.5 ? -1 : 1);
    const at = (i: number, end: 0 | 1) => (i === 0 || i === n ? i / n : i / n + (end === 0 ? slant : -slant));
    return Array.from({ length: n }, (_, i) =>
      withCenter(
        vertical
          ? [
              [at(i, 0), 0],
              [at(i + 1, 0), 0],
              [at(i + 1, 1), 1],
              [at(i, 1), 1],
            ]
          : [
              [0, at(i, 0)],
              [1, at(i, 1)],
              [1, at(i + 1, 1)],
              [0, at(i + 1, 0)],
            ],
      ),
    );
  }

  const cols = 4;
  const rows = shape === "grid" ? 7 : 6;
  const grid: Pt[][] = [];
  for (let y = 0; y <= rows; y++) {
    grid.push([]);
    for (let x = 0; x <= cols; x++) {
      const inner = x > 0 && x < cols && y > 0 && y < rows;
      const jx = shape === "shards" && inner ? (r(`jx${x}.${y}`) - 0.5) * 0.7 : 0;
      const jy = shape === "shards" && inner ? (r(`jy${x}.${y}`) - 0.5) * 0.7 : 0;
      grid[y].push([(x + jx) / cols, (y + jy) / rows]);
    }
  }
  const pieces: Piece[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = grid[y][x];
      const b = grid[y][x + 1];
      const c = grid[y + 1][x + 1];
      const d = grid[y + 1][x];
      if (shape === "grid") pieces.push(withCenter([a, b, c, d]));
      else if (r(`diag${x}.${y}`) < 0.5) pieces.push(withCenter([a, b, c]), withCenter([a, c, d]));
      else pieces.push(withCenter([a, b, d]), withCenter([b, c, d]));
    }
  }
  return pieces;
}

/** Split pieces into `groups` waves, sweeping outward from a random origin. */
function groupPieces(pieces: Piece[], groups: number, seed: string): number[] {
  const origins: Pt[] = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [0.5, 0.5],
    [0.5, 0],
    [0.5, 1],
  ];
  const o = origins[Math.floor(random(`${seed}:origin`) * origins.length)];
  const order = pieces
    .map((p, i) => ({ i, d: Math.hypot((p.cx - o[0]) * 9, (p.cy - o[1]) * 16) + random(`${seed}:n${i}`) * 3 }))
    .sort((a, b) => a.d - b.d);
  const group = new Array<number>(pieces.length);
  order.forEach((o2, rank) => (group[o2.i] = Math.min(groups - 1, Math.floor((rank * groups) / pieces.length))));
  return group;
}

/**
 * Cut & Flow: each photo hit brings the next photo in with a transition:
 * - pieces:   during the bar before, the photo is cut into pieces that pop out
 *             and fall away on every beat; the last ones go on the downbeat
 * - zoom-in:  punch through the old photo into the new one
 * - zoom-out: the old photo shrinks away, revealing the new one
 * - water:    the new photo floods in behind a moving water surface
 * Between transitions: a slow push-in and a punch on every beat.
 */
export const CutFlowLook: React.FC<LookProps> = ({ t, events, photos, params, assetBase, seed, width, height, analysis }) => {
  const intensity = num(params, "intensity", 0.7);
  const shapeMode = str(params, "shape", "mix");
  const background = str(params, "background", "#000000");
  const motion = bool(params, "motion", true);
  const beatLen = 60 / (analysis.tempo > 0 ? analysis.tempo : 120);
  const zoomDur = Math.min(0.6, Math.max(0.25, 0.75 * beatLen));
  const waterDur = Math.min(0.9, Math.max(0.4, beatLen));

  const photoIdx = useMemo(() => events.reduce<number[]>((acc, e, i) => (e.showPhoto ? (acc.push(i), acc) : acc), []), [events]);

  // Pieces + wave grouping per incoming "pieces" transition (stable for the whole video).
  const piecesFor = useMemo(() => {
    const cache = new Map<string, { pieces: Piece[]; group: number[]; cuts: number[] }>();
    return (k: number) => {
      const inc = events[photoIdx[k]];
      const hit = cache.get(inc.id);
      if (hit) return hit;
      const out = events[photoIdx[k - 1]];
      const cuts = events.filter((e) => e.t > out.t + 1e-6 && e.t <= inc.t + 1e-6).map((e) => e.t);
      if (!cuts.length) cuts.push(inc.t);
      const shapes: Shape[] = ["grid", "shards", "strips"];
      const shape = (shapes as string[]).includes(shapeMode) ? (shapeMode as Shape) : shapes[Math.floor(random(`${seed}:${inc.id}:shape`) * shapes.length)];
      const pieces = makePieces(shape, `${seed}:${inc.id}`);
      const v = { pieces, group: groupPieces(pieces, cuts.length, `${seed}:${inc.id}`), cuts };
      cache.set(inc.id, v);
      return v;
    };
  }, [events, photoIdx, seed, shapeMode]);

  if (!photoIdx.length) return <div style={{ position: "absolute", inset: 0, background }} />;

  let pi = 0;
  for (let k = 0; k < photoIdx.length; k++) if (events[photoIdx[k]].t <= t + 1e-6) pi = k;
  const P = events[photoIdx[pi]];
  const Q = pi > 0 ? events[photoIdx[pi - 1]] : null;
  const N = pi + 1 < photoIdx.length ? events[photoIdx[pi + 1]] : null;
  const since = Math.max(0, t - P.t);

  // beat punch + slow push-in
  let lastBeat: WindowEvent | null = null;
  for (const e of events) {
    if (e.t <= t + 1e-6) lastBeat = e;
    else break;
  }
  const punch = lastBeat ? 0.03 * intensity * decay(t - lastBeat.t, 0.12) : 0;
  const pushOf = (e: WindowEvent, at: number) => (motion ? 0.06 * clamp01((at - e.t) / (e.dur + 0.5)) : 0);

  const layers: React.ReactNode[] = [];
  const photo = (key: string, e: WindowEvent, zoom: number, style?: React.CSSProperties) => (
    <PhotoFill key={key} photos={photos} index={e.photo} assetBase={assetBase} zoom={zoom} style={style} />
  );

  // --- 1. the current photo: arriving (transition in), being cut away, or resting ------
  const arriving =
    !!Q && (((P.variant === "zoom-in" || P.variant === "zoom-out") && since < zoomDur) || (P.variant === "water" && since < waterDur));
  // Cutting starts on the beat after the photo landed; the arrival always plays first.
  const cuttingAway = !!N && N.variant === "pieces" && !arriving;
  if (arriving && Q && P.variant === "zoom-in") {
    const u = since / zoomDur;
    layers.push(photo("in", P, 1.35 - 0.35 * easeOutCubic(u)));
    layers.push(photo("out", Q, 1 + 2.2 * easeIn(u), { opacity: 1 - clamp01((u - 0.25) / 0.6) }));
    layers.push(<div key="flash" style={{ position: "absolute", inset: 0, background: "#fff", opacity: 0.35 * intensity * Math.sin(Math.PI * clamp01(u)) }} />);
  } else if (arriving && Q && P.variant === "zoom-out") {
    const u = since / zoomDur;
    const e = easeInOut(u);
    layers.push(photo("in", P, 1.2 - 0.2 * easeOutCubic(u)));
    layers.push(
      <div
        key="out"
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${1 - 0.78 * e}) rotate(${-9 * e}deg)`,
          borderRadius: 70 * e,
          overflow: "hidden",
          boxShadow: `0 24px 40px rgba(0,0,0,${0.5 * e})`,
          opacity: 1 - clamp01((u - 0.72) / 0.28),
        }}
      >
        {photo("outp", Q, 1)}
      </div>,
    );
  } else if (arriving && Q && P.variant === "water") {
    const u = since / waterDur;
    const up = random(`${seed}:${P.id}:water`) < 0.65;
    const level = up ? 1 - 1.18 * easeInOut(u) : -0.18 + 1.18 * easeInOut(u);
    const amp = 0.035 * (1 - u) + 0.008;
    const surface = (x: number) => level + amp * Math.sin(2 * Math.PI * (1.4 * x + 1.5 * t)) + 0.5 * amp * Math.sin(2 * Math.PI * (3.3 * x - 2.1 * t + 0.37));
    const xs = Array.from({ length: 41 }, (_, i) => 1 - i / 40);
    const edge: Pt[] = xs.map((x) => [x, surface(x)]);
    const region: Pt[] = up ? [[0, 1.02], [1, 1.02], ...edge] : [[0, -0.02], [1, -0.02], ...edge];
    const band: Pt[] = [...edge.map(([x, y]) => [x, y - 0.006] as Pt), ...edge.slice().reverse().map(([x, y]) => [x, y + 0.014] as Pt)];
    layers.push(photo("out", Q, 1 + pushOf(Q, t)));
    layers.push(photo("in", P, 1.08 - 0.08 * easeOutCubic(u), { clipPath: polyCss(region) }));
    layers.push(<div key="band" style={{ position: "absolute", inset: 0, clipPath: polyCss(band), background: "linear-gradient(180deg, rgba(255,255,255,0.75), rgba(170,220,255,0.35))", opacity: 0.85 * (1 - u * 0.7) }} />);
    for (let i = 0; i < 7; i++) {
      const bx = random(`${seed}:${P.id}:b${i}`);
      const size = 8 + 16 * random(`${seed}:${P.id}:bs${i}`);
      const by = surface(bx) + (up ? 1 : -1) * (0.015 + 0.06 * random(`${seed}:${P.id}:bo${i}`));
      layers.push(
        <div key={`bub${i}`} style={{ position: "absolute", left: bx * width - size / 2, top: by * height - size / 2, width: size, height: size, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.7)", opacity: 1 - u }} />,
      );
    }
  } else if (!cuttingAway) {
    layers.push(photo("cur", P, 1 + pushOf(P, t) + punch));
  }

  // --- 2. the current photo being cut away toward the next one ---------------------
  if (cuttingAway) {
    const { pieces, group, cuts } = piecesFor(pi + 1);
    const zoom = 1 + pushOf(P, t);
    const remaining = pieces.filter((_, i) => cuts[group[i]] > t + 1e-6);
    const cid = safeId(`${seed}${P.id}`);
    layers.push(photo("next", N!, 1));
    layers.push(
      <svg key="defs" width={0} height={0} style={{ position: "absolute" }}>
        <defs>
          <clipPath id={cid} clipPathUnits="objectBoundingBox">
            {remaining.map((p, i) => (
              <polygon key={i} points={polyPts(p.poly)} />
            ))}
          </clipPath>
        </defs>
      </svg>,
    );
    layers.push(
      <div key="remaining" style={{ position: "absolute", inset: 0, clipPath: `url(#${cid})` }}>
        {photo("rem", P, zoom)}
      </div>,
    );
    if (t > cuts[0] - 1e-6) {
      layers.push(
        <svg key="lines" viewBox="0 0 1 1" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {remaining.map((p, i) => (
            <polygon key={i} points={polyPts(p.poly)} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>,
      );
    }
    layers.push(...fallingPieces("fallP", P, pieces, group, cuts, t, zoom));
  }

  // --- 3. the previous photo's last pieces still falling after the downbeat ------------
  if (Q && P.variant === "pieces" && since < FALL) {
    const { pieces, group, cuts } = piecesFor(pi);
    layers.push(...fallingPieces("fallQ", Q, pieces, group, cuts, t, 1 + pushOf(Q, P.t)));
  }

  return <div style={{ position: "absolute", inset: 0, background, overflow: "hidden" }}>{layers}</div>;

  function fallingPieces(prefix: string, owner: WindowEvent, pieces: Piece[], group: number[], cuts: number[], now: number, zoom: number) {
    const out: React.ReactNode[] = [];
    pieces.forEach((p, i) => {
      const cut = cuts[group[i]];
      const age = now - cut;
      if (age < 0 || age >= FALL) return;
      const u = age / FALL;
      const r = (k: string) => random(`${seed}:${owner.id}:${i}:${k}`);
      const lift = clamp01(u / 0.12);
      const tx = (r("dx") - 0.5) * 0.45 * width * u;
      const ty = u * u * 1.25 * height - 30 * lift * (1 - u);
      const rot = (r("rot") - 0.5) * 70 * u;
      const scale = 1 + 0.08 * lift - 0.18 * u;
      const clip = polyCss(p.poly);
      out.push(
        <div
          key={`${prefix}${i}`}
          style={{
            position: "absolute",
            inset: 0,
            transformOrigin: `${p.cx * 100}% ${p.cy * 100}%`,
            transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${scale})`,
            opacity: u > 0.65 ? 1 - (u - 0.65) / 0.35 : 1,
          }}
        >
          {/* cheap shadow: a dark copy of the piece, offset down (a CSS drop-shadow filter is ~10x slower to render) */}
          <div style={{ position: "absolute", inset: 0, clipPath: clip, background: "rgba(0,0,0,0.38)", transform: `translate(${10 + 14 * lift}px, ${18 + 22 * lift}px)` }} />
          <div style={{ position: "absolute", inset: 0, clipPath: clip }}>{photo(`${prefix}p${i}`, owner, zoom)}</div>
          <svg viewBox="0 0 1 1" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <polygon points={polyPts(p.poly)} fill="none" stroke="#ffffff" strokeOpacity={1 - clamp01(u / 0.3)} strokeWidth={4} vectorEffect="non-scaling-stroke" />
          </svg>
        </div>,
      );
    });
    return out;
  }
};
