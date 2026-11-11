import {
  fromIosRotation,
  type MotionSample,
  type Vec3,
} from "./motion/motionSample";
import { isIosWebKit } from "./platform";

/*
 * Motion and microphone access for the wand. Browsers only grant both on secure (https) pages,
 * and iPhone only shows its motion prompt from inside a tap, so request() must run in a tap handler.
 * Live levels are kept in plain fields (not React state) so meters can read them every frame.
 */

export type AccessState = "unknown" | "granted" | "denied" | "unavailable";

export interface MediaAccess {
  motion: AccessState;
  mic: AccessState;
  /** Why access is impossible here, if it is. */
  blockedReason: string | null;
}

type MotionPermissionApi = {
  requestPermission?: () => Promise<"granted" | "denied">;
};

let state: MediaAccess = {
  motion: "unknown",
  mic: "unknown",
  blockedReason: null,
};
const listeners = new Set<() => void>();
let initialised = false;

/** 0..1, smoothed. Read these from requestAnimationFrame loops. */
export const levels = { motion: 0, mic: 0 };
/** The latest acceleration without gravity, in m/s². */
export const motionSample = { x: 0, y: 0, z: 0, at: 0 };
const motionListeners = new Set<(sample: typeof motionSample) => void>();

/** Readings kept for the cast being held, or null between casts. */
let recording: MotionSample[] | null = null;
/** About ten seconds of readings: a cast never needs more. */
const MAX_RECORDED = 1000;
/** The move signal (|rotation| + 20·|push|) at which the motion meter reads full. */
const FULL_LEVEL = 400;

let micStream: MediaStream | null = null;
let micAudio: AudioContext | null = null;
let micAnalyser: AnalyserNode | null = null;
let micBuffer: Uint8Array<ArrayBuffer> | null = null;
let micFrame = 0;

function set(change: Partial<MediaAccess>) {
  state = { ...state, ...change };
  listeners.forEach((listener) => listener());
}

function init() {
  if (initialised || typeof window === "undefined") return;
  initialised = true;
  const secure = window.isSecureContext;
  const hasMotion = "DeviceMotionEvent" in window;
  const hasMic = !!navigator.mediaDevices?.getUserMedia;
  state = {
    motion: secure && hasMotion ? "unknown" : "unavailable",
    mic: secure && hasMic ? "unknown" : "unavailable",
    blockedReason: secure
      ? null
      : "This page isn't secure (https), so the phone keeps its motion sensor and microphone locked. You can still cast with the move buttons.",
  };
  // Android grants motion without a prompt; start listening so meters wake up straight away.
  const api =
    (window.DeviceMotionEvent as unknown as MotionPermissionApi | undefined) ??
    {};
  if (state.motion === "unknown" && typeof api.requestPermission !== "function")
    startMotion();
}

export function getMediaAccess() {
  init();
  return state;
}

const SERVER_STATE: MediaAccess = {
  motion: "unknown",
  mic: "unknown",
  blockedReason: null,
};
export const getServerMediaAccess = () => SERVER_STATE;

