'use client'

import { ParallaxImage } from './parallax-image'
import { Reveal } from './reveal'
import { SectionShell } from './section-shell'

export function Hero() {
  return (
    <SectionShell
      className="pb-24 pt-40 sm:pb-32 sm:pt-48"
      bleed={
        <>
          <ParallaxImage
            src="/images/hero-skyline-glow.jpg"
            priority
            className="absolute inset-0 opacity-[0.16] dark:opacity-[0.24]"
            range={24}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-paper via-transparent to-paper/80" />
        </>
      }
    >
      <div className="flex max-w-3xl flex-col items-start gap-6 text-left">
        <Reveal>
          <span className="font-mono text-xs uppercase tracking-widest text-slate">
            For commercial real estate
          </span>
        </Reveal>
        <Reveal delay={0.1}>
          <h1 className="font-display text-[clamp(2.75rem,6vw,6.5rem)] font-medium leading-[1.02] tracking-tight text-ink">
            Answers grounded in your own deal documents.
          </h1>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="max-w-xl text-base leading-relaxed text-slate sm:text-lg">
            Upload leases, offering memoranda, and market reports. Ask a question in plain
            English and get an answer that cites the exact page it came from, not a guess.
          </p>
        </Reveal>
        <Reveal delay={0.3}>
          <div className="flex items-center gap-4 pt-2">
            <a
              href="#demo"
              className="rounded-md bg-ink px-5 py-3 text-sm font-medium text-paper shadow-sm transition hover:-translate-y-0.5 hover:bg-forest motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              Book a demo
            </a>
            <a
              href="/login"
              className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
            >
              Sign in
            </a>
          </div>
        </Reveal>
      </div>
    </SectionShell>
  )
}
