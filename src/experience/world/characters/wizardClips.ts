import * as THREE from "three";
import type { WizardClass, WizardClassId } from "./wizardClasses";
import { REST_POSITION, type BoneName, type Vec3 } from "./wizardRig";

/**
 * A pose: rotations in radians (x, y, z) for any of the animated bones, plus an optional offset
 * of the hips in metres. Bones left out fall back to the class's stance.
 *
 * Reading the numbers, for a wizard facing +Z with arms hanging:
 *   x: negative swings a limb forward, positive back (knees bend with positive x)
 *   y: positive turns towards the wizard's left
 *   z: positive lifts the left arm sideways; negative lifts the right arm
 */
export type Pose = Partial<Record<BoneName | "hipsOffset", Vec3>>;
type Ease = (k: number) => number;
/** Time in seconds, the pose to reach, and how to ease into it. */
type Key = [time: number, pose: Pose, ease?: Ease];

const ANIMATED_BONES: BoneName[] = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "upperArmL",
  "foreArmL",
  "handL",
  "upperArmR",
  "foreArmR",
  "handR",
  "upperLegL",
  "lowerLegL",
  "footL",
  "upperLegR",
  "lowerLegR",
  "footR",
];
const POSE_KEYS: (BoneName | "hipsOffset")[] = [...ANIMATED_BONES, "hipsOffset"];
const FRAMES_PER_SECOND = 24;
const ZERO: Vec3 = [0, 0, 0];

/** The moment in the cast clip when the spell leaves the wizard. */
export const CAST_RELEASE_SECONDS = 0.62;

const easeInOut: Ease = (k) => k * k * (3 - 2 * k);
const easeOut: Ease = (k) => 1 - Math.pow(1 - k, 3);
const easeOutBack: Ease = (k) =>
  1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);

/** The stance every class shares before its own overrides: arms a little out, feet apart. */
export const BASE_STANCE: Pose = {
  upperLegL: [0, 0, 0.07],
  upperLegR: [0, 0, -0.07],
  footL: [0, 0.22, -0.07],
  footR: [0, -0.22, 0.07],
  upperArmL: [0.05, 0, 0.14],
  foreArmL: [-0.3, 0, 0],
  upperArmR: [0.05, 0, -0.14],
  foreArmR: [-0.3, 0, 0],
};

/** How each class stands and carries its gear. */
const STANCES: Record<WizardClassId, Pose> = {
  // flame held up in the left palm, wand low in the right hand
  mage: {
    hips: [0, -0.12, 0.03],
    chest: [-0.03, 0.1, 0],
    head: [0, 0.06, 0],
    upperArmL: [-0.15, 0, 0.55],
    foreArmL: [-1.2, 0, 0],
    upperArmR: [0.1, 0, -0.22],
    foreArmR: [-0.45, 0, 0],
  },
  // staff planted on the right, ward raised on the left
  guardian: {
    chest: [-0.05, 0, 0],
    upperLegL: [0, 0, 0.11],
    upperLegR: [0, 0, -0.11],
    footL: [0, 0.25, -0.11],
    footR: [0, -0.25, 0.11],
    upperArmR: [-0.5, 0, -0.3],
    foreArmR: [-0.8, 0, 0],
    handR: [1.3, 0, 0.3],
    upperArmL: [-0.35, 0, 0.25],
    foreArmL: [-1.15, 0.3, 0],
  },
  // crescent staff in the left hand, right arm at the side (as on the concept sheet)
  mystic: {
    hips: [0, 0.08, -0.02],
    head: [0.03, -0.08, 0.04],
    upperArmL: [-0.5, 0, 0.3],
    foreArmL: [-0.8, 0, 0],
    handL: [1.3, 0, -0.3],
    upperArmR: [0.05, 0, -0.2],
    foreArmR: [-0.3, 0, 0],
  },
  // grimoire carried at the hip in the left hand, right arm at the side (as on the concept sheet)
  scholar: {
    chest: [0.04, 0.05, 0],
    head: [0.06, 0.08, 0],
    upperArmL: [-0.1, 0, 0.14],
    foreArmL: [-0.75, 0, 0],
    upperArmR: [0.05, 0, -0.15],
    foreArmR: [-0.3, 0, 0],
  },
};

const mirrorName = (name: BoneName | "hipsOffset") =>
  (name.endsWith("L")
    ? name.slice(0, -1) + "R"
    : name.endsWith("R")
      ? name.slice(0, -1) + "L"
      : name) as BoneName | "hipsOffset";

/** The same pose for the other side of the body. */
function mirrorPose(pose: Pose): Pose {
  const mirrored: Pose = {};
  for (const key of POSE_KEYS) {
    const value = pose[key];
    if (!value) continue;
    mirrored[mirrorName(key)] =
      key === "hipsOffset"
        ? [-value[0], value[1], value[2]]
        : [value[0], -value[1], -value[2]];
  }
  return mirrored;
}

