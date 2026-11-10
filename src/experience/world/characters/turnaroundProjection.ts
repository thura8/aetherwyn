import * as THREE from "three";
import { applyPose, type Pose } from "./wizardClips";
import { createWizardSkeleton, type BoneName } from "./wizardRig";

/**
 * Paints a skinned wizard model with its concept sheet's turnaround: the front, side and back views
 * are projected onto the model like slide projectors, so the character keeps the painting's colours
 * and detail while having real 3D depth.
 *
 * Each view is projected with the skeleton in the pose it was painted in: the front view in the
 * class stance (so a raised arm meets the raised arm in the painting) and the side and back views in
 * the neutral stance. Every vertex blends the views that face it and can see it. A vertex no view
 * can see keeps its own palette colour.
 */

export type TurnaroundViewName = "front" | "side" | "back";

/** One painted view, calibrated in concept-sheet pixels (see tools/paperdoll/bake_turnaround.py). */
export interface TurnaroundView {
  /** Atlas pixel = sheet pixel + offset. */
  offset: [number, number];
  /** Sheet x of the body's centre line. */
  axis: number;
  /** Sheet y of the soles. */
  ground: number;
  metresPerPixel: number;
  /** Side view only: which of the wizard's sides it shows ("left": the wizard faces the picture's left). */
  facing?: "left" | "right";
}

export interface Turnaround {
  /** Atlas size in pixels. */
  size: [number, number];
  views: Record<TurnaroundViewName, TurnaroundView>;
  /**
   * Where the atlas has real paint (1) rather than refilled background (0), downsampled: one byte per
   * cell, row by row from the atlas's top, base64-encoded.
   */
  paintMask: { width: number; height: number; data: string };
  /** Where each bone's joint is painted (sheet px), for the views that are aligned joint by joint. */
  joints: Partial<Record<"front" | "back", Partial<Record<BoneName, [number, number]>>>>;
}

export interface TurnaroundPoses {
  front: Pose;
  /** Side and back. */
  neutral: Pose;
}

/** How sharply a view fades out as a surface turns away from it. */
const FACING_POWER = 2.5;
/** How far behind the nearest surface (metres) a point may sit and still count as seen. */
const DEPTH_TOLERANCE = 0.018;
/** Depth-buffer cell size in metres. */
const CELL = 0.006;
/**
 * The side view shows one of the wizard's sides. The other side uses it mirrored, which is wrong for
 * the few things that differ (gauntlet, pauldron, scrolls), so it counts for less there.
 */
const MIRRORED_SIDE_WEIGHT = 0.35;

interface Projected {
  /** Per vertex: horizontal and vertical (metres) on the view's picture plane, and depth. */
  positions: Float32Array;
  /** Per vertex: the surface normal in the projected pose. */
  normals: Float32Array;
}

/** Poses a copy of the shared skeleton and skins every vertex of the geometry with it, on the CPU. */
function skinTo(geometry: THREE.BufferGeometry, pose: Pose) {
  const rest = createWizardSkeleton();
  const posed = createWizardSkeleton();
  applyPose(posed.bones, pose);
  posed.bones.root.updateMatrixWorld(true);
  const matrices = posed.skeleton.bones.map((bone, i) =>
    bone.matrixWorld.clone().multiply(rest.skeleton.bones[i].matrixWorld.clone().invert()),
  );
  const normalMatrices = matrices.map((m) => new THREE.Matrix3().getNormalMatrix(m));

  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const skinIndex = geometry.attributes.skinIndex;
  const skinWeight = geometry.attributes.skinWeight;
  const count = position.count;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const sumP = new THREE.Vector3();
  const sumN = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    sumP.set(0, 0, 0);
    sumN.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = skinWeight.getComponent(i, k);
      if (w <= 0) continue;
      const bone = skinIndex.getComponent(i, k);
      p.fromBufferAttribute(position, i).applyMatrix4(matrices[bone]);
      n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrices[bone]);
      sumP.addScaledVector(p, w);
      sumN.addScaledVector(n, w);
    }
    sumN.normalize();
    positions.set([sumP.x, sumP.y, sumP.z], i * 3);
    normals.set([sumN.x, sumN.y, sumN.z], i * 3);
  }
  return { positions, normals, posed };
}

