'use client'

import { PlayCircle } from 'lucide-react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { toYoutubeEmbedUrl } from '@/lib/youtube'

// Paste your YouTube video URLs here — any format works (a normal share link
// like youtube.com/watch?v=..., a youtu.be/... short link, a /shorts/... link,
// or an already-built /embed/... URL). Leave a slot empty to show a placeholder.
// This page lives behind the dashboard's own auth + activation gate
// (middleware.ts redirects unpaid/suspended stores to /activate before they
// ever reach /dashboard/**), so only store owners who've paid for a plan can
// see it — no extra plan check needed here.
const TUTORIAL_VIDEO_URL_PART_1 = 'https://youtu.be/bXoUl_jnGic'
const TUTORIAL_VIDEO_URL_PART_2 = 'https://youtu.be/bXoUl_jnGic'

export default function TutorialPage() {
  const { t } = useI18n()

  const videos = [
    { label: t('tutorial.part1'), url: TUTORIAL_VIDEO_URL_PART_1 },
    { label: t('tutorial.part2'), url: TUTORIAL_VIDEO_URL_PART_2 },
  ]

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">{t('tutorial.title')}</h1>
        <p className="text-dash-ink-soft text-sm mt-1">{t('tutorial.subtitle')}</p>
      </div>

      <div className="space-y-8">
        {videos.map((video) => {
          const embedUrl = toYoutubeEmbedUrl(video.url)
          return (
            <div key={video.label} className="space-y-2">
              <h2 className="text-sm font-medium text-dash-ink-soft">{video.label}</h2>
              <div className="rounded-[20px] overflow-hidden aspect-video bg-dash-surface border border-dash-border shadow-[0_24px_60px_-24px_rgba(20,26,33,0.18)]">
                {embedUrl ? (
                  <iframe
                    className="w-full h-full"
                    src={embedUrl}
                    title={`Krenix — ${video.label}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-dash-ink-faint">
                    <PlayCircle size={40} />
                    <p className="text-sm">{t('tutorial.placeholder')}</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
