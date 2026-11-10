import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { WizardClass, WizardClassId } from "./wizardClasses";

export type Vec3 = readonly [number, number, number];

/**
 * The shared wizard skeleton: joint name, parent, and rest position in metres for a 1.8 m
 * wizard who faces +Z with arms hanging. "L" is the wizard's own left (+X). Every class uses
 * this skeleton, so one set of animations fits all of them, and a drawn or modelled character
 * can replace the built-in one by riding the same joints. The Mage is painted from its concept
 * sheet (see turnaroundProjection.ts).
 */
const JOINTS = [
  ["root", null, 0, 0, 0],
  ["hips", "root", 0, 0.96, 0],
  ["spine", "hips", 0, 1.08, 0],
  ["chest", "spine", 0, 1.24, 0],
  ["neck", "chest", 0, 1.47, 0],
  ["head", "neck", 0, 1.55, 0],
  ["upperArmL", "chest", 0.2, 1.43, 0],
  ["foreArmL", "upperArmL", 0.215, 1.17, 0],
  ["handL", "foreArmL", 0.225, 0.92, 0],
  ["upperArmR", "chest", -0.2, 1.43, 0],
  ["foreArmR", "upperArmR", -0.215, 1.17, 0],
  ["handR", "foreArmR", -0.225, 0.92, 0],
  ["upperLegL", "hips", 0.09, 0.94, 0],
  ["lowerLegL", "upperLegL", 0.095, 0.52, 0],
  ["footL", "lowerLegL", 0.1, 0.1, 0],
  ["upperLegR", "hips", -0.09, 0.94, 0],
  ["lowerLegR", "upperLegR", -0.095, 0.52, 0],
  ["footR", "lowerLegR", -0.1, 0.1, 0],
  ["cape1", "chest", 0, 1.43, -0.13],
  ["cape2", "cape1", 0, 1.08, -0.16],
  ["cape3", "cape2", 0, 0.74, -0.18],
  ["coatFL", "hips", 0.11, 0.98, 0.1],
  ["coatFR", "hips", -0.11, 0.98, 0.1],
  ["coatBL", "hips", 0.1, 0.98, -0.1],
  ["coatBR", "hips", -0.1, 0.98, -0.1],
  ["coatFL2", "coatFL", 0.2, 0.58, 0.13],
  ["coatFR2", "coatFR", -0.2, 0.58, 0.13],
  ["coatBL2", "coatBL", 0.185, 0.58, -0.155],
  ["coatBR2", "coatBR", -0.185, 0.58, -0.155],
  ["flameL", "handL", 0.225, 0.89, 0.08],
] as const;

export type BoneName = (typeof JOINTS)[number][0];
type Side = "L" | "R";

export const REST_POSITION = Object.fromEntries(
  JOINTS.map(([name, , x, y, z]): [BoneName, Vec3] => [name, [x, y, z]]),
) as Record<BoneName, Vec3>;

/** Bones moved by spring physics instead of animation clips. */
export const CAPE_BONES: BoneName[] = ["cape1", "cape2", "cape3"];
export const CAPE_END_OFFSET: Vec3 = [0, -0.34, -0.02];
export const COAT_CHAINS: BoneName[][] = [
  ["coatFL", "coatFL2"],
  ["coatFR", "coatFR2"],
  ["coatBL", "coatBL2"],
  ["coatBR", "coatBR2"],
];
export const COAT_END_OFFSET: Vec3 = [0, -0.44, 0];

export interface GlowAnchor {
  bone: BoneName;
  /** Rest-pose position, in the same space as the joints. */
  at: Vec3;
  size: number;
  intensity: number;
  color?: number;
  flickers?: boolean;
}

/** Glow sprites carried by each class. `cast` is where spells charge and leave from. */
export const WIZARD_GLOWS: Record<
  WizardClassId,
  { cast: GlowAnchor; extras: GlowAnchor[] }
> = {
  mage: {
    cast: { bone: "handR", at: [-0.225, 0.852, 0.39], size: 0.2, intensity: 1.5 },
    extras: [
      {
        bone: "flameL",
        at: [0.225, 0.89, 0.2],
        size: 0.5,
        intensity: 1.5,
        color: 0xff7a22,
        flickers: true,
      },
      {
        bone: "flameL",
        at: [0.225, 0.89, 0.16],
        size: 0.22,
        intensity: 2.4,
        color: 0xffd27a,
        flickers: true,
      },
      { bone: "foreArmR", at: [-0.292, 1.05, 0], size: 0.16, intensity: 1.4 },
      { bone: "chest", at: [0, 1.37, 0.16], size: 0.12, intensity: 1.2 },
    ],
  },
  guardian: {
    cast: { bone: "handR", at: [-0.225, 1.95, 0.03], size: 0.34, intensity: 1.6 },
    extras: [],
  },
  mystic: {
    cast: { bone: "handL", at: [0.225, 1.93, 0.03], size: 0.38, intensity: 1.7 },
    extras: [
      { bone: "hips", at: [0.17, 0.86, 0.06], size: 0.22, intensity: 1.3 },
      { bone: "handR", at: [-0.225, 0.85, 0.1], size: 0.16, intensity: 1.2, flickers: true },
    ],
  },
  scholar: {
    cast: { bone: "handR", at: [-0.225, 0.86, 0.07], size: 0.18, intensity: 1.2 },
    extras: [{ bone: "handL", at: [0.225, 0.89, 0.13], size: 0.3, intensity: 1.3 }],
  },
};

/** The Guardian's ward: a kite shield of light carried on the left forearm. */
export const GUARDIAN_SHIELD = {
  bone: "foreArmL" as BoneName,
  at: [0.225, 0.84, 0] as Vec3,
  outline: [
    [0, 0.3],
    [0.2, 0.22],
    [0.2, -0.02],
    [0, -0.36],
    [-0.2, -0.02],
    [-0.2, 0.22],
  ] as [number, number][],
};

export function createWizardSkeleton() {
  const bones = {} as Record<BoneName, THREE.Bone>;
  for (const [name, parent, x, y, z] of JOINTS) {
    const bone = new THREE.Bone();
    bone.name = name;
    if (parent) {
      const [parentX, parentY, parentZ] = REST_POSITION[parent];
      bone.position.set(x - parentX, y - parentY, z - parentZ);
      bones[parent].add(bone);
    } else bone.position.set(x, y, z);
    bones[name] = bone;
  }
  bones.root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(JOINTS.map(([name]) => bones[name]));
  return { bones, skeleton };
}

