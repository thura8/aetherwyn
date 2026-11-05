import type { CSSProperties } from "react";
import MagicButton from "./MagicButton";

const staggerIndex = (index: number) => ({ "--i": index }) as CSSProperties;

export default function MainMenuScreen() {
  return (
    <main
      className="screen flex flex-col items-center justify-between max-[480px]:pt-[calc(env(safe-area-inset-top,0px)+64px)]"
      id="scr-title"
    >
      <header className="flex flex-col items-center gap-2.5 text-center">
        <h1 className="title" aria-label="Aetherwyn">
          {[..."AETHERWYN"].map((letter, index) => (
            <span key={index} style={staggerIndex(index)} aria-hidden="true">
              {letter}
            </span>
          ))}
        </h1>
        <svg className="ornament" viewBox="0 0 520 22" aria-hidden="true">
          <path d="M8 11 H226 M294 11 H512" />
          <path d="M226 11 C238 3, 246 3, 252 11 M294 11 C282 3, 274 3, 268 11" />
          <path d="M40 15 H200 M320 15 H480" style={{ opacity: 0.5 }} />
          <rect
            className="gem"
            x="253"
            y="4"
            width="14"
            height="14"
            transform="rotate(45 260 11)"
          />
        </svg>
        <p className="tagline m-0 font-label text-[clamp(0.72rem,1.6vw,0.95rem)] font-medium tracking-[0.42em] text-[#E4DAFF] uppercase [text-shadow:0_1px_2px_rgba(8,8,24,1),0_0_14px_rgba(8,8,24,0.95)] max-[480px]:tracking-[0.28em]">
          The Grand Duel awaits
        </p>
      </header>
      <nav
        className="menu flex w-[min(340px,100%)] flex-col items-center gap-3"
        aria-label="Main menu"
      >
        <MagicButton
          className="primary"
          id="host"
          data-react="orb"
          style={staggerIndex(0)}
        >
          Enter the Battlefield
        </MagicButton>
        <MagicButton id="train" data-react="portal" style={staggerIndex(1)}>
          Training Grounds
        </MagicButton>
        <p
          className="mx-0 mt-1.5 mb-0 text-center text-[1rem] text-ink-dim italic [text-shadow:0_1px_8px_rgba(8,8,24,0.95)]"
          style={staggerIndex(2)}
        >
          Up to four wizards · players join from their phones with the room code
        </p>
      </nav>
    </main>
  );
}
