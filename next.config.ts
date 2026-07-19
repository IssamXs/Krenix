import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the Cloudflare quick-tunnel origin to load Next.js dev resources
  // (HMR + static chunks). Required for HTTPS testing (e.g. Facebook login,
  // which refuses http). trycloudflare subdomains rotate, so allow the wildcard.
  allowedDevOrigins: ['*.trycloudflare.com', '*.lhr.life'],
};

export default nextConfig;