// ---- shape helpers: every shape is returned already placed in rest-pose space ----

const UP = new THREE.Vector3(0, 1, 0);
const placement = new THREE.Matrix4();

function place(
  geometry: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  rotationX = 0,
  rotationY = 0,
  rotationZ = 0,
  scaleX = 1,
  scaleY = 1,
  scaleZ = 1,
) {
  placement.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotationX, rotationY, rotationZ),
    ),
    new THREE.Vector3(scaleX, scaleY, scaleZ),
  );
  return geometry.applyMatrix4(placement);
}

const box = (
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  rotationX = 0,
  rotationY = 0,
  rotationZ = 0,
) =>
  place(
    new THREE.BoxGeometry(width, height, depth),
    x,
    y,
    z,
    rotationX,
    rotationY,
    rotationZ,
  );

const ball = (
  radius: number,
  x: number,
  y: number,
  z: number,
  scaleX = 1,
  scaleY = 1,
  scaleZ = 1,
  detail = 1,
) =>
  place(
    new THREE.IcosahedronGeometry(radius, detail),
    x,
    y,
    z,
    0,
    0,
    0,
    scaleX,
    scaleY,
    scaleZ,
  );

/** A tapered limb from `from` to `to`. */
function tube(
  from: Vec3,
  to: Vec3,
  radiusFrom: number,
  radiusTo: number,
  segments = 6,
) {
  const start = new THREE.Vector3(...from);
  const direction = new THREE.Vector3(...to).sub(start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(
    radiusTo,
    radiusFrom,
    length,
    segments,
  );
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()),
  );
  start.addScaledVector(direction, length / 2);
  return geometry.translate(start.x, start.y, start.z);
}

/** An upright torso section, flattened front to back by `depth`. */
function barrel(
  bottomY: number,
  topY: number,
  bottomRadius: number,
  topRadius: number,
  depth = 1,
  segments = 8,
) {
  const geometry = new THREE.CylinderGeometry(
    topRadius,
    bottomRadius,
    topY - bottomY,
    segments,
  );
  // turn it so a flat facet, not an edge, faces forward
  geometry.rotateY(Math.PI / segments);
  geometry.scale(1, 1, depth);
  return geometry.translate(0, (bottomY + topY) / 2, 0);
}

/** An open slice of a cone around the body's axis; angle 0 is the wizard's front. */
function wrap(
  bottomY: number,
  topY: number,
  bottomRadius: number,
  topRadius: number,
  fromAngle: number,
  toAngle: number,
  segments = 3,
) {
  return new THREE.CylinderGeometry(
    topRadius,
    bottomRadius,
    topY - bottomY,
    segments,
    1,
    true,
    fromAngle,
    toAngle - fromAngle,
  ).translate(0, (bottomY + topY) / 2, 0);
}

type MaterialLayer = "cloth" | "metal" | "glow";
type BoneWeights = (x: number, y: number, z: number) => [BoneName, number][];

const BONE_INDEX = new Map<BoneName, number>(
  JOINTS.map(([name], index) => [name, index]),
);

/** Collects coloured, bone-weighted shapes and merges them into one skinned geometry. */
class WizardParts {
  private layers: Record<MaterialLayer, THREE.BufferGeometry[]> = {
    cloth: [],
    metal: [],
    glow: [],
  };

  add(
    shape: THREE.BufferGeometry,
    color: number,
    weights: BoneName | BoneWeights,
    layer: MaterialLayer = "cloth",
    intensity = 1,
  ) {
    // smooth within the shape (shared vertices), never across shapes: averaging with a neighbouring
    // shape can turn normals inside a triangle opposite ways, which shades as NaN
    if (shape.index) shape.computeVertexNormals();
    const geometry = shape.index ? shape.toNonIndexed() : shape;
    geometry.deleteAttribute("uv");
    if (!shape.index) geometry.computeVertexNormals();
    const positions = geometry.attributes.position;
    const vertexCount = positions.count;
    const tint = new THREE.Color(color).multiplyScalar(intensity);
    const colors = new Float32Array(vertexCount * 3);
    const skinIndices = new Uint16Array(vertexCount * 4);
    const skinWeights = new Float32Array(vertexCount * 4);
    for (let i = 0; i < vertexCount; i++) {
      colors.set([tint.r, tint.g, tint.b], i * 3);
      const influences: [BoneName, number][] =
        typeof weights === "string"
          ? [[weights, 1]]
          : weights(positions.getX(i), positions.getY(i), positions.getZ(i));
      influences.forEach(([bone, weight], k) => {
        skinIndices[i * 4 + k] = BONE_INDEX.get(bone)!;
        skinWeights[i * 4 + k] = weight;
      });
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute(
      "skinIndex",
      new THREE.BufferAttribute(skinIndices, 4),
    );
    geometry.setAttribute(
      "skinWeight",
      new THREE.BufferAttribute(skinWeights, 4),
    );
    this.layers[layer].push(geometry);
    if (typeof weights === "string") this.boneOf.set(geometry, weights);
  }

  private boneOf = new Map<THREE.BufferGeometry, BoneName>();

  /** Scales every shape that rides only `bone` about a point (a head brought to the painting's size). */
  scaleBone(bone: BoneName, centre: Vec3, scale: number) {
    this.boneOf.forEach((owner, geometry) => {
      if (owner !== bone) return;
      geometry
        .translate(-centre[0], -centre[1], -centre[2])
        .scale(scale, scale, scale)
        .translate(centre[0], centre[1], centre[2]);
    });
  }

  /** One geometry with a material group per layer, in MATERIAL_LAYERS order. */
  merge() {
    const merged = mergeGeometries(
      MATERIAL_LAYERS.map((layer) => mergeGeometries(this.layers[layer])!),
      true,
    )!;
    Object.values(this.layers).forEach((shapes) =>
      shapes.forEach((shape) => shape.dispose()),
    );
    return merged;
  }
}

export const MATERIAL_LAYERS: MaterialLayer[] = ["cloth", "metal", "glow"];

const CAPE_TOP_Y = 1.45;
const CAPE_BOTTOM_Y = 0.4;

/** Cloth that bends smoothly along the three cape bones. */
const capeWeights: BoneWeights = (_x, y) => {
  const [, y1] = REST_POSITION.cape1;
  const [, y2] = REST_POSITION.cape2;
  const [, y3] = REST_POSITION.cape3;
  if (y >= y2) {
    const blend = THREE.MathUtils.clamp((y1 - y) / (y1 - y2), 0, 1);
    return [
      ["cape1", 1 - blend],
      ["cape2", blend],
    ];
  }
  const blend = THREE.MathUtils.clamp((y2 - y) / (y2 - y3), 0, 1);
  return [
    ["cape2", 1 - blend],
    ["cape3", blend],
  ];
};

function capeSheet(topWidth: number, bottomWidth: number, isTattered: boolean) {
  const height = CAPE_TOP_Y - CAPE_BOTTOM_Y;
  const sheet = new THREE.PlaneGeometry(1, height, 6, 7);
  const positions = sheet.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const across = positions.getX(i) * 2;
    const down = 0.5 - positions.getY(i) / height;
    const halfWidth = THREE.MathUtils.lerp(topWidth, bottomWidth, down) / 2;
    const isHem = down > 0.99;
    const tatter =
      isTattered && isHem ? Math.abs(Math.sin(across * 7.3 + 1)) * 0.12 : 0;
    positions.setXYZ(
      i,
      across * halfWidth,
      CAPE_TOP_Y - down * height + tatter,
      // wraps slightly around the shoulders and drifts back towards the hem
      -0.135 - down * 0.06 + across * across * 0.07 * (1 - down * 0.6),
    );
  }
  return sheet;
}

