// Ported from the prototype as plain JavaScript; it gets TypeScript types in a later step.
// ===================== AETHERWYN — realism toolkit =====================
// Procedural noise, tileable stone textures, a triplanar PBR patch, and
// generators for fractured rocks, cliff-sided floating islands and pines.
import * as THREE from 'three';
import { mergeVertices, mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- seeded RNG + improved Perlin noise ----------
export function rng(seed) { let s = (seed * 9301 + 49297) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export function makeNoise(seed = 1) {
  const r = rng(seed), perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const p = new Uint8Array(512); for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10), lerp = (a, b, t) => a + t * (b - a);
  const grad = (h, x, y, z) => { h &= 15; const u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z); return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); };
  function n3(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(lerp(lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u), lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u), lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  }
  function fbm(x, y, z, oct = 5) { let a = 0.5, f = 1, s = 0; for (let i = 0; i < oct; i++) { s += a * n3(x * f, y * f, z * f); f *= 2.03; a *= 0.5; } return s; }
  function ridged(x, y, z, oct = 4) { let a = 0.5, f = 1, s = 0; for (let i = 0; i < oct; i++) { let v = 1 - Math.abs(n3(x * f, y * f, z * f)); v *= v; s += a * v; f *= 2.1; a *= 0.5; } return s; }
  return { n3, fbm, ridged };
}

// tileable 2D value noise (period in lattice cells, doubles per octave so fbm stays seamless)
function tileNoise(seed) {
  const h = (x, y, P) => { x = ((x % P) + P) % P; y = ((y % P) + P) % P; let n = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const s = (t) => t * t * (3 - 2 * t);
  function vn(x, y, P) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
    const a = h(xi, yi, P), b = h(xi + 1, yi, P), c = h(xi, yi + 1, P), d = h(xi + 1, yi + 1, P);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  }
  function fbm(u, v, P, oct = 5) { let a = 0.5, s2 = 0, n = 0, f = P; for (let i = 0; i < oct; i++) { s2 += a * vn(u * f, v * f, f); n += a; f *= 2; a *= 0.5; } return s2 / n; }
  function ridged(u, v, P, oct = 4) { let a = 0.5, s2 = 0, n = 0, f = P; for (let i = 0; i < oct; i++) { let r = 1 - Math.abs(vn(u * f, v * f, f) * 2 - 1); r *= r; s2 += a * r; n += a; f *= 2; a *= 0.5; } return s2 / n; }
  return { vn, fbm, ridged };
}

// ---------- texture helpers ----------
function toTexture(canvas) { const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; }
function fieldToCanvas(S, fn) {
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++) { const [r, gg, b] = fn(i); d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return c;
}
export function heightToNormal(H, S, strength) {
  return fieldToCanvas(S, (i) => {
    const x = i % S, y = (i / S) | 0;
    const l = H[y * S + ((x - 1 + S) % S)], r = H[y * S + ((x + 1) % S)], u = H[((y - 1 + S) % S) * S + x], dn = H[((y + 1) % S) * S + x];
    let nx = (l - r) * strength, ny = (dn - u) * strength, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    return [(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255];
  });
}
function pack(S, H, A, R, strength) {
  return {
    normal: toTexture(heightToNormal(H, S, strength)),
    albedo: toTexture(fieldToCanvas(S, (i) => { const v = Math.max(0, Math.min(1, A[i])) * 255; return [v, v, v]; })),
    rough: toTexture(fieldToCanvas(S, (i) => { const v = Math.max(0, Math.min(1, R[i])) * 255; return [v, v, v]; })),
  };
}

// natural rock: layered fbm, ridged fractures, fine grit
export function rockTextures(S = 512, seed = 3) {
  const N = tileNoise(seed), H = new Float32Array(S * S), A = new Float32Array(S * S), R = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x;
    const base = N.fbm(u, v, 4, 5), cr = N.ridged(u + 0.31, v + 0.17, 6, 4), grit = N.vn(u * 128, v * 128, 128);
    const crack = Math.pow(Math.max(0, cr - 0.55) / 0.45, 2.2);
    H[i] = base * 0.65 + grit * 0.08 - crack * 0.55 + N.fbm(u + 0.5, v, 16, 3) * 0.2;
    A[i] = 0.5 + (base - 0.5) * 0.55 - crack * 0.28 + (grit - 0.5) * 0.12 + (N.vn(u * 24, v * 24, 24) > 0.78 ? 0.08 : 0);
    R[i] = 0.78 + grit * 0.18 - crack * 0.1;
  }
  return pack(S, H, A, R, 9);
}

