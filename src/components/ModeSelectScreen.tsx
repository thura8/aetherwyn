import type { CSSProperties, ReactNode } from "react";
import { TitleWordmark } from "./TitleCrest";

/*
 * The mode-selection screen ("Choose your path"), shown on the big screen once wizards have
 * gathered in the lobby. src/experience/screens/modeSelect.ts paints each card's art from the 3D
 * world, keeps the cards in step with the room, and handles choosing a path.
 */

const staggerIndex = (index: number) => ({ "--i": index }) as CSSProperties;

/** A curling gold arm either side of the "Choose your path" heading. */
function HeadingFlourish({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      className="mode-flourish"
      viewBox="0 0 220 24"
      aria-hidden="true"
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M2 12h150" />
      <path d="M152 12c10 0 12-8 22-8s14 8 6 11-12-4-4-6" />
      <path d="M152 12c10 0 12 8 22 8" />
      <path d="M196 12l8-5 8 5-8 5z" className="mode-flourish-gem" />
      <circle cx="2" cy="12" r="2" className="mode-flourish-gem" />
    </svg>
  );
}

/** A scrolled corner for the screen's frame; rotated into each corner by CSS. */
function FrameCorner({ className }: { className: string }) {
  return (
    <svg className={`mode-corner ${className}`} viewBox="0 0 120 120" aria-hidden="true">
      <path d="M4 116V30C4 15 15 4 30 4h86" />
      <path d="M14 116V36c0-12 10-22 22-22h80" className="mode-corner-inner" />
      <path d="M30 4c0 14-12 26-26 26" />
      <path d="M4 60c10 0 16 6 16 16M60 4c0 10 6 16 16 16" />
      <circle cx="30" cy="30" r="5" className="mode-corner-gem" />
    </svg>
  );
}

function WandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20l11-11" />
      <path d="M15 3v3M15 12v3M9 6h3M18 6h3M17.5 3.5l-1.5 1.5M12.5 8.5L11 10" />
    </svg>
  );
}

function PlayersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c0-3.5 2.7-6 6-6s6 2.5 6 6z" />
      <circle cx="16.5" cy="8.5" r="2.6" />
      <path d="M15.6 13.2c3 .2 5.4 2.5 5.4 5.8h-4.4" />
    </svg>
  );
}

function Padlock({ className, gradientId }: { className: string; gradientId: string }) {
  return (
    <svg className={className} viewBox="0 0 64 80" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1c6" />
          <stop offset="0.35" stopColor="#f2c86e" />
          <stop offset="0.7" stopColor="#b8862f" />
          <stop offset="1" stopColor="#6e4a14" />
        </linearGradient>
      </defs>
      <path
        d="M16 34V24a16 16 0 0 1 32 0v10"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="7"
      />
      <rect x="6" y="32" width="52" height="42" rx="7" fill={`url(#${gradientId})`} />
      <rect
        x="10"
        y="36"
        width="44"
        height="34"
        rx="5"
        fill="none"
        stroke="#fff3cf"
        strokeOpacity="0.45"
      />
      <path d="M32 46a5 5 0 0 0-3 9l-1.5 8h9L35 55a5 5 0 0 0-3-9z" fill="#2a1a05" />
      <path d="M14 40c4 3 4 9 0 12M50 40c-4 3-4 9 0 12" stroke="#7a5418" fill="none" strokeWidth="1.6" />
    </svg>
  );
}

interface ModeCardProps {
  mode: "training" | "battle";
  index: number;
  title: string;
  description: string;
  cta: string;
  chipIcon: ReactNode;
  chip: string;
  react?: string;
}

