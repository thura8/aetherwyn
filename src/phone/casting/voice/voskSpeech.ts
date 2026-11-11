import type { KaldiRecognizer, Model } from "vosk-browser";
import { PRACTICE_SPELLS, spellById } from "@/phone/content";
import {
  FINAL_RESULT_TIMEOUT_MS,
  type HeardResult,
  type VoiceListener,
  type VoiceStatus,
} from "./listener";

/*
 * Voice casting on the phone itself, with Vosk (Kaldi in WebAssembly) and a tiny grammar: the
 * practice words plus "[unk]". It records the microphone directly, so it doesn't depend on the
 * browser's speech service, works offline, and audio never leaves the phone. The package and the
 * ~40 MB model are only loaded on phones whose built-in speech returned no words.
 * Ported from the Aetherwyn game's vosk-listener.ts.
 */

const MODEL_URL = "/models/vosk-model-small-en-us-0.15.tar.gz";
/** The model file's size, for progress when the server doesn't say. */
const MODEL_BYTES = 41_184_862;
/** Audio louder than this (peak, 0–1, after the boost) counts as "sound heard". */
const SOUND_LEVEL = 0.03;
/**
 * Far-field listening: the phone is held at arm's length while casting, not at the mouth. The
 * browser's call processing (echo cancellation, noise suppression) treats a voice that far away
 * as background and filters it out, so it's switched off; this boost and a limiter make up the
 * level instead, without clipping a close shout.
 */
const FAR_FIELD_GAIN = 4;

type AudioContextClass = typeof AudioContext;
const audioContextClass = (): AudioContextClass | undefined =>
  typeof window === "undefined"
    ? undefined
    : (window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioContextClass })
        .webkitAudioContext);

/** Whether this browser can run the on-device recogniser at all. */
export const voskSupported = () =>
  typeof WebAssembly === "object" &&
  typeof Worker !== "undefined" &&
  typeof navigator !== "undefined" &&
  typeof navigator.mediaDevices?.getUserMedia === "function" &&
  audioContextClass() !== undefined;

/* ---------- the model: downloaded once, then cached by the browser ---------- */

export type VoiceModelState =
  | { readonly phase: "idle" }
  | { readonly phase: "downloading"; readonly percent: number }
  | { readonly phase: "unpacking" }
  | { readonly phase: "ready" }
  | { readonly phase: "failed"; readonly reason: string };

let modelPromise: Promise<Model> | null = null;
let modelState: VoiceModelState = { phase: "idle" };
const modelListeners = new Set<() => void>();

function setModelState(next: VoiceModelState) {
  modelState = next;
  modelListeners.forEach((listener) => listener());
}
export const subscribeVoiceModel = (listener: () => void) => {
  modelListeners.add(listener);
  return () => modelListeners.delete(listener);
};
export const getVoiceModelState = () => modelState;

/** Fetches the model here first, to show progress; the worker then reads it from the browser cache. */
async function prefetchModel() {
  const response = await fetch(MODEL_URL);
  if (!response.ok || !response.body)
    throw new Error(`HTTP ${response.status}`);
  const total = Number(response.headers.get("content-length")) || MODEL_BYTES;
  const reader = response.body.getReader();
  let received = 0;
  let shown = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    const percent = Math.min(100, Math.floor((received / total) * 100));
    if (percent !== shown) {
      shown = percent;
      setModelState({ phase: "downloading", percent });
    }
  }
}

/** Loads the model once per page (about 40 MB the first time, then from the browser's cache). */
export function loadVoiceModel(): Promise<Model> {
  if (!modelPromise) {
    setModelState({ phase: "downloading", percent: 0 });
    modelPromise = prefetchModel()
      // The recogniser can still try its own download.
      .catch(() => undefined)
      .then(() => {
        setModelState({ phase: "unpacking" });
        return import("vosk-browser");
      })
      .then(({ createModel }) => createModel(MODEL_URL, -1))
      .then(
        (model) => {
          setModelState({ phase: "ready" });
          return model;
        },
        (error: unknown) => {
          modelPromise = null; // allow a retry
          setModelState({
            phase: "failed",
            reason: error instanceof Error ? error.message : String(error),
          });
          throw error;
        },
      );
  }
  return modelPromise;
}

/** The words Vosk may hear: the practice words, plus "[unk]" so anything else isn't forced into one. */
const grammar = () => [
  ...PRACTICE_SPELLS.map((id) => spellById(id).word.toLowerCase()),
  "[unk]",
];

/* ---------- the microphone, opened once and kept for the visit ---------- */

interface MicInput {
  readonly context: AudioContext;
  /** Receives each block of audio while set. */
  onAudio: ((samples: Float32Array) => void) | null;
}

let mic: { context: AudioContext; input: Promise<MicInput> } | null = null;

