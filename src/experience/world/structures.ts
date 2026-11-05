import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  createGlowSprite,
  hdrColor,
  type FrameTime,
  type WorldBuildContext,
  type WorldState,
} from "./buildContext";
import type { WorldMaterialName, WorldMaterials } from "./materials";
import { TO_LINEAR_GLSL, UV_VERTEX_GLSL } from "./shaderChunks";

/** Merges static parts per material, which keeps draw calls low. */
export class StaticMeshBuilder {
  private parts: Partial<Record<WorldMaterialName, THREE.BufferGeometry[]>> =
    {};

  constructor(private materials: WorldMaterials) {}

  add(
    geometry: THREE.BufferGeometry,
    material: WorldMaterialName,
    x = 0,
    y = 0,
    z = 0,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
    scaleX = 1,
    scaleY = scaleX,
    scaleZ = scaleX,
  ) {
    const part = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (part.attributes.uv === undefined)
      part.setAttribute(
        "uv",
        new THREE.BufferAttribute(
          new Float32Array(part.attributes.position.count * 2),
          2,
        ),
      );
    if (part.attributes.color) part.deleteAttribute("color");
    part.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(rotationX, rotationY, rotationZ),
        ),
        new THREE.Vector3(scaleX, scaleY, scaleZ),
      ),
    );
    (this.parts[material] ??= []).push(part);
  }

  build(group: THREE.Object3D) {
    for (const [name, parts] of Object.entries(this.parts) as [
      WorldMaterialName,
      THREE.BufferGeometry[],
    ][]) {
      const merged = mergeGeometries(parts, false);
      parts.forEach((part) => part.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, this.materials[name]);
      mesh.castShadow = name !== "window";
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
}

const latheFrom = (profile: [number, number][], segments: number) =>
  new THREE.LatheGeometry(
    profile.map(([x, y]) => new THREE.Vector2(x, y)),
    segments,
  );

export function createSharedShapes() {
  const archShape = new THREE.Shape();
  archShape.moveTo(-0.5, 0);
  archShape.lineTo(0.5, 0);
  archShape.lineTo(0.5, 0.65);
  archShape.absarc(0, 0.65, 0.5, 0, Math.PI, false);
  archShape.lineTo(-0.5, 0);
  return {
    column: latheFrom(
      [
        [0, 0],
        [1.3, 0],
        [1.3, 0.05],
        [1.12, 0.07],
        [1.12, 0.1],
        [0.95, 0.12],
        [0.86, 0.15],
        [0.8, 0.86],
        [0.9, 0.88],
        [1.05, 0.91],
        [1.18, 0.94],
        [1.3, 0.95],
        [1.3, 1.0],
        [0, 1.0],
      ],
      14,
    ),
    roof: latheFrom(
      [
        [0, 0],
        [1.32, 0],
        [1.25, 0.04],
        [1.0, 0.14],
        [0.72, 0.32],
        [0.46, 0.55],
        [0.24, 0.78],
        [0.08, 0.95],
        [0, 1],
      ],
      10,
    ),
    pedestal: latheFrom(
      [
        [0, 0],
        [1.08, 0],
        [1.08, 0.3],
        [1.0, 0.35],
        [0.96, 0.75],
        [1.04, 0.8],
        [1.04, 1.0],
        [0, 1.0],
      ],
      40,
    ),
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
    cone: new THREE.ConeGeometry(1, 1, 7),
    archWindow: new THREE.ShapeGeometry(archShape, 6),
  };
}

export type SharedShapes = ReturnType<typeof createSharedShapes>;

interface TowerSpec {
  x: number;
  z: number;
  radius: number;
  height: number;
  roofHeight: number;
  windowCount: number;
}

function addTower(
  builder: StaticMeshBuilder,
  shapes: SharedShapes,
  rand: () => number,
  { x, z, radius, height, roofHeight, windowCount }: TowerSpec,
) {
  const { box, cone, cylinder, roof, archWindow } = shapes;
  builder.add(
    cylinder,
    "stone",
    x,
    height / 2,
    z,
    0,
    0,
    0,
    radius * 0.95,
    height,
    radius * 0.95,
  );
  builder.add(
    cylinder,
    "stoneFlat",
    x,
    height + 0.25,
    z,
    0,
    0,
    0,
    radius * 1.18,
    0.5,
    radius * 1.18,
  );
  const merlonCount = Math.max(6, Math.round(radius * 7));
  for (let i = 0; i < merlonCount; i++) {
    const angle = (i / merlonCount) * Math.PI * 2;
    builder.add(
      box,
      "stoneFlat",
      x + Math.sin(angle) * radius * 1.1,
      height + 0.75,
      z + Math.cos(angle) * radius * 1.1,
      0,
      angle,
      0,
      radius * 0.42,
      0.55,
      0.32,
    );
  }
  builder.add(
    cylinder,
    "gold",
    x,
    height + 0.53,
    z,
    0,
    0,
    0,
    radius * 1.05,
    0.08,
    radius * 1.05,
  );
  builder.add(
    roof,
    "roof",
    x,
    height + 0.55,
    z,
    0,
    0,
    0,
    radius * 1.05,
    roofHeight,
    radius * 1.05,
  );
  builder.add(
    cone,
    "gold",
    x,
    height + 0.55 + roofHeight + 0.6,
    z,
    0,
    0,
    0,
    0.1,
    1.4,
    0.1,
  );
  for (let i = 0; i < windowCount; i++) {
    const angle = rand() * Math.PI * 2;
    const windowY = height * (0.3 + rand() * 0.55);
    builder.add(
      archWindow,
      "window",
      x + Math.sin(angle) * (radius * 0.96),
      windowY,
      z + Math.cos(angle) * (radius * 0.96),
      0,
      angle,
      0,
      0.32,
      0.5,
      1,
    );
  }
  return height + 0.55 + roofHeight;
}

export function createCastleBuilder(
  context: WorldBuildContext,
  materials: WorldMaterials,
  shapes: SharedShapes,
) {
  const rand = context.random.next;
  const beacons: THREE.Sprite[] = [];

  function buildCastle(scale: number) {
    const castle = new THREE.Group();
    const builder = new StaticMeshBuilder(materials);
    const tower = (
      x: number,
      z: number,
      radius: number,
      height: number,
      roofHeight: number,
      windowCount: number,
    ) =>
      addTower(builder, shapes, rand, {
        x,
        z,
        radius,
        height,
        roofHeight,
        windowCount,
      });
    tower(0, 0, 2.4, 9, 4.6, 10);
    const tallestTowerTop = tower(2.8, -1.6, 1.0, 15, 5.5, 7);
    tower(-3.2, -1.2, 1.3, 11, 4, 5);
    tower(0.5, -4.2, 0.8, 13, 4, 4);
    const corners = [
      [5, 3.5],
      [-5, 3.5],
      [5.2, -3.8],
      [-5.2, -3.8],
    ];
    corners.forEach(([x, z]) => tower(x, z, 1.05, 6, 2.8, 3));
    for (let i = 0; i < 4; i++) {
      const from = corners[i];
      const to = corners[[1, 3, 0, 2][i]];
      const deltaX = to[0] - from[0];
      const deltaZ = to[1] - from[1];
      const length = Math.hypot(deltaX, deltaZ);
      const rotationY = -Math.atan2(deltaZ, deltaX);
      builder.add(
        shapes.box,
        "stone",
        (from[0] + to[0]) / 2,
        1.6,
        (from[1] + to[1]) / 2,
        0,
        rotationY,
        0,
        length,
        3.2,
        0.8,
      );
      const merlonSlots = Math.floor(length / 0.9);
      for (let k = 1; k < merlonSlots; k += 2) {
        const fraction = k / merlonSlots;
        builder.add(
          shapes.box,
          "stoneFlat",
          from[0] + deltaX * fraction,
          3.45,
          from[1] + deltaZ * fraction,
          0,
          rotationY,
          0,
          0.45,
          0.5,
          0.85,
        );
      }
    }
    builder.add(shapes.box, "stone", 0, 2.2, 3.6, 0, 0, 0, 2.6, 4.4, 1.4);
    builder.add(
      shapes.archWindow,
      "window",
      0,
      0.2,
      4.32,
      0,
      0,
      0,
      1.4,
      2.0,
      1,
    );
    builder.build(castle);
    const beacon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: context.glowTexture,
        color: hdrColor(0x94e1f3, 3),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    beacon.position.set(2.8, tallestTowerTop + 1.8, -1.6);
    beacon.scale.set(3, 3, 1);
    castle.add(beacon);
    beacons.push(beacon);
    castle.scale.setScalar(scale);
    castle.position.y = -0.3;
    return castle;
  }

  function updateBeacons({ animationTime }: FrameTime) {
    beacons.forEach((beacon, i) => {
      const size = 3 * (1 + Math.sin(animationTime * 2.2 + i) * 0.2);
      beacon.scale.set(size, size, 1);
    });
  }

  return { buildCastle, updateBeacons };
}

export function buildPortalRuins(
  { timedMaterials }: WorldBuildContext,
  materials: WorldMaterials,
  { box, column }: SharedShapes,
  island: THREE.Group,
) {
  const portalAnchor = new THREE.Object3D();
  const ruinsBuilder = new StaticMeshBuilder(materials);
  const ruinedColumns: [number, number, number][] = [
    [-4, 2, 5.5],
    [-1.5, -3.5, 7],
    [4.5, -1, 4],
  ];
  ruinedColumns.forEach(([x, z, height]) => {
    ruinsBuilder.add(column, "marble", x, 0.3, z, 0, 0, 0, 0.6, height, 0.6);
    ruinsBuilder.add(
      box,
      "stoneFlat",
      x,
      height + 0.5,
      z,
      0,
      0.3,
      0,
      1.6,
      0.4,
      1.6,
    );
  });
  ruinsBuilder.add(
    box,
    "stoneFlat",
    3.2,
    0.5,
    3.2,
    0.2,
    0.4,
    0.5,
    2.6,
    0.9,
    0.9,
  ); // fallen drum
  ruinsBuilder.build(island);

  const arch = new THREE.Group();
  arch.position.set(1, 0.2, 2.5);
  arch.rotation.y = 0.6;
  island.add(arch);
  const archBuilder = new StaticMeshBuilder(materials);
  [-2.3, 2.3].forEach((x) => {
    archBuilder.add(box, "stoneFlat", x, 0.3, 0, 0, 0, 0, 1.3, 0.6, 1.3);
    archBuilder.add(column, "marble", x, 0.6, 0, 0, 0, 0, 0.5, 5, 0.5);
  });
  archBuilder.add(
    new THREE.TorusGeometry(2.3, 0.45, 8, 24, Math.PI),
    "marble",
    0,
    5.6,
    0,
    0,
    0,
    0,
    1,
    1,
    1.6,
  );
  archBuilder.add(box, "gold", 0, 7.95, 0, 0, 0, Math.PI / 4, 0.55, 0.55, 0.8);
  archBuilder.build(arch);

  const portalMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uPower: { value: 1 } },
    vertexShader: UV_VERTEX_GLSL,
    fragmentShader: `${TO_LINEAR_GLSL} uniform float uTime; uniform float uPower; varying vec2 vUv;
        void main(){ vec2 p = (vUv - vec2(0.5, 0.42)) * vec2(1.0, 0.62); float r = length(p) * 2.2; float a = atan(p.y, p.x);
          float s = 0.5 + 0.5 * sin(a * 3.0 + r * 14.0 - uTime * 3.0 * (0.6 + uPower * 0.5));
          vec3 c = mix(vec3(0.5,0.3,1.0), vec3(0.6,0.95,1.0), s);
          float m = 1.0 - smoothstep(0.7, 1.0, r);
          gl_FragColor = vec4(toLin(c) * (0.8 + uPower * 0.7), m * (0.2 + 0.5 * s) * (0.6 + 0.4 * (1.0 - r))); }`,
  });
  timedMaterials.push(portalMaterial);
  const portal = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 7.4),
    portalMaterial,
  );
  portal.position.y = 3.8;
  arch.add(portal);
  const portalLight = new THREE.PointLight(0x9f6bff, 12, 16, 1.6);
  portalLight.position.set(0, 3.5, 1);
  arch.add(portalLight);
  portalAnchor.position.set(0, 4, 0);
  arch.add(portalAnchor);

  return {
    getPortalPosition: (out: THREE.Vector3) =>
      portalAnchor.getWorldPosition(out),
    /** The portal's position plus the horizontal direction it faces, towards the viewer. */
    getPortalFrame(outPosition: THREE.Vector3, outNormal: THREE.Vector3) {
      portalAnchor.getWorldPosition(outPosition);
      arch.getWorldDirection(outNormal);
      outNormal.y = 0;
      outNormal.normalize();
      return outPosition;
    },
    update({ delta }: FrameTime, state: WorldState) {
      const power = portalMaterial.uniforms.uPower;
      power.value +=
        (1 + state.portalBoost * 1.6 - power.value) * Math.min(1, delta * 4);
      portalLight.intensity = 8 + state.portalBoost * 14;
    },
  };
}

