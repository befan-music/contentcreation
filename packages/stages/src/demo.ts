import { createProject, type Analysis, type Note, type VideoInput } from "@stages/project";

/**
 * A synthetic 120 bpm analysis with notes and sections. Used as Remotion
 * Studio's default props and for tests, so Stages can be previewed without a song.
 */
export function demoAnalysis(bpm = 120, bars = 16): Analysis {
  const beat = 60 / bpm;
  const beats: number[] = [];
  const downbeats: number[] = [];
  const notes: Note[] = [];
  const scale = [57, 60, 62, 64, 67, 69, 72, 74, 76];
  for (let b = 0; b < bars; b++) {
    const t0 = b * 4 * beat;
    downbeats.push(round(t0));
    notes.push({ start: round(t0), end: round(t0 + 3.6 * beat), pitch: 45 + [0, 7, 9, 5][b % 4], velocity: 0.8, stem: "bass" });
    for (let k = 0; k < 4; k++) {
      const t = t0 + k * beat;
      beats.push(round(t));
      const pitch = scale[(b * 3 + k * 2) % scale.length];
      notes.push({ start: round(t), end: round(t + beat * 0.8), pitch, velocity: 0.7, stem: "melody" });
      if (k % 2 === 1) notes.push({ start: round(t + beat / 2), end: round(t + beat * 0.9), pitch: pitch + 4, velocity: 0.5, stem: "melody" });
    }
  }
  const duration = round(bars * 4 * beat);
  const energyValues = Array.from({ length: Math.ceil(duration / 0.1) }, (_, i) => 0.6 + 0.3 * Math.sin(i / 20));
  return {
    version: 1,
    audioHash: "demo",
    status: "complete",
    duration,
    tempo: bpm,
    beats,
    downbeats,
    meter: 4,
    sections: [
      { start: 0, end: round(duration / 2), label: "verse" },
      { start: round(duration / 2), end: duration, label: "chorus" },
    ],
    notes,
    drums: beats.map((t, i) => ({ time: t, type: i % 2 === 0 ? "kick" : "snare", strength: 0.9 })),
    energy: { hop: 0.1, values: energyValues },
    waveform: { hop: 0.02, peaks: Array.from({ length: Math.ceil(duration / 0.02) }, (_, i) => 0.3 + 0.6 * Math.abs(Math.sin(i / 7))) },
    suggestedClips: { "15": { start: 0, end: 15 }, "30": { start: 0, end: 30 } },
    engines: { beats: "demo" },
    warnings: [],
  };
}

function round(x: number) {
  return Math.round(x * 1000) / 1000;
}

export function demoInput(stageId = "beat-flash"): VideoInput {
  const project = createProject("demo", new Date(0));
  project.seed = 7;
  project.stageId = stageId;
  project.clip = { start: 0, end: 15 };
  return { project, analysis: demoAnalysis(), customStages: [], assetBase: "" };
}
