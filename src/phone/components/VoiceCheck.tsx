"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { requestMic } from "@/phone/casting/mediaAccess";
import type { VoiceListener } from "@/phone/casting/voice/listener";
import { matchSpellWord } from "@/phone/casting/voice/matchWord";
import {
  availableVoiceEngines,
  chooseVoiceEngine,
  createVoiceListener,
  getServerVoiceEngine,
  getVoiceEngine,
  learnFromListen,
  subscribeVoiceEngine,
} from "@/phone/casting/voice/voiceEngine";
import {
  getVoiceModelState,
  subscribeVoiceModel,
} from "@/phone/casting/voice/voskSpeech";
import { useFeedback } from "@/phone/feedback";

const IDLE_MODEL = { phase: "idle" } as const;

type CheckResult =
  | { kind: "heard"; words: string }
  | { kind: "words"; words: string }
  | { kind: "silence" }
  | { kind: "switched" };

const ENGINE_LABEL = {
  browser:
    "Listening with the phone's speech: best with the phone near your mouth",
  vosk: "Listening far-field, on this phone: works at arm's length",
  off: "Voice off: casts come from the move alone",
} as const;

const CHOICES = [
  { engine: "browser", label: "Phone's speech" },
  { engine: "vosk", label: "Far-field" },
] as const;

/**
 * "Hold and say Fire", with the phone held where you'd cast it: checks that this phone can hear the
 * spell words from there. The player picks the engine (the phone's own speech, or far-field on the
 * phone); if the phone's own speech returns nothing, it switches to far-field by itself.
 */
export default function VoiceCheck() {
  const { sound, haptic } = useFeedback();
  const engine = useSyncExternalStore(
    subscribeVoiceEngine,
    getVoiceEngine,
    getServerVoiceEngine,
  );
  const model = useSyncExternalStore(
    subscribeVoiceModel,
    getVoiceModelState,
    () => IDLE_MODEL,
  );
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const listener = useRef<VoiceListener | null>(null);

  const begin = () => {
    if (listener.current) return;
    listener.current = createVoiceListener(() => {});
    listener.current?.start();
    setListening(true);
    setResult(null);
  };

  const end = async () => {
    const current = listener.current;
    if (!current) return;
    listener.current = null;
    setListening(false);
    const heard = await current.stop();
    // The check closed the level meter's microphone; open it again.
    void requestMic();
    if (learnFromListen(heard)) {
      setResult({ kind: "switched" });
      sound.press();
      return;
    }
    if (matchSpellWord(heard.transcript)) {
      setResult({ kind: "heard", words: heard.transcript });
      sound.ignite();
      haptic(30);
    } else if (heard.transcript) {
      setResult({ kind: "words", words: heard.transcript });
      sound.tick(false);
    } else {
      setResult({ kind: "silence" });
      sound.miss();
    }
  };

  const modelLine =
    engine === "vosk" && model.phase === "downloading"
      ? ` · downloading ${model.percent}%`
      : engine === "vosk" && model.phase === "unpacking"
        ? " · preparing…"
        : "";

  const available = availableVoiceEngines();

  return (
    <div className="ph-voice-check">
      <div
        className="ph-voice-choice"
        role="radiogroup"
        aria-label="How your wand listens"
      >
        {CHOICES.map(({ engine: choice, label }) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={engine === choice}
            className={`ph-voice-option${engine === choice ? " on" : ""}`}
            disabled={!available[choice] || listening}
            onClick={() => {
              if (engine === choice) return;
              chooseVoiceEngine(choice);
              setResult(null);
              sound.hover();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="ph-step-hint">
        Hold the phone where you&rsquo;ll cast, at arm&rsquo;s length, then hold
        the button and say &ldquo;Fire!&rdquo;.
      </p>
      <button
        type="button"
        className={`btn small ph-voice-hold${listening ? " live" : ""}`}
        disabled={engine === "off"}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          begin();
        }}
        onPointerUp={() => void end()}
        onPointerCancel={() => {
          listener.current?.abort();
          listener.current = null;
          setListening(false);
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className="shine" />
        {listening ? "Listening… let go" : "Hold and say “Fire!”"}
      </button>
      <p className="ph-step-hint">
        {result?.kind === "heard"
          ? `Heard “${result.words}” from there. Your wand hears you.`
          : result?.kind === "words"
            ? `Heard “${result.words}”, but no spell word. Try “Fire!” or “Shield!”.`
            : result?.kind === "silence"
              ? engine === "browser"
                ? "Nothing heard from there. Say it louder, or switch to Far-field."
                : "Nothing heard. Hold the button and say it louder."
              : result?.kind === "switched"
                ? "This phone's speech returned no words, so it's switching to on-device voice. Try again once it's ready."
                : `${ENGINE_LABEL[engine]}${modelLine}.`}
      </p>
    </div>
  );
}
