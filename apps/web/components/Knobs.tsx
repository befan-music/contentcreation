"use client";

import { useRef } from "react";
import type { ParamDef, ParamValues } from "@stages/project";
import styles from "./knobs.module.css";

/** Knob UI generated from a Stage's parameter list (roadmap Phase 5). */
export function Knobs({ defs, values, onChange }: { defs: ParamDef[]; values: ParamValues; onChange: (patch: ParamValues) => void }) {
  return (
    <div className={styles.knobs}>
      {defs.filter((d) => !d.hidden).map((d) => {
        const v = values[d.key] ?? d.default;
        const id = `knob-${d.key}`;
        return (
          <div key={d.key} className={styles.knob}>
            <label htmlFor={id}>{d.label}</label>
            {d.type === "select" && (
              <div className={styles.options} role="group" id={id} aria-label={d.label}>
                {d.options.map((o) => (
                  <button key={o.value} aria-pressed={v === o.value} onClick={() => onChange({ [d.key]: o.value })}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            {d.type === "range" && (
              <div className={styles.range}>
                <input id={id} type="range" min={d.min} max={d.max} step={d.step} value={Number(v)} onChange={(e) => onChange({ [d.key]: Number(e.target.value) })} />
                <span className="muted">{Number(v).toFixed(d.step < 1 ? (d.step < 0.1 ? 2 : 1) : 0)}</span>
              </div>
            )}
            {d.type === "color" && (
              <div className={styles.color}>
                <input id={id} type="color" value={String(v)} onChange={(e) => onChange({ [d.key]: e.target.value })} />
                <span className="muted">{String(v)}</span>
              </div>
            )}
            {d.type === "text" && (
              <input id={id} className="input" style={{ minHeight: 36 }} value={String(v)} placeholder={d.placeholder} maxLength={200} onChange={(e) => onChange({ [d.key]: e.target.value })} />
            )}
            {d.type === "toggle" && (
              <button id={id} className={styles.toggle} role="switch" aria-checked={Boolean(v)} onClick={() => onChange({ [d.key]: !v })}>
                <span />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Energy pad: one 2D control, x = sparse → busy, y = calm → intense.
 * Beginners move one dot instead of learning the knobs.
 */
export function EnergyPad({ x, y, onChange }: { x: number; y: number; onChange: (x: number, y: number) => void }) {
  const pad = useRef<HTMLDivElement>(null);
  const set = (clientX: number, clientY: number) => {
    const r = pad.current!.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const ny = Math.min(1, Math.max(0, 1 - (clientY - r.top) / r.height));
    onChange(Math.round(nx * 100) / 100, Math.round(ny * 100) / 100);
  };
  return (
    <div className={styles.padWrap}>
      <div
        ref={pad}
        className={styles.pad}
        role="slider"
        tabIndex={0}
        aria-label="Energy: left/right is sparse to busy, down/up is calm to intense"
        aria-valuetext={`busy ${Math.round(x * 100)}%, intense ${Math.round(y * 100)}%`}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          set(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => e.buttons && set(e.clientX, e.clientY)}
        onKeyDown={(e) => {
          const step = 0.05;
          if (e.key === "ArrowRight") onChange(Math.min(1, x + step), y);
          if (e.key === "ArrowLeft") onChange(Math.max(0, x - step), y);
          if (e.key === "ArrowUp") onChange(x, Math.min(1, y + step));
          if (e.key === "ArrowDown") onChange(x, Math.max(0, y - step));
        }}
      >
        <span className={styles.dot} style={{ left: `${x * 100}%`, top: `${(1 - y) * 100}%` }} />
        <span className={`${styles.axis} ${styles.top}`}>intense</span>
        <span className={`${styles.axis} ${styles.bottom}`}>calm</span>
        <span className={`${styles.axis} ${styles.left}`}>sparse</span>
        <span className={`${styles.axis} ${styles.right}`}>busy</span>
      </div>
    </div>
  );
}
