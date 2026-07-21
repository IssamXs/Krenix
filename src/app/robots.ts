import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/pricing', '/privacy', '/terms'],
      disallow: [
        '/dashboard',
        '/onboarding',
        '/activate',
        '/super-admin',
        '/api',
        '/auth',
      ],
    },
    sitemap: 'https://krenix.store/sitemap.xml',
  }
}
