'use client'

import { Reveal } from './reveal'

const STEPS = [
  {
    title: 'Upload',
    body: 'Add leases, offering memoranda, T-12s, and market reports — PDFs, including scanned ones.',
  },
  {
    title: 'Ask',
    body: 'Ask a question the way you\'d ask a colleague who already read the file.',
  },
  {
    title: 'Get a cited answer',
    body: 'Every answer points to the exact document and passage it came from.',
  },
]

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <Reveal>
        <span className="font-mono text-xs uppercase tracking-widest text-slate">
          How it works
        </span>
      </Reveal>
      <div className="mt-8 grid gap-8 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <Reveal key={step.title} delay={i * 0.1}>
            <div className="flex flex-col gap-2">
              <span className="font-display text-2xl text-wine">{i + 1}</span>
              <h3 className="font-display text-lg font-medium tracking-tight text-ink">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-slate">{step.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