// dressed masonry blocks in running bond, with chipped arrises and mortar
export function masonryTextures(S = 512, seed = 7) {
  const N = tileNoise(seed), r = rng(seed), H = new Float32Array(S * S), A = new Float32Array(S * S), R = new Float32Array(S * S);
  const ROWS = 6, rowH = S / ROWS, rows = [];
  for (let k = 0; k < ROWS; k++) {
    const n = 3, w = []; let sum = 0; for (let j = 0; j < n; j++) { const v = 0.7 + r() * 0.6; w.push(v); sum += v; }
    let acc = 0; const edges = w.map((v) => (acc += v / sum * S)); rows.push({ edges, shift: (k % 2) * S * 0.37 + r() * S * 0.1, tones: w.map(() => 0.42 + r() * 0.2) });
  }
  const mortar = 3.2;
  for (let y = 0; y < S; y++) {
    const k = Math.floor(y / rowH), row = rows[k], ly = y - k * rowH, dy = Math.min(ly, rowH - ly);
    for (let x = 0; x < S; x++) {
      const i = y * S + x, u = x / S, v = y / S, sx = (x + row.shift) % S;
      let j = 0; while (j < row.edges.length - 1 && sx >= row.edges[j]) j++;
      const left = j === 0 ? 0 : row.edges[j - 1], dx = Math.min(sx - left, row.edges[j] - sx);
      const edge = Math.min(dx, dy), chip = N.fbm(u, v, 32, 3);
      const bevel = Math.min(1, Math.max(0, (edge - mortar * (0.7 + chip)) / 6));
      const face = N.fbm(u + j * 0.13, v + k * 0.21, 8, 4), grit = N.vn(u * 128, v * 128, 128);
      H[i] = bevel * (0.75 + face * 0.25) + grit * 0.04;
      const inMortar = bevel < 0.05;
      A[i] = inMortar ? 0.3 + grit * 0.06 : row.tones[j] + (face - 0.5) * 0.22 + (grit - 0.5) * 0.08 - (1 - bevel) * 0.08;
      R[i] = inMortar ? 0.95 : 0.74 + grit * 0.16;
    }
  }
  return pack(S, H, A, R, 7);
}

// overlapping slate shingles for roofs
export function slateTextures(S = 512, seed = 11) {
  const N = tileNoise(seed), r = rng(seed), H = new Float32Array(S * S), A = new Float32Array(S * S), R = new Float32Array(S * S);
  const ROWS = 8, COLS = 6, rowH = S / ROWS, colW = S / COLS, tones = Array.from({ length: ROWS * COLS }, () => 0.42 + r() * 0.2);
  for (let y = 0; y < S; y++) {
    const k = Math.floor(y / rowH), ly = (y - k * rowH) / rowH;
    for (let x = 0; x < S; x++) {
      const i = y * S + x, sx = (x + (k % 2) * colW * 0.5) % S, c = Math.floor(sx / colW), lx = (sx - c * colW) / colW;
      const gap = Math.min(lx, 1 - lx) * colW, grit = N.vn(x / S * 128, y / S * 128, 128), face = N.fbm(x / S, y / S, 8, 4);
      H[i] = (1 - ly) * 0.55 + Math.min(1, gap / 2.5) * 0.25 + face * 0.12 + grit * 0.03 + (ly > 0.93 ? -0.3 : 0);
      A[i] = (gap < 1.5 || ly > 0.93) ? 0.28 : tones[(k * COLS + c) % tones.length] + (face - 0.5) * 0.16;
      R[i] = 0.55 + grit * 0.2;
    }
  }
  return pack(S, H, A, R, 6);
}

// fine-grained carved stone (columns, balustrades) with faint veining
export function marbleTextures(S = 512, seed = 19) {
  const N = tileNoise(seed), H = new Float32Array(S * S), A = new Float32Array(S * S), R = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x, f = N.fbm(u, v, 4, 5), grit = N.vn(u * 128, v * 128, 128);
    const vein = Math.pow(1 - Math.abs(Math.sin((u + v * 0.3 + f * 1.8) * Math.PI * 4)), 18);
    H[i] = f * 0.25 + grit * 0.05 - N.ridged(u, v, 8, 3) * 0.08;
    A[i] = 0.55 + (f - 0.5) * 0.18 - vein * 0.12 + (grit - 0.5) * 0.05;
    R[i] = 0.5 + grit * 0.18 + vein * 0.1;
  }
  return pack(S, H, A, R, 4);
}