const EYE_COLOR = 0x1a1420;
const PARCHMENT = 0xd9c9a2;
const WOOD = 0x5b3d27;

/** Builds one class's body, clothes and gear from simple shapes, skinned to the wizard skeleton. */
export function createWizardGeometry(wizardClass: WizardClass) {
  const { id, palette: p } = wizardClass;
  if (id === "mage") return createMageGeometry();
  const parts = new WizardParts();
  const sides: [number, Side][] = [
    [1, "L"],
    [-1, "R"],
  ];
  const hasMetalBracers = id === "guardian" || id === "scholar";

  for (const [s, side] of sides) {
    // legs
    parts.add(
      tube([0.09 * s, 0.95, 0], [0.095 * s, 0.52, 0], 0.08, 0.063),
      p.pants,
      `upperLeg${side}`,
    );
    parts.add(
      tube([0.095 * s, 0.55, 0], [0.1 * s, 0.09, 0], 0.067, 0.071),
      p.boots,
      `lowerLeg${side}`,
    );
    parts.add(
      tube([0.095 * s, 0.47, 0], [0.095 * s, 0.55, 0], 0.08, 0.082),
      p.leather,
      `lowerLeg${side}`,
    );
    parts.add(box(0.125, 0.1, 0.26, 0.1 * s, 0.05, 0.045), p.boots, `foot${side}`);
    // arms
    parts.add(ball(0.074, 0.2 * s, 1.43, 0), p.coat, "chest");
    parts.add(
      tube([0.2 * s, 1.43, 0], [0.215 * s, 1.17, 0], 0.066, 0.055),
      p.coat,
      `upperArm${side}`,
    );
    parts.add(
      tube([0.215 * s, 1.19, 0], [0.225 * s, 0.95, 0], 0.054, 0.046),
      p.sleeve,
      `foreArm${side}`,
    );
    parts.add(
      tube([0.218 * s, 1.11, 0], [0.224 * s, 0.965, 0], 0.06, 0.055),
      p.bracer,
      `foreArm${side}`,
      hasMetalBracers ? "metal" : "cloth",
    );
    parts.add(ball(0.048, 0.225 * s, 0.9, 0), p.glove, `hand${side}`);
  }

  // torso
  parts.add(barrel(0.86, 1.0, 0.135, 0.15, 0.8), p.pants, "hips");
  parts.add(barrel(0.99, 1.05, 0.16, 0.16, 0.82), p.leather, "hips");
  parts.add(box(0.06, 0.06, 0.02, 0, 1.02, 0.134), p.metal, "hips", "metal");
  parts.add(box(0.075, 0.1, 0.06, 0.155, 0.95, 0.03), p.leather, "hips");
  parts.add(box(0.075, 0.1, 0.06, -0.14, 0.95, -0.07), p.leather, "hips");
  parts.add(barrel(1.04, 1.24, 0.147, 0.172, 0.78), p.coat, "spine");
  parts.add(barrel(1.23, 1.44, 0.172, 0.187, 0.74), p.coat, "chest");
  parts.add(ball(0.187, 0, 1.44, 0, 1, 0.3, 0.74), p.coat, "chest");
  parts.add(box(0.075, 0.38, 0.02, 0, 1.25, 0.13), p.accent, "chest");
  for (const s of [1, -1])
    parts.add(
      box(0.013, 0.38, 0.024, 0.045 * s, 1.25, 0.131),
      p.metal,
      "chest",
      "metal",
    );
  // short, so it stays under the painted chin and collar
  parts.add(tube([0, 1.42, 0], [0, 1.52, 0], 0.046, 0.044), p.skin, "neck");

  // head
  parts.add(ball(0.135, 0, 1.665, 0, 1, 1.08, 0.98, 2), p.skin, "head");
  for (const s of [1, -1])
    parts.add(box(0.028, 0.034, 0.012, 0.05 * s, 1.672, 0.127), EYE_COLOR, "head");
  parts.add(ball(0.15, 0, 1.718, -0.03, 1.03, 0.86, 1.04), p.hair, "head");
  parts.add(ball(0.12, 0, 1.635, -0.075, 1.08, 1, 0.8), p.hair, "head");
  // no spiky tufts: the painted hair carries the detail, and spikes stuck out past it

  // coat skirt: four panels, each on its own spring bone
  // the hem trim is painted from the sheet (the Scholar's runes included)
  const hemLayer: MaterialLayer = "metal";
  const hemColor = p.metal;
  const coatPanels: [BoneName, number, number][] = [
    ["coatFL", 0.3, 1.5],
    ["coatBL", 1.6, 3.1],
    ["coatBR", 3.18, 4.68],
    ["coatFR", 4.78, 5.98],
  ];
  coatPanels.forEach(([bone, fromAngle, toAngle]) => {
    parts.add(wrap(0.46, 0.99, 0.3, 0.16, fromAngle, toAngle), p.coat, bone);
    parts.add(
      wrap(0.44, 0.475, 0.312, 0.303, fromAngle, toAngle),
      hemColor,
      bone,
      hemLayer,
    );
  });
  parts.add(box(0.15, 0.4, 0.015, 0, 0.76, 0.15, -0.14), p.accent, "hips");

  if (id !== "guardian") {
    // high open collar
    parts.add(wrap(1.43, 1.57, 0.11, 0.155, 0.7, 5.58, 6), p.coat, "chest");
    parts.add(
      wrap(1.565, 1.58, 0.156, 0.158, 0.7, 5.58, 6),
      p.metal,
      "chest",
      "metal",
    );
  }

  if (id === "guardian") {
    parts.add(capeSheet(0.36, 0.78, false), p.cloak, capeWeights);
    parts.add(wrap(1.36, 1.5, 0.27, 0.13, 0.45, 5.83, 8), p.cloak, "chest");
    parts.add(ball(0.11, 0, 1.47, -0.14, 1.3, 0.75, 0.8), p.cloak, "chest");
    parts.add(ball(0.17, 0, 1.3, 0.03, 1, 1, 0.62), p.metal, "chest", "metal");
    for (const s of [1, -1]) {
      parts.add(
        ball(0.1, 0.215 * s, 1.47, 0, 1.15, 0.6, 1.2),
        p.metal,
        "chest",
        "metal",
      );
      parts.add(
        tube([0.095 * s, 0.42, 0.02], [0.1 * s, 0.16, 0.02], 0.071, 0.075),
        p.metal,
        s > 0 ? "lowerLegL" : "lowerLegR",
        "metal",
      );
    }
    parts.add(ball(0.03, 0.09, 1.45, 0.14), p.glow, "chest", "glow", 3);
    parts.add(ball(0.03, 0.13, 0.9, 0.1), p.glow, "hips", "glow", 2.5);
    parts.add(ball(0.026, 0.175, 0.9, 0.05), 0xc050ff, "hips", "glow", 2.5);
    // staff
    parts.add(
      tube([-0.225, -0.04, 0.03], [-0.225, 1.86, 0.03], 0.018, 0.016, 5),
      WOOD,
      "handR",
    );
    for (const s of [1, -1])
      parts.add(
        tube([-0.225, 1.84, 0.03], [-0.225 + 0.075 * s, 2.0, 0.03], 0.016, 0.007, 5),
        p.metal,
        "handR",
        "metal",
      );
    parts.add(ball(0.05, -0.225, 1.95, 0.03), p.glow, "handR", "glow", 4);
  }

  if (id === "mystic") {
    parts.add(capeSheet(0.34, 0.7, true), p.cloak, capeWeights);
    parts.add(ball(0.1, 0, 1.46, -0.13, 1.3, 0.8, 0.8), p.cloak, "chest");
    parts.add(ball(0.03, 0.08, 1.42, 0.15), p.glow, "chest", "glow", 3);
    // the cape's stars are painted on (constellations on the concept sheet)
    for (const s of [1, -1])
      parts.add(
        tube([0.219 * s, 1.07, 0], [0.22 * s, 1.05, 0], 0.062, 0.062),
        p.glow,
        s > 0 ? "foreArmL" : "foreArmR",
        "glow",
        2.2,
      );
    // crescent staff
    parts.add(
      tube([0.225, -0.04, 0.03], [0.225, 1.8, 0.03], 0.015, 0.013, 5),
      p.metal,
      "handL",
      "metal",
    );
    parts.add(
      place(new THREE.TorusGeometry(0.12, 0.017, 4, 10, 4.4), 0.225, 1.93, 0.03, 0, 0, -0.63),
      p.metal,
      "handL",
      "metal",
    );
    parts.add(ball(0.055, 0.225, 1.93, 0.03), p.glow, "handL", "glow", 4);
    // lantern, chained to the belt on the left
    parts.add(box(0.05, 0.07, 0.05, 0.17, 0.86, 0.06), p.glow, "hips", "glow", 2.5);
    parts.add(box(0.06, 0.015, 0.06, 0.17, 0.9, 0.06), p.metal, "hips", "metal");
  }

  if (id === "scholar") {
    for (const s of [1, -1])
      parts.add(
        ball(0.1, 0.215 * s, 1.47, 0, 1.15, 0.6, 1.2),
        p.metal,
        "chest",
        "metal",
      );
    parts.add(ball(0.035, 0, 1.33, 0.135, 1, 1, 0.5), p.glow, "chest", "glow", 3);
    // satchel and scrolls
    parts.add(box(0.25, 0.28, 0.12, 0, 1.24, -0.19), p.leather, "chest");
    parts.add(box(0.2, 0.1, 0.02, 0, 1.3, -0.255), 0x4a2f20, "chest");
    for (const y of [1.42, 1.07])
      parts.add(
        tube([-0.17, y, -0.2], [0.17, y, -0.2], 0.036, 0.036),
        PARCHMENT,
        "chest",
      );
    // grimoire: lies flat on the left palm once the forearm is raised
    parts.add(box(0.2, 0.26, 0.05, 0.225, 0.89, 0.075), 0x5a3324, "handL");
    parts.add(box(0.18, 0.24, 0.03, 0.232, 0.89, 0.075), PARCHMENT, "handL");
  }

  // the concept sheets paint a smaller head than the stylised one above: chin at 1.53 m, hair top at 1.8 m
  parts.scaleBone("head", [0, 1.53, 0.01], 0.7);
  return parts.merge();
}

