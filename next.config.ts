import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Google OAuth avatar URLs (app/auth/callback/route.ts reads
    // user.user_metadata.avatar_url from Google Sign-In). Scoped to Google's
    // actual avatar host pattern - lh3/lh4/lh5/lh6.googleusercontent.com are
    // all in use for load balancing - not a broad/unrestricted wildcard.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
