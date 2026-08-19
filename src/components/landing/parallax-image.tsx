'use client'

import Image from 'next/image'
import { useRef } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'

interface ParallaxImageProps {
  src: string
  className?: string
  imgClassName?: string
  /** Pixels of vertical drift across the scroll pass. */
  range?: number
  priority?: boolean
}

// Decorative-only (aria-hidden by the caller's wrapper), so this never
// carries real alt text: it's texture, not content. Drift is skipped
// entirely under prefers-reduced-motion rather than just slowed down.
export function ParallaxImage({
  src,
  className = '',
  imgClassName = '',
  range = 32,
  priority = false,
}: ParallaxImageProps) {
  const ref = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], shouldReduceMotion ? [0, 0] : [-range, range])

  return (
    <div ref={ref} className={`overflow-hidden ${className}`}>
      <motion.div style={{ y }} className="relative h-[120%] w-full -translate-y-[8%]">
        <Image
          src={src}
          alt=""
          fill
          priority={priority}
          className={`object-cover ${imgClassName}`}
          sizes="(min-width: 1024px) 50vw, 100vw"
        />
      </motion.div>
    </div>
  )
}
