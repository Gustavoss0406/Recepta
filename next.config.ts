import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // lets `npm run local` work when opened as http://127.0.0.1:3000 (dev only)
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
