import { createSoundEngine, syncSoundButton, toggleMute } from "./soundEngine";
import { createCameraDirector } from "./cameraDirector";
import { detectDevice } from "./device";
import { elementById, type ExperienceContext } from "./experienceContext";
import { startFrameLoop } from "./frameLoop";
import { setUpKeyboardAndGamepad } from "./keyboardAndGamepad";
import { setUpMenuFeedback } from "./menuFeedback";
import { createLifecycle } from "./lifecycle";
import { createLoadingOverlay } from "./loadingOverlay";
import { setUpJoinForm } from "./screens/join";
import { setUpLobby } from "./screens/lobby";
import { createScreenNavigator } from "./screens/screenNavigator";
import { setUpTraining } from "./screens/training";
import { createWorld } from "./world/createWorld";

declare global {
  interface Window {
    /** Debug handle for inspecting the running experience from the browser console. */
    __aw?: object;
  }
}

export function startExperience() {
  const lifecycle = createLifecycle();
  const sound = createSoundEngine();
  const device = detectDevice();

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const context: ExperienceContext = {
    lifecycle,
    device,
    sound,
    world: null,
    room: null,
    screen: "title",
    hitStopSeconds: 0,
    showToast(message) {
      const toast = elementById("toast");
      toast.textContent = message;
      toast.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = lifecycle.after(() => toast.classList.remove("show"), 3000);
    },
  };

  syncSoundButton(sound);
  lifecycle.listen(elementById("sound"), "click", () => {
    toggleMute(sound);
    if (!sound.muted) sound.press();
  });
  const unlockSoundOnce = () => sound.unlock();
  lifecycle.listen(window, "pointerdown", unlockSoundOnce, { once: true });
  lifecycle.listen(window, "keydown", unlockSoundOnce, { once: true });

  const cameraDirector = createCameraDirector(context);
  const screenNavigator = createScreenNavigator(context, cameraDirector);
  const { seatPlayer, onRelayRoom } = setUpLobby(context, screenNavigator);
  setUpJoinForm(context, screenNavigator, seatPlayer);
  setUpTraining(context, screenNavigator, onRelayRoom);
  setUpMenuFeedback(context);
  const pollGamepad = setUpKeyboardAndGamepad(context, screenNavigator);
  const loadingOverlay = createLoadingOverlay(context);

  // Start on the next tick: React's development mode mounts twice, and the first mount is cancelled before this runs.
  lifecycle.after(() => {
    createWorld(elementById<HTMLCanvasElement>("stage"), {
      reducedMotion: device.prefersReducedMotion,
      qualityTier: device.qualityTier,
      onProgress: loadingOverlay.setProgress,
      openingView: cameraDirector.openingView(),
    })
      .then((world) => {
        if (!lifecycle.isRunning()) {
          world.dispose();
          return;
        }
        context.world = world;
        cameraDirector.prepareIntro(world);
        startFrameLoop(context, world, {
          cameraDirector,
          pollGamepad,
          onFirstFrame: loadingOverlay.reveal,
        });
      })
      .catch((error) => {
        // no WebGL: the menus still work over the painted background
        console.warn(
          "3D view unavailable; showing the menu without it.",
          error,
        );
        if (lifecycle.isRunning()) {
          loadingOverlay.setProgress(1, "Ready");
          loadingOverlay.reveal();
        }
      });
  }, 0);

  document.body.dataset.screen = "title";
  window.__aw = {
    go: screenNavigator.goTo,
    get screen() {
      return context.screen;
    },
    get room() {
      return context.room;
    },
    get world() {
      return context.world;
    },
  };

  return function stopExperience() {
    lifecycle.stop();
    sound.dispose();
    if (context.world) context.world.dispose();
    delete document.body.dataset.screen;
    delete window.__aw;
  };
}
