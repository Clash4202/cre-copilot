'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { confirmInboxItem } from './actions'

// Client component so a rate-limit rejection renders in place. The fields themselves stay in the
// page as children, since they are per-item server-rendered markup with no client behavior.
export function InboxConfirmForm({ itemId, children }: { itemId: string; children: ReactNode }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <form
      action={(formData: FormData) => {
        startTransition(async () => {
          const result = await confirmInboxItem(itemId, formData)
          setError(result?.error ?? null)
        })
      }}
      className="flex flex-col gap-2"
    >
      {children}
      <button
        type="submit"
        disabled={isPending}
        className="mt-1 self-start rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-forest disabled:opacity-50"
      >
        {isPending ? 'Confirming...' : 'Confirm'}
      </button>
      {error && <p className="text-sm text-brick">{error}</p>}
    </form>
  )
}
