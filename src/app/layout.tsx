import type { Metadata, Viewport } from "next";
import "@fontsource/cinzel-decorative/900.css";
import "@fontsource/cinzel/500.css";
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aetherwyn",
  description:
    "A local-multiplayer wizard duel. The big screen is the arena; your phone is your wand.",
};

export const viewport: Viewport = {
  themeColor: "#141A2E",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body data-screen="title">{children}</body>
    </html>
  );
}
