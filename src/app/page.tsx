"use client";

import { use, useEffect, useLayoutEffect, useState } from "react";
import { browser } from "react-dom";
import JoinScreen from "@/components/JoinScreen";
import LoadingScreen from "@/components/LoadingScreen";
import LobbyScreen from "@/components/LobbyScreen";
import MainMenuScreen from "@/components/MainMenuScreen";
import TrainingScreen from "@/components/TrainingScreen";
import { startExperience } from "@/experience/startExperience";

function loaderCssAnimations() {
  const animations =
    document.getElementById("loader")?.getAnimations({ subtree: true }) ?? [];
  return animations.filter((animation) => animation instanceof CSSAnimation);
}

/** Call while the fallback is still in the DOM, which is during the page's first render. */
function readLoaderAnimationStartTimes() {
  return loaderCssAnimations().map((animation) => animation.startTime);
}

/*
 * React replaces the loading.tsx fallback with a new loader element, and new elements restart
 * their CSS animations. Copying the fallback's start times keeps the sigil turning without a jump.
 * Call in a layout effect, so the new loader never paints at the wrong point in its animations.
 */
function continueLoaderAnimations(
  startTimes: ReadonlyArray<CSSNumberish | null>,
) {
  const animations = loaderCssAnimations();
  if (animations.length !== startTimes.length) return;
  animations.forEach((animation, index) => {
    const startTime = startTimes[index];
    if (startTime !== null) animation.startTime = startTime;
  });
}

export default function HomePage() {
  // Suspends during prerendering, which makes app/loading.tsx the page's initial HTML.
  use(
    browser(
      "The experience draws to a WebGL canvas, which only exists in the browser.",
    ),
  );

  const [fallbackAnimationStartTimes] = useState(readLoaderAnimationStartTimes);
  useLayoutEffect(
    () => continueLoaderAnimations(fallbackAnimationStartTimes),
    [fallbackAnimationStartTimes],
  );

  useEffect(() => startExperience(), []);

  return (
    <>
      <canvas
        className="fixed inset-0 block h-full w-full touch-none"
        id="stage"
        aria-hidden="true"
      />
      <div className="shade" />
      <div className="veil" id="veil" />
      <div className="pointer-events-none fixed top-[calc(env(safe-area-inset-top,0px)+14px)] right-[max(16px,env(safe-area-inset-right,0px))] left-[max(16px,env(safe-area-inset-left,0px))] z-5 flex items-center justify-between *:pointer-events-auto">
        <button className="icon-btn" id="back" hidden aria-label="Back">
          <svg viewBox="0 0 24 24">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          <span className="label">Back</span>{" "}
          <span className="label font-body text-[0.8rem] tracking-normal normal-case opacity-70">
            Esc
          </span>
        </button>
        <span />
        <button
          className="icon-btn"
          id="sound"
          aria-pressed="true"
          aria-label="Sound on"
        >
          <svg viewBox="0 0 24 24" id="sound-icon">
            <path d="M4 9h4l5-4v14l-5-4H4z" />
            <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
          </svg>
          <span className="label" id="sound-label">
            Sound
          </span>
        </button>
      </div>
      <MainMenuScreen />
      <LobbyScreen />
      <JoinScreen />
      <TrainingScreen />
      <div className="toast" id="toast" role="status" aria-live="polite" />
      <LoadingScreen />
    </>
  );
}