export function buildRotunda(
  { glowTexture }: WorldBuildContext,
  materials: WorldMaterials,
  { column, cone, cylinder }: SharedShapes,
  island: THREE.Group,
) {
  const builder = new StaticMeshBuilder(materials);
  builder.add(cylinder, "stoneFlat", 0, 0.3, 0, 0, 0, 0, 4.8, 0.6, 4.8);
  builder.add(cylinder, "stoneFlat", 0, 0.75, 0, 0, 0, 0, 4.4, 0.3, 4.4);
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    builder.add(
      column,
      "marble",
      Math.sin(angle) * 3.7,
      0.9,
      Math.cos(angle) * 3.7,
      0,
      0,
      0,
      0.32,
      5.6,
      0.32,
    );
  }
  builder.add(cylinder, "stoneFlat", 0, 6.8, 0, 0, 0, 0, 4.4, 0.7, 4.4);
  builder.add(cylinder, "gold", 0, 7.2, 0, 0, 0, 0, 4.25, 0.12, 4.25);
  builder.add(
    new THREE.SphereGeometry(4.1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    "roof",
    0,
    7.2,
    0,
  );
  builder.add(cylinder, "stoneFlat", 0, 11.5, 0, 0, 0, 0, 0.8, 0.8, 0.8);
  builder.add(cone, "gold", 0, 13.2, 0, 0, 0, 0, 0.25, 2.6, 0.25);
  builder.build(island);

  const lantern = createGlowSprite(0xffc56a, 2.5, 3, glowTexture);
  lantern.position.y = 3.4;
  island.add(lantern);
  const lanternLight = new THREE.PointLight(0xffc56a, 10, 12, 1.6);
  lanternLight.position.y = 3.4;
  island.add(lanternLight);

  return {
    updateLantern() {
      const flicker = 0.9 + Math.random() * 0.15;
      lantern.scale.set(3 * flicker, 3 * flicker, 1);
      lanternLight.intensity = 9 * flicker;
    },
  };
}
