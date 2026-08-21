'use client'

import { useState, useTransition } from 'react'
import { stageInboxUpload } from './actions'

// Client component so a rate-limit rejection renders in place. See analyze-template-form.tsx for
// why rate-limit rejections are return values rather than thrown errors.
export function InboxUploadForm() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <form
      action={(formData: FormData) => {
        startTransition(async () => {
          setError(null)
          const result = await stageInboxUpload(formData)
          setError(result?.error ?? null)
        })
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-2 rounded-md border border-dashed border-hairline px-6 py-8">
        <input
          type="file"
          name="file"
          accept=".xlsx,.pptx,.pdf,.txt"
          required
          className="flex-1 text-sm text-slate file:mr-3 file:rounded-md file:border file:border-hairline file:bg-paper file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:border-forest"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-forest disabled:opacity-50"
        >
          {isPending ? 'Uploading...' : 'Upload'}
        </button>
      </div>
      {error && <p className="text-sm text-brick">{error}</p>}
    </form>
  )
}
