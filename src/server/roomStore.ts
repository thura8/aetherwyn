import {
  WIZARD_CLASS_IDS,
  isWizardClassId,
} from "@/experience/world/characters/wizardClasses";
import {
  LOST_SEAT_MS,
  NAME_MAX,
  ROOM_CODE_PATTERN,
  ROOM_SEATS,
  type RelayAction,
  type RelayError,
  type RelayResult,
  type RelayRoom,
  type RelaySeat,
} from "@/shared/relay";

/*
 * In-memory rooms for local play: the big screen and the phones all load from this dev server,
 * so it relays the lobby between them. One process only; rooms vanish when the server restarts.
 * Kept on globalThis so hot reloads in development don't wipe them.
 */

const ROOM_IDLE_MS = 10 * 60 * 1000;
/** A reload or a quick network hop shouldn't count as a lost wand. */
const DISCONNECT_GRACE_MS = 3000;

interface StoredRoom extends RelayRoom {
  hostConnections: number;
  seatConnections: Map<string, number>;
  lastHostSeen: number;
  listeners: Set<(room: RelayRoom) => void>;
  /** Pending removals of lost seats, by seat id. */
  lostTimers?: Map<string, ReturnType<typeof setTimeout>>;
}

const store = globalThis as typeof globalThis & {
  __aetherwynRooms?: Map<string, StoredRoom>;
};
const rooms = (store.__aetherwynRooms ??= new Map<string, StoredRoom>());

function snapshot(room: StoredRoom): RelayRoom {
  return {
    code: room.code,
    phase: room.phase,
    version: room.version,
    hostConnected: room.hostConnected,
    seats: room.seats.map((seat) => (seat ? { ...seat } : null)),
  };
}

function changed(room: StoredRoom) {
  room.version += 1;
  const view = snapshot(room);
  room.listeners.forEach((listener) => listener(view));
}

function sweep() {
  const now = Date.now();
  for (const [code, room] of rooms)
    if (room.hostConnections === 0 && now - room.lastHostSeen > ROOM_IDLE_MS)
      rooms.delete(code);
}

const newId = () => crypto.randomUUID().slice(0, 12);
const cleanName = (value: unknown) =>
  typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, NAME_MAX)
    : "";
const nameTaken = (room: StoredRoom, name: string) =>
  room.seats.some((seat) => seat?.name.toLowerCase() === name.toLowerCase());
const wizardTaken = (room: StoredRoom, wizard: string, exceptSeat?: string) =>
  room.seats.some(
    (seat) => seat && seat.wizard === wizard && seat.id !== exceptSeat,
  );
const findSeat = (room: StoredRoom, seatId: unknown) =>
  room.seats.find((seat) => seat && seat.id === seatId) ?? null;

/* ---------- lost wands ---------- */

// Created on first use: rooms that already existed before a hot reload don't have the map yet.
const lostTimers = (room: StoredRoom) => (room.lostTimers ??= new Map());

function cancelRemoval(room: StoredRoom, seatId: string) {
  const timers = lostTimers(room);
  clearTimeout(timers.get(seatId));
  timers.delete(seatId);
}

/** In the lobby, frees a lost seat once LOST_SEAT_MS has passed since it dropped off. */
function scheduleRemoval(room: StoredRoom, seatId: string) {
  cancelRemoval(room, seatId);
  const seat = findSeat(room, seatId);
  if (!seat || seat.lostAt === null || room.phase !== "lobby") return;
  const wait = Math.max(0, LOST_SEAT_MS - (Date.now() - seat.lostAt));
  lostTimers(room).set(
    seatId,
    setTimeout(() => {
      lostTimers(room).delete(seatId);
      const index = room.seats.findIndex((s) => s?.id === seatId);
      const lost = index >= 0 ? room.seats[index] : null;
      if (!lost || lost.connected || room.phase !== "lobby") return;
      room.seats[index] = null;
      changed(room);
    }, wait),
  );
}

export function openRoom(code: string): RelayRoom | null {
  if (!ROOM_CODE_PATTERN.test(code)) return null;
  sweep();
  let room = rooms.get(code);
  if (!room) {
    room = {
      code,
      phase: "lobby",
      version: 0,
      hostConnected: false,
      seats: Array.from({ length: ROOM_SEATS }, () => null),
      hostConnections: 0,
      seatConnections: new Map(),
      lastHostSeen: Date.now(),
      listeners: new Set(),
    };
    rooms.set(code, room);
  } else if (room.phase === "closed") {
    room.phase = "lobby";
    room.seats = Array.from({ length: ROOM_SEATS }, () => null);
  }
  changed(room);
  return snapshot(room);
}

export function closeRoom(code: string) {
  const room = rooms.get(code);
  if (!room) return;
  room.phase = "closed";
  changed(room);
}

const fail = (error: RelayError): RelayResult => ({ ok: false, error });

