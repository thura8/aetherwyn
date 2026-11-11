/*
 * The shape every voice engine shares: push-to-talk around one held cast.
 * `start()` runs inside the tap (iPhone only opens audio during one); `stop()` resolves with what
 * was heard, or null for silence.
 */

/** What the microphone is doing, so players can tell whether they're heard. */
export type VoiceStatus =
  | "idle"
  | "loading"
  | "starting"
  | "ready"
  | "hearing"
  | { readonly error: string };

export interface HeardResult {
  /** The words heard (lower case), or "" for none. */
  readonly transcript: string;
  /** Whether the microphone picked up sound at all, words or not. */
  readonly heardSound: boolean;
  /** An error the engine reported ("not-allowed", "network", …), if any. */
  readonly error: string | null;
}

export interface VoiceListener {
  start(): void;
  stop(): Promise<HeardResult>;
  abort(): void;
}

/** How long to wait for the final result after the pad is let go. */
export const FINAL_RESULT_TIMEOUT_MS = 1500;
