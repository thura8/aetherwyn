import type { SoundEngine } from "./soundEngine";
import type { DeviceProfile } from "./device";
import type { Lifecycle } from "./lifecycle";
import type { World } from "./world/createWorld";

export type ScreenName = "title" | "lobby" | "join" | "training";

interface Player {
  name: string;
  wizardClass: string;
  isTestWizard: boolean;
  /** True until the player's slot has played its entrance animation. */
  isNew: boolean;
}

export interface Room {
  code: string;
  players: (Player | null)[];
}

export interface ExperienceContext {
  lifecycle: Lifecycle;
  device: DeviceProfile;
  sound: SoundEngine;
  /** Null while the world is loading, and on devices without WebGL. */
  world: World | null;
  room: Room | null;
  screen: ScreenName;
  /** Seconds of slow motion left after a hit. */
  hitStopSeconds: number;
  showToast(message: string): void;
}

/** Looks up an element that app/page.tsx and its screen components always render. */
export const elementById = <TElement extends HTMLElement = HTMLElement>(
  id: string,
) => document.getElementById(id) as TElement;
