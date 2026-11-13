/**
 * The Stages data model. See roadmap.md, "Data model".
 *
 * Convention: every time value is in SONG seconds (absolute position in the
 * uploaded song), never clip-relative. The clip is just a window over the song,
 * so moving the clip never invalidates beats, sections, blocks, pins or hits.
 */

// ---------------------------------------------------------------------------
// Song analysis (produced by services/analysis)
// ---------------------------------------------------------------------------

export type SectionLabel = "intro" | "verse" | "chorus" | "drop" | "bridge" | "outro";

export type Section = { start: number; end: number; label: SectionLabel };

export type Note = {
  start: number;
  end: number;
  /** MIDI pitch, 21 (A0) .. 108 (C8) */
  pitch: number;
  /** 0..1 */
  velocity: number;
  stem: "melody" | "bass";
};

export type DrumType = "kick" | "snare" | "hat";
export type DrumHit = { time: number; type: DrumType; strength: number };

export type Clip = { start: number; end: number };

export type Analysis = {
  version: 1;
  /** sha256 of the uploaded audio file */
  audioHash: string;
  /**
   * "preview":  only duration, waveform and energy (seconds after upload; the song can be played and seen)
   * "partial":  beats/bars/sections/clips are ready; drums and notes may still be empty
   * "complete": everything
   */
  status: "preview" | "partial" | "complete";
  duration: number;
  tempo: number;
  beats: number[];
  /** bar starts */
  downbeats: number[];
  /** beats per bar the engine settled on */
  meter: number;
  sections: Section[];
  notes: Note[];
  drums: DrumHit[];
  /** loudness curve, 0..1, one value per `hop` seconds */
  energy: { hop: number; values: number[] };
  /** peak amplitude, 0..1, one value per `hop` seconds (for drawing the waveform) */
  waveform: { hop: number; peaks: number[] };
  /** best clip per length in seconds, e.g. { "15": {start,end} } */
  suggestedClips: Record<string, Clip>;
  /** which engine produced each part; useful when judging quality */
  engines: Record<string, string>;
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

export type ParamDef = (
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; default: string }
  | { key: string; label: string; type: "range"; min: number; max: number; step: number; default: number }
  | { key: string; label: string; type: "color"; default: string }
  | { key: string; label: string; type: "toggle"; default: boolean }
  | { key: string; label: string; type: "text"; default: string; placeholder?: string }
) & {
  /** stored with the block but not shown as a knob (e.g. Magic's variation counter) */
  hidden?: boolean;
};

export type ParamValues = Record<string, string | number | boolean>;

/** A window on a photo-based Stage. Polygon points are normalized 0..1 over the object photo. */
export type StageWindow = { id: string; polygon: [number, number][]; order: number };

export type StageLook =
  | { kind: "component"; component: string }
  | { kind: "photo"; imageSrc: string; width: number; height: number; windows: StageWindow[] };

export type StageDef = {
  id: string;
  name: string;
  description: string;
  source: "builtin" | "custom" | "sdk";
  look: StageLook;
  /** behavior id, see packages/stages/src/behaviors */
  behavior: string;
  params: ParamDef[];
};

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export type Photo = {
  id: string;
  /** path relative to the asset base, e.g. "photos/abc.jpg" */
  src: string;
  /** 720px version for small windows/cards (much cheaper to draw every frame) */
  srcSmall?: string;
  width: number;
  height: number;
  /** focal point, normalized 0..1 */
  focal: { x: number; y: number };
  /** song time of the hit this photo is pinned to */
  pinnedTo?: number;
  /** AI-styled versions (Magic Stage), keyed by styleKey(prompt, variation). Written by the server only. */
  styles?: Record<string, PhotoStyle>;
};

export type PhotoStyle = {
  src: string;
  srcSmall?: string;
  prompt: string;
  /** e.g. "higgsfield:xai/grok-imagine-image-2.0" or "mock" */
  model: string;
  createdAt: string;
};

export type StageBlock = {
  id: string;
  start: number;
  end: number;
  stageId: string;
  params: ParamValues;
};

export type HitEdits = {
  /** song times of hits the user muted (matched within HIT_MATCH_TOLERANCE) */
  muted: number[];
  added: { time: number; type: "beat" | "downbeat" }[];
};

export type Song = {
  /** = audio hash */
  id: string;
  name: string;
  /** path relative to the asset base, e.g. "songs/<hash>.mp3" */
  src: string;
  duration?: number;
};

export type Project = {
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  song: Song | null;
  clip: Clip | null;
  /** clip length the user asked for (seconds) */
  clipLength: number;
  photos: Photo[];
  /** the Stage chosen in the picker; used for the whole clip when `blocks` is empty */
  stageId: string;
  /** params for `stageId` when `blocks` is empty */
  stageParams: ParamValues;
  /** explicit Stage blocks (Remix / Studio). Empty = one block of `stageId` over the clip. */
  blocks: StageBlock[];
  /** user-edited sections; null = use the analysis */
  sections: Section[] | null;
  hits: HitEdits;
  /** seed for every "random" choice, so a video is reproducible; "shuffle" changes it */
  seed: number;
  export: { watermark: boolean };
};

/** Everything a Stage composition needs to draw a video. Passed to the Remotion Player and renderer. */
export type VideoInput = {
  project: Project;
  analysis: Analysis;
  /** Stage definitions referenced by the project (built-ins are merged in by the renderer). */
  customStages: StageDef[];
  /** prefix for every asset src, e.g. "/api/files" in the browser or "http://127.0.0.1:4567" when rendering */
  assetBase: string;
};
