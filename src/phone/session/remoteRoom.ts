import { judgeCast } from "@/phone/casting/judge";
import { isWizardClassId } from "@/experience/world/characters/wizardClasses";
import {
  readRejoinHint,
  readStoredSession,
  storeRejoinHint,
  storeSession,
} from "@/phone/session/storage";
import type {
  ConnectionState,
  JoinError,
  RoomSession,
  RoomSnapshot,
} from "@/phone/session/types";
import {
  ROOM_CODE_PATTERN,
  roomUrl,
  sendRelayAction,
  type RelayError,
  type RelayRoom,
} from "@/shared/relay";

/*
 * The phone's seat in a real room, relayed through this app's own server (src/app/api/rooms):
 * actions go out as POSTs and the room comes back as Server-Sent Events.
 */

const JOIN_ERRORS: Partial<Record<RelayError, JoinError>> = {
  "bad-code": "bad-code",
  "no-room": "no-room",
  "room-full": "room-full",
  "name-taken": "name-taken",
  "no-name": "no-name",
};

function toSnapshot(room: RelayRoom, seatId: string): RoomSnapshot {
  const seats = room.seats.flatMap((seat) =>
    seat
      ? [
          {
            id: seat.id,
            name: seat.name,
            wizard: seat.wizard,
            ready: seat.ready,
            connected: seat.connected,
          },
        ]
      : [],
  );
  const seated = seats.some((seat) => seat.id === seatId);
  return {
    code: room.code,
    youId: seatId,
    seats,
    hostPresent: room.hostConnected,
    phase:
      room.phase === "closed"
        ? { kind: "closed", reason: "host-closed" }
        : !seated
          ? { kind: "closed", reason: "kicked" }
          : room.phase === "training"
            ? { kind: "big-screen", activity: "training" }
            : { kind: "lobby" },
  };
}

export function createRemoteRoom(): RoomSession {
  let snapshot: RoomSnapshot | null = null;
  let connection: ConnectionState = "idle";
  let notice: string | null = null;
  let source: EventSource | null = null;
  let seat: { code: string; seatId: string; name: string } | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  // Coming back to the tab (unlocking the phone) reconnects at once instead of waiting for a retry.
  const onVisible = () => {
    if (document.visibilityState !== "visible" || !seat) return;
    if (!source || source.readyState === EventSource.CLOSED)
      void follow(seat.code, seat.seatId);
  };
  let watchingVisibility = false;

  function stop() {
    source?.close();
    source = null;
  }

  /** Stops following the room and forgets this tab's seat. Callers emit once they've updated the rest. */
  function disconnect() {
    stop();
    storeSession(null);
    connection = "idle";
  }

  function end(phase: "host-closed" | "kicked") {
    disconnect();
    if (snapshot)
      snapshot = { ...snapshot, phase: { kind: "closed", reason: phase } };
    emit();
  }

  /** Follows the room; resolves once the first snapshot (true) or a refusal (false) arrives. */
  function follow(code: string, seatId: string) {
    stop();
    if (!watchingVisibility) {
      watchingVisibility = true;
      document.addEventListener("visibilitychange", onVisible);
    }
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const events = new EventSource(
        `${roomUrl(code)}/events?seat=${encodeURIComponent(seatId)}`,
      );
      source = events;
      events.onmessage = (message) => {
        const room = JSON.parse(message.data) as RelayRoom;
        connection = "online";
        snapshot = toSnapshot(room, seatId);
        if (snapshot.phase.kind === "closed") end(snapshot.phase.reason);
        else emit();
        settle(true);
      };
      events.addEventListener("gone", () => {
        // This seat no longer exists: it was freed while the phone was away (or the room is gone).
        const you = snapshot?.seats.find((s) => s.id === seatId);
        const name =
          you?.name ?? seat?.name ?? readStoredSession()?.name ?? null;
        disconnect();
        snapshot = null;
        if (name) storeRejoinHint({ code, name, wizard: you?.wizard ?? null });
        notice = name
          ? `Your wand faded from room ${code} while you were away. Tap Enter to rejoin.`
          : `Room ${code} has closed. Scan the big screen's code to join again.`;
        emit();
        settle(false);
      });
      events.onerror = () => {
        if (events.readyState === EventSource.CLOSED) {
          settle(false);
          return;
        }
        // EventSource retries by itself; show that we're reaching for the room again.
        if (connection !== "reconnecting") {
          connection = "reconnecting";
          emit();
        }
      };
    });
  }

  return {
    getSnapshot: () => snapshot,
    getConnection: () => connection,
    getNotice: () => notice,
    getRejoinName: () => readRejoinHint()?.name ?? null,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async join(code, name) {
      code = code.trim().toUpperCase();
      if (!ROOM_CODE_PATTERN.test(code)) return "bad-code";
      if (!name.trim()) return "no-name";
      notice = null;
      connection = "connecting";
      emit();
      const result = await sendRelayAction(code, {
        type: "join",
        name: name.trim(),
      });
      if (!result.ok || !result.seatId) {
        connection = "idle";
        emit();
        return (result.ok ? null : JOIN_ERRORS[result.error]) ?? "no-room";
      }
      seat = { code, seatId: result.seatId, name: name.trim() };
      storeSession(seat);
      const following = await follow(code, result.seatId);
      // Back after the seat was freed: take the same wizard again if nobody claimed it.
      const hint = readRejoinHint();
      storeRejoinHint(null);
      if (following && hint?.code === code && isWizardClassId(hint.wizard))
        void sendRelayAction(code, {
          type: "selectWizard",
          seatId: result.seatId,
          wizard: hint.wizard,
        });
      return following ? null : "no-room";
    },
    async resume() {
      const stored = readStoredSession();
      if (!stored?.seatId) return false;
      seat = { code: stored.code, seatId: stored.seatId, name: stored.name };
      connection = "reconnecting";
      emit();
      return follow(stored.code, stored.seatId);
    },
    selectWizard(wizard) {
      if (seat)
        void sendRelayAction(seat.code, {
          type: "selectWizard",
          seatId: seat.seatId,
          wizard,
        });
    },
    setReady(ready) {
      if (seat)
        void sendRelayAction(seat.code, {
          type: "setReady",
          seatId: seat.seatId,
          ready,
        });
    },
    chooseTarget() {
      /* Battles arrive with gate 4. */
    },
    cast: (attempt) => judgeCast(attempt),
    leave() {
      if (seat && snapshot && snapshot.phase.kind !== "closed") {
        void sendRelayAction(seat.code, { type: "leave", seatId: seat.seatId });
        notice = `You left room ${seat.code}.`;
      }
      disconnect();
      seat = null;
      snapshot = null;
      emit();
    },
    dispose() {
      stop();
      listeners.clear();
      document.removeEventListener("visibilitychange", onVisible);
      watchingVisibility = false;
    },
  };
}