/** A pose over time that eases from key to key. */
function keyed(stance: Pose, keys: Key[]) {
  const valueOf = (pose: Pose, key: BoneName | "hipsOffset") =>
    pose[key] ?? stance[key] ?? ZERO;
  return (time: number): Pose => {
    let next = keys.findIndex(([keyTime]) => keyTime >= time);
    if (next < 0) next = keys.length - 1;
    const previous = Math.max(0, next - 1);
    const [fromTime, fromPose] = keys[previous];
    const [toTime, toPose, ease = easeInOut] = keys[next];
    const k =
      toTime > fromTime
        ? ease(THREE.MathUtils.clamp((time - fromTime) / (toTime - fromTime), 0, 1))
        : 1;
    const pose: Pose = {};
    for (const key of POSE_KEYS) {
      const from = valueOf(fromPose, key);
      const to = valueOf(toPose, key);
      pose[key] = [
        from[0] + (to[0] - from[0]) * k,
        from[1] + (to[1] - from[1]) * k,
        from[2] + (to[2] - from[2]) * k,
      ];
    }
    return pose;
  };
}

const euler = new THREE.Euler();
const quaternion = new THREE.Quaternion();

/** Bakes a pose-over-time function into a three.js clip on the wizard skeleton. */
function bakeClip(name: string, seconds: number, poseAt: (time: number) => Pose) {
  const frameCount = Math.round(seconds * FRAMES_PER_SECOND) + 1;
  const times = Array.from(
    { length: frameCount },
    (_, frame) => (frame / (frameCount - 1)) * seconds,
  );
  const poses = times.map(poseAt);
  const tracks: THREE.KeyframeTrack[] = ANIMATED_BONES.map((bone) => {
    const values: number[] = [];
    poses.forEach((pose) => {
      const [x, y, z] = pose[bone] ?? ZERO;
      quaternion.setFromEuler(euler.set(x, y, z));
      values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    });
    return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
  });
  const [hipsX, hipsY, hipsZ] = REST_POSITION.hips;
  tracks.push(
    new THREE.VectorKeyframeTrack(
      "hips.position",
      times,
      poses.flatMap((pose) => {
        const [x, y, z] = pose.hipsOffset ?? ZERO;
        return [hipsX + x, hipsY + y, hipsZ + z];
      }),
    ),
  );
  return new THREE.AnimationClip(name, seconds, tracks);
}

const IDLE_SECONDS = 6;

/** Breathing, a slow weight shift and small arm drift, layered on the class stance. */
function idlePose(stance: Pose) {
  const rest = keyed(stance, [[0, {}]]);
  return (time: number): Pose => {
    const pose = rest(time);
    const breath = Math.sin((time / 3) * Math.PI * 2);
    const lateBreath = Math.sin((time / 3) * Math.PI * 2 - 0.9);
    const sway = Math.sin((time / IDLE_SECONDS) * Math.PI * 2);
    const drift = Math.sin((time / IDLE_SECONDS) * Math.PI * 2 + 1.3);
    const nudge = (key: BoneName | "hipsOffset", x: number, y: number, z: number) => {
      const [baseX, baseY, baseZ] = pose[key] ?? ZERO;
      pose[key] = [baseX + x, baseY + y, baseZ + z];
    };
    nudge("hipsOffset", 0.012 * sway, 0.005 * breath - 0.004, 0);
    nudge("hips", 0, 0.02 * drift, -0.02 * sway);
    nudge("spine", -0.012 * breath, 0, 0.02 * sway);
    nudge("chest", -0.03 * breath, -0.02 * drift, 0);
    nudge("head", 0.02 * breath, 0.05 * drift, 0);
    nudge("upperLegL", 0, 0, 0.006 * sway);
    nudge("upperLegR", 0, 0, 0.006 * sway);
    nudge("upperArmL", 0.02 * lateBreath, 0, 0.02 * breath);
    nudge("upperArmR", 0.02 * lateBreath, 0, -0.02 * breath);
    nudge("foreArmL", 0.045 * lateBreath, 0, 0);
    nudge("foreArmR", 0.045 * lateBreath, 0, 0);
    return pose;
  };
}

/** Rises from a crouch, throws the arms wide, then settles into the stance. */
const enterKeys = (stance: Pose): Key[] => {
  const crouch: Pose = {
    hipsOffset: [0, -0.3, 0],
    spine: [0.5, 0, 0],
    chest: [0.3, 0, 0],
    head: [0.45, 0, 0],
    upperLegL: [-1.1, 0, 0.1],
    lowerLegL: [1.9, 0, 0],
    footL: [-0.8, 0.22, -0.07],
    upperLegR: [-1.1, 0, -0.1],
    lowerLegR: [1.9, 0, 0],
    footR: [-0.8, -0.22, 0.07],
    upperArmL: [-0.3, 0, 0.12],
    foreArmL: [-1.6, 0, 0],
    upperArmR: [-0.3, 0, -0.12],
    foreArmR: [-1.6, 0, 0],
  };
  return [
    [0, crouch],
    [0.4, crouch],
    [
      0.95,
      {
        hipsOffset: [0, 0.02, 0],
        chest: [-0.16, 0, 0],
        head: [-0.2, 0, 0],
        upperArmL: [-0.1, 0, 1.05],
        foreArmL: [-0.35, 0, 0],
        upperArmR: [-0.1, 0, -1.05],
        foreArmR: [-0.35, 0, 0],
        footL: stance.footL,
        footR: stance.footR,
      },
      easeOutBack,
    ],
    [1.6, {}],
  ];
};

