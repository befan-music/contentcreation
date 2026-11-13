import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { FPS, HEIGHT, WIDTH, clipDurationInFrames, resolveClip, type VideoInput } from "@stages/project";
import { StagesVideo } from "../StagesVideo";
import { demoInput } from "../demo";

type Props = VideoInput & { muted?: boolean };

const calculateMetadata: CalculateMetadataFunction<Props> = ({ props }) => ({
  durationInFrames: clipDurationInFrames(resolveClip(props.project, props.analysis)),
});

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Stages"
      component={StagesVideo}
      width={WIDTH}
      height={HEIGHT}
      fps={FPS}
      durationInFrames={15 * FPS}
      defaultProps={demoInput("beat-flash") as Props}
      calculateMetadata={calculateMetadata}
    />
    <Composition
      id="PianoDemo"
      component={StagesVideo}
      width={WIDTH}
      height={HEIGHT}
      fps={FPS}
      durationInFrames={15 * FPS}
      defaultProps={demoInput("piano") as Props}
      calculateMetadata={calculateMetadata}
    />
  </>
);
