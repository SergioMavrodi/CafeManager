import type { NextConfig } from "next";

// Detect Vercel environment
const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  // Use standalone only for Docker builds, not for Vercel
  ...(isVercel ? {} : { output: "standalone" }),
  // Ensure images work on both platforms
  images: {
    unoptimized: true,
  },
  // Disable type checking during build for faster builds
  typescript: {
    ignoreBuildErrors: false,
  },
  // Enable strict mode for production
  reactStrictMode: true,
};

export default nextConfig;