// ---- The Elemental Mage, modelled on its concept sheet ----

const MAGE = {
  crimson: 0x8c1c2c,
  orange: 0xc4541c,
  orangeBright: 0xe07a1e,
  gold: 0xd9a036,
  leather: 0x4f3626,
  leatherDark: 0x33231b,
  charcoal: 0x2a2526,
  vest: 0x2c221e,
  scarf: 0x6a5648,
  skin: 0xe8b48c,
  skinShade: 0xd39672,
  lips: 0x9a5444,
  hair: 0x9a4a22,
  hairLight: 0xc26a30,
  hairDark: 0x74351a,
  eyeWhite: 0xf2ece4,
  iris: 0xd98a2a,
  wandWood: 0x6e2a1c,
  ember: 0xff7a1e,
  flame: 0xff5a14,
  flameCore: 0xffc24a,
};

interface CoatPanel {
  bones: [BoneName, BoneName];
  /** Angles around the body where the panel starts and ends; 0 is the wizard's front. */
  from: number;
  to: number;
  /** Length at the centre of the panel, where it comes to a point. */
  length: number;
  /** How much shorter the panel is at its edges than at its point. */
  point: number;
  /** Radius at the hem. */
  flare: number;
}

const COAT_TOP_Y = 0.99;
const COAT_TOP_RADIUS = 0.168;
const COAT_DEPTH = 0.86;