/** Opens the microphone, or returns the open one. Must start inside the tap (iOS audio rules). */
function openMic(): Promise<MicInput> {
  if (mic) {
    if (mic.context.state === "suspended") void mic.context.resume();
    return mic.input;
  }
  const Context = audioContextClass();
  if (!Context) return Promise.reject(new Error("no AudioContext"));
  const context = new Context();
  void context.resume();
  const input = navigator.mediaDevices
    .getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    })
    .then((stream) => {
      const source = context.createMediaStreamSource(stream);
      // ScriptProcessorNode is old but works everywhere, iPhone included.
      const processor = context.createScriptProcessor(4096, 1, 1);
      const opened: MicInput = { context, onAudio: null };
      processor.onaudioprocess = (event) =>
        opened.onAudio?.(event.inputBuffer.getChannelData(0));
      const boost = context.createGain();
      boost.gain.value = FAR_FIELD_GAIN;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      source.connect(boost).connect(limiter).connect(processor);
      processor.connect(context.destination);
      window.addEventListener(
        "pagehide",
        () => {
          processor.disconnect();
          source.disconnect();
          stream.getTracks().forEach((track) => track.stop());
          void context.close();
        },
        { once: true },
      );
      return opened;
    });
  input.catch(() => {
    mic = null;
    void context.close();
  });
  mic = { context, input };
  return input;
}

const peakOf = (samples: Float32Array) => {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return peak;
};

/* ---------- the listener ---------- */

/** Push-to-talk around Vosk. `onLevel` gets the loudness (0–1) for the waveform. */
export function createVoskSpeech(
  onStatus: (status: VoiceStatus) => void,
  onLevel: (level: number) => void,
  /** The words heard so far, while still listening. */
  onWords: (transcript: string) => void = () => {},
): VoiceListener {
  let holding = false;
  /** The recogniser is up and fed: only then is there anything to wait for on release. */
  let listening = false;
  let session: Promise<{
    recogniser: KaldiRecognizer;
    input: MicInput;
  } | null> = Promise.resolve(null);
  let texts: string[] = [];
  let partial = "";
  let loudest = 0;
  let onFinal: (() => void) | null = null;

  const abort = () => {
    holding = false;
    listening = false;
    void session.then((running) => running?.recogniser.remove());
    session = Promise.resolve(null);
  };

  return {
    start() {
      holding = true;
      listening = false;
      texts = [];
      partial = "";
      loudest = 0;
      onStatus(modelState.phase === "ready" ? "starting" : "loading");
      const input = openMic(); // inside the tap
      session = Promise.all([loadVoiceModel(), input]).then(
        ([model, opened]) => {
          if (!holding) return null;
          const recogniser = new model.KaldiRecognizer(
            opened.context.sampleRate,
            JSON.stringify(grammar()),
          );
          recogniser.on("partialresult", (message) => {
            if (message.event !== "partialresult") return;
            partial = message.result.partial;
            if (partial) onStatus("hearing");
            onWords([...texts, partial].join(" "));
          });
          recogniser.on("result", (message) => {
            if (message.event !== "result") return;
            if (message.result.text) texts.push(message.result.text);
            partial = "";
            onWords(texts.join(" "));
            onFinal?.();
          });
          opened.onAudio = (samples) => {
            if (!holding) return;
            recogniser.acceptWaveformFloat(
              new Float32Array(samples),
              opened.context.sampleRate,
            );
            const peak = peakOf(samples);
            loudest = Math.max(loudest, peak);
            if (peak > SOUND_LEVEL) onStatus("hearing");
            onLevel(Math.min(1, peak * 2.5));
          };
          listening = true;
          onStatus("ready");
          return { recogniser, input: opened };
        },
        () => {
          onStatus({ error: modelPromise ? "audio-capture" : "voice-model" });
          return null;
        },
      );
    },

    async stop(): Promise<HeardResult> {
      holding = false;
      onLevel(0);
      // Letting go is a full tap: if iOS kept the audio paused on finger-down, this lets it run.
      if (mic?.context.state === "suspended") void mic.context.resume();
      // Never make the player wait for the model or the mic: if they weren't ready, nothing was heard.
      if (!listening) return { transcript: "", heardSound: false, error: null };
      listening = false;
      const running = await session;
      if (!running)
        return { transcript: "", heardSound: false, error: "audio-capture" };
      const { recogniser, input } = running;
      input.onAudio = null;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, FINAL_RESULT_TIMEOUT_MS);
        onFinal = () => {
          clearTimeout(timer);
          resolve();
        };
        recogniser.retrieveFinalResult();
      });
      onFinal = null;
      recogniser.remove();
      onStatus("idle");
      const transcript = [...texts, partial]
        .join(" ")
        .replace(/\[unk\]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { transcript, heardSound: loudest > SOUND_LEVEL, error: null };
    },

    abort,
  };
}
