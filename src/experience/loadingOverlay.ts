import { elementById, type ExperienceContext } from "./experienceContext";

const TIP_ROTATION_MS = 3600;
const TIPS = [
  "Four casting circles ring the arena, one for each wizard.",
  "Your phone is your wand. Shout the spell and move it to cast.",
  "The orb above the arena wakes when every circle is lit.",
  "Through the portal lie the Training Grounds.",
  "Crystals shatter faster when you chain your casts.",
  "Join from any phone with the four-letter room code.",
];

export function createLoadingOverlay({ lifecycle }: ExperienceContext) {
  const loader = elementById("loader");
  const statusText = elementById("loader-text");
  const meter = elementById("loader-meter");
  const tip = elementById("loader-tip");

  let tipIndex = Math.floor(Math.random() * TIPS.length);
  function rotateTip() {
    if (!lifecycle.isRunning() || loader.hidden) return;
    tip.classList.add("swap");
    lifecycle.after(() => {
      tipIndex = (tipIndex + 1) % TIPS.length;
      tip.textContent = TIPS[tipIndex];
      tip.classList.remove("swap");
    }, 450);
    lifecycle.after(rotateTip, TIP_ROTATION_MS);
  }
  tip.textContent = TIPS[tipIndex];
  lifecycle.after(rotateTip, TIP_ROTATION_MS);

  return {
    setProgress(progress: number, label?: string) {
      if (!lifecycle.isRunning()) return;
      loader.style.setProperty(
        "--p",
        String(Math.max(0.02, Math.min(1, progress))),
      );
      meter.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
      if (label) statusText.textContent = label;
      if (progress >= 1) loader.classList.add("ready");
    },
    reveal() {
      if (!lifecycle.isRunning()) return;
      loader.classList.add("done");
      elementById("scr-title").classList.add("play");
      lifecycle.after(() => {
        loader.hidden = true;
      }, 1400);
    },
  };
}
