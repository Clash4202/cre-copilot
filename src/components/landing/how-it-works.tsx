'use client'

import { Reveal } from './reveal'
import { SectionShell } from './section-shell'

const STEPS = [
  {
    title: 'Upload',
    body: 'Add leases, offering memoranda, T-12s, and market reports — PDFs, including scanned ones.',
  },
  {
    title: 'Ask',
    body: "Ask a question the way you'd ask a colleague who already read the file.",
  },
  {
    title: 'Get a cited answer',
    body: 'Every answer points to the exact document and passage it came from.',
  },
]

export function HowItWorks() {
  return (
    <SectionShell id="how-it-works" className="py-24 sm:py-32">
      <Reveal>
        <span className="font-mono text-xs uppercase tracking-widest text-slate">
          How it works
        </span>
      </Reveal>
      <div className="relative mt-12 flex flex-col gap-12 sm:gap-16">
        <div
          className="absolute bottom-2 left-6 top-2 hidden w-px bg-hairline sm:block"
          aria-hidden="true"
        />
        {STEPS.map((step, i) => (
          <Reveal key={step.title} delay={i * 0.12}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
              <span className="relative z-10 flex h-12 w-12 flex-none items-center justify-center rounded-full border border-hairline bg-paper font-display text-lg text-wine">
                {i + 1}
              </span>
              <div className="max-w-md">
                <h3 className="font-display text-xl font-medium tracking-tight text-ink sm:text-2xl">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate sm:text-base">
                  {step.body}
                </p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </SectionShell>
  )
}
