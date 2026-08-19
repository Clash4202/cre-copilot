'use client'

import { motion, useReducedMotion } from 'motion/react'

interface BaseBuilding {
  src: string
  /** width / height, from the building's trimmed silhouette. */
  ratio: number
}

const BASE_BUILDINGS: BaseBuilding[] = [
  { src: '/images/buildings/building-4.png', ratio: 2.324 },
  { src: '/images/buildings/building-1.png', ratio: 0.814 },
  { src: '/images/buildings/building-6.png', ratio: 0.953 },
  { src: '/images/buildings/building-5.png', ratio: 0.3 },
  { src: '/images/buildings/building-3.png', ratio: 0.461 },
  { src: '/images/buildings/building-2.png', ratio: 0.371 },
]

interface SequenceEntry {
  base: number
  height: number
  flip?: boolean
}

// A long, hand-tuned sequence so the row reads as a wide skyline strip
// instead of a small centered cluster. Reuses the 6 generated silhouettes
// with mirroring and height variation so the repeats aren't obvious.
const HERO_SEQUENCE: SequenceEntry[] = [
  { base: 0, height: 60 },
  { base: 1, height: 110 },
  { base: 2, height: 85 },
  { base: 3, height: 170 },
  { base: 4, height: 150 },
  { base: 5, height: 120 },
  { base: 0, height: 50, flip: true },
  { base: 2, height: 100, flip: true },
  { base: 1, height: 90, flip: true },
  { base: 3, height: 196, flip: true },
  { base: 4, height: 130, flip: true },
  { base: 5, height: 105, flip: true },
]

const CLOSING_SEQUENCE: SequenceEntry[] = HERO_SEQUENCE.slice(0, 8)

type SkylineColor = 'forest' | 'brass' | 'moss'

// Literal class strings (not template-interpolated) so Tailwind's static
// scanner can find them.
const COLOR_CLASS: Record<SkylineColor, string> = {
  forest: 'bg-forest',
  brass: 'bg-brass',
  moss: 'bg-moss',
}

interface SkylineProps {
  variant?: 'hero' | 'closing'
  /** Tuned per call site to whatever sits behind it (photo, gradient). */
  color?: SkylineColor
  className?: string
}

// Each building grows in once, on scroll-into-view, and then sits still: no
// continuous looping motion. Rendered as a single flat brand color via a CSS
// mask (not the generated image's own colors) so it reads as quiet ambient
// texture, not a literal illustration, and follows the light/dark theme
// automatically since it's painted with a theme token, not baked pixels.
// `mix-blend-overlay` lets it merge into whatever photo/gradient sits behind
// it instead of sitting on top as a flat opaque sticker.
export function Skyline({ variant = 'hero', color = 'forest', className = '' }: SkylineProps) {
  const shouldReduceMotion = useReducedMotion()
  const sequence = variant === 'closing' ? CLOSING_SEQUENCE : HERO_SEQUENCE

  return (
    <div className={`flex items-end ${className}`} aria-hidden="true">
      <div className="flex w-full origin-bottom scale-90 items-end justify-between gap-1.5 border-b border-hairline/60 blur-[2px] sm:scale-100 sm:gap-2 sm:blur-[3px]">
        {sequence.map((entry, i) => {
          const building = BASE_BUILDINGS[entry.base]
          const width = Math.round(entry.height * building.ratio)
          return (
            <motion.div
              key={`${entry.base}-${i}`}
              className="relative overflow-hidden"
              style={{ width }}
              initial={shouldReduceMotion ? { height: entry.height } : { height: 0 }}
              whileInView={{ height: entry.height }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{
                duration: shouldReduceMotion ? 0 : 0.9,
                delay: shouldReduceMotion ? 0 : i * 0.07,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <div
                className={`absolute bottom-0 left-0 mix-blend-overlay ${COLOR_CLASS[color]}`}
                style={{
                  width,
                  height: entry.height,
                  maskImage: `url(${building.src})`,
                  WebkitMaskImage: `url(${building.src})`,
                  maskSize: '100% 100%',
                  WebkitMaskSize: '100% 100%',
                  maskRepeat: 'no-repeat',
                  WebkitMaskRepeat: 'no-repeat',
                  transform: entry.flip ? 'scaleX(-1)' : undefined,
                }}
              />
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
