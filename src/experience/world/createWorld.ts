import * as THREE from "three";
import type { QualityTier } from "../device";
import { buildDebrisRing, buildDragons, buildSkyLife } from "./ambience";
import { buildArena, CIRCLE_COLORS } from "./arena";
import {
  WorldRandom,
  type FrameTime,
  type WorldBuildContext,
  type WorldState,
} from "./buildContext";
import { createGlowTexture } from "./canvasTextures";
import { createIslandFactory } from "./islands";
import { createWaterfallMaterial, createWorldMaterials } from "./materials";
import { createRenderPipeline } from "./postProcessing";
import {
  createMarbleTextures,
  createMasonryTextures,
  createPerlinNoise,
  createRockTextures,
  createSlateTextures,
} from "./proceduralTextures";
import { buildEnvironmentLighting, buildSky } from "./sky";
import {
  buildPortalRuins,
  buildRotunda,
  createCastleBuilder,
  createSharedShapes,
} from "./structures";
import { buildTrainingTargets } from "./trainingTargets";

interface Point3 {
  x: number;
  y: number;
  z: number;
}

interface CreateWorldOptions {
  reducedMotion: boolean;
  qualityTier: QualityTier;
  onProgress: (progress: number, label: string) => void;
  /** The opening camera shot, used to warm up shaders from the first frame's exact view. */
  openingView: { from: Point3; look: Point3 };
}

export type World = Awaited<ReturnType<typeof createWorld>>;

