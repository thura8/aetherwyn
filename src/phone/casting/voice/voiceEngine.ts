import { safeStorage } from "@/experience/device";
import { levels, releaseMicMeter } from "../mediaAccess";
import { browserSpeechConstructor, createBrowserSpeech } from "./browserSpeech";
import type { HeardResult, VoiceListener, VoiceStatus } from "./listener";
import { createVoskSpeech, loadVoiceModel, voskSupported } from "./voskSpeech";

/*
 * Picks how this phone hears the spell's word, and remembers it:
 *   1. "browser" — the phone's built-in speech recognition: free, nothing to download, but tuned
 *      for a phone held near the mouth;
 *   2. "vosk"    — the on-device model (~40 MB once), tuned to hear the phone at arm's length;
 *      used when the built-in one returns no words, or when the player picks far-field;
 *   3. "off"     — neither works: casts then come from the move alone, and are weak.
 */

export type VoiceEngine = "browser" | "vosk" | "off";

const STORAGE_KEY = "aetherwyn:voice-engine";
/** Built-in recogniser errors that mean it will never work on this phone. */
const BROWSER_FAILURES = new Set([
  "not-allowed",
  "service-not-allowed",
  "network",
  "audio-capture",
  "language-not-supported",
  "start-failed",
]);

const defaultEngine = (): VoiceEngine =>
  browserSpeechConstructor() ? "browser" : voskSupported() ? "vosk" : "off";

function storedEngine(): VoiceEngine | null {
  const value = safeStorage.get(STORAGE_KEY);
  return value === "browser" || value === "vosk" || value === "off"
    ? value
    : null;
}

let engine: VoiceEngine | null = null;
const listeners = new Set<() => void>();

export function getVoiceEngine(): VoiceEngine {
  if (typeof window === "undefined") return "browser";
  engine ??= storedEngine() ?? defaultEngine();
  return engine;
}
export const getServerVoiceEngine = (): VoiceEngine => "browser";
export function subscribeVoiceEngine(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Which engines this browser can run at all, for the voice choice. */
export const availableVoiceEngines = () => ({
  browser: browserSpeechConstructor() !== null,
  vosk: voskSupported(),
});

/** The player's own choice on the Your wand tab. */
export const chooseVoiceEngine = (next: "browser" | "vosk") =>
  setVoiceEngine(next);

function setVoiceEngine(next: VoiceEngine) {
  engine = next;
  safeStorage.set(STORAGE_KEY, next);
  listeners.forEach((listener) => listener());
  // Start the download straight away, so the next cast can already be heard.
  if (next === "vosk") void loadVoiceModel().catch(() => setVoiceEngine("off"));
}

/** A push-to-talk listener for the current engine, or null when voice is off. */
export function createVoiceListener(
  onStatus: (status: VoiceStatus) => void,
  /** The words heard so far, while still listening (for the "word locked in" signal). */
  onWords?: (transcript: string) => void,
): VoiceListener | null {
  const current = getVoiceEngine();
  const listener =
    current === "browser"
      ? createBrowserSpeech(onStatus, onWords)
      : current === "vosk"
        ? createVoskSpeech(onStatus, (level) => (levels.mic = level), onWords)
        : null;
  if (!listener) return null;
  return {
    start() {
      releaseMicMeter();
      listener.start();
    },
    stop: () => listener.stop(),
    abort: () => listener.abort(),
  };
}

/**
 * Learns from a finished listen. If the built-in recogniser heard sound but returned no words,
 * or refused outright, this phone switches to the on-device model. Returns true when it switched.
 */
export function learnFromListen(result: HeardResult): boolean {
  const current = getVoiceEngine();
  if (current === "browser") {
    const failed =
      (result.error !== null && BROWSER_FAILURES.has(result.error)) ||
      (result.heardSound && !result.transcript);
    if (!failed) return false;
    setVoiceEngine(voskSupported() ? "vosk" : "off");
    return true;
  }
  if (current === "vosk" && result.error === "voice-model") {
    setVoiceEngine("off");
    return true;
  }
  return false;
}
