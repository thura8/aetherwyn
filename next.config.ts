import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Lets phones on the same Wi-Fi or hotspot load the dev server (the /join page) by LAN address.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  // The on-device voice model (~40 MB) never changes: phones that need it download it once.
  headers: async () => [
    {
      source: "/models/:file*",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
  ],
};

export default nextConfig;
