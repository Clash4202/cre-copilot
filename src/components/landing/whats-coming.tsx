'use client'

import { ParallaxImage } from './parallax-image'
import { Reveal } from './reveal'
import { SectionShell } from './section-shell'

const UPCOMING = [
  {
    title: 'Spreadsheets',
    body: 'Turn a set of questions across your documents into a structured table you can export and work with.',
  },
  {
    title: 'Trend detection',
    body: 'Surface patterns across your documents automatically, not just answers to what you ask.',
  },
]

export function WhatsComing() {
  return (
    <SectionShell
      className="py-24 sm:py-32"
      bleed={
        <div className="absolute inset-y-0 right-0 hidden w-72 lg:block">
          <ParallaxImage
            src="/images/office-glass-detail.jpg"
            className="absolute inset-0 opacity-[0.22] dark:opacity-[0.3]"
          />
          <div className="absolute inset-0 bg-gradient-to-l from-transparent via-paper/70 to-paper" />
        </div>
      }
    >
      <Reveal>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-widest text-slate">
            What&apos;s coming
          </span>
          <span className="rounded-full border border-brass/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-brass">
            Coming soon
          </span>
        </div>
      </Reveal>
      <div className="relative mt-12 grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-2">
        {UPCOMING.map((item, i) => (
          <Reveal key={item.title} delay={i * 0.1} className="bg-paper">
            <div className="h-full p-8">
              <span className="font-mono text-xs text-brass">0{i + 1}</span>
              <h3 className="mt-3 font-display text-xl font-medium tracking-tight text-ink">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate">{item.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </SectionShell>
  )
}
