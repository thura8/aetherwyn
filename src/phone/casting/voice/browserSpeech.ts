import { isIosWebKit } from "../platform";
import { matchSpellWord } from "./matchWord";
import {
  FINAL_RESULT_TIMEOUT_MS,
  type HeardResult,
  type VoiceListener,
  type VoiceStatus,
} from "./listener";

/*
 * Push-to-talk around the browser's own speech recogniser (Web Speech API). Free and light, but
 * some phones return no words (often iPhones with Dictation off): voiceEngine.ts then switches to
 * the on-device model. Ported from the Aetherwyn game's speech-listener.ts.
 */

interface Alternative {
  readonly transcript: string;
}
interface Result {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: Alternative;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    readonly [index: number]: Result;
  };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { readonly error: string }) => void) | null;
  onend: (() => void) | null;
  onsoundstart?: (() => void) | null;
  onaudiostart?: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;

export function browserSpeechConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Errors that only mean "nothing was said" or "we stopped it". */
const QUIET_ERRORS = new Set(["no-speech", "aborted"]);
/** Single-phrase restarts per hold (a hold lasts seconds, a phrase about one). */
const MAX_RESTARTS = 10;

export function createBrowserSpeech(
  onStatus: (status: VoiceStatus) => void,
  /** The words heard so far, while still listening. */
  onWords: (transcript: string) => void = () => {},
): VoiceListener | null {
  const Recognition = browserSpeechConstructor();
  if (!Recognition) return null;
  // Safari on iPhone often never returns words in continuous mode; one phrase at a time,
  // restarted while the pad is held, works there.
  const singlePhrase = isIosWebKit();

  let recogniser: Recognition | null = null;
  let finals: string[][] = [];
  let interim = "";
  let heardSound = false;
  let error: string | null = null;
  let holding = false;
  let restarts = 0;
  let ended: Promise<void> = Promise.resolve();
  let endedResolve = () => {};

  const listen = () => {
    const rec = new Recognition();
    rec.lang = "en-US";
    rec.continuous = !singlePhrase;
    rec.interimResults = true;
    // Several guesses per phrase: the right word is sometimes the 2nd or 3rd.
    rec.maxAlternatives = 3;
    rec.onaudiostart = () => onStatus("ready");
    rec.onsoundstart = () => {
      heardSound = true;
      onStatus("hearing");
    };
    rec.onresult = (event) => {
      heardSound = true;
      onStatus("hearing");
      interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alternatives = Array.from(
          { length: result.length },
          (_, a) => result[a]?.transcript ?? "",
        );
        if (result.isFinal) finals.push(alternatives);
        else interim = alternatives[0] ?? "";
      }
      onWords(pickTranscript(finals, interim));
    };
    rec.onerror = (event) => {
      if (!QUIET_ERRORS.has(event.error)) {
        error = event.error;
        onStatus({ error: event.error });
      }
    };
    rec.onend = () => {
      if (
        holding &&
        singlePhrase &&
        recogniser === rec &&
        restarts < MAX_RESTARTS
      ) {
        restarts++;
        listen();
        return;
      }
      endedResolve();
    };
    recogniser = rec;
    try {
      rec.start();
    } catch {
      recogniser = null;
      error = "start-failed";
      onStatus({ error });
      endedResolve();
    }
  };

  return {
    start() {
      recogniser?.abort();
      holding = true;
      restarts = 0;
      finals = [];
      interim = "";
      heardSound = false;
      error = null;
      ended = new Promise((resolve) => (endedResolve = resolve));
      onStatus("starting");
      listen();
    },
    async stop(): Promise<HeardResult> {
      holding = false;
      const rec = recogniser;
      if (rec) {
        rec.stop();
        await Promise.race([
          ended,
          new Promise((resolve) =>
            setTimeout(resolve, FINAL_RESULT_TIMEOUT_MS),
          ),
        ]);
      }
      recogniser = null;
      onStatus("idle");
      return { transcript: pickTranscript(finals, interim), heardSound, error };
    },
    abort() {
      holding = false;
      recogniser?.abort();
      recogniser = null;
    },
  };
}

/** Among the recogniser's alternative spellings, prefers one that names a spell. */
function pickTranscript(finals: readonly string[][], interim: string): string {
  const candidates =
    finals.length === 0
      ? [interim]
      : finals.reduce<string[]>(
          (sentences, alternatives) =>
            sentences
              .flatMap((sentence) =>
                alternatives.map((a) => `${sentence} ${a}`),
              )
              .slice(0, 27),
          [""],
        );
  const naming = candidates.find((candidate) => matchSpellWord(candidate));
  return (naming ?? candidates[0] ?? "").trim().toLowerCase().slice(0, 120);
}
