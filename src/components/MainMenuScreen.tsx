import type { CSSProperties } from "react";
import MagicButton from "./MagicButton";
import { TitleOrnament, TitleWordmark } from "./TitleCrest";

const staggerIndex = (index: number) => ({ "--i": index }) as CSSProperties;

export default function MainMenuScreen() {
  return (
    <main
      className="screen flex flex-col items-center justify-between max-[480px]:pt-[calc(env(safe-area-inset-top,0px)+64px)]"
      id="scr-title"
    >
      <header className="flex flex-col items-center gap-2.5 text-center">
        <h1 className="title">
          <TitleWordmark />
        </h1>
        <TitleOrnament />
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
