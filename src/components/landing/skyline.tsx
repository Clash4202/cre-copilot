'use client'

import { motion, useReducedMotion } from 'motion/react'

interface Building {
  x: number
  width: number
  height: number
}

const HERO_BUILDINGS: Building[] = [
  { x: 0, width: 46, height: 120 },
  { x: 50, width: 30, height: 78 },
  { x: 84, width: 54, height: 168 },
  { x: 142, width: 38, height: 96 },
  { x: 184, width: 62, height: 196 },
  { x: 250, width: 34, height: 66 },
  { x: 288, width: 46, height: 142 },
  { x: 338, width: 42, height: 108 },
]

const CLOSING_BUILDINGS: Building[] = HERO_BUILDINGS.slice(0, 5)

const BASELINE = 200

interface SkylineProps {
  variant?: 'hero' | 'closing'
  className?: string
}

// Buildings grow in once, on scroll-into-view, and then sit still — no
// continuous looping motion. That keeps this accessible (no auto-playing
// content to worry about under WCAG 2.2.2) and keeps the effect focused
// on the one moment it's meant to land, instead of becoming background
// noise the visitor has to tune out.
export function Skyline({ variant = 'hero', className = '' }: SkylineProps) {
  const shouldReduceMotion = useReducedMotion()
  const buildings = variant === 'closing' ? CLOSING_BUILDINGS : HERO_BUILDINGS
  // Derived from the building data itself so the viewBox can never drift out
  // of sync with it and leave empty gutters at the edges.
  const viewWidth = Math.max(...buildings.map((b) => b.x + b.width)) + 8

  return (
    <svg
      viewBox={`0 0 ${viewWidth} ${BASELINE + 16}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line
        x1={0}
        y1={BASELINE}
        x2={viewWidth}
        y2={BASELINE}
        stroke="var(--color-hairline)"
        strokeWidth={1}
      />
      {buildings.map((building, i) => (
        <motion.rect
          key={building.x}
          x={building.x}
          width={building.width}
          fill="none"
          stroke="var(--color-forest)"
          strokeWidth={1.5}
          initial={
            shouldReduceMotion
              ? { y: BASELINE - building.height, height: building.height }
              : { y: BASELINE, height: 0 }
          }
          whileInView={{ y: BASELINE - building.height, height: building.height }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{
            duration: shouldReduceMotion ? 0 : 1,
            delay: shouldReduceMotion ? 0 : i * 0.09,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      ))}
    </svg>
  )
}