/**
 * Normals averaged over every vertex at the same spot, so the views blend smoothly across a
 * faceted surface instead of switching from face to face.
 */
function smoothNormals(geometry: THREE.BufferGeometry) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const key = (i: number) =>
    `${Math.round(position.getX(i) * 2000)},${Math.round(position.getY(i) * 2000)},${Math.round(position.getZ(i) * 2000)}`;
  const sums = new Map<string, THREE.Vector3>();
  const n = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const k = key(i);
    const sum = sums.get(k) ?? sums.set(k, new THREE.Vector3()).get(k)!;
    sum.add(n.fromBufferAttribute(normal, i));
  }
  const smoothed = new THREE.BufferAttribute(new Float32Array(position.count * 3), 3);
  for (let i = 0; i < position.count; i++) {
    const sum = sums.get(key(i))!;
    if (sum.lengthSq() > 1e-8) n.copy(sum).normalize();
    else {
      // a degenerate face (a cone's tip) has no normal; a zero normal would shade as NaN
      n.fromBufferAttribute(normal, i);
      if (n.lengthSq() < 1e-8) n.set(0, 1, 0);
      else n.normalize();
    }
    smoothed.setXYZ(i, n.x, n.y, n.z);
  }
  const copy = geometry.clone();
  copy.setAttribute("normal", smoothed);
  return copy;
}

/** The nearest depth seen through each cell of a view, rasterised from the model's triangles. */
class DepthBuffer {
  private readonly depth: Float32Array;
  private readonly minX: number;
  private readonly minY: number;
  private readonly columns: number;
  private readonly rows: number;

  constructor(projected: Projected, triangles: number) {
    const { positions } = projected;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i]);
      maxX = Math.max(maxX, positions[i]);
      minY = Math.min(minY, positions[i + 1]);
      maxY = Math.max(maxY, positions[i + 1]);
    }
    this.minX = minX - CELL;
    this.minY = minY - CELL;
    this.columns = Math.ceil((maxX - minX) / CELL) + 3;
    this.rows = Math.ceil((maxY - minY) / CELL) + 3;
    this.depth = new Float32Array(this.columns * this.rows).fill(-Infinity);
    for (let t = 0; t < triangles; t++) this.fill(positions, t * 3);
  }

  private fill(p: Float32Array, first: number) {
    const ax = (p[first * 3] - this.minX) / CELL;
    const ay = (p[first * 3 + 1] - this.minY) / CELL;
    const az = p[first * 3 + 2];
    const bx = (p[first * 3 + 3] - this.minX) / CELL;
    const by = (p[first * 3 + 4] - this.minY) / CELL;
    const bz = p[first * 3 + 5];
    const cx = (p[first * 3 + 6] - this.minX) / CELL;
    const cy = (p[first * 3 + 7] - this.minY) / CELL;
    const cz = p[first * 3 + 8];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-9) return;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const x1 = Math.min(this.columns - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const y1 = Math.min(this.rows - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const wa = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
        const wb = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
        const wc = 1 - wa - wb;
        if (wa < -1e-4 || wb < -1e-4 || wc < -1e-4) continue;
        const z = wa * az + wb * bz + wc * cz;
        const cell = y * this.columns + x;
        if (z > this.depth[cell]) this.depth[cell] = z;
      }
    }
  }

  /** Whether a point is the nearest surface (or within tolerance of it) where it projects. */
  sees(x: number, y: number, z: number) {
    const column = THREE.MathUtils.clamp(Math.floor((x - this.minX) / CELL), 0, this.columns - 1);
    const row = THREE.MathUtils.clamp(Math.floor((y - this.minY) / CELL), 0, this.rows - 1);
    // a cell no triangle covered holds -Infinity: an edge point there is seen
    return z >= this.depth[row * this.columns + column] - DEPTH_TOLERANCE;
  }
}

