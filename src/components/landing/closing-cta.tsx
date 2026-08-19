'use client'

import { ParallaxImage } from './parallax-image'
import { Reveal } from './reveal'
import { SectionShell } from './section-shell'
import { Skyline } from './skyline'

export function ClosingCTA() {
  return (
    <SectionShell
      className="py-24 text-center sm:py-32"
      bleed={
        <>
          <ParallaxImage
            src="/images/data-glow-abstract.jpg"
            className="absolute inset-0 opacity-[0.1] dark:opacity-[0.18]"
            range={18}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-paper via-transparent to-paper/80" />
          <Skyline
            variant="closing"
            color="brass"
            className="absolute inset-x-0 bottom-0 h-[35%] w-full opacity-[0.1]"
          />
        </>
      }
    >
      <Reveal>
        <h2 className="font-display text-[clamp(2rem,4.5vw,4rem)] font-medium tracking-tight text-ink">
          Your documents already have the answer.
        </h2>
      </Reveal>
      <Reveal delay={0.1}>
        <p className="mt-4 text-base text-slate sm:text-lg">Let&apos;s find it together.</p>
      </Reveal>
      <Reveal delay={0.2}>
        <a
          href="#demo"
          className="mt-8 inline-block rounded-md bg-ink px-6 py-3 text-sm font-medium text-paper shadow-sm transition hover:-translate-y-0.5 hover:bg-forest motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          Book a demo
        </a>
      </Reveal>
    </SectionShell>
  )
}
