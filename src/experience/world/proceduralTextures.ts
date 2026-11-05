import * as THREE from "three";

export type RandomSource = () => number;

export function createSeededRandom(seed: number): RandomSource {
  let state = (seed * 9301 + 49297) % 2147483647 || 1;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export interface PerlinNoise {
  noise3d(x: number, y: number, z: number): number;
  fbm(x: number, y: number, z: number, octaves: number): number;
  ridged(x: number, y: number, z: number, octaves: number): number;
}

export function createPerlinNoise(seed: number): PerlinNoise {
  const random = createSeededRandom(seed);
  const permutation = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = permutation[i & 255];

  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + t * (b - a);
  const gradient = (hash: number, x: number, y: number, z: number) => {
    hash &= 15;
    const u = hash < 8 ? x : y;
    const v = hash < 4 ? y : hash === 12 || hash === 14 ? x : z;
    return (hash & 1 ? -u : u) + (hash & 2 ? -v : v);
  };

  function noise3d(x: number, y: number, z: number) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;
    return lerp(
      lerp(
        lerp(gradient(p[AA], x, y, z), gradient(p[BA], x - 1, y, z), u),
        lerp(gradient(p[AB], x, y - 1, z), gradient(p[BB], x - 1, y - 1, z), u),
        v,
      ),
      lerp(
        lerp(
          gradient(p[AA + 1], x, y, z - 1),
          gradient(p[BA + 1], x - 1, y, z - 1),
          u,
        ),
        lerp(
          gradient(p[AB + 1], x, y - 1, z - 1),
          gradient(p[BB + 1], x - 1, y - 1, z - 1),
          u,
        ),
        v,
      ),
      w,
    );
  }

  function fbm(x: number, y: number, z: number, octaves: number) {
    let amplitude = 0.5;
    let frequency = 1;
    let sum = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amplitude * noise3d(x * frequency, y * frequency, z * frequency);
      frequency *= 2.03;
      amplitude *= 0.5;
    }
    return sum;
  }

  function ridged(x: number, y: number, z: number, octaves: number) {
    let amplitude = 0.5;
    let frequency = 1;
    let sum = 0;
    for (let i = 0; i < octaves; i++) {
      let value =
        1 - Math.abs(noise3d(x * frequency, y * frequency, z * frequency));
      value *= value;
      sum += amplitude * value;
      frequency *= 2.1;
      amplitude *= 0.5;
    }
    return sum;
  }

  return { noise3d, fbm, ridged };
}

/** Tileable 2D value noise. The period doubles per octave so fbm stays seamless. */
function createTileableNoise(seed: number) {
  const hash = (x: number, y: number, period: number) => {
    x = ((x % period) + period) % period;
    y = ((y % period) + period) % period;
    let n = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const ease = (t: number) => t * t * (3 - 2 * t);

  function value(x: number, y: number, period: number) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = ease(x - xi);
    const yf = ease(y - yi);
    const a = hash(xi, yi, period);
    const b = hash(xi + 1, yi, period);
    const c = hash(xi, yi + 1, period);
    const d = hash(xi + 1, yi + 1, period);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  }

  function fbm(u: number, v: number, period: number, octaves: number) {
    let amplitude = 0.5;
    let sum = 0;
    let total = 0;
    let frequency = period;
    for (let i = 0; i < octaves; i++) {
      sum += amplitude * value(u * frequency, v * frequency, frequency);
      total += amplitude;
      frequency *= 2;
      amplitude *= 0.5;
    }
    return sum / total;
  }

  function ridged(u: number, v: number, period: number, octaves: number) {
    let amplitude = 0.5;
    let sum = 0;
    let total = 0;
    let frequency = period;
    for (let i = 0; i < octaves; i++) {
      let ridge =
        1 - Math.abs(value(u * frequency, v * frequency, frequency) * 2 - 1);
      ridge *= ridge;
      sum += amplitude * ridge;
      total += amplitude;
      frequency *= 2;
      amplitude *= 0.5;
    }
    return sum / total;
  }

  return { value, fbm, ridged };
}

export interface StoneTextures {
  normal: THREE.CanvasTexture;
  albedo: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
}

function toRepeatingTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

