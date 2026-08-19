'use client'

import { ParallaxImage } from './parallax-image'
import { Reveal } from './reveal'
import { SectionShell } from './section-shell'

const FAQS = [
  {
    q: 'Is my data secure?',
    a: 'Your documents are private to your account, protected by row-level security in the database. Nothing you upload is used to train any model.',
  },
  {
    q: 'What file types are supported?',
    a: "PDFs today, including scanned or image-only PDFs. Those are automatically transcribed so they're still searchable.",
  },
  {
    q: 'How is this different from just using ChatGPT or Claude directly?',
    a: 'Every answer is grounded in and cites the exact document and passage it came from, instead of a general-purpose model guessing from memory.',
  },
]

export function FAQ() {
  return (
    <SectionShell
      id="faq"
      className="py-24 sm:py-32"
      bleed={
        <div className="absolute inset-y-0 left-0 hidden w-64 xl:block">
          <ParallaxImage
            src="/images/ledger-texture.jpg"
            className="absolute inset-0 opacity-[0.18] dark:opacity-[0.26]"
            range={20}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-paper/70 to-paper" />
        </div>
      }
    >
      <div className="grid gap-10 sm:grid-cols-[minmax(0,320px)_1fr] sm:gap-16">
        <Reveal>
          <span className="font-mono text-xs uppercase tracking-widest text-slate">FAQ</span>
          <h2 className="mt-3 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-medium tracking-tight text-ink">
            Common questions
          </h2>
        </Reveal>
        <div className="flex flex-col divide-y divide-hairline">
          {FAQS.map((item, i) => (
            <Reveal key={item.q} delay={i * 0.08}>
              <div className="py-6 first:pt-0">
                <h3 className="font-display text-lg font-medium tracking-tight text-ink">
                  {item.q}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate sm:text-base">{item.a}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </SectionShell>
  )
}
