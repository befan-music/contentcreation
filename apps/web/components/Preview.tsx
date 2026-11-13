"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { FPS, HEIGHT, WIDTH, clipDurationInFrames, frameToSongTime, resolveClip, type Analysis, type Project, type StageDef } from "@stages/project";
import { StagesVideo } from "@stages/stages";
import { ASSET_BASE } from "@/lib/client";
import styles from "./preview.module.css";

export type PreviewHandle = {
  toggle: () => void;
  /** current song time of the playhead */
  songTime: () => number;
  seekToSongTime: (t: number) => void;
};

type Props = { project: Project; analysis: Analysis; customStages: StageDef[] };

/**
 * Live 9:16 preview: the same Stage components as the final render, driven by
 * the same project JSON (roadmap: "What you see is what you get").
 */
export const Preview = forwardRef<PreviewHandle, Props>(function Preview({ project, analysis, customStages }, ref) {
  const player = useRef<PlayerRef>(null);
  const clip = resolveClip(project, analysis);
  const durationInFrames = clipDurationInFrames(clip);
  const inputProps = useMemo(() => ({ project, analysis, customStages, assetBase: ASSET_BASE }), [project, analysis, customStages]);

  useImperativeHandle(
    ref,
    () => ({
      toggle: () => player.current?.toggle(),
      songTime: () => frameToSongTime(player.current?.getCurrentFrame() ?? 0, clip),
      seekToSongTime: (t: number) => player.current?.seekTo(Math.max(0, Math.min(durationInFrames - 1, Math.round((t - clip.start) * FPS)))),
    }),
    [clip, durationInFrames],
  );

  return (
    <div className={styles.phone}>
      <Player
        ref={player}
        component={StagesVideo}
        inputProps={inputProps}
        durationInFrames={durationInFrames}
        compositionWidth={WIDTH}
        compositionHeight={HEIGHT}
        fps={FPS}
        // Open a moment in, where the Stage is already moving, not on an empty first frame.
        initialFrame={Math.min(durationInFrames - 1, Math.round(1.6 * FPS))}
        controls
        loop
        clickToPlay
        spaceKeyToPlayOrPause={false}
        doubleClickToFullscreen
        allowFullscreen
        showVolumeControls
        acknowledgeRemotionLicense
        style={{ width: "100%", aspectRatio: "9 / 16", borderRadius: 18, overflow: "hidden", background: "#000" }}
      />
    </div>
  );
});
