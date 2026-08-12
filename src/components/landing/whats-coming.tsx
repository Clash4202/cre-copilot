'use client'

import { Reveal } from './reveal'

const UPCOMING = [
  {
    title: 'Spreadsheets',
    body: 'Turn a set of questions across your documents into a structured table you can export and work with.',
  },
  {
    title: 'Trend detection',
    body: 'Surface patterns across your documents automatically — not just answers to what you ask.',
  },
]

export function WhatsComing() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <Reveal>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-widest text-slate">
            What&apos;s coming
          </span>
          <span className="rounded-full border border-hairline px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-wine">
            Coming soon
          </span>
        </div>
      </Reveal>
      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        {UPCOMING.map((item, i) => (
          <Reveal key={item.title} delay={i * 0.1}>
            <div className="rounded-lg border border-hairline p-6">
              <h3 className="font-display text-lg font-medium tracking-tight text-ink">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate">{item.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
