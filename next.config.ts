import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Version-skew protection: a tab from the previous deploy reloads instead of calling stale Server Actions.
  // Render exposes the commit as RENDER_GIT_COMMIT (passed to the Docker build in the Dockerfile).
  deploymentId: process.env.DEPLOYMENT_VERSION || process.env.RENDER_GIT_COMMIT || undefined,
  // lets `npm run local` work when opened as http://127.0.0.1:3000 (dev only)
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
