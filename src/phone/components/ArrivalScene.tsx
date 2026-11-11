"use client";

import Sigil from "@/components/Sigil";
import { TitleWordmark } from "@/components/TitleCrest";
import { useFeedback } from "@/phone/feedback";

/**
 * The first thing a player sees after scanning: the sigil charges, the portal irises open
 * and the room's seal stamps in. It waits for a tap, which also unlocks sound on phones.
 */
export default function ArrivalScene({
  code,
  onDone,
}: {
  code: string | null;
  onDone(): void;
}) {
  const { sound, haptic } = useFeedback();

  return (
    <button
      type="button"
      className="ph-arrival"
      onClick={() => {
        sound.unlock();
        sound.whoosh();
        haptic(20);
        onDone();
      }}
      aria-label="Tap to enter the portal"
    >
      <span className="ph-arrival-portal" aria-hidden="true" />
      <Sigil idPrefix="ph-arrival" className="ph-arrival-sigil" />
      <span className="ph-arrival-word title">
        <TitleWordmark />
      </span>
      <span className="ph-arrival-tag">The portal opens</span>
      <span className="ph-seal" aria-hidden={!code}>
        <span className="ph-seal-ring" />
        <span className="ph-seal-label">Room</span>
        <span className="ph-seal-code">{code ?? "✦"}</span>
      </span>
      <span className="ph-arrival-skip">
        <span className="ph-arrival-skip-ring" aria-hidden="true" />
        Tap to enter
      </span>
    </button>
  );
}