/** Turns posed positions into a view's picture plane: (across, up, towards the viewer), metres. */
function toPicturePlane(
  positions: Float32Array,
  normals: Float32Array,
  across: (x: number, y: number, z: number) => number,
  towards: (x: number, y: number, z: number) => number,
  shift?: Float32Array,
): Projected {
  const count = positions.length / 3;
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3] + (shift ? shift[i * 2] : 0);
    const y = positions[i * 3 + 1] + (shift ? shift[i * 2 + 1] : 0);
    const z = positions[i * 3 + 2];
    out[i * 3] = across(x, y, z);
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = towards(x, y, z);
  }
  return { positions: out, normals };
}

/** A 2D similarity on the front picture plane: (x, y) -> (a x - b y + tx, b x + a y + ty). */
type Similarity = [a: number, b: number, tx: number, ty: number];

/**
 * Per vertex, how far a view's painting has its body parts from where the model's pose puts them.
 * Each bone with a painted joint carries its posed joint onto the painted one. A limb bone with one
 * painted child also turns and stretches so its posed child joint lands on the painted child joint,
 * which lines up the whole limb. Bones without a painted joint follow the nearest painted bone up the
 * chain. The moves are blended by the skin weights, and the result is returned as an (x, y) shift
 * per vertex.
 */
function jointShift(
  geometry: THREE.BufferGeometry,
  posedPositions: Float32Array,
  posed: ReturnType<typeof createWizardSkeleton>,
  turnaround: Turnaround,
  viewName: "front" | "back",
) {
  const view = turnaround.views[viewName];
  const joints = turnaround.joints[viewName] ?? {};
  // the back view is seen from behind, so the wizard's +X runs to the picture's left
  const across = viewName === "front" ? 1 : -1;
  const painted = (name: string) => {
    const at = joints[name as BoneName];
    return at
      ? new THREE.Vector2(
          across * (at[0] - view.axis) * view.metresPerPixel,
          (view.ground - at[1]) * view.metresPerPixel,
        )
      : null;
  };
  const world = new THREE.Vector3();
  const jointOf = (bone: THREE.Object3D) => {
    bone.getWorldPosition(world);
    return new THREE.Vector2(world.x, world.y);
  };
  const similarityOf = (bone: THREE.Object3D): Similarity => {
    const target = painted(bone.name)!;
    const joint = jointOf(bone);
    const children = bone.children.filter((child) => painted(child.name));
    let a = 1;
    let b = 0;
    if (children.length === 1) {
      const from = jointOf(children[0]).sub(joint);
      const to = painted(children[0].name)!.sub(target);
      const scale = THREE.MathUtils.clamp(to.length() / Math.max(1e-4, from.length()), 0.75, 1.3);
      const angle = Math.atan2(to.y, to.x) - Math.atan2(from.y, from.x);
      a = scale * Math.cos(angle);
      b = scale * Math.sin(angle);
    }
    return [a, b, target.x - (a * joint.x - b * joint.y), target.y - (b * joint.x + a * joint.y)];
  };
  const boneMove = posed.skeleton.bones.map((bone): Similarity => {
    let current: THREE.Object3D | null = bone;
    while (current && (current as THREE.Bone).isBone) {
      if (painted(current.name)) return similarityOf(current);
      current = current.parent;
    }
    return [1, 0, 0, 0];
  });
  const skinIndex = geometry.attributes.skinIndex;
  const skinWeight = geometry.attributes.skinWeight;
  const shift = new Float32Array(skinIndex.count * 2);
  for (let i = 0; i < skinIndex.count; i++) {
    const x = posedPositions[i * 3];
    const y = posedPositions[i * 3 + 1];
    for (let k = 0; k < 4; k++) {
      const w = skinWeight.getComponent(i, k);
      if (w <= 0) continue;
      const [a, b, tx, ty] = boneMove[skinIndex.getComponent(i, k)];
      shift[i * 2] += w * (a * x - b * y + tx - x);
      shift[i * 2 + 1] += w * (b * x + a * y + ty - y);
    }
  }
  return shift;
}

