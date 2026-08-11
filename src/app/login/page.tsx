'use client'

import { useState } from 'react'
import { sendMagicLink } from './actions'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    const result = await sendMagicLink(email)
    setStatus(result.success ? 'sent' : 'error')
  }

  if (status === 'sent') {
    return (
      <div className="mx-auto mt-32 flex max-w-sm flex-col items-center gap-3 px-4 text-center">
        <span className="h-1.5 w-1.5 rounded-full bg-wine" aria-hidden="true" />
        <h1 className="font-display text-2xl font-medium tracking-tight">Check your email</h1>
        <p className="text-sm text-slate">
          We sent a sign-in link to <span className="text-ink">{email}</span>. Open it on this
          device to continue.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto mt-32 max-w-sm px-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-widest text-slate">Sign in</span>
          <h1 className="font-display text-2xl font-medium tracking-tight">cre-copilot</h1>
        </div>
        <p className="text-sm text-slate">
          Enter your email and we&apos;ll send you a link to sign in — no password to remember.
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-xs uppercase tracking-widest text-slate">Email</span>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-slate/70 focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
        </label>
        <button
          type="submit"
          disabled={status === 'sending'}
          className="rounded-md bg-ink px-3 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-forest disabled:opacity-50"
        >
          {status === 'sending' ? 'Sending...' : 'Send sign-in link'}
        </button>
        {status === 'error' && (
          <p className="text-sm text-brick">
            Something went wrong sending that link. Check the address and try again.
          </p>
        )}
      </form>
    </div>
  )
}