export async function createWorld(
  canvas: HTMLCanvasElement,
  options: CreateWorldOptions,
) {
  const { reducedMotion, qualityTier, onProgress, openingView } = options;
  // Give the browser a frame between heavy stages so the loading screen can update.
  const reportProgress = (progress: number, label: string) =>
    new Promise<void>((resolve) => {
      onProgress(progress, label);
      requestAnimationFrame(() => setTimeout(resolve, 0));
    });
  await reportProgress(0.05, "Gathering starlight");
  const lowQuality = qualityTier === "low";

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(new THREE.Color(0x2a2552), 0.0046);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1600);
  const pipeline = createRenderPipeline(canvas, scene, camera, lowQuality);

  const context: WorldBuildContext = {
    scene,
    lowQuality,
    reducedMotion,
    random: new WorldRandom(11),
    noise: createPerlinNoise(7),
    glowTexture: createGlowTexture(),
    timedMaterials: [],
  };

  const stoneTextureSize = lowQuality ? 256 : 512;
  await reportProgress(0.12, "Carving the stone");
  const rock = createRockTextures(stoneTextureSize, 3);
  await reportProgress(0.22, "Carving the stone");
  const masonry = createMasonryTextures(stoneTextureSize, 7);
  await reportProgress(0.3, "Laying the slate");
  const slate = createSlateTextures(stoneTextureSize, 11);
  const marble = createMarbleTextures(stoneTextureSize, 19);
  await reportProgress(0.38, "Painting the sky");

  buildEnvironmentLighting(scene, pipeline.renderer);
  const { moonDirection, moonLight } = buildSky(
    context,
    pipeline.getPixelRatio(),
  );

  const materials = createWorldMaterials({ rock, masonry, slate, marble });
  const waterfallMaterial = createWaterfallMaterial();
  context.timedMaterials.push(waterfallMaterial);
  const shapes = createSharedShapes();
  const { buildCastle, updateBeacons } = createCastleBuilder(
    context,
    materials,
    shapes,
  );
  const { createIsland, updateIslands } = createIslandFactory(
    context,
    materials,
    waterfallMaterial,
  );

  const state: WorldState = {
    time: 0,
    orbPower: 0.15,
    orbTarget: 0.15,
    portalBoost: 0,
    shake: 0,
    beamHeight: 1,
    focus: "arena",
    training: false,
  };

  await reportProgress(0.45, "Raising the arena");
  const arena = buildArena(context, materials, shapes, createIsland, state);

  await reportProgress(0.6, "Raising the islands");
  const castleIsland = createIsland({
    position: new THREE.Vector3(40, 8, -70),
    radius: 15,
    depth: 22,
    trees: 10,
    waterfalls: [
      [0.4, 3, 30],
      [-0.9, 2.2, 24],
    ],
  });
  castleIsland.add(buildCastle(1.35));
  castleIsland.rotation.y = -0.5;
  createIsland({
    position: new THREE.Vector3(-70, 18, -140),
    radius: 11,
    depth: 16,
    trees: 6,
    waterfalls: [[0.7, 2.4, 22]],
  }).add(buildCastle(0.85));
  createIsland({
    position: new THREE.Vector3(120, 26, -200),
    radius: 10,
    depth: 15,
    trees: 5,
  }).add(buildCastle(0.8));

  const ruinsIsland = createIsland({
    position: new THREE.Vector3(-36, 3, -18),
    radius: 9,
    depth: 15,
    trees: 4,
    waterfalls: [[1.2, 2, 20]],
    spin: 0.006,
  });
  const portal = buildPortalRuins(context, materials, shapes, ruinsIsland);

  const rotundaIsland = createIsland({
    position: new THREE.Vector3(38, 1, -12),
    radius: 8,
    depth: 14,
    trees: 3,
    waterfalls: [[-1.4, 2, 18]],
    spin: -0.006,
  });
  const rotunda = buildRotunda(context, materials, shapes, rotundaIsland);

  createIsland({
    position: new THREE.Vector3(-90, 0, -80),
    radius: 8,
    depth: 13,
    trees: 7,
    waterfalls: [[0.3, 1.8, 18]],
  });
  createIsland({
    position: new THREE.Vector3(85, 14, -110),
    radius: 6,
    depth: 10,
    trees: 5,
  });
  createIsland({
    position: new THREE.Vector3(-20, 30, -120),
    radius: 4,
    depth: 8,
    trees: 3,
  });
  createIsland({
    position: new THREE.Vector3(-26, -12, 26),
    radius: 3.5,
    depth: 7,
    trees: 2,
    spin: 0.05,
  });
  createIsland({
    position: new THREE.Vector3(30, -9, 22),
    radius: 2.8,
    depth: 6,
    trees: 2,
    spin: 0.06,
  });
  createIsland({
    position: new THREE.Vector3(10, 40, -170),
    radius: 7,
    depth: 11,
    trees: 4,
  });

  const updateDebris = buildDebrisRing(context, materials, arena.arena);
  const updateDragons = buildDragons(context, materials);

  await reportProgress(0.8, "Weaving the clouds");
  const updateSkyLife = buildSkyLife(context, moonDirection);
  const training = buildTrainingTargets(
    context,
    camera,
    arena.circles,
    portal.getPortalFrame,
    state,
  );

  const lightFollowTarget = new THREE.Vector3();
  const lightOffset = new THREE.Vector3();
  function updateMoonLight({ delta }: FrameTime) {
    if (state.focus === "portal") portal.getPortalPosition(lightFollowTarget);
    else lightFollowTarget.set(0, 0, 0);
    moonLight.target.position.lerp(lightFollowTarget, Math.min(1, delta * 1.5));
    moonLight.position
      .copy(moonLight.target.position)
      .add(lightOffset.set(30, 55, -18));
  }

  const frame: FrameTime = {
    delta: 0,
    elapsed: 0,
    animationTime: 0,
    motionScale: reducedMotion ? 0.4 : 1,
  };
  function update(delta: number) {
    state.time += delta;
    frame.delta = delta;
    frame.elapsed = state.time;
    frame.animationTime = state.time * frame.motionScale;
    context.timedMaterials.forEach((material) => {
      material.uniforms.uTime.value = frame.animationTime;
    });
    pipeline.setGradeTime(frame.animationTime);

    updateIslands(frame);
    updateBeacons(frame);
    rotunda.updateLantern();
    arena.updateCircles(frame);
    arena.updateArcs(frame);
    arena.updateOrb(frame);
    portal.update(frame, state);
    arena.updateShockwaveAndGlyphs(frame);
    updateDebris(frame);
    updateDragons(frame);
    updateSkyLife(frame);
    updateMoonLight(frame);
    training.update(frame);
  }

  function setQuality({
    pixelRatio,
    shadows,
    ambientOcclusion,
  }: {
    pixelRatio?: number;
    shadows?: boolean;
    ambientOcclusion?: boolean;
  }) {
    if (ambientOcclusion != null)
      pipeline.setAmbientOcclusion(ambientOcclusion);
    if (pixelRatio != null) pipeline.setPixelRatio(pixelRatio);
    if (shadows != null && pipeline.renderer.shadowMap.enabled !== shadows) {
      pipeline.renderer.shadowMap.enabled = shadows;
      moonLight.castShadow = shadows;
      scene.traverse((object) => {
        const material = (object as THREE.Mesh).material;
        if (material) {
          (Array.isArray(material) ? material : [material]).forEach((item) => {
            item.needsUpdate = true;
          });
        }
      });
    }
  }

  function dispose() {
    pipeline.renderer.setAnimationLoop(null);
    scene.traverse((object) => {
      const { geometry, material } = object as THREE.Mesh;
      if (geometry) geometry.dispose();
      const materialList = material
        ? Array.isArray(material)
          ? material
          : [material]
        : [];
      materialList.forEach((item) => {
        Object.values(item).forEach((value) => {
          if (value && (value as THREE.Texture).isTexture)
            (value as THREE.Texture).dispose();
        });
        item.dispose();
      });
    });
    if (scene.environment) scene.environment.dispose();
    pipeline.dispose();
  }

  // compile every shader now, so the first frames don't stutter
  await reportProgress(0.9, "Awakening the magic");
  update(0);
  // warm up from the exact opening shot, so the first visible frame is the real view
  camera.position.set(
    openingView.from.x,
    openingView.from.y,
    openingView.from.z,
  );
  camera.lookAt(openingView.look.x, openingView.look.y, openingView.look.z);
  camera.updateMatrixWorld();
  if (pipeline.renderer.extensions.has("KHR_parallel_shader_compile"))
    await pipeline.renderer.compileAsync(scene, camera);
  else pipeline.renderer.compile(scene, camera);
  pipeline.composer.render();
  await reportProgress(1, "Ready");

  return {
    dispose,
    scene,
    camera,
    renderer: pipeline.renderer,
    state,
    circles: arena.circles,
    circleColors: CIRCLE_COLORS,
    update,
    render: () => pipeline.composer.render(),
    setQuality,
    get pixelRatio() {
      return pipeline.getPixelRatio();
    },
    maxPixelRatio: pipeline.maxPixelRatio,
    get isAmbientOcclusionOn() {
      return pipeline.isAmbientOcclusionOn();
    },
    triggerShockwave: arena.triggerShockwave,
    setCirclesLit: arena.setCirclesLit,
    getPortalPosition: portal.getPortalPosition,
    getPortalFrame: portal.getPortalFrame,
    startTraining: training.startTraining,
    stopTraining: training.stopTraining,
    castBolt: training.castBolt,
    getAimRay: training.getAimRay,
    crystals: training.crystals,
  };
}
