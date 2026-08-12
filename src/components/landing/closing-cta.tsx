'use client'

import { Reveal } from './reveal'

export function ClosingCTA() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24 text-center">
      <Reveal>
        <h2 className="font-display text-3xl font-medium tracking-tight text-ink sm:text-4xl">
          Your documents already have the answer.
        </h2>
      </Reveal>
      <Reveal delay={0.1}>
        <p className="mt-4 text-base text-slate">Let&apos;s find it together.</p>
      </Reveal>
      <Reveal delay={0.2}>
        <a
          href="#demo"
          className="mt-8 inline-block rounded-md bg-ink px-6 py-3 text-sm font-medium text-paper shadow-sm transition hover:-translate-y-0.5 hover:bg-forest motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          Book a demo
        </a>
      </Reveal>
    </section>
  )
}
