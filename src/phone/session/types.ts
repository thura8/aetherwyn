import type { MoveId, SpellId, WizardId } from "@/phone/content";

/*
 * What the phone knows about its room. Shaped after the game server's room snapshot so a socket
 * client can replace the simulated room without changing any screen.
 */

export interface Seat {
  id: string;
  name: string;
  wizard: WizardId | null;
  ready: boolean;
  connected: boolean;
}

/** How a cast was judged: the word picks the spell; the spell's own move makes it full power. */
export interface CastVerdict {
  spell: SpellId | null;
  power: "full" | "weak" | "none";
  /** Why nothing was cast, or (for a weak cast) the one thing that would make it full power. */
  reason?: string;
}

export interface CastAttempt {
  word: SpellId | null;
  move: MoveId | null;
  /** Milliseconds from the prompt to release. */
  reactionMs: number;
  /** This phone can't hear (voice off), so the move picks the spell instead of the word. */
  voiceOff?: boolean;
  /** The move sat between a raise and a shake: it counts as whichever the spoken spell needs. */
  borderline?: boolean;
}

export interface Combatant {
  seatId: string;
  hp: number;
  mana: number;
  /** Turns left before each spell can be cast again. */
  cooldowns: Partial<Record<SpellId, number>>;
  shielded: boolean;
  bound: boolean;
  out: boolean;
}

export interface TurnReport {
  yourSpell: CastVerdict | null;
  dealt: number;
  taken: number;
  events: string[];
}

export interface BattleState {
  stage:
    | "round-intro"
    | "casting"
    | "locked"
    | "resolving"
    | "round-over"
    | "match-over";
  round: number;
  turn: number;
  bestOf: 1 | 3 | 5;
  endsAt: number;
  combatants: Combatant[];
  wins: Record<string, number>;
  target: string | null;
  lastTurn: TurnReport | null;
  roundWinner: string | null;
  matchWinner: string | null;
}

export type Phase =
  | { kind: "lobby" }
  | { kind: "battle"; battle: BattleState }
  /** Training: each player practises the spells at their own pace. */
  | { kind: "practice" }
  | { kind: "closed"; reason: "host-closed" | "kicked" };

export interface RoomSnapshot {
  code: string;
  youId: string;
  seats: Seat[];
  hostPresent: boolean;
  phase: Phase;
}

export type JoinError =
  "bad-code" | "no-room" | "room-full" | "name-taken" | "no-name";

export type ConnectionState = "idle" | "connecting" | "online" | "reconnecting";

export interface RoomSession {
  getSnapshot(): RoomSnapshot | null;
  getConnection(): ConnectionState;
  subscribe(listener: () => void): () => void;
  join(code: string, name: string): Promise<JoinError | null>;
  /** Rejoins the seat stored in this tab after a reload. Resolves false when there is none to rejoin. */
  resume(): Promise<boolean>;
  /** A one-off message for the join screen, such as why the last session ended. */
  getNotice(): string | null;
  /** The name to offer again on the join screen after a seat was lost. */
  getRejoinName(): string | null;
  selectWizard(wizard: WizardId): void;
  setReady(ready: boolean): void;
  chooseTarget(seatId: string): void;
  /** Tells the big screen how a practice cast went (`spell` is the one being practised). */
  reportPractice(
    spell: SpellId,
    power: CastVerdict["power"],
    /** Full-power casts in a row, this one included (0 when it wasn't full power). */
    streak: number,
  ): void;
  cast(attempt: CastAttempt): CastVerdict;
  leave(): void;
  dispose(): void;
}
