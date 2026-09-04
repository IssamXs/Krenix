import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the Cloudflare quick-tunnel origin to load Next.js dev resources
  // (HMR + static chunks). Required for HTTPS testing (e.g. Facebook login,
  // which refuses http). trycloudflare subdomains rotate, so allow the wildcard.
  allowedDevOrigins: ['*.trycloudflare.com', '*.lhr.life'],
  images: {
    // Product/logo/banner images are uploaded to Supabase Storage and served
    // from the project's own public bucket (which is already publicly
    // accessible at a direct URL). Serve them WITHOUT the Next.js image
    // optimizer: on the deployed site the platform's image-optimization
    // service returns HTTP 402 (billing/quota), which breaks every product
    // image (broken-image icon / "?" placeholder). `unoptimized` makes
    // `next/image` emit the direct Supabase URL, bypassing that service.
    unoptimized: true,
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
