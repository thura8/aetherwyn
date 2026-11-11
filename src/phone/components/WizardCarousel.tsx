"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { SPELLS, WIZARDS, type Wizard, type WizardId } from "@/phone/content";
import { useFeedback } from "@/phone/feedback";
import type { Seat } from "@/phone/session/types";
import { SpellGlyph } from "./Glyphs";
import { ElementBackdrop, Pedestal } from "./WizardArt";

/*
 * The wizards as a fan of cards on a turning arc. Drag or flick to spin it (it loops), tap a side
 * card to bring it forward, tap the centre card to choose. Cards fade out as they reach the corners.
 */

const COUNT = WIZARDS.length;
const STEP_DEG = 17;
/** Dragging this fraction of a card's width turns the fan by one card. */
const DRAG_PER_CARD = 0.85;
const TAP_SLOP = 8;
const FLICK_SPEED = 0.5; // px per ms

const AFFINITY_SPELL: Record<WizardId, (typeof SPELLS)[number]["id"]> = {
  mage: "flame-burst",
  guardian: "mystic-shield",
  mystic: "astral-wave",
  scholar: "arcane-bolt",
};

const shortName = (wizard: Wizard) => wizard.name.replace(/^The /, "");
const mod = (value: number, n: number) => ((value % n) + n) % n;
/** Signed distance from the fan's centre, wrapped so the four cards loop. */
const offsetOf = (index: number, position: number) =>
  mod(index - position + COUNT / 2, COUNT) - COUNT / 2;
const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

function cardStyle(d: number, swatch: string): CSSProperties {
  const distance = Math.abs(d);
  const opacity =
    distance <= 1
      ? 1 - 0.18 * distance
      : Math.max(0, (0.82 * (1.7 - distance)) / 0.7);
  return {
    "--k": swatch,
    "--d": d.toFixed(4),
    "--rot": `${(d * STEP_DEG).toFixed(3)}deg`,
    "--scale": (1 - Math.min(distance, 2) * 0.13).toFixed(4),
    "--dim": Math.min(distance, 1).toFixed(3),
    opacity: opacity.toFixed(3),
    zIndex: 10 - Math.round(distance * 3),
    visibility: opacity <= 0.01 ? "hidden" : "visible",
  } as CSSProperties;
}

function FanCard({
  wizard,
  d,
  owner,
  isYours,
  stamp,
}: {
  wizard: Wizard;
  d: number;
  owner: Seat | undefined;
  isYours: boolean;
  stamp: number;
}) {
  const centred = Math.abs(d) < 0.5;
  const state = isYours ? "yours" : owner ? "taken" : "free";
  return (
    <div
      className={`ph-fcard ${state}${centred ? " on" : ""}`}
      style={cardStyle(d, wizard.swatch)}
      data-index={WIZARDS.indexOf(wizard)}
      role="option"
      aria-selected={centred}
      aria-label={`${wizard.name}${isYours ? ", your wizard" : owner ? `, claimed by ${owner.name}` : ""}`}
    >
      <div className="ph-fcard-face">
        <ElementBackdrop wizard={wizard.id} />
        <Pedestal />
        {/* Centred by layout, not a percentage shift, so it is right before the image has loaded. */}
        <span
          className="ph-fcard-stand"
          style={
            {
              "--nudge": `${((0.5 - wizard.bodyCenter) * 100).toFixed(1)}%`,
            } as CSSProperties
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- static art, no optimiser needed */}
          <img
            className="ph-fcard-figure"
            src={wizard.cutout}
            width={wizard.cutoutSize.width}
            height={wizard.cutoutSize.height}
            alt=""
            draggable={false}
          />
        </span>
        <span className="ph-fcard-gem" aria-hidden="true" />
        <span className="ph-fcard-name">{shortName(wizard)}</span>
      </div>
      {owner ? (
        <span className="ph-fcard-seal" aria-hidden="true">
          <small>Claimed by</small>
          {owner.name}
        </span>
      ) : null}
      {isYours ? (
        <span className="ph-fcard-crest" key={stamp} aria-hidden="true">
          ✦ Yours ✦
        </span>
      ) : null}
    </div>
  );
}

