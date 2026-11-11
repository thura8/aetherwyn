import * as THREE from "three";
import type { FrameTime, WorldBuildContext } from "./buildContext";
import { TO_LINEAR_GLSL } from "./shaderChunks";

/*
 * Aether motes for the mode-selection vista: gold, cyan and violet sparks that rise slowly through
 * the air in front of the camera. They fade in only while that screen is up, and are skipped
 * entirely (not drawn) the rest of the time.
 *
 * Uses its own seeded random source, not the world's, so adding it doesn't move anything else.
 */

const MOTE_COLORS = [0xffd27a, 0x94e1f3, 0xc7a8ff, 0xfadc98];
/** The box the motes drift through, in world units (around the mode-selection camera's view). */
const VOLUME = { minX: -46, maxX: 46, minY: -4, maxY: 44, minZ: -36, maxZ: 40 };
const FADE_PER_SECOND = 1.4;

export function buildPathMotes(
  { scene, lowQuality, reducedMotion }: WorldBuildContext,
  pixelRatio: number,
) {
  let seed = 4021;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const count = lowQuality ? 140 : 280;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    positions[i * 3] = VOLUME.minX + rand() * (VOLUME.maxX - VOLUME.minX);
    positions[i * 3 + 1] = VOLUME.minY + rand() * (VOLUME.maxY - VOLUME.minY);
    positions[i * 3 + 2] = VOLUME.minZ + rand() * (VOLUME.maxZ - VOLUME.minZ);
    color.setHex(MOTE_COLORS[Math.floor(rand() * MOTE_COLORS.length)]);
    color.toArray(colors, i * 3);
    // mostly fine dust, with a few larger embers
    sizes[i] = 1.4 + Math.pow(rand(), 3) * 5.5;
    phases[i] = rand() * 100;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  // the motes move in the vertex shader, so the bounds must cover the whole volume
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 20, 2), 80);

  const height = VOLUME.maxY - VOLUME.minY;
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      uFade: { value: 0 },
      uPR: { value: pixelRatio },
    },
    vertexShader: `attribute float aSize; attribute float aPhase;
      uniform float uTime; uniform float uPR; varying vec3 vColor; varying float vA;
      void main(){
        vec3 p = position;
        float rise = uTime * (0.55 + fract(aPhase * 0.37) * 0.9);
        p.y = ${VOLUME.minY.toFixed(1)} + mod(p.y - ${VOLUME.minY.toFixed(1)} + rise, ${height.toFixed(1)});
        p.x += sin(uTime * 0.3 + aPhase) * 1.6;
        p.z += cos(uTime * 0.23 + aPhase * 1.3) * 1.2;
        // fade in at the bottom of the volume and out at the top, so wrapping is invisible
        float edge = smoothstep(0.0, 0.12, (p.y - ${VOLUME.minY.toFixed(1)}) / ${height.toFixed(1)})
          * (1.0 - smoothstep(0.8, 1.0, (p.y - ${VOLUME.minY.toFixed(1)}) / ${height.toFixed(1)}));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = edge * (0.55 + 0.45 * sin(uTime * (1.2 + fract(aPhase) * 2.4) + aPhase));
        vColor = color;
        gl_PointSize = aSize * uPR * (60.0 / max(8.0, -mv.z));
      }`,
    fragmentShader: `${TO_LINEAR_GLSL} uniform float uFade; varying vec3 vColor; varying float vA;
      void main(){
        vec2 d = gl_PointCoord - 0.5; float r = length(d);
        float core = smoothstep(0.5, 0.0, r);
        float a = core * core * vA * uFade;
        if (a < 0.004) discard;
        gl_FragColor = vec4(toLin(vColor) * 2.2, a);
      }`,
  });
  const motes = new THREE.Points(geometry, material);
  motes.frustumCulled = true;
  motes.visible = false;
  scene.add(motes);

  let target = 0;
  return {
    /** Fades the motes in (true) or out (false). */
    setActive(active: boolean) {
      target = active ? 1 : 0;
    },
    /** Hides them for an off-screen render (the mode cards' art) without changing their fade. */
    setHidden(hidden: boolean) {
      motes.visible = !hidden && material.uniforms.uFade.value > 0.001;
    },
    setPixelRatio(value: number) {
      material.uniforms.uPR.value = value;
    },
    update({ delta, animationTime }: FrameTime) {
      const fade = material.uniforms.uFade;
      const step = delta * FADE_PER_SECOND;
      fade.value =
        fade.value < target
          ? Math.min(target, fade.value + step)
          : Math.max(target, fade.value - step);
      motes.visible = fade.value > 0.001;
      material.uniforms.uTime.value = reducedMotion
        ? animationTime * 0.5
        : animationTime;
    },
  };
}
