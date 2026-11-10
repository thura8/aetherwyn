export const WIZARD_CLASS_IDS = [
  "mage",
  "guardian",
  "mystic",
  "scholar",
] as const;

export type WizardClassId = (typeof WIZARD_CLASS_IDS)[number];

interface WizardPalette {
  skin: number;
  hair: number;
  hairTip: number;
  coat: number;
  /** Inner tabard, scarf and other second-colour cloth. */
  accent: number;
  cloak: number;
  sleeve: number;
  glove: number;
  bracer: number;
  pants: number;
  boots: number;
  leather: number;
  /** Gold, bronze or silver: trims, buckles and armour. */
  metal: number;
  /** The class's magic colour. */
  glow: number;
}

export interface WizardClass {
  id: WizardClassId;
  name: string;
  /** CSS colour for the class's button in the menus. */
  swatch: string;
  /** The arm that holds the casting focus (wand, staff or open hand). */
  castArm: "L" | "R";
  palette: WizardPalette;
}

/** Colours follow the Aetherwyn character concept sheets. */
export const WIZARD_CLASSES: Record<WizardClassId, WizardClass> = {
  mage: {
    id: "mage",
    name: "The Elemental Mage",
    swatch: "#e2562a",
    castArm: "R",
    palette: {
      skin: 0xe9b48e,
      hair: 0x8f3d1f,
      hairTip: 0xb9552a,
      coat: 0x8f1b2d,
      accent: 0xc8571d,
      cloak: 0x8f1b2d,
      sleeve: 0x3a2b24,
      glove: 0x3a2b24,
      bracer: 0x4a3328,
      pants: 0x2b2627,
      boots: 0x33241d,
      leather: 0x4a3328,
      metal: 0xdba238,
      glow: 0xff7a1e,
    },
  },
  guardian: {
    id: "guardian",
    name: "The Guardian",
    swatch: "#3fbf8f",
    castArm: "R",
    palette: {
      skin: 0xd9a57c,
      hair: 0x2d2019,
      hairTip: 0x3a2a20,
      coat: 0x2f6b35,
      accent: 0x1f5a5e,
      cloak: 0x2a5f2f,
      sleeve: 0x2f6b35,
      glove: 0x4a3122,
      bracer: 0xa8763e,
      pants: 0x3a2a20,
      boots: 0x5a3b28,
      leather: 0x5a3b28,
      metal: 0xb07d42,
      glow: 0x4fe8d0,
    },
  },
  mystic: {
    id: "mystic",
    name: "The Mystic",
    swatch: "#8f6bff",
    castArm: "L",
    palette: {
      skin: 0xe2b193,
      hair: 0x2a2b62,
      hairTip: 0x6fc8f0,
      coat: 0x4c2a8e,
      accent: 0x4fa6b8,
      cloak: 0x3b2478,
      sleeve: 0x4fa6b8,
      glove: 0x35245e,
      bracer: 0x35245e,
      pants: 0x1b1d33,
      boots: 0x5a3b2a,
      leather: 0x4a3526,
      metal: 0xa9a3d6,
      glow: 0x9fb4ff,
    },
  },
  scholar: {
    id: "scholar",
    name: "The Arcane Scholar",
    swatch: "#4f8dff",
    castArm: "R",
    palette: {
      skin: 0xd9a98a,
      hair: 0x17171d,
      hairTip: 0x22222b,
      coat: 0x1d2c60,
      accent: 0x2a2f3a,
      cloak: 0x1d2c60,
      sleeve: 0x1d2c60,
      glove: 0x23232b,
      bracer: 0xb9c1cd,
      pants: 0x4a4031,
      boots: 0x5c3b27,
      leather: 0x5c3b27,
      metal: 0xb9c1cd,
      glow: 0x8fdcff,
    },
  },
};

export const isWizardClassId = (value: unknown): value is WizardClassId =>
  WIZARD_CLASS_IDS.includes(value as WizardClassId);
