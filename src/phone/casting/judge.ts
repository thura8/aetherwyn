import { SPELLS, spellById } from "@/phone/content";
import type { CastAttempt, CastVerdict } from "@/phone/session/types";

/*
 * The cast rule, made easy: every honest attempt does something.
 *   word + its spell's move (or a borderline move)  → full power
 *   word + clearly the other move                   → weak, the word's spell
 *   word, no move                                   → weak, the word's spell
 *   move, no word (or the phone can't hear)         → weak, the move's spell
 *   nothing heard and no move                       → fizzle
 */
/** Voice detection is paused (see docs/playtest-log.md). While true, a clear move alone is a full-power cast. */
export const VOICE_PAUSED = true;

export function judgeCast(attempt: CastAttempt): CastVerdict {
  const moved = SPELLS.find((spell) => spell.move === attempt.move);
  const word = attempt.voiceOff ? null : attempt.word;

  if (word) {
    const spell = spellById(word);
    if (attempt.move === spell.move || (attempt.move && attempt.borderline))
      return { spell: spell.id, power: "full" };
    return {
      spell: spell.id,
      power: "weak",
      reason: attempt.move
        ? `${spell.word}! wants a ${spell.move === "raise" ? "raise" : "shake"}.`
        : "Swing it as you shout for full power.",
    };
  }
  if (moved && VOICE_PAUSED && attempt.voiceOff)
    return { spell: moved.id, power: "full" };
  if (moved)
    return {
      spell: moved.id,
      power: "weak",
      reason: attempt.voiceOff
        ? "This phone can't hear, so casts stay weak."
        : `Shout “${moved.word}!” too for full power.`,
    };
  return {
    spell: null,
    power: "none",
    reason: "Hold the circle, shout the word and swing.",
  };
}
