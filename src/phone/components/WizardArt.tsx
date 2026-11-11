import type { ReactNode } from "react";
import type { WizardId } from "@/phone/content";

/*
 * Each wizard's element painted behind their figure on the card: embers for the Mage,
 * a ward for the Guardian, starlight for the Mystic, a rune circle for the Scholar.
 * Pure SVG; the .on card animates it (see .ph-elem in phone.css).
 */

const EMBERS = [
  [12, 150, 1.4, 0],
  [26, 158, 1, 1.2],
  [38, 146, 1.8, 2.6],
  [52, 160, 1.2, 0.6],
  [64, 152, 1.6, 3.1],
  [78, 156, 1, 1.8],
  [88, 148, 1.4, 4],
  [20, 162, 1.1, 3.5],
  [70, 164, 1.3, 2.2],
] as const;

const STARS = [
  [14, 22, 1.2],
  [30, 12, 0.8],
  [46, 30, 1],
  [82, 18, 1.4],
  [90, 44, 0.8],
  [10, 60, 0.9],
  [24, 84, 1.1],
  [86, 76, 1],
  [60, 10, 0.7],
  [72, 56, 0.8],
] as const;

function Mage() {
  return (
    <>
      <path
        className="flame"
        d="M0 160V118c8 6 10-10 18-18 0 10 6 14 10 8 2-12 12-20 14-34 6 12 14 18 12 34 6-4 8-14 6-22 10 8 18 22 16 40 4-6 8-10 8-18 8 10 16 24 16 40v52z"
        fill="url(#ph-ember-fill)"
      />
      {EMBERS.map(([x, y, r, delay]) => (
        <circle
          key={`${x}-${y}`}
          className="ember"
          cx={x}
          cy={y}
          r={r}
          style={{ animationDelay: `${-delay}s` }}
        />
      ))}
      <defs>
        <linearGradient id="ph-ember-fill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff9a3c" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ff5a1e" stopOpacity="0" />
        </linearGradient>
      </defs>
    </>
  );
}

function hexPath(cx: number, cy: number, r: number) {
  const points = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  });
  return `M${points.join("L")}z`;
}

const HEXES = Array.from({ length: 7 }, (_, row) =>
  Array.from({ length: 6 }, (_, col) => [
    col * 18 + (row % 2) * 9 - 2,
    row * 15.6 + 8,
  ]),
).flat();

function Guardian() {
  return (
    <>
      <g className="hexes">
        {HEXES.map(([x, y]) => (
          <path key={`${x}-${y}`} d={hexPath(x, y, 8.4)} />
        ))}
      </g>
      <path
        className="ward"
        d="M50 18l30 10v24c0 22-14 38-30 46-16-8-30-24-30-46V28z"
      />
    </>
  );
}

function Mystic() {
  return (
    <>
      <path
        className="crescent"
        d="M70 14a26 26 0 1 0 14 46 22 22 0 1 1-14-46z"
      />
      {STARS.map(([x, y, r], i) => (
        <path
          key={`${x}-${y}`}
          className="star"
          d={`M${x} ${y - r * 3}L${x + r * 0.7} ${y - r * 0.7}L${x + r * 3} ${y}L${x + r * 0.7} ${y + r * 0.7}L${x} ${y + r * 3}L${x - r * 0.7} ${y + r * 0.7}L${x - r * 3} ${y}L${x - r * 0.7} ${y - r * 0.7}z`}
          style={{ animationDelay: `${-i * 0.7}s` }}
        />
      ))}
      <ellipse className="swirl" cx="50" cy="70" rx="46" ry="16" />
    </>
  );
}

const RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ";

function Scholar() {
  return (
    <g className="runes">
      <circle cx="50" cy="56" r="40" />
      <circle cx="50" cy="56" r="31" strokeDasharray="2 3" />
      <path d="M50 22l29.4 51H20.6zM50 90L20.6 39h58.8z" />
      <path
        id="ph-scholar-ring"
        d="M50 20a36 36 0 1 1-.01 0"
        fill="none"
        stroke="none"
      />
      <text>
        <textPath
          href="#ph-scholar-ring"
          textLength="224"
          lengthAdjust="spacing"
        >
          {RUNES}
        </textPath>
      </text>
    </g>
  );
}

const SCENES: Record<WizardId, () => ReactNode> = {
  mage: Mage,
  guardian: Guardian,
  mystic: Mystic,
  scholar: Scholar,
};

export function ElementBackdrop({ wizard }: { wizard: WizardId }) {
  const Scene = SCENES[wizard];
  return (
    <svg
      className={`ph-elem ph-elem-${wizard}`}
      viewBox="0 0 100 160"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <Scene />
    </svg>
  );
}

/** The glowing rune disc each figure stands on, drawn flat and squashed into perspective by CSS. */
export function Pedestal() {
  return (
    <svg className="ph-pedestal" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" className="outer" />
      <circle cx="50" cy="50" r="38" className="ticks" />
      <path d="M50 14l31 54H19zM50 86L19 32h62z" className="tri" />
      <circle cx="50" cy="50" r="12" className="core" />
    </svg>
  );
}
