import qrcode from "qrcode-generator";
import {
  LOST_SEAT_MS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  roomUrl,
  sendRelayAction,
  type RelayError,
  type RelayRoom,
} from "@/shared/relay";
import {
  elementById,
  type ExperienceContext,
  type Player,
  type Room,
} from "../experienceContext";
import { CIRCLE_COLORS } from "../world/arena";
import {
  WIZARD_CLASSES,
  WIZARD_CLASS_IDS,
  type WizardClassId,
} from "../world/characters/wizardClasses";
import type { ScreenNavigator } from "./screenNavigator";

const TEST_WIZARD_NAMES = [
  "Lyra",
  "Thorne",
  "Isolde",
  "Corvin",
  "Seren",
  "Bram",
];

const toCssHex = (color: number) => "#" + color.toString(16).padStart(6, "0");

function generateRoomCode() {
  let code = "";
  const values = new Uint32Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(values);
  for (let i = 0; i < ROOM_CODE_LENGTH; i++)
    code += ROOM_CODE_ALPHABET[values[i] % ROOM_CODE_ALPHABET.length];
  return code;
}

function renderQrCode(text: string) {
  const box = elementById("qr");
  const code = qrcode(0, "M");
  code.addData(text);
  code.make();
  box.innerHTML = code.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
  box
    .querySelector("svg")
    ?.querySelectorAll("path, rect")
    .forEach((shape) => {
      const fill = shape.getAttribute("fill");
      if (fill === "#000000" || fill === "black")
        shape.setAttribute("fill", "#1D2C55");
    });
}

/** A phone player whose phone has dropped off the room (test wizards have no phone to lose). */
const isWandLost = (player: Player) =>
  !player.isTestWizard && !player.connected;

function slotSubtitle(player: Player | null, index: number) {
  const circle = `circle ${index + 1}`;
  if (!player) return `Casting ${circle}`;
  return player.wizardClass
    ? `${WIZARD_CLASSES[player.wizardClass].name} · ${circle}`
    : `Choosing a wizard… · ${circle}`;
}

function pillLabel(player: Player) {
  if (player.isTestWizard) return "Test wand";
  if (!player.connected) return "Wand lost";
  return player.ready ? "Ready" : "Wand connected";
}

function beginReason(seated: Player[]) {
  if (seated.length === 0) return "Waiting for at least one wizard.";
  const lost = seated.find(isWandLost);
  if (lost)
    return `${lost.name}'s wand is lost. They'll miss their turns until they return.`;
  const choosing = seated.find((player) => !player.wizardClass);
  if (choosing) return `${choosing.name} is still choosing a wizard.`;
  return seated.length === 1
    ? "1 wizard ready. A duel needs 2; training works with 1."
    : `${seated.length} wizards ready.`;
}

/** What seatPlayer reports: seated, or why not. */
export type SeatResult = { ok: true } | { ok: false; error: RelayError };

/*
 * The lobby follows the room relay (src/app/api/rooms), so phones that scan the QR code appear here
 * with the wizard they pick. If the relay can't be reached, it falls back to a local-only room.
 */
