/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Landing-page filmstrip placeholder imagery only (no real strips
      // exist yet — docs/online-photobooth-implementation-plan.md Phase 3).
      // Swap/remove once real strip thumbnails are available.
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
};

export default nextConfig;
