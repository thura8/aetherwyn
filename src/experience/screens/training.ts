import * as THREE from "three";
import {
  PRACTICE_SPELL_IDS,
  type PracticeSpellId,
  type RelayRoom,
  type RelaySeat,
} from "@/shared/relay";
import { elementById, type ExperienceContext } from "../experienceContext";
import { CIRCLE_COLORS } from "../world/arena";
import { WIZARD_CLASSES } from "../world/characters/wizardClasses";
import type { ScreenNavigator } from "./screenNavigator";

/*
 * Spell practice on the big screen. Players practise Fire and Shield on their phones; this board
 * follows the room relay, shows each player's progress, and makes their wizard cast in the arena
 * (with a floating label) every time their phone reports a cast.
 */

/** Full-power casts that master a spell (the phone uses the same number). */
const MASTERY = 3;
const SPELL_LABELS: Record<PracticeSpellId, string> = {
  "flame-burst": "Flame Burst",
  "mystic-shield": "Mystic Shield",
};
const SPELL_SHORT: Record<PracticeSpellId, string> = {
  "flame-burst": "Fire",
  "mystic-shield": "Shield",
};
/** How long a cast label floats over a circle. */
const LABEL_MS = 1900;

const toCssHex = (color: number) => "#" + color.toString(16).padStart(6, "0");

type OnRelayRoom = (listener: (room: RelayRoom) => void) => () => void;

export function setUpTraining(
  context: ExperienceContext,
  screenNavigator: ScreenNavigator,
  onRelayRoom: OnRelayRoom,
) {
  const { lifecycle, sound } = context;
  const rows = elementById("practice-rows");
  const status = elementById("practice-status");
  const labelPoint = new THREE.Vector3();
  /** The last cast already shown for each seat, so entering the board doesn't replay old ones. */
  const shownCasts = new Map<string, number>();
  let stopFollowing: (() => void) | null = null;
  let firstRoom = true;

  function mastered(seat: RelaySeat, spell: PracticeSpellId) {
    return (seat.practice?.casts[spell].full ?? 0) >= MASTERY;
  }

  function renderRows(room: RelayRoom) {
    rows.innerHTML = "";
    room.seats.forEach((seat, index) => {
      if (!seat) return;
      const row = document.createElement("li");
      row.className = "slot filled practice-row";
      row.style.setProperty("--c", toCssHex(CIRCLE_COLORS[index]));
      row.style.animation = "none";
      row.innerHTML = `<span class="sig" aria-hidden="true"></span><span class="who"><span class="name"></span><span class="cls"></span></span><span class="end practice-progress"></span>`;
      row.querySelector(".name")!.textContent = seat.name;
      row.querySelector(".cls")!.textContent = seat.isTest
        ? "Test wand: no phone to practise with"
        : !seat.connected
          ? "Wand lost…"
          : seat.wizard
            ? WIZARD_CLASSES[seat.wizard].name
            : "Practising";
      const progress = row.querySelector(".practice-progress")!;
      for (const spell of PRACTICE_SPELL_IDS) {
        const full = Math.min(MASTERY, seat.practice?.casts[spell].full ?? 0);
        const cell = document.createElement("span");
        cell.className = "practice-spell" + (mastered(seat, spell) ? " mastered" : "");
        cell.setAttribute(
          "aria-label",
          `${SPELL_LABELS[spell]}: ${full} of ${MASTERY} full-power casts`,
        );
        cell.innerHTML = `<span class="practice-spell-name"></span><span class="practice-gems" aria-hidden="true">${"<i></i>".repeat(MASTERY)}</span>`;
        cell.querySelector(".practice-spell-name")!.textContent = SPELL_SHORT[spell];
        cell.querySelectorAll("i").forEach((gem, i) => {
          if (i < full) gem.className = "lit";
        });
        progress.append(cell);
      }
      rows.append(row);
    });

    const players = room.seats.filter((seat): seat is RelaySeat => !!seat && !seat.isTest);
    const masteredCount = players.reduce(
      (sum, seat) => sum + PRACTICE_SPELL_IDS.filter((spell) => mastered(seat, spell)).length,
      0,
    );
    status.textContent =
      players.length === 0
        ? "Join from a phone to practise: test wizards can't cast."
        : masteredCount === players.length * PRACTICE_SPELL_IDS.length
          ? "Every spell mastered. Ready for the duel!"
          : `${masteredCount} of ${players.length * PRACTICE_SPELL_IDS.length} spells mastered.`;
  }

  /** Floats text over a casting circle, where that player's wizard stands. */
  function floatOverCircle(index: number, text: string, tone: string) {
    const world = context.world;
    if (!world) return;
    world.circles[index].seal.getWorldPosition(labelPoint);
    labelPoint.y += 7;
    labelPoint.project(world.camera);
    const label = document.createElement("div");
    label.className = `floater spell ${tone}`;
    label.textContent = text;
    label.style.left = `${((labelPoint.x + 1) / 2) * innerWidth}px`;
    label.style.top = `${((1 - labelPoint.y) / 2) * innerHeight}px`;
    document.body.append(label);
    lifecycle.after(() => label.remove(), LABEL_MS);
  }

  /** Plays every cast the board hasn't shown yet: the wizard casts, and a label says how it went. */
  function playNewCasts(room: RelayRoom) {
    room.seats.forEach((seat, index) => {
      const last = seat?.practice?.last;
      if (!seat || !last) return;
      if (shownCasts.get(seat.id) === last.at) return;
      shownCasts.set(seat.id, last.at);
      if (firstRoom) return;
      if (last.power === "missed" || !last.spell) {
        floatOverCircle(index, "Fizzled", "miss");
        sound.miss();
        return;
      }
      context.world?.castWizardSpell(index);
      const full = last.power === "full";
      const streak = full && (last.streak ?? 0) > 1 ? ` · Streak ×${last.streak}` : "";
      floatOverCircle(
        index,
        `${SPELL_LABELS[last.spell]}${full ? " · Full power!" : " · weak"}${streak}`,
        full ? "full" : "weak",
      );
      if (full) sound.cast();
      else sound.tick(false);
    });
  }

  screenNavigator.onEnter.training = () => {
    if (!context.room) {
      screenNavigator.goTo("lobby");
      return;
    }
    firstRoom = true;
    rows.innerHTML = "";
    status.textContent = "Waiting for the phones…";
    if (context.world) {
      context.world.state.focus = "arena";
      context.world.setCirclesLit(context.room.players.map(Boolean));
    }
    stopFollowing = onRelayRoom((room) => {
      renderRows(room);
      playNewCasts(room);
      firstRoom = false;
    });
  };
  screenNavigator.onLeave.training = () => {
    stopFollowing?.();
    stopFollowing = null;
  };

  lifecycle.listen(elementById("practice-done"), "click", () =>
    screenNavigator.goTo("lobby"),
  );
}
