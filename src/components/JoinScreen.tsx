import type { ReactNode } from "react";
import MagicButton from "./MagicButton";

function FormField({
  label,
  inputId,
  children,
}: {
  label: string;
  inputId: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="font-label text-[0.7rem] tracking-[0.26em] text-lavender uppercase"
        htmlFor={inputId}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/** The inputs are uncontrolled because src/experience reads and rewrites their values. */
export default function JoinScreen() {
  return (
    <section
      className="screen out flex items-center justify-end max-[760px]:items-end max-[760px]:justify-center"
      id="scr-join"
      hidden
      aria-labelledby="join-h"
    >
      <form className="panel side" id="join-form" noValidate>
        <div>
          <p className="eyebrow">Through the portal</p>
          <h2 id="join-h">Join the Realm</h2>
        </div>
        <p>
          Testing without a phone? Enter the room code to take a seat from this
          device.
        </p>
        <FormField label="Room code" inputId="code-input">
          <input
            className="input code"
            id="code-input"
            maxLength={4}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            placeholder="A94X"
          />
        </FormField>
        <FormField label="Wizard name" inputId="name-input">
          <input
            className="input"
            id="name-input"
            maxLength={20}
            autoComplete="off"
            placeholder="Lyra"
          />
        </FormField>
        <p
          className="min-h-[1.3em] text-[1rem] text-danger"
          id="join-error"
          role="alert"
        />
        <MagicButton className="primary" type="submit" id="join-submit">
          Enter the realm
        </MagicButton>
      </form>
    </section>
  );
}
