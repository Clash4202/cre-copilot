'use client'

import Link from 'next/link'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ParallaxImage } from '@/components/landing/parallax-image'
import { sendMagicLink } from './actions'

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-between gap-10 px-6 py-10 sm:px-10 lg:px-16 lg:py-12">
        <Link href="/" className="flex items-baseline gap-2 self-start">
          <span className="h-1.5 w-1.5 rounded-full bg-wine" aria-hidden="true" />
          <span className="font-display text-lg font-medium tracking-tight text-ink">
            cre-copilot
          </span>
        </Link>

        <div className="mx-auto w-full max-w-sm">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>

        <p className="self-start font-mono text-[11px] uppercase tracking-widest text-slate/70">
          Answers grounded in your own deal documents.
        </p>
      </div>

      <div className="relative hidden lg:block">
        <ParallaxImage
          src="/images/login-side-panel.jpg"
          className="absolute inset-0"
          range={16}
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/5" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-10 xl:p-14">
          <span className="font-mono text-[11px] uppercase tracking-widest text-[#d9b46a]">
            For commercial real estate
          </span>
          <p className="mt-3 max-w-sm font-display text-2xl font-medium leading-snug tracking-tight text-[#f6f5f0] xl:text-3xl">
            Every answer cites the exact page it came from, not a guess.
          </p>
        </div>
      </div>
    </div>
  )
}

function LoginForm() {
  const searchParams = useSearchParams()
  const linkExpired = searchParams.get('error') === 'invalid_link'
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
      <div className="flex flex-col items-start gap-3 text-left">
        <span className="h-1.5 w-1.5 rounded-full bg-wine" aria-hidden="true" />
        <h1 className="font-display text-2xl font-medium tracking-tight text-ink">
          Check your email
        </h1>
        <p className="text-sm text-slate">
          We sent a sign-in link to <span className="text-ink">{email}</span>. Open it on this
          device to continue.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-brass">Sign in</span>
        <h1 className="font-display text-2xl font-medium tracking-tight text-ink">Welcome back</h1>
      </div>
      <p className="text-sm text-slate">
        Enter your email and we&apos;ll send you a link to sign in. No password to remember.
      </p>
      {linkExpired && (
        <p className="rounded-md border border-brick/30 bg-brick/5 px-3 py-2 text-sm text-brick">
          That link didn&apos;t work. It may have expired or already been used. Request a new one
          below.
        </p>
      )}
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
        className="rounded-md bg-ink px-3 py-2.5 text-sm font-medium text-paper shadow-sm transition hover:-translate-y-0.5 hover:bg-forest disabled:opacity-50 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        {status === 'sending' ? 'Sending...' : 'Send sign-in link'}
      </button>
      {status === 'error' && (
        <p className="text-sm text-brick">
          Something went wrong sending that link. Check the address and try again.
        </p>
      )}
    </form>
  )
}
