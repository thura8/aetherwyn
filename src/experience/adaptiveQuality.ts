import type { World } from "./world/createWorld";

export function createAdaptiveQuality() {
  let averageFrameSeconds = 1 / 60;
  let slowSeconds = 0;
  let fastSeconds = 0;

  return function adaptQuality(world: World, deltaSeconds: number) {
    averageFrameSeconds += (deltaSeconds - averageFrameSeconds) * 0.05;
    if (averageFrameSeconds > 1 / 42) {
      slowSeconds += deltaSeconds;
      fastSeconds = 0;
    } else if (averageFrameSeconds < 1 / 57) {
      fastSeconds += deltaSeconds;
      slowSeconds = 0;
    } else {
      slowSeconds = fastSeconds = 0;
    }
    if (slowSeconds > 2) {
      slowSeconds = 0;
      const pixelRatio = world.pixelRatio;
      if (world.isAmbientOcclusionOn)
        world.setQuality({ ambientOcclusion: false });
      else if (pixelRatio > 0.8)
        world.setQuality({
          pixelRatio: Math.max(0.75, +(pixelRatio - 0.25).toFixed(2)),
        });
      else world.setQuality({ shadows: false });
    } else if (fastSeconds > 6) {
      fastSeconds = 0;
      const pixelRatio = world.pixelRatio;
      const target = Math.min(
        world.maxPixelRatio,
        window.devicePixelRatio || 1,
      );
      if (pixelRatio < target)
        world.setQuality({
          pixelRatio: Math.min(target, +(pixelRatio + 0.25).toFixed(2)),
        });
    }
  };
}
