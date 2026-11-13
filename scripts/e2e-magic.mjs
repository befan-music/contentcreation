#!/usr/bin/env node
/**
 * End-to-end check of the Magic Stage through the web API:
 * project → song → photos → Magic "minecraft" → render is blocked →
 * generate → every photo styled → render succeeds.
 *
 *   node scripts/e2e-magic.mjs <baseUrl> <songFile> <photoDir> [style]
 *
 * Run the app with STAGES_MAGIC_PROVIDER=mock to test without credits.
 */
import fs from "node:fs";
import path from "node:path";

const [base, songFile, photoDir, style = "minecraft"] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, url, body) {
  const init = { method };
  if (body instanceof FormData) init.body = body;
  else if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  const res = await fetch(base + url, init);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}
async function waitJob(id, label) {
  for (;;) {
    const { json } = await call("GET", `/api/jobs/${id}`);
    if (json.status === "done" || json.status === "error") return json;
    process.stdout.write(`\r  ${label}: ${json.message} ${Math.round(json.progress * 100)}%      `);
    await sleep(1000);
  }
}
const step = (s) => console.log(`\n• ${s}`);

const config = (await call("GET", "/api/magic")).json;
step(`Magic provider: ${config.provider} (${config.model})`);
if (!config.configured) throw new Error("Magic isn't configured on this server.");

const project = (await call("POST", "/api/projects")).json;
step(`project ${project.id}`);

const song = new FormData();
song.append("file", new Blob([fs.readFileSync(songFile)]), path.basename(songFile));
const s = await call("POST", `/api/projects/${project.id}/song`, song);
step(`song: ${s.json.project.song.name}`);
const hash = s.json.project.song.id;
for (;;) {
  const a = (await call("GET", `/api/songs/${hash}/analysis`)).json;
  if (a.status === "complete") break;
  await sleep(1000);
}

const photos = new FormData();
const files = fs.readdirSync(photoDir).filter((f) => /\.(jpe?g|png)$/i.test(f)).slice(0, 6);
for (const f of files) photos.append("file", new Blob([fs.readFileSync(path.join(photoDir, f))], { type: "image/jpeg" }), f);
const ph = await call("POST", `/api/projects/${project.id}/photos`, photos);
step(`photos: ${ph.json.project.photos.length}`);

const p = ph.json.project;
const put = await call("PUT", `/api/projects/${project.id}`, { ...p, stageId: "magic", stageParams: { prompt: style, variation: 0 }, blocks: [] });
step(`stage: ${put.json.stageId} "${put.json.stageParams.prompt}"`);

const blocked = await call("POST", `/api/projects/${project.id}/render`);
step(`render before generating → ${blocked.status} ${blocked.json.error ?? ""}`);
if (blocked.status !== 409) throw new Error("Render should be blocked until Magic has styled every photo");

const gen = await call("POST", `/api/projects/${project.id}/magic`, { prompt: style, variation: 0 });
step(`generate → ${gen.status}, ${gen.json.total} photos, key ${gen.json.key}`);
const t0 = Date.now();
const job = await waitJob(gen.json.magicJob, "magic");
step(`magic job ${job.status} in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${JSON.stringify(job.result ?? job.error)}`);

const after = (await call("GET", `/api/projects/${project.id}`)).json;
const styled = after.photos.filter((x) => x.styles?.[gen.json.key]).length;
step(`styled ${styled}/${after.photos.length}; model ${after.photos[0].styles?.[gen.json.key]?.model}`);

const r = await call("POST", `/api/projects/${project.id}/render`);
step(`render → ${r.status}`);
const rj = await waitJob(r.json.renderJob, "render");
console.log(`\n${JSON.stringify({ project: project.id, render: rj.status, result: rj.result, error: rj.error })}`);
