import * as THREE from "three";
import { elementById, type ExperienceContext } from "../experienceContext";
import type { World } from "../world/createWorld";
import type { ScreenNavigator } from "./screenNavigator";

const ROUND_SECONDS = 45;
const CAST_COOLDOWN_SECONDS = 0.22;
const COMBO_WINDOW_SECONDS = 2.5;
const POINTS_PER_HIT = 100;
const HIT_STOP_SECONDS = 0.07;
const LOCK_ON_DISTANCE = 2.1;

const toNdcX = (x: number) => (x / innerWidth) * 2 - 1;
const toNdcY = (y: number) => -((y / innerHeight) * 2 - 1);

export function setUpTraining(
  context: ExperienceContext,
  screenNavigator: ScreenNavigator,
) {
  const { lifecycle, device, sound } = context;
  const reticle = elementById("reticle");
  const round = {
    active: false,
    score: 0,
    combo: 1,
    bestCombo: 1,
    hits: 0,
    shots: 0,
    timeLeft: ROUND_SECONDS,
    lastHitTime: -10,
    cooldown: 0,
    aim: { x: innerWidth / 2, y: innerHeight * 0.42 },
    lastShownSecond: 99,
  };
  let casterTurn = 0;
  const crystalPosition = new THREE.Vector3();

  function setStat(id: string, value: string | number, bump?: boolean) {
    const stat = elementById(id);
    stat.querySelector("b")!.textContent = String(value);
    if (bump) {
      stat.classList.remove("bump");
      void stat.offsetWidth;
      stat.classList.add("bump");
    }
  }

  function moveReticle(x: number, y: number) {
    round.aim.x = Math.max(0, Math.min(innerWidth, x));
    round.aim.y = Math.max(0, Math.min(innerHeight, y));
    reticle.style.left = round.aim.x + "px";
    reticle.style.top = round.aim.y + "px";
  }

  function showBanner(text: string) {
    const banner = elementById("banner");
    banner.textContent = text;
    banner.hidden = false;
    banner.classList.remove("go");
    void banner.offsetWidth;
    banner.classList.add("go");
  }

  function showFloatingText(
    text: string,
    x: number,
    y: number,
    isMiss?: boolean,
  ) {
    const floater = document.createElement("div");
    floater.className = "floater" + (isMiss ? " miss" : "");
    floater.textContent = text;
    floater.style.left = x + "px";
    floater.style.top = y + "px";
    document.body.appendChild(floater);
    lifecycle.after(() => floater.remove(), 950);
  }

  /** Circles that cast: seated players', or two defaults when nobody is seated. */
  function casterCircles() {
    const seated = context.room
      ? context.room.players
          .map((player, i) => (player ? i : -1))
          .filter((i) => i >= 0)
      : [];
    return seated.length ? seated : [0, 3];
  }

  function startRound() {
    Object.assign(round, {
      active: false,
      score: 0,
      combo: 1,
      bestCombo: 1,
      hits: 0,
      shots: 0,
      timeLeft: ROUND_SECONDS,
      cooldown: 0,
      lastShownSecond: 99,
    });
    setStat("st-score", 0);
    setStat("st-combo", "×1");
    setStat("st-time", ROUND_SECONDS);
    elementById("st-time").classList.remove("low");
    elementById("results").hidden = true;
    reticle.hidden = false;
    moveReticle(innerWidth / 2, innerHeight * 0.42);
    const world = context.world;
    if (world) {
      world.state.training = true;
      world.state.beamHeight = 0.3;
      world.startTraining();
      const casters = casterCircles();
      world.setCirclesLit([0, 1, 2, 3].map((i) => casters.includes(i)));
      world.state.orbTarget = 1;
    }
    const countdown: [string, number][] = device.prefersReducedMotion
      ? [["Cast!", 0]]
      : [
          ["3", 0],
          ["2", 700],
          ["1", 1400],
          ["Cast!", 2100],
        ];
    countdown.forEach(([text, delay], index) =>
      lifecycle.after(() => {
        if (context.screen !== "training") return;
        showBanner(text);
        const isLast = index === countdown.length - 1;
        sound.tick(isLast);
        if (isLast) round.active = true;
      }, 400 + delay),
    );
  }

  function endRound() {
    round.active = false;
    reticle.hidden = true;
    elementById("res-score").textContent = round.score.toLocaleString();
    elementById("res-hits").textContent = String(round.hits);
    elementById("res-acc").textContent = round.shots
      ? Math.round((round.hits / round.shots) * 100) + "%"
      : "0%";
    elementById("res-combo").textContent = "×" + round.bestCombo;
    elementById("res-h").textContent =
      round.score >= 2500
        ? "Archmage material"
        : round.score >= 1000
          ? "Well cast, wizard"
          : "A promising start";
    elementById("results").hidden = false;
    sound.surge();
    if (!device.isCoarsePointer) elementById("again").focus();
  }

  function cast() {
    const world = context.world;
    if (!world || !round.active || round.cooldown > 0) return;
    round.cooldown = CAST_COOLDOWN_SECONDS;
    round.shots++;
    const casters = casterCircles();
    const casterIndex = casters[casterTurn++ % casters.length];
    const color = world.circleColors[casterIndex];
    const aimX = round.aim.x;
    const aimY = round.aim.y;
    reticle.classList.add("fire");
    lifecycle.after(() => reticle.classList.remove("fire"), 90);
    sound.cast();
    if (navigator.vibrate) {
      try {
        navigator.vibrate(12);
      } catch {
        /* not allowed */
      }
    }
    world.castBolt(casterIndex, toNdcX(aimX), toNdcY(aimY), color, (hit) => {
      if (!round.active) return;
      if (hit) {
        round.combo =
          world.state.time - round.lastHitTime < COMBO_WINDOW_SECONDS
            ? round.combo + 1
            : 1;
        round.lastHitTime = world.state.time;
        round.bestCombo = Math.max(round.bestCombo, round.combo);
        round.hits++;
        const points = POINTS_PER_HIT * round.combo;
        round.score += points;
        setStat("st-score", round.score.toLocaleString(), true);
        setStat("st-combo", "×" + round.combo, round.combo > 1);
        showFloatingText(`+${points}`, aimX, aimY);
        sound.hit(round.combo);
        context.hitStopSeconds = HIT_STOP_SECONDS;
      } else {
        round.combo = 1;
        setStat("st-combo", "×1");
        showFloatingText("Missed", aimX, aimY, true);
        sound.miss();
      }
    });
  }

  function update(world: World, deltaSeconds: number) {
    if (round.cooldown > 0) round.cooldown -= deltaSeconds;
    if (!round.active) return;
    round.timeLeft -= deltaSeconds;
    const secondsLeft = Math.max(0, Math.ceil(round.timeLeft));
    if (secondsLeft !== round.lastShownSecond) {
      round.lastShownSecond = secondsLeft;
      setStat("st-time", secondsLeft);
      elementById("st-time").classList.toggle("low", secondsLeft <= 10);
      if (secondsLeft <= 5 && secondsLeft > 0) sound.tick(false);
    }
    if (round.timeLeft <= 0) endRound();
    const ray = world.getAimRay(toNdcX(round.aim.x), toNdcY(round.aim.y));
    let isLockedOn = false;
    world.crystals.forEach((crystal) => {
      if (crystal.visible && crystal.userData.alive) {
        crystal.getWorldPosition(crystalPosition);
        if (ray.distanceToPoint(crystalPosition) < LOCK_ON_DISTANCE)
          isLockedOn = true;
      }
    });
    reticle.classList.toggle("lock", isLockedOn);
  }

  screenNavigator.onEnter.training = () => {
    if (context.world) {
      context.world.state.focus = "portal";
      context.world.state.portalBoost = 0.35;
    }
    elementById("train-hint").textContent = device.isCoarsePointer
      ? "Tap a crystal to cast"
      : "Aim at the crystals · click to cast · Space or arrow keys work too";
    startRound();
  };
  screenNavigator.onLeave.training = () => {
    if (context.world) {
      context.world.state.focus = "arena";
      context.world.state.portalBoost = 0;
    }
    round.active = false;
    reticle.hidden = true;
    elementById("results").hidden = true;
    elementById("banner").hidden = true;
    if (context.world) {
      context.world.stopTraining();
      context.world.state.training = false;
      context.world.state.beamHeight = 1;
    }
  };

  lifecycle.listen(elementById("again"), "click", startRound);
  lifecycle.listen(elementById("to-menu"), "click", () =>
    screenNavigator.goTo("title"),
  );
  lifecycle.listen<PointerEvent>(
    elementById("stage"),
    "pointerdown",
    (event) => {
      if (context.screen !== "training") return;
      moveReticle(event.clientX, event.clientY);
      cast();
    },
  );
  lifecycle.listen<PointerEvent>(window, "pointermove", (event) => {
    if (context.screen === "training" && event.pointerType !== "touch")
      moveReticle(event.clientX, event.clientY);
  });

  return { round, cast, moveReticle, update };
}

export type TrainingScreen = ReturnType<typeof setUpTraining>;
