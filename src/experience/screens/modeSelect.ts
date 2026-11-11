import {
  elementById,
  type ExperienceContext,
  type GameMode,
  type Player,
  type Room,
} from "../experienceContext";
import type { CapturedView } from "../world/createWorld";
import { BATTLE_MAX_PLAYERS, BATTLE_MIN_PLAYERS } from "./lobby";
import type { ScreenNavigator } from "./screenNavigator";

/*
 * The mode-selection screen ("Choose your path"). The world behind it is the same 3D world as every
 * other screen, seen from a raised vista (cameraDirector.ts), with aether motes drifting through it.
 * Each card's art is rendered from that world when the screen opens, so it shows the real arena,
 * the wizards standing in it and the castle islands, not a painted picture.
 *
 * Training Ground and Multiplayer Battle are buttons; Story Mode is a locked, inert card.
 */

type CardArt = GameMode | "story";

/** Where the camera stands for each card's art. Coordinates are world units (the arena is at the origin). */
const CARD_VIEWS: Record<CardArt, CapturedView> = {
  // low over the platform's edge, looking across the grate to the orb
  training: { from: { x: 0, y: 9.5, z: 25 }, look: { x: 0, y: 5, z: 0 }, fov: 46 },
  // a high three-quarter view of the casting circles and the wizards standing on them
  battle: { from: { x: 17, y: 21, z: 21 }, look: { x: -1, y: 1.5, z: -1 }, fov: 44 },
  // the far castle island and its waterfalls
  story: { from: { x: 18, y: 18, z: -26 }, look: { x: 40, y: 15, z: -70 }, fov: 40 },
};
/** How long the chosen card flares before the screen moves on. */
const CHOOSE_MS = 700;

interface LobbyHooks {
  beginTraining(): void;
  chooseBattle(): void;
  onRoomChanged(listener: (room: Room) => void): () => void;
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

export function setUpModeSelect(
  context: ExperienceContext,
  screenNavigator: ScreenNavigator,
  lobby: LobbyHooks,
) {
  const { lifecycle, sound, device } = context;
  const screen = screenNavigator.screens.modes;
  const cards: Record<GameMode, HTMLButtonElement> = {
    training: elementById<HTMLButtonElement>("mode-training"),
    battle: elementById<HTMLButtonElement>("mode-battle"),
  };
  const story = elementById("mode-story");
  let stopFollowing: (() => void) | null = null;
  let choosing = false;

  function setStatus(mode: GameMode, text: string, available: boolean) {
    elementById(`mode-${mode}-status`).textContent = text;
    cards[mode].disabled = !available;
    cards[mode].dataset.state = available ? "available" : "unavailable";
  }

  /** Keeps the cards in step with who is seated: Training needs 1 wizard, a battle 2 to 4. */
  function render(room: Room) {
    const seated = room.players.filter((player): player is Player => !!player);
    const wands = seated.filter(
      (player) => !player.isTestWizard && player.connected,
    ).length;

    elementById("mode-training-chip").textContent =
      wands > 1
        ? `${wands} wands connected`
        : wands === 1
          ? "Wand connected"
          : seated.length > 0
            ? "Test wands only"
            : "No wands yet";
    cards.training.dataset.wands = String(wands);
    setStatus(
      "training",
      seated.length > 0 ? "Available" : "Needs a wizard",
      seated.length > 0,
    );

    const battleReady =
      seated.length >= BATTLE_MIN_PLAYERS &&
      seated.length <= BATTLE_MAX_PLAYERS;
    setStatus(
      "battle",
      battleReady
        ? "Available"
        : `Needs ${plural(BATTLE_MIN_PLAYERS - seated.length, "more wizard")}`,
      battleReady,
    );
  }

  /** Renders each card's art from the world; without WebGL the cards keep their painted fallback. */
  function paintArt() {
    const world = context.world;
    screen.classList.toggle("no-world", !world);
    if (!world) return;
    (Object.keys(CARD_VIEWS) as CardArt[]).forEach((art) => {
      const canvas = elementById<HTMLCanvasElement>(`mode-art-${art}`);
      if (world.captureView(CARD_VIEWS[art], canvas))
        canvas.classList.add("painted");
    });
  }

  function reset() {
    choosing = false;
    screen.classList.remove("choosing");
    [cards.training, cards.battle, story].forEach((card) =>
      card.classList.remove("chosen", "dimmed"),
    );
  }

  screenNavigator.onApproach.modes = () => {
    reset();
    const room = context.room;
    if (!room) return;
    render(room);
    // The world is drawn during the veil, so the extra renders never show as a stutter on screen.
    paintArt();
    stopFollowing?.();
    stopFollowing = lobby.onRoomChanged(render);
    if (context.world) {
      context.world.setPathMotesActive(true);
      context.world.setCirclesLit(room.players.map(Boolean));
    }
  };
  screenNavigator.onEnter.modes = () => {
    if (!context.room) screenNavigator.goTo("lobby");
  };
  screenNavigator.onLeave.modes = () => {
    stopFollowing?.();
    stopFollowing = null;
    context.world?.setPathMotesActive(false);
  };

  function choose(mode: GameMode) {
    const card = cards[mode];
    if (choosing || card.disabled || context.screen !== "modes") return;
    choosing = true;
    screen.classList.add("choosing");
    card.classList.add("chosen");
    [cards.training, cards.battle, story].forEach((other) => {
      if (other !== card) other.classList.add("dimmed");
    });

    const world = context.world;
    if (mode === "training") {
      sound.surge();
      if (world) {
        world.state.orbTarget = 1.9;
        world.triggerShockwave(0.7);
      }
    } else {
      sound.ignite();
      if (world)
        context.room?.players.forEach((player, index) => {
          if (player) world.circles[index].flashTime = world.state.time;
        });
    }

    lifecycle.after(
      () => {
        // Leaving another way (Escape, Return to lobby) while the card flares cancels the choice.
        if (context.screen !== "modes") return;
        if (world) world.state.orbTarget = 1;
        if (mode === "training") lobby.beginTraining();
        else lobby.chooseBattle();
      },
      device.prefersReducedMotion ? 150 : CHOOSE_MS,
    );
  }

  lifecycle.listen(cards.training, "click", () => choose("training"));
  lifecycle.listen(cards.battle, "click", () => choose("battle"));
  lifecycle.listen(elementById("modes-return"), "click", () => {
    if (context.screen === "modes") screenNavigator.goBack();
  });
}
