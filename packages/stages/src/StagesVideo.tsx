import React, { useMemo } from "react";
import { AbsoluteFill, Html5Audio, useCurrentFrame, useVideoConfig } from "remotion";
import type { VideoInput } from "@stages/project";
import { BeatFlashLook } from "./looks/BeatFlashLook";
import { PianoLook } from "./looks/PianoLook";
import { PhotoStageLook } from "./looks/PhotoStageLook";
import { MagicLook } from "./looks/MagicLook";
import { CutFlowLook } from "./looks/CutFlowLook";
import { assetUrl } from "./looks/PhotoFill";
import type { LookProps } from "./looks/types";
import { blockAt, buildTimeline } from "./timeline";

const COMPONENT_LOOKS: Record<string, React.FC<LookProps>> = {
  "beat-flash": BeatFlashLook,
  piano: PianoLook,
  magic: MagicLook,
  "cut-flow": CutFlowLook,
};

/**
 * Song time used to decide which hits have happened at a frame. The half-frame
 * offset makes every hit land on the frame NEAREST to it (the single rounding
 * rule from packages/project/src/timing.ts: Math.round((t - clip.start) * fps)).
 */
export function hitClockAt(frame: number, clipStart: number, fps: number): number {
  return clipStart + (frame + 0.5) / fps;
}

export const StagesVideo: React.FC<VideoInput & { muted?: boolean }> = ({ project, analysis, customStages, assetBase, muted }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const timeline = useMemo(() => buildTimeline({ project, analysis, customStages }), [project, analysis, customStages]);
  const { clip } = timeline;
  const t = hitClockAt(frame, clip.start, fps);
  const active = blockAt(timeline, t);

  let content: React.ReactNode = null;
  if (active) {
    const Look = active.stage.look.kind === "photo" ? PhotoStageLook : COMPONENT_LOOKS[active.stage.look.component] ?? BeatFlashLook;
    content = (
      <Look
        t={t}
        block={active.block}
        stage={active.stage}
        params={active.params}
        events={active.events}
        photos={project.photos}
        analysis={analysis}
        assetBase={assetBase}
        seed={`${project.seed}:${active.block.id}`}
        width={width}
        height={height}
      />
    );
  }

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {content}
      {project.export.watermark && <Watermark />}
      {project.song && !muted && (
        <Html5Audio src={assetUrl(assetBase, project.song.src)} trimBefore={Math.round(clip.start * fps)} durationInFrames={durationInFrames} />
      )}
    </AbsoluteFill>
  );
};

const Watermark: React.FC = () => (
  <div
    style={{
      // Top right: clear of TikTok/Reels captions (bottom) and action buttons (right, middle).
      position: "absolute",
      right: 48,
      top: 210,
      padding: "10px 18px",
      borderRadius: 999,
      background: "rgba(0,0,0,0.45)",
      color: "#fff",
      fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      fontSize: 30,
      fontWeight: 700,
      letterSpacing: 0.3,
    }}
  >
    made with <span style={{ color: "#c6ff3d" }}>Stages</span>
  </div>
);
