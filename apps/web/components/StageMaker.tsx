"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { Analysis, Project, StageDef, StageWindow } from "@stages/project";
import { CUSTOM_BEHAVIORS, customStageParams } from "@stages/stages";
import { ASSET_BASE, api, saveProject, track, uploadForm } from "@/lib/client";
import { Preview } from "./Preview";
import s from "./steps/steps.module.css";
import m from "./stagemaker.module.css";

type Pt = [number, number];
type Order = "left-right" | "top-bottom" | "drawn";

const W = 1080;
const H = 1920;

function centroid(poly: Pt[]): Pt {
  const x = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const y = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  return [x, y];
}

function ordered(windows: StageWindow[], order: Order): StageWindow[] {
  const ws = windows.map((w, i) => ({ ...w, drawn: i }));
  if (order === "left-right") ws.sort((a, b) => centroid(a.polygon)[0] - centroid(b.polygon)[0] || centroid(a.polygon)[1] - centroid(b.polygon)[1]);
  if (order === "top-bottom") ws.sort((a, b) => centroid(a.polygon)[1] - centroid(b.polygon)[1] || centroid(a.polygon)[0] - centroid(b.polygon)[0]);
  return ws.map(({ drawn: _d, ...w }, i) => ({ ...w, order: i }));
}

/**
 * Custom Stage maker (roadmap Phase 6): object photo -> tap/drag windows ->
 * pick a behavior -> test with your song -> save to your library.
 */