/** Wind-up, thrust and recovery, written for the right arm. */
const CAST_KEYS_RIGHT: Key[] = [
  [0, {}],
  [
    0.42,
    {
      hipsOffset: [0, -0.03, -0.03],
      hips: [0, -0.15, 0],
      spine: [0.05, -0.15, 0],
      chest: [0, -0.4, 0],
      head: [0, 0.4, 0],
      upperArmR: [0.7, 0, -0.7],
      foreArmR: [-1.7, 0, 0],
      upperLegL: [-0.25, 0, 0.07],
      lowerLegL: [0.45, 0, 0],
      footL: [-0.2, 0.22, -0.07],
      upperLegR: [-0.2, 0, -0.07],
      lowerLegR: [0.4, 0, 0],
      footR: [-0.2, -0.22, 0.07],
    },
  ],
  [
    CAST_RELEASE_SECONDS,
    {
      hipsOffset: [0, -0.02, 0.05],
      hips: [0, 0.1, 0],
      spine: [0.1, 0.12, 0],
      chest: [0.12, 0.35, 0],
      head: [-0.15, -0.3, 0],
      upperArmR: [-1.8, 0, -0.1],
      foreArmR: [-0.1, 0, 0],
      upperLegL: [-0.3, 0, 0.07],
      lowerLegL: [0.3, 0, 0],
      footL: [0, 0.22, -0.07],
      upperLegR: [0.2, 0, -0.07],
      lowerLegR: [0.1, 0, 0],
      footR: [-0.3, -0.22, 0.07],
    },
    easeOut,
  ],
  [
    0.95,
    {
      hipsOffset: [0, -0.02, 0.04],
      hips: [0, 0.08, 0],
      spine: [0.08, 0.1, 0],
      chest: [0.08, 0.28, 0],
      head: [-0.12, -0.25, 0],
      upperArmR: [-1.62, 0, -0.1],
      foreArmR: [-0.22, 0, 0],
      upperLegL: [-0.26, 0, 0.07],
      lowerLegL: [0.26, 0, 0],
      footL: [0, 0.22, -0.07],
      upperLegR: [0.16, 0, -0.07],
      lowerLegR: [0.1, 0, 0],
      footR: [-0.26, -0.22, 0.07],
    },
  ],
  [1.6, {}],
];

/** An idle break: a look over each shoulder, then up at the orb. */
const FLOURISH_KEYS: Key[] = [
  [0, {}],
  [0.6, { head: [0.05, 0.7, 0], chest: [0, 0.25, 0], spine: [0, 0.1, 0] }],
  [1.0, { head: [0.05, 0.7, 0], chest: [0, 0.25, 0], spine: [0, 0.1, 0] }],
  [1.6, { head: [-0.05, -0.6, 0], chest: [0, -0.2, 0], spine: [0, -0.08, 0] }],
  [2.1, { head: [-0.28, 0, 0], chest: [-0.1, 0, 0] }],
  [2.8, {}],
];

/** The class's held pose (radians per bone, plus the hips offset) that every clip settles into. */
export function classStance(wizardClass: WizardClass): Pose {
  return { ...BASE_STANCE, ...STANCES[wizardClass.id] };
}

/** Sets a skeleton's bones to a pose the same way the baked clips do (XYZ Euler, hips offset). */
export function applyPose(bones: Record<BoneName, THREE.Bone>, pose: Pose) {
  for (const bone of ANIMATED_BONES) {
    const [x, y, z] = pose[bone] ?? ZERO;
    bones[bone].quaternion.setFromEuler(euler.set(x, y, z));
  }
  const [hipsX, hipsY, hipsZ] = REST_POSITION.hips;
  const [x, y, z] = pose.hipsOffset ?? ZERO;
  bones.hips.position.set(hipsX + x, hipsY + y, hipsZ + z);
}

export function createWizardClips(wizardClass: WizardClass) {
  const stance = classStance(wizardClass);
  const castKeys =
    wizardClass.castArm === "R"
      ? CAST_KEYS_RIGHT
      : CAST_KEYS_RIGHT.map(
          ([time, pose, ease]): Key => [time, mirrorPose(pose), ease],
        );
  return {
    idle: bakeClip("idle", IDLE_SECONDS, idlePose(stance)),
    enter: bakeClip("enter", 1.6, keyed(stance, enterKeys(stance))),
    cast: bakeClip("cast", 1.6, keyed(stance, castKeys)),
    flourish: bakeClip("flourish", 2.8, keyed(stance, FLOURISH_KEYS)),
  };
}

export type WizardClips = ReturnType<typeof createWizardClips>;
