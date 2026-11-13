"use client";

import { useRef, useState } from "react";
import type { Project } from "@stages/project";
import { ASSET_BASE, track, uploadForm } from "@/lib/client";
import type { EditorApi } from "../Editor";
import { Progress } from "./SongStep";
import s from "./steps.module.css";

const MAX_EDGE = 2048;

/** Resize in the browser before upload (fast uploads on phones). HEIC and anything undecodable go up as-is. */
async function shrink(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 600_000) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 2_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function PhotosStep({ api: editor, minPhotos }: { api: EditorApi; minPhotos: number }) {
  const { project, update, replace, go } = editor;
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function addFiles(list: FileList | File[]) {
    const files = [...list].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!files.length) return;
    setError(null);
    setProgress(0);
    let latest: Project | null = null;
    const failed: string[] = [];
    try {
      for (let i = 0; i < files.length; i += 3) {
        const batch = files.slice(i, i + 3);
        const form = new FormData();
        for (const f of batch) form.append("file", await shrink(f), f.name.replace(/\.(png|webp)$/i, ".jpg"));
        const res = await uploadForm<{ project: Project; failed: string[] }>(`/api/projects/${project.id}/photos`, form, (p) =>
          setProgress((i + p * batch.length) / files.length),
        );
        latest = res.project;
        failed.push(...res.failed);
        replace(res.project);
      }
      if (failed.length) setError(`Couldn't read: ${failed.join(", ")}`);
      if (latest) track("photos_added", { projectId: project.id, count: latest.photos.length });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  }

  const move = (from: number, to: number) =>
    update((p) => {
      if (to < 0 || to >= p.photos.length || from === to) return p;
      const photos = [...p.photos];
      const [x] = photos.splice(from, 1);
      photos.splice(to, 0, x);
      return { ...p, photos };
    });

  const n = project.photos.length;

  return (
    <section className={s.step}>
      <div>
        <h1 className={s.h1}>Add photos</h1>
        <p className={s.lead}>Five is enough. They appear in this order; drag to reorder.</p>
      </div>

      <div
        className={`${s.drop} ${dragOver ? s.dropActive : ""}`}
        onDragOver={(e) => {
          if (dragIndex !== null) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (dragIndex !== null) return;
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <strong>Drop photos here</strong>
        <span className="muted" style={{ fontSize: 13 }}>
          JPG, PNG, HEIC from your camera roll
        </span>
        <button className="btn" disabled={progress !== null} onClick={() => input.current?.click()}>
          Choose photos
        </button>
        <input ref={input} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </div>

      {progress !== null && <Progress value={progress} label={`Uploading… ${Math.round(progress * 100)}%`} />}
      {error && <p className="error">{error}</p>}

      <div className={s.spread}>
        <strong>
          {n} photo{n === 1 ? "" : "s"}
        </strong>
        <span className={n >= minPhotos ? "" : "muted"} style={{ fontSize: 14, color: n >= minPhotos ? "var(--ok)" : undefined }}>
          {n >= minPhotos ? `${minPhotos} minimum ✓` : `${minPhotos - n} more to go`}
        </span>
      </div>

      {n > 0 && (
        <ul className={s.grid}>
          {project.photos.map((photo, i) => (
            <li
              key={photo.id}
              className={`${s.tile} ${dragIndex === i ? s.tileDragging : ""} ${overIndex === i && dragIndex !== i ? s.tileOver : ""}`}
              draggable
              onDragStart={(e) => {
                setDragIndex(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIndex(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dragIndex !== null) move(dragIndex, i);
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${ASSET_BASE}/${photo.src}?w=320`} alt={`Photo ${i + 1}`} />
              <span className={s.tileIndex}>{i + 1}</span>
              {photo.pinnedTo !== undefined && <span className={s.pin}>📌</span>}
              <div className={s.tileActions}>
                <button className={s.iconBtn} onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move earlier">
                  ‹
                </button>
                <button className={s.iconBtn} onClick={() => update((p) => ({ ...p, photos: p.photos.filter((x) => x.id !== photo.id) }))} aria-label="Remove photo">
                  ✕
                </button>
                <button className={s.iconBtn} onClick={() => move(i, i + 1)} disabled={i === n - 1} aria-label="Move later">
                  ›
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={s.footer}>
        <button className="btn btn-ghost" onClick={() => go("song")}>
          ← Song
        </button>
        <button className="btn btn-primary" disabled={n === 0 || progress !== null} onClick={() => go("stage")} title={n < minPhotos ? `Add at least ${minPhotos} for the best result` : undefined}>
          {n > 0 && n < minPhotos ? "Continue anyway →" : "Next: pick a Stage →"}
        </button>
      </div>
    </section>
  );
}
