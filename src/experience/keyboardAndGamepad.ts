import { syncSoundButton } from "./soundEngine";
import type { ExperienceContext } from "./experienceContext";
import type { ScreenNavigator } from "./screens/screenNavigator";
import type { TrainingScreen } from "./screens/training";

const RETICLE_KEY_STEP = 28;
const RETICLE_STICK_SPEED = 14;
const STICK_DEADZONE = 0.15;
const STICK_MENU_THRESHOLD = 0.6;
const MENU_REPEAT_MS = 220;
// Standard gamepad layout
const BUTTON_CONFIRM = 0;
const BUTTON_BACK = 1;
const BUTTON_RIGHT_TRIGGER = 7;
const BUTTON_DPAD_UP = 12;
const BUTTON_DPAD_DOWN = 13;

const isTypingInInput = () => document.activeElement?.tagName === "INPUT";

export function setUpKeyboardAndGamepad(
  context: ExperienceContext,
  screenNavigator: ScreenNavigator,
  training: TrainingScreen,
) {
  const { lifecycle, sound } = context;
  const isAiming = () => context.screen === "training" && training.round.active;

  function focusableControls() {
    const screen = screenNavigator.screens[context.screen];
    return screen
      ? [
          ...screen.querySelectorAll<HTMLElement>(
            ".btn:not(:disabled), input, .x",
          ),
        ].filter((control) => control.offsetParent !== null)
      : [];
  }

  function moveFocus(direction: number) {
    const controls = focusableControls();
    if (!controls.length) return;
    const current = controls.indexOf(document.activeElement as HTMLElement);
    controls[(current + direction + controls.length) % controls.length].focus();
  }

  lifecycle.listen<KeyboardEvent>(window, "keydown", (event) => {
    const { key } = event;
    if (key === "m" || key === "M") {
      if (isTypingInInput()) return;
      sound.unlock();
      sound.setMuted(!sound.muted);
      syncSoundButton(sound);
      return;
    }
    if (key === "Escape") {
      if (context.screen !== "title") screenNavigator.goBack();
      return;
    }
    if (isAiming()) {
      const { aim } = training.round;
      if (key === " " || key === "Enter") {
        event.preventDefault();
        training.cast();
      } else if (key === "ArrowLeft")
        training.moveReticle(aim.x - RETICLE_KEY_STEP, aim.y);
      else if (key === "ArrowRight")
        training.moveReticle(aim.x + RETICLE_KEY_STEP, aim.y);
      else if (key === "ArrowUp")
        training.moveReticle(aim.x, aim.y - RETICLE_KEY_STEP);
      else if (key === "ArrowDown")
        training.moveReticle(aim.x, aim.y + RETICLE_KEY_STEP);
      return;
    }
    if (isTypingInInput() && (key === "ArrowLeft" || key === "ArrowRight"))
      return;
    if (key === "ArrowDown" || key === "ArrowRight") {
      event.preventDefault();
      moveFocus(1);
    }
    if (key === "ArrowUp" || key === "ArrowLeft") {
      event.preventDefault();
      moveFocus(-1);
    }
  });

  const wasPressed: Record<number, boolean> = {};
  let nextMenuRepeatAt = 0;

  return function pollGamepad(now: number) {
    const gamepad = navigator.getGamepads
      ? [...navigator.getGamepads()].find(Boolean)
      : null;
    if (!gamepad) return;
    const isDown = (button: number) => !!gamepad.buttons[button]?.pressed;
    const justPressed = (button: number) => {
      const pressed = isDown(button);
      const was = wasPressed[button];
      wasPressed[button] = pressed;
      return pressed && !was;
    };
    const stickX = gamepad.axes[0] || 0;
    const stickY = gamepad.axes[1] || 0;
    if (isAiming()) {
      const { aim } = training.round;
      if (
        Math.abs(stickX) > STICK_DEADZONE ||
        Math.abs(stickY) > STICK_DEADZONE
      )
        training.moveReticle(
          aim.x + stickX * RETICLE_STICK_SPEED,
          aim.y + stickY * RETICLE_STICK_SPEED,
        );
      if (justPressed(BUTTON_CONFIRM) || justPressed(BUTTON_RIGHT_TRIGGER))
        training.cast();
      if (justPressed(BUTTON_BACK)) screenNavigator.goBack();
      return;
    }
    const down = isDown(BUTTON_DPAD_DOWN) || stickY > STICK_MENU_THRESHOLD;
    const up = isDown(BUTTON_DPAD_UP) || stickY < -STICK_MENU_THRESHOLD;
    if ((down || up) && now > nextMenuRepeatAt) {
      moveFocus(down ? 1 : -1);
      nextMenuRepeatAt = now + MENU_REPEAT_MS;
    }
    if (!down && !up) nextMenuRepeatAt = 0;
    if (
      justPressed(BUTTON_CONFIRM) &&
      document.activeElement &&
      (document.activeElement as HTMLElement).click
    ) {
      sound.unlock();
      (document.activeElement as HTMLElement).click();
    }
    if (justPressed(BUTTON_BACK) && context.screen !== "title")
      screenNavigator.goBack();
  };
}
