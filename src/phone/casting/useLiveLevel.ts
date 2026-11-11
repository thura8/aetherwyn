"use client";

import { useEffect, useRef } from "react";
import { levels } from "./mediaAccess";

export const readMotionLevel = () => levels.motion;
export const readMicLevel = () => levels.mic;

/**
 * Paints a live level (0..1) into a CSS custom property on the element every frame, without
 * re-rendering React. Meters read it with `var(--level)` (or the given property).
 */
export function useLiveLevel<TElement extends HTMLElement = HTMLDivElement>(
  read: () => number,
  active: boolean,
  property = "--level",
) {
  const ref = useRef<TElement>(null);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => {
      ref.current?.style.setProperty(property, read().toFixed(3));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [read, active, property]);
  return ref;
}