function fieldToCanvas(
  size: number,
  pixelAt: (index: number) => [number, number, number],
) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(size, size);
  const data = image.data;
  for (let i = 0; i < size * size; i++) {
    const [red, green, blue] = pixelAt(i);
    data[i * 4] = red;
    data[i * 4 + 1] = green;
    data[i * 4 + 2] = blue;
    data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

export function heightFieldToNormalCanvas(
  heights: Float32Array,
  size: number,
  strength: number,
) {
  return fieldToCanvas(size, (i) => {
    const x = i % size;
    const y = (i / size) | 0;
    const left = heights[y * size + ((x - 1 + size) % size)];
    const right = heights[y * size + ((x + 1) % size)];
    const up = heights[((y - 1 + size) % size) * size + x];
    const down = heights[((y + 1) % size) * size + x];
    let normalX = (left - right) * strength;
    let normalY = (down - up) * strength;
    let normalZ = 1;
    const length = Math.hypot(normalX, normalY, normalZ);
    normalX /= length;
    normalY /= length;
    normalZ /= length;
    return [
      (normalX * 0.5 + 0.5) * 255,
      (normalY * 0.5 + 0.5) * 255,
      (normalZ * 0.5 + 0.5) * 255,
    ];
  });
}

function packStoneTextures(
  size: number,
  heights: Float32Array,
  albedo: Float32Array,
  roughness: Float32Array,
  normalStrength: number,
): StoneTextures {
  const grayscale = (field: Float32Array) =>
    fieldToCanvas(size, (i) => {
      const value = Math.max(0, Math.min(1, field[i])) * 255;
      return [value, value, value];
    });
  return {
    normal: toRepeatingTexture(
      heightFieldToNormalCanvas(heights, size, normalStrength),
    ),
    albedo: toRepeatingTexture(grayscale(albedo)),
    rough: toRepeatingTexture(grayscale(roughness)),
  };
}

export function createRockTextures(size: number, seed: number) {
  const noise = createTileableNoise(seed);
  const heights = new Float32Array(size * size);
  const albedo = new Float32Array(size * size);
  const roughness = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = y * size + x;
      const base = noise.fbm(u, v, 4, 5);
      const cracks = noise.ridged(u + 0.31, v + 0.17, 6, 4);
      const grit = noise.value(u * 128, v * 128, 128);
      const crack = Math.pow(Math.max(0, cracks - 0.55) / 0.45, 2.2);
      heights[i] =
        base * 0.65 +
        grit * 0.08 -
        crack * 0.55 +
        noise.fbm(u + 0.5, v, 16, 3) * 0.2;
      albedo[i] =
        0.5 +
        (base - 0.5) * 0.55 -
        crack * 0.28 +
        (grit - 0.5) * 0.12 +
        (noise.value(u * 24, v * 24, 24) > 0.78 ? 0.08 : 0);
      roughness[i] = 0.78 + grit * 0.18 - crack * 0.1;
    }
  return packStoneTextures(size, heights, albedo, roughness, 9);
}

