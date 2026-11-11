import type { CSSProperties } from "react";
import MagicButton from "./MagicButton";

/** One of the two practice spells, as the board's legend shows it. */
function SpellLegend({
  word,
  move,
  how,
  swatch,
}: {
  word: string;
  move: string;
  how: string;
  swatch: string;
}) {
  return (
    <li className="practice-legend" style={{ "--k": swatch } as CSSProperties}>
      <span className="practice-word">“{word}!”</span>
      <span className="practice-move">+ {move}</span>
      <span className="practice-how">{how}</span>
    </li>
  );
}

/**
 * Spell practice on the big screen. Players practise on their phones; src/experience/screens/
 * training.ts fills #practice-rows from the room and makes each wizard cast as their phone does.
 */
export default function TrainingScreen() {
  return (
    <section
      className="screen out flex items-center justify-start max-[760px]:items-end max-[760px]:justify-center"
      id="scr-training"
      hidden
      aria-labelledby="practice-h"
    >
      <div className="panel side">
        <div>
          <p className="eyebrow">Training grounds</p>
          <h2 className="text-[1.2rem]" id="practice-h">
            Spell practice
          </h2>
        </div>
        <p className="text-[0.98rem]">
          Practise on your phones: hold the circle, shout the word and do the
          move, then let go. The word picks the spell; the move gives it full
          power.
        </p>
        <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0">
          <SpellLegend
            word="Fire"
            move="raise"
            how="Lift the phone up"
            swatch="#ffc76a"
          />
          <SpellLegend
            word="Shield"
            move="shake"
            how="Shake two or three times"
            swatch="#e2d8ff"
          />
        </ul>
        <hr className="m-0 h-px bg-[linear-gradient(90deg,transparent,rgba(250,220,152,0.5),transparent)] [border:0]" />
        <ul
          className="m-0 flex list-none flex-col gap-2 p-0"
          id="practice-rows"
          aria-live="polite"
        />
        <p
          className="min-h-[1.2em] text-[0.95rem] italic"
          id="practice-status"
        />
        <MagicButton id="practice-done">Back to the lobby</MagicButton>
      </div>
    </section>
  );
}
