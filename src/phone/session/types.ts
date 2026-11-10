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
  /** Why nothing was cast (no word heard, too late…). */
  reason?: string;
}

export interface CastAttempt {
  word: SpellId | null;
  move: MoveId | null;
  /** Milliseconds from the prompt to release. */
  reactionMs: number;
}

export interface TrainingRound {
  spell: SpellId;
  index: number;
  count: number;
  stage: "prompt" | "casting" | "result";
  /** Epoch ms when the current stage ends. */
  endsAt: number;
  result:
    | (CastVerdict & { correct: boolean; reactionMs: number; points: number })
    | null;
  score: number;
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
  | {
      kind: "training";
      round: TrainingRound;
      summary: Record<string, number> | null;
    }
  | { kind: "battle"; battle: BattleState }
  /** The big screen is running something the phone has no screen for yet. */
  | { kind: "big-screen"; activity: "training" }
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
  cast(attempt: CastAttempt): CastVerdict;
  leave(): void;
  dispose(): void;
}
