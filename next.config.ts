import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * VERCEL HOBBY TIER — "ZERO FLUID ACTIVE CPU" MANDATE
   * 100% Static Export: the entire site compiles into static assets (out/)
   * served purely from Vercel's CDN Edge with 0ms of Serverless /
   * Fluid Active CPU execution.
   */
  output: "export",
  images: {
    // No Vercel Image Optimization server calls — everything client-side.
    unoptimized: true,
  },
  reactStrictMode: false,
  // Dev-server only: allow the sandbox preview gateway origin
  allowedDevOrigins: ["*.space-z.ai", "localhost:3000"],
  // TypeScript errors MUST fail the build (zero-error guarantee).
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
