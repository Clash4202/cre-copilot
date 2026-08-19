import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { runModelGeneration } from './actions'
import type { MappingField } from '@/lib/template-mapping'

interface TemplateOption {
  id: string
  name: string
  asset_type: string
  mapping: { fields: MappingField[] } | null
}

export default async function ModelGenerationPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const supabase = await createClient()

  const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).single()
  if (!project) notFound()

  const { data: templateRows } = await supabase
    .from('templates')
    .select('id, name, asset_type, mapping')
    .eq('mapping_status', 'confirmed')
  const templates = (templateRows ?? []) as unknown as TemplateOption[]

  const { data: links } = await supabase
    .from('project_documents')
    .select('documents(id, file_name, detected_kind)')
    .eq('project_id', projectId)

  const documents = ((links ?? []) as unknown as { documents: { id: string; file_name: string; detected_kind: string | null } }[])
    .map((link) => link.documents)
    .filter(Boolean)
  const t12Documents = documents.filter((d) => d.detected_kind === 't12')
  const rentRollDocuments = documents.filter((d) => d.detected_kind === 'rent_roll')

  const generateForProject = runModelGeneration.bind(null, projectId)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-slate">Model</span>
        <h1 className="font-display text-3xl font-medium tracking-tight">Generate a model</h1>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-slate">
          No confirmed templates yet. Add one from the{' '}
          <a href="/inbox" className="text-wine hover:text-brick">
            Inbox
          </a>
          , then analyze and confirm its mapping in{' '}
          <a href="/libraries" className="text-wine hover:text-brick">
            Libraries
          </a>
          .
        </p>
      ) : (
        <form action={generateForProject} className="flex flex-col gap-6">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-mono text-xs uppercase tracking-widest text-slate">Template</span>
            <select name="templateId" required className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink">
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.asset_type})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-mono text-xs uppercase tracking-widest text-slate">T12 (optional)</span>
            <select name="t12DocumentId" className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink">
              <option value="">— none —</option>
              {t12Documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.file_name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-mono text-xs uppercase tracking-widest text-slate">Rent roll (optional)</span>
            <select name="rentRollDocumentId" className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink">
              <option value="">— none —</option>
              {rentRollDocuments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.file_name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-3">
            <span className="font-mono text-xs uppercase tracking-widest text-slate">Assumptions</span>
            {templates.map((t) => {
              const assumptionFields = (t.mapping?.fields ?? []).filter((f) => f.source === 'assumption')
              if (assumptionFields.length === 0) return null
              return (
                <div key={t.id} className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-ink">{t.name}</span>
                  {assumptionFields.map((f) => (
                    <label key={f.id} className="flex items-center gap-2 text-sm">
                      <span className="w-48 text-slate">{f.label}</span>
                      <input
                        type="number"
                        step="any"
                        name={`assumption.${t.id}.${f.id}`}
                        className="flex-1 rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink"
                      />
                    </label>
                  ))}
                </div>
              )
            })}
          </div>

          <button
            type="submit"
            className="self-start rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-forest"
          >
            Generate
          </button>
        </form>
      )}
    </div>
  )
}
