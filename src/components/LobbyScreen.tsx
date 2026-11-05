import MagicButton from "./MagicButton";

export default function LobbyScreen() {
  return (
    <section
      className="screen out flex items-center justify-start max-[760px]:items-end max-[760px]:justify-center"
      id="scr-lobby"
      hidden
      aria-labelledby="lobby-h"
    >
      <div className="panel side">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">The Battlefield</p>
            <h2 className="text-[1.2rem]" id="lobby-h">
              Gather your wizards
            </h2>
          </div>
          <MagicButton className="ghost small mt-0.5 flex-none" id="close-room">
            Close room
          </MagicButton>
        </div>
        <div className="flex items-center gap-4.5">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="eyebrow">Room code</p>
            <div
              className="gold-text font-title text-[clamp(2.4rem,5vw,3rem)] leading-none font-black tracking-[0.14em] filter-[drop-shadow(0_2px_0_rgba(50,30,6,0.9))]"
              id="room-code"
            >
              ----
            </div>
            <p className="text-[0.95rem]">
              Scan with a phone, or open the game on a phone and enter the code.
            </p>
          </div>
          <div
            className="h-24 w-24 flex-none border border-gold-hi bg-[#F4EEFF] p-1.75 [box-shadow:0_0_22px_rgba(148,225,243,0.25)] max-[760px]:h-21 max-[760px]:w-21 [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
            id="qr"
            aria-label="QR code for joining this room"
            role="img"
          />
        </div>
        <hr className="m-0 h-px bg-[linear-gradient(90deg,transparent,rgba(250,220,152,0.5),transparent)] [border:0]" />
        <ul
          className="m-0 flex list-none flex-col gap-2 p-0"
          id="slots"
          aria-live="polite"
        />
        <p className="text-[0.88rem]">
          No phone handy? Add a test wizard to try the lobby.
        </p>
        <div className="btn-row flex flex-wrap gap-3">
          <MagicButton id="add-test">Add test wizard</MagicButton>
          <MagicButton className="primary" id="begin" disabled>
            Begin training
          </MagicButton>
        </div>
        <p className="min-h-[1.2em] text-[0.95rem] italic" id="begin-reason">
          Waiting for at least one wizard.
        </p>
        <button className="link-btn" id="join-here" type="button">
          Join from this device instead
        </button>
      </div>
    </section>
  );
}
