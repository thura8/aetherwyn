const SIGIL_CENTER = 120;
const GLYPH_LENGTH = 6;
const GLYPH_TILT = 0.9;
const STUD_SIZE = 5;

const pointOnCircle = (radius: number, angle: number) => ({
  x: SIGIL_CENTER + radius * Math.cos(angle),
  y: SIGIL_CENTER + radius * Math.sin(angle),
});

const evenAngles = (count: number) =>
  Array.from({ length: count }, (_, index) => (index / count) * Math.PI * 2);

/**
 * The rune sigil: layered rings that turn at different speeds around a cyan gem.
 * Its progress ring follows the inherited --p custom property (0 to 1).
 * `idPrefix` keeps gradient ids unique when more than one sigil is on a page.
 */
export default function Sigil({
  idPrefix = "aw",
  className,
}: {
  idPrefix?: string;
  className?: string;
}) {
  return (
    <svg
      className={className ? `sigil ${className}` : "sigil"}
      viewBox="0 0 240 240"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${idPrefix}-halo`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#94e1f3" stopOpacity="0.55" />
          <stop offset="0.35" stopColor="#9f8acf" stopOpacity="0.22" />
          <stop offset="1" stopColor="#47286e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${idPrefix}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4d2" />
          <stop offset="0.5" stopColor="#fadc98" />
          <stop offset="1" stopColor="#b8862f" />
        </linearGradient>
        <path
          id={`${idPrefix}-inscription`}
          d="M120 18 a102 102 0 1 1 -0.01 0"
        />
      </defs>
      <circle
        className="halo"
        cx="120"
        cy="120"
        r="118"
        fill={`url(#${idPrefix}-halo)`}
      />
      <g className="spin spin-slow">
        <text className="inscription">
          <textPath
            href={`#${idPrefix}-inscription`}
            textLength="628"
            lengthAdjust="spacing"
          >
            ✦ AETHERWYN ✦ BY STAR AND STONE ✦ THE GRAND DUEL AWAITS ✦ WAND AND
            WORD ✦
          </textPath>
        </text>
      </g>
      <circle className="ring-track" cx="120" cy="120" r="92" />
      <circle
        className="ring-fill"
        cx="120"
        cy="120"
        r="92"
        pathLength={100}
        stroke={`url(#${idPrefix}-gold)`}
      />
      <g className="spin spin-rev">
        <circle className="ring-ticks" cx="120" cy="120" r="84" />
        <g className="glyphs">
          {evenAngles(36).map((angle) => {
            const start = pointOnCircle(84, angle);
            const deltaX = GLYPH_LENGTH * Math.cos(angle + GLYPH_TILT);
            const deltaY = GLYPH_LENGTH * Math.sin(angle + GLYPH_TILT);
            return (
              <path
                key={angle}
                d={`M${start.x.toFixed(2)} ${start.y.toFixed(2)} l${deltaX.toFixed(2)} ${deltaY.toFixed(2)}`}
              />
            );
          })}
        </g>
      </g>
      <g className="spin spin-mid">
        <polygon
          className="tri"
          points="120.00,56.00 175.43,152.00 64.57,152.00"
        />
        <polygon
          className="tri"
          points="120.00,184.00 64.57,88.00 175.43,88.00"
        />
        <circle className="ring-thin" cx="120" cy="120" r="64" />
      </g>
      <g className="spin spin-fast">
        <circle className="ring-dash" cx="120" cy="120" r="50" />
        <g className="studs">
          {evenAngles(8).map((angle) => {
            const center = pointOnCircle(50, angle);
            return (
              <rect
                key={angle}
                x={(center.x - STUD_SIZE / 2).toFixed(2)}
                y={(center.y - STUD_SIZE / 2).toFixed(2)}
                width={STUD_SIZE}
                height={STUD_SIZE}
                transform={`rotate(45 ${center.x.toFixed(2)} ${center.y.toFixed(2)})`}
              />
            );
          })}
        </g>
      </g>
      <g className="rays">
        {evenAngles(16).map((angle, index) => {
          const inner = pointOnCircle(31, angle);
          const outer = pointOnCircle(index % 2 ? 37 : 42, angle);
          return (
            <line
              key={angle}
              x1={inner.x.toFixed(2)}
              y1={inner.y.toFixed(2)}
              x2={outer.x.toFixed(2)}
              y2={outer.y.toFixed(2)}
            />
          );
        })}
      </g>
      <circle className="ring-core" cx="120" cy="120" r="26" />
      <g className="gem">
        <rect
          x="111"
          y="111"
          width="18"
          height="18"
          transform="rotate(45 120 120)"
        />
        <rect
          className="gem-hi"
          x="115.5"
          y="115.5"
          width="9"
          height="9"
          transform="rotate(45 120 120)"
        />
      </g>
      <g className="orbit orbit-a">
        <circle className="spark" cx="120" cy="28" r="2.6" />
      </g>
      <g className="orbit orbit-b">
        <circle className="spark spark-gold" cx="120" cy="56" r="2" />
      </g>
      <g className="orbit orbit-c">
        <circle className="spark" cx="120" cy="214" r="1.8" />
      </g>
    </svg>
  );
}
