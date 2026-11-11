import type { SoundEngine } from "./soundEngine";
import type { DeviceProfile } from "./device";
import type { Lifecycle } from "./lifecycle";
import type { WizardClassId } from "./world/characters/wizardClasses";
import type { World } from "./world/createWorld";

export type ScreenName = "title" | "lobby" | "join" | "training";

export interface Player {
  /** The relay's seat id; local-only players get a generated one. */
  id: string;
  name: string;
  /** The character this player chose; it stands on their casting circle. Null while a phone is still choosing. */
  wizardClass: WizardClassId | null;
  isTestWizard: boolean;
  /** Bound their wand on the phone ("I'm ready"). */
  ready: boolean;
  /** False when a phone has dropped off the room. */
  connected: boolean;
  /** Epoch ms when the phone dropped off; in the lobby the seat is freed 15 s later. */
  lostAt: number | null;
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

/** Restarts a class's CSS animation: removes it, forces a reflow, then adds it back. */
export function replayClass(element: HTMLElement, className: string) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

/** Looks up an element that app/page.tsx and its screen components always render. */
export const elementById = <TElement extends HTMLElement = HTMLElement>(
  id: string,
) => document.getElementById(id) as TElement;
