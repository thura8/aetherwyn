import type { ReactNode } from "react";
import type { SpellIcon } from "@/phone/content";

/*
 * Inline SVG ornaments and spell icons, after the UI kit board (art reference 05).
 * Icons draw in currentColor, so a parent sets their colour; no image files are needed.
 */

const SPELL_PATHS: Record<SpellIcon, ReactNode> = {
  fire: (
    <>
      <path d="M24 4c1.5 6.5 10 10 10 20.5a10 10 0 0 1-20 0c0-5.2 2.6-8 4.2-11.4.9 3.2 2.6 4.7 2.6 4.7S19.6 10.5 24 4z" />
      <path
        className="glyph-core"
        d="M24 22c.8 3.4 5 5 5 9.6a5 5 0 0 1-10 0c0-2.6 1.4-3.9 2.2-5.6.5 1.4 1.4 2 1.4 2s-.4-3.6 1.4-6z"
      />
    </>
  ),
  ice: (
    <>
      <path d="M24 4l5.5 15L24 44l-5.5-25z" />
      <path d="M14.5 14l4 9.5L16 40l-5.5-14z" />
      <path d="M33.5 14l4 12L32 40l-2.5-16.5z" />
      <path className="glyph-core" d="M24 12l2.2 7L24 32l-2.2-13z" />
    </>
  ),
  bolt: (
    <>
      <path d="M28.5 3L12 27h10l-4 18 18-25H26l5-17z" />
      <path className="glyph-core" d="M25 13l-6 10h6l-1.6 7 6.6-9.5h-5.5z" />
    </>
  ),
  vortex: (
    <>
      <path
        fill="none"
        d="M24 24.5c0-1.6 1.6-2.4 3-1.6 2.4 1.4 1.6 5.2-1 6.2-4 1.6-7.8-1.8-7.2-5.8.8-5.4 7-8 11.6-5.2 5.8 3.6 5.6 12.4-.2 16C22.8 38.6 13 35 11.8 26.8 10.4 17.4 18.4 9.6 27.6 10.6c11 1.2 16.4 14.4 10 23.2"
      />
      <circle className="glyph-core" cx="24.6" cy="25.6" r="2.4" />
    </>
  ),
  shield: (
    <>
      <path d="M24 4l16 5.5v11.6C40 32 32.6 39.6 24 44 15.4 39.6 8 32 8 21.1V9.5z" />
      <path
        className="glyph-core"
        d="M24 12l9 3.2v6.7c0 6.2-4 10.6-9 13.4-5-2.8-9-7.2-9-13.4v-6.7z"
      />
    </>
  ),
  pulse: (
    <>
      <circle fill="none" cx="24" cy="24" r="18" />
      <circle fill="none" cx="24" cy="24" r="11" strokeDasharray="3 3.2" />
      <path fill="none" d="M24 2v7M24 39v7M2 24h7M39 24h7" />
      <circle className="glyph-core" cx="24" cy="24" r="4.5" />
    </>
  ),
};

export function SpellGlyph({
  icon,
  className,
}: {
  icon: SpellIcon;
  className?: string;
}) {
  return (
    <svg
      className={className ? `ph-glyph ${className}` : "ph-glyph"}
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      {SPELL_PATHS[icon]}
    </svg>
  );
}

/** A gold rule with a gem in the middle and fading ends. */
export function GemDivider({ className }: { className?: string }) {
  return (
    <svg
      className={className ? `ph-divider ${className}` : "ph-divider"}
      viewBox="0 0 240 14"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="ph-rule"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="240"
          y2="0"
        >
          <stop offset="0" stopColor="#fadc98" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fadc98" />
          <stop offset="1" stopColor="#fadc98" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 7h104M136 7h104" stroke="url(#ph-rule)" strokeWidth="1" />
      <path d="M108 7l4-3 4 3-4 3z M124 7l4-3 4 3-4 3z" fill="#b8862f" />
      <path d="M120 1l6 6-6 6-6-6z" fill="#141a2e" stroke="#fadc98" />
      <path d="M120 4.5l2.5 2.5-2.5 2.5-2.5-2.5z" fill="#94e1f3" />
    </svg>
  );
}

/** A scrolled gold corner. Rotate it with the corner class to frame each side. */
function Filigree({ corner }: { corner: "tl" | "tr" | "bl" | "br" }) {
  return (
    <svg
      className={`ph-filigree ${corner}`}
      viewBox="0 0 40 40"
      aria-hidden="true"
    >
      <path d="M2 38V12C2 6.5 6.5 2 12 2h26" />
      <path d="M7 30V14c0-3.9 3.1-7 7-7h16" opacity="0.55" />
      <path d="M2 12c4 0 6 2 6 6s-3 5-5 3" />
      <path d="M12 2c0 4 2 6 6 6s5-3 3-5" />
      <path className="gem" d="M9 9l3-3 3 3-3 3z" />
    </svg>
  );
}

/** Four filigree corners for a framed box. */
export function FiligreeFrame() {
  return (
    <>
      <Filigree corner="tl" />
      <Filigree corner="tr" />
      <Filigree corner="bl" />
      <Filigree corner="br" />
    </>
  );
}

export function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      {muted ? (
        <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" />
      ) : (
        <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
      )}
    </svg>
  );
}

export function CheckRune() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="ph-check">
      <path d="M8 1l7 7-7 7-7-7z" />
      <path d="M5 8.2l2 2 4-4.4" />
    </svg>
  );
}
