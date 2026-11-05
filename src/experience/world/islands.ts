import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  hdrColor,
  type FrameTime,
  type WorldBuildContext,
} from "./buildContext";
import type { WorldMaterials } from "./materials";
import {
  createIslandGeometry,
  createPineGeometry,
  createRockGeometry,
} from "./proceduralGeometry";

/** [angle around the rim, width, height] */
type WaterfallSpec = [number, number, number];

interface IslandSpec {
  position: THREE.Vector3;
  radius: number;
  depth: number;
  trees?: number;
  waterfalls?: WaterfallSpec[];
  spin?: number;
  grass?: boolean;
  bobAmplitude?: number;
  boulders?: number;
  cutDistance?: readonly [number, number];
}

export function createIslandFactory(
  context: WorldBuildContext,
  materials: WorldMaterials,
  waterfallMaterial: THREE.ShaderMaterial,
) {
  const { scene, lowQuality, noise, glowTexture } = context;
  const rand = context.random.next;
  const islands: THREE.Group[] = [];
  const pines = [1, 2, 3].map((k) => createPineGeometry(noise, k * 17));
  const boulderShapes = [1, 2, 3].map((k) =>
    createRockGeometry(noise, {
      detail: lowQuality ? 1 : 2,
      seed: 60 + k,
      cuts: 5,
      stretch: [1.2, 0.7, 1],
    }),
  );

  function addWaterfall(
    group: THREE.Group,
    radius: number,
    angle: number,
    width: number,
    height: number,
  ) {
    const waterfall = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      waterfallMaterial,
    );
    const x = Math.sin(angle) * radius * 0.9;
    const z = Math.cos(angle) * radius * 0.9;
    waterfall.position.set(x, 0.2 - height / 2, z);
    waterfall.rotation.y = angle;
    group.add(waterfall);
    const mist = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: hdrColor(0x94e1f3, 0.5),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    mist.position.set(x * 1.02, 0.4, z * 1.02);
    mist.scale.set(width * 1.8, width * 1.2, 1);
    group.add(mist);
  }

  function addMergedScatter(
    group: THREE.Group,
    parts: THREE.BufferGeometry[],
    material: THREE.Material,
  ) {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(parts, false), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    parts.forEach((part) => part.dispose());
  }

  function createIsland({
    position,
    radius,
    depth,
    trees = 0,
    waterfalls = [],
    spin = 0.012,
    grass = true,
    bobAmplitude,
    boulders,
    cutDistance,
  }: IslandSpec) {
    const group = new THREE.Group();
    const island = createIslandGeometry(noise, {
      radius,
      depth,
      seed: 11 + islands.length * 7,
      detail: lowQuality ? 4 : radius >= 8 ? 5 : 4,
      grass,
      cutDistance,
      cuts: grass ? 6 : 4,
    });
    const rock = new THREE.Mesh(island.geometry, materials.rock);
    rock.receiveShadow = true;
    rock.castShadow = true;
    group.add(rock);

    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const place = new THREE.Vector3();
    const scale = new THREE.Vector3();

    const treeParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < trees; i++) {
      const angle = rand() * 6.28;
      const distance = radius * (0.42 + rand() * 0.4);
      const size = 0.55 + rand() * 0.7;
      rotation.setFromEuler(
        euler.set((rand() - 0.5) * 0.08, rand() * 6.28, (rand() - 0.5) * 0.08),
      );
      matrix.compose(
        place.set(
          Math.sin(angle) * distance,
          -0.25,
          Math.cos(angle) * distance,
        ),
        rotation,
        scale.set(size, size * (0.9 + rand() * 0.3), size),
      );
      treeParts.push(pines[i % 3].clone().applyMatrix4(matrix));
    }
    addMergedScatter(group, treeParts, materials.tree);

    const boulderCount = boulders != null ? boulders : Math.round(radius * 0.7);
    const boulderParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < boulderCount; i++) {
      const angle = rand() * 6.28;
      const distance = radius * (0.55 + rand() * 0.35);
      const size = 0.25 + Math.pow(rand(), 2) * 0.9;
      rotation.setFromEuler(euler.set(rand() * 6, rand() * 6, rand() * 6));
      matrix.compose(
        place.set(Math.sin(angle) * distance, -0.1, Math.cos(angle) * distance),
        rotation,
        scale.set(size, size, size),
      );
      boulderParts.push(boulderShapes[i % 3].clone().applyMatrix4(matrix));
    }
    addMergedScatter(group, boulderParts, materials.boulder);

    waterfalls.forEach(([angle, width, height]) =>
      addWaterfall(
        group,
        (island.rimRadius(angle) + 0.5) / 0.9,
        angle,
        width,
        height,
      ),
    );
    group.position.copy(position);
    group.userData = {
      base: position.clone(),
      phase: rand() * 6.28,
      amp: bobAmplitude != null ? bobAmplitude : 0.6 + rand() * 0.9,
      spin,
    };
    scene.add(group);
    islands.push(group);
    return group;
  }

  function updateIslands({ delta, animationTime, motionScale }: FrameTime) {
    islands.forEach((island) => {
      const { base, phase, amp, spin } = island.userData;
      island.position.y = base.y + Math.sin(animationTime * 0.45 + phase) * amp;
      island.rotation.y += spin * delta * motionScale;
    });
  }

  return { createIsland, updateIslands };
}
