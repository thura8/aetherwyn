import * as THREE from "three";
import {
  createGlowSprite,
  hdrColor,
  type FrameTime,
  type WorldBuildContext,
  type WorldState,
} from "./buildContext";
import {
  createBeamTexture,
  createFlareTexture,
  createGlyphTexture,
  createGrateTexture,
  createPlatformTextures,
  createRuneCircleTexture,
} from "./canvasTextures";
import type { createIslandFactory } from "./islands";
import type { WorldMaterials } from "./materials";
import { heightFieldToNormalCanvas } from "./proceduralTextures";
import { TO_LINEAR_GLSL, UV_VERTEX_GLSL } from "./shaderChunks";
import { StaticMeshBuilder, type SharedShapes } from "./structures";

export const CIRCLE_COLORS = [0x9f6bff, 0x7fe8ff, 0xffd27a, 0x5ff0c8];

const ADDITIVE = THREE.AdditiveBlending;
const PLATFORM_Y = 1.6;
const ORB_Y = 8;
const ARC_POINT_COUNT = 28;

export interface CastingCircle {
  x: number;
  z: number;
  color: THREE.Color;
  seal: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  halo: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  light: THREE.PointLight;
  lit: number;
  wanted: number;
  flashTime: number;
}

function buildPlatform(
  arena: THREE.Group,
  materials: WorldMaterials,
  { box, column, cylinder }: SharedShapes,
  rand: () => number,
) {
  const builder = new StaticMeshBuilder(materials);
  builder.add(
    cylinder,
    "stoneDark",
    0,
    PLATFORM_Y / 2,
    0,
    0,
    0,
    0,
    15.8,
    PLATFORM_Y,
    15.8,
  );
  for (let i = 0; i < 44; i++) {
    const angle = (i / 44) * Math.PI * 2;
    // Leaves a gap in the balustrade on the camera side.
    if (Math.cos(angle) > 0.82) continue;
    builder.add(
      column,
      "marble",
      Math.sin(angle) * 15.5,
      PLATFORM_Y,
      Math.cos(angle) * 15.5,
      0,
      0,
      0,
      0.22,
      1.1,
      0.22,
    );
  }
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    if (Math.cos(angle) > 0.5) continue;
    const height = 4.2 + rand() * 2.2;
    builder.add(
      column,
      "marble",
      Math.sin(angle) * 15.6,
      PLATFORM_Y,
      Math.cos(angle) * 15.6,
      0,
      0,
      0,
      0.55,
      height,
      0.55,
    );
    builder.add(
      box,
      "stoneFlat",
      Math.sin(angle) * 15.6,
      PLATFORM_Y + height + 0.2,
      Math.cos(angle) * 15.6,
      0,
      angle,
      0,
      1.5,
      0.4,
      1.5,
    );
  }
  builder.build(arena);
  const rail = new THREE.Mesh(
    new THREE.TorusGeometry(15.5, 0.16, 8, 128, Math.PI * 2),
    materials.marble,
  );
  rail.rotation.x = Math.PI / 2;
  rail.position.y = PLATFORM_Y + 1.15;
  rail.castShadow = true;
  arena.add(rail);
  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(15.8, 0.32, 8, 96),
    materials.gold,
  );
  lip.rotation.x = Math.PI / 2;
  lip.position.y = PLATFORM_Y;
  arena.add(lip);
}

