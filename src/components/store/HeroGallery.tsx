'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  images: string[]
  alt: string
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  interval?: number
  sizes?: string
}

// Auto-rotating hero photo gallery (Pro-édition "photo swipe"). Crossfades
// between a product's photos, with dots and prev/next arrows. Falls back to a
// static placeholder when there's nothing to show.
export default function HeroGallery({
  images,
  alt,
  placeholder = '❦',
  className = '',
  style,
  interval = 4500,
  sizes = '(max-width: 768px) 100vw, 50vw',
}: Props) {
  const list = images.filter(Boolean)
  const [index, setIndex] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const go = (i: number) => {
    if (list.length === 0) return
    setIndex(((i % list.length) + list.length) % list.length)
  }

  useEffect(() => {
    if (list.length < 2) return
    timer.current = setInterval(() => setIndex(i => (i + 1) % list.length), interval)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [list.length, interval])

  if (list.length === 0) {
    return (
      <div className={`relative ${className}`} style={style}>
        <div className="w-full h-full flex items-center justify-center text-5xl" style={{ color: 'currentColor', opacity: 0.3 }}>
          {placeholder}
        </div>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`} style={style}>
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="absolute inset-0"
        >
          <Image src={list[index]} alt={alt} fill sizes={sizes} priority={index === 0} className="object-cover" />
        </motion.div>
      </AnimatePresence>

      {list.length > 1 && (
        <>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
            {list.map((_, i) => (
              <button
                key={i}
                onClick={() => go(i)}
                aria-label={`Photo ${i + 1}`}
                className="h-2 rounded-full transition-all duration-300"
                style={{
                  width: i === index ? 18 : 8,
                  background: i === index ? '#ffffff' : 'rgba(255,255,255,0.45)',
                }}
              />
            ))}
          </div>
          <button
            onClick={() => go(index - 1)}
            aria-label="Photo précédente"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/25 text-white flex items-center justify-center text-lg z-10 hover:bg-black/50 hover:scale-105 transition-all backdrop-blur-sm"
          >
            ‹
          </button>
          <button
            onClick={() => go(index + 1)}
            aria-label="Photo suivante"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/25 text-white flex items-center justify-center text-lg z-10 hover:bg-black/50 hover:scale-105 transition-all backdrop-blur-sm"
          >
            ›
          </button>
        </>
      )}
    </div>
  )
}
