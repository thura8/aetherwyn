"use client";

import MagicButton from "@/components/MagicButton";
import Sigil from "@/components/Sigil";
import { FiligreeFrame, GemDivider } from "./Glyphs";

/** Shown while a stored session finds its way back to the room. */
export function ReconnectingScene({ code }: { code: string | null }) {
  return (
    <div className="ph-system" role="status" aria-live="polite">
      <Sigil idPrefix="ph-reconnect" className="ph-system-sigil" />
      <p className="eyebrow">Room {code ?? ""}</p>
      <h1 className="ph-heading">Returning to the realm…</h1>
      <p className="ph-lead">Hold on. Your seat is kept for you.</p>
    </div>
  );
}

const CLOSED_COPY = {
  "host-closed": {
    eyebrow: "The portal has closed",
    title: "The host ended the session",
    lead: "Thank you for duelling. Scan a new code to play again.",
  },
  kicked: {
    eyebrow: "Removed from the room",
    title: "The host removed you",
    lead: "You can scan the code again to rejoin.",
  },
} as const;

export function ClosedScene({
  reason,
  code,
  onRejoin,
}: {
  reason: keyof typeof CLOSED_COPY;
  code: string;
  onRejoin(): void;
}) {
  const copy = CLOSED_COPY[reason];
  return (
    <div className="ph-system">
      <div className="ph-card ph-closed-card">
        <FiligreeFrame />
        <svg className="ph-closed-crest" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="26" />
          <path d="M32 10v44M10 32h44" opacity="0.35" />
          <path d="M22 22l20 20M42 22L22 42" />
        </svg>
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="ph-heading">{copy.title}</h1>
        <GemDivider />
        <p className="ph-lead">{copy.lead}</p>
        <MagicButton type="button" className="ph-cta" onClick={onRejoin}>
          Join another room
        </MagicButton>
        <p className="ph-foot">Room {code}</p>
      </div>
    </div>
  );
}

/** A slim banner over any scene when the big screen drops out. */
export function HostAwayBanner() {
  return (
    <div className="ph-banner" role="status">
      <span className="ph-banner-dot" aria-hidden="true" />
      The host has stepped away. Waiting for the big screen…
    </div>
  );
}
