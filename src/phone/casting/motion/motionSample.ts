/**
 * Raw phone motion readings and the per-sample values the move classifier
 * reads. Pure maths: no DOM, so simulated phones can be fed to it.
 * Ported from the Aetherwyn game's recognition package (motion-sample.ts).
 */

/** A 3D vector in the phone's frame: x to the screen's right, y to its top, z out of the screen. */
export type Vec3 = readonly [number, number, number];

/** `DeviceMotionEvent.rotationRate`, in degrees per second. */
export interface RotationRate {
  readonly alpha: number;
  readonly beta: number;
  readonly gamma: number;
}

/** One `devicemotion` reading. */
export interface MotionSample {
  readonly rotationRate: RotationRate;
  /** Acceleration without gravity (m/s²), when the phone separates it itself. */
  readonly acceleration: Vec3 | null;
  /** Acceleration including gravity (m/s²); at rest it points up. */
  readonly accelerationIncludingGravity: Vec3;
  /** Milliseconds since the previous reading. */
  readonly dtMs: number;
}

/**
 * iPhone (WebKit) labels rotation rates by axis order: alpha = x, beta = y,
 * gamma = z. The standard (and Android Chrome) says beta = x, gamma = y,
 * alpha = z. This puts an iPhone reading into the standard order. Checked on
 * real iPhone recordings: with it, the rotation explains how gravity moved
 * (correlation 0.97); without it, it doesn't (≈ 0).
 */
export const fromIosRotation = ({
  alpha,
  beta,
  gamma,
}: RotationRate): RotationRate => ({ alpha: gamma, beta: alpha, gamma: beta });

/** What the classifier reads from one sample, in the phone's frame. */
export interface MotionFrame {
  /** Unit vector pointing up (away from the floor). */
  readonly up: Vec3;
  /** Linear acceleration, gravity removed (m/s²). */
  readonly linear: Vec3;
  /** Rotation rate as a vector about x, y, z (degrees per second). */
  readonly rotation: Vec3;
  /** Seconds this sample stands for. */
  readonly dt: number;
}

export const dot = (a: Vec3, b: Vec3) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const length = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
export const scale = (v: Vec3, s: number): Vec3 => [
  v[0] * s,
  v[1] * s,
  v[2] * s,
];
export const subtract = (a: Vec3, b: Vec3): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const normalise = (v: Vec3): Vec3 => {
  const l = length(v);
  return l === 0 ? v : scale(v, 1 / l);
};

/** Gravity time constant for phones that don't split gravity from motion themselves. */
const GRAVITY_TAU_MS = 250;
/** Samples further apart than this are a stall: count them as a normal step. */
const MAX_STEP_MS = 100;
const NOMINAL_STEP_MS = 1000 / 60;

/**
 * Turns readings into frames. Gravity is the phone's own split when it gives
 * one, else a low-pass of the raw reading. Some browsers report every
 * acceleration negated; a wand is held screen up or towards the player with
 * its top not at the floor, so "up" has a positive y + z at the start, and the
 * whole stroke is flipped if it doesn't.
 */
export function toFrames(samples: readonly MotionSample[]): MotionFrame[] {
  let gravity: Vec3 | null = null;
  let sign = 0;
  return samples.map(
    ({
      rotationRate,
      acceleration,
      accelerationIncludingGravity: raw,
      dtMs,
    }) => {
      const stepMs = dtMs > 0 && dtMs <= MAX_STEP_MS ? dtMs : NOMINAL_STEP_MS;
      if (acceleration) {
        gravity = subtract(raw, acceleration);
      } else {
        const g: Vec3 = gravity ?? raw;
        const k = gravity ? 1 - Math.exp(-stepMs / GRAVITY_TAU_MS) : 1;
        gravity = [
          g[0] + k * (raw[0] - g[0]),
          g[1] + k * (raw[1] - g[1]),
          g[2] + k * (raw[2] - g[2]),
        ];
      }
      if (sign === 0) sign = gravity[1] + gravity[2] < 0 ? -1 : 1;
      return {
        up: normalise(scale(gravity, sign)),
        linear: scale(subtract(raw, gravity), sign),
        rotation: [rotationRate.beta, rotationRate.gamma, rotationRate.alpha],
        dt: stepMs / 1000,
      };
    },
  );
}
