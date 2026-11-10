"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { wizardById } from "@/phone/content";
import { useFeedback } from "@/phone/feedback";
import type { Seat } from "@/phone/session/types";
import { CheckRune } from "./Glyphs";

const SEATS = 4;

function statusLine(seats: Seat[], youId: string) {
  const you = seats.find((seat) => seat.id === youId);
  if (!you?.wizard) return "Choose a wizard, then bind your wand.";
  const choosing = seats.find((seat) => !seat.wizard);
  if (choosing) return `Waiting for ${choosing.name} to choose…`;
  if (!you.ready) return "Tap the seal when you're ready to duel.";
  const waiting = seats.filter((seat) => !seat.ready);
  if (waiting.length === 1) return `Waiting for ${waiting[0].name}…`;
  if (waiting.length) return "Waiting for wizards to be ready…";
  return "All wizards bound. The host is starting…";
}

/** Leaving takes two taps, so a stray thumb doesn't drop you out of the room. */
function LeaveLink({ onLeave }: { onLeave(): void }) {
  const { sound } = useFeedback();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <button
      type="button"
      className={`ph-leave${armed ? " armed" : ""}`}
      onClick={() => {
        if (armed) {
          sound.back();
          onLeave();
        } else {
          sound.hover();
          setArmed(true);
        }
      }}
    >
      {armed ? "Tap again to leave" : "Leave room"}
    </button>
  );
}

export default function LobbyDock({
  seats,
  youId,
  onReady,
  onLeave,
}: {
  seats: Seat[];
  youId: string;
  onReady(ready: boolean): void;
  onLeave(): void;
}) {
  const { sound, haptic } = useFeedback();
  const you = seats.find((seat) => seat.id === youId);
  const ready = !!you?.ready;
  const canReady = !!you?.wizard;
  const allBound = seats.length > 1 && seats.every((seat) => seat.ready);

  return (
    <footer className={`ph-dock${allBound ? " all-bound" : ""}`}>
      <ul className="ph-party" aria-label="Wizards in the room">
        {Array.from({ length: SEATS }, (_, index) => {
          const seat = seats[index];
          if (!seat)
            return (
              <li key={`open-${index}`} className="ph-sigil open">
                <span className="ph-sigil-ring" />
                <span className="ph-sigil-name">Open</span>
              </li>
            );
          const wizard = seat.wizard ? wizardById(seat.wizard) : null;
          return (
            <li
              key={seat.id}
              className={`ph-sigil${seat.ready ? " ready" : ""}${seat.id === youId ? " you" : ""}${wizard ? "" : " choosing"}`}
              style={
                wizard ? ({ "--k": wizard.swatch } as CSSProperties) : undefined
              }
              aria-label={`${seat.name}${seat.id === youId ? " (you)" : ""}: ${
                wizard ? wizard.name : "choosing"
              }, ${seat.ready ? "ready" : "not ready"}`}
            >
              <span
                className="ph-sigil-ring"
                style={
                  wizard
                    ? { backgroundImage: `url(${wizard.portrait})` }
                    : undefined
                }
              >
                {wizard ? null : <span className="ph-sigil-q">?</span>}
              </span>
              {seat.ready ? (
                <span className="ph-sigil-check">
                  <CheckRune />
                </span>
              ) : null}
              <span className="ph-sigil-name">
                {seat.id === youId ? "You" : seat.name}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="ph-dock-row">
        <div className="ph-dock-text">
          <p className="ph-dock-status" role="status" aria-live="polite">
            {statusLine(seats, youId)}
          </p>
          <LeaveLink onLeave={onLeave} />
        </div>
        <button
          type="button"
          className={`ph-seal-btn${ready ? " bound" : ""}`}
          style={
            you?.wizard
              ? ({ "--k": wizardById(you.wizard).swatch } as CSSProperties)
              : undefined
          }
          disabled={!canReady}
          aria-pressed={ready}
          onClick={() => {
            onReady(!ready);
            if (ready) sound.back();
            else {
              sound.surge();
              haptic([30, 50, 60]);
            }
          }}
        >
          <span className="ph-seal-btn-ring" aria-hidden="true" />
          <span className="ph-seal-btn-label">
            {ready ? (
              <>
                <CheckRune />
                Bound
              </>
            ) : (
              <>
                I&rsquo;m
                <br />
                ready
              </>
            )}
          </span>
        </button>
      </div>
    </footer>
  );
}
