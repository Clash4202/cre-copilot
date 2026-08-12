'use client'

import { Reveal } from './reveal'

const FAQS = [
  {
    q: 'Is my data secure?',
    a: 'Your documents are private to your account, protected by row-level security in the database. Nothing you upload is used to train any model.',
  },
  {
    q: 'What file types are supported?',
    a: 'PDFs today, including scanned or image-only PDFs — those are automatically transcribed so they\'re still searchable.',
  },
  {
    q: 'How is this different from just using ChatGPT or Claude directly?',
    a: 'Every answer is grounded in and cites the exact document and passage it came from, instead of a general-purpose model guessing from memory.',
  },
]

export function FAQ() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <Reveal>
        <span className="font-mono text-xs uppercase tracking-widest text-slate">FAQ</span>
      </Reveal>
      <div className="mt-8 flex flex-col divide-y divide-hairline">
        {FAQS.map((item, i) => (
          <Reveal key={item.q} delay={i * 0.08}>
            <div className="py-5">
              <h3 className="font-display text-base font-medium tracking-tight text-ink">
                {item.q}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate">{item.a}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