export function createMasonryTextures(size: number, seed: number) {
  const noise = createTileableNoise(seed);
  const random = createSeededRandom(seed);
  const heights = new Float32Array(size * size);
  const albedo = new Float32Array(size * size);
  const roughness = new Float32Array(size * size);
  const ROW_COUNT = 6;
  const rowHeight = size / ROW_COUNT;
  const rows: { edges: number[]; shift: number; tones: number[] }[] = [];
  for (let k = 0; k < ROW_COUNT; k++) {
    const widths: number[] = [];
    let widthSum = 0;
    for (let j = 0; j < 3; j++) {
      const width = 0.7 + random() * 0.6;
      widths.push(width);
      widthSum += width;
    }
    let accumulated = 0;
    const edges = widths.map(
      (width) => (accumulated += (width / widthSum) * size),
    );
    rows.push({
      edges,
      shift: (k % 2) * size * 0.37 + random() * size * 0.1,
      tones: widths.map(() => 0.42 + random() * 0.2),
    });
  }
  const MORTAR_WIDTH = 3.2;
  for (let y = 0; y < size; y++) {
    const k = Math.floor(y / rowHeight);
    const row = rows[k];
    const localY = y - k * rowHeight;
    const distanceY = Math.min(localY, rowHeight - localY);
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      const shiftedX = (x + row.shift) % size;
      let j = 0;
      while (j < row.edges.length - 1 && shiftedX >= row.edges[j]) j++;
      const left = j === 0 ? 0 : row.edges[j - 1];
      const distanceX = Math.min(shiftedX - left, row.edges[j] - shiftedX);
      const edge = Math.min(distanceX, distanceY);
      const chip = noise.fbm(u, v, 32, 3);
      const bevel = Math.min(
        1,
        Math.max(0, (edge - MORTAR_WIDTH * (0.7 + chip)) / 6),
      );
      const face = noise.fbm(u + j * 0.13, v + k * 0.21, 8, 4);
      const grit = noise.value(u * 128, v * 128, 128);
      heights[i] = bevel * (0.75 + face * 0.25) + grit * 0.04;
      const inMortar = bevel < 0.05;
      albedo[i] = inMortar
        ? 0.3 + grit * 0.06
        : row.tones[j] +
          (face - 0.5) * 0.22 +
          (grit - 0.5) * 0.08 -
          (1 - bevel) * 0.08;
      roughness[i] = inMortar ? 0.95 : 0.74 + grit * 0.16;
    }
  }
  return packStoneTextures(size, heights, albedo, roughness, 7);
}

export function createSlateTextures(size: number, seed: number) {
  const noise = createTileableNoise(seed);
  const random = createSeededRandom(seed);
  const heights = new Float32Array(size * size);
  const albedo = new Float32Array(size * size);
  const roughness = new Float32Array(size * size);
  const ROW_COUNT = 8;
  const COLUMN_COUNT = 6;
  const rowHeight = size / ROW_COUNT;
  const columnWidth = size / COLUMN_COUNT;
  const tones = Array.from(
    { length: ROW_COUNT * COLUMN_COUNT },
    () => 0.42 + random() * 0.2,
  );
  for (let y = 0; y < size; y++) {
    const k = Math.floor(y / rowHeight);
    const localY = (y - k * rowHeight) / rowHeight;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const shiftedX = (x + (k % 2) * columnWidth * 0.5) % size;
      const column = Math.floor(shiftedX / columnWidth);
      const localX = (shiftedX - column * columnWidth) / columnWidth;
      const gap = Math.min(localX, 1 - localX) * columnWidth;
      const grit = noise.value((x / size) * 128, (y / size) * 128, 128);
      const face = noise.fbm(x / size, y / size, 8, 4);
      heights[i] =
        (1 - localY) * 0.55 +
        Math.min(1, gap / 2.5) * 0.25 +
        face * 0.12 +
        grit * 0.03 +
        (localY > 0.93 ? -0.3 : 0);
      albedo[i] =
        gap < 1.5 || localY > 0.93
          ? 0.28
          : tones[(k * COLUMN_COUNT + column) % tones.length] +
            (face - 0.5) * 0.16;
      roughness[i] = 0.55 + grit * 0.2;
    }
  }
  return packStoneTextures(size, heights, albedo, roughness, 6);
}

export function createMarbleTextures(size: number, seed: number) {
  const noise = createTileableNoise(seed);
  const heights = new Float32Array(size * size);
  const albedo = new Float32Array(size * size);
  const roughness = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = y * size + x;
      const field = noise.fbm(u, v, 4, 5);
      const grit = noise.value(u * 128, v * 128, 128);
      const vein = Math.pow(
        1 - Math.abs(Math.sin((u + v * 0.3 + field * 1.8) * Math.PI * 4)),
        18,
      );
      heights[i] = field * 0.25 + grit * 0.05 - noise.ridged(u, v, 8, 3) * 0.08;
      albedo[i] =
        0.55 + (field - 0.5) * 0.18 - vein * 0.12 + (grit - 0.5) * 0.05;
      roughness[i] = 0.5 + grit * 0.18 + vein * 0.1;
    }
  return packStoneTextures(size, heights, albedo, roughness, 4);
}

interface TriplanarOptions {
  scale: number;
  normal: number;
  albedo: number;
}

