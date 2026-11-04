// Ported from the prototype as plain JavaScript; it gets TypeScript types in a later step.
// ===================== AETHERWYN — 3D world =====================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { makeNoise, rockTextures, masonryTextures, slateTextures, marbleTextures, triplanar, rockGeometry, islandGeometry, pineGeometry, cloudCanvas, heightToNormal } from './realism.js';

export async function createWorld(canvas, opts) {
  const { reduce, tier, onProgress, view } = opts;
  // Give the browser a frame between heavy stages so the loading screen can update.
  const step = (progress, label) => new Promise((resolve) => {
    if (onProgress) onProgress(progress, label);
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
  await step(0.05, 'Gathering starlight');
  const LOW = tier === 'low';

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
  const maxPR = LOW ? 1.25 : 1.5;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, maxPR);
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = !LOW;
  renderer.shadowMap.type = THREE.PCFShadowMap; // soft by default since three r182

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(new THREE.Color(0x2a2552), 0.0046);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1600);

  // HDR, multisampled render target so edges stay clean through post-processing
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: LOW ? 0 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // ambient occlusion: contact darkening where stone meets stone (glow sprites and particles are left out)
  class SceneAO extends GTAOPass {
    _overrideVisibility() {
      const cache = this._visibilityCache;
      this.scene.traverse((o) => {
        if (o.visible && (o.isPoints || o.isLine || o.isSprite || (o.material && (o.material.transparent || o.material.depthWrite === false || o.material.isShaderMaterial)))) { o.visible = false; cache.push(o); }
      });
    }
  }
  let aoPass = null;
  if (!LOW) {
    aoPass = new SceneAO(scene, camera, innerWidth, innerHeight, undefined,
      { radius: 2.2, distanceExponent: 1.6, thickness: 3, scale: 1.25, samples: 16, distanceFallOff: 1, screenSpaceRadius: false },
      { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 });
    aoPass.blendIntensity = 0.85;
    composer.addPass(aoPass);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.86);
  composer.addPass(bloom);
  // cinematic grade: cool shadows, warm highlights, soft vignette, fine grain
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
      float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb = mix(c.rgb * vec3(0.93, 0.95, 1.08), c.rgb * vec3(1.05, 1.0, 0.93), smoothstep(0.04, 0.9, l));
        c.rgb = max(mix(vec3(l), c.rgb, 1.05), 0.0);
        vec2 v = vUv - 0.5; c.rgb *= 1.0 - dot(v, v) * 0.5;
        c.rgb += (hh(vUv * vec2(1931.0, 1087.0) + fract(uTime) * 91.7) - 0.5) * 0.01 * (0.3 + l);
        gl_FragColor = c; }`
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 64 : 50;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  // ---------- helpers ----------
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ADD = THREE.AdditiveBlending;
  const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
  const timed = [];
  function cnv(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
  function tex(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  // custom shaders write display-referred colours; convert to linear for the HDR pipeline
  const LIN = `vec3 toLin(vec3 c){ return pow(max(c, vec3(0.0)), vec3(2.2)); }`;
  const GN = `float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float vn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < ${LOW ? 3 : 5}; i++){ s += a * vn3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }`;

  // ---------- canvas textures ----------
  function glowTexture() {
    const [c, g] = cnv(128);
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.22, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128); return tex(c);
  }
  function flareTexture() {
    const [c, g] = cnv(256); g.translate(128, 128);
    [[0, 128, 3], [Math.PI / 2, 90, 2], [Math.PI / 4, 50, 1.2], [-Math.PI / 4, 50, 1.2]].forEach(([a, len, w]) => {
      g.save(); g.rotate(a);
      const lg = g.createLinearGradient(-len, 0, len, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.fillRect(-len, -w, len * 2, w * 2); g.restore();
    });
    return tex(c);
  }
  function drawGlyph(g, size) {
    g.beginPath();
    const n = 2 + Math.floor(rand() * 3);
    for (let s = 0; s < n; s++) {
      g.moveTo((rand() - .5) * size, (rand() - .5) * size * 1.2);
      if (rand() < 0.4) g.quadraticCurveTo((rand() - .5) * size * 1.4, (rand() - .5) * size, (rand() - .5) * size, (rand() - .5) * size * 1.2);
      else g.lineTo((rand() - .5) * size, (rand() - .5) * size * 1.2);
    }
    g.stroke();
  }
  function runeCircleTexture() {
    const [c, g] = cnv(512); g.translate(256, 256);
    g.strokeStyle = '#fff'; g.lineCap = 'round'; g.shadowColor = '#fff'; g.shadowBlur = 8;
    [240, 226, 168, 112, 52].forEach((r, i) => { g.lineWidth = i === 1 ? 1.5 : 3.5; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); });
    g.lineWidth = 2;
    for (let a = 0; a < 360; a += 5) {
      const t = a * Math.PI / 180, l = a % 30 === 0 ? 14 : 6;
      g.beginPath(); g.moveTo(Math.cos(t) * 226, Math.sin(t) * 226); g.lineTo(Math.cos(t) * (226 - l), Math.sin(t) * (226 - l)); g.stroke();
    }
    g.lineWidth = 3;
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      for (let i = 0; i <= 3; i++) { const t = (i / 3) * Math.PI * 2 + k * Math.PI / 3 - Math.PI / 2; g.lineTo(Math.cos(t) * 166, Math.sin(t) * 166); }
      g.stroke();
    }
    for (let i = 0; i < 16; i++) { g.save(); g.rotate(i / 16 * Math.PI * 2); g.translate(0, -197); drawGlyph(g, 18); g.restore(); }
    g.lineWidth = 5; g.save(); g.scale(1.6, 1.6); drawGlyph(g, 30); g.restore();
    return tex(c);
  }
  function platformTextures() {
    const S = 1024;
    const [c, g] = cnv(S); const [rc, rg] = cnv(S);
    g.translate(S / 2, S / 2); rg.translate(S / 2, S / 2);
    g.fillStyle = '#5d5884'; g.beginPath(); g.arc(0, 0, 512, 0, Math.PI * 2); g.fill();
    rg.fillStyle = '#d0d0d0'; rg.fillRect(-512, -512, S, S);
    const rings = [0, 120, 215, 305, 380, 455, 512], counts = [1, 12, 20, 28, 36, 44];
    for (let b = 0; b < counts.length; b++) {
      const r0 = rings[b], r1 = rings[b + 1], n = counts[b], off = rand();
      for (let i = 0; i < n; i++) {
        const a0 = (i + off) / n * Math.PI * 2, a1 = (i + 1 + off) / n * Math.PI * 2, v = rand();
        g.fillStyle = v < 0.5 ? `rgba(22,15,42,${0.05 + v * 0.2})` : `rgba(255,250,255,${(v - 0.5) * 0.14})`;
        g.beginPath(); g.arc(0, 0, r1, a0, a1); g.arc(0, 0, r0, a1, a0, true); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(16,10,30,0.7)'; g.lineWidth = 3.5; g.stroke();
        rg.fillStyle = `rgb(${170 + v * 70 | 0},${170 + v * 70 | 0},${170 + v * 70 | 0})`;
        rg.beginPath(); rg.arc(0, 0, r1, a0, a1); rg.arc(0, 0, r0, a1, a0, true); rg.closePath(); rg.fill();
      }
    }
    g.strokeStyle = 'rgba(14,9,28,0.5)'; g.lineWidth = 1.5;
    for (let i = 0; i < 46; i++) {
      let a = rand() * Math.PI * 2, r = 130 + rand() * 360; g.beginPath(); g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      for (let s = 0; s < 4; s++) { a += (rand() - .5) * 0.06; r += (rand() - .5) * 30; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.stroke();
    }
    // engraved gold inlay — also polished (low roughness) in the roughness map
    const goldStroke = (ctx, col) => {
      ctx.strokeStyle = col; ctx.lineCap = 'round';
      [[470, 4], [432, 2.5], [140, 5], [160, 2.5]].forEach(([r, w]) => { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); });
      for (let i = 0; i < 4; i++) {
        ctx.save(); ctx.rotate(i * Math.PI / 2 + Math.PI / 4); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-60, -260); ctx.bezierCurveTo(-90, -330, 90, -330, 60, -260); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -300, 16, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    };
    const glyphSeed = seed;
    goldStroke(g, '#d9ad5c');
    g.lineWidth = 3; g.strokeStyle = '#d9ad5c';
    for (let i = 0; i < 46; i++) { g.save(); g.rotate(i / 46 * Math.PI * 2); g.translate(0, -451); drawGlyph(g, 16); g.restore(); }
    seed = glyphSeed;
    goldStroke(rg, '#303030');
    rg.lineWidth = 3; rg.strokeStyle = '#303030';
    for (let i = 0; i < 46; i++) { rg.save(); rg.rotate(i / 46 * Math.PI * 2); rg.translate(0, -451); drawGlyph(rg, 16); rg.restore(); }
    // emissive rune band (same glyphs again)
    seed = glyphSeed;
    const [ec, eg] = cnv(S); eg.translate(S / 2, S / 2);
    eg.strokeStyle = '#fff'; eg.shadowColor = '#fff'; eg.shadowBlur = 8; eg.lineCap = 'round'; eg.lineWidth = 3;
    for (let i = 0; i < 46; i++) { eg.save(); eg.rotate(i / 46 * Math.PI * 2); eg.translate(0, -451); drawGlyph(eg, 16); eg.restore(); }
    eg.lineWidth = 2;[470, 432, 140].forEach((r) => { eg.beginPath(); eg.arc(0, 0, r, 0, Math.PI * 2); eg.stroke(); });
    return { map: tex(c), rough: tex(rc, false), band: tex(ec, false) };
  }
  function grateTexture() {
    const [c, g] = cnv(256); g.translate(128, 128);
    const r = g.createRadialGradient(0, 0, 0, 0, 0, 128);
    r.addColorStop(0, '#fff2c8'); r.addColorStop(0.5, '#e0a24a'); r.addColorStop(1, '#6a3c14');
    g.fillStyle = r; g.beginPath(); g.arc(0, 0, 128, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#1e1630'; g.lineWidth = 9;
    for (let i = -120; i <= 120; i += 26) { g.beginPath(); g.moveTo(i, -128); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(-128, i); g.lineTo(128, i); g.stroke(); }
    g.lineWidth = 14; g.strokeStyle = '#2a2040'; g.beginPath(); g.arc(0, 0, 121, 0, Math.PI * 2); g.stroke();
    return tex(c);
  }
  function beamTexture() {
    const [c, g] = cnv(4, 256);
    const lg = g.createLinearGradient(0, 256, 0, 0);
    lg.addColorStop(0, 'rgba(255,255,255,1)'); lg.addColorStop(0.25, 'rgba(255,255,255,0.4)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg; g.fillRect(0, 0, 4, 256); return tex(c);
  }
  function moonTexture() {
    const [c, g] = cnv(256);
    g.fillStyle = '#f2ecff'; g.beginPath(); g.arc(128, 128, 100, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(165, 105, 92, 0, Math.PI * 2); g.fill();
    return tex(c);
  }
  function glyphTexture() {
    const [c, g] = cnv(64); g.translate(32, 32);
    g.strokeStyle = '#fff'; g.lineWidth = 3.5; g.lineCap = 'round'; g.shadowColor = '#fff'; g.shadowBlur = 6;
    drawGlyph(g, 34); return tex(c);
  }
  const glowTex = glowTexture(), flareTex = flareTexture();
  const noise = makeNoise(7);
  const TS = LOW ? 256 : 512;
  await step(0.12, 'Carving the stone');
  const texRock = rockTextures(TS, 3);
  await step(0.22, 'Carving the stone');
  const texMason = masonryTextures(TS, 7);
  await step(0.3, 'Laying the slate');
  const texSlate = slateTextures(TS, 11), texMarble = marbleTextures(TS, 19);
  await step(0.38, 'Painting the sky');

  // ---------- environment map (image-based lighting for PBR) ----------
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `${LIN} varying vec3 vP; void main(){ float h = vP.y;
        vec3 c = mix(vec3(0.42,0.34,0.62), vec3(0.12,0.12,0.30), smoothstep(0.0, 0.7, h));
        c = mix(c, vec3(0.08,0.07,0.18), smoothstep(0.0, 0.5, -h));
        gl_FragColor = vec4(toLin(c), 1.0); }`
    })));
    const blob = (col, k, pos, s) => { const m = new THREE.Mesh(new THREE.SphereGeometry(s, 16, 8), new THREE.MeshBasicMaterial({ color: hdr(col, k) })); m.position.copy(pos); env.add(m); };
    blob(0xd6dcff, 6, new THREE.Vector3(20, 22, -30), 5);   // moon
    blob(0x94e1f3, 2, new THREE.Vector3(-30, 8, 10), 8);    // cyan bounce
    blob(0xfadc98, 2, new THREE.Vector3(0, -10, 30), 9);    // warm floor bounce
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.03).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
  }

  // ---------- sky ----------
  const moonDir = new THREE.Vector3(0.55, 0.38, -1).normalize();
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(650, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uMoon: { value: moonDir } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `${LIN} ${GN} uniform vec3 uMoon; varying vec3 vP;
      void main(){ float h = vP.y;
        vec3 top = vec3(0.04,0.05,0.13), mid = vec3(0.16,0.14,0.36), hor = vec3(0.55,0.44,0.76), low = vec3(0.10,0.09,0.24);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, h)); c = mix(c, top, smoothstep(0.22, 0.85, h)); c = mix(c, low, smoothstep(0.0, 0.35, -h));
        float m = max(dot(vP, uMoon), 0.0); c += vec3(0.7,0.65,1.0) * pow(m, 8.0) * 0.16;
        vec3 bn = normalize(vec3(0.35, 0.55, 0.76)); float bd = dot(vP, bn); float band = exp(-bd * bd * 12.0);
        float neb = fbm3(vP * 3.5); float dust = smoothstep(0.42, 0.72, fbm3(vP * 7.0 + 3.1));
        c += band * smoothstep(0.02, 0.3, h) * (vec3(0.5, 0.42, 0.85) * neb * 0.2 + vec3(0.6, 0.8, 1.0) * pow(neb, 3.0) * 0.3) * (1.0 - dust * 0.75);
        gl_FragColor = vec4(toLin(c), 1.0); }`
  })));
  const moonTex = moonTexture();
  [[moonDir, 34], [new THREE.Vector3(-0.2, 0.3, -1).normalize(), 16]].forEach(([d, s]) => {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: hdr(0x9f8acf, 0.6), transparent: true, fog: false, depthWrite: false, blending: ADD }));
    glow.position.copy(d).multiplyScalar(500); glow.scale.set(s * 3.2, s * 3.2, 1); scene.add(glow);
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, color: hdr(0xffffff, 1.6), transparent: true, fog: false, depthWrite: false }));
    m.position.copy(d).multiplyScalar(505); m.scale.set(s, s, 1); scene.add(m);
  });

  const STAR_N = LOW ? 1600 : 3000;
  {
    const sPos = new Float32Array(STAR_N * 3), sSize = new Float32Array(STAR_N), sPhase = new Float32Array(STAR_N);
    for (let i = 0; i < STAR_N; i++) {
      const u = rand() * Math.PI * 2, v = Math.pow(rand(), 0.7) * 0.95 + 0.04, r = 520;
      sPos[i * 3] = Math.cos(u) * Math.sqrt(1 - v * v) * r; sPos[i * 3 + 1] = v * r - 30; sPos[i * 3 + 2] = Math.sin(u) * Math.sqrt(1 - v * v) * r;
      sSize[i] = rand() < 0.04 ? 6 + rand() * 4 : 1.3 + rand() * 2.4; sPhase[i] = rand() * 6.28;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(sPhase, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: ADD, fog: false,
      uniforms: { uTime: { value: 0 }, uPR: { value: pixelRatio } },
      vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uPR; varying float vA; varying float vBig;
        void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          vA = 0.5 + 0.5 * sin(uTime * (0.8 + fract(aPhase) * 1.8) + aPhase); vBig = step(5.0, aSize); gl_PointSize = aSize * uPR; }`,
      fragmentShader: `${LIN} varying float vA; varying float vBig;
        void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p);
          float core = 1.0 - smoothstep(0.0, 0.5, d);
          float crs = vBig * ((1.0 - smoothstep(0.0, 0.05, abs(p.x))) + (1.0 - smoothstep(0.0, 0.05, abs(p.y)))) * (1.0 - smoothstep(0.1, 0.5, d));
          vec3 col = mix(vec3(0.8,0.85,1.0), vec3(1.0,0.92,0.75), vBig);
          gl_FragColor = vec4(toLin(col) * (1.0 + vBig * 1.5), (core * core + crs) * (0.3 + 0.7 * vA)); }`
    });
    timed.push(mat); scene.add(new THREE.Points(geo, mat));
  }

  const auroraMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: ADD, fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `uniform float uTime; varying vec2 vUv;
      void main(){ vUv = uv; vec3 p = position;
        p.z += sin(p.x * 0.016 + uTime * 0.12) * 34.0; p.y += sin(p.x * 0.028 + uTime * 0.09) * 10.0 * uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
    fragmentShader: `${LIN} uniform float uTime; varying vec2 vUv;
      void main(){ float x = vUv.x;
        float b = sin(x * 24.0 + uTime * 0.4 + sin(x * 7.0 + uTime * 0.22) * 2.6) * 0.5 + 0.5;
        b *= sin(x * 67.0 - uTime * 0.7) * 0.3 + 0.7; b = pow(b, 1.5);
        float v = smoothstep(0.0, 0.16, vUv.y) * pow(max(1.0 - vUv.y, 0.0), 1.3);
        float e = smoothstep(0.0, 0.15, x) * (1.0 - smoothstep(0.85, 1.0, x));
        vec3 c = mix(vec3(0.35,0.95,0.85), vec3(0.6,0.38,1.0), smoothstep(0.1, 0.8, vUv.y));
        gl_FragColor = vec4(toLin(c), b * v * e * 0.55); }`
  });
  timed.push(auroraMat);
  [[80, 110, -360, -0.25, 480], [-120, 140, -400, 0.2, 380]].forEach(([x, y, z, ry, w]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 120, 120, 1), auroraMat);
    m.position.set(x, y, z); m.rotation.y = ry; m.rotation.z = -0.12; scene.add(m);
  });

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xb7a6ec, 0x1d2c55, 0.9));
  const moon = new THREE.DirectionalLight(0xc8d6ff, 2.2);
  moon.position.set(30, 55, -18);
  moon.castShadow = !LOW;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 10, far: 120 });
  moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.04; moon.shadow.radius = 4;
  scene.add(moon); scene.add(moon.target);
  const fill = new THREE.DirectionalLight(0xa58fe0, 0.55); fill.position.set(-40, 20, 50); scene.add(fill);

  // ---------- materials ----------
  const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.9, metalness: 0 }, o));
  const mats = {
    rock: triplanar(M(0xffffff, { vertexColors: true, roughness: 0.95 }), texRock, { scale: 0.14, normal: 1.1, albedo: 0.9 }),
    boulder: triplanar(M(0x6d6692, { roughness: 0.95 }), texRock, { scale: 0.55, normal: 1.2, albedo: 0.9 }),
    marble: triplanar(M(0xb4aed6, { roughness: 0.7 }), texMarble, { scale: 0.32, normal: 0.8, albedo: 0.8 }),
    grass: M(0x2f7363, { flatShading: true, roughness: 0.95 }),
    tree: M(0xffffff, { vertexColors: true, roughness: 0.88 }),
    stone: triplanar(M(0xa9a3cc, { roughness: 0.82 }), texMason, { scale: 0.26, normal: 1.2, albedo: 0.9 }),
    stoneFlat: triplanar(M(0x9a94bf, { roughness: 0.85 }), texMason, { scale: 0.26, normal: 1.2, albedo: 0.9 }),
    stoneDark: triplanar(M(0x625b88, { roughness: 0.88 }), texMason, { scale: 0.2, normal: 1.3, albedo: 1 }),
    roof: triplanar(M(0x34428f, { roughness: 0.55, metalness: 0.05 }), texSlate, { scale: 0.42, normal: 1.4, albedo: 1 }),
    gold: M(0xd8a54c, { roughness: 0.3, metalness: 1.0 }),
    window: new THREE.MeshBasicMaterial({ color: hdr(0xffcf70, 2.2) }),
    dragon: new THREE.MeshStandardMaterial({ color: 0x2b2252, roughness: 0.8, side: THREE.DoubleSide }),
  };
  const waterMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `${LIN} uniform float uTime; varying vec2 vUv;
      void main(){ float cols = sin(vUv.x * 38.0 + sin(vUv.x * 11.0) * 3.0) * 0.5 + 0.5;
        float s = fract(vUv.y * 2.5 + uTime * 0.9 + cols * 0.35); float streak = smoothstep(0.2, 1.0, s) * (0.4 + 0.6 * cols);
        float edge = smoothstep(0.0, 0.25, vUv.x) * (1.0 - smoothstep(0.75, 1.0, vUv.x)); float fall = smoothstep(0.0, 0.7, vUv.y);
        vec3 c = mix(vec3(0.5,0.78,0.95), vec3(0.9,0.97,1.0), streak);
        gl_FragColor = vec4(toLin(c) * (1.0 + streak * 0.6), (0.25 + 0.5 * streak) * edge * fall); }`
  });
  timed.push(waterMat);

  // ---------- geometry builder: merges static parts per material (few draw calls) ----------
  class Builder {
    constructor() { this.parts = {}; }
    add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      if (g.attributes.uv === undefined) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (g.attributes.color) g.deleteAttribute('color');
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
      g.applyMatrix4(m);
      (this.parts[mat] = this.parts[mat] || []).push(g);
      return this;
    }
    build(group, { cast = true, receive = true } = {}) {
      Object.entries(this.parts).forEach(([key, list]) => {
        const geo = mergeGeometries(list, false);
        list.forEach((g) => g.dispose());
        if (!geo) return;
        const mesh = new THREE.Mesh(geo, mats[key]);
        mesh.castShadow = cast && key !== 'window'; mesh.receiveShadow = receive;
        group.add(mesh);
      });
      return group;
    }
  }

  // ---------- shared shapes ----------
  const columnGeo = new THREE.LatheGeometry([
    [0, 0], [1.3, 0], [1.3, 0.05], [1.12, 0.07], [1.12, 0.1], [0.95, 0.12], [0.86, 0.15],
    [0.8, 0.86], [0.9, 0.88], [1.05, 0.91], [1.18, 0.94], [1.3, 0.95], [1.3, 1.0], [0, 1.0]
  ].map(([x, y]) => new THREE.Vector2(x, y)), 14);
  const roofGeo = new THREE.LatheGeometry([
    [0, 0], [1.32, 0], [1.25, 0.04], [1.0, 0.14], [0.72, 0.32], [0.46, 0.55], [0.24, 0.78], [0.08, 0.95], [0, 1]
  ].map(([x, y]) => new THREE.Vector2(x, y)), 10);
  const pedestalGeo = new THREE.LatheGeometry([
    [0, 0], [1.08, 0], [1.08, 0.3], [1.0, 0.35], [0.96, 0.75], [1.04, 0.8], [1.04, 1.0], [0, 1.0]
  ].map(([x, y]) => new THREE.Vector2(x, y)), 40);
  const box = new THREE.BoxGeometry(1, 1, 1), cylG = new THREE.CylinderGeometry(1, 1, 1, 12), coneG = new THREE.ConeGeometry(1, 1, 7);
  const archWindow = (() => { const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0.5, 0.65); s.absarc(0, 0.65, 0.5, 0, Math.PI, false); s.lineTo(-0.5, 0); return new THREE.ShapeGeometry(s, 6); })();

  function tower(b, x, z, r, h, roofH, windows) {
    b.add(cylG, 'stone', x, h / 2, z, 0, 0, 0, r * 0.95, h, r * 0.95);
    b.add(cylG, 'stoneFlat', x, h + 0.25, z, 0, 0, 0, r * 1.18, 0.5, r * 1.18);
    const n = Math.max(6, Math.round(r * 7));
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; b.add(box, 'stoneFlat', x + Math.sin(a) * r * 1.1, h + 0.75, z + Math.cos(a) * r * 1.1, 0, a, 0, r * 0.42, 0.55, 0.32); }
    b.add(cylG, 'gold', x, h + 0.53, z, 0, 0, 0, r * 1.05, 0.08, r * 1.05);
    b.add(roofGeo, 'roof', x, h + 0.55, z, 0, 0, 0, r * 1.05, roofH, r * 1.05);
    b.add(coneG, 'gold', x, h + 0.55 + roofH + 0.6, z, 0, 0, 0, 0.1, 1.4, 0.1);
    for (let i = 0; i < windows; i++) {
      const a = rand() * Math.PI * 2, y = h * (0.3 + rand() * 0.55);
      b.add(archWindow, 'window', x + Math.sin(a) * (r * 0.96), y, z + Math.cos(a) * (r * 0.96), 0, a, 0, 0.32, 0.5, 1);
    }
    return h + 0.55 + roofH;
  }
  const beacons = [];
  function castle(scale) {
    const g = new THREE.Group(), b = new Builder();
    tower(b, 0, 0, 2.4, 9, 4.6, 10);
    const top = tower(b, 2.8, -1.6, 1.0, 15, 5.5, 7);
    tower(b, -3.2, -1.2, 1.3, 11, 4, 5);
    tower(b, 0.5, -4.2, 0.8, 13, 4, 4);
    const corners = [[5, 3.5], [-5, 3.5], [5.2, -3.8], [-5.2, -3.8]];
    corners.forEach(([x, z]) => tower(b, x, z, 1.05, 6, 2.8, 3));
    for (let i = 0; i < 4; i++) {
      const a = corners[i], c2 = corners[[1, 3, 0, 2][i]];
      const dx = c2[0] - a[0], dz = c2[1] - a[1], len = Math.hypot(dx, dz), ry = -Math.atan2(dz, dx);
      b.add(box, 'stone', (a[0] + c2[0]) / 2, 1.6, (a[1] + c2[1]) / 2, 0, ry, 0, len, 3.2, 0.8);
      const n = Math.floor(len / 0.9);
      for (let k = 1; k < n; k += 2) { const f = k / n; b.add(box, 'stoneFlat', a[0] + dx * f, 3.45, a[1] + dz * f, 0, ry, 0, 0.45, 0.5, 0.85); }
    }
    b.add(box, 'stone', 0, 2.2, 3.6, 0, 0, 0, 2.6, 4.4, 1.4);
    b.add(archWindow, 'window', 0, 0.2, 4.32, 0, 0, 0, 1.4, 2.0, 1);
    b.build(g);
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: hdr(0x94e1f3, 3), transparent: true, depthWrite: false, blending: ADD }));
    beacon.position.set(2.8, top + 1.8, -1.6); beacon.scale.set(3, 3, 1); g.add(beacon); beacons.push(beacon);
    g.scale.setScalar(scale); g.position.y = -0.3;
    return g;
  }
  function waterfall(group, radius, angle, width, height) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), waterMat);
    const x = Math.sin(angle) * radius * 0.9, z = Math.cos(angle) * radius * 0.9;
    m.position.set(x, 0.2 - height / 2, z); m.rotation.y = angle; group.add(m);
    const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: hdr(0x94e1f3, 0.5), transparent: true, depthWrite: false, blending: ADD }));
    mist.position.set(x * 1.02, 0.4, z * 1.02); mist.scale.set(width * 1.8, width * 1.2, 1); group.add(mist);
  }
  const islands = [];
  const pines = [1, 2, 3].map((k) => pineGeometry(noise, k * 17));
  const boulderGeos = [1, 2, 3].map((k) => rockGeometry(noise, { detail: LOW ? 1 : 2, seed: 60 + k, cuts: 5, stretch: [1.2, 0.7, 1] }));
  function island({ pos, r, depth, trees = 0, falls = [], spin = 0.012, grass = true, amp, boulders, cutD }) {
    const g = new THREE.Group();
    const isl = islandGeometry(noise, { r, depth, seed: 11 + islands.length * 7, detail: LOW ? 4 : (r >= 8 ? 5 : 4), grass, cutD, cuts: grass ? 6 : 4 });
    const rock = new THREE.Mesh(isl.geometry, mats.rock); rock.receiveShadow = true; rock.castShadow = true; g.add(rock);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const treeParts = [];
    for (let i = 0; i < trees; i++) {
      const a = rand() * 6.28, d = r * (0.42 + rand() * 0.4), s2 = 0.55 + rand() * 0.7;
      q.setFromEuler(e.set((rand() - 0.5) * 0.08, rand() * 6.28, (rand() - 0.5) * 0.08));
      m4.compose(v.set(Math.sin(a) * d, -0.25, Math.cos(a) * d), q, sc.set(s2, s2 * (0.9 + rand() * 0.3), s2));
      treeParts.push(pines[i % 3].clone().applyMatrix4(m4));
    }
    if (treeParts.length) { const tm = new THREE.Mesh(mergeGeometries(treeParts, false), mats.tree); tm.castShadow = true; tm.receiveShadow = true; g.add(tm); treeParts.forEach((t) => t.dispose()); }
    const nb = boulders != null ? boulders : Math.round(r * 0.7);
    const bParts = [];
    for (let i = 0; i < nb; i++) {
      const a = rand() * 6.28, d = r * (0.55 + rand() * 0.35), s2 = 0.25 + Math.pow(rand(), 2) * 0.9;
      q.setFromEuler(e.set(rand() * 6, rand() * 6, rand() * 6));
      m4.compose(v.set(Math.sin(a) * d, -0.1, Math.cos(a) * d), q, sc.set(s2, s2, s2));
      bParts.push(boulderGeos[i % 3].clone().applyMatrix4(m4));
    }
    if (bParts.length) { const bm = new THREE.Mesh(mergeGeometries(bParts, false), mats.boulder); bm.castShadow = true; bm.receiveShadow = true; g.add(bm); bParts.forEach((t) => t.dispose()); }
    falls.forEach(([a, w, h]) => waterfall(g, (isl.rimRadius(a) + 0.5) / 0.9, a, w, h));
    g.position.copy(pos);
    g.userData = { base: pos.clone(), phase: rand() * 6.28, amp: amp != null ? amp : 0.6 + rand() * 0.9, spin };
    scene.add(g); islands.push(g);
    return g;
  }

  await step(0.45, 'Raising the arena');
  // ===================== the arena =====================
  const arena = island({ pos: new THREE.Vector3(0, 0, 0), r: 17.5, depth: 26, grass: false, spin: 0, amp: 0.3, boulders: 0, cutD: [0.92, 1.0] });
  const PLAT_Y = 1.6;
  {
    const b = new Builder();
    b.add(cylG, 'stoneDark', 0, PLAT_Y / 2, 0, 0, 0, 0, 15.8, PLAT_Y, 15.8);
    // balustrade: little lathe columns with a rail, gaps toward the camera side
    for (let i = 0; i < 44; i++) {
      const a = i / 44 * Math.PI * 2;
      if (Math.cos(a) > 0.82) continue;
      b.add(columnGeo, 'marble', Math.sin(a) * 15.5, PLAT_Y, Math.cos(a) * 15.5, 0, 0, 0, 0.22, 1.1, 0.22);
    }
    // tall rim pillars
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8;
      if (Math.cos(a) > 0.5) continue;
      const h = 4.2 + rand() * 2.2;
      b.add(columnGeo, 'marble', Math.sin(a) * 15.6, PLAT_Y, Math.cos(a) * 15.6, 0, 0, 0, 0.55, h, 0.55);
      b.add(box, 'stoneFlat', Math.sin(a) * 15.6, PLAT_Y + h + 0.2, Math.cos(a) * 15.6, 0, a, 0, 1.5, 0.4, 1.5);
    }
    b.build(arena);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(15.5, 0.16, 8, 128, Math.PI * 2), mats.marble);
    rail.rotation.x = Math.PI / 2; rail.position.y = PLAT_Y + 1.15; rail.castShadow = true; arena.add(rail);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(15.8, 0.32, 8, 96), mats.gold); lip.rotation.x = Math.PI / 2; lip.position.y = PLAT_Y; arena.add(lip);
  }
  const pt = platformTextures();
  const floor = new THREE.Mesh(new THREE.CircleGeometry(15.4, 96), new THREE.MeshStandardMaterial({ map: pt.map, roughnessMap: pt.rough, roughness: 1, metalness: 0.15 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = PLAT_Y + 0.01; floor.receiveShadow = true; arena.add(floor);
  {
    const fc = pt.map.image, S = fc.width, fd = fc.getContext('2d').getImageData(0, 0, S, S).data, FH = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) FH[i] = (fd[i * 4] * 0.3 + fd[i * 4 + 1] * 0.59 + fd[i * 4 + 2] * 0.11) / 255;
    const fn = new THREE.CanvasTexture(heightToNormal(FH, S, 4)); fn.colorSpace = THREE.NoColorSpace; fn.anisotropy = 8;
    floor.material.normalMap = fn; floor.material.normalScale.set(1, -1); floor.material.needsUpdate = true;
  }
  const runeBand = new THREE.Mesh(new THREE.CircleGeometry(15.4, 96), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: ADD,
    uniforms: { map: { value: pt.band }, uTime: { value: 0 }, uPower: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `${LIN} uniform sampler2D map; uniform float uTime; uniform float uPower; varying vec2 vUv;
      void main(){ float a = texture2D(map, vUv).r; vec2 p = vUv - 0.5; float ang = atan(p.y, p.x); float r = length(p);
        float w = 0.2 + 0.8 * pow(0.5 + 0.5 * sin(ang * 3.0 - uTime * 1.8 + r * 10.0), 3.0);
        vec3 c = mix(vec3(1.0,0.86,0.55), vec3(0.6,0.92,1.0), 0.5 + 0.5 * sin(ang * 2.0 + uTime));
        gl_FragColor = vec4(toLin(c) * (1.0 + w * 0.9), a * w * uPower); }`
  }));
  runeBand.rotation.x = -Math.PI / 2; runeBand.position.y = PLAT_Y + 0.03; arena.add(runeBand); timed.push(runeBand.material);

  const grate = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40), new THREE.MeshBasicMaterial({ map: grateTexture(), color: hdr(0xffffff, 1.3) }));
  grate.rotation.x = -Math.PI / 2; grate.position.y = PLAT_Y + 0.04; arena.add(grate);
  const grateRim = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.2, 8, 48), mats.gold); grateRim.rotation.x = Math.PI / 2; grateRim.position.y = PLAT_Y + 0.1; arena.add(grateRim);

  // ---------- four casting circles ----------
  const CIRCLE_COLORS = [0x9f6bff, 0x7fe8ff, 0xffd27a, 0x5ff0c8];
  const beamTex = beamTexture(), sealTex = runeCircleTexture();
  const circles = [];
  [-3, -1, 1, 3].forEach((q, i) => {
    const a = q * Math.PI / 4 + Math.PI;
    const x = Math.sin(a) * 12.6, z = Math.cos(a) * 12.6;
    const color = new THREE.Color(CIRCLE_COLORS[i]);
    const ped = new THREE.Mesh(pedestalGeo, mats.marble); ped.scale.set(2.9, 0.8, 2.9); ped.position.set(x, PLAT_Y, z); ped.castShadow = ped.receiveShadow = true; arena.add(ped);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.98, 0.1, 6, 48), mats.gold); rim.rotation.x = Math.PI / 2; rim.position.set(x, PLAT_Y + 0.8, z); arena.add(rim);
    const seal = new THREE.Mesh(new THREE.CircleGeometry(2.8, 48), new THREE.MeshBasicMaterial({ map: sealTex, color: color.clone(), transparent: true, opacity: 0.25, depthWrite: false, blending: ADD }));
    seal.rotation.x = -Math.PI / 2; seal.position.set(x, PLAT_Y + 0.82, z); arena.add(seal);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(5, 32), new THREE.MeshBasicMaterial({ map: glowTex, color: color.clone(), transparent: true, opacity: 0, depthWrite: false, blending: ADD }));
    halo.rotation.x = -Math.PI / 2; halo.position.set(x, PLAT_Y + 0.85, z); arena.add(halo);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.7, 14, 32, 1, true), new THREE.MeshBasicMaterial({ map: beamTex, color: color.clone(), transparent: true, opacity: 0, depthWrite: false, blending: ADD, side: THREE.DoubleSide }));
    beam.position.set(x, PLAT_Y + 7.8, z); beam.scale.y = 0.01; arena.add(beam);
    const light = new THREE.PointLight(color, 0, 22, 1.6); light.position.set(x, PLAT_Y + 3, z); arena.add(light);
    circles.push({ x, z, a, color, seal, halo, beam, light, lit: 0, want: 0, flashT: -10 });
  });

  // ---------- the orb ----------
  const ORB_Y = 8;
  const orbGroup = new THREE.Group(); orbGroup.position.set(0, ORB_Y, 0); arena.add(orbGroup);
  const orbMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: ADD,
    uniforms: { uTime: { value: 0 }, uPower: { value: 0.15 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `${LIN} uniform float uTime; uniform float uPower; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float nd = max(dot(normalize(vN), normalize(vV)), 0.0); float fres = pow(max(1.0 - nd, 0.0), 2.2);
        vec3 q = vP * 1.2;
        float st = pow(max(0.0, sin(q.x*9.0 + uTime) * sin(q.y*8.0 - uTime*1.3) * sin(q.z*10.0 + uTime*0.7)), 10.0) * 4.0;
        float swirl = 0.5 + 0.5 * sin(atan(vP.z, vP.x) * 3.0 + vP.y * 2.0 - uTime * 1.5);
        vec3 c = vec3(0.55,0.85,1.0) * fres * (0.9 + uPower) + vec3(1.0,0.88,0.65) * pow(nd, 4.0) * uPower * 0.9
               + vec3(0.9,0.95,1.0) * st * uPower + vec3(0.6,0.4,1.0) * swirl * fres * 0.4 * uPower;
        gl_FragColor = vec4(toLin(c) * (1.0 + uPower * 1.3), clamp(fres + pow(nd,4.0)*0.5*uPower + st, 0.0, 1.0)); }`
  });
  timed.push(orbMat);
  orbGroup.add(new THREE.Mesh(new THREE.SphereGeometry(2.4, 48, 32), orbMat));
  const spriteGlow = (col, k, s, map = glowTex) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: hdr(col, k), transparent: true, depthWrite: false, blending: ADD })); sp.scale.set(s, s, 1); return sp; };
  const orbCore = spriteGlow(0xffe4a8, 2.2, 3); orbGroup.add(orbCore);
  const orbFlare = spriteGlow(0xfff6e0, 1.5, 10, flareTex); orbFlare.material.opacity = 0; orbGroup.add(orbFlare);
  const orbHalo = spriteGlow(0x94e1f3, 0.35, 14); orbGroup.add(orbHalo);
  const orbRings = [0xfadc98, 0x94e1f3].map((c, i) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(3.3 + i * 0.5, 0.05, 6, 120), new THREE.MeshBasicMaterial({ color: hdr(c, 2), transparent: true, opacity: 0, blending: ADD, depthWrite: false }));
    r.rotation.x = Math.PI / 2 + (i ? -0.5 : 0.4); r.rotation.y = i ? 0.3 : -0.2; orbGroup.add(r); return r;
  });
  const orbLight = new THREE.PointLight(0xbfe9ff, 6, 40, 1.5); orbGroup.add(orbLight);
  const grateLight = new THREE.PointLight(0xfadc98, 8, 14, 1.6); grateLight.position.set(0, PLAT_Y + 1, 0); arena.add(grateLight);

  // ---------- lightning arcs ----------
  const ARC_PTS = 28;
  const arcs = circles.map((c) => {
    const lines = [0, 1].map((k) => {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_PTS * 3), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: k ? hdr(0xffffff, 3) : hdr(c.color.getHex(), 4), transparent: true, opacity: 0, blending: ADD, depthWrite: false }));
      line.frustumCulled = false; arena.add(line); return line;
    });
    return { c, lines, on: 0 };
  });
  function rebuildArc(arc) {
    const sx = arc.c.x, sz = arc.c.z, sy = PLAT_Y + 1.2, oy = orbGroup.position.y;
    arc.lines.forEach((line, k) => {
      const p = line.geometry.attributes.position;
      for (let j = 0; j < ARC_PTS; j++) {
        const f = j / (ARC_PTS - 1), env = Math.sin(f * Math.PI), jit = (k ? 0.35 : 0.7) * env;
        p.setXYZ(j, sx * (1 - f) + (Math.random() - 0.5) * jit, sy + (oy - sy) * f + env * 2.4 + (Math.random() - 0.5) * jit, sz * (1 - f) + (Math.random() - 0.5) * jit);
      }
      p.needsUpdate = true;
    });
  }

  // ---------- shockwave & floating glyphs ----------
  const shock = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 96), new THREE.MeshBasicMaterial({ color: hdr(0xbff4ff, 2.5), transparent: true, opacity: 0, blending: ADD, depthWrite: false, side: THREE.DoubleSide }));
  shock.rotation.x = -Math.PI / 2; shock.position.y = PLAT_Y + 0.3; arena.add(shock);
  let shockT = -10;
  const glyphTexes = Array.from({ length: 6 }, glyphTexture);
  const glyphs = Array.from({ length: LOW ? 18 : 34 }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTexes[i % 6], color: hdr(i % 2 ? 0xfadc98 : 0x94e1f3, 1.4), transparent: true, opacity: 0, depthWrite: false, blending: ADD }));
    s.userData = { life: rand() * 6, speed: 0.6 + rand() * 1.2, a: rand() * 6.28, r: 3 + rand() * 11 };
    s.scale.set(0.9, 0.9, 1); arena.add(s); return s;
  });

  await step(0.6, 'Raising the islands');
  // ===================== the world around it =====================
  const castleIsle = island({ pos: new THREE.Vector3(40, 8, -70), r: 15, depth: 22, trees: 10, falls: [[0.4, 3, 30], [-0.9, 2.2, 24]] });
  castleIsle.add(castle(1.35)); castleIsle.rotation.y = -0.5;
  island({ pos: new THREE.Vector3(-70, 18, -140), r: 11, depth: 16, trees: 6, falls: [[0.7, 2.4, 22]] }).add(castle(0.85));
  island({ pos: new THREE.Vector3(120, 26, -200), r: 10, depth: 15, trees: 5 }).add(castle(0.8));

  // ruins + arch portal
  const ruins = island({ pos: new THREE.Vector3(-36, 3, -18), r: 9, depth: 15, trees: 4, falls: [[1.2, 2, 20]], spin: 0.006 });
  const portalAnchor = new THREE.Object3D();
  {
    const b = new Builder();
    [[-4, 2, 5.5], [-1.5, -3.5, 7], [4.5, -1, 4]].forEach(([x, z, h]) => {
      b.add(columnGeo, 'marble', x, 0.3, z, 0, 0, 0, 0.6, h, 0.6);
      b.add(box, 'stoneFlat', x, h + 0.5, z, 0, 0.3, 0, 1.6, 0.4, 1.6);
    });
    b.add(box, 'stoneFlat', 3.2, 0.5, 3.2, 0.2, 0.4, 0.5, 2.6, 0.9, 0.9);   // fallen drum
    b.build(ruins);
    const arch = new THREE.Group(); arch.position.set(1, 0.2, 2.5); arch.rotation.y = 0.6; ruins.add(arch);
    const ab = new Builder();
    [-2.3, 2.3].forEach((x) => { ab.add(box, 'stoneFlat', x, 0.3, 0, 0, 0, 0, 1.3, 0.6, 1.3); ab.add(columnGeo, 'marble', x, 0.6, 0, 0, 0, 0, 0.5, 5, 0.5); });
    const archArc = new THREE.TorusGeometry(2.3, 0.45, 8, 24, Math.PI);
    ab.add(archArc, 'marble', 0, 5.6, 0, 0, 0, 0, 1, 1, 1.6);
    ab.add(box, 'gold', 0, 7.95, 0, 0, 0, Math.PI / 4, 0.55, 0.55, 0.8);
    ab.build(arch);
    const portalMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: ADD, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uPower: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `${LIN} uniform float uTime; uniform float uPower; varying vec2 vUv;
        void main(){ vec2 p = (vUv - vec2(0.5, 0.42)) * vec2(1.0, 0.62); float r = length(p) * 2.2; float a = atan(p.y, p.x);
          float s = 0.5 + 0.5 * sin(a * 3.0 + r * 14.0 - uTime * 3.0 * (0.6 + uPower * 0.5));
          vec3 c = mix(vec3(0.5,0.3,1.0), vec3(0.6,0.95,1.0), s);
          float m = 1.0 - smoothstep(0.7, 1.0, r);
          gl_FragColor = vec4(toLin(c) * (0.8 + uPower * 0.7), m * (0.2 + 0.5 * s) * (0.6 + 0.4 * (1.0 - r))); }`
    });
    timed.push(portalMat);
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 7.4), portalMat); portal.position.y = 3.8; arch.add(portal);
    const pl = new THREE.PointLight(0x9f6bff, 12, 16, 1.6); pl.position.set(0, 3.5, 1); arch.add(pl);
    arch.userData = { portalMat, light: pl };
    portalAnchor.position.set(0, 4, 0); arch.add(portalAnchor);
    ruins.userData.arch = arch;
  }

  // rotunda
  const rot = island({ pos: new THREE.Vector3(38, 1, -12), r: 8, depth: 14, trees: 3, falls: [[-1.4, 2, 18]], spin: -0.006 });
  {
    const b = new Builder();
    b.add(cylG, 'stoneFlat', 0, 0.3, 0, 0, 0, 0, 4.8, 0.6, 4.8);
    b.add(cylG, 'stoneFlat', 0, 0.75, 0, 0, 0, 0, 4.4, 0.3, 4.4);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; b.add(columnGeo, 'marble', Math.sin(a) * 3.7, 0.9, Math.cos(a) * 3.7, 0, 0, 0, 0.32, 5.6, 0.32); }
    b.add(cylG, 'stoneFlat', 0, 6.8, 0, 0, 0, 0, 4.4, 0.7, 4.4);
    b.add(cylG, 'gold', 0, 7.2, 0, 0, 0, 0, 4.25, 0.12, 4.25);
    b.add(new THREE.SphereGeometry(4.1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), 'roof', 0, 7.2, 0);
    b.add(cylG, 'stoneFlat', 0, 11.5, 0, 0, 0, 0, 0.8, 0.8, 0.8);
    b.add(coneG, 'gold', 0, 13.2, 0, 0, 0, 0, 0.25, 2.6, 0.25);
    b.build(rot);
  }
  const lantern = spriteGlow(0xffc56a, 2.5, 3); lantern.position.y = 3.4; rot.add(lantern);
  const rotLight = new THREE.PointLight(0xffc56a, 10, 12, 1.6); rotLight.position.y = 3.4; rot.add(rotLight);

  island({ pos: new THREE.Vector3(-90, 0, -80), r: 8, depth: 13, trees: 7, falls: [[0.3, 1.8, 18]] });
  island({ pos: new THREE.Vector3(85, 14, -110), r: 6, depth: 10, trees: 5 });
  island({ pos: new THREE.Vector3(-20, 30, -120), r: 4, depth: 8, trees: 3 });
  island({ pos: new THREE.Vector3(-26, -12, 26), r: 3.5, depth: 7, trees: 2, spin: 0.05 });
  island({ pos: new THREE.Vector3(30, -9, 22), r: 2.8, depth: 6, trees: 2, spin: 0.06 });
  island({ pos: new THREE.Vector3(10, 40, -170), r: 7, depth: 11, trees: 4 });

  // debris ring — one instanced draw call
  const DEBRIS = LOW ? 16 : 32;
  const debrisMeshes = [[1, 0.7, 1.25], [1.1, 0.55, 0.9], [0.8, 1.0, 0.85], [1.3, 0.6, 1.0]].map((st, k) => {
    const m = new THREE.InstancedMesh(rockGeometry(noise, { detail: LOW ? 2 : 3, seed: 40 + k * 5, cuts: 5 + k, stretch: st, amp: 0.3 }), mats.boulder, DEBRIS / 4);
    m.castShadow = true; m.receiveShadow = true; scene.add(m); return m;
  });
  const debrisData = Array.from({ length: DEBRIS }, (_, i) => ({ mesh: debrisMeshes[i % 4], idx: Math.floor(i / 4), a: rand() * 6.28, r: 20 + rand() * 11, y: -7 + rand() * 13, s: 0.04 + rand() * 0.07, ph: rand() * 6.28, size: 0.3 + Math.pow(rand(), 2.2) * 1.9, rx: rand() * 6, ry: rand() * 6, rz: rand() * 6, spin: 0.1 + rand() * 0.25 }));
  const dummy = new THREE.Object3D();

  // dragons with membrane wings
  const wingGeo = (() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.9); s.lineTo(2.6, 1.7); s.lineTo(7.6, 0.5);
    s.quadraticCurveTo(6.4, -0.4, 5.8, -1.7); s.quadraticCurveTo(4.6, -0.7, 3.7, -1.6); s.quadraticCurveTo(2.6, -0.5, 1.5, -1.3); s.quadraticCurveTo(0.8, -0.6, 0, -1.0); s.lineTo(0, 0.9);
    const g = new THREE.ShapeGeometry(s, 8); g.rotateX(-Math.PI / 2); return g;
  })();
  const bodyGeo = new THREE.LatheGeometry([[0, -3.2], [0.25, -2.8], [0.6, -1.6], [0.85, 0], [0.7, 1.4], [0.45, 2.4], [0.5, 3.0], [0.3, 3.8], [0, 4.2]].map(([x, y]) => new THREE.Vector2(x, y)), 8);
  bodyGeo.rotateX(Math.PI / 2);
  const tailGeo = new THREE.ConeGeometry(0.28, 6, 6); tailGeo.rotateX(-Math.PI / 2); tailGeo.translate(0, 0, -6);
  const dragons = [[0, 60, -150, 120, 0.09, 1.1], [30, 75, -220, 160, -0.06, 0.8], [-40, 45, -120, 90, 0.11, 0.7]].map(([cx, cy, cz, R, sp, sc], i) => {
    const d = new THREE.Group();
    d.add(new THREE.Mesh(bodyGeo, mats.dragon)); d.add(new THREE.Mesh(tailGeo, mats.dragon));
    const wl = new THREE.Mesh(wingGeo, mats.dragon), wr = new THREE.Mesh(wingGeo, mats.dragon);
    wl.position.z = 0.6; wr.position.z = 0.6; wr.scale.x = -1;
    d.add(wl); d.add(wr); d.scale.setScalar(sc); scene.add(d);
    return { d, wl, wr, cx, cy, cz, R, sp, a: i * 2.1 };
  });

  await step(0.8, 'Weaving the clouds');
  // clouds
  const cloudTexes = [5, 9, 13].map((k) => tex(cloudCanvas(k, LOW ? 128 : 256)));
  const clouds = Array.from({ length: LOW ? 45 : 80 }, (_, i) => {
    const low = i < (LOW ? 32 : 58);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexes[i % 3], color: low ? 0x9d8ccc : 0xc4b8ee, transparent: true, opacity: low ? 0.62 : 0.3, depthWrite: false }));
    s.material.rotation = (rand() - 0.5) * 0.15;
    const sc = (low ? 44 : 30) + rand() * 50; s.scale.set(sc, sc * 0.55, 1);
    s.position.set(-240 + rand() * 480, low ? -36 + rand() * 16 : 2 + rand() * 30, -280 + rand() * 320);
    s.userData.v = 0.6 + rand() * 1.4; scene.add(s); return s;
  });

  const cloudSea = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800, 1, 1), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uMoon: { value: moonDir } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `${LIN} ${GN} uniform float uTime; uniform vec3 uMoon; varying vec3 vW;
      void main(){
        vec3 q = vec3(vW.xz * 0.011 + vec2(uTime * 0.008, uTime * 0.003), uTime * 0.012);
        float d = fbm3(q); float dl = fbm3(q + vec3(uMoon.x, 0.0, uMoon.z) * 0.06);
        float den = smoothstep(0.32, 0.72, d);
        float lit = clamp(0.55 + (d - dl) * 3.5, 0.15, 1.25);
        vec3 c = mix(vec3(0.13, 0.11, 0.28), vec3(0.62, 0.56, 0.86), den * lit);
        float fade = 1.0 - smoothstep(380.0, 860.0, length(vW.xz));
        gl_FragColor = vec4(toLin(c), (0.35 + den * 0.6) * fade); }`
  }));
  cloudSea.rotation.x = -Math.PI / 2; cloudSea.position.y = -52; scene.add(cloudSea); timed.push(cloudSea.material);

  // motes
  const MOTE_N = LOW ? 260 : 500;
  const mPos = new Float32Array(MOTE_N * 3), mCol = new Float32Array(MOTE_N * 3), mVel = [];
  const pal = [hdr(0xfadc98, 2), hdr(0x94e1f3, 2), hdr(0xc4b2ff, 2)];
  for (let i = 0; i < MOTE_N; i++) {
    const a = rand() * 6.28, d = 4 + rand() * 48;
    mPos.set([Math.sin(a) * d, -30 + rand() * 70, Math.cos(a) * d - 10], i * 3);
    const c = pal[i % 3]; mCol.set([c.r, c.g, c.b], i * 3);
    mVel.push({ v: 0.8 + rand() * 2.2, ph: rand() * 6.28 });
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  moteGeo.setAttribute('color', new THREE.BufferAttribute(mCol, 3));
  scene.add(new THREE.Points(moteGeo, new THREE.PointsMaterial({ size: 0.9, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: ADD })));

  // shooting stars
  const [ssc, ssg] = cnv(256, 8); const lg = ssg.createLinearGradient(0, 0, 256, 0);
  lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.85, 'rgba(220,240,255,0.7)'); lg.addColorStop(1, 'rgba(255,255,255,1)');
  ssg.fillStyle = lg; ssg.fillRect(0, 2, 256, 4);
  const shoot = new THREE.Mesh(new THREE.PlaneGeometry(46, 0.7), new THREE.MeshBasicMaterial({ map: tex(ssc), color: hdr(0xffffff, 2), transparent: true, opacity: 0, depthWrite: false, blending: ADD, fog: false }));
  const shootDir = new THREE.Vector3(1, -0.4, 0).normalize(); shoot.rotation.z = Math.atan2(shootDir.y, shootDir.x); scene.add(shoot);
  let shootT = -1, nextShoot = 3;

  // ===================== training: crystals, bolts, shards =====================
  const crystalGeo = new THREE.OctahedronGeometry(1, 0); crystalGeo.scale(0.8, 1.5, 0.8);
  const crystals = [0x94e1f3, 0xc4a0ff, 0xfadc98, 0x7ff0d0].map((c, i) => {
    const m = new THREE.Mesh(crystalGeo, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.2, flatShading: true, transparent: true, opacity: 0.92 }));
    m.castShadow = true;
    const glow = spriteGlow(c, 0.55, 3.4); m.add(glow);
    m.visible = false; scene.add(m);
    m.userData = { i, alive: false, grow: 0, a: i * Math.PI / 2, r: 7, h: 9, sp: 0.25, glow, respawnAt: 0 };
    return m;
  });
  const bolts = [], shards = [];
  const shardGeo = new THREE.TetrahedronGeometry(0.35, 0);
  const shardMats = crystals.map((c) => new THREE.MeshStandardMaterial({ color: c.material.color, emissive: c.material.color, emissiveIntensity: 1.4, flatShading: true }));

  // ===================== state & API =====================
  const state = {
    t: 0, orbPower: 0.15, orbTarget: 0.15, portalBoost: 0, circleBoost: 0, shake: 0, beamH: 1, focus: 'arena',
    paused: false
  };
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  function triggerShock(strength = 1) { shockT = state.t; state.shake = Math.max(state.shake, 0.6 * strength * (reduce ? 0 : 1)); }
  function setCircles(list) { circles.forEach((c, i) => { const w = list[i] ? 1 : 0; if (w && !c.want) c.flashT = state.t; c.want = w; }); }
  function circleWorld(i, out) { const c = circles[i]; return out.set(c.x, PLAT_Y + 2.2, c.z).applyMatrix4(arena.matrixWorld); }
  function orbWorld(out) { return orbGroup.getWorldPosition(out); }
  function portalWorld(out) { return portalAnchor.getWorldPosition(out); }
  // portal position plus the horizontal direction it faces (towards the viewer)
  function portalFrame(outPos, outN) {
    portalAnchor.getWorldPosition(outPos);
    ruins.userData.arch.getWorldDirection(outN); outN.y = 0; outN.normalize();
    return outPos;
  }
  const fP = new THREE.Vector3(), fN = new THREE.Vector3(), fT = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

  // training API
  function placeCrystal(m) {
    const u = m.userData;
    u.a = Math.random() * Math.PI * 2; u.r = 3 + Math.random() * 4.5; u.h = -1.6 + Math.random() * 5.2;
    u.sp = (0.2 + Math.random() * 0.35) * (Math.random() < 0.5 ? -1 : 1);
    u.alive = true; u.grow = 0; m.visible = true;
  }
  function startTraining() { crystals.forEach((m, i) => { placeCrystal(m); m.userData.grow = -i * 0.25; }); }
  function stopTraining() { crystals.forEach((m) => { m.visible = false; m.userData.alive = false; }); bolts.splice(0).forEach((b) => { scene.remove(b.head); b.trail.forEach((s) => scene.remove(s)); }); }
  const raycaster = new THREE.Raycaster();
  function aimRay(ndcX, ndcY) { raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera); return raycaster.ray; }
  function pickCrystal(ray) {
    let best = null, bestD = Infinity;
    crystals.forEach((m) => {
      if (!m.userData.alive || m.userData.grow < 0.6) return;
      m.getWorldPosition(tmp);
      const d = ray.distanceToPoint(tmp), along = tmp2.copy(tmp).sub(ray.origin).dot(ray.direction);
      if (d < 2.1 && along > 0 && along < bestD) { bestD = along; best = m; }
    });
    return best;
  }
  function castBolt(fromIndex, ndcX, ndcY, color, onResult) {
    scene.updateMatrixWorld();
    const ray = aimRay(ndcX, ndcY);
    const target = pickCrystal(ray);
    // bolts leave from just below the viewer, alternating hands, like a wand in front of the camera
    const fwd = camera.getWorldDirection(new THREE.Vector3()), right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    const start = camera.position.clone().addScaledVector(fwd, 3).addScaledVector(right, fromIndex % 2 ? 0.9 : -0.9).addScaledVector(UP, -1.3);
    const end = target ? target.getWorldPosition(new THREE.Vector3()) : ray.at(70, new THREE.Vector3());
    const head = spriteGlow(color, 4, 2.2); scene.add(head); head.position.copy(start);
    const trail = Array.from({ length: 8 }, (_, k) => { const s = spriteGlow(color, 2.5 - k * 0.25, 1.6 - k * 0.15); scene.add(s); return s; });
    const mid = start.clone().lerp(end, 0.5); mid.y += 1.2;
    bolts.push({ head, trail, start, mid, end, t: 0, dur: target ? 0.28 : 0.45, target, color, onResult, hist: [] });
    circles[fromIndex].flashT = state.t;
  }
  function shatter(m) {
    const u = m.userData; u.alive = false; m.visible = false; u.respawnAt = state.t + 1.1;
    m.getWorldPosition(tmp);
    for (let k = 0; k < (LOW ? 8 : 16); k++) {
      const s = new THREE.Mesh(shardGeo, shardMats[u.i]);
      s.position.copy(tmp);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 8);
      scene.add(s); shards.push({ s, v, life: 1.2, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8) });
    }
    const flashS = spriteGlow(m.material.color.getHex(), 2.2, 5); flashS.position.copy(tmp); scene.add(flashS);
    shards.push({ s: flashS, v: new THREE.Vector3(), life: 0.35, flash: true });
    state.shake = Math.max(state.shake, reduce ? 0 : 0.35);
  }
  const bez = (a, b, c, t, out) => out.copy(a).multiplyScalar((1 - t) * (1 - t)).addScaledVector(b, 2 * (1 - t) * t).addScaledVector(c, t * t);

  // ===================== per-frame update =====================
  let arcTimer = 0;
  function update(dt) {
    const sp = reduce ? 0.4 : 1;
    state.t += dt;
    const t = state.t, at = t * sp;
    timed.forEach((m) => { m.uniforms.uTime.value = at; });
    grade.uniforms.uTime.value = at;

    islands.forEach((g) => { const u = g.userData; g.position.y = u.base.y + Math.sin(at * 0.45 + u.phase) * u.amp; g.rotation.y += u.spin * dt * sp; });
    beacons.forEach((b, i) => { const s = 3 * (1 + Math.sin(at * 2.2 + i) * 0.2); b.scale.set(s, s, 1); });
    const fl = 0.9 + Math.random() * 0.15; lantern.scale.set(3 * fl, 3 * fl, 1); rotLight.intensity = 9 * fl;

    // circles
    circles.forEach((c, i) => {
      c.lit += (c.want - c.lit) * Math.min(1, dt * 6);
      const L = c.lit, pulse = 0.85 + 0.15 * Math.sin(at * 2.5 + i) + state.circleBoost * 0.25;
      const pop = Math.max(0, 1 - (t - c.flashT) / 0.8);
      c.seal.material.opacity = 0.1 + L * 0.6 * pulse + pop * 0.25;
      c.seal.material.color.copy(c.color).multiplyScalar(0.45 + L * 1.1 + pop * 1.0);
      c.seal.rotation.z += dt * (0.2 + L * 0.4) * (i % 2 ? 1 : -1) * sp;
      c.halo.material.opacity = L * 0.2 * pulse + pop * 0.35;
      c.halo.scale.setScalar(1 + pop * 0.6);
      c.beam.scale.y = Math.max(0.01, L * state.beamH);
      c.beam.position.y = PLAT_Y + 0.8 + 7 * c.beam.scale.y;
      c.beam.material.opacity = L * (0.22 + 0.06 * Math.sin(at * 3 + i)) * state.beamH + pop * 0.25;
      c.beam.material.color.copy(c.color).multiplyScalar(0.7);
      c.light.intensity = (L * 7 * pulse + pop * 16);
    });

    arcTimer += dt;
    if (arcTimer > (reduce ? 0.25 : 0.06)) { arcTimer = 0; arcs.forEach(rebuildArc); }
    arcs.forEach((a) => {
      const target = a.c.lit > 0.5 && state.orbPower > 0.5 ? 1 : 0;
      a.on += (target - a.on) * Math.min(1, dt * 6);
      const flick = 0.6 + 0.4 * Math.random();
      a.lines[0].material.opacity = a.on * 0.9 * flick; a.lines[1].material.opacity = a.on * 0.6 * flick;
    });

    // orb
    state.orbPower += (state.orbTarget - state.orbPower) * Math.min(1, dt * 3);
    const P = state.orbPower;
    orbMat.uniforms.uPower.value = P;
    orbGroup.position.y = ORB_Y + Math.sin(at * 1.1) * 0.35;
    orbGroup.rotation.y += dt * 0.4 * sp;
    const breathe = 1 + Math.sin(at * 1.8) * 0.12;
    orbCore.scale.setScalar(1.4 + P * 1.6 * breathe); orbCore.material.opacity = Math.min(1, 0.3 + P * 0.7);
    orbHalo.scale.setScalar(8 + P * 4 * breathe); orbHalo.material.opacity = 0.12 + P * 0.12;
    orbFlare.material.opacity = Math.min(0.8, P * 0.45); orbFlare.material.rotation += dt * 0.15 * sp; orbFlare.scale.setScalar(8 + P * 6 * breathe);
    orbRings.forEach((r, i) => { r.material.opacity = Math.min(0.9, P * 0.85); r.rotation.z += dt * (i ? -0.8 : 1.1) * sp * (1 + P * 0.5); });
    orbLight.intensity = 3 + P * 9 * breathe;
    grateLight.intensity = 2 + P * 4;
    runeBand.material.uniforms.uPower.value = Math.min(0.9, 0.15 + P * 0.55 + state.circleBoost * 0.2);

    // portal
    const arch = ruins.userData.arch;
    arch.userData.portalMat.uniforms.uPower.value += ((1 + state.portalBoost * 1.6) - arch.userData.portalMat.uniforms.uPower.value) * Math.min(1, dt * 4);
    arch.userData.light.intensity = 8 + state.portalBoost * 14;

    const se = t - shockT;
    if (se >= 0 && se < 1.6) { const k = se / 1.6; shock.scale.setScalar(2 + (1 - Math.pow(1 - k, 3)) * 34); shock.material.opacity = (1 - k) * 0.9; }
    else shock.material.opacity = 0;

    glyphs.forEach((g) => {
      const u = g.userData; u.life += dt * sp * u.speed * 0.5;
      if (u.life > 6) { u.life = 0; u.a = rand() * 6.28; u.r = 3 + rand() * 11; }
      const k = u.life / 6;
      g.position.set(Math.sin(u.a + k) * u.r, PLAT_Y + 0.5 + k * 12, Math.cos(u.a + k) * u.r);
      g.material.opacity = Math.sin(k * Math.PI) * (0.25 + P * 0.5);
    });

    debrisData.forEach((u) => {
      u.a += u.s * dt * sp * 0.5;
      dummy.position.set(Math.sin(u.a) * u.r, arena.position.y + u.y + Math.sin(at * 0.8 + u.ph) * 0.8, Math.cos(u.a) * u.r);
      dummy.rotation.set(u.rx + at * u.spin, u.ry + at * u.spin * 0.7, u.rz); dummy.scale.setScalar(u.size); dummy.updateMatrix();
      u.mesh.setMatrixAt(u.idx, dummy.matrix);
    });
    debrisMeshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; });

    dragons.forEach((g) => {
      g.a += g.sp * dt * sp;
      const x = g.cx + Math.cos(g.a) * g.R, z = g.cz + Math.sin(g.a) * g.R, y = g.cy + Math.sin(g.a * 2) * 4;
      const na = g.a + Math.sign(g.sp) * 0.05;
      g.d.position.set(x, y, z);
      g.d.lookAt(g.cx + Math.cos(na) * g.R, g.cy + Math.sin(na * 2) * 4, g.cz + Math.sin(na) * g.R);
      const flap = Math.sin(at * 3.2 + g.cx) * 0.65;
      g.wl.rotation.z = flap; g.wr.rotation.z = -flap;
    });

    clouds.forEach((c) => { c.position.x += c.userData.v * dt * sp; if (c.position.x > 240) c.position.x = -240; });
    const mp = moteGeo.attributes.position;
    for (let i = 0; i < MOTE_N; i++) {
      let y = mp.getY(i) + mVel[i].v * dt * sp; if (y > 40) y = -30;
      mp.setY(i, y); mp.setX(i, mp.getX(i) + Math.sin(at * 0.7 + mVel[i].ph) * 0.01);
    }
    mp.needsUpdate = true;

    if (!reduce) {
      if (shootT < 0 && t > nextShoot) { shootT = 0; shoot.position.set(-200 + rand() * 260, 150 + rand() * 60, -380); }
      if (shootT >= 0) {
        shootT += dt; shoot.position.addScaledVector(shootDir, 230 * dt);
        shoot.material.opacity = Math.sin(Math.min(shootT / 1.1, 1) * Math.PI);
        if (shootT > 1.1) { shootT = -1; shoot.material.opacity = 0; nextShoot = t + 4 + rand() * 5; }
      }
    }

    // moonlight shadows follow the action
    if (state.focus === 'portal') portalWorld(tmp2); else tmp2.set(0, 0, 0);
    moon.target.position.lerp(tmp2, Math.min(1, dt * 1.5));
    moon.position.copy(moon.target.position).add(tmp.set(30, 55, -18));

    // training objects orbit in front of the portal
    portalFrame(fP, fN); fT.set(fN.z, 0, -fN.x);
    fP.addScaledVector(fN, 5);
    crystals.forEach((m) => {
      const u = m.userData;
      if (!u.alive) { if (u.respawnAt && t > u.respawnAt && m.parent && state.training) { u.respawnAt = 0; placeCrystal(m); } return; }
      u.grow = Math.min(1, u.grow + dt * 1.6);
      u.a += u.sp * dt;
      const g = Math.max(0, u.grow), e = 1 - Math.pow(1 - g, 3);
      m.position.copy(fP).addScaledVector(fT, Math.sin(u.a) * u.r).addScaledVector(fN, Math.cos(u.a) * u.r * 0.45); m.position.y += u.h + Math.sin(at * 1.4 + u.i) * 0.5;
      m.rotation.y += dt * 1.2; m.scale.setScalar(Math.max(0.001, e));
    });
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]; b.t += dt / b.dur;
      const k = Math.min(1, b.t);
      if (b.target && b.target.userData.alive) b.target.getWorldPosition(b.end);
      bez(b.start, b.mid, b.end, k, b.head.position);
      b.hist.unshift(b.head.position.clone()); if (b.hist.length > b.trail.length * 2) b.hist.pop();
      b.trail.forEach((s, j) => { const h = b.hist[Math.min(b.hist.length - 1, j * 2)]; if (h) s.position.copy(h); });
      if (k >= 1) {
        const hit = b.target && b.target.userData.alive;
        if (hit) shatter(b.target);
        b.onResult?.(hit);
        scene.remove(b.head); b.trail.forEach((s) => scene.remove(s)); bolts.splice(i, 1);
      }
    }
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i]; s.life -= dt;
      if (s.flash) { s.s.material.opacity = Math.max(0, s.life / 0.35); s.s.scale.multiplyScalar(1 + dt * 4); }
      else { s.v.y -= 18 * dt; s.s.position.addScaledVector(s.v, dt); s.s.rotation.x += s.spin.x * dt; s.s.rotation.y += s.spin.y * dt; s.s.scale.setScalar(Math.max(0.01, s.life / 1.2)); }
      if (s.life <= 0) { scene.remove(s.s); shards.splice(i, 1); }
    }
  }

  function render() { composer.render(); }
  function setQuality({ pr, shadows, ao }) {
    if (ao != null && aoPass) aoPass.enabled = ao;
    if (pr != null && pr !== pixelRatio) { pixelRatio = pr; resize(); }
    if (shadows != null && renderer.shadowMap.enabled !== shadows) {
      renderer.shadowMap.enabled = shadows; moon.castShadow = shadows;
      scene.traverse((o) => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); } });
    }
  }

  // free GPU memory and listeners when the screen is unmounted
  function dispose() {
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', resize);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const list = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      list.forEach((m) => { Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); }); m.dispose(); });
    });
    if (scene.environment) scene.environment.dispose();
    composer.dispose();
    renderer.dispose();
  }

  // compile every shader now, so the first frames don't stutter
  await step(0.9, 'Awakening the magic');
  update(0);
  // warm up from the exact opening shot, so the first visible frame is the real view
  if (view) { camera.position.set(view.from.x, view.from.y, view.from.z); camera.lookAt(view.look.x, view.look.y, view.look.z); camera.updateMatrixWorld(); }
  if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  composer.render();
  await step(1, 'Ready');

  return {
    dispose,
    THREE, scene, camera, renderer, state, circles, CIRCLE_COLORS, PLAT_Y,
    update, render, setQuality, get pixelRatio() { return pixelRatio; }, maxPR, get aoOn() { return !!(aoPass && aoPass.enabled); },
    triggerShock, setCircles, orbWorld, portalWorld, portalFrame, circleWorld,
    startTraining, stopTraining, castBolt, aimRay, crystals,
  };
}
