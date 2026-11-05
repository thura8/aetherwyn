import type { CSSProperties } from "react";

/** Rising sparks: [horizontal position, duration, delay, size, sideways drift]. */
const MOTES = [
  ["33.4%", "8.1s", "-9.1s", "1.7px", "28px"],
  ["11.8%", "11.1s", "-12.7s", "2.0px", "-29px"],
  ["43.8%", "7.5s", "-1.3s", "2.6px", "32px"],
  ["14.6%", "8.6s", "-8.8s", "3.9px", "33px"],
  ["58.0%", "7.3s", "-3.1s", "2.9px", "-23px"],
  ["30.2%", "8.0s", "-1.6s", "2.3px", "-17px"],
  ["12.7%", "11.0s", "-2.6s", "1.7px", "-32px"],
  ["56.1%", "11.3s", "-6.9s", "2.8px", "0px"],
  ["46.8%", "13.5s", "-5.1s", "2.1px", "-17px"],
  ["68.7%", "8.7s", "-8.0s", "2.8px", "3px"],
  ["71.6%", "9.0s", "-13.7s", "1.8px", "13px"],
  ["18.5%", "9.4s", "-13.1s", "2.6px", "-31px"],
  ["74.9%", "11.0s", "-12.3s", "2.3px", "4px"],
  ["58.9%", "11.1s", "-6.4s", "3.6px", "-6px"],
  ["47.6%", "11.6s", "-0.8s", "3.3px", "33px"],
  ["96.4%", "12.8s", "-4.0s", "2.5px", "4px"],
  ["5.1%", "10.2s", "-2.4s", "1.8px", "-33px"],
  ["23.5%", "9.0s", "-10.3s", "2.5px", "23px"],
  ["10.6%", "10.1s", "-7.7s", "3.7px", "15px"],
  ["84.2%", "8.9s", "-5.8s", "2.4px", "8px"],
  ["93.0%", "8.1s", "-2.5s", "2.1px", "-11px"],
  ["4.1%", "12.8s", "-2.6s", "2.2px", "-22px"],
  ["42.4%", "9.6s", "-7.9s", "3.9px", "25px"],
  ["92.3%", "11.6s", "-10.4s", "2.6px", "31px"],
  ["39.9%", "9.8s", "-1.4s", "3.1px", "-33px"],
  ["20.9%", "13.9s", "-6.2s", "1.8px", "36px"],
] as const;

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
 * The full-screen loader. app/loading.tsx renders it as the first-paint Suspense fallback,
 * then app/page.tsx renders it again so src/experience can drive its progress and reveal.
 */
export default function LoadingScreen() {
  return (
    <div className="loader" id="loader" role="status" aria-live="polite">
      <div className="loader-nebula" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="loader-stars" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="loader-motes" aria-hidden="true">
        {MOTES.map(([x, duration, delay, size, drift]) => (
          <span
            key={`${x}-${delay}`}
            className="mote"
            style={
              {
                "--x": x,
                "--d": duration,
                "--delay": delay,
                "--s": size,
                "--drift": drift,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="loader-inner">
        <svg className="sigil" viewBox="0 0 240 240" aria-hidden="true">
          <defs>
            <radialGradient id="aw-halo" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#94e1f3" stopOpacity="0.55" />
              <stop offset="0.35" stopColor="#9f8acf" stopOpacity="0.22" />
              <stop offset="1" stopColor="#47286e" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="aw-gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff4d2" />
              <stop offset="0.5" stopColor="#fadc98" />
              <stop offset="1" stopColor="#b8862f" />
            </linearGradient>
            <path id="aw-inscription" d="M120 18 a102 102 0 1 1 -0.01 0" />
          </defs>
          <circle
            className="halo"
            cx="120"
            cy="120"
            r="118"
            fill="url(#aw-halo)"
          />
          <g className="spin spin-slow">
            <text className="inscription">
              <textPath
                href="#aw-inscription"
                textLength="628"
                lengthAdjust="spacing"
              >
                ✦ AETHERWYN ✦ BY STAR AND STONE ✦ THE GRAND DUEL AWAITS ✦ WAND
                AND WORD ✦
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
        <h2 className="loader-title">Aetherwyn</h2>
        <p className="loader-sub">The realm awakens</p>
        <div
          className="loader-meter"
          id="loader-meter"
          role="progressbar"
          aria-label="Loading the realm"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
        >
          <span className="meter-track" />
          <span className="meter-fill" />
          <span className="meter-spark" />
        </div>
        <p className="loader-text" id="loader-text">
          Opening the realm
        </p>
        <p className="loader-tip" id="loader-tip" />
      </div>
    </div>
  );
}
