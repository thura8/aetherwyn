"use client";

import {
  useCallback,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  MOVES,
  PRACTICE_SPELLS,
  spellById,
  type Spell,
  type SpellId,
} from "@/phone/content";
import {
  useHoldToCast,
  type CastOutcome,
  type CastPhase,
} from "@/phone/casting/useHoldToCast";
import {
  readMicLevel,
  readMotionLevel,
  useLiveLevel,
} from "@/phone/casting/useLiveLevel";
import { requestMotion } from "@/phone/casting/mediaAccess";
import { useMediaAccess } from "@/phone/casting/useMediaAccess";
import type { MoveName } from "@/phone/casting/motion/classifyMove";
import type { VoiceStatus } from "@/phone/casting/voice/listener";
import {
  availableVoiceEngines,
  chooseVoiceEngine,
  getServerVoiceEngine,
  getVoiceEngine,
  subscribeVoiceEngine,
} from "@/phone/casting/voice/voiceEngine";
import {
  getVoiceModelState,
  subscribeVoiceModel,
} from "@/phone/casting/voice/voskSpeech";
import { useFeedback } from "@/phone/feedback";
import type { RoomSession } from "@/phone/session/types";
import { FiligreeFrame, MoveGlyph, SpellGlyph } from "./Glyphs";

/** Full-power casts that master a spell. */
const MASTERY = 3;
const IDLE_MODEL = { phase: "idle" } as const;

const moveName = (move: string | null) =>
  move
    ? (MOVES[move as keyof typeof MOVES]?.name.toLowerCase() ?? move)
    : "nothing";

/** What a full-power cast of each spell shouts back. */
const CELEBRATION: Partial<Record<SpellId, string>> = {
  "flame-burst": "Blazing!",
  "mystic-shield": "Unbreakable!",
};

/** The headline and one short line for a finished cast, written for the spell being practised. */
function describe(outcome: CastOutcome, practising: Spell) {
  const { verdict } = outcome;
  if (outcome.switchedVoice)
    return {
      tone: "missed",
      title: "Tuning your voice",
      detail:
        "This phone's speech didn't return any words, so it's switching to far-field listening. Try again in a moment.",
    };
  if (verdict.power === "full")
    return {
      tone: "full",
      title: CELEBRATION[verdict.spell!] ?? "Full power!",
      detail: `${spellById(verdict.spell!).name} at full power.`,
    };
  if (verdict.power === "weak") {
    const cast = spellById(verdict.spell!);
    if (cast.id !== practising.id)
      return {
        tone: "weak",
        title: `${cast.name}, weak`,
        detail: outcome.voiceOff
          ? `That move casts ${cast.name}. ${practising.name} needs a ${moveName(practising.move)}.`
          : `You're practising ${practising.name}: shout “${practising.word}!”`,
      };
    return {
      tone: "weak",
      title: "Nearly!",
      detail: verdict.reason ?? "Try again for full power.",
    };
  }
  return {
    tone: "missed",
    title: "The spell fizzled",
    detail: verdict.reason ?? "Try again.",
  };
}

/** A bigger hint after two misses in a row on the same spell. */
function helpFor(practising: Spell, lastOutcome: CastOutcome | null) {
  if (lastOutcome && !lastOutcome.heard && !lastOutcome.voiceOff)
    return "Shout the word louder while you hold, and wait for the buzz before you swing.";
  return practising.move === "raise"
    ? "Lift the phone up higher, like raising a torch over your head."
    : "Shake it twice, quickly, like rattling a tin.";
}

function voiceLine(
  engine: ReturnType<typeof getVoiceEngine>,
  model: ReturnType<typeof getVoiceModelState>,
  micBlocked: boolean,
) {
  if (micBlocked || engine === "off")
    return "Voice is off on this phone: casts come from the move alone, and are weak.";
  if (engine === "browser")
    return "Listening with the phone's speech, which hears best near your mouth.";
  switch (model.phase) {
    case "downloading":
      return `Downloading on-device voice… ${model.percent}%`;
    case "unpacking":
      return "Preparing on-device voice…";
    case "failed":
      return "On-device voice couldn't load. Casts come from the move alone.";
    default:
      return "Listening far-field: shout from arm's length.";
  }
}

