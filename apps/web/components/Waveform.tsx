"use client";

import { useEffect, useRef, useState } from "react";
import { clipFrom, type Analysis, type Clip, type Section } from "@stages/project";

const SECTION_COLORS: Record<string, string> = {
  intro: "#6b7cff",
  verse: "#3fa7ff",
  chorus: "#c6ff3d",
  drop: "#ff4fa3",
  bridge: "#ffb13d",
  outro: "#8b8b99",
};

type Props = {
  analysis: Analysis;
  sections: Section[];
  /** null = no clip window yet (preview): the waveform just seeks */
  clip: Clip | null;
  clipLength: number;
  playhead?: number | null;
  onClipChange: (clip: Clip) => void;
  onSeek?: (t: number) => void;
};

/**
 * The whole song as a waveform with sections and bar ticks. The highlighted
 * window is the clip: drag it (it snaps to bars) or tap anywhere to move it there.
 */
export function Waveform({ analysis, sections, clip, clipLength, playhead, onClipChange, onSeek }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const drag = useRef<{ offset: number } | null>(null);
  const height = 112;
  const stripH = 10;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = height * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const dur = analysis.duration;
    const x = (t: number) => (t / dur) * width;

    // sections strip
    for (const s of sections) {
      ctx.fillStyle = SECTION_COLORS[s.label] ?? "#555";
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x(s.start) + 1, 0, Math.max(1, x(s.end) - x(s.start) - 2), stripH - 3);
    }
    ctx.globalAlpha = 1;

    // waveform
    const { hop, peaks } = analysis.waveform;
    const mid = stripH + (height - stripH) / 2;
    const amp = (height - stripH) / 2 - 6;
    for (let px = 0; px < width; px++) {
      const a = Math.floor(((px / width) * dur) / hop);
      const b = Math.max(a + 1, Math.floor((((px + 1) / width) * dur) / hop));
      let m = 0;
      for (let i = a; i < b && i < peaks.length; i++) m = Math.max(m, peaks[i]);
      const t = (px / width) * dur;
      const inClip = clip ? t >= clip.start && t <= clip.end : true;
      ctx.fillStyle = inClip ? "#f4f4f6" : "#4a4a56";
      const h = Math.max(1, m * amp);
      ctx.fillRect(px, mid - h, 1, h * 2);
    }

    // bar ticks
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    const step = Math.max(1, Math.ceil(analysis.downbeats.length / (width / 6)));
    analysis.downbeats.forEach((d, i) => {
      if (i % step === 0) ctx.fillRect(x(d), height - 5, 1, 5);
    });

    // clip window
    if (clip) {
    ctx.fillStyle = "rgba(198,255,61,0.10)";
    ctx.fillRect(x(clip.start), stripH, x(clip.end) - x(clip.start), height - stripH);
    ctx.strokeStyle = "#c6ff3d";
    ctx.lineWidth = 2;
    ctx.strokeRect(x(clip.start) + 1, stripH + 1, x(clip.end) - x(clip.start) - 2, height - stripH - 2);
    }

    if (playhead != null) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(x(playhead), stripH, 2, height - stripH);
    }
  }, [analysis, sections, clip, playhead, width]);

  const timeAt = (clientX: number) => {
    const rect = canvas.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * analysis.duration;
  };

  return (
    <div ref={wrap} style={{ width: "100%", touchAction: "none" }}>
      <canvas
        ref={canvas}
        style={{ width: "100%", height, display: "block", cursor: "grab", borderRadius: 10, background: "var(--surface-2)" }}
        role="slider"
        aria-label="Clip position in the song"
        aria-valuemin={0}
        aria-valuemax={Math.round(analysis.duration)}
        aria-valuenow={Math.round(clip?.start ?? playhead ?? 0)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (!clip) return;
          const bars = analysis.downbeats;
          const i = bars.findIndex((d) => d >= clip.start - 0.05);
          if (e.key === "ArrowRight") onClipChange(clipFrom(bars[Math.min(bars.length - 1, i + 1)] ?? clip.start, clipLength, analysis));
          if (e.key === "ArrowLeft") onClipChange(clipFrom(bars[Math.max(0, i - 1)] ?? clip.start, clipLength, analysis));
        }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const t = timeAt(e.clientX);
          if (!clip) {
            onSeek?.(t);
            return;
          }
          if (t >= clip.start && t <= clip.end) drag.current = { offset: t - clip.start };
          else {
            drag.current = { offset: clipLength / 2 };
            onClipChange(clipFrom(t - clipLength / 2, clipLength, analysis));
          }
        }}
        onPointerMove={(e) => {
          if (!drag.current || !clip) return;
          const next = clipFrom(timeAt(e.clientX) - drag.current.offset, clipLength, analysis);
          if (Math.abs(next.start - clip.start) > 0.01) onClipChange(next);
        }}
        onPointerUp={() => (drag.current = null)}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8, fontSize: 12 }} className="muted">
        {[...new Set(sections.map((s) => s.label))].map((l) => (
          <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: SECTION_COLORS[l] }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
