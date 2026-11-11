import { createAdaptiveQuality } from "./adaptiveQuality";
import type { CameraDirector } from "./cameraDirector";
import type { ExperienceContext } from "./experienceContext";
import type { World } from "./world/createWorld";

const MAX_FRAME_SECONDS = 0.05;
const HIT_STOP_TIME_SCALE = 0.15;

interface FrameLoopParts {
  cameraDirector: CameraDirector;
  pollGamepad: (now: number) => void;
  onFirstFrame: () => void;
}

export function startFrameLoop(
  context: ExperienceContext,
  world: World,
  { cameraDirector, pollGamepad, onFirstFrame }: FrameLoopParts,
) {
  const { lifecycle, sound } = context;
  const adaptQuality = createAdaptiveQuality();
  let lastFrameAt = performance.now();
  let hasShownFirstFrame = false;

  const renderFrame = () => {
    const now = performance.now();
    let delta = Math.min((now - lastFrameAt) / 1000, MAX_FRAME_SECONDS);
    lastFrameAt = now;
    adaptQuality(world, delta);
    if (context.hitStopSeconds > 0) {
      context.hitStopSeconds -= delta;
      delta *= HIT_STOP_TIME_SCALE;
    }
    cameraDirector.easeMouse();
    world.update(delta);
    const time = world.state.time;
    cameraDirector.updateIntroIgnition(world, time);
    cameraDirector.updateCamera(world, time);
    pollGamepad(now);
    world.render();
    // the loading screen fades only once the first real frame is on screen
    if (!hasShownFirstFrame) {
      hasShownFirstFrame = true;
      onFirstFrame();
    }
  };

  world.renderer.setAnimationLoop(renderFrame);
  lifecycle.listen(document, "visibilitychange", () => {
    if (document.hidden) {
      world.renderer.setAnimationLoop(null);
      sound.suspend();
    } else {
      lastFrameAt = performance.now();
      world.renderer.setAnimationLoop(renderFrame);
      sound.resume();
    }
  });
}
