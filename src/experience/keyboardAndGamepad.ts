import { toggleMute } from "./soundEngine";
import type { ExperienceContext } from "./experienceContext";
import type { ScreenNavigator } from "./screens/screenNavigator";

const STICK_MENU_THRESHOLD = 0.6;
const MENU_REPEAT_MS = 220;
// Standard gamepad layout
const BUTTON_CONFIRM = 0;
const BUTTON_BACK = 1;
const BUTTON_DPAD_UP = 12;
const BUTTON_DPAD_DOWN = 13;

const isTypingInInput = () => document.activeElement?.tagName === "INPUT";

export function setUpKeyboardAndGamepad(
  context: ExperienceContext,
  screenNavigator: ScreenNavigator,
) {
  const { lifecycle, sound } = context;

  function focusableControls() {
    const screen = screenNavigator.screens[context.screen];
    return screen
      ? [
          ...screen.querySelectorAll<HTMLElement>(
            ".mode-card:not(:disabled), .btn:not(:disabled), input, .x, .class-dot",
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
      toggleMute(sound);
      return;
    }
    if (key === "Escape") {
      if (context.screen !== "title") screenNavigator.goBack();
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
    const stickY = gamepad.axes[1] || 0;
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
