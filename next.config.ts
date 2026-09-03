import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Google OAuth avatar URLs (app/auth/callback/route.ts reads
    // user.user_metadata.avatar_url from Google Sign-In). Pinned to the exact
    // lh3-lh6.googleusercontent.com hosts Google uses for avatars (rotated for
    // load balancing) rather than a `*.googleusercontent.com` wildcard.
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "lh4.googleusercontent.com" },
      { protocol: "https", hostname: "lh5.googleusercontent.com" },
      { protocol: "https", hostname: "lh6.googleusercontent.com" },
      // Landing page food photography (app/marketing/LandingPage.tsx) -
      // Unsplash-licensed (free to use, no attribution required), served
      // from Unsplash's own CDN rather than downloaded into the repo.
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