export function StageMaker({ project, analysis, existing }: { project: Project | null; analysis: Analysis | null; existing: StageDef | null }) {
  const router = useRouter();
  const existingLook = existing?.look.kind === "photo" ? existing.look : null;
  const [image, setImage] = useState<string | null>(existingLook?.imageSrc ?? null);
  const [windows, setWindows] = useState<StageWindow[]>(existingLook?.windows ?? []);
  const [tool, setTool] = useState<"box" | "shape">("box");
  const [draft, setDraft] = useState<Pt[]>([]);
  const [box, setBox] = useState<{ a: Pt; b: Pt } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [order, setOrder] = useState<Order>("left-right");
  const [behavior, setBehavior] = useState(existing?.behavior ?? "like-piano");
  const [name, setName] = useState(existing?.name ?? "My Stage");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const finalWindows = useMemo(() => ordered(windows, order), [windows, order]);

  const draftStage: StageDef | null = image
    ? {
        id: existing?.id ?? "custom-draft",
        name,
        description: "",
        source: "custom",
        look: { kind: "photo", imageSrc: image, width: W, height: H, windows: finalWindows },
        behavior,
        params: customStageParams(behavior),
      }
    : null;

  const previewProject = useMemo(
    () => (project && draftStage ? { ...project, stageId: draftStage.id, stageParams: {}, blocks: [] } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, draftStage?.id, behavior, finalWindows, image],
  );
  const previewStages = useMemo(() => (draftStage ? [draftStage] : []), [draftStage?.id, behavior, finalWindows, image]); // eslint-disable-line react-hooks/exhaustive-deps

  const pointFrom = (e: React.PointerEvent): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };

  const addWindow = (polygon: Pt[]) => {
    const id = `w${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    setWindows((ws) => [...ws, { id, polygon, order: ws.length }]);
    setSelected(id);
  };

  const finishShape = () => {
    if (draft.length >= 3) addWindow(draft);
    setDraft([]);
  };

  async function upload(file: File) {
    setBusy("Preparing the photo…");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await uploadForm<{ imageSrc: string }>("/api/stages/image", form);
      setImage(res.imageSrc);
      setWindows([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!draftStage) return;
    setBusy("Saving…");
    setError(null);
    try {
      const saved = await api<StageDef>("/api/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draftStage, id: existing?.id }),
      });
      track("custom_stage_created", { windows: finalWindows.length, behavior });
      if (project) {
        const fresh = await api<Project>(`/api/projects/${project.id}`);
        await saveProject({ ...fresh, stageId: saved.id, stageParams: {}, blocks: [] });
        router.push(`/p/${project.id}?step=stage`);
      } else router.push("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className={m.page}>
      <header className={m.top}>
        <Link href={project ? `/p/${project.id}?step=stage` : "/"} className="btn btn-ghost btn-sm">
          ← Back
        </Link>
        <input className={m.name} value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} aria-label="Stage name" />
        <button className="btn btn-primary btn-sm" disabled={!draftStage || finalWindows.length === 0 || !!busy} onClick={save}>
          Save Stage
        </button>
      </header>

      <div className={m.layout}>
        <section className={m.canvasCol}>
          {!image ? (
            <div className={s.drop} style={{ aspectRatio: "9/16", justifyContent: "center" }}>
              <strong>1. Upload a photo of an object</strong>
              <span className="muted" style={{ fontSize: 13, maxWidth: 260 }}>
                Your keyboard, a building, a shelf, a guitar neck. It&rsquo;s cropped to 9:16.
              </span>
              <button className="btn" onClick={() => fileInput.current?.click()} disabled={!!busy}>
                Choose photo
              </button>
            </div>
          ) : (
            <div className={m.canvasWrap}>
              <svg
                ref={svg}
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                className={m.canvas}
                style={{ backgroundImage: `url(${ASSET_BASE}/${image})`, cursor: tool === "box" ? "crosshair" : "cell" }}
                onPointerDown={(e) => {
                  if ((e.target as Element).getAttribute("data-window")) return;
                  const p = pointFrom(e);
                  if (tool === "box") {
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                    setBox({ a: p, b: p });
                  } else {
                    if (draft.length >= 3) {
                      const [fx, fy] = draft[0];
                      const r = svg.current!.getBoundingClientRect();
                      if (Math.hypot((p[0] - fx) * r.width, (p[1] - fy) * r.height) < 14) return finishShape();
                    }
                    setDraft((d) => [...d, p]);
                  }
                }}
                onPointerMove={(e) => box && setBox({ ...box, b: pointFrom(e) })}
                onPointerUp={() => {
                  if (!box) return;
                  const [x0, y0] = box.a;
                  const [x1, y1] = box.b;
                  if (Math.abs(x1 - x0) > 0.01 && Math.abs(y1 - y0) > 0.006) {
                    const l = Math.min(x0, x1);
                    const r2 = Math.max(x0, x1);
                    const t = Math.min(y0, y1);
                    const b = Math.max(y0, y1);
                    addWindow([
                      [l, t],
                      [r2, t],
                      [r2, b],
                      [l, b],
                    ]);
                  }
                  setBox(null);
                }}
              >
                {finalWindows.map((w) => (
                  <polygon
                    key={w.id}
                    data-window={w.id}
                    points={w.polygon.map((p) => p.join(",")).join(" ")}
                    className={`${m.window} ${selected === w.id ? m.windowSel : ""}`}
                    vectorEffect="non-scaling-stroke"
                    onPointerDown={() => setSelected(w.id)}
                  />
                ))}
                {box && (
                  <rect
                    x={Math.min(box.a[0], box.b[0])}
                    y={Math.min(box.a[1], box.b[1])}
                    width={Math.abs(box.b[0] - box.a[0])}
                    height={Math.abs(box.b[1] - box.a[1])}
                    className={m.draft}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {draft.length > 0 && <polyline points={draft.map((p) => p.join(",")).join(" ")} className={m.draft} vectorEffect="non-scaling-stroke" />}
              </svg>
              {finalWindows.map((w) => {
                const [cx, cy] = centroid(w.polygon);
                return (
                  <span key={w.id} className={m.label} style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }}>
                    {w.order + 1}
                  </span>
                );
              })}
            </div>
          )}
          <input ref={fileInput} type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </section>

        <section className={m.side}>
          {image && (
            <div className={`card ${s.panel}`}>
              <div className={s.spread}>
                <strong>2. Tap the windows</strong>
                <span className="muted" style={{ fontSize: 13 }}>
                  {finalWindows.length} window{finalWindows.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className={s.segmented} role="group" aria-label="Drawing tool">
                <button aria-pressed={tool === "box"} onClick={() => setTool("box")}>
                  Drag boxes
                </button>
                <button aria-pressed={tool === "shape"} onClick={() => setTool("shape")}>
                  Tap a shape
                </button>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {tool === "box" ? "Drag over each part, e.g. each key." : "Tap the corners of a part; tap the first point again to close it."}
              </p>
              <div className={s.row}>
                {draft.length >= 3 && (
                  <button className="btn btn-sm" onClick={finishShape}>
                    Close shape
                  </button>
                )}
                <button className="btn btn-sm" disabled={!selected} onClick={() => (setWindows((ws) => ws.filter((w) => w.id !== selected)), setSelected(null))}>
                  Delete selected
                </button>
                <button className="btn btn-sm btn-ghost" disabled={!windows.length} onClick={() => setWindows((ws) => ws.slice(0, -1))}>
                  Undo last
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => fileInput.current?.click()}>
                  New photo
                </button>
              </div>
              <label className="muted" style={{ fontSize: 13 }}>
                Window order{" "}
                <select className="input" style={{ width: "auto", minHeight: 32, marginLeft: 6 }} value={order} onChange={(e) => setOrder(e.target.value as Order)}>
                  <option value="left-right">Left to right</option>
                  <option value="top-bottom">Top to bottom</option>
                  <option value="drawn">As drawn</option>
                </select>
              </label>
            </div>
          )}

          {image && (
            <div className={`card ${s.panel}`}>
              <strong>3. When does a window open?</strong>
              <div className={m.behaviors}>
                {CUSTOM_BEHAVIORS.map((b) => (
                  <button key={b.id} className={s.stageCard} style={{ minHeight: 0 }} aria-pressed={behavior === b.id} onClick={() => setBehavior(b.id)}>
                    <span className={s.stageName} style={{ fontSize: 14 }}>
                      {b.name}
                    </span>
                    <span className={s.stageDesc}>{b.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {image && finalWindows.length > 0 && (
            <div className={`card ${s.panel}`}>
              <strong>4. Test it</strong>
              {previewProject && analysis ? (
                <div style={{ maxWidth: 280 }}>
                  <Preview project={previewProject} analysis={analysis} customStages={previewStages} />
                </div>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  Open the maker from a video with a song to test it with your music.
                </p>
              )}
            </div>
          )}

          {busy && <p className="muted pulse">{busy}</p>}
          {error && <p className="error">{error}</p>}
        </section>
      </div>
    </div>
  );
}
