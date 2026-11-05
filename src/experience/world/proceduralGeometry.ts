import * as THREE from "three";
import {
  mergeGeometries,
  mergeVertices,
  toCreasedNormals,
} from "three/addons/utils/BufferGeometryUtils.js";
import {
  createSeededRandom,
  smoothstep,
  type PerlinNoise,
  type RandomSource,
} from "./proceduralTextures";

const positionsOf = (geometry: THREE.BufferGeometry) =>
  geometry.attributes.position as THREE.BufferAttribute;

function randomUnitVector(random: RandomSource) {
  const z = random() * 2 - 1;
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(1 - z * z);
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    z,
    Math.sin(angle) * radius,
  );
}

function createWeldedSphere(detail: number) {
  const sphere = new THREE.IcosahedronGeometry(1, detail);
  sphere.deleteAttribute("normal");
  sphere.deleteAttribute("uv");
  return mergeVertices(sphere);
}

interface RockOptions {
  detail: number;
  seed: number;
  cuts: number;
  stretch: readonly [number, number, number];
  amplitude?: number;
}

export function createRockGeometry(
  noise: PerlinNoise,
  { detail, seed, cuts, stretch, amplitude = 0.22 }: RockOptions,
) {
  const geometry = createWeldedSphere(detail);
  const random = createSeededRandom(seed);
  const offset = seed * 7.31;
  const planes = Array.from({ length: cuts }, () => ({
    normal: randomUnitVector(random),
    distance: 0.4 + random() * 0.3,
  }));
  const positions = positionsOf(geometry);
  const vertex = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    vertex.fromBufferAttribute(positions, i);
    const originalX = vertex.x;
    const originalY = vertex.y;
    const originalZ = vertex.z;
    const displacement =
      1 +
      amplitude *
        noise.fbm(
          originalX * 1.4 + offset,
          originalY * 1.4,
          originalZ * 1.4,
          4,
        ) +
      amplitude *
        0.5 *
        (noise.ridged(originalX * 3 + offset, originalY * 3, originalZ * 3, 3) -
          0.45);
    vertex.multiplyScalar(displacement);
    vertex.x *= stretch[0];
    vertex.y *= stretch[1];
    vertex.z *= stretch[2];
    for (const plane of planes) {
      const depth = vertex.dot(plane.normal) - plane.distance;
      if (depth > 0) vertex.addScaledVector(plane.normal, -depth);
    }
    const micro =
      0.014 *
      noise.fbm(originalX * 7 + offset, originalY * 7, originalZ * 7, 3);
    vertex.x += originalX * micro;
    vertex.y += originalY * micro;
    vertex.z += originalZ * micro;
    positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  return toCreasedNormals(geometry, 0.55);
}

const scratchColorA = new THREE.Color();
const scratchColorB = new THREE.Color();

interface IslandGeometryOptions {
  radius: number;
  depth: number;
  seed: number;
  detail: number;
  grass: boolean;
  cuts: number;
  cutDistance?: readonly [number, number];
}