function seatPlayer(
  room: StoredRoom,
  rawName: unknown,
  isTest: boolean,
  wizard?: unknown,
): RelayResult {
  if (room.phase !== "lobby") return fail("not-in-lobby");
  const name = cleanName(rawName);
  if (!name) return fail("no-name");
  if (nameTaken(room, name)) return fail("name-taken");
  const index = room.seats.findIndex((seat) => !seat);
  if (index < 0) return fail("room-full");
  // Test wizards (no phone to choose with) take the first character nobody is playing.
  const chosen =
    isWizardClassId(wizard) && !wizardTaken(room, wizard)
      ? wizard
      : isTest
        ? (WIZARD_CLASS_IDS.find((id) => !wizardTaken(room, id)) ?? null)
        : null;
  const seat: RelaySeat = {
    id: newId(),
    name,
    wizard: chosen,
    ready: isTest,
    isTest,
    connected: isTest,
    lostAt: null,
  };
  room.seats[index] = seat;
  changed(room);
  return { ok: true, seatId: seat.id };
}

export function applyAction(code: string, action: RelayAction): RelayResult {
  if (!ROOM_CODE_PATTERN.test(code)) return fail("bad-code");
  const room = rooms.get(code);
  if (!room || room.phase === "closed") return fail("no-room");

  switch (action?.type) {
    case "join":
      return seatPlayer(room, action.name, false, action.wizard);
    case "addTest":
      return seatPlayer(room, action.name, true, undefined);
    case "selectWizard":
    case "setWizard": {
      const seat = findSeat(room, action.seatId);
      if (!seat) return fail("no-seat");
      if (room.phase !== "lobby") return fail("not-in-lobby");
      if (!isWizardClassId(action.wizard)) return fail("bad-request");
      if (action.type === "setWizard" && !seat.isTest)
        return fail("bad-request");
      if (wizardTaken(room, action.wizard, seat.id))
        return fail("wizard-taken");
      if (seat.wizard !== action.wizard) {
        seat.wizard = action.wizard;
        if (!seat.isTest) seat.ready = false;
        changed(room);
      }
      return { ok: true };
    }
    case "setReady": {
      const seat = findSeat(room, action.seatId);
      if (!seat) return fail("no-seat");
      if (room.phase !== "lobby") return fail("not-in-lobby");
      const ready = action.ready === true && seat.wizard !== null;
      if (seat.ready !== ready) {
        seat.ready = ready;
        changed(room);
      }
      return { ok: true };
    }
    case "leave":
    case "kick": {
      const index = room.seats.findIndex((seat) => seat?.id === action.seatId);
      if (index < 0) return fail("no-seat");
      cancelRemoval(room, action.seatId);
      room.seats[index] = null;
      changed(room);
      return { ok: true };
    }
    case "begin":
      // Nobody is dropped mid-game; lost wands just miss their turns.
      room.phase = "training";
      lostTimers(room).forEach(clearTimeout);
      lostTimers(room).clear();
      changed(room);
      return { ok: true };
    case "backToLobby":
      room.phase = "lobby";
      room.seats.forEach((seat) => {
        if (!seat || seat.isTest) return;
        seat.ready = false;
        // Wands still lost get a fresh countdown back in the lobby.
        if (!seat.connected) {
          seat.lostAt = Date.now();
          scheduleRemoval(room, seat.id);
        }
      });
      changed(room);
      return { ok: true };
    default:
      return fail("bad-request");
  }
}

/**
 * Follows a room. The host or a seat counts as connected while it has a subscription,
 * and as gone a few seconds after its last one ends (so a quick reload doesn't flicker).
 * Returns null when the room, or the asked-for seat, doesn't exist.
 */
export function subscribe(
  code: string,
  who: { role: "host" } | { role: "player"; seatId: string },
  listener: (room: RelayRoom) => void,
): (() => void) | null {
  const room = rooms.get(code);
  if (!room) return null;
  if (who.role === "player" && !findSeat(room, who.seatId)) return null;

  if (who.role === "host") {
    room.hostConnections += 1;
    room.lastHostSeen = Date.now();
    if (!room.hostConnected) {
      room.hostConnected = true;
      changed(room);
    }
  } else {
    room.seatConnections.set(
      who.seatId,
      (room.seatConnections.get(who.seatId) ?? 0) + 1,
    );
    const seat = findSeat(room, who.seatId);
    cancelRemoval(room, who.seatId);
    if (seat && (!seat.connected || seat.lostAt)) {
      seat.connected = true;
      seat.lostAt = null;
      changed(room);
    }
  }
  // Join the listeners after the presence change, so this subscriber gets exactly one first snapshot.
  room.listeners.add(listener);
  listener(snapshot(room));

  return () => {
    room.listeners.delete(listener);
    if (who.role === "host") {
      room.hostConnections -= 1;
      room.lastHostSeen = Date.now();
      setTimeout(() => {
        if (room.hostConnections === 0 && room.hostConnected) {
          room.hostConnected = false;
          changed(room);
        }
      }, DISCONNECT_GRACE_MS);
    } else {
      const left = (room.seatConnections.get(who.seatId) ?? 1) - 1;
      room.seatConnections.set(who.seatId, left);
      setTimeout(() => {
        const seat = findSeat(room, who.seatId);
        if (
          seat &&
          !seat.isTest &&
          (room.seatConnections.get(who.seatId) ?? 0) === 0 &&
          seat.connected
        ) {
          seat.connected = false;
          seat.lostAt = Date.now();
          scheduleRemoval(room, seat.id);
          changed(room);
        }
      }, DISCONNECT_GRACE_MS);
    }
  };
}
