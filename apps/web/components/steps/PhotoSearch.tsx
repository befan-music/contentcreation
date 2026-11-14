"use client";

import { useState } from "react";
import type { PhotoCredit, Project } from "@stages/project";
import { api, track } from "@/lib/client";
import s from "./steps.module.css";

type Result = { id: string; thumb: string; width: number; height: number; credit: PhotoCredit };

const COUNTS = [5, 10, 15, 20, 30];

/**
 * "Find photos online": type a search (e.g. "Berkeley"), pick how many photos,
 * and add openly licensed photos from Openverse / Wikimedia Commons.
 */
export function PhotoSearch({ projectId, room, onAdded }: { projectId: string; room: number; onAdded: (p: Project) => void }) {
  const [q, setQ] = useState("");
  const [count, setCount] = useState(10);
  const [results, setResults] = useState<Result[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState<"search" | "more" | "add" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState("");

  async function search(more = false) {
    const query = more ? lastQuery : q.trim();
    if (!query) return;
    setBusy(more ? "more" : "search");
    setError(null);
    const nextPage = more ? page + 1 : 1;
    try {
      // Ask for a few extra so a swap is one click away.
      const want = Math.min(40, count + Math.ceil(count / 2));
      const res = await api<{ results: Result[]; source: string }>(`/api/images/search?q=${encodeURIComponent(query)}&n=${want}&page=${nextPage}`);
      setSource(res.source);
      setPage(nextPage);
      setLastQuery(query);
      if (more) {
        setResults((prev) => {
          const seen = new Set((prev ?? []).map((r) => r.id));
          return [...(prev ?? []), ...res.results.filter((r) => !seen.has(r.id))];
        });
      } else {
        setResults(res.results);
        setPicked(new Set(res.results.slice(0, Math.min(count, room)).map((r) => r.id)));
        track("photo_search", { projectId, count, results: res.results.length });
      }
      if (!res.results.length && !more) setError(`No photos found for “${query}”. Try other words.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < room) next.add(id);
      return next;
    });
  }

  async function add() {
    if (!results) return;
    const ids = results.filter((r) => picked.has(r.id)).map((r) => r.id);
    if (!ids.length) return;
    setBusy("add");
    setError(null);
    try {
      const res = await api<{ project: Project; added: number; failed: string[] }>(`/api/projects/${projectId}/photos/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      onAdded(res.project);
      track("photos_added", { projectId, count: res.project.photos.length, from: "search", added: res.added });
      // Clear what was added so the next search starts fresh.
      setResults((prev) => prev?.filter((r) => !picked.has(r.id)) ?? null);
      setPicked(new Set());
      if (res.failed.length) setError(`${res.failed.length} photo${res.failed.length === 1 ? "" : "s"} couldn't be downloaded. ${res.failed.some((f) => /^(ov|wc)_/.test(f)) ? "Search again and retry." : ""}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const n = picked.size;

  return (
    <div className={`card ${s.panel}`}>
      <div>
        <strong>Find photos online</strong>
        <p className="muted" style={{ fontSize: 13, margin: "4px 0 0" }}>
          Free, openly licensed photos from Openverse and Wikimedia Commons. Try a place, like “Berkeley”.
        </p>
      </div>

      <form
        className={s.searchRow}
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input className={s.searchInput} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search photos, e.g. Berkeley" aria-label="Search photos" enterKeyHint="search" />
        <label className={s.countPick}>
          <span className="muted">How many</span>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many photos">
            {COUNTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit" disabled={!q.trim() || busy !== null}>
          {busy === "search" ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {results && results.length > 0 && (
        <>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Tap a photo to add or remove it. {n} of {results.length} picked{room < count ? ` (room for ${room} more)` : ""}.
          </p>
          <ul className={s.grid}>
            {results.map((r) => {
              const on = picked.has(r.id);
              return (
                <li key={r.id} className={`${s.tile} ${s.result} ${on ? s.resultOn : ""}`}>
                  <button type="button" className={s.resultBtn} onClick={() => toggle(r.id)} aria-pressed={on} aria-label={`${on ? "Remove" : "Pick"} ${r.credit.title}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.thumb} alt={r.credit.title} loading="lazy" referrerPolicy="no-referrer" />
                    {on && <span className={s.check}>✓</span>}
                  </button>
                  <a className={s.creditTag} href={r.credit.sourceUrl} target="_blank" rel="noreferrer" title={`${r.credit.title} by ${r.credit.creator}`}>
                    {r.credit.license} · {r.credit.creator}
                  </a>
                </li>
              );
            })}
          </ul>
          <div className={s.spread}>
            <button className="btn btn-ghost" type="button" onClick={() => search(true)} disabled={busy !== null}>
              {busy === "more" ? "Loading…" : "Show more"}
            </button>
            <button className="btn btn-primary" type="button" onClick={add} disabled={!n || busy !== null}>
              {busy === "add" ? "Adding…" : `Add ${n} photo${n === 1 ? "" : "s"}`}
            </button>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            From {source}. Most need a credit: the Export step gives you a credit list to paste into your caption.
          </p>
        </>
      )}
    </div>
  );
}
