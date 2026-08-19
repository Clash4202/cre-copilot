'use client'

import { useState } from 'react'
import { requestDemo } from '@/app/actions'
import { SectionShell } from './section-shell'

const TRUST_POINTS = [
  'Your documents stay private to your account.',
  'Nothing you upload is used to train any model.',
]

export function DemoForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [firm, setFirm] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    const result = await requestDemo({ name, email, firm, note })
    setStatus(result.success ? 'sent' : 'error')
  }

  if (status === 'sent') {
    return (
      <SectionShell id="demo" className="py-24 text-center sm:py-32">
        <span className="mx-auto block h-1.5 w-1.5 rounded-full bg-wine" aria-hidden="true" />
        <h2 className="mt-3 font-display text-2xl font-medium tracking-tight text-ink">
          Thanks, we&apos;ll be in touch
        </h2>
        <p className="mt-2 text-sm text-slate">We usually respond within a day or two.</p>
      </SectionShell>
    )
  }

  return (
    <SectionShell id="demo" className="py-24 sm:py-32">
      <div className="grid gap-12 sm:grid-cols-2 sm:gap-20">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-widest text-slate">
              Book a demo
            </span>
            <h2 className="font-display text-[clamp(1.75rem,3vw,2.75rem)] font-medium tracking-tight text-ink">
              Tell us about your deals
            </h2>
          </div>
          <ul className="flex flex-col gap-3">
            {TRUST_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2 text-sm text-slate">
                <span
                  className="mt-1.5 h-1 w-1 flex-none rounded-full bg-wine"
                  aria-hidden="true"
                />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-widest text-slate">Name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-slate/70 focus:border-forest focus:ring-2 focus:ring-forest/20"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-widest text-slate">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-slate/70 focus:border-forest focus:ring-2 focus:ring-forest/20"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-widest text-slate">Firm</span>
            <input
              value={firm}
              onChange={(e) => setFirm(e.target.value)}
              className="rounded-md border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-slate/70 focus:border-forest focus:ring-2 focus:ring-forest/20"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-widest text-slate">
              What are you hoping to do?
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="rounded-md border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-slate/70 focus:border-forest focus:ring-2 focus:ring-forest/20"
            />
          </label>
          <button
            type="submit"
            disabled={status === 'sending'}
            className="mt-2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper shadow-sm transition hover:-translate-y-0.5 hover:bg-forest disabled:opacity-50 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            {status === 'sending' ? 'Sending...' : 'Request a demo'}
          </button>
          {status === 'error' && (
            <p className="text-sm text-brick">
              Something went wrong sending that. Try again, or email us directly.
            </p>
          )}
        </form>
      </div>
    </SectionShell>
  )
}