function padPrompt(
  phase: CastPhase,
  voice: VoiceStatus,
  locked: SpellId | null,
) {
  if (phase === "holding" && locked)
    return `“${spellById(locked).word}!” heard: now swing`;
  if (phase === "holding")
    return voice === "loading" ? "Voice is loading…" : "Shout, then swing";
  if (phase === "judging") return "Reading your wand…";
  return "Hold here";
}

/** The rune circle you hold: it lights up while held, with the voice ringing it and the swing filling it. */
function CastingPad({
  spell,
  phase,
  voice,
  locked,
  burst,
  onBegin,
  onRelease,
  onCancel,
}: {
  spell: Spell;
  phase: CastPhase;
  voice: VoiceStatus;
  locked: SpellId | null;
  burst: { tone: string; key: number } | null;
  onBegin(): void;
  onRelease(): void;
  onCancel(): void;
}) {
  const holding = phase === "holding";
  // Once the word is heard, the pad takes that spell's colours (it may not be the one practised).
  const colours = spellById(locked && holding ? locked : spell.id);
  const motionRef = useLiveLevel<HTMLDivElement>(
    readMotionLevel,
    holding,
    "--swing",
  );
  const micRef = useLiveLevel<HTMLSpanElement>(
    readMicLevel,
    holding,
    "--voice",
  );
  const hearing = voice === "hearing";

  const down = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    onBegin();
  };

  return (
    <div
      ref={motionRef}
      className={`ph-pad-wrap ${phase}${hearing ? " hearing" : ""}${locked && holding ? " locked" : ""}`}
      style={{ "--sc": colours.colour, "--sg": colours.glow } as CSSProperties}
    >
      {burst ? (
        <span key={burst.key} className={`ph-pad-burst ${burst.tone}`} />
      ) : null}
      <button
        type="button"
        className="ph-pad"
        aria-label={`Hold to cast ${spell.name}: shout “${spell.word}!” and ${moveName(spell.move)}, then let go`}
        onPointerDown={down}
        onPointerUp={onRelease}
        onPointerCancel={onCancel}
        onContextMenu={(event) => event.preventDefault()}
      >
        <svg className="ph-pad-runes" viewBox="0 0 200 200" aria-hidden="true">
          <circle className="ring outer" cx="100" cy="100" r="94" />
          <circle className="ring ticks" cx="100" cy="100" r="84" />
          <circle
            className="ring fill"
            cx="100"
            cy="100"
            r="74"
            pathLength={100}
          />
          <path className="tri" d="M100 38l54 93H46zM100 162L46 69h108z" />
        </svg>
        <span ref={micRef} className="ph-pad-voice" aria-hidden="true" />
        <span className="ph-pad-core">
          <span className="ph-pad-icon">
            <SpellGlyph icon={spell.icon} />
          </span>
          <span className="ph-pad-prompt">
            {padPrompt(phase, voice, locked)}
          </span>
        </span>
      </button>
    </div>
  );
}

