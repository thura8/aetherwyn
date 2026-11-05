import * as THREE from "three";
import { hdrColor } from "./buildContext";
import {
  applyTriplanarMapping,
  type StoneTextures,
} from "./proceduralTextures";
import { TO_LINEAR_GLSL, UV_VERTEX_GLSL } from "./shaderChunks";

interface StoneTextureSet {
  rock: StoneTextures;
  masonry: StoneTextures;
  slate: StoneTextures;
  marble: StoneTextures;
}

const standard = (
  color: number,
  options: THREE.MeshStandardMaterialParameters,
) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0,
    ...options,
  });

export function createWorldMaterials({
  rock,
  masonry,
  slate,
  marble,
}: StoneTextureSet) {
  return {
    rock: applyTriplanarMapping(
      standard(0xffffff, { vertexColors: true, roughness: 0.95 }),
      rock,
      { scale: 0.14, normal: 1.1, albedo: 0.9 },
    ),
    boulder: applyTriplanarMapping(
      standard(0x6d6692, { roughness: 0.95 }),
      rock,
      { scale: 0.55, normal: 1.2, albedo: 0.9 },
    ),
    marble: applyTriplanarMapping(
      standard(0xb4aed6, { roughness: 0.7 }),
      marble,
      { scale: 0.32, normal: 0.8, albedo: 0.8 },
    ),
    tree: standard(0xffffff, { vertexColors: true, roughness: 0.88 }),
    stone: applyTriplanarMapping(
      standard(0xa9a3cc, { roughness: 0.82 }),
      masonry,
      { scale: 0.26, normal: 1.2, albedo: 0.9 },
    ),
    stoneFlat: applyTriplanarMapping(
      standard(0x9a94bf, { roughness: 0.85 }),
      masonry,
      { scale: 0.26, normal: 1.2, albedo: 0.9 },
    ),
    stoneDark: applyTriplanarMapping(
      standard(0x625b88, { roughness: 0.88 }),
      masonry,
      { scale: 0.2, normal: 1.3, albedo: 1 },
    ),
    roof: applyTriplanarMapping(
      standard(0x34428f, { roughness: 0.55, metalness: 0.05 }),
      slate,
      { scale: 0.42, normal: 1.4, albedo: 1 },
    ),
    gold: standard(0xd8a54c, { roughness: 0.3, metalness: 1.0 }),
    window: new THREE.MeshBasicMaterial({ color: hdrColor(0xffcf70, 2.2) }),
    dragon: new THREE.MeshStandardMaterial({
      color: 0x2b2252,
      roughness: 0.8,
      side: THREE.DoubleSide,
    }),
  };
}

export type WorldMaterials = ReturnType<typeof createWorldMaterials>;
export type WorldMaterialName = keyof WorldMaterials;

export function createWaterfallMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: UV_VERTEX_GLSL,
    fragmentShader: `${TO_LINEAR_GLSL} uniform float uTime; varying vec2 vUv;
      void main(){ float cols = sin(vUv.x * 38.0 + sin(vUv.x * 11.0) * 3.0) * 0.5 + 0.5;
        float s = fract(vUv.y * 2.5 + uTime * 0.9 + cols * 0.35); float streak = smoothstep(0.2, 1.0, s) * (0.4 + 0.6 * cols);
        float edge = smoothstep(0.0, 0.25, vUv.x) * (1.0 - smoothstep(0.75, 1.0, vUv.x)); float fall = smoothstep(0.0, 0.7, vUv.y);
        vec3 c = mix(vec3(0.5,0.78,0.95), vec3(0.9,0.97,1.0), streak);
        gl_FragColor = vec4(toLin(c) * (1.0 + streak * 0.6), (0.25 + 0.5 * streak) * edge * fall); }`,
  });
}
