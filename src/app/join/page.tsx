import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import Sigil from "@/components/Sigil";
import SkyLayers from "@/components/SkyLayers";
import PhoneApp from "@/phone/PhoneApp";
import "@/phone/phone.css";

export const metadata: Metadata = {
  title: "Join the Realm · Aetherwyn",
  description: "Your phone is your wand. Join the duel on the big screen.",
};

export const viewport: Viewport = {
  themeColor: "#141A2E",
  viewportFit: "cover",
  // The on-screen keyboard shrinks the page instead of covering the name field.
  interactiveWidget: "resizes-content",
};

/** The phone controller players reach by scanning the host's QR code. */
export default function JoinPage() {
  return (
    <div className="ph-shell">
      <div className="ph-sky" aria-hidden="true">
        <SkyLayers />
        <div className="ph-runes" />
      </div>
      <Suspense
        fallback={
          <div className="ph-scene ph-system" role="status">
            <Sigil idPrefix="ph-fallback" className="ph-system-sigil" />
            <p className="eyebrow">Opening the portal</p>
          </div>
        }
      >
        <PhoneApp />
      </Suspense>
    </div>
  );
}