/** A point on a coat panel: `across` runs 0-1 along the waist, `down` 0-1 from waist to hem. */
function panelPoint(
  panel: CoatPanel,
  across: number,
  down: number,
  lift: number,
  out = new THREE.Vector3(),
) {
  const angle = THREE.MathUtils.lerp(panel.from, panel.to, across);
  const length =
    panel.length - panel.point * Math.pow(Math.abs(across * 2 - 1), 1.2);
  const radius =
    THREE.MathUtils.lerp(COAT_TOP_RADIUS, panel.flare, Math.pow(down, 0.85)) +
    lift;
  return out.set(
    Math.sin(angle) * radius,
    COAT_TOP_Y - down * length,
    Math.cos(angle) * radius * COAT_DEPTH,
  );
}

/** A patch of a coat panel, raised off the cloth by `lift`. */
function panelSheet(
  panel: CoatPanel,
  acrossFrom: number,
  acrossTo: number,
  downFrom: number,
  downTo: number,
  lift: number,
  columns = 6,
  rows = 6,
) {
  const sheet = new THREE.PlaneGeometry(1, 1, columns, rows);
  const positions = sheet.attributes.position;
  const point = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    panelPoint(
      panel,
      THREE.MathUtils.lerp(acrossFrom, acrossTo, positions.getX(i) + 0.5),
      THREE.MathUtils.lerp(downFrom, downTo, 0.5 - positions.getY(i)),
      lift,
      point,
    );
    positions.setXYZ(i, point.x, point.y, point.z);
  }
  return sheet;
}

/** Lays a flat motif on a coat panel, facing outwards. */
function panelDecal(
  panel: CoatPanel,
  motif: THREE.BufferGeometry,
  across: number,
  down: number,
  width: number,
  height: number,
) {
  const centre = panelPoint(panel, across, down, 0.008);
  const up = panelPoint(panel, across, down - 0.05, 0.008).sub(centre).normalize();
  const side = panelPoint(panel, across + 0.05, down, 0.008).sub(centre);
  const normal = side.cross(up).normalize();
  side.crossVectors(up, normal);
  return motif.applyMatrix4(
    new THREE.Matrix4()
      .makeBasis(side.multiplyScalar(width), up.multiplyScalar(height), normal)
      .setPosition(centre),
  );
}

const panelWeights =
  ([upper, lower]: [BoneName, BoneName]): BoneWeights =>
  (_x, y) => {
    const blend = THREE.MathUtils.clamp((0.9 - y) / 0.4, 0, 1);
    return [
      [upper, 1 - blend],
      [lower, blend],
    ];
  };

/** A curling flame, one unit tall, for embroidery. */
function flameMotif() {
  const outline = new THREE.Shape();
  outline.moveTo(0, -0.5);
  outline.bezierCurveTo(0.45, -0.35, 0.35, 0.05, 0.05, 0.5);
  outline.bezierCurveTo(0.12, 0.15, -0.05, 0.05, -0.12, 0.22);
  outline.bezierCurveTo(-0.38, -0.05, -0.3, -0.4, 0, -0.5);
  return new THREE.ShapeGeometry(outline, 4);
}

const diamondMotif = () =>
  new THREE.ShapeGeometry(
    new THREE.Shape([
      new THREE.Vector2(0, 0.5),
      new THREE.Vector2(0.5, 0),
      new THREE.Vector2(0, -0.5),
      new THREE.Vector2(-0.5, 0),
    ]),
  );

const tuft = (
  x: number,
  y: number,
  z: number,
  rotationX: number,
  rotationZ: number,
  radius: number,
  length: number,
) =>
  place(
    new THREE.ConeGeometry(radius, length, 5),
    x,
    y,
    z,
    rotationX,
    0,
    rotationZ,
  );

const gem = (
  radius: number,
  x: number,
  y: number,
  z: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
) =>
  place(
    new THREE.OctahedronGeometry(radius),
    x,
    y,
    z,
    0,
    0,
    0,
    scaleX,
    scaleY,
    scaleZ,
  );