export function createIslandGeometry(
  noise: PerlinNoise,
  {
    radius,
    depth,
    seed,
    detail,
    grass,
    cuts,
    cutDistance = [0.8, 0.94],
  }: IslandGeometryOptions,
) {
  const welded = createWeldedSphere(detail);
  const random = createSeededRandom(seed);
  const offset = seed * 3.73;
  const planes = Array.from({ length: cuts }, () => {
    const angle = random() * Math.PI * 2;
    return {
      x: Math.cos(angle),
      z: Math.sin(angle),
      distance: cutDistance[0] + random() * (cutDistance[1] - cutDistance[0]),
    };
  });
  const slopes = Array.from({ length: Math.round(cuts * 1.2) }, () => {
    const angle = random() * Math.PI * 2;
    const tilt = 0.35 + random() * 0.6;
    const normal = new THREE.Vector3(
      Math.cos(angle) * Math.cos(tilt),
      -Math.sin(tilt),
      Math.sin(angle) * Math.cos(tilt),
    );
    const reach = 0.55 + random() * 0.3;
    return {
      normal,
      distance:
        reach *
        (radius * 0.62 * Math.cos(tilt) +
          (1.1 + depth * 0.42) * Math.sin(tilt)),
    };
  });
  const positions = positionsOf(welded);
  const vertex = new THREE.Vector3();
  const RIM_DROP = 1.1;
  for (let i = 0; i < positions.count; i++) {
    vertex.fromBufferAttribute(positions, i);
    const length = Math.hypot(vertex.x, vertex.z);
    const directionX = length > 1e-5 ? vertex.x / length : 1;
    const directionZ = length > 1e-5 ? vertex.z / length : 0;
    const wobble = noise.fbm(
      directionX * 1.2 + offset,
      directionZ * 1.2,
      offset * 0.3,
      3,
    );
    let shapedX = directionX * (1 + 0.14 * wobble);
    let shapedZ = directionZ * (1 + 0.14 * wobble);
    let y: number;
    let scale: number;
    if (vertex.y >= 0) {
      const edge = smoothstep(0.28, 0, vertex.y);
      y =
        -edge * edge * RIM_DROP +
        0.35 *
          noise.fbm(vertex.x * 2.5 + offset, 0.5, vertex.z * 2.5, 4) *
          (1 - edge);
      scale = length;
    } else {
      const underside = -vertex.y;
      const taper = Math.pow(1 - underside, 0.72);
      y = -RIM_DROP - Math.pow(underside, 1.08) * depth;
      const lobes =
        1 +
        0.38 *
          noise.fbm(
            directionX * 1.6 + offset,
            underside * 1.8,
            directionZ * 1.6,
            4,
          ) *
          smoothstep(0, 0.25, underside);
      const strata =
        (0.06 *
          Math.sin(
            y * 1.6 +
              2.2 *
                noise.noise3d(
                  directionX * 2 + offset,
                  y * 0.15,
                  directionZ * 2,
                ),
          ) +
          0.07 *
            (noise.ridged(
              directionX * 2.5 + offset,
              y * 0.45,
              directionZ * 2.5,
              3,
            ) -
              0.45)) *
        smoothstep(0, 0.12, underside);
      const flute =
        0.09 *
        (noise.ridged(directionX * 7 + offset, y * 0.04, directionZ * 7, 3) -
          0.4) *
        smoothstep(0, 0.1, underside);
      shapedX *= lobes * (1 + strata + flute);
      shapedZ *= lobes * (1 + strata + flute);
      scale = taper;
      y +=
        noise.fbm(directionX * 3 + offset, underside * 4, directionZ * 3, 3) *
        depth *
        0.06 *
        underside;
    }
    for (const plane of planes) {
      const excess = shapedX * plane.x + shapedZ * plane.z - plane.distance;
      if (excess > 0) {
        shapedX -= plane.x * excess;
        shapedZ -= plane.z * excess;
      }
    }
    vertex.set(shapedX * radius * scale, y, shapedZ * radius * scale);
    if (y < -RIM_DROP - 1)
      for (const slope of slopes) {
        const excess = vertex.dot(slope.normal) - slope.distance;
        if (excess > 0) vertex.addScaledVector(slope.normal, -excess);
      }
    positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  const geometry = toCreasedNormals(welded, 0.7);
  const finalPositions = positionsOf(geometry);

  const normals = geometry.attributes.normal;
  const colors = new Float32Array(finalPositions.count * 3);
  const rockA = new THREE.Color(0x7a7199);
  const rockB = new THREE.Color(0x4b4468);
  const rockC = new THREE.Color(0x8d7f9e);
  const deepRock = new THREE.Color(0x231e3a);
  const moss = new THREE.Color(0x355f50);
  const turf = new THREE.Color(0x3b7a5c);
  const darkTurf = new THREE.Color(0x2b5f4f);
  const bareStone = new THREE.Color(0x7a7298);
  for (let i = 0; i < finalPositions.count; i++) {
    const x = finalPositions.getX(i);
    const y = finalPositions.getY(i);
    const z = finalPositions.getZ(i);
    const normalY = normals.getY(i);
    const band =
      0.5 +
      0.5 *
        Math.sin(y * 1.1 + 1.5 * noise.noise3d(x * 0.15, y * 0.3, z * 0.15));
    scratchColorA
      .copy(rockA)
      .lerp(rockB, band)
      .lerp(
        rockC,
        smoothstep(
          0.6,
          0.9,
          noise.fbm(x * 0.08 + 3, y * 0.5, z * 0.08, 3) + 0.5,
        ) * 0.6,
      )
      .lerp(deepRock, smoothstep(depth * 0.15, depth * 0.95, -y));
    scratchColorA.multiplyScalar(1 + smoothstep(0.2, 0.7, normalY) * 0.18);
    const mossy =
      smoothstep(-RIM_DROP - 5, -RIM_DROP + 0.2, y) *
      smoothstep(-0.1, 0.5, normalY + noise.fbm(x * 0.3, y * 0.3, z * 0.3, 3)) *
      0.8;
    scratchColorA.lerp(moss, mossy);
    if (grass) {
      const top =
        smoothstep(0.45, 0.8, normalY) *
        smoothstep(-RIM_DROP - 0.6, -RIM_DROP * 0.4, y);
      scratchColorB
        .copy(turf)
        .lerp(
          darkTurf,
          0.5 + 0.5 * noise.fbm(x * 0.25 + offset, 0, z * 0.25, 3),
        )
        .lerp(
          bareStone,
          smoothstep(0.25, 0.5, noise.fbm(x * 0.18, 1, z * 0.18, 3)) * 0.6,
        );
      scratchColorA.lerp(scratchColorB, top);
    } else {
      scratchColorA.lerp(bareStone, smoothstep(0.6, 0.85, normalY) * 0.6);
    }
    const shade =
      0.88 + 0.24 * noise.fbm(x * 0.5 + offset, y * 0.5, z * 0.5, 2);
    colors[i * 3] = scratchColorA.r * shade;
    colors[i * 3 + 1] = scratchColorA.g * shade;
    colors[i * 3 + 2] = scratchColorA.b * shade;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  // rim radius per angle, for placing waterfalls on the real edge
  const RIM_BINS = 72;
  const binOf = (angle: number) =>
    ((Math.floor(((angle + Math.PI) / (Math.PI * 2)) * RIM_BINS) % RIM_BINS) +
      RIM_BINS) %
    RIM_BINS;
  const rimBins = new Float32Array(RIM_BINS);
  for (let i = 0; i < finalPositions.count; i += 3) {
    const y = finalPositions.getY(i);
    if (y < -RIM_DROP - 0.4) continue;
    const x = finalPositions.getX(i);
    const z = finalPositions.getZ(i);
    const bin = binOf(Math.atan2(x, z));
    rimBins[bin] = Math.max(rimBins[bin], Math.hypot(x, z));
  }
  const rimRadius = (angle: number) =>
    rimBins[binOf(Math.atan2(Math.sin(angle), Math.cos(angle)))] || radius;
  return { geometry, rimRadius };
}

function paintVerticalGradient(
  geometry: THREE.BufferGeometry,
  topColor: number,
  bottomColor: number,
  startY = 0,
  height = 1.4,
) {
  const positions = positionsOf(geometry);
  const colors = new Float32Array(positions.count * 3);
  const top = new THREE.Color(topColor);
  const bottom = new THREE.Color(bottomColor);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const k = Math.max(0, Math.min(1, (positions.getY(i) - startY) / height));
    color.copy(bottom).lerp(top, k);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  if (geometry.attributes.uv) geometry.deleteAttribute("uv");
  return geometry;
}

export function createPineGeometry(noise: PerlinNoise, seed: number) {
  const random = createSeededRandom(seed);
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.08, 0.16, 1.4, 6, 1);
  trunk.translate(0, 0.7, 0);
  parts.push(paintVerticalGradient(trunk, 0x3a2c2a, 0x2a1f22));
  const tierCount = 5 + Math.floor(random() * 2);
  for (let k = 0; k < tierCount; k++) {
    const heightFraction = k / (tierCount - 1);
    const tierRadius = 1.15 * (1 - heightFraction * 0.78);
    const tierHeight = 1.25 - heightFraction * 0.45;
    const cone = new THREE.ConeGeometry(tierRadius, tierHeight, 9, 2, true);
    const positions = positionsOf(cone);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      if (y < -tierHeight / 2 + 0.01) {
        const jitter = 1 + 0.22 * noise.noise3d(x * 3 + seed, k, z * 3);
        positions.setXYZ(
          i,
          x * jitter,
          y - 0.12 * Math.abs(noise.noise3d(x * 5, k + seed, z * 5)),
          z * jitter,
        );
      }
    }
    cone.computeVertexNormals();
    cone.rotateY(random() * Math.PI);
    cone.translate(0, 0.9 + heightFraction * 2.6 + tierHeight / 2, 0);
    parts.push(
      paintVerticalGradient(
        cone,
        0x2f6e5a,
        0x173b3b,
        0.9 + heightFraction * 2.6,
        tierHeight,
      ),
    );
  }
  return mergeGeometries(
    parts.map((part) => (part.index ? part.toNonIndexed() : part)),
    false,
  );
}
