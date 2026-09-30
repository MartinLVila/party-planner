import type { NextConfig } from "next";
import { GAME_ASSET_HOST, GAME_ASSET_PATH_PREFIX } from "./src/lib/game-assets";

const securityHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const strictTransportSecurity = {
  key: "Strict-Transport-Security",
  value: "max-age=63072000; includeSubDomains; preload",
};

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: GAME_ASSET_HOST,
        port: "",
        pathname: `${GAME_ASSET_PATH_PREFIX}**`,
        search: "",
      },
    ],
  },
  async headers() {
    const headers =
      process.env.NODE_ENV === "production" ? [...securityHeaders, strictTransportSecurity] : securityHeaders;
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
