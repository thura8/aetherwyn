import MagicButton from "./MagicButton";

function HudStat({
  id,
  value,
  label,
}: {
  id: string;
  value: string;
  label: string;
}) {
  return (
    <div className="stat" id={id}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function ResultStat({
  id,
  label,
  value,
}: {
  id: string;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="font-label text-[0.62rem] tracking-[0.2em] text-lavender uppercase">
        {label}
      </dt>
      <dd
        className="mx-0 mt-0.5 mb-0 font-label text-[1.3rem] font-bold text-ink tabular-nums"
        id={id}
      >
        {value}
      </dd>
    </div>
  );
}

export default function TrainingScreen() {
  return (
    <>
      <section
        className="screen out flex flex-col items-center justify-between"
        id="scr-training"
        hidden
        aria-label="Training grounds"
      >
        <div className="mt-11 flex flex-wrap justify-center gap-2.5 max-[760px]:mt-13">
          <HudStat id="st-score" value="0" label="Arcane points" />
          <HudStat id="st-combo" value="×1" label="Combo" />
          <HudStat id="st-time" value="45" label="Seconds" />
        </div>
        <p
          className="mb-2 text-center text-ink-dim italic [text-shadow:0_1px_8px_rgba(8,8,24,0.95)]"
          id="train-hint"
        >
          Aim at the crystals · click or tap to cast · Space casts too
        </p>
      </section>
      <div className="reticle" id="reticle" hidden>
        <svg viewBox="0 0 46 46">
          <circle cx="23" cy="23" r="4" />
          <g className="spin">
            <path d="M23 2v8M23 36v8M2 23h8M36 23h8" />
            <circle cx="23" cy="23" r="15" strokeDasharray="6 5" />
          </g>
        </svg>
      </div>
      <div
        className="banner gold-text pointer-events-none fixed top-[40%] right-0 left-0 text-center [font:900_clamp(2.4rem,8vw,5rem)_var(--font-title)]"
        id="banner"
        hidden
      />
      <div
        className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-[rgba(10,12,30,0.45)] pr-[max(16px,env(safe-area-inset-right,0px))] pl-[max(16px,env(safe-area-inset-left,0px))]"
        id="results"
        hidden
      >
        <div
          className="panel w-[min(400px,100%)] items-stretch text-center animate-[up_0.6s_cubic-bezier(.2,.7,.2,1)_both]"
          role="dialog"
          aria-labelledby="res-h"
        >
          <p className="eyebrow">Training complete</p>
          <h2 id="res-h">Well cast, wizard</h2>
          <div
            className="gold-text [font:900_3.2rem/1_var(--font-title)]"
            id="res-score"
          >
            0
          </div>
          <dl className="m-0 grid grid-cols-[repeat(3,1fr)] gap-2">
            <ResultStat id="res-hits" label="Hits" value="0" />
            <ResultStat id="res-acc" label="Accuracy" value="0%" />
            <ResultStat id="res-combo" label="Best combo" value="×1" />
          </dl>
          <div className="btn-row flex flex-wrap gap-3">
            <MagicButton className="primary" id="again">
              Train again
            </MagicButton>
            <MagicButton id="to-menu">Main menu</MagicButton>
          </div>
        </div>
      </div>
    </>
  );
}
