"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MoveId, SpellId } from "@/phone/content";
import type { CastVerdict } from "@/phone/session/types";
import { judgeCast } from "./judge";
import { getMediaAccess, startRecording } from "./mediaAccess";
import type { MotionSample } from "./motion/motionSample";
import {
  classifyMove,
  type MoveMeasurement,
  type MoveName,
} from "./motion/classifyMove";
import type { HeardResult, VoiceListener, VoiceStatus } from "./voice/listener";
import { matchSpellWord } from "./voice/matchWord";
import { createVoiceListener, learnFromListen } from "./voice/voiceEngine";

/*
 * One cast: hold the pad (or a move button), shout the word and do the move, then let go.
 *   holding  — motion readings are kept and the voice listener runs;
 *   judging  — the move is classified and the last words are waited for (at most ~1.5 s);
 *   result   — the verdict, with what was heard and felt, until the next hold.
 */

export type CastPhase = "idle" | "holding" | "judging" | "result";

export interface CastOutcome {
  readonly verdict: CastVerdict;
  /** The words heard, as the recogniser wrote them ("" for none). */
  readonly heard: string;
  /** The move used: felt by the sensors, or the move button held. */
  readonly move: MoveId | null;
  /** The sensor measurements, when the sensors were used. */
  readonly measured: MoveMeasurement | null;
  /** This cast had no voice: the move picked the spell. */
  readonly voiceOff: boolean;
  /** The built-in speech failed and this phone just switched to the on-device model. */
  readonly switchedVoice: boolean;
}

export function useHoldToCast(
  onResult: (outcome: CastOutcome) => void,
  /** Called once per hold, the moment a spell word is recognised: the player can swing now. */
  onWordLocked?: (spell: SpellId) => void,
) {
  const [phase, setPhase] = useState<CastPhase>("idle");
  /** The spell word heard during this hold, before letting go. */
  const [lockedWord, setLockedWord] = useState<SpellId | null>(null);
  const lockedRef = useRef<SpellId | null>(null);
  const onWordLockedRef = useRef(onWordLocked);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [outcome, setOutcome] = useState<CastOutcome | null>(null);
  const cast = useRef<{
    startedAt: number;
    stopMotion: (() => MotionSample[]) | null;
    listener: VoiceListener | null;
  } | null>(null);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
    onWordLockedRef.current = onWordLocked;
  }, [onResult, onWordLocked]);

  /** Pointer down: must run inside the tap, so the microphone may open. */
  const begin = useCallback(() => {
    if (cast.current) return;
    const access = getMediaAccess();
    lockedRef.current = null;
    setLockedWord(null);
    const listener =
      access.mic === "unavailable"
        ? null
        : createVoiceListener(setVoiceStatus, (transcript) => {
            const word = matchSpellWord(transcript);
            if (!word || lockedRef.current === word) return;
            lockedRef.current = word;
            setLockedWord(word);
            onWordLockedRef.current?.(word);
          });
    listener?.start();
    cast.current = {
      startedAt: performance.now(),
      stopMotion: access.motion === "granted" ? startRecording() : null,
      listener,
    };
    setOutcome(null);
    setPhase("holding");
  }, []);

  /** Pointer up. `buttonMove` is the move button held, when the sensors aren't used. */
  const release = useCallback(async (buttonMove?: MoveName) => {
    const current = cast.current;
    if (!current) return;
    setPhase("judging");
    const reading = current.stopMotion
      ? classifyMove(current.stopMotion())
      : null;
    const move: MoveId | null = buttonMove ?? reading?.move ?? null;
    const heard: HeardResult | null = current.listener
      ? await current.listener.stop()
      : null;
    cast.current = null;
    const switchedVoice = heard ? learnFromListen(heard) : false;
    const voiceOff = !current.listener;
    // The final transcript decides; a word locked in during the hold counts if the end lost it.
    const word: SpellId | null =
      (heard ? matchSpellWord(heard.transcript) : null) ?? lockedRef.current;
    const verdict = judgeCast({
      word,
      move,
      voiceOff,
      borderline: !buttonMove && (reading?.borderline ?? false),
      reactionMs: performance.now() - current.startedAt,
    });
    const result: CastOutcome = {
      verdict,
      heard: heard?.transcript ?? "",
      move,
      measured: reading?.measured ?? null,
      voiceOff,
      switchedVoice,
    };
    setOutcome(result);
    setVoiceStatus("idle");
    setPhase("result");
    onResultRef.current(result);
  }, []);

  /** The hold was interrupted (the pointer left, a call came in…): nothing is cast. */
  const cancel = useCallback(() => {
    cast.current?.listener?.abort();
    cast.current?.stopMotion?.();
    cast.current = null;
    setVoiceStatus("idle");
    setPhase("idle");
  }, []);

  useEffect(() => cancel, [cancel]);

  return { phase, voiceStatus, lockedWord, outcome, begin, release, cancel };
}