export function subscribeMediaAccess(listener: () => void) {
  init();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function onMotionSample(
  listener: (sample: typeof motionSample) => void,
) {
  motionListeners.add(listener);
  return () => motionListeners.delete(listener);
}

const isNumber = (n: number | null | undefined): n is number =>
  typeof n === "number";
const vector = (v: DeviceMotionEventAcceleration | null): Vec3 | null =>
  v && isNumber(v.x) && isNumber(v.y) && isNumber(v.z) ? [v.x, v.y, v.z] : null;

let motionStarted = false;
function startMotion() {
  if (motionStarted) return;
  motionStarted = true;
  const ios = isIosWebKit();
  let lastTime: number | null = null;
  window.addEventListener("devicemotion", (event) => {
    const rate = event.rotationRate;
    const withGravity = vector(event.accelerationIncludingGravity);
    // Only a gyroscope reading means a usable wand (laptops fire empty events).
    if (
      !rate ||
      !isNumber(rate.alpha) ||
      !isNumber(rate.beta) ||
      !isNumber(rate.gamma) ||
      !withGravity
    )
      return;
    if (state.motion !== "granted") set({ motion: "granted" });
    const dtMs = lastTime === null ? 0 : event.timeStamp - lastTime;
    lastTime = event.timeStamp;

    const acceleration = vector(event.acceleration);
    const push = acceleration
      ? Math.hypot(...acceleration)
      : Math.abs(Math.hypot(...withGravity) - 9.81);
    const turn = Math.hypot(rate.alpha, rate.beta, rate.gamma);
    levels.motion = Math.max(
      levels.motion * 0.82,
      Math.min(1, (turn + 20 * push) / FULL_LEVEL),
    );

    if (recording && recording.length < MAX_RECORDED) {
      const reported = {
        alpha: rate.alpha,
        beta: rate.beta,
        gamma: rate.gamma,
      };
      recording.push({
        rotationRate: ios ? fromIosRotation(reported) : reported,
        acceleration,
        accelerationIncludingGravity: withGravity,
        dtMs,
      });
    }

    const [x, y, z] = acceleration ?? [0, 0, 0];
    motionSample.x = x;
    motionSample.y = y;
    motionSample.z = z;
    motionSample.at = performance.now();
    motionListeners.forEach((listener) => listener(motionSample));
  });
}

/** Starts keeping motion readings for a cast; the returned function stops and hands them over. */
export function startRecording(): () => MotionSample[] {
  recording = [];
  return () => {
    const kept = recording ?? [];
    recording = null;
    return kept;
  };
}

/** Asks for motion. Call from a tap: iPhone ignores the request otherwise. */
export async function requestMotion() {
  init();
  if (state.motion === "unavailable" || state.motion === "granted")
    return state.motion;
  const api = window.DeviceMotionEvent as unknown as MotionPermissionApi;
  if (typeof api.requestPermission === "function") {
    try {
      const answer = await api.requestPermission();
      if (answer !== "granted") {
        set({ motion: "denied" });
        return "denied";
      }
      startMotion();
      set({ motion: "granted" });
      return "granted";
    } catch {
      set({ motion: "denied" });
      return "denied";
    }
  }
  startMotion();
  // Desktops expose the API but never fire events; call that unavailable after a moment.
  setTimeout(() => {
    if (state.motion === "unknown") set({ motion: "unavailable" });
  }, 1500);
  return state.motion;
}

export async function requestMic() {
  init();
  if (state.mic === "unavailable") return state.mic;
  if (micStream) return "granted";
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    const audio = new AudioContextClass();
    micAudio = audio;
    const source = audio.createMediaStreamSource(micStream);
    micAnalyser = audio.createAnalyser();
    micAnalyser.fftSize = 512;
    micBuffer = new Uint8Array(micAnalyser.fftSize);
    source.connect(micAnalyser);
    const read = () => {
      if (!micAnalyser || !micBuffer) return;
      micAnalyser.getByteTimeDomainData(micBuffer);
      let peak = 0;
      for (const value of micBuffer)
        peak = Math.max(peak, Math.abs(value - 128));
      levels.mic = Math.max(levels.mic * 0.86, Math.min(1, peak / 70));
      micFrame = requestAnimationFrame(read);
    };
    cancelAnimationFrame(micFrame);
    read();
    set({ mic: "granted" });
    return "granted";
  } catch {
    set({ mic: "denied" });
    return "denied";
  }
}

/**
 * Closes the level meter's microphone stream (access stays granted). A speech recogniser then
 * has the microphone to itself: on iPhone, two at once can leave the recogniser hearing nothing.
 */
export function releaseMicMeter() {
  cancelAnimationFrame(micFrame);
  micStream?.getTracks().forEach((track) => track.stop());
  void micAudio?.close();
  micStream = null;
  micAudio = null;
  micAnalyser = null;
  micBuffer = null;
  levels.mic = 0;
}
