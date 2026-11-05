import type { CameraDirector } from "../cameraDirector";
import { elementById, type ExperienceContext, type ScreenName } from "../experienceContext";

const HIDE_OLD_SCREEN_MS = 420;

export function createScreenNavigator(
  context: ExperienceContext,
  cameraDirector: CameraDirector,
) {
  const { lifecycle, device, sound } = context;
  const screens: Record<ScreenName, HTMLElement> = {
    title: elementById("scr-title"),
    lobby: elementById("scr-lobby"),
    join: elementById("scr-join"),
    training: elementById("scr-training"),
  };
  const onEnter: Partial<Record<ScreenName, () => void>> = {
    title() {
      if (context.world) {
        context.world.setCirclesLit([1, 1, 1, 1]);
        context.world.state.orbTarget = 1;
      }
    },
  };
  const onLeave: Partial<Record<ScreenName, () => void>> = {};
  let isTransitioning = false;

  function goTo(name: ScreenName) {
    if (isTransitioning || name === context.screen || !screens[name]) return;
    isTransitioning = true;
    const from = context.screen;
    if (from === "title") screens.title.classList.remove("play");
    cameraDirector.skipIntroIfRunning();
    onLeave[from]?.();
    sound.whoosh();
    screens[from].classList.add("out");
    const veil = elementById("veil");
    veil.classList.add("on");
    lifecycle.after(() => {
      screens[from].hidden = true;
      veil.classList.remove("on");
    }, HIDE_OLD_SCREEN_MS);
    if (context.world) cameraDirector.beginMoveToCurrentScreen(context.world);
    context.screen = name;
    document.body.dataset.screen = name;
    elementById("back").hidden = name === "title";
    lifecycle.after(
      () => {
        const screen = screens[name];
        screen.hidden = false;
        void screen.offsetWidth;
        screen.classList.remove("out");
        onEnter[name]?.();
        const firstControl = screen.querySelector<HTMLElement>(
          "input, .btn:not(:disabled)",
        );
        if (firstControl && !device.isCoarsePointer)
          firstControl.focus({ preventScroll: true });
        isTransitioning = false;
      },
      device.prefersReducedMotion ? 200 : 900,
    );
  }

  const backTarget = (): ScreenName =>
    (context.screen === "training" || context.screen === "join") && context.room
      ? "lobby"
      : "title";

  function goBack() {
    sound.back();
    goTo(backTarget());
  }

  lifecycle.listen(elementById("host"), "click", () => goTo("lobby"));
  lifecycle.listen(elementById("join-here"), "click", () => goTo("join"));
  lifecycle.listen(elementById("train"), "click", () => goTo("training"));
  lifecycle.listen(elementById("back"), "click", goBack);

  return { screens, onEnter, onLeave, goTo, goBack };
}

export type ScreenNavigator = ReturnType<typeof createScreenNavigator>;
