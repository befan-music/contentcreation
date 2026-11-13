#!/usr/bin/env node
/**
 * Stages command line.
 *
 *   Make a video from a song (file or YouTube link) and a folder of photos:
 *     node services/render/src/cli.mjs --song <file|youtube-url> --photos <dir> [--stage beat-flash|piano|auto]
 *                                      [--clip 15|30|60] [--out <dir>] [--no-watermark] [--fast]
 *
 *   Render a saved job (used by the web app's job runner):
 *     node services/render/src/cli.mjs job <job.json>
 *       job.json = { input: {project, analysis, customStages}, outBase }
 *
 * Machine-readable output: PROGRESS <0..1> <message> | RESULT <json> | ERROR <message>
 */
import fs from "node:fs";
import path from "node:path";
import { analyzeSong } from "./python.mjs";
import { processPhoto } from "./photos.mjs";
import { renderProject } from "./render.mjs";
import { analysisPath, importYouTube, readAnalysis, storeSong } from "./songs.mjs";
import { dataDir as getDataDir } from "./paths.mjs";

const say = (line) => process.stdout.write(line + "\n");
const progress = (p, msg) => say(`PROGRESS ${p.toFixed(3)} ${msg}`);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else out[key] = argv[++i];
    } else out._.push(a);
  }
  return out;
}

async function runJob(file) {
  const job = JSON.parse(fs.readFileSync(file, "utf8"));
  const result = await renderProject({ input: job.input, outBase: job.outBase, assetsDir: job.assetsDir, onProgress: progress, onLog: (m) => say(`LOG ${m}`) });
  say(`RESULT ${JSON.stringify(result)}`);
}

async function makeVideo(args) {
  const dataDir = getDataDir();
  if (!args.song || !args.photos) {
    say("Usage: cli.mjs --song <file|youtube-url> --photos <dir> [--stage beat-flash|piano|auto] [--clip 15] [--out dir]");
    process.exit(2);
  }

  // 1. Song
  progress(0, "Importing song");
  const stored = /^https?:\/\//.test(args.song) ? await importYouTube(args.song, dataDir) : storeSong(path.resolve(args.song), dataDir);
  const { song } = stored;
  say(`LOG Song: ${song.name} (${song.id.slice(0, 10)})`);

  // 2. Analysis (cached by hash)
  let analysis = readAnalysis(dataDir, song.id);
  const wantFull = !args.fast;
  if (!analysis || (wantFull && analysis.status !== "complete")) {
    await analyzeSong(stored.path, analysisPath(dataDir, song.id), {
      hash: song.id,
      fast: !wantFull,
      onProgress: (p, m) => progress(0.02 + 0.4 * p, `Analysis: ${m}`),
    });
    analysis = readAnalysis(dataDir, song.id);
  }
  say(`LOG ${analysis.tempo} bpm, ${analysis.downbeats.length} bars, sections: ${analysis.sections.map((s) => s.label).join(" ")}`);

  // 3. Photos
  const dir = path.resolve(args.photos);
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(f))
    .sort();
  if (files.length === 0) throw new Error(`No photos in ${dir}`);
  const photos = [];
  for (const [i, f] of files.entries()) {
    progress(0.42 + 0.08 * (i / files.length), `Photo ${i + 1}/${files.length}`);
    photos.push(await processPhoto(fs.readFileSync(path.join(dir, f)), dataDir));
  }

  // 4. Project
  const clipLength = Number(args.clip || 15);
  const clip = analysis.suggestedClips[String(clipLength)] ?? { start: analysis.downbeats[0] ?? 0, end: Math.min(analysis.duration, (analysis.downbeats[0] ?? 0) + clipLength) };
  const now = new Date().toISOString();
  const stage = args.stage || "beat-flash";
  let blocks = [];
  if (stage === "auto") {
    const { autoBlocks } = await importStages();
    blocks = autoBlocks(analysis, clip, analysis.sections);
  }
  const project = {
    version: 1,
    id: `cli-${Date.now()}`,
    name: song.name,
    createdAt: now,
    updatedAt: now,
    song,
    clip,
    clipLength,
    photos,
    stageId: stage === "auto" ? "beat-flash" : stage,
    stageParams: {},
    blocks,
    sections: null,
    hits: { muted: [], added: [] },
    seed: Number(args.seed ?? 7),
    export: { watermark: !args["no-watermark"] },
  };

  // 5. Render
  const outDir = path.resolve(args.out || path.join(dataDir, "renders", "cli"));
  const slug = song.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 40) || "video";
  const outBase = path.join(outDir, `${slug}-${stage}-${clipLength}s`);
  const result = await renderProject({
    input: { project, analysis, customStages: [] },
    outBase,
    onProgress: (p, m) => progress(0.5 + 0.5 * p, m),
    onLog: (m) => say(`LOG ${m}`),
  });
  say(`LOG Clip ${clip.start.toFixed(2)}s–${clip.end.toFixed(2)}s of the song. Start the sound at ${fmt(clip.start)} when posting.`);
  say(`RESULT ${JSON.stringify({ ...result, clip, song: song.name })}`);
}

/** The Stage engine is TypeScript; load it through tsx when the CLI needs auto blocks. */
async function importStages() {
  const { tsImport } = await import("tsx/esm/api");
  return tsImport("@stages/stages/core", import.meta.url);
}

function fmt(s) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

const args = parseArgs(process.argv.slice(2));
try {
  if (args._[0] === "job") await runJob(args._[1]);
  else await makeVideo(args);
} catch (e) {
  say(`ERROR ${e?.message ?? e}`);
  process.exit(1);
}
