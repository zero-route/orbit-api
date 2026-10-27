import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/mp3": ["./node_modules/ffmpeg-static/**/*"],
    "/api/slideshow": ["./node_modules/ffmpeg-static/**/*"],
  },
};

export default nextConfig;
