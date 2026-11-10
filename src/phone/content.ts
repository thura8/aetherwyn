import {
  WIZARD_CLASSES,
  WIZARD_CLASS_IDS,
  type WizardClassId,
} from "@/experience/world/characters/wizardClasses";

/*
 * Game content for the phone, from the game's design docs (spells and wizards).
 * Wizard ids and swatches come from wizardClasses.ts so the phone and the big screen agree.
 */

export type SpellId =
  | "flame-burst"
  | "frost-bind"
  | "arcane-bolt"
  | "astral-wave"
  | "mystic-shield"
  | "disarming-pulse";

export type MoveId =
  | "flick-up"
  | "flick-down"
  | "flick-right"
  | "flick-left"
  | "shake-up-down"
  | "shake-side";

export type SpellIcon = "fire" | "ice" | "bolt" | "vortex" | "shield" | "pulse";

export interface Spell {
  id: SpellId;
  name: string;
  /** The word the player shouts. It picks the spell. */
  word: string;
  move: MoveId;
  kind: "Attack" | "Defence" | "Control" | "Counter";
  description: string;
  icon: SpellIcon;
  manaCost: number;
  cooldownTurns: number;
  target: "one" | "self" | "all-opponents";
  damage: number;
  colour: string;
  glow: string;
}

export interface Move {
  id: MoveId;
  name: string;
  instruction: string;
}

export const MOVES: Record<MoveId, Move> = {
  "flick-up": {
    id: "flick-up",
    name: "Flick Up",
    instruction: "Snap your wrist up",
  },
  "flick-down": {
    id: "flick-down",
    name: "Flick Down",
    instruction: "Snap your wrist down",
  },
  "flick-right": {
    id: "flick-right",
    name: "Flick Right",
    instruction: "Snap the phone right, like swinging a door",
  },
  "flick-left": {
    id: "flick-left",
    name: "Flick Left",
    instruction: "Snap the phone left, like swinging a door",
  },
  "shake-up-down": {
    id: "shake-up-down",
    name: "Shake Up & Down",
    instruction: "Shake the phone up and down a few times",
  },
  "shake-side": {
    id: "shake-side",
    name: "Shake Side to Side",
    instruction: "Shake the phone left and right a few times",
  },
};

/** Default training order. */
export const SPELLS: readonly Spell[] = [
  {
    id: "flame-burst",
    name: "Flame Burst",
    word: "Fire",
    move: "flick-up",
    kind: "Attack",
    description: "An eruption of violet and golden flame.",
    icon: "fire",
    manaCost: 30,
    cooldownTurns: 1,
    target: "one",
    damage: 28,
    colour: "#b072ff",
    glow: "#ffc76a",
  },
  {
    id: "frost-bind",
    name: "Frost Bind",
    word: "Ice",
    move: "flick-down",
    kind: "Control",
    description: "Ice crystals that hold a target in place.",
    icon: "ice",
    manaCost: 20,
    cooldownTurns: 2,
    target: "one",
    damage: 10,
    colour: "#6fd6ff",
    glow: "#e3f9ff",
  },
  {
    id: "arcane-bolt",
    name: "Arcane Bolt",
    word: "Zap",
    move: "flick-right",
    kind: "Attack",
    description: "A fast bolt of raw arcane energy.",
    icon: "bolt",
    manaCost: 10,
    cooldownTurns: 0,
    target: "one",
    damage: 15,
    colour: "#2f7dff",
    glow: "#9fd8ff",
  },
  {
    id: "astral-wave",
    name: "Astral Wave",
    word: "Wave",
    move: "flick-left",
    kind: "Attack",
    description: "A sweeping wave of starlight across the arena.",
    icon: "vortex",
    manaCost: 25,
    cooldownTurns: 1,
    target: "all-opponents",
    damage: 12,
    colour: "#8a5cff",
    glow: "#d6c4ff",
  },
  {
    id: "mystic-shield",
    name: "Mystic Shield",
    word: "Shield",
    move: "shake-up-down",
    kind: "Defence",
    description: "A rune-carved dome that wards off incoming spells.",
    icon: "shield",
    manaCost: 15,
    cooldownTurns: 1,
    target: "self",
    damage: 0,
    colour: "#a68bff",
    glow: "#e2d8ff",
  },
  {
    id: "disarming-pulse",
    name: "Disarming Pulse",
    word: "Stop",
    move: "shake-side",
    kind: "Counter",
    description: "A golden ring that cancels an opponent's spell.",
    icon: "pulse",
    manaCost: 15,
    cooldownTurns: 2,
    target: "self",
    damage: 0,
    colour: "#f2c45e",
    glow: "#94e1f3",
  },
];

