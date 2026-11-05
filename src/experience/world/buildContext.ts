import * as THREE from "three";
import type { PerlinNoise } from "./proceduralTextures";

/**
 * The world's one sequential random source. The whole layout depends on the order of its calls,
 * so builders must keep running in the order createWorld calls them.
 */
export class WorldRandom {
  constructor(public state: number) {}
  next = () => (this.state = (this.state * 16807) % 2147483647) / 2147483647;
}

export const hdrColor = (hex: number, intensity: number) =>
  new THREE.Color(hex).multiplyScalar(intensity);

export interface WorldBuildContext {
  scene: THREE.Scene;
  lowQuality: boolean;
  reducedMotion: boolean;
  random: WorldRandom;
  noise: PerlinNoise;
  glowTexture: THREE.Texture;
  /** Shader materials whose uTime uniform is advanced every frame. */
  timedMaterials: THREE.ShaderMaterial[];
}

export interface FrameTime {
  delta: number;
  elapsed: number;
  /** Elapsed time scaled down when reduced motion is on; drives ambient animation. */
  animationTime: number;
  /** Multiplier for ambient motion: 1, or 0.4 with reduced motion. */
  motionScale: number;
}

export interface WorldState {
  time: number;
  orbPower: number;
  orbTarget: number;
  portalBoost: number;
  shake: number;
  beamHeight: number;
  focus: "arena" | "portal";
  training: boolean;
}

export function createGlowSprite(
  color: number,
  intensity: number,
  size: number,
  texture: THREE.Texture,
) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      color: hdrColor(color, intensity),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sprite.scale.set(size, size, 1);
  return sprite;
}