/**
 * Adds the attributes the painted wizard material reads: `uvFront`, `uvSide`, `uvBack` (atlas UVs)
 * and `paintWeights` (how much of each view, and how much painting over the palette colour).
 * Vertices in `unpaintedGroups` (glows) keep their own colour.
 */
export function projectTurnaround(
  geometry: THREE.BufferGeometry,
  turnaround: Turnaround,
  poses: TurnaroundPoses,
  unpaintedGroups: number[] = [],
) {
  const smooth = smoothNormals(geometry);
  const front = skinTo(smooth, poses.front);
  const neutral = skinTo(smooth, poses.neutral);
  const frontMove = jointShift(smooth, front.positions, front.posed, turnaround, "front");
  const backMove = jointShift(smooth, neutral.positions, neutral.posed, turnaround, "back");
  smooth.dispose();
  const count = geometry.attributes.position.count;
  const triangles = count / 3;

  const showsLeft = (turnaround.views.side.facing ?? "left") === "left";
  const sideAcross = (_x: number, _y: number, z: number) => (showsLeft ? -z : z);
  const projections = {
    front: toPicturePlane(front.positions, front.normals, (x) => x, (_x, _y, z) => z, frontMove),
    back: toPicturePlane(neutral.positions, neutral.normals, (x) => -x, (_x, _y, z) => -z, backMove),
    // the side view seen from the wizard's left (+X) and from its right (-X); the wizard's front runs
    // towards the picture's left or right, as painted
    left: toPicturePlane(neutral.positions, neutral.normals, sideAcross, (x) => x),
    right: toPicturePlane(neutral.positions, neutral.normals, sideAcross, (x) => -x),
  };
  const buffers = {
    front: new DepthBuffer(projections.front, triangles),
    back: new DepthBuffer(projections.back, triangles),
    left: new DepthBuffer(projections.left, triangles),
    right: new DepthBuffer(projections.right, triangles),
  };

  const unpainted = new Uint8Array(count);
  geometry.groups.forEach((group, index) => {
    if (!unpaintedGroups.includes(group.materialIndex ?? index)) return;
    // the merged geometry is not indexed: group ranges are vertex ranges
    unpainted.fill(1, group.start, group.start + group.count);
  });

  const [atlasWidth, atlasHeight] = turnaround.size;
  const toAtlas = (view: TurnaroundView, across: number, up: number, out: Float32Array, i: number) => {
    const sheetX = view.axis + across / view.metresPerPixel;
    const sheetY = view.ground - up / view.metresPerPixel;
    out[i * 2] = (sheetX + view.offset[0]) / atlasWidth;
    out[i * 2 + 1] = 1 - (sheetY + view.offset[1]) / atlasHeight;
  };

  // a view only counts where it really has paint, so one that lands beside its painted figure gives
  // way to the others. This is applied per vertex: switching views per pixel makes tiny triangles
  // flicker between neighbouring paint and the outline around it.
  const mask = turnaround.paintMask;
  const maskBytes = Uint8Array.from(atob(mask.data), (c) => c.charCodeAt(0));
  const maskCell = (x: number, y: number) =>
    maskBytes[
      THREE.MathUtils.clamp(y, 0, mask.height - 1) * mask.width + THREE.MathUtils.clamp(x, 0, mask.width - 1)
    ] / 255;
  const hasPaint = (uv: Float32Array, i: number) => {
    const x = uv[i * 2] * mask.width - 0.5;
    const y = (1 - uv[i * 2 + 1]) * mask.height - 0.5;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const top = maskCell(x0, y0) * (1 - fx) + maskCell(x0 + 1, y0) * fx;
    const bottom = maskCell(x0, y0 + 1) * (1 - fx) + maskCell(x0 + 1, y0 + 1) * fx;
    const paint = top * (1 - fy) + bottom * fy;
    return THREE.MathUtils.smoothstep(paint, 0.05, 0.9) + 0.01;
  };

  const uvFront = new Float32Array(count * 2);
  const uvSide = new Float32Array(count * 2);
  const uvBack = new Float32Array(count * 2);
  const weights = new Float32Array(count * 4);
  const facing = (a: number) => Math.pow(Math.abs(a), FACING_POWER);
  for (let i = 0; i < count; i++) {
    const f = projections.front.positions;
    const b = projections.back.positions;
    const l = projections.left.positions;
    toAtlas(turnaround.views.front, f[i * 3], f[i * 3 + 1], uvFront, i);
    toAtlas(turnaround.views.back, b[i * 3], b[i * 3 + 1], uvBack, i);
    toAtlas(turnaround.views.side, l[i * 3], l[i * 3 + 1], uvSide, i);
    if (unpainted[i]) continue;

    const seen = (name: keyof typeof projections) => {
      const p = projections[name].positions;
      return buffers[name].sees(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    };
    const nFront = front.normals;
    const nNeutral = neutral.normals;
    const wFront = seen("front") ? facing(nFront[i * 3 + 2]) * hasPaint(uvFront, i) : 0;
    // facing ignores the normal's sign (sheets and decals face either way); the depth test is what
    // keeps a view off surfaces turned away from it
    const wBack = seen("back") ? facing(nNeutral[i * 3 + 2]) * hasPaint(uvBack, i) : 0;
    const sideX = nNeutral[i * 3];
    const wLeft = seen("left") ? facing(sideX) * (showsLeft ? 1 : MIRRORED_SIDE_WEIGHT) : 0;
    const wRight = seen("right") ? facing(sideX) * (showsLeft ? MIRRORED_SIDE_WEIGHT : 1) : 0;
    const wSide = Math.max(wLeft, wRight) * hasPaint(uvSide, i);
    const total = wFront + wSide + wBack;
    if (total <= 1e-5) continue;
    weights[i * 4] = wFront / total;
    weights[i * 4 + 1] = wSide / total;
    weights[i * 4 + 2] = wBack / total;
    weights[i * 4 + 3] = THREE.MathUtils.smoothstep(total, 0.0005, 0.005);
  }

  geometry.setAttribute("uvFront", new THREE.BufferAttribute(uvFront, 2));
  geometry.setAttribute("uvSide", new THREE.BufferAttribute(uvSide, 2));
  geometry.setAttribute("uvBack", new THREE.BufferAttribute(uvBack, 2));
  geometry.setAttribute("paintWeights", new THREE.BufferAttribute(weights, 4));
  return geometry;
}

/**
 * Makes a standard material paint itself from the turnaround atlas using the attributes above.
 * Its vertex colour shows where no view reaches. `selfLight` lets the colours glow faintly so the
 * painting reads at night.
 */
export function paintWithTurnaround(
  material: THREE.MeshStandardMaterial,
  atlas: THREE.Texture,
  selfLight: number,
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.turnaround = { value: atlas };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec2 uvFront;
        attribute vec2 uvSide;
        attribute vec2 uvBack;
        attribute vec4 paintWeights;
        varying vec2 vUvFront;
        varying vec2 vUvSide;
        varying vec2 vUvBack;
        varying vec4 vPaintWeights;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vUvFront = uvFront;
        vUvSide = uvSide;
        vUvBack = uvBack;
        vPaintWeights = paintWeights;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D turnaround;
        varying vec2 vUvFront;
        varying vec2 vUvSide;
        varying vec2 vUvBack;
        varying vec4 vPaintWeights;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 painted = texture2D(turnaround, vUvFront).rgb * vPaintWeights.x
          + texture2D(turnaround, vUvSide).rgb * vPaintWeights.y
          + texture2D(turnaround, vUvBack).rgb * vPaintWeights.z;
        diffuseColor.rgb = mix(diffuseColor.rgb, painted, vPaintWeights.w);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * ${selfLight.toFixed(2)};`,
      );
  };
  material.customProgramCacheKey = () => `wizard-turnaround-${selfLight}`;
  return material;
}
