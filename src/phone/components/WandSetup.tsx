"use client";

import { type CSSProperties, type ReactNode } from "react";
import {
  requestMic,
  requestMotion,
  type AccessState,
} from "@/phone/casting/mediaAccess";
import { useMediaAccess } from "@/phone/casting/useMediaAccess";
import {
  readMicLevel,
  readMotionLevel,
  useLiveLevel,
} from "@/phone/casting/useLiveLevel";
import { useFeedback } from "@/phone/feedback";
import { CheckRune, FiligreeFrame } from "./Glyphs";
import VoiceCheck from "./VoiceCheck";

const BARS = 16;

const STATUS: Record<Exclude<AccessState, "unknown">, string> = {
  granted: "Attuned",
  denied: "Blocked",
  unavailable: "Unavailable here",
};

function Step({
  rune,
  title,
  state,
  idle,
  hint,
  deniedHint,
  action,
  onRequest,
  children,
}: {
  rune: string;
  title: string;
  state: AccessState;
  /** Status text before the player asks. */
  idle: string;
  hint: string;
  deniedHint: string;
  action: string;
  onRequest(): void;
  children: ReactNode;
}) {
  return (
    <div className={`ph-step ${state}`}>
      <div className="ph-step-head">
        <span className="ph-step-rune" aria-hidden="true">
          {state === "granted" ? <CheckRune /> : rune}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="ph-step-title">{title}</h3>
          <p className="ph-step-status">
            {state === "unknown" ? idle : STATUS[state]}
          </p>
        </div>
        {state === "unknown" ? (
          <button
            type="button"
            className="btn small ph-step-btn"
            onClick={onRequest}
          >
            <span className="shine" />
            {action}
          </button>
        ) : null}
      </div>
      {state === "granted" ? (
        <>
          {children}
          <p className="ph-step-hint">{hint}</p>
        </>
      ) : state === "denied" ? (
        <p className="ph-step-hint">{deniedHint}</p>
      ) : null}
    </div>
  );
}

export default function WandSetup() {
  const access = useMediaAccess();
  const { sound, haptic } = useFeedback();
  const motionMeter = useLiveLevel(readMotionLevel, access.motion === "granted");
  const micMeter = useLiveLevel(readMicLevel, access.mic === "granted");

  const afterRequest = (result: AccessState) => {
    if (result === "granted") {
      sound.ignite();
      haptic(30);
    } else if (result === "denied") sound.error();
  };

  return (
    <section className="ph-wand" aria-label="Your wand">
      <div className="ph-carousel-head">
        <p className="eyebrow">Your phone is your wand</p>
        <h2 className="ph-heading">Attune your wand</h2>
      </div>

      <div className="ph-card ph-hold">
        <FiligreeFrame />
        <svg className="ph-hold-art" viewBox="0 0 80 96" aria-hidden="true">
          <path
            className="hand"
            d="M14 30a34 34 0 0 0 0 36M66 30a34 34 0 0 1 0 36"
          />
          <path className="hand" d="M10 34l4-4 4 4M70 34l-4-4-4 4" />
          <rect x="24" y="14" width="32" height="64" rx="6" />
          <rect
            x="28"
            y="20"
            width="24"
            height="50"
            rx="2"
            className="screen"
          />
          <circle cx="40" cy="56" r="5" className="thumb" />
        </svg>
        <div>
          <h3 className="ph-step-title">How to hold it</h3>
          <p className="ph-lead">
            Hold the phone upright, screen facing you. Keep your thumb on the
            screen while you shout the spell&rsquo;s word and swing, then let
            go.
          </p>
        </div>
      </div>

      {access.blockedReason ? (
        <p className="ph-notice">{access.blockedReason}</p>
      ) : null}

      <Step
        rune="ᚱ"
        title="Awaken motion"
        state={access.motion}
        idle="Not yet awakened"
        action="Awaken"
        hint="Swing the phone and watch the rune fill."
        deniedHint="Motion was refused. On iPhone, reload this page and tap Awaken again, then choose Allow."
        onRequest={() => void requestMotion().then(afterRequest)}
      >
        <div className="ph-meter" ref={motionMeter} aria-hidden="true">
          <span />
        </div>
      </Step>

      <Step
        rune="ᛟ"
        title="Attune voice"
        state={access.mic}
        idle="Not yet attuned"
        action="Attune"
        hint="Hold the button, say “Fire!” and let go: the phone checks it can hear the spell words."
        deniedHint="The microphone was refused. Allow it for this site in your browser's settings, then reload."
        onRequest={() => void requestMic().then(afterRequest)}
      >
        <div className="ph-wave" ref={micMeter} aria-hidden="true">
          {Array.from({ length: BARS }, (_, index) => (
            <span
              key={index}
              style={
                {
                  "--w": (
                    0.35 +
                    0.65 * Math.sin((index / (BARS - 1)) * Math.PI)
                  ).toFixed(2),
                } as CSSProperties
              }
            />
          ))}
        </div>
        <VoiceCheck />
      </Step>

      <p className="ph-foot">
        You&rsquo;ll practise Fire and Shield in training before the duel.
      </p>
    </section>
  );
}
