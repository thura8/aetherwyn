import { PRACTICE_SPELLS, spellById, type SpellId } from "@/phone/content";

/*
 * Matches heard speech against the spells' words, generously: practice should never fail because
 * the phone wrote "she" for "Shield!" or "higher" for "Fire!".
 *   1. each spell's word and its listed mishearings (content.ts `heardAs`);
 *   2. then a sound-alike rule for short words the lists don't have (only the practice spells:
 *      with two words this far apart, "starts like shi-/fi-" is enough);
 *   3. when several spell words are heard, the last one wins: players restart mid-shout.
 */

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Short words that sound like the start of each practice word. */
const SOUNDS_LIKE: Partial<Record<SpellId, RegExp>> = {
  "mystic-shield": /^(sh|ch|s)[eiy]/,
  "flame-burst": /^(f|ph|v)(i|y|ai|ia|ea|ir)/,
};
const SOUND_ALIKE_MAX_LETTERS = 7;

function spellForWord(
  word: string,
  spells: readonly SpellId[],
): SpellId | null {
  for (const id of spells) {
    const spell = spellById(id);
    if (spell.word.toLowerCase() === word || spell.heardAs.includes(word))
      return id;
  }
  if (word.length > SOUND_ALIKE_MAX_LETTERS) return null;
  for (const id of spells) {
    const pattern = SOUNDS_LIKE[id];
    if (pattern?.test(word)) return id;
  }
  return null;
}

/** The spell named in `transcript` (the last one, if several were), or null when none was. */
export function matchSpellWord(
  transcript: string,
  spells: readonly SpellId[] = PRACTICE_SPELLS,
): SpellId | null {
  let named: SpellId | null = null;
  for (const word of normalise(transcript))
    named = spellForWord(word, spells) ?? named;
  return named;
}
