import type { ExperienceContext } from "./experienceContext";

export function setUpMenuFeedback(context: ExperienceContext) {
  const { lifecycle, sound } = context;

  function reactInWorld(button: HTMLElement, isActive: boolean) {
    const world = context.world;
    if (!world) return;
    const reaction = button.dataset.react;
    if (reaction === "orb") world.state.orbTarget = isActive ? 1.7 : 1;
    if (reaction === "portal")
      world.state.portalBoost =
        context.screen === "training"
          ? 0.35
          : isActive || context.screen === "join"
            ? 1
            : 0;
  }

  const closestButton = (event: Event, selector: string) =>
    (event.target as Element).closest<HTMLButtonElement>(selector);

  let hoveredButton: HTMLButtonElement | null = null;
  lifecycle.listen<PointerEvent>(document, "pointerover", (event) => {
    const button = closestButton(event, ".btn, .icon-btn, .mode-card");
    if (!button || button === hoveredButton || button.disabled) return;
    hoveredButton = button;
    sound.hover();
    reactInWorld(button, true);
  });
  lifecycle.listen<PointerEvent>(document, "pointerout", (event) => {
    const button = closestButton(event, ".btn, .icon-btn, .mode-card");
    if (button && !button.contains(event.relatedTarget as Node | null)) {
      if (hoveredButton === button) hoveredButton = null;
      reactInWorld(button, false);
    }
  });
  lifecycle.listen<FocusEvent>(document, "focusin", (event) => {
    const button = closestButton(event, ".btn, .mode-card");
    if (button && (event.target as Element).matches(":focus-visible")) {
      sound.hover();
      reactInWorld(button, true);
    }
  });
  lifecycle.listen<FocusEvent>(document, "focusout", (event) => {
    const button = closestButton(event, ".btn, .mode-card");
    if (button) reactInWorld(button, false);
  });
  lifecycle.listen<PointerEvent>(document, "pointerdown", (event) => {
    const button = closestButton(event, ".btn");
    if (!button || button.disabled) return;
    const bounds = button.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.left = event.clientX - bounds.left + "px";
    ripple.style.top = event.clientY - bounds.top + "px";
    button.appendChild(ripple);
    lifecycle.after(() => ripple.remove(), 650);
  });
  lifecycle.listen(document, "click", (event) => {
    const button = closestButton(event, ".btn");
    if (button && !button.disabled && button.id !== "join-submit")
      sound.press();
  });
}