function createMageGeometry() {
  const c = MAGE;
  const parts = new WizardParts();
  const sides: [number, Side][] = [
    [1, "L"],
    [-1, "R"],
  ];

  for (const [s, side] of sides) {
    // baggy trousers tucked into tall cuffed boots
    parts.add(
      tube([0.09 * s, 0.95, 0], [0.095 * s, 0.5, 0], 0.09, 0.078),
      c.charcoal,
      `upperLeg${side}`,
    );
    parts.add(ball(0.08, 0.095 * s, 0.53, 0.005), c.charcoal, `lowerLeg${side}`);
    parts.add(
      tube([0.095 * s, 0.47, 0], [0.1 * s, 0.09, 0], 0.074, 0.066),
      c.leatherDark,
      `lowerLeg${side}`,
    );
    parts.add(
      tube([0.095 * s, 0.43, 0], [0.095 * s, 0.5, 0], 0.084, 0.09),
      c.leather,
      `lowerLeg${side}`,
    );
    for (const y of [0.3, 0.15]) {
      parts.add(
        tube([0.098 * s, y - 0.015, 0], [0.098 * s, y + 0.015, 0], 0.076, 0.076),
        c.leather,
        `lowerLeg${side}`,
      );
      parts.add(
        box(0.03, 0.03, 0.012, 0.098 * s, y, 0.074),
        c.gold,
        `lowerLeg${side}`,
        "metal",
      );
    }
    parts.add(box(0.125, 0.09, 0.2, 0.1 * s, 0.055, 0.02), c.leatherDark, `foot${side}`);
    parts.add(
      ball(0.064, 0.1 * s, 0.05, 0.13, 1, 0.72, 1.35),
      c.leatherDark,
      `foot${side}`,
    );
    parts.add(box(0.13, 0.022, 0.29, 0.1 * s, 0.011, 0.045), 0x1c1512, `foot${side}`);

    // crimson cap sleeves with a gold edge
    parts.add(ball(0.08, 0.2 * s, 1.43, 0), c.crimson, "chest");
    parts.add(
      tube([0.2 * s, 1.45, 0], [0.212 * s, 1.27, 0], 0.08, 0.086),
      c.crimson,
      `upperArm${side}`,
    );
    parts.add(
      tube([0.212 * s, 1.27, 0], [0.213 * s, 1.252, 0], 0.089, 0.089),
      c.gold,
      `upperArm${side}`,
      "metal",
    );
    parts.add(
      gem(0.034, 0.292 * s, 1.34, 0, 0.25, 1.1, 0.8),
      c.gold,
      `upperArm${side}`,
      "metal",
    );
    parts.add(
      tube([0.21 * s, 1.3, 0], [0.215 * s, 1.16, 0], 0.062, 0.056),
      s > 0 ? c.orange : c.leatherDark,
      `upperArm${side}`,
    );
    // fingerless gloves
    parts.add(box(0.076, 0.085, 0.046, 0.225 * s, 0.9, 0), c.leatherDark, `hand${side}`);
    parts.add(box(0.07, 0.05, 0.036, 0.225 * s, 0.836, 0.004), c.skin, `hand${side}`);
    parts.add(box(0.026, 0.05, 0.03, 0.225 * s, 0.885, 0.036), c.skin, `hand${side}`);
  }

  // left forearm: long leather bracer
  parts.add(
    tube([0.215, 1.19, 0], [0.225, 0.94, 0], 0.058, 0.05),
    c.leatherDark,
    "foreArmL",
  );
  for (const y of [1.1, 1.0])
    parts.add(
      tube([0.22, y, 0], [0.221, y - 0.03, 0], 0.061, 0.058),
      c.leather,
      "foreArmL",
    );
  // right forearm: gold gauntlet with an ember set in it
  parts.add(
    tube([-0.215, 1.19, 0], [-0.225, 0.94, 0], 0.056, 0.05),
    c.leatherDark,
    "foreArmR",
  );
  parts.add(
    tube([-0.217, 1.13, 0], [-0.224, 0.955, 0], 0.07, 0.06),
    c.gold,
    "foreArmR",
    "metal",
  );
  parts.add(
    tube([-0.216, 1.16, 0], [-0.218, 1.09, 0], 0.082, 0.07),
    c.gold,
    "foreArmR",
    "metal",
  );
  parts.add(
    tube([-0.223, 0.98, 0], [-0.224, 0.955, 0], 0.066, 0.066),
    c.gold,
    "foreArmR",
    "metal",
  );
  parts.add(gem(0.034, -0.288, 1.05, 0, 0.6, 1.3, 1), c.ember, "foreArmR", "glow", 3.5);
  parts.add(gem(0.045, -0.278, 1.05, 0, 0.5, 1.3, 1), c.gold, "foreArmR", "metal");
  for (const z of [0.035, -0.035])
    parts.add(
      place(new THREE.ConeGeometry(0.02, 0.1, 4), -0.295, 1.15, z, 0, 0, 0.55),
      c.gold,
      "foreArmR",
      "metal",
    );

  // layered leather pauldron on the left shoulder
  parts.add(ball(0.108, 0.228, 1.42, 0, 1.17, 0.26, 1.32), c.gold, "chest", "metal");
  parts.add(ball(0.105, 0.228, 1.435, 0, 1.15, 0.55, 1.3), c.leather, "chest");
  parts.add(ball(0.092, 0.262, 1.4, 0, 0.95, 0.24, 1.22), c.gold, "upperArmL", "metal");
  parts.add(ball(0.09, 0.262, 1.415, 0, 0.9, 0.6, 1.2), c.leatherDark, "upperArmL");
  parts.add(gem(0.03, 0.3, 1.46, 0, 0.5, 0.8, 1), c.gold, "chest", "metal");

  // torso: crimson coat over a dark vest with gold toggles
  parts.add(barrel(0.86, 1.0, 0.135, 0.15, 0.8), c.charcoal, "hips");
  parts.add(barrel(1.04, 1.24, 0.147, 0.172, 0.78), c.crimson, "spine");
  parts.add(barrel(1.23, 1.44, 0.172, 0.187, 0.74), c.crimson, "chest");
  parts.add(ball(0.187, 0, 1.44, 0, 1, 0.3, 0.74), c.crimson, "chest");
  const frontLean = 0.055;
  parts.add(box(0.1, 0.4, 0.02, 0, 1.24, 0.12, frontLean), c.vest, "chest");
  for (const s of [1, -1]) {
    parts.add(
      box(0.036, 0.4, 0.022, 0.066 * s, 1.24, 0.121, frontLean),
      c.orange,
      "chest",
    );
    parts.add(
      box(0.012, 0.4, 0.024, 0.089 * s, 1.24, 0.121, frontLean),
      c.gold,
      "chest",
      "metal",
    );
  }
  for (const y of [1.13, 1.2, 1.27])
    parts.add(
      box(0.08, 0.013, 0.014, 0, y, 0.131 + (y - 1.24) * frontLean, frontLean),
      c.gold,
      "chest",
      "metal",
    );
  parts.add(
    box(0.032, 0.47, 0.012, 0.005, 1.25, 0.137, frontLean, 0, -0.64),
    c.leather,
    "chest",
  );
  parts.add(box(0.04, 0.03, 0.012, -0.05, 1.175, 0.142), c.gold, "chest", "metal");
  for (const s of [1, -1])
    parts.add(box(0.03, 0.44, 0.012, 0, 1.24, -0.128, 0, 0, 0.6 * s), c.leatherDark, "chest");
  // ember pendant
  parts.add(gem(0.036, 0, 1.37, 0.14, 0.75, 1.15, 0.4), c.gold, "chest", "metal");
  parts.add(gem(0.027, 0, 1.37, 0.146, 0.75, 1.15, 0.5), c.ember, "chest", "glow", 3.5);

  // scarf, tall open collar and hood
  // the scarf comes up to the chin, as painted
  parts.add(barrel(1.42, 1.545, 0.105, 0.082, 0.9), c.scarf, "chest");
  parts.add(ball(0.07, 0, 1.44, 0.085, 1.3, 0.55, 0.6), c.orange, "chest");
  parts.add(wrap(1.43, 1.6, 0.115, 0.176, 0.8, 5.48, 8), c.crimson, "chest");
  parts.add(wrap(1.435, 1.596, 0.109, 0.169, 0.8, 5.48, 8), c.orange, "chest");
  parts.add(wrap(1.596, 1.613, 0.177, 0.18, 0.8, 5.48, 8), c.gold, "chest", "metal");
  parts.add(ball(0.11, 0, 1.4, -0.165, 1.35, 1, 0.7), c.crimson, "chest");
  parts.add(ball(0.075, 0, 1.47, -0.14, 1.3, 0.5, 0.7), c.orange, "chest");

  // belts, buckles, pouches and scrolls
  parts.add(barrel(0.99, 1.05, 0.166, 0.166, 0.82), c.leatherDark, "hips");
  parts.add(box(0.075, 0.066, 0.016, 0, 1.02, 0.13), c.gold, "hips", "metal");
  parts.add(box(0.042, 0.034, 0.02, 0, 1.02, 0.132), c.leatherDark, "hips");
  parts.add(
    place(
      new THREE.TorusGeometry(0.178, 0.017, 4, 14),
      0,
      0.955,
      0,
      Math.PI / 2,
      0.14,
      0,
      1,
      0.84,
      1,
    ),
    c.leather,
    "hips",
  );
  parts.add(box(0.04, 0.04, 0.014, 0.05, 0.948, 0.152), c.gold, "hips", "metal");
  parts.add(box(0.095, 0.115, 0.065, 0.15, 0.9, 0.075), c.leather, "hips");
  parts.add(box(0.1, 0.05, 0.07, 0.15, 0.94, 0.076), c.leatherDark, "hips");
  parts.add(box(0.018, 0.018, 0.01, 0.15, 0.915, 0.112), c.gold, "hips", "metal");
  parts.add(box(0.09, 0.11, 0.065, -0.15, 0.9, -0.085), c.leather, "hips");
  parts.add(box(0.095, 0.05, 0.07, -0.15, 0.94, -0.086), c.leatherDark, "hips");
  for (const z of [-0.02, -0.07])
    parts.add(
      tube([0.2, 0.84, z], [0.19, 0.99, z], 0.024, 0.024),
      PARCHMENT,
      "hips",
    );

  // dark front tabards with gold borders
  for (const s of [1, -1]) {
    const tabard = () =>
      new THREE.ShapeGeometry(
        new THREE.Shape([
          new THREE.Vector2(-0.05, 0),
          new THREE.Vector2(0.05, 0),
          new THREE.Vector2(0.05, -0.36),
          new THREE.Vector2(0, -0.45),
          new THREE.Vector2(-0.05, -0.36),
        ]),
      );
    parts.add(
      place(tabard(), 0.072 * s, 0.985, 0.146, -0.1, 0, 0, 1.16, 1.06, 1),
      c.gold,
      "hips",
      "metal",
    );
    parts.add(place(tabard(), 0.072 * s, 0.975, 0.15, -0.1), c.vest, "hips");
    parts.add(
      place(diamondMotif(), 0.072 * s, 0.7, 0.182, -0.1, 0, 0, 0.05, 0.09, 1),
      c.gold,
      "hips",
      "metal",
    );
  }

  // the coat's four long pointed tails: crimson outside, orange lining, gold hems
  const tails: CoatPanel[] = [
    { bones: ["coatFL", "coatFL2"], from: 0.62, to: 1.55, length: 0.8, point: 0.2, flare: 0.38 },
    { bones: ["coatBL", "coatBL2"], from: 1.62, to: 3.09, length: 0.79, point: 0.16, flare: 0.42 },
    { bones: ["coatBR", "coatBR2"], from: 3.19, to: 4.66, length: 0.79, point: 0.16, flare: 0.42 },
    { bones: ["coatFR", "coatFR2"], from: 4.73, to: 5.66, length: 0.8, point: 0.2, flare: 0.38 },
  ];
  tails.forEach((panel, index) => {
    const weights = panelWeights(panel.bones);
    const isBack = index === 1 || index === 2;
    parts.add(panelSheet(panel, 0, 1, 0, 1, 0), c.crimson, weights);
    parts.add(panelSheet(panel, 0.02, 0.98, 0.02, 0.985, -0.01), c.orange, weights);
    parts.add(panelSheet(panel, 0, 1, 0.94, 1, 0.004, 6, 1), c.gold, weights, "metal");
    parts.add(panelSheet(panel, 0, 0.06, 0, 0.95, 0.004, 1, 6), c.gold, weights, "metal");
    parts.add(panelSheet(panel, 0.94, 1, 0, 0.95, 0.004, 1, 6), c.gold, weights, "metal");
    // flame embroidery
    parts.add(
      panelDecal(panel, flameMotif(), 0.5, isBack ? 0.7 : 0.74, 0.17, 0.26),
      c.gold,
      weights,
      "metal",
    );
    parts.add(
      panelDecal(panel, flameMotif(), 0.3, 0.52, -0.1, 0.16),
      c.orangeBright,
      weights,
    );
    parts.add(
      panelDecal(panel, flameMotif(), 0.7, 0.52, 0.1, 0.16),
      c.orangeBright,
      weights,
    );
    if (isBack)
      parts.add(
        panelDecal(panel, flameMotif(), 0.5, 0.3, index === 1 ? 0.09 : -0.09, 0.15),
        c.gold,
        weights,
        "metal",
      );
  });

  // head and face
  parts.add(tube([0, 1.42, 0], [0, 1.58, 0], 0.05, 0.048), c.skin, "neck");
  parts.add(ball(0.135, 0, 1.672, 0, 1, 1.06, 0.98, 2), c.skin, "head");
  parts.add(ball(0.1, 0, 1.605, 0.018, 0.95, 0.8, 0.95, 2), c.skin, "head");
  for (const s of [1, -1]) {
    parts.add(ball(0.03, 0.135 * s, 1.665, 0, 0.5, 1, 0.8), c.skinShade, "head");
    parts.add(box(0.042, 0.027, 0.012, 0.052 * s, 1.678, 0.123), c.eyeWhite, "head");
    parts.add(box(0.021, 0.025, 0.014, 0.05 * s, 1.678, 0.125), c.iris, "head");
    parts.add(box(0.009, 0.012, 0.016, 0.05 * s, 1.678, 0.125), 0x1a1210, "head");
    parts.add(
      box(0.054, 0.013, 0.014, 0.053 * s, 1.708, 0.124, 0, 0, 0.2 * s),
      c.hairDark,
      "head",
    );
    // ember marks on the cheeks
    parts.add(
      box(0.014, 0.022, 0.008, 0.088 * s, 1.645, 0.103, 0, 0.6 * s, 0.4 * s),
      c.ember,
      "head",
      "glow",
      2.2,
    );
  }
  parts.add(box(0.024, 0.045, 0.028, 0, 1.648, 0.132, -0.25), c.skinShade, "head");
  parts.add(box(0.052, 0.009, 0.01, 0.005, 1.607, 0.118, 0, 0, 0.14), c.lips, "head");
  parts.add(box(0.012, 0.016, 0.008, -0.07, 1.735, 0.112), c.ember, "head", "glow", 2.2);

  // swept, tousled auburn hair
  parts.add(ball(0.158, 0, 1.738, -0.02, 1.06, 0.88, 1.1), c.hair, "head");
  parts.add(ball(0.13, 0, 1.645, -0.08, 1.1, 1.05, 0.85), c.hairDark, "head");
  const locks: [number, number, number, number, number, number, number, number][] = [
    // crown, swept up and back
    [0, 1.87, 0, -0.5, 0.1, 0.07, 0.2, c.hair],
    [0.07, 1.855, 0.02, -0.3, -0.5, 0.065, 0.2, c.hairLight],
    [-0.075, 1.855, 0.01, -0.35, 0.55, 0.065, 0.19, c.hair],
    [0.125, 1.8, -0.03, -0.2, -0.95, 0.055, 0.18, c.hair],
    [-0.13, 1.795, -0.03, -0.25, 1.0, 0.055, 0.18, c.hairLight],
    [0.04, 1.845, -0.09, -0.9, -0.2, 0.065, 0.2, c.hairDark],
    [-0.05, 1.835, -0.1, -1.0, 0.25, 0.065, 0.2, c.hair],
    [0, 1.765, -0.165, -1.5, 0, 0.06, 0.18, c.hairDark],
    [0.1, 1.725, -0.125, -1.3, -0.6, 0.05, 0.16, c.hair],
    [-0.1, 1.725, -0.125, -1.3, 0.6, 0.05, 0.16, c.hairDark],
    // fringe, falling across the brow
    [0.065, 1.79, 0.105, 2.25, 0.3, 0.05, 0.15, c.hairLight],
    [-0.015, 1.795, 0.118, 2.3, 0.45, 0.052, 0.16, c.hair],
    [-0.09, 1.782, 0.092, 2.2, 0.8, 0.044, 0.14, c.hair],
    [0.118, 1.772, 0.065, 2.0, -0.5, 0.042, 0.14, c.hair],
    // locks in front of the ears
    [0.132, 1.675, 0.02, 0, Math.PI + 0.3, 0.042, 0.14, c.hair],
    [-0.132, 1.675, 0.02, 0, Math.PI - 0.3, 0.042, 0.14, c.hair],
  ];
  locks.forEach(([x, y, z, rotationX, rotationZ, radius, length, color]) =>
    parts.add(tuft(x, y, z, rotationX, rotationZ, radius, length), color, "head"),
  );

  // wand: dark red wood, gold bands, an ember at the tip
  parts.add(
    tube([-0.225, 0.9, 0.0], [-0.225, 0.856, 0.36], 0.014, 0.009, 5),
    c.wandWood,
    "handR",
  );
  parts.add(ball(0.019, -0.225, 0.902, -0.012), c.gold, "handR", "metal");
  for (const along of [0.3, 0.75])
    parts.add(
      tube(
        [-0.225, 0.9 - 0.044 * along, 0.36 * along],
        [-0.225, 0.9 - 0.044 * (along + 0.05), 0.36 * (along + 0.05)],
        0.017,
        0.016,
        5,
      ),
      c.gold,
      "handR",
      "metal",
    );
  parts.add(gem(0.022, -0.225, 0.852, 0.385, 0.7, 0.7, 1.6), c.ember, "handR", "glow", 4);
  // the painting's head is smaller than the stylised one above: chin at 1.53 m, hair top at 1.8 m
  parts.scaleBone("head", [0, 1.53, 0.01], 0.7);

  // the flame cupped in the left hand, on its own bone so it can flicker and stay upright
  const flameCone = (
    radius: number,
    length: number,
    x: number,
    z: number,
    lean: number,
  ) =>
    place(
      new THREE.ConeGeometry(radius, length, 6),
      0.225 + x,
      0.89,
      z + length / 2,
      Math.PI / 2,
      0,
      lean,
    );
  parts.add(ball(0.05, 0.225, 0.89, 0.12, 1, 1, 0.9), c.flame, "flameL", "glow", 2.2);
  parts.add(flameCone(0.05, 0.2, 0, 0.12, 0), c.flame, "flameL", "glow", 2.2);
  parts.add(flameCone(0.028, 0.12, 0.04, 0.13, -0.25), c.flame, "flameL", "glow", 2.2);
  parts.add(flameCone(0.024, 0.1, -0.035, 0.12, 0.3), c.flame, "flameL", "glow", 2.2);
  parts.add(ball(0.03, 0.225, 0.89, 0.13), c.flameCore, "flameL", "glow", 3.2);
  parts.add(flameCone(0.03, 0.13, 0, 0.13, 0), c.flameCore, "flameL", "glow", 3.2);

  return parts.merge();
}
