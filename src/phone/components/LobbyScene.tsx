"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { useFeedback } from "@/phone/feedback";
import type { RoomSession, RoomSnapshot } from "@/phone/session/types";
import LobbyDock from "./LobbyDock";
import { useMediaAccess } from "@/phone/casting/useMediaAccess";
import WandSetup from "./WandSetup";
import WizardCarousel from "./WizardCarousel";

type Tab = "wizard" | "wand";

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  {
    id: "wizard",
    label: "Wizard",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h16M6 20l5.2-15.3c.3-.9 1.6-.9 1.9 0L15 10l3 10" />
        <path d="M8.6 14.5h7" />
        <path d="M17 4.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" />
      </svg>
    ),
  },
  {
    id: "wand",
    label: "Your wand",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19L15.5 8.5" />
        <path d="M14 7l3 3" />
        <path d="M18 2.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" />
        <path d="M9 4.5l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5zM20 12.5l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z" />
      </svg>
    ),
  },
];

export default function LobbyScene({
  room,
  session,
}: {
  room: RoomSnapshot;
  session: RoomSession;
}) {
  const { sound } = useFeedback();
  const access = useMediaAccess();
  const you = room.seats.find((seat) => seat.id === room.youId);
  const [tab, setTab] = useState<Tab>(you?.wizard ? "wand" : "wizard");
  const index = TABS.findIndex((t) => t.id === tab);
  const needs: Record<Tab, boolean> = {
    wizard: !you?.wizard,
    wand: access.motion === "unknown" || access.mic === "unknown",
  };

  return (
    <div className="ph-lobby">
      <nav
        className="ph-tabs"
        role="tablist"
        aria-label="Lobby"
        style={{ "--i": index, "--n": TABS.length } as CSSProperties}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`ph-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="ph-tabpanel"
            className={`ph-tab${tab === t.id ? " on" : ""}`}
            onClick={() => {
              if (tab !== t.id) sound.hover();
              setTab(t.id);
            }}
          >
            {t.icon}
            {t.label}
            {needs[t.id] ? (
              <span className="ph-tab-nudge" aria-label="needs attention" />
            ) : null}
          </button>
        ))}
        <span className="ph-tab-bar" aria-hidden="true" />
      </nav>

      <div
        className="ph-tabpanel"
        id="ph-tabpanel"
        role="tabpanel"
        aria-labelledby={`ph-tab-${tab}`}
        key={tab}
      >
        {tab === "wizard" ? (
          <WizardCarousel
            seats={room.seats}
            youId={room.youId}
            onChoose={(wizard) => session.selectWizard(wizard)}
          />
        ) : (
          <WandSetup />
        )}
      </div>

      <LobbyDock
        seats={room.seats}
        youId={room.youId}
        onReady={(ready) => session.setReady(ready)}
        onLeave={() => session.leave()}
      />
    </div>
  );
}