function buildFloor(
  arena: THREE.Group,
  context: WorldBuildContext,
  materials: WorldMaterials,
) {
  const textures = createPlatformTextures(context.random);
  const floorMaterial = new THREE.MeshStandardMaterial({
    map: textures.map,
    roughnessMap: textures.roughness,
    roughness: 1,
    metalness: 0.15,
  });
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(15.4, 96),
    floorMaterial,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = PLATFORM_Y + 0.01;
  floor.receiveShadow = true;
  arena.add(floor);

  const size = textures.colorCanvas.width;
  const pixels = textures.colorCanvas
    .getContext("2d")!
    .getImageData(0, 0, size, size).data;
  const heights = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++)
    heights[i] =
      (pixels[i * 4] * 0.3 +
        pixels[i * 4 + 1] * 0.59 +
        pixels[i * 4 + 2] * 0.11) /
      255;
  const normalMap = new THREE.CanvasTexture(
    heightFieldToNormalCanvas(heights, size, 4),
  );
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.anisotropy = 8;
  floorMaterial.normalMap = normalMap;
  floorMaterial.normalScale.set(1, -1);
  floorMaterial.needsUpdate = true;

  const runeBandMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: ADDITIVE,
    uniforms: {
      map: { value: textures.runeBand },
      uTime: { value: 0 },
      uPower: { value: 0 },
    },
    vertexShader: UV_VERTEX_GLSL,
    fragmentShader: `${TO_LINEAR_GLSL} uniform sampler2D map; uniform float uTime; uniform float uPower; varying vec2 vUv;
      void main(){ float a = texture2D(map, vUv).r; vec2 p = vUv - 0.5; float ang = atan(p.y, p.x); float r = length(p);
        float w = 0.2 + 0.8 * pow(0.5 + 0.5 * sin(ang * 3.0 - uTime * 1.8 + r * 10.0), 3.0);
        vec3 c = mix(vec3(1.0,0.86,0.55), vec3(0.6,0.92,1.0), 0.5 + 0.5 * sin(ang * 2.0 + uTime));
        gl_FragColor = vec4(toLin(c) * (1.0 + w * 0.9), a * w * uPower); }`,
  });
  const runeBand = new THREE.Mesh(
    new THREE.CircleGeometry(15.4, 96),
    runeBandMaterial,
  );
  runeBand.rotation.x = -Math.PI / 2;
  runeBand.position.y = PLATFORM_Y + 0.03;
  arena.add(runeBand);
  context.timedMaterials.push(runeBandMaterial);

  const grate = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 40),
    new THREE.MeshBasicMaterial({
      map: createGrateTexture(),
      color: hdrColor(0xffffff, 1.3),
    }),
  );
  grate.rotation.x = -Math.PI / 2;
  grate.position.y = PLATFORM_Y + 0.04;
  arena.add(grate);
  const grateRim = new THREE.Mesh(
    new THREE.TorusGeometry(2.7, 0.2, 8, 48),
    materials.gold,
  );
  grateRim.rotation.x = Math.PI / 2;
  grateRim.position.y = PLATFORM_Y + 0.1;
  arena.add(grateRim);

  return runeBandMaterial;
}

