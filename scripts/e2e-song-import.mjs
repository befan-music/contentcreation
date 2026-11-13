#!/usr/bin/env node
/**
 * End-to-end check of song import: paste a YouTube link (or upload a file) and
 * time every stage until it's playable and fully analyzed.
 *
 *   node scripts/e2e-song-import.mjs <baseUrl> <youtubeUrl | audioFile> [--keep]
 *
 * Prints a timeline: download progress → song stored → preview (waveform,
 * playable) → beats/bars (partial) → complete; then checks the stored file is
 * universally playable (codec) and served with HTTP Range (seeking works).
 * The temporary project is deleted afterwards unless --keep is given.
 */
import fs from "node:fs";
import path from "node:path";

const [base, source] = process.argv.slice(2);
const keep = process.argv.includes("--keep");
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (method, url, body) => {
  const init = { method };
  if (body instanceof FormData) init.body = body;
  else if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  const res = await fetch(base + url, init);
  return { status: res.status, json: await res.json().catch(() => null), headers: res.headers };
};

const project = (await call("POST", "/api/projects")).json;
console.log(`${at()}  project ${project.id}`);
let song;
try {
  if (/^https?:/.test(source)) {
    const r = await call("POST", `/api/projects/${project.id}/song`, { url: source });
    if (r.status !== 200) throw new Error(`import refused: ${r.status} ${r.json?.error}`);
    let last = "";
    for (;;) {
      const j = (await call("GET", `/api/jobs/${r.json.importJob}`)).json;
      const line = `${j.message} (${Math.round(j.progress * 100)}%)`;
      if (line !== last) console.log(`${at()}  import: ${line}`), (last = line);
      if (j.status === "error") throw new Error(`import failed: ${j.error}`);
      if (j.status === "done") break;
      await sleep(300);
    }
  } else {
    const form = new FormData();
    form.append("file", new Blob([fs.readFileSync(source)]), path.basename(source));
    const r = await call("POST", `/api/projects/${project.id}/song`, form);
    if (r.status !== 200) throw new Error(`upload refused: ${r.status} ${r.json?.error}`);
  }
  song = (await call("GET", `/api/projects/${project.id}`)).json.song;
  console.log(`${at()}  song stored: "${song.name}" → ${song.src}`);

  // Playable right away?
  const head = await fetch(`${base}/api/files/${song.src}`, { headers: { Range: "bytes=0-1023" } });
  console.log(`${at()}  playback: HTTP ${head.status}, ${head.headers.get("content-type")}, range ${head.headers.get("content-range")}`);

  const seen = new Set();
  for (;;) {
    const a = (await call("GET", `/api/songs/${song.id}/analysis`)).json;
    if (a.job?.status === "error") throw new Error(`analysis failed: ${a.job.error}`);
    if (a.status !== "missing" && !seen.has(a.status)) {
      seen.add(a.status);
      const an = a.analysis;
      const detail =
        a.status === "preview"
          ? `waveform ready (${an.duration.toFixed(1)} s): the song can be seen and played`
          : `${an.tempo} bpm, ${an.downbeats.length} bars, sections: ${an.sections.map((s) => s.label).join(" ")}; clip15 ${JSON.stringify(an.suggestedClips["15"])}` +
            (a.status === "complete" ? `; ${an.notes.length} notes, ${an.drums.length} drum hits; engines ${JSON.stringify(an.engines)}` : "");
      console.log(`${at()}  analysis ${a.status}: ${detail}`);
    }
    if (a.status === "complete") break;
    await sleep(500);
  }
} finally {
  if (!keep) await call("DELETE", `/api/projects/${project.id}`);
}
console.log(`${at()}  done${keep ? ` (kept project ${project.id})` : " (temporary project deleted)"}`);
