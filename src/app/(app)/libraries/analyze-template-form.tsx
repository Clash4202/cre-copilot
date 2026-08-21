'use client'

import { useState, useTransition } from 'react'
import { analyzeTemplate } from '@/app/(app)/templates/actions'

// A client component purely so a rate-limit rejection can be shown in place. In production, Next
// omits everything except an error digest when an error is thrown inside a Server Action, so a
// thrown message would never reach the user. Hitting a limit is expected behavior, not a crash, so
// it comes back as a return value instead.
export function AnalyzeTemplateForm({ templateId }: { templateId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <form
      action={() => {
        startTransition(async () => {
          setError(null)
          const result = await analyzeTemplate(templateId)
          setError(result?.error ?? null)
        })
      }}
      className="flex flex-col items-end gap-1"
    >
      <button
        type="submit"
        disabled={isPending}
        className="font-mono text-xs uppercase tracking-widest text-wine hover:text-brick disabled:opacity-50"
      >
        {isPending ? 'Analyzing...' : 'Analyze →'}
      </button>
      {error && <p className="text-xs text-brick">{error}</p>}
    </form>
  )
}