/** Without motion sensors (a laptop, or a page that isn't https): hold the move's button instead. */
function MoveButtons({
  phase,
  locked,
  onBegin,
  onRelease,
  onCancel,
}: {
  phase: CastPhase;
  locked: SpellId | null;
  onBegin(): void;
  onRelease(move: MoveName): void;
  onCancel(): void;
}) {
  return (
    <div className="ph-move-buttons">
      {(["raise", "shake"] as const).map((move) => (
        <button
          key={move}
          type="button"
          className={`ph-move-button${phase === "holding" ? " live" : ""}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            onBegin();
          }}
          onPointerUp={() => onRelease(move)}
          onPointerCancel={onCancel}
          onContextMenu={(event) => event.preventDefault()}
        >
          <MoveGlyph move={move} />
          <span>
            {phase === "holding" && locked
              ? `“${spellById(locked).word}!” heard`
              : `Hold to ${MOVES[move].name.toLowerCase()}`}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function PracticeScene({ session }: { session: RoomSession }) {
  const { sound, haptic } = useFeedback();
  const access = useMediaAccess();
  const engine = useSyncExternalStore(
    subscribeVoiceEngine,
    getVoiceEngine,
    getServerVoiceEngine,
  );
  const model = useSyncExternalStore(
    subscribeVoiceModel,
    getVoiceModelState,
    () => IDLE_MODEL,
  );
  const [practising, setPractising] = useState<SpellId>(PRACTICE_SPELLS[0]);
  const [mastery, setMastery] = useState<Record<string, number>>({});
  const [burst, setBurst] = useState<{ tone: string; key: number } | null>(
    null,
  );
  /** Full-power casts in a row (any spell). */
  const [streak, setStreak] = useState(0);
  /** Casts in a row that weren't full power, on the spell being practised. */
  const [misses, setMisses] = useState(0);
  const spell = spellById(practising);

  const onWordLocked = useCallback(() => {
    // The word is in: a short buzz and chime say "now swing" without looking at the screen.
    haptic(25);
    sound.tick(true);
  }, [haptic, sound]);
  const { phase, voiceStatus, lockedWord, outcome, begin, release, cancel } =
    useHoldToCast((result) => {
      const { tone } = describe(result, spell);
      setBurst({ tone, key: Date.now() });
      const nextStreak = tone === "full" ? streak + 1 : 0;
      setStreak(nextStreak);
      setMisses((count) =>
        tone === "full" && result.verdict.spell === practising ? 0 : count + 1,
      );
      session.reportPractice(spell.id, result.verdict.power, nextStreak);
      if (tone === "full") {
        // The chime climbs with the streak.
        if (nextStreak > 1) sound.hit(nextStreak);
        else sound.cast();
        haptic([30, 40, 90]);
        if (result.verdict.spell)
          setMastery((counts) => ({
            ...counts,
            [result.verdict.spell!]: (counts[result.verdict.spell!] ?? 0) + 1,
          }));
      } else if (tone === "weak") {
        sound.press();
        haptic(40);
      } else {
        sound.miss();
        haptic([60, 40, 60]);
      }
    }, onWordLocked);

  const result = outcome ? describe(outcome, spell) : null;
  const nextSpell = PRACTICE_SPELLS.find(
    (id) => id !== practising && (mastery[id] ?? 0) < MASTERY,
  );
  const mastered = (mastery[practising] ?? 0) >= MASTERY;
  const allMastered = PRACTICE_SPELLS.every(
    (id) => (mastery[id] ?? 0) >= MASTERY,
  );
  const sensorsReady = access.motion === "granted";

  return (
    <div className="ph-practice">
      <header className="ph-practice-head">
        <p className="eyebrow">Training grounds</p>
        <h1 className="ph-heading">Spell practice</h1>
      </header>

      <div
        className="ph-spell-choice"
        role="radiogroup"
        aria-label="Spell to practise"
      >
        {PRACTICE_SPELLS.map((id) => {
          const option = spellById(id);
          const full = Math.min(MASTERY, mastery[id] ?? 0);
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={id === practising}
              className={`ph-spell-card${id === practising ? " on" : ""}`}
              style={
                { "--sc": option.colour, "--sg": option.glow } as CSSProperties
              }
              disabled={phase === "holding" || phase === "judging"}
              onClick={() => {
                if (id === practising) return;
                setPractising(id);
                setMisses(0);
                sound.hover();
              }}
            >
              <span className="ph-spell-icon">
                <SpellGlyph icon={option.icon} />
              </span>
              <span className="ph-spell-word">{option.word}!</span>
              <span className="ph-spell-move">{MOVES[option.move].name}</span>
              <span
                className="ph-mastery"
                aria-label={`${full} of ${MASTERY} full-power casts`}
              >
                {Array.from({ length: MASTERY }, (_, i) => (
                  <span key={i} className={i < full ? "lit" : ""} />
                ))}
              </span>
              {full >= MASTERY ? (
                <span className="ph-mastered">Mastered ✦</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        className="ph-card ph-howto"
        style={{ "--sc": spell.colour, "--sg": spell.glow } as CSSProperties}
      >
        <FiligreeFrame />
        <MoveGlyph move={spell.move as MoveName} className="ph-howto-glyph" />
        <p>
          Shout <b>“{spell.word}!”</b> and <b>{moveName(spell.move)}</b>:{" "}
          {MOVES[spell.move].instruction.toLowerCase()}.
        </p>
      </div>

      {access.motion === "unknown" ? (
        <button
          type="button"
          className="btn primary ph-cta ph-awaken"
          onClick={() => {
            // Must run in the tap: iPhone (and now Chrome) only ask for motion from one.
            void requestMotion().then((answer) => {
              if (answer === "granted") {
                sound.ignite();
                haptic(30);
              }
            });
          }}
        >
          <span className="shine" />
          Awaken your wand&rsquo;s motion
        </button>
      ) : null}

      {sensorsReady ? (
        <CastingPad
          spell={spell}
          phase={phase}
          voice={voiceStatus}
          locked={lockedWord}
          burst={burst}
          onBegin={begin}
          onRelease={() => void release()}
          onCancel={cancel}
        />
      ) : (
        <MoveButtons
          phase={phase}
          locked={lockedWord}
          onBegin={begin}
          onRelease={(move) => void release(move)}
          onCancel={cancel}
        />
      )}

      <div className="ph-cast-result" aria-live="polite">
        {result && phase === "result" ? (
          <div key={burst?.key} className={`ph-verdict ${result.tone}`}>
            <p className="ph-verdict-title">
              {result.title}
              {result.tone === "full" && streak > 1 ? (
                <span className="ph-streak">×{streak}</span>
              ) : null}
            </p>
            <p className="ph-verdict-detail">{result.detail}</p>
            {misses >= 2 ? (
              <div
                className="ph-help"
                style={
                  { "--sc": spell.colour, "--sg": spell.glow } as CSSProperties
                }
              >
                <MoveGlyph
                  move={spell.move as MoveName}
                  className="ph-help-glyph"
                />
                <p>{helpFor(spell, outcome)}</p>
              </div>
            ) : null}
            {allMastered && result.tone === "full" ? (
              <p className="ph-ready-banner">
                Both spells mastered. Ready for the duel!
              </p>
            ) : null}
            <p className="ph-verdict-evidence">
              Heard:{" "}
              <b>
                {outcome!.voiceOff ? "voice off" : outcome!.heard || "nothing"}
              </b>
              {" · "}
              Felt: <b>{moveName(outcome!.move)}</b>
              {outcome!.measured
                ? ` ${Math.round(outcome!.measured.peakTurnRate)}°/s`
                : ""}
            </p>
            {mastered && nextSpell ? (
              <button
                type="button"
                className="btn small ph-next-spell"
                onClick={() => {
                  setPractising(nextSpell);
                  setMisses(0);
                  sound.ignite();
                }}
              >
                <span className="shine" />
                {spell.name} mastered: try {spellById(nextSpell).name}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="ph-cast-hint">
            {sensorsReady
              ? "Hold the circle with your thumb, shout and swing, then let go."
              : access.motion === "unknown"
                ? "Awaken motion to cast by swinging, or hold a move button while you shout."
                : "No motion sensor here: hold a move button while you shout, then let go."}
          </p>
        )}
      </div>

      <p className="ph-voice-line">
        {voiceLine(engine, model, access.mic === "unavailable")}
        {engine === "browser" &&
        access.mic !== "unavailable" &&
        availableVoiceEngines().vosk ? (
          <>
            {" "}
            <button
              type="button"
              className="ph-link"
              disabled={phase === "holding" || phase === "judging"}
              onClick={() => {
                chooseVoiceEngine("vosk");
                sound.hover();
              }}
            >
              Use far-field
            </button>
          </>
        ) : null}
      </p>
    </div>
  );
}