// ---------- triplanar PBR patch (object space, so textures stick to moving rocks) ----------
export function triplanar(mat, maps, { scale = 0.25, normal = 1, albedo = 1, rough = 1 } = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      triA: { value: maps.albedo }, triN: { value: maps.normal }, triR: { value: maps.rough },
      triScale: { value: scale }, triNS: { value: normal }, triAS: { value: albedo }, triRS: { value: rough },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriP; varying vec3 vTriN; varying vec3 vTriX; varying vec3 vTriY; varying vec3 vTriZ;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vTriP = transformed; vTriN = objectNormal;
        mat3 triM = normalMatrix;
        #ifdef USE_INSTANCING
          triM = normalMatrix * mat3(instanceMatrix);
        #endif
        vTriX = triM * vec3(1.0, 0.0, 0.0); vTriY = triM * vec3(0.0, 1.0, 0.0); vTriZ = triM * vec3(0.0, 0.0, 1.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTriP; varying vec3 vTriN; varying vec3 vTriX; varying vec3 vTriY; varying vec3 vTriZ;
        uniform sampler2D triA; uniform sampler2D triN; uniform sampler2D triR;
        uniform float triScale; uniform float triNS; uniform float triAS; uniform float triRS;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 triNo = normalize(vTriN);
        vec3 tw = pow(abs(triNo), vec3(4.0)); tw /= (tw.x + tw.y + tw.z + 1e-5);
        vec3 tp = vTriP * triScale;
        vec3 tA = texture2D(triA, tp.zy).rgb * tw.x + texture2D(triA, tp.xz).rgb * tw.y + texture2D(triA, tp.xy).rgb * tw.z;
        diffuseColor.rgb *= mix(vec3(1.0), tA * 2.0, triAS);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float tR = texture2D(triR, tp.zy).r * tw.x + texture2D(triR, tp.xz).r * tw.y + texture2D(triR, tp.xy).r * tw.z;
        roughnessFactor = clamp(roughnessFactor * mix(1.0, tR * 1.35, triRS), 0.04, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 nX = texture2D(triN, tp.zy).xyz * 2.0 - 1.0; nX.xy *= triNS;
          vec3 nY = texture2D(triN, tp.xz).xyz * 2.0 - 1.0; nY.xy *= triNS;
          vec3 nZ = texture2D(triN, tp.xy).xyz * 2.0 - 1.0; nZ.xy *= triNS;
          nX = vec3(nX.xy + triNo.zy, abs(nX.z) * triNo.x);
          nY = vec3(nY.xy + triNo.xz, abs(nY.z) * triNo.y);
          nZ = vec3(nZ.xy + triNo.xy, abs(nZ.z) * triNo.z);
          vec3 oN = normalize(nX.zyx * tw.x + nY.xzy * tw.y + nZ.xyz * tw.z);
          normal = normalize(oN.x * vTriX + oN.y * vTriY + oN.z * vTriZ);
        }`);
  };
  mat.customProgramCacheKey = () => 'tri-v1';
  return mat;
}

// ---------- geometry: fractured rock ----------
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function unitPlane(r) { const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z); return new THREE.Vector3(Math.cos(a) * s, z, Math.sin(a) * s); }

export function rockGeometry(noise, { detail = 3, seed = 1, cuts = 9, stretch = [1, 0.75, 1.1], amp = 0.22 } = {}) {
  let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const r = rng(seed), o = seed * 7.31, planes = Array.from({ length: cuts }, () => ({ n: unitPlane(r), d: 0.4 + r() * 0.3 }));
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const nx = v.x, ny = v.y, nz = v.z;
    const d = 1 + amp * noise.fbm(nx * 1.4 + o, ny * 1.4, nz * 1.4, 4) + amp * 0.5 * (noise.ridged(nx * 3 + o, ny * 3, nz * 3, 3) - 0.45);
    v.multiplyScalar(d); v.x *= stretch[0]; v.y *= stretch[1]; v.z *= stretch[2];
    for (const pl of planes) { const t = v.dot(pl.n) - pl.d; if (t > 0) v.addScaledVector(pl.n, -t); }
    const micro = 0.014 * noise.fbm(nx * 7 + o, ny * 7, nz * 7, 3);
    v.x += nx * micro; v.y += ny * micro; v.z += nz * micro;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return toCreasedNormals(g, 0.55);
}

// ---------- geometry: floating island with cliff faces and strata ----------
const cA = new THREE.Color(), cB = new THREE.Color();
export function islandGeometry(noise, { r, depth, seed = 1, detail = 5, grass = true, cuts = 6, topNoise = 0.35, cutD = [0.8, 0.94] } = {}) {
  let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const rr = rng(seed), o = seed * 3.73;
  const planes = Array.from({ length: cuts }, () => { const a = rr() * Math.PI * 2; return { x: Math.cos(a), z: Math.sin(a), d: cutD[0] + rr() * (cutD[1] - cutD[0]) }; });
  const slopes = Array.from({ length: Math.round(cuts * 1.2) }, () => {
    const a = rr() * Math.PI * 2, T = 0.35 + rr() * 0.6, n = new THREE.Vector3(Math.cos(a) * Math.cos(T), -Math.sin(T), Math.sin(a) * Math.cos(T));
    const k = 0.55 + rr() * 0.3; return { n, d: k * (r * 0.62 * Math.cos(T) + (1.1 + depth * 0.42) * Math.sin(T)) };
  });
  const p = g.attributes.position, v = new THREE.Vector3(), RIM = 1.1;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const len = Math.hypot(v.x, v.z), dx = len > 1e-5 ? v.x / len : 1, dz = len > 1e-5 ? v.z / len : 0;
    const wob = noise.fbm(dx * 1.2 + o, dz * 1.2, o * 0.3, 3);
    let qx = dx * (1 + 0.14 * wob), qz = dz * (1 + 0.14 * wob), y, scale;
    if (v.y >= 0) {
      const edge = smooth(0.28, 0, v.y);
      y = -edge * edge * RIM + topNoise * noise.fbm(v.x * 2.5 + o, 0.5, v.z * 2.5, 4) * (1 - edge);
      scale = len;
    } else {
      const u = -v.y, taper = Math.pow(1 - u, 0.72);
      y = -RIM - Math.pow(u, 1.08) * depth;
      const lobes = 1 + 0.38 * noise.fbm(dx * 1.6 + o, u * 1.8, dz * 1.6, 4) * smooth(0, 0.25, u);
      const strata = (0.06 * Math.sin(y * 1.6 + 2.2 * noise.n3(dx * 2 + o, y * 0.15, dz * 2)) + 0.07 * (noise.ridged(dx * 2.5 + o, y * 0.45, dz * 2.5, 3) - 0.45)) * smooth(0, 0.12, u);
      const flute = 0.09 * (noise.ridged(dx * 7 + o, y * 0.04, dz * 7, 3) - 0.4) * smooth(0, 0.1, u);
      qx *= lobes * (1 + strata + flute); qz *= lobes * (1 + strata + flute);
      scale = taper;
      y += (noise.fbm(dx * 3 + o, u * 4, dz * 3, 3)) * depth * 0.06 * u;
    }
    for (const pl of planes) { const t = qx * pl.x + qz * pl.z - pl.d; if (t > 0) { qx -= pl.x * t; qz -= pl.z * t; } }
    v.set(qx * r * scale, y, qz * r * scale);
    if (y < -RIM - 1) for (const sp of slopes) { const t = v.dot(sp.n) - sp.d; if (t > 0) v.addScaledVector(sp.n, -t); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g = toCreasedNormals(g, 0.7);
  const pc = g.attributes.position;

  // colours: strata bands, moss under the lip, grass on top, darker underside
  const nrm = g.attributes.normal, col = new Float32Array(pc.count * 3);
  const rockA = new THREE.Color(0x7a7199), rockB = new THREE.Color(0x4b4468), rockC = new THREE.Color(0x8d7f9e), deep = new THREE.Color(0x231e3a), moss = new THREE.Color(0x355f50), turf = new THREE.Color(0x3b7a5c), turf2 = new THREE.Color(0x2b5f4f), bare = new THREE.Color(0x7a7298);
  for (let i = 0; i < pc.count; i++) {
    const x = pc.getX(i), y = pc.getY(i), z = pc.getZ(i), ny = nrm.getY(i);
    const band = 0.5 + 0.5 * Math.sin(y * 1.1 + 1.5 * noise.n3(x * 0.15, y * 0.3, z * 0.15));
    cA.copy(rockA).lerp(rockB, band).lerp(rockC, smooth(0.6, 0.9, noise.fbm(x * 0.08 + 3, y * 0.5, z * 0.08, 3) + 0.5) * 0.6).lerp(deep, smooth(depth * 0.15, depth * 0.95, -y));
    cA.multiplyScalar(1 + smooth(0.2, 0.7, ny) * 0.18);
    const mossy = smooth(-RIM - 5, -RIM + 0.2, y) * smooth(-0.1, 0.5, ny + noise.fbm(x * 0.3, y * 0.3, z * 0.3, 3)) * 0.8;
    cA.lerp(moss, mossy);
    if (grass) {
      const top = smooth(0.45, 0.8, ny) * smooth(-RIM - 0.6, -RIM * 0.4, y);
      cB.copy(turf).lerp(turf2, 0.5 + 0.5 * noise.fbm(x * 0.25 + o, 0, z * 0.25, 3)).lerp(bare, smooth(0.25, 0.5, noise.fbm(x * 0.18, 1, z * 0.18, 3)) * 0.6);
      cA.lerp(cB, top);
    } else {
      cA.lerp(bare, smooth(0.6, 0.85, ny) * 0.6);
    }
    const shade = 0.88 + 0.24 * noise.fbm(x * 0.5 + o, y * 0.5, z * 0.5, 2);
    col[i * 3] = cA.r * shade; col[i * 3 + 1] = cA.g * shade; col[i * 3 + 2] = cA.b * shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));

  // rim radius per angle (for placing waterfalls on the real edge)
  const bins = new Float32Array(72);
  for (let i = 0; i < pc.count; i += 3) {
    const y = pc.getY(i); if (y < -RIM - 0.4) continue;
    const x = pc.getX(i), z = pc.getZ(i), a = Math.atan2(x, z), b = ((Math.floor((a + Math.PI) / (Math.PI * 2) * 72) % 72) + 72) % 72;
    bins[b] = Math.max(bins[b], Math.hypot(x, z));
  }
  const rimRadius = (angle) => { const b = ((Math.floor((Math.atan2(Math.sin(angle), Math.cos(angle)) + Math.PI) / (Math.PI * 2) * 72) % 72) + 72) % 72; return bins[b] || r; };
  return { geometry: g, rimRadius, rimY: -RIM };
}

// ---------- geometry: conifers with layered, ragged tiers ----------
export function pineGeometry(noise, seed = 1) {
  const r = rng(seed), parts = [];
  const trunk = new THREE.CylinderGeometry(0.08, 0.16, 1.4, 6, 1); trunk.translate(0, 0.7, 0); parts.push(paint(trunk, 0x3a2c2a, 0x2a1f22));
  const tiers = 5 + Math.floor(r() * 2);
  for (let k = 0; k < tiers; k++) {
    const f = k / (tiers - 1), rad = 1.15 * (1 - f * 0.78), h = 1.25 - f * 0.45;
    const cone = new THREE.ConeGeometry(rad, h, 9, 2, true);
    const p = cone.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y < -h / 2 + 0.01) { const j = 1 + 0.22 * noise.n3(x * 3 + seed, k, z * 3); p.setXYZ(i, x * j, y - 0.12 * Math.abs(noise.n3(x * 5, k + seed, z * 5)), z * j); }
    }
    cone.computeVertexNormals();
    cone.rotateY(r() * Math.PI); cone.translate(0, 0.9 + f * 2.6 + h / 2, 0);
    parts.push(paint(cone, 0x2f6e5a, 0x173b3b, 0.9 + f * 2.6, h));
  }
  const g = mergeGeometries(parts.map((q) => q.index ? q.toNonIndexed() : q), false);
  return g;
  function paint(geo, top, bottom, y0 = 0, h = 1.4) {
    const pos = geo.attributes.position, c = new Float32Array(pos.count * 3), a = new THREE.Color(top), b = new THREE.Color(bottom), t = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { const k = Math.max(0, Math.min(1, (pos.getY(i) - y0) / h)); t.copy(b).lerp(a, k); c.set([t.r, t.g, t.b], i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); if (geo.attributes.uv) geo.deleteAttribute('uv'); return geo;
  }
}

// ---------- billowy cloud sprites lit from above ----------
export function cloudCanvas(seed, S = 256) {
  const N = tileNoise(seed);
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = (y * S + x) * 4;
    const ex = (u - 0.5) / 0.48, ey = (v - 0.55) / (v < 0.55 ? 0.34 : 0.16);
    const shape = Math.max(0, 1 - (ex * ex + ey * ey));
    const den = N.fbm(u, v, 4, 6) * 1.25 + N.fbm(u + 0.3, v + 0.7, 8, 4) * 0.35;
    const a = smooth(0.42, 0.85, den * shape + shape * 0.35);
    const lit = 0.62 + 0.45 * (1 - v) + (den - 0.5) * 0.35;
    const L = Math.max(0, Math.min(1, lit));
    d[i] = 255 * L; d[i + 1] = 255 * L; d[i + 2] = 255 * Math.min(1, L * 1.04); d[i + 3] = 255 * a;
  }
  g.putImageData(img, 0, 0);
  return c;
}
