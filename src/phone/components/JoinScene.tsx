"use client";

import { useRef, useState, type FormEvent } from "react";
import MagicButton from "@/components/MagicButton";
import { TitleWordmark } from "@/components/TitleCrest";
import {
  NAME_MAX,
  ROOM_CODE_LENGTH as CODE_LENGTH,
  ROOM_CODE_PATTERN,
} from "@/shared/relay";
import { useFeedback } from "@/phone/feedback";
import type { JoinError } from "@/phone/session/types";
import { CheckRune, FiligreeFrame, GemDivider } from "./Glyphs";

const ERRORS: Record<JoinError, { field: "code" | "name"; message: string }> = {
  "bad-code": {
    field: "code",
    message:
      "Room codes are four letters or numbers, as shown on the big screen.",
  },
  "no-room": {
    field: "code",
    message: "No room answers to that code. Check the big screen.",
  },
  "room-full": {
    field: "code",
    message: "That room already has four wizards.",
  },
  "name-taken": {
    field: "name",
    message: "A wizard in this room already bears that name.",
  },
  "no-name": { field: "name", message: "Every wizard needs a name." },
};

const cleanCode = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LENGTH);

export default function JoinScene({
  initialCode,
  initialName = "",
  endedReason,
  onJoin,
}: {
  /** A valid code from the QR link, if there was one. */
  initialCode: string | null;
  /** Offered again after a seat was lost. */
  initialName?: string;
  /** Why the last session ended, shown above the form. */
  endedReason: string | null;
  onJoin(code: string, name: string): Promise<JoinError | null>;
}) {
  const { sound, haptic } = useFeedback();
  const [code, setCode] = useState(initialCode ?? "");
  const [sealed, setSealed] = useState(initialCode !== null);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<JoinError | null>(null);
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);

  const fail = (reason: JoinError) => {
    setError(reason);
    setShake((count) => count + 1);
    sound.error();
    haptic([40, 60, 40]);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!ROOM_CODE_PATTERN.test(code)) return fail("bad-code");
    if (!name.trim()) return fail("no-name");
    setError(null);
    setBusy(true);
    sound.unlock();
    sound.press();
    const result = await onJoin(code, name.trim());
    setBusy(false);
    if (result) fail(result);
    else {
      sound.surge();
      haptic(30);
    }
  }

  const errorField = error ? ERRORS[error].field : null;

  return (
    <div className="ph-join">
      <header className="ph-join-head">
        <div className="ph-join-word title">
          <TitleWordmark />
        </div>
        <p className="ph-kicker">Your phone is your wand</p>
      </header>

      <form className="ph-card ph-join-card" noValidate onSubmit={submit}>
        <FiligreeFrame />
        <div className="text-center">
          <p className="eyebrow">Through the portal</p>
          <h1 className="ph-heading">Join the Realm</h1>
        </div>
        <GemDivider />

        {endedReason ? <p className="ph-notice">{endedReason}</p> : null}

        <div className="ph-field">
          <div className="ph-field-label">
            <label htmlFor="ph-code">Room code</label>
            {sealed ? (
              <button
                type="button"
                className="ph-link"
                onClick={() => {
                  setSealed(false);
                  sound.back();
                  requestAnimationFrame(() => codeInput.current?.focus());
                }}
              >
                Change
              </button>
            ) : null}
          </div>
          <div
            key={errorField === "code" ? `code-${shake}` : "code"}
            className={`ph-code${sealed ? " sealed" : ""}${errorField === "code" ? " bad" : ""}`}
            onClick={() => !sealed && codeInput.current?.focus()}
          >
            <input
              ref={codeInput}
              id="ph-code"
              className="ph-code-input"
              value={code}
              readOnly={sealed}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={CODE_LENGTH}
              aria-invalid={errorField === "code"}
              aria-describedby={
                errorField === "code" ? "ph-join-error" : undefined
              }
              onChange={(event) => {
                const next = cleanCode(event.target.value);
                if (next.length > code.length)
                  sound.tick(next.length === CODE_LENGTH);
                setCode(next);
                if (errorField === "code") setError(null);
              }}
            />
            {Array.from({ length: CODE_LENGTH }, (_, index) => (
              <span
                key={index}
                className={`ph-tile${code[index] ? " filled" : ""}${
                  !sealed && index === Math.min(code.length, CODE_LENGTH - 1)
                    ? " caret"
                    : ""
                }`}
                aria-hidden="true"
              >
                {code[index] ?? ""}
              </span>
            ))}
          </div>
          {sealed ? (
            <p className="ph-sealed-note">
              <CheckRune /> Sealed by the portal you scanned
            </p>
          ) : null}
        </div>

        <div className="ph-field">
          <div className="ph-field-label">
            <label htmlFor="ph-name">Your wizard name</label>
            <span className="ph-count">
              {name.length}/{NAME_MAX}
            </span>
          </div>
          <input
            key={errorField === "name" ? `name-${shake}` : "name"}
            id="ph-name"
            className={`input ph-name${errorField === "name" ? " bad" : ""}`}
            value={name}
            maxLength={NAME_MAX}
            placeholder="Lyra"
            autoComplete="nickname"
            autoCapitalize="words"
            enterKeyHint="go"
            autoFocus={sealed}
            aria-invalid={errorField === "name"}
            aria-describedby={
              errorField === "name" ? "ph-join-error" : undefined
            }
            onChange={(event) => {
              setName(event.target.value);
              if (errorField === "name") setError(null);
            }}
          />
        </div>

        <p className="ph-error" id="ph-join-error" role="alert">
          {error ? ERRORS[error].message : ""}
        </p>

        <MagicButton type="submit" className="primary ph-cta" disabled={busy}>
          {busy ? (
            <>
              <span className="ph-spinner" aria-hidden="true" /> Opening the
              portal…
            </>
          ) : (
            "Enter the Realm"
          )}
        </MagicButton>
      </form>

      <p className="ph-foot">Stand where you can see the big screen.</p>
    </div>
  );
}
