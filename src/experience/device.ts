export type QualityTier = "high" | "low";

function readQualityOverride() {
  try {
    return (
      new URLSearchParams(location.search).get("quality") ||
      (location.hash.match(/quality-(high|low)/) || [])[1]
    );
  } catch {
    return null;
  }
}

export function detectDevice() {
  const isCoarsePointer = matchMedia("(pointer: coarse)").matches;
  const override = readQualityOverride();
  const isLowPowerDevice =
    isCoarsePointer ||
    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ||
    (navigator.hardwareConcurrency || 8) <= 4;
  const qualityTier: QualityTier =
    override === "high" || override === "low"
      ? override
      : isLowPowerDevice
        ? "low"
        : "high";
  return {
    prefersReducedMotion: matchMedia("(prefers-reduced-motion: reduce)")
      .matches,
    isCoarsePointer,
    qualityTier,
  };
}

export type DeviceProfile = ReturnType<typeof detectDevice>;

/** localStorage that keeps working, without saving, when the browser blocks storage. */
export const safeStorage = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage blocked */
    }
  },
};