const spellsById = new Map(SPELLS.map((spell) => [spell.id, spell]));
export const spellById = (id: SpellId) => spellsById.get(id)!;
export const spellForMove = (move: MoveId) =>
  SPELLS.find((spell) => spell.move === move)!;

export type WizardId = WizardClassId;

export interface Wizard {
  id: WizardId;
  name: string;
  title: string;
  element: string;
  lore: string;
  affinity: string;
  swatch: string;
  /** Head-and-shoulders crop, for small round sigils. */
  portrait: string;
  /** Full-body figure with a transparent background, for the wizard cards. */
  cutout: string;
  /** The cutout's pixel size, so its box is known before it loads. */
  cutoutSize: { width: number; height: number };
  /** Where the body's centre sits across the cutout (0–1), measured from the head and torso. */
  bodyCenter: number;
}

/** Measured from public/characters/portraits/*-cutout.png. */
const CUTOUTS: Record<WizardId, { width: number; bodyCenter: number }> = {
  mage: { width: 393, bodyCenter: 0.445 },
  guardian: { width: 506, bodyCenter: 0.529 },
  mystic: { width: 390, bodyCenter: 0.461 },
  scholar: { width: 358, bodyCenter: 0.491 },
};

const WIZARD_DETAILS: Record<
  WizardId,
  Omit<
    Wizard,
    | "id"
    | "name"
    | "swatch"
    | "portrait"
    | "cutout"
    | "cutoutSize"
    | "bodyCenter"
  >
> = {
  mage: {
    title: "Master of Fire & Ember",
    element: "Fire & Ember",
    lore: "Ember-crystal gauntlet and a fire-forged wand.",
    affinity: "Flame Burst deals 20% more damage",
  },
  guardian: {
    title: "Warden of the Spectral Shield",
    element: "Earth & Ward",
    lore: "Living-wood staff and a spectral shield.",
    affinity: "Mystic Shield blocks more and costs less",
  },
  mystic: {
    title: "Seer of the Astral Tides",
    element: "Astral & Starlight",
    lore: "Crescent galaxy staff and a star lantern.",
    affinity: "Astral Wave deals 25% more damage",
  },
  scholar: {
    title: "Keeper of the Runic Grimoire",
    element: "Arcane & Runes",
    lore: "Runic grimoire, medallion and talismans.",
    affinity: "Arcane Bolt hits harder; Disarming Pulse recharges sooner",
  },
};

export const WIZARDS: readonly Wizard[] = WIZARD_CLASS_IDS.map((id) => ({
  id,
  name: WIZARD_CLASSES[id].name,
  swatch: WIZARD_CLASSES[id].swatch,
  portrait: `/characters/portraits/${id}.jpg`,
  cutout: `/characters/portraits/${id}-cutout.png`,
  cutoutSize: { width: CUTOUTS[id].width, height: 720 },
  bodyCenter: CUTOUTS[id].bodyCenter,
  ...WIZARD_DETAILS[id],
}));

const wizardsById = new Map(WIZARDS.map((wizard) => [wizard.id, wizard]));
export const wizardById = (id: WizardId) => wizardsById.get(id)!;
