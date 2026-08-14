import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

interface FilledEntry {
  label: string
  value: number
}

interface GapEntry {
  fieldId: string
  label: string
  reason: string
}

export default async function GeneratedModelPage({
  params,
}: {
  params: Promise<{ projectId: string; generatedModelId: string }>
}) {
  const { generatedModelId } = await params
  const supabase = await createClient()

  const { data: generated } = await supabase
    .from('generated_models')
    .select('id, storage_path, summary, gaps, created_at')
    .eq('id', generatedModelId)
    .single()
  if (!generated) notFound()

  const filled = (generated.summary?.filled ?? []) as FilledEntry[]
  const gaps = (generated.gaps ?? []) as GapEntry[]

  const { data: signedUrl } = await supabase.storage
    .from('generated-models')
    .createSignedUrl(generated.storage_path, 3600)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-slate">Generated model</span>
        <h1 className="font-display text-3xl font-medium tracking-tight">
          {new Date(generated.created_at).toLocaleString()}
        </h1>
      </div>

      {signedUrl?.signedUrl && (
        <a
          href={signedUrl.signedUrl}
          className="self-start rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-forest"
        >
          Download .xlsx
        </a>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-medium tracking-tight">Filled ({filled.length})</h2>
        {filled.length === 0 ? (
          <p className="text-sm text-slate">Nothing was filled.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <tbody>
              {filled.map((entry, i) => (
                <tr key={i} className="border-b border-hairline">
                  <td className="py-2">{entry.label}</td>
                  <td className="py-2 font-mono tabular-nums text-slate">{entry.value.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-medium tracking-tight text-wine">Needs your input ({gaps.length})</h2>
        {gaps.length === 0 ? (
          <p className="text-sm text-slate">Nothing flagged.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {gaps.map((gap) => (
              <li key={gap.fieldId} className="rounded-md border border-wine/30 px-3 py-2 text-sm">
                <span className="font-medium text-ink">{gap.label}</span>
                <span className="block text-xs text-slate">{gap.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