function buildCastingCircles(
  arena: THREE.Group,
  context: WorldBuildContext,
  materials: WorldMaterials,
  pedestalShape: THREE.BufferGeometry,
) {
  const beamTexture = createBeamTexture();
  const sealTexture = createRuneCircleTexture(context.random.next);
  return [-3, -1, 1, 3].map((quarter, i): CastingCircle => {
    const angle = (quarter * Math.PI) / 4 + Math.PI;
    const x = Math.sin(angle) * 12.6;
    const z = Math.cos(angle) * 12.6;
    const color = new THREE.Color(CIRCLE_COLORS[i]);
    const pedestal = new THREE.Mesh(pedestalShape, materials.marble);
    pedestal.scale.set(2.9, 0.8, 2.9);
    pedestal.position.set(x, PLATFORM_Y, z);
    pedestal.castShadow = pedestal.receiveShadow = true;
    arena.add(pedestal);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(2.98, 0.1, 6, 48),
      materials.gold,
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, PLATFORM_Y + 0.8, z);
    arena.add(rim);
    const seal = new THREE.Mesh(
      new THREE.CircleGeometry(2.8, 48),
      new THREE.MeshBasicMaterial({
        map: sealTexture,
        color: color.clone(),
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        blending: ADDITIVE,
      }),
    );
    seal.rotation.x = -Math.PI / 2;
    seal.position.set(x, PLATFORM_Y + 0.82, z);
    arena.add(seal);
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(5, 32),
      new THREE.MeshBasicMaterial({
        map: context.glowTexture,
        color: color.clone(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: ADDITIVE,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(x, PLATFORM_Y + 0.85, z);
    arena.add(halo);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.7, 14, 32, 1, true),
      new THREE.MeshBasicMaterial({
        map: beamTexture,
        color: color.clone(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: ADDITIVE,
        side: THREE.DoubleSide,
      }),
    );
    beam.position.set(x, PLATFORM_Y + 7.8, z);
    beam.scale.y = 0.01;
    arena.add(beam);
    const light = new THREE.PointLight(color, 0, 22, 1.6);
    light.position.set(x, PLATFORM_Y + 3, z);
    arena.add(light);
    return {
      x,
      z,
      color,
      seal,
      halo,
      beam,
      light,
      lit: 0,
      wanted: 0,
      flashTime: -10,
    };
  });
}

function buildOrb(arena: THREE.Group, context: WorldBuildContext) {
  const { glowTexture, timedMaterials } = context;
  const group = new THREE.Group();
  group.position.set(0, ORB_Y, 0);
  arena.add(group);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: ADDITIVE,
    uniforms: { uTime: { value: 0 }, uPower: { value: 0.15 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `${TO_LINEAR_GLSL} uniform float uTime; uniform float uPower; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float nd = max(dot(normalize(vN), normalize(vV)), 0.0); float fres = pow(max(1.0 - nd, 0.0), 2.2);
        vec3 q = vP * 1.2;
        float st = pow(max(0.0, sin(q.x*9.0 + uTime) * sin(q.y*8.0 - uTime*1.3) * sin(q.z*10.0 + uTime*0.7)), 10.0) * 4.0;
        float swirl = 0.5 + 0.5 * sin(atan(vP.z, vP.x) * 3.0 + vP.y * 2.0 - uTime * 1.5);
        vec3 c = vec3(0.55,0.85,1.0) * fres * (0.9 + uPower) + vec3(1.0,0.88,0.65) * pow(nd, 4.0) * uPower * 0.9
               + vec3(0.9,0.95,1.0) * st * uPower + vec3(0.6,0.4,1.0) * swirl * fres * 0.4 * uPower;
        gl_FragColor = vec4(toLin(c) * (1.0 + uPower * 1.3), clamp(fres + pow(nd,4.0)*0.5*uPower + st, 0.0, 1.0)); }`,
  });
  timedMaterials.push(material);
  group.add(new THREE.Mesh(new THREE.SphereGeometry(2.4, 48, 32), material));
  const core = createGlowSprite(0xffe4a8, 2.2, 3, glowTexture);
  group.add(core);
  const flare = createGlowSprite(0xfff6e0, 1.5, 10, createFlareTexture());
  flare.material.opacity = 0;
  group.add(flare);
  const halo = createGlowSprite(0x94e1f3, 0.35, 14, glowTexture);
  group.add(halo);
  const rings = [0xfadc98, 0x94e1f3].map((color, i) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.3 + i * 0.5, 0.05, 6, 120),
      new THREE.MeshBasicMaterial({
        color: hdrColor(color, 2),
        transparent: true,
        opacity: 0,
        blending: ADDITIVE,
        depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI / 2 + (i ? -0.5 : 0.4);
    ring.rotation.y = i ? 0.3 : -0.2;
    group.add(ring);
    return ring;
  });
  const light = new THREE.PointLight(0xbfe9ff, 6, 40, 1.5);
  group.add(light);
  return { group, material, core, flare, halo, rings, light };
}

export function buildArena(
  context: WorldBuildContext,
  materials: WorldMaterials,
  shapes: SharedShapes,
  createIsland: ReturnType<typeof createIslandFactory>["createIsland"],
  state: WorldState,
) {
  const { lowQuality, reducedMotion } = context;
  const rand = context.random.next;
  const arena = createIsland({
    position: new THREE.Vector3(0, 0, 0),
    radius: 17.5,
    depth: 26,
    grass: false,
    spin: 0,
    bobAmplitude: 0.3,
    boulders: 0,
    cutDistance: [0.92, 1.0],
  });
  buildPlatform(arena, materials, shapes, rand);
  const runeBandMaterial = buildFloor(arena, context, materials);
  const circles = buildCastingCircles(
    arena,
    context,
    materials,
    shapes.pedestal,
  );
  const orb = buildOrb(arena, context);
  const grateLight = new THREE.PointLight(0xfadc98, 8, 14, 1.6);
  grateLight.position.set(0, PLATFORM_Y + 1, 0);
  arena.add(grateLight);

  const arcs = circles.map((circle) => {
    const lines = [0, 1].map((layer) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(ARC_POINT_COUNT * 3), 3),
      );
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: layer
            ? hdrColor(0xffffff, 3)
            : hdrColor(circle.color.getHex(), 4),
          transparent: true,
          opacity: 0,
          blending: ADDITIVE,
          depthWrite: false,
        }),
      );
      line.frustumCulled = false;
      arena.add(line);
      return line;
    });
    return { circle, lines, strength: 0 };
  });
  function rebuildArc(arc: (typeof arcs)[number]) {
    const startX = arc.circle.x;
    const startZ = arc.circle.z;
    const startY = PLATFORM_Y + 1.2;
    const orbY = orb.group.position.y;
    arc.lines.forEach((line, layer) => {
      const positions = line.geometry.attributes
        .position as THREE.BufferAttribute;
      for (let j = 0; j < ARC_POINT_COUNT; j++) {
        const fraction = j / (ARC_POINT_COUNT - 1);
        const envelope = Math.sin(fraction * Math.PI);
        const jitter = (layer ? 0.35 : 0.7) * envelope;
        positions.setXYZ(
          j,
          startX * (1 - fraction) + (Math.random() - 0.5) * jitter,
          startY +
            (orbY - startY) * fraction +
            envelope * 2.4 +
            (Math.random() - 0.5) * jitter,
          startZ * (1 - fraction) + (Math.random() - 0.5) * jitter,
        );
      }
      positions.needsUpdate = true;
    });
  }

  const shockwave = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1, 96),
    new THREE.MeshBasicMaterial({
      color: hdrColor(0xbff4ff, 2.5),
      transparent: true,
      opacity: 0,
      blending: ADDITIVE,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  shockwave.rotation.x = -Math.PI / 2;
  shockwave.position.y = PLATFORM_Y + 0.3;
  arena.add(shockwave);
  let shockwaveStart = -10;

  const glyphTextures = Array.from({ length: 6 }, () =>
    createGlyphTexture(rand),
  );
  const glyphs = Array.from({ length: lowQuality ? 18 : 34 }, (_, i) => {
    const glyph = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glyphTextures[i % 6],
        color: hdrColor(i % 2 ? 0xfadc98 : 0x94e1f3, 1.4),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: ADDITIVE,
      }),
    );
    glyph.userData = {
      life: rand() * 6,
      speed: 0.6 + rand() * 1.2,
      angle: rand() * 6.28,
      radius: 3 + rand() * 11,
    };
    glyph.scale.set(0.9, 0.9, 1);
    arena.add(glyph);
    return glyph;
  });

  let arcRefreshTimer = 0;

  function updateCircles({
    delta,
    elapsed,
    animationTime,
    motionScale,
  }: FrameTime) {
    circles.forEach((circle, i) => {
      circle.lit += (circle.wanted - circle.lit) * Math.min(1, delta * 6);
      const lit = circle.lit;
      const pulse = 0.85 + 0.15 * Math.sin(animationTime * 2.5 + i);
      const pop = Math.max(0, 1 - (elapsed - circle.flashTime) / 0.8);
      circle.seal.material.opacity = 0.1 + lit * 0.6 * pulse + pop * 0.25;
      circle.seal.material.color
        .copy(circle.color)
        .multiplyScalar(0.45 + lit * 1.1 + pop * 1.0);
      circle.seal.rotation.z +=
        delta * (0.2 + lit * 0.4) * (i % 2 ? 1 : -1) * motionScale;
      circle.halo.material.opacity = lit * 0.2 * pulse + pop * 0.35;
      circle.halo.scale.setScalar(1 + pop * 0.6);
      circle.beam.scale.y = Math.max(0.01, lit * state.beamHeight);
      circle.beam.position.y = PLATFORM_Y + 0.8 + 7 * circle.beam.scale.y;
      circle.beam.material.opacity =
        lit *
          (0.22 + 0.06 * Math.sin(animationTime * 3 + i)) *
          state.beamHeight +
        pop * 0.25;
      circle.beam.material.color.copy(circle.color).multiplyScalar(0.7);
      circle.light.intensity = lit * 7 * pulse + pop * 16;
    });
  }

  function updateArcs({ delta }: FrameTime) {
    arcRefreshTimer += delta;
    if (arcRefreshTimer > (reducedMotion ? 0.25 : 0.06)) {
      arcRefreshTimer = 0;
      arcs.forEach(rebuildArc);
    }
    arcs.forEach((arc) => {
      const target = arc.circle.lit > 0.5 && state.orbPower > 0.5 ? 1 : 0;
      arc.strength += (target - arc.strength) * Math.min(1, delta * 6);
      const flicker = 0.6 + 0.4 * Math.random();
      arc.lines[0].material.opacity = arc.strength * 0.9 * flicker;
      arc.lines[1].material.opacity = arc.strength * 0.6 * flicker;
    });
  }

  function updateOrb({ delta, animationTime, motionScale }: FrameTime) {
    state.orbPower +=
      (state.orbTarget - state.orbPower) * Math.min(1, delta * 3);
    const power = state.orbPower;
    orb.material.uniforms.uPower.value = power;
    orb.group.position.y = ORB_Y + Math.sin(animationTime * 1.1) * 0.35;
    orb.group.rotation.y += delta * 0.4 * motionScale;
    const breathe = 1 + Math.sin(animationTime * 1.8) * 0.12;
    orb.core.scale.setScalar(1.4 + power * 1.6 * breathe);
    orb.core.material.opacity = Math.min(1, 0.3 + power * 0.7);
    orb.halo.scale.setScalar(8 + power * 4 * breathe);
    orb.halo.material.opacity = 0.12 + power * 0.12;
    orb.flare.material.opacity = Math.min(0.8, power * 0.45);
    orb.flare.material.rotation += delta * 0.15 * motionScale;
    orb.flare.scale.setScalar(8 + power * 6 * breathe);
    orb.rings.forEach((ring, i) => {
      ring.material.opacity = Math.min(0.9, power * 0.85);
      ring.rotation.z +=
        delta * (i ? -0.8 : 1.1) * motionScale * (1 + power * 0.5);
    });
    orb.light.intensity = 3 + power * 9 * breathe;
    grateLight.intensity = 2 + power * 4;
    runeBandMaterial.uniforms.uPower.value = Math.min(0.9, 0.15 + power * 0.55);
  }

  function updateShockwaveAndGlyphs({
    delta,
    elapsed,
    motionScale,
  }: FrameTime) {
    const sinceShockwave = elapsed - shockwaveStart;
    if (sinceShockwave >= 0 && sinceShockwave < 1.6) {
      const k = sinceShockwave / 1.6;
      shockwave.scale.setScalar(2 + (1 - Math.pow(1 - k, 3)) * 34);
      shockwave.material.opacity = (1 - k) * 0.9;
    } else shockwave.material.opacity = 0;

    glyphs.forEach((glyph) => {
      const data = glyph.userData;
      data.life += delta * motionScale * data.speed * 0.5;
      if (data.life > 6) {
        data.life = 0;
        data.angle = rand() * 6.28;
        data.radius = 3 + rand() * 11;
      }
      const k = data.life / 6;
      glyph.position.set(
        Math.sin(data.angle + k) * data.radius,
        PLATFORM_Y + 0.5 + k * 12,
        Math.cos(data.angle + k) * data.radius,
      );
      glyph.material.opacity =
        Math.sin(k * Math.PI) * (0.25 + state.orbPower * 0.5);
    });
  }

  return {
    arena,
    circles,
    updateCircles,
    updateArcs,
    updateOrb,
    updateShockwaveAndGlyphs,
    triggerShockwave(strength = 1) {
      shockwaveStart = state.time;
      state.shake = Math.max(
        state.shake,
        0.6 * strength * (reducedMotion ? 0 : 1),
      );
    },
    /** Lights or dims each circle; a circle that turns on also flashes. */
    setCirclesLit(litFlags: ReadonlyArray<boolean | number>) {
      circles.forEach((circle, i) => {
        const wanted = litFlags[i] ? 1 : 0;
        if (wanted && !circle.wanted) circle.flashTime = state.time;
        circle.wanted = wanted;
      });
    },
  };
}
