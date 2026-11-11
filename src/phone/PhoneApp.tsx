"use client";

import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { wizardById } from "@/phone/content";
import { FeedbackProvider, useFeedback } from "@/phone/feedback";
import { createRemoteRoom } from "@/phone/session/remoteRoom";
import {
  DEMO_STAGES,
  createSimulatedRoom,
  type DemoStage,
} from "@/phone/session/simulatedRoom";
import { readStoredSession } from "@/phone/session/storage";
import type { RoomSession, RoomSnapshot } from "@/phone/session/types";
import { ROOM_CODE_PATTERN } from "@/shared/relay";
import ArrivalScene from "./components/ArrivalScene";
import { SoundIcon } from "./components/Glyphs";
import JoinScene from "./components/JoinScene";
import LobbyScene from "./components/LobbyScene";
import PracticeScene from "./components/PracticeScene";
import {
  ClosedScene,
  HostAwayBanner,
  ReconnectingScene,
} from "./components/SystemScenes";

function readQrCode(value: string | null) {
  const code = value?.trim().toUpperCase() ?? "";
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

function readDemoStage(value: string | null) {
  return DEMO_STAGES.includes(value as DemoStage) ? (value as DemoStage) : null;
}

const noSnapshot = () => null;
const idle = () => "idle" as const;

export default function PhoneApp() {
  const params = useSearchParams();
  const qrCode = readQrCode(params.get("code"));
  const demoStage = readDemoStage(params.get("stage"));
  // The real room is relayed by this app's server; ?stage= or ?demo plays against bots for review.
  const demo = demoStage !== null || params.has("demo");
  const [session] = useState(() =>
    demo ? createSimulatedRoom({ demoStage }) : createRemoteRoom(),
  );
  useEffect(() => () => session.dispose(), [session]);

  return (
    <FeedbackProvider>
      <PhoneScenes session={session} qrCode={qrCode} demoStage={demoStage} />
    </FeedbackProvider>
  );
}

function PhoneScenes({
  session,
  qrCode,
  demoStage,
}: {
  session: RoomSession;
  qrCode: string | null;
  demoStage: DemoStage | null;
}) {
  const room = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    noSnapshot,
  );
  const connection = useSyncExternalStore(
    session.subscribe,
    session.getConnection,
    idle,
  );
  const [arrived, setArrived] = useState(false);
  const [endedReason, setEndedReason] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);

  const finishArrival = useCallback(() => {
    setArrived(true);
    // A refresh mid-game resumes the stored seat, unless the QR code points to another room.
    const stored = readStoredSession();
    if (stored && (!qrCode || stored.code === qrCode)) void session.resume();
    else if (demoStage && qrCode) void session.join(qrCode, "Lyra");
  }, [session, qrCode, demoStage]);

  if (room && room.code !== lastCode) setLastCode(room.code);

  let scene: ReactNode;
  let sceneKey: string;
  if (!arrived) {
    sceneKey = "arrival";
    scene = <ArrivalScene code={qrCode} onDone={finishArrival} />;
  } else if (!room && connection === "reconnecting") {
    sceneKey = "reconnecting";
    scene = <ReconnectingScene code={readStoredSession()?.code ?? qrCode} />;
  } else if (!room) {
    sceneKey = "join";
    scene = (
      <JoinScene
        initialCode={qrCode ?? lastCode}
        initialName={session.getRejoinName() ?? undefined}
        endedReason={endedReason ?? session.getNotice()}
        onJoin={(code, name) => session.join(code, name)}
      />
    );
  } else if (room.phase.kind === "closed") {
    sceneKey = "closed";
    const reason = room.phase.reason;
    scene = (
      <ClosedScene
        reason={reason}
        code={room.code}
        onRejoin={() => {
          setEndedReason(
            reason === "kicked"
              ? `You were removed from room ${room.code}.`
              : `Room ${room.code} has closed.`,
          );
          session.leave();
        }}
      />
    );
  } else if (room.phase.kind === "lobby") {
    sceneKey = "lobby";
    scene = <LobbyScene room={room} session={session} />;
  } else if (room.phase.kind === "practice") {
    sceneKey = "practice";
    scene = <PracticeScene session={session} />;
  } else {
    sceneKey = room.phase.kind;
    scene = <InRoomPlaceholder room={room} />;
  }

  return (
    <>
      {room && room.phase.kind !== "closed" ? (
        <TopBar code={room.code} room={room} />
      ) : arrived ? (
        <TopBar code={lastCode} room={null} />
      ) : null}
      {room && !room.hostPresent ? <HostAwayBanner /> : null}
      <main className="ph-scene" key={sceneKey} data-scene={sceneKey}>
        {scene}
      </main>
    </>
  );
}

function TopBar({
  code,
  room,
}: {
  code: string | null;
  room: RoomSnapshot | null;
}) {
  const { muted, toggleMuted } = useFeedback();
  const you = room?.seats.find((seat) => seat.id === room.youId);
  const swatch = you?.wizard ? wizardById(you.wizard).swatch : undefined;
  return (
    <header className="ph-topbar">
      {code ? (
        <span
          className="ph-room-chip"
          style={swatch ? ({ "--k": swatch } as CSSProperties) : undefined}
        >
          <span className={`ph-live${room ? " on" : ""}`} aria-hidden="true" />
          <span className="sr-only">{room ? "Connected to room" : "Room"}</span>
          {code}
        </span>
      ) : (
        <span />
      )}
      <button
        type="button"
        className="icon-btn ph-sound"
        aria-pressed={!muted}
        aria-label={muted ? "Sound off" : "Sound on"}
        onClick={toggleMuted}
      >
        <SoundIcon muted={muted} />
      </button>
    </header>
  );
}

/** Temporary stand-in until the lobby, training and battle scenes land. */
function InRoomPlaceholder({ room }: { room: RoomSnapshot }) {
  return (
    <div className="ph-system">
      <p className="eyebrow">Room {room.code}</p>
      <h1 className="ph-heading">{room.phase.kind}</h1>
    </div>
  );
}