export default function WizardCarousel({
  seats,
  youId,
  onChoose,
}: {
  seats: Seat[];
  youId: string;
  onChoose(wizard: WizardId): void;
}) {
  const { sound, haptic } = useFeedback();
  const you = seats.find((seat) => seat.id === youId);
  const startIndex = Math.max(
    0,
    WIZARDS.findIndex((w) => w.id === (you?.wizard ?? "mystic")),
  );
  const [position, setPosition] = useState(startIndex);
  const [stamp, setStamp] = useState(0);
  const [shake, setShake] = useState(0);
  const positionRef = useRef(position);
  const stage = useRef<HTMLDivElement>(null);
  const animation = useRef(0);
  const drag = useRef<{
    id: number;
    startX: number;
    startPos: number;
    lastX: number;
    lastT: number;
    velocity: number;
    moved: boolean;
    /** The card under the finger at press time; capture retargets later events to the stage. */
    card: number | null;
  } | null>(null);

  const active = mod(Math.round(position), COUNT);
  const wizard = WIZARDS[active];
  const owner = seats.find(
    (seat) => seat.wizard === wizard.id && seat.id !== youId,
  );
  const isYours = you?.wizard === wizard.id;
  const spell = SPELLS.find((s) => s.id === AFFINITY_SPELL[wizard.id])!;

  const place = useCallback((value: number) => {
    const before = mod(Math.round(positionRef.current), COUNT);
    positionRef.current = value;
    setPosition(value);
    return before !== mod(Math.round(value), COUNT);
  }, []);

  const tick = useCallback(
    (changed: boolean) => {
      if (!changed) return;
      sound.hover();
      haptic(8);
    },
    [sound, haptic],
  );

  /** Springs the fan to a whole card position. */
  const settle = useCallback(
    (target: number) => {
      cancelAnimationFrame(animation.current);
      const from = positionRef.current;
      if (Math.abs(target - from) < 0.001) return;
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reduced) {
        tick(place(target));
        return;
      }
      const duration = 420 + Math.min(1, Math.abs(target - from)) * 120;
      const start = performance.now();
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        tick(place(from + (target - from) * easeOutBack(t)));
        if (t < 1) animation.current = requestAnimationFrame(frame);
      };
      animation.current = requestAnimationFrame(frame);
    },
    [place, tick],
  );

  useEffect(() => () => cancelAnimationFrame(animation.current), []);

  const step = (direction: number) =>
    settle(Math.round(positionRef.current) + direction);

  const cardWidth = () =>
    (stage.current?.querySelector(".ph-fcard") as HTMLElement | null)
      ?.offsetWidth ?? 220;

  const choose = () => {
    if (isYours) return;
    if (owner) {
      setShake((count) => count + 1);
      sound.error();
      haptic([30, 40, 30]);
      return;
    }
    onChoose(wizard.id);
    setStamp((count) => count + 1);
    sound.ignite();
    haptic([20, 40, 60]);
  };

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest(".ph-fan-arrow")) return;
    cancelAnimationFrame(animation.current);
    const pressed = (event.target as Element).closest<HTMLElement>(".ph-fcard");
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      card: pressed ? Number(pressed.dataset.index) : null,
      id: event.pointerId,
      startX: event.clientX,
      startPos: positionRef.current,
      lastX: event.clientX,
      lastT: performance.now(),
      velocity: 0,
      moved: false,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    if (Math.abs(dx) > TAP_SLOP) state.moved = true;
    const now = performance.now();
    state.velocity =
      (event.clientX - state.lastX) / Math.max(1, now - state.lastT);
    state.lastX = event.clientX;
    state.lastT = now;
    if (state.moved)
      tick(place(state.startPos - dx / (cardWidth() * DRAG_PER_CARD)));
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    if (!state.moved) {
      // A tap: the centre card chooses, a side card comes forward.
      if (state.card === null) return settle(Math.round(positionRef.current));
      const d = offsetOf(state.card, positionRef.current);
      if (Math.abs(d) < 0.5) choose();
      else settle(Math.round(positionRef.current + d));
      return;
    }
    let target = Math.round(positionRef.current);
    if (
      Math.abs(state.velocity) > FLICK_SPEED &&
      target === Math.round(state.startPos)
    )
      target -= Math.sign(state.velocity);
    settle(target);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") step(-1);
    else if (event.key === "ArrowRight") step(1);
    else if (event.key === "Enter" || event.key === " ") choose();
    else return;
    event.preventDefault();
  }

  const hint = isYours
    ? "Your wizard ✦ tap I'm ready below"
    : owner
      ? `${owner.name} already walks this path.`
      : "Tap the card to choose";

  return (
    <section className="ph-fan-wrap" aria-label="Choose your wizard">
      <p className="eyebrow text-center">Swipe to spin · tap to choose</p>
      <div
        ref={stage}
        className="ph-fan"
        style={{ "--k": wizard.swatch } as CSSProperties}
        role="listbox"
        aria-label="Wizards"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div className="ph-fan-circle" aria-hidden="true">
          <Pedestal />
        </div>
        <div
          className="ph-fan-cards"
          key={`shake-${shake}`}
          data-shake={shake > 0 || undefined}
        >
          {WIZARDS.map((w, index) => (
            <FanCard
              key={w.id}
              wizard={w}
              d={offsetOf(index, position)}
              owner={seats.find(
                (seat) => seat.wizard === w.id && seat.id !== youId,
              )}
              isYours={you?.wizard === w.id}
              stamp={stamp}
            />
          ))}
        </div>
        <button
          type="button"
          className="ph-fan-arrow left"
          aria-label="Previous wizard"
          onClick={() => step(-1)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M17 7L7 17M7 9v8h8" />
          </svg>
        </button>
        <button
          type="button"
          className="ph-fan-arrow right"
          aria-label="Next wizard"
          onClick={() => step(1)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7l10 10M17 9v8H9" />
          </svg>
        </button>
      </div>

      <div
        className="ph-fan-info"
        key={wizard.id}
        style={{ "--k": wizard.swatch } as CSSProperties}
      >
        <h2 className="ph-fan-name">{shortName(wizard)}</h2>
        <p className="ph-fan-title">{wizard.title}</p>
        <p className="ph-fan-affinity" style={{ color: spell.glow }}>
          <span className="ph-affinity-icon">
            <SpellGlyph icon={spell.icon} />
          </span>
          {wizard.affinity}
        </p>
        <p
          className={`ph-fan-hint ${isYours ? "yours" : owner ? "taken" : "free"}`}
          aria-live="polite"
        >
          {hint}
        </p>
      </div>
    </section>
  );
}
