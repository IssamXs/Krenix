import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the Cloudflare quick-tunnel origin to load Next.js dev resources
  // (HMR + static chunks). Required for HTTPS testing (e.g. Facebook login,
  // which refuses http). trycloudflare subdomains rotate, so allow the wildcard.
  allowedDevOrigins: ['*.trycloudflare.com', '*.lhr.life'],
  images: {
    // Product/logo/banner images are uploaded to Supabase Storage and served
    // from the project's own subdomain — allow any *.supabase.co host so this
    // doesn't need to be updated if the project ref changes.
    remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co', pathname: '/storage/v1/object/public/**' }],
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    // Both are used platform-wide (icons everywhere, motion in the dashboard)
    // with many named imports — this trims per-import module resolution.
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
};

export default nextConfig;
