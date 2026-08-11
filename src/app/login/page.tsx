'use client'

import { useState } from 'react'
import { sendMagicLink } from './actions'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = await sendMagicLink(email)
    setStatus(result.success ? 'sent' : 'error')
  }

  if (status === 'sent') {
    return <p className="p-8 text-center">Check {email} for a sign-in link.</p>
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-24 flex max-w-sm flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Sign in to cre-copilot</h1>
      <input
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded border px-3 py-2"
      />
      <button type="submit" className="rounded bg-black px-3 py-2 text-white">
        Send magic link
      </button>
      {status === 'error' && <p className="text-red-600">Something went wrong. Try again.</p>}
    </form>
  )
}
