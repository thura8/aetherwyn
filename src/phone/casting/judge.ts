import { spellById } from "@/phone/content";
import type { CastAttempt, CastVerdict } from "@/phone/session/types";

/** The word picks the spell; doing that spell's own move gives full power. */
export function judgeCast(attempt: CastAttempt): CastVerdict {
  if (!attempt.word)
    return {
      spell: null,
      power: "none",
      reason: "No word heard. Shout the spell's word as you swing.",
    };
  if (!attempt.move)
    return {
      spell: attempt.word,
      power: "none",
      reason: "No swing felt. Move the phone while you shout.",
    };
  const spell = spellById(attempt.word);
  return {
    spell: spell.id,
    power: attempt.move === spell.move ? "full" : "weak",
  };
}