/** Patches a standard material to sample in object space, so textures stick to moving rocks. */
export function applyTriplanarMapping<
  TMaterial extends THREE.MeshStandardMaterial,
>(
  material: TMaterial,
  textures: StoneTextures,
  { scale, normal, albedo }: TriplanarOptions,
) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      triA: { value: textures.albedo },
      triN: { value: textures.normal },
      triR: { value: textures.rough },
      triScale: { value: scale },
      triNS: { value: normal },
      triAS: { value: albedo },
      triRS: { value: 1 },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vTriP; varying vec3 vTriN; varying vec3 vTriX; varying vec3 vTriY; varying vec3 vTriZ;",
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vTriP = transformed; vTriN = objectNormal;
        mat3 triM = normalMatrix;
        #ifdef USE_INSTANCING
          triM = normalMatrix * mat3(instanceMatrix);
        #endif
        vTriX = triM * vec3(1.0, 0.0, 0.0); vTriY = triM * vec3(0.0, 1.0, 0.0); vTriZ = triM * vec3(0.0, 0.0, 1.0);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vTriP; varying vec3 vTriN; varying vec3 vTriX; varying vec3 vTriY; varying vec3 vTriZ;
        uniform sampler2D triA; uniform sampler2D triN; uniform sampler2D triR;
        uniform float triScale; uniform float triNS; uniform float triAS; uniform float triRS;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        vec3 triNo = normalize(vTriN);
        vec3 tw = pow(abs(triNo), vec3(4.0)); tw /= (tw.x + tw.y + tw.z + 1e-5);
        vec3 tp = vTriP * triScale;
        vec3 tA = texture2D(triA, tp.zy).rgb * tw.x + texture2D(triA, tp.xz).rgb * tw.y + texture2D(triA, tp.xy).rgb * tw.z;
        diffuseColor.rgb *= mix(vec3(1.0), tA * 2.0, triAS);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        float tR = texture2D(triR, tp.zy).r * tw.x + texture2D(triR, tp.xz).r * tw.y + texture2D(triR, tp.xy).r * tw.z;
        roughnessFactor = clamp(roughnessFactor * mix(1.0, tR * 1.35, triRS), 0.04, 1.0);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          vec3 nX = texture2D(triN, tp.zy).xyz * 2.0 - 1.0; nX.xy *= triNS;
          vec3 nY = texture2D(triN, tp.xz).xyz * 2.0 - 1.0; nY.xy *= triNS;
          vec3 nZ = texture2D(triN, tp.xy).xyz * 2.0 - 1.0; nZ.xy *= triNS;
          nX = vec3(nX.xy + triNo.zy, abs(nX.z) * triNo.x);
          nY = vec3(nY.xy + triNo.xz, abs(nY.z) * triNo.y);
          nZ = vec3(nZ.xy + triNo.xy, abs(nZ.z) * triNo.z);
          vec3 oN = normalize(nX.zyx * tw.x + nY.xzy * tw.y + nZ.xyz * tw.z);
          normal = normalize(oN.x * vTriX + oN.y * vTriY + oN.z * vTriZ);
        }`,
      );
  };
  material.customProgramCacheKey = () => "tri-v1";
  return material;
}

export function createCloudCanvas(seed: number, size: number) {
  const noise = createTileableNoise(seed);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(size, size);
  const data = image.data;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;
      const ellipseX = (u - 0.5) / 0.48;
      const ellipseY = (v - 0.55) / (v < 0.55 ? 0.34 : 0.16);
      const shape = Math.max(
        0,
        1 - (ellipseX * ellipseX + ellipseY * ellipseY),
      );
      const density =
        noise.fbm(u, v, 4, 6) * 1.25 + noise.fbm(u + 0.3, v + 0.7, 8, 4) * 0.35;
      const alpha = smoothstep(0.42, 0.85, density * shape + shape * 0.35);
      const lit = 0.62 + 0.45 * (1 - v) + (density - 0.5) * 0.35;
      const light = Math.max(0, Math.min(1, lit));
      data[i] = 255 * light;
      data[i + 1] = 255 * light;
      data[i + 2] = 255 * Math.min(1, light * 1.04);
      data[i + 3] = 255 * alpha;
    }
  context.putImageData(image, 0, 0);
  return canvas;
}
