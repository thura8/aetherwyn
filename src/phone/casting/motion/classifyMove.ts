import { dot, length, normalise, toFrames } from "./motionSample";
import type { MotionFrame, MotionSample, Vec3 } from "./motionSample";

/*
 * Tells the practice moves apart from one held cast's motion readings:
 *
 *   SHAKE — the phone tips (or the hand bounces) back and forth several times;
 *   RAISE — the phone lifted up, like raising a torch. A wrist snap or a jab in any direction
 *           counts too: anything clearly moved that isn't a shake.
 *
 * Tuned to be easy: a relaxed lift or a slow shake counts. A move that sits between the two is
 * marked `borderline`, and the cast rule then reads it as whichever move the spoken spell needs.
 *
 * Adapted from the Aetherwyn game's six-move classifier (motion-classifier.ts), which was tuned on
 * real iPhone recordings: the same main-axis, swing and bounce measurements, read for two moves.
 * Pure: no sensors or DOM.
 */

export type MoveName = "raise" | "shake";

export const MOVE_LIMITS = {
  /** Lifting the phone counts as a raise at this upward acceleration (m/s², gravity removed). */
  minLift: 2.5,
  /** A turn counts as a raise when it goes at least this many degrees from where it started… */
  minTurnDegrees: 12,
  /** …and reach this speed (degrees per second), so just holding the phone never counts. */
  minTurnRate: 45,
  /** A jab of the hand in any direction (no turn needed) counts as a raise at this acceleration (m/s²). */
  minPush: 7,
  /** A back-and-forth counts as a shake swing when it turns at least this fast (degrees per second). */
  shakeSwingRate: 60,
  /** Swings that make a shake: two wiggles. A snap, its return and a rebound are only three. */
  shakeSwings: 4,
  /** A push of the hand up or down counts as a shake swing at this acceleration (m/s²). */
  shakeBounce: 3.5,
} as const;

/** What the phone measured, for feedback ("Felt: raise") and tuning. */
export interface MoveMeasurement {
  /** How far the phone turned at most (degrees about its main turn axis). */
  readonly turnDegrees: number;
  readonly peakTurnRate: number;
  /** Fast turns back and forth about the main axis. */
  readonly swings: number;
  /** Hard pushes up and down, alternating. */
  readonly bounces: number;
  /** The hardest push of the hand (m/s², gravity removed). */
  readonly peakPush: number;
  /** The hardest push upwards (m/s²): lifting the phone. */
  readonly peakLift: number;
}

export interface MoveReading {
  /** The move recognised, or null when the phone barely moved. */
  readonly move: MoveName | null;
  /** Between a raise and a shake (a bumpy raise, a half shake): the spoken spell decides. */
  readonly borderline: boolean;
  readonly measured: MoveMeasurement;
}

const L = MOVE_LIMITS;

export function classifyMove(samples: readonly MotionSample[]): MoveReading {
  const frames = toFrames(samples);
  const bounces = countBounces(frames);
  const axis = mainAxis(frames);

  let peakTurnRate = 0;
  let turnDegrees = 0;
  let swings = 0;
  if (axis) {
    let angle = 0;
    for (const { rotation, dt } of frames) {
      peakTurnRate = Math.max(peakTurnRate, length(rotation));
      angle += dot(rotation, axis) * dt;
      turnDegrees = Math.max(turnDegrees, Math.abs(angle));
    }
    swings = countSwings(frames, axis);
  }
  const peakPush = frames.reduce(
    (peak, f) => Math.max(peak, length(f.linear)),
    0,
  );
  const peakLift = frames.reduce(
    (peak, f) => Math.max(peak, dot(f.linear, f.up)),
    0,
  );
  const measured: MoveMeasurement = {
    turnDegrees,
    peakTurnRate,
    swings,
    bounces,
    peakPush,
    peakLift,
  };
  const turned = peakTurnRate >= L.minTurnRate;
  const backAndForth = Math.max(turned ? swings : 0, bounces);
  // Two or three swings: more than a clean raise (which speeds up, then stops), less than a shake.
  const borderline = backAndForth >= 2 && backAndForth < L.shakeSwings;

  // Shakes first: each wiggle may be small, and a bounce barely turns the phone.
  if (backAndForth >= L.shakeSwings)
    return { move: "shake", borderline, measured };
  if (
    peakLift >= L.minLift ||
    (turned && turnDegrees >= L.minTurnDegrees) ||
    peakPush >= L.minPush
  )
    return { move: "raise", borderline, measured };
  return { move: null, borderline: false, measured };
}

/** Hard pushes along "up", alternating up and down: the hand bouncing. */
function countBounces(frames: readonly MotionFrame[]): number {
  let bounces = 0;
  let direction = 0;
  for (const f of frames) {
    const push = dot(f.linear, f.up);
    if (Math.abs(push) < L.shakeBounce) continue;
    const sign = Math.sign(push);
    if (sign !== direction) {
      bounces++;
      direction = sign;
    }
  }
  return bounces;
}

/** Runs of turning one way about `axis` that get fast enough to count, alternating direction. */
function countSwings(frames: readonly MotionFrame[], axis: Vec3): number {
  let swings = 0;
  let direction = 0;
  for (const f of frames) {
    const r = dot(f.rotation, axis);
    if (Math.abs(r) < L.shakeSwingRate) continue;
    const sign = Math.sign(r);
    if (sign !== direction) {
      swings++;
      direction = sign;
    }
  }
  return swings;
}

/**
 * The turn's main axis: the dominant eigenvector of Σ ω ωᵀ dt, so a turn counts the same
 * whichever way (or back and forth) it goes. Null without any turning.
 */
function mainAxis(frames: readonly MotionFrame[]): Vec3 | null {
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const { rotation: w, dt } of frames) {
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) m[r * 3 + c] += w[r] * w[c] * dt;
  }
  const diagonal = [m[0], m[4], m[8]];
  const largest = diagonal.indexOf(Math.max(...diagonal));
  if (!(diagonal[largest] > 0)) return null;
  let v: Vec3 = [
    largest === 0 ? 1 : 0.1,
    largest === 1 ? 1 : 0.1,
    largest === 2 ? 1 : 0.1,
  ];
  for (let i = 0; i < 40; i++) {
    v = normalise([
      m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
      m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
      m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
    ]);
  }
  return v;
}