export function setUpLobby(
  context: ExperienceContext,
  screenNavigator: ScreenNavigator,
) {
  const { lifecycle, sound } = context;
  let testWizardCount = 0;
  let events: EventSource | null = null;
  /** True while the relay holds the room; false means local-only. */
  let live = false;
  let relayPhase: RelayRoom["phase"] = "lobby";
  /** The relay's latest room, and who else wants it (the practice board). */
  let latestRelayRoom: RelayRoom | null = null;
  const relayListeners = new Set<(room: RelayRoom) => void>();

  function renderSlots(room: Room) {
    const list = elementById("slots");
    list.innerHTML = "";
    room.players.forEach((player, i) => {
      const slot = document.createElement("li");
      const lost = !!player && isWandLost(player);
      slot.className =
        "slot " + (player ? "filled" : "empty") + (lost ? " lost" : "");
      if (lost && player.lostAt) {
        // The ring around the sigil drains over the time left; a negative delay starts it part-way.
        slot.style.setProperty("--lost-ms", `${LOST_SEAT_MS}ms`);
        slot.style.setProperty(
          "--lost-delay",
          `${-(Date.now() - player.lostAt)}ms`,
        );
      }
      slot.style.setProperty("--c", toCssHex(CIRCLE_COLORS[i]));
      slot.innerHTML = `<span class="sig" aria-hidden="true"></span><span class="who"><span class="name"></span><span class="cls"></span></span><span class="end"></span>`;
      slot.querySelector(".name")!.textContent = player
        ? player.name
        : "Waiting for a wand…";
      slot.querySelector(".cls")!.textContent = slotSubtitle(player, i);
      if (player) {
        // Phones choose their own wizard; the host picks for test wizards (and everyone when local-only).
        if (player.isTestWizard || !live)
          slot.querySelector(".who")!.append(createClassPicker(player));
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = pillLabel(player);
        const removeButton = document.createElement("button");
        removeButton.className = "x";
        removeButton.type = "button";
        removeButton.textContent = "×";
        removeButton.setAttribute("aria-label", `Remove ${player.name}`);
        removeButton.addEventListener("click", () => removePlayer(i));
        if (lost) {
          const note = document.createElement("span");
          note.className = "sr-only";
          note.textContent =
            relayPhase === "lobby"
              ? ` They have ${LOST_SEAT_MS / 1000} seconds to return.`
              : "";
          pill.append(note);
        }
        slot.querySelector(".end")!.append(pill, removeButton);
      }
      if (!player || !player.isNew) slot.style.animation = "none";
      if (player) player.isNew = false;
      list.appendChild(slot);
    });
  }

  /** Stands each seated player's chosen character on their casting circle. */
  function syncWizards() {
    const world = context.world;
    if (!world) return;
    world.setWizardCastListener(() => {
      if (context.screen === "lobby") sound.cast();
    });
    world.circles.forEach((_, i) => {
      const player = context.room?.players[i];
      world.setWizard(i, player?.wizardClass ?? null);
      world.setWizardFaded(i, !!player && isWandLost(player));
    });
  }

  /** The row of character buttons in a seated player's slot. */
  function createClassPicker(player: Player) {
    const picker = document.createElement("span");
    picker.className = "classes";
    picker.setAttribute("role", "group");
    picker.setAttribute("aria-label", `Character for ${player.name}`);
    WIZARD_CLASS_IDS.forEach((classId) => {
      const wizardClass = WIZARD_CLASSES[classId];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "class-dot";
      button.title = wizardClass.name;
      button.setAttribute("aria-label", wizardClass.name);
      button.setAttribute(
        "aria-pressed",
        String(player.wizardClass === classId),
      );
      button.style.setProperty("--k", wizardClass.swatch);
      button.addEventListener("click", async () => {
        if (player.wizardClass === classId || !context.room) return;
        if (live) {
          const result = await sendRelayAction(context.room.code, {
            type: "setWizard",
            seatId: player.id,
            wizard: classId,
          });
          if (!result.ok && result.error === "wizard-taken")
            context.showToast(`${wizardClass.name} is already in a circle.`);
          return;
        }
        player.wizardClass = classId;
        sound.ignite();
        refreshLobby();
      });
      picker.append(button);
    });
    return picker;
  }

  function refreshLobby() {
    const room = context.room;
    if (!room) return;
    renderSlots(room);
    syncWizards();
    const seated = room.players.filter((player): player is Player => !!player);
    elementById<HTMLButtonElement>("begin").disabled = seated.length === 0;
    elementById("begin-reason").textContent = beginReason(seated);
    elementById<HTMLButtonElement>("add-test").disabled = seated.length >= 4;
    if (context.world && context.screen === "lobby")
      context.world.setCirclesLit(room.players.map(Boolean));
  }

  /** Flashes a casting circle in the arena (only while the lobby is on screen). */
  function flashCircle(index: number) {
    if (context.world && context.screen === "lobby")
      context.world.circles[index].flashTime = context.world.state.time;
  }

  function celebrateArrival(index: number) {
    flashCircle(index);
    sound.ignite();
  }

  /* ---------- the relay ---------- */

  /** Turns the relay's room into the lobby's players, with sound and toasts for what changed. */
  function applyRelayRoom(relay: RelayRoom) {
    const room = context.room;
    if (!room || relay.code !== room.code) return;
    relayPhase = relay.phase;
    latestRelayRoom = relay;
    const before = new Map(
      room.players.flatMap((player) => (player ? [[player.id, player]] : [])),
    );
    room.players = relay.seats.map((seat, index) => {
      if (!seat) return null;
      const previous = before.get(seat.id);
      before.delete(seat.id);
      if (!previous) {
        celebrateArrival(index);
        context.showToast(`${seat.name} entered the realm.`);
      } else if (previous.wizardClass !== seat.wizard && seat.wizard) {
        sound.ignite();
        flashCircle(index);
      } else if (previous.connected && !seat.connected && !seat.isTest) {
        context.showToast(`${seat.name}'s wand slipped away…`);
      } else if (!previous.connected && seat.connected) {
        context.showToast(`${seat.name} returned.`);
        sound.tick(true);
      } else if (!previous.ready && seat.ready && !seat.isTest)
        sound.tick(true);
      return {
        id: seat.id,
        name: seat.name,
        wizardClass: seat.wizard,
        isTestWizard: seat.isTest,
        ready: seat.ready,
        connected: seat.connected,
        lostAt: seat.lostAt ?? null,
        isNew: !previous,
      };
    });
    for (const gone of before.values()) {
      sound.back();
      context.showToast(
        isWandLost(gone)
          ? `${gone.name}'s wand faded from the circle.`
          : `${gone.name} left the circle.`,
      );
    }
    refreshLobby();
    relayListeners.forEach((listener) => listener(relay));
  }

  function followRelay(code: string) {
    events?.close();
    events = new EventSource(`${roomUrl(code)}/events?role=host`);
    events.onmessage = (message) => applyRelayRoom(JSON.parse(message.data));
  }

  async function openRelayRoom(code: string) {
    try {
      const response = await fetch(roomUrl(code), { method: "PUT" });
      live = response.ok;
    } catch {
      live = false;
    }
    if (!context.room || context.room.code !== code) return;
    if (live) followRelay(code);
    else
      context.showToast(
        "Phones can't connect right now. Test wizards still work.",
      );
    refreshLobby();
  }

  function closeRelayRoom(code: string) {
    events?.close();
    events = null;
    if (live) void fetch(roomUrl(code), { method: "DELETE" }).catch(() => {});
    live = false;
  }

  lifecycle.onStop(() => events?.close());

  /* ---------- seating ---------- */

  function seatLocally(
    name: string,
    isTestWizard: boolean,
    wizardClass?: WizardClassId,
  ): SeatResult {
    const room = context.room;
    if (!room) return { ok: false, error: "no-room" };
    const index = room.players.findIndex((player) => !player);
    if (index < 0) return { ok: false, error: "room-full" };
    if (room.players.some((p) => p?.name.toLowerCase() === name.toLowerCase()))
      return { ok: false, error: "name-taken" };
    // without a choice, take the first character nobody else in the room is playing
    const takenClasses = room.players.map((player) => player?.wizardClass);
    room.players[index] = {
      id: crypto.randomUUID(),
      name,
      wizardClass:
        wizardClass && !takenClasses.includes(wizardClass)
          ? wizardClass
          : (WIZARD_CLASS_IDS.find((id) => !takenClasses.includes(id)) ??
            WIZARD_CLASS_IDS[index]),
      isTestWizard,
      ready: true,
      connected: true,
      lostAt: null,
      isNew: true,
    };
    celebrateArrival(index);
    context.showToast(`${name} entered the realm.`);
    refreshLobby();
    return { ok: true };
  }

  /** Seats a player in the first free circle, through the relay when it's live. */
  async function seatPlayer(
    name: string,
    isTestWizard: boolean,
    wizardClass?: WizardClassId,
  ): Promise<SeatResult> {
    const room = context.room;
    if (!room) return { ok: false, error: "no-room" };
    if (!live) return seatLocally(name, isTestWizard, wizardClass);
    const result = await sendRelayAction(
      room.code,
      isTestWizard
        ? { type: "addTest", name }
        : { type: "join", name, wizard: wizardClass, present: true },
    );
    if (!result.ok) return result;
    // A wizard joining from this device counts as present and ready.
    if (!isTestWizard && result.seatId)
      void sendRelayAction(room.code, {
        type: "setReady",
        seatId: result.seatId,
        ready: true,
      });
    // The relay's next snapshot seats them in the lobby.
    return { ok: true };
  }

  function removePlayer(index: number) {
    const room = context.room;
    const player = room?.players[index];
    if (!room || !player) return;
    if (live) {
      void sendRelayAction(room.code, { type: "kick", seatId: player.id });
      return;
    }
    room.players[index] = null;
    sound.back();
    context.showToast(`${player.name} left the circle.`);
    refreshLobby();
  }

  /* ---------- screen wiring ---------- */

  screenNavigator.onEnter.lobby = () => {
    if (!context.room) {
      const code = generateRoomCode();
      context.room = { code, players: [null, null, null, null] };
      relayPhase = "lobby";
      void openRelayRoom(code);
      if (context.world) {
        context.world.triggerShockwave(0.8);
        context.world.state.orbTarget = 1.6;
        lifecycle.after(() => {
          if (context.world) context.world.state.orbTarget = 1;
        }, 900);
      }
      sound.surge();
    } else if (live && relayPhase !== "lobby") {
      void sendRelayAction(context.room.code, { type: "backToLobby" });
    }
    elementById("room-code").textContent = context.room.code;
    // Phones on the same network open this page's /join route, which reads the code from the link.
    renderQrCode(`${location.origin}/join?code=${context.room.code}`);
    refreshLobby();
  };

  lifecycle.listen(elementById("add-test"), "click", async () => {
    if (!context.room) return;
    const name =
      TEST_WIZARD_NAMES[testWizardCount++ % TEST_WIZARD_NAMES.length];
    const result = await seatPlayer(name, true);
    if (!result.ok && result.error === "name-taken") {
      const retry = await seatPlayer(`${name} ${testWizardCount}`, true);
      if (!retry.ok) sound.error();
    } else if (!result.ok) sound.error();
  });
  lifecycle.listen(elementById("begin"), "click", () => {
    if (live && context.room)
      void sendRelayAction(context.room.code, { type: "begin" });
    screenNavigator.goTo("training");
  });
  lifecycle.listen(elementById("close-room"), "click", () => {
    if (context.room) closeRelayRoom(context.room.code);
    context.room = null;
    syncWizards();
    context.showToast("Room closed.");
    screenNavigator.goTo("title");
  });

  return {
    seatPlayer,
    /** Follows the room as the relay sends it; called at once with the latest room, if any. */
    onRelayRoom(listener: (room: RelayRoom) => void) {
      relayListeners.add(listener);
      if (latestRelayRoom && latestRelayRoom.code === context.room?.code)
        listener(latestRelayRoom);
      return () => relayListeners.delete(listener);
    },
  };
}