/** One playable mode: the whole card is the button. */
function ModeCard({
  mode,
  index,
  title,
  description,
  cta,
  chipIcon,
  chip,
  react,
}: ModeCardProps) {
  return (
    <button
      type="button"
      className={`mode-card mode-${mode}`}
      id={`mode-${mode}`}
      data-mode={mode}
      data-react={react}
      aria-label={title}
      aria-describedby={`mode-${mode}-status mode-${mode}-desc`}
      style={staggerIndex(index)}
    >
      <span className="mode-card-frame" aria-hidden="true" />
      <span className="mode-gem mode-gem-top" aria-hidden="true" />
      <span className="mode-gem mode-gem-bottom" aria-hidden="true" />
      <span className="mode-art" aria-hidden="true">
        <canvas id={`mode-art-${mode}`} width={640} height={620} />
      </span>
      <span className="mode-chip" aria-hidden="true">
        {chipIcon}
        <span id={`mode-${mode}-chip`}>{chip}</span>
      </span>
      <span className="mode-sparks" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="mode-body">
        <span className="mode-title">{title}</span>
        <span className="mode-status" id={`mode-${mode}-status`}>
          Available
        </span>
        <span className="mode-desc" id={`mode-${mode}-desc`}>
          {description}
        </span>
        <span className="mode-cta" aria-hidden="true">
          <span className="mode-cta-face">{cta}</span>
        </span>
      </span>
    </button>
  );
}

export default function ModeSelectScreen() {
  return (
    <section
      className="screen out mode-screen"
      id="scr-modes"
      hidden
      aria-labelledby="modes-h"
    >
      <div className="mode-frame" aria-hidden="true">
        <FrameCorner className="tl" />
        <FrameCorner className="bl" />
        <FrameCorner className="br" />
      </div>
      <header className="mode-head">
        <div className="mode-wordmark">
          <TitleWordmark idPrefix="awm" />
        </div>
        <h2 className="mode-heading" id="modes-h">
          <HeadingFlourish />
          <span>Choose your path</span>
          <HeadingFlourish flip />
        </h2>
      </header>
      <div className="mode-cards">
        <ModeCard
          mode="training"
          index={0}
          title="Training Ground"
          description="Practise magic, learn spells and master gesture-based spell casting."
          cta="Enter training"
          chipIcon={<WandIcon />}
          chip="Wand connected"
          react="orb"
        />
        <ModeCard
          mode="battle"
          index={1}
          title="Multiplayer Battle"
          description="Challenge other wizards in magical battles. Play with 2–4 players."
          cta="Fight"
          chipIcon={<PlayersIcon />}
          chip="2–4 players"
        />
        <article
          className="mode-card mode-story locked"
          id="mode-story"
          aria-labelledby="mode-story-title"
          aria-describedby="mode-story-status mode-story-desc"
          style={staggerIndex(2)}
        >
          <span className="mode-card-frame" aria-hidden="true" />
          <span className="mode-gem mode-gem-top" aria-hidden="true" />
          <span className="mode-art" aria-hidden="true">
            <canvas id="mode-art-story" width={640} height={620} />
          </span>
          <span className="mode-seal" aria-hidden="true">
            <span className="mode-seal-ring" />
            <Padlock className="mode-padlock" gradientId="mode-lock-gold" />
            <span className="mode-ribbon">Coming soon</span>
          </span>
          <span className="mode-body">
            <h3 className="mode-title" id="mode-story-title">
              Story Mode
            </h3>
            <span className="mode-status" id="mode-story-status">
              Locked<span className="sr-only">: coming soon</span>
            </span>
            <span className="mode-desc" id="mode-story-desc">
              Embark on a magical adventure, explore mysterious worlds and face
              powerful enemies.
            </span>
          </span>
          <Padlock className="mode-padlock-small" gradientId="mode-lock-gold-small" />
        </article>
      </div>
      <button className="mode-return" id="modes-return" type="button">
        <span className="mode-return-face">
          <svg viewBox="0 0 40 24" aria-hidden="true">
            <path d="M14 3L3 12l11 9M3 12h34" />
            <path d="M24 8.5l3.5 3.5-3.5 3.5-3.5-3.5z" />
          </svg>
          Return to lobby
        </span>
      </button>
    </section>
  );
}
