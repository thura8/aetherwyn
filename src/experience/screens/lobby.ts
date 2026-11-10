import qrcode from "qrcode-generator";
import { elementById, type ExperienceContext, type Room } from "../experienceContext";
import { CIRCLE_COLORS } from "../world/arena";
import {
  WIZARD_CLASSES,
  WIZARD_CLASS_IDS,
  type WizardClassId,
} from "../world/characters/wizardClasses";
import type { ScreenNavigator } from "./screenNavigator";

/** Room codes leave out 0, O, 1 and I, which are easy to misread on a big screen. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TEST_WIZARD_NAMES = ["Lyra", "Thorne", "Isolde", "Corvin", "Seren", "Bram"];

const toCssHex = (color: number) => "#" + color.toString(16).padStart(6, "0");

function generateRoomCode() {
  let code = "";
  const values = new Uint32Array(4);
  crypto.getRandomValues(values);
  for (let i = 0; i < 4; i++)
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

export function setUpLobby(
  context: ExperienceContext,
  screenNavigator: ScreenNavigator,
) {
  const { lifecycle, sound } = context;
  let testWizardCount = 0;

  function renderSlots(room: Room) {
    const list = elementById("slots");
    list.innerHTML = "";
    room.players.forEach((player, i) => {
      const slot = document.createElement("li");
      slot.className = "slot " + (player ? "filled" : "empty");
      slot.style.setProperty("--c", toCssHex(CIRCLE_COLORS[i]));
      slot.innerHTML = `<span class="sig" aria-hidden="true"></span><span class="who"><span class="name"></span><span class="cls"></span></span><span class="end"></span>`;
      slot.querySelector(".name")!.textContent = player
        ? player.name
        : "Waiting for a wand…";
      slot.querySelector(".cls")!.textContent = player
        ? `${WIZARD_CLASSES[player.wizardClass].name} · circle ${i + 1}`
        : `Casting circle ${i + 1}`;
      if (player) {
        slot.querySelector(".who")!.append(createClassPicker(player, i, slot));
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = player.isTestWizard ? "Test wand" : "Wand connected";
        const removeButton = document.createElement("button");
        removeButton.className = "x";
        removeButton.type = "button";
        removeButton.textContent = "×";
        removeButton.setAttribute("aria-label", `Remove ${player.name}`);
        removeButton.addEventListener("click", () => {
          room.players[i] = null;
          sound.back();
          context.showToast(`${player.name} left the circle.`);
          refreshLobby();
        });
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
    world.circles.forEach((_, i) =>
      world.setWizard(i, context.room?.players[i]?.wizardClass ?? null),
    );
  }

  /** The row of character buttons in a seated player's slot. */
  function createClassPicker(
    player: NonNullable<Room["players"][number]>,
    circleIndex: number,
    slot: HTMLElement,
  ) {
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
      button.addEventListener("click", () => {
        if (player.wizardClass === classId) return;
        player.wizardClass = classId;
        picker
          .querySelectorAll(".class-dot")
          .forEach((other) =>
            other.setAttribute("aria-pressed", String(other === button)),
          );
        slot.querySelector(".cls")!.textContent =
          `${wizardClass.name} · circle ${circleIndex + 1}`;
        sound.ignite();
        syncWizards();
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
    const seatedCount = room.players.filter(Boolean).length;
    elementById<HTMLButtonElement>("begin").disabled = seatedCount === 0;
    elementById("begin-reason").textContent =
      seatedCount === 0
        ? "Waiting for at least one wizard."
        : seatedCount === 1
          ? "1 wizard ready. A duel needs 2; training works with 1."
          : `${seatedCount} wizards ready.`;
    elementById<HTMLButtonElement>("add-test").disabled = seatedCount >= 4;
    if (context.world && context.screen === "lobby")
      context.world.setCirclesLit(room.players.map(Boolean));
  }

  /** Seats a player in the first free circle. Returns the circle's index, or -1 when the room is full. */
  function seatPlayer(
    name: string,
    isTestWizard: boolean,
    wizardClass?: WizardClassId,
  ) {
    const room = context.room;
    if (!room) return -1;
    const index = room.players.findIndex((player) => !player);
    if (index < 0) return -1;
    // without a choice, take the first character nobody else in the room is playing
    const takenClasses = room.players.map((player) => player?.wizardClass);
    room.players[index] = {
      name,
      wizardClass:
        wizardClass ??
        WIZARD_CLASS_IDS.find((classId) => !takenClasses.includes(classId)) ??
        WIZARD_CLASS_IDS[index],
      isTestWizard,
      isNew: true,
    };
    if (context.world && context.screen === "lobby")
      context.world.circles[index].flashTime = context.world.state.time;
    sound.ignite();
    return index;
  }

  screenNavigator.onEnter.lobby = () => {
    if (!context.room) {
      context.room = {
        code: generateRoomCode(),
        players: [null, null, null, null],
      };
      if (context.world) {
        context.world.triggerShockwave(0.8);
        context.world.state.orbTarget = 1.6;
        lifecycle.after(() => {
          if (context.world) context.world.state.orbTarget = 1;
        }, 900);
      }
      sound.surge();
    }
    elementById("room-code").textContent = context.room.code;
    renderQrCode(`https://aetherwyn.local/join?code=${context.room.code}`);
    refreshLobby();
  };

  lifecycle.listen(elementById("add-test"), "click", () => {
    if (!context.room) return;
    const name =
      TEST_WIZARD_NAMES[testWizardCount++ % TEST_WIZARD_NAMES.length];
    if (seatPlayer(name, true) >= 0) {
      context.showToast(`${name} entered the realm.`);
      refreshLobby();
    }
  });
  lifecycle.listen(elementById("begin"), "click", () =>
    screenNavigator.goTo("training"),
  );
  lifecycle.listen(elementById("close-room"), "click", () => {
    context.room = null;
    syncWizards();
    context.showToast("Room closed.");
    screenNavigator.goTo("title");
  });

  return { seatPlayer };
}
