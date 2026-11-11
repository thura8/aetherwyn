"use client";

import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createSoundEngine, type SoundEngine } from "@/experience/soundEngine";

/*
 * Sound, haptics and button ripples for the phone. The big screen carries the music,
 * so the phone only plays short effects.
 */

interface Feedback {
  sound: SoundEngine;
  muted: boolean;
  toggleMuted(): void;
  /** Vibrates where the browser allows it (Android); iPhone browsers ignore it. */
  haptic(pattern: number | number[]): void;
}

const FeedbackContext = createContext<Feedback | null>(null);

export function useFeedback() {
  const feedback = use(FeedbackContext);
  if (!feedback)
    throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return feedback;
}

function addRipple(event: PointerEvent) {
  const button = (event.target as Element | null)?.closest?.(".btn");
  if (
    !(button instanceof HTMLElement) ||
    (button as HTMLButtonElement).disabled
  )
    return;
  const rect = button.getBoundingClientRect();
  const ripple = document.createElement("span");
  ripple.className = "ripple";
  ripple.style.left = `${event.clientX - rect.left}px`;
  ripple.style.top = `${event.clientY - rect.top}px`;
  button.append(ripple);
  setTimeout(() => ripple.remove(), 650);
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [sound] = useState(() => createSoundEngine({ music: false }));
  const [muted, setMuted] = useState(() => sound.muted);

  useEffect(() => {
    const unlock = () => sound.unlock();
    const pause = () => (document.hidden ? sound.suspend() : sound.resume());
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("pointerdown", addRipple);
    document.addEventListener("visibilitychange", pause);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("pointerdown", addRipple);
      document.removeEventListener("visibilitychange", pause);
    };
  }, [sound]);

  useEffect(() => () => sound.dispose(), [sound]);

  const feedback = useMemo<Feedback>(
    () => ({
      sound,
      muted,
      toggleMuted() {
        sound.unlock();
        sound.setMuted(!sound.muted);
        setMuted(sound.muted);
        if (!sound.muted) sound.press();
      },
      haptic(pattern) {
        try {
          navigator.vibrate?.(pattern);
        } catch {
          /* not allowed */
        }
      },
    }),
    [sound, muted],
  );

  return <FeedbackContext value={feedback}>{children}</FeedbackContext>;
}
