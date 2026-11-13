import { effectiveBlocks, resolveClip, type Clip, type ParamValues, type StageBlock, type StageDef, type VideoInput } from "@stages/project";
import { BEHAVIORS, assignPhotos, beatFlash, type WindowEvent } from "./behaviors";
import { findStage, withDefaults } from "./registry";

export type BlockTimeline = {
  block: StageBlock;
  stage: StageDef;
  params: ParamValues;
  events: WindowEvent[];
  /** the chosen trigger had no data (e.g. notes still analyzing), so beats were used */
  fellBack: boolean;
};

export type Timeline = { clip: Clip; blocks: BlockTimeline[] };

/**
 * Project + analysis -> every window event of the video. Pure and deterministic:
 * the same input always gives the same video (roadmap: "Stages are pure functions of time").
 */
export function buildTimeline(input: Pick<VideoInput, "project" | "analysis" | "customStages">): Timeline {
  const { project, analysis, customStages } = input;
  const clip = resolveClip(project, analysis);
  let photoCursor = 0;
  const blocks = effectiveBlocks(project, clip).map((block): BlockTimeline => {
    const stage = findStage(block.stageId, customStages);
    const params = withDefaults(stage, block.params);
    const behavior = BEHAVIORS[stage.behavior] ?? beatFlash;
    const windowCount = stage.look.kind === "photo" ? stage.look.windows.length : 0;
    const { events, fellBack } = behavior.generate({
      analysis,
      edits: project.hits,
      block,
      params,
      windowCount,
      seed: `${project.seed}:${block.id}`,
    });
    const withPhotos = assignPhotos(events, project.photos, photoCursor);
    photoCursor += withPhotos.filter((e) => e.showPhoto).length;
    return { block, stage, params, events: withPhotos, fellBack };
  });
  return { clip, blocks };
}

export function blockAt(timeline: Timeline, t: number): BlockTimeline | undefined {
  const { blocks } = timeline;
  return blocks.find((b) => t >= b.block.start && t < b.block.end) ?? (t < (blocks[0]?.block.start ?? 0) ? blocks[0] : blocks[blocks.length - 1]);
}
