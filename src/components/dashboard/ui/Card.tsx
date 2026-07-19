'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { fadeUp, cardHover } from '@/lib/dashboard-motion'

interface CardProps extends Omit<HTMLMotionProps<'div'>, 'ref'> {
  hover?: boolean
  delayMs?: number
  padding?: 'sm' | 'md' | 'lg'
}

const PADDING = { sm: 'p-4', md: 'p-6', lg: 'p-[26px]' }

// The base surface every dashboard card sits on — rounded-20px white card,
// hairline border, fade-up-on-mount, optional lift-on-hover. Every
// stat/chart/table wrapper in the redesign uses this instead of re-writing
// the same border/radius/shadow combination per page.
export default function Card({ hover = false, delayMs = 0, padding = 'lg', className = '', children, ...rest }: CardProps) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: delayMs / 1000 }}
      {...(hover ? cardHover : {})}
      className={`bg-dash-surface border border-dash-border rounded-[20px] ${PADDING[padding]} ${className}`}
      {...rest}
    >
      {children}
    </motion.div>
  )
}
