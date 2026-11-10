import type { WizardClassId } from "@/experience/world/characters/wizardClasses";

/*
 * The room relay's wire format, shared by the route handlers (src/app/api/rooms),
 * the big screen (src/experience/screens/lobby.ts) and the phone (src/phone/session/remoteRoom.ts).
 */

export const ROOM_SEATS = 4;
export const NAME_MAX = 20;
/** How long a phone that dropped off may stay away in the lobby before its seat is freed. */
export const LOST_SEAT_MS = 15000;

/** Room codes leave out 0, O, 1 and I, which are easy to misread on a big screen. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_PATTERN = new RegExp(
  `^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`,
);

export interface RelaySeat {
  id: string;
  name: string;
  wizard: WizardClassId | null;
  ready: boolean;
  /** Seated by the host's "Add test wizard", with no phone behind it. */
  isTest: boolean;
  connected: boolean;
  /** Epoch ms when this phone dropped off; null while connected. In the lobby the seat is freed LOST_SEAT_MS later. */
  lostAt: number | null;
}

export interface RelayRoom {
  code: string;
  phase: "lobby" | "training" | "closed";
  version: number;
  hostConnected: boolean;
  /** One entry per casting circle, in order; null is an empty circle. */
  seats: (RelaySeat | null)[];
}

export type RelayError =
  | "bad-code"
  | "no-room"
  | "room-full"
  | "name-taken"
  | "no-name"
  | "wizard-taken"
  | "no-seat"
  | "not-in-lobby"
  | "bad-request";

export type RelayAction =
  | { type: "join"; name: string; wizard?: WizardClassId }
  | { type: "selectWizard"; seatId: string; wizard: WizardClassId }
  | { type: "setReady"; seatId: string; ready: boolean }
  | { type: "leave"; seatId: string }
  | { type: "addTest"; name: string }
  | { type: "setWizard"; seatId: string; wizard: WizardClassId }
  | { type: "kick"; seatId: string }
  | { type: "begin" }
  | { type: "backToLobby" };

export type RelayResult =
  { ok: true; seatId?: string } | { ok: false; error: RelayError };

export const roomUrl = (code: string) =>
  `/api/rooms/${encodeURIComponent(code)}`;

/** Posts an action to the relay. Network failures come back as `no-room`. */
export async function sendRelayAction(
  code: string,
  action: RelayAction,
): Promise<RelayResult> {
  try {
    const response = await fetch(`${roomUrl(code)}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action),
    });
    return (await response.json()) as RelayResult;
  } catch {
    return { ok: false, error: "no-room" };
  }
}
