import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { uploadTemplate, analyzeTemplate } from './actions'

interface TemplateRow {
  id: string
  name: string
  asset_type: string
  mapping_status: string
  mapping: { fields: unknown[] } | null
  created_at: string
}

export default async function TemplatesPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('templates')
    .select('id, name, asset_type, mapping_status, mapping, created_at')
    .order('created_at', { ascending: false })

  const templates = (data ?? []) as TemplateRow[]

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-slate">Templates</span>
        <h1 className="font-display text-3xl font-medium tracking-tight">Your DCF/direct-cap templates</h1>
      </div>

      <form
        action={uploadTemplate}
        className="flex flex-col gap-3 rounded-md border border-dashed border-hairline px-6 py-8"
      >
        <p className="text-sm text-slate">Upload a blank Excel underwriting template.</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            name="name"
            placeholder="Template name (e.g. Multifamily DCF)"
            required
            className="flex-1 rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
          <input
            type="text"
            name="assetType"
            placeholder="Asset type (e.g. multifamily)"
            required
            className="flex-1 rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            name="file"
            accept=".xlsx"
            required
            className="text-sm text-slate file:mr-3 file:rounded-md file:border file:border-hairline file:bg-paper file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:border-forest"
          />
          <button
            type="submit"
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-forest"
          >
            Upload
          </button>
        </div>
      </form>

      {templates.length === 0 ? (
        <p className="text-sm text-slate">No templates yet. Upload your first one above.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {templates.map((template) => {
            const hasProposal = Array.isArray(template.mapping?.fields) && template.mapping.fields.length > 0
            return (
              <li key={template.id} className="flex items-center justify-between rounded-md border border-hairline px-4 py-3 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="font-display text-base font-medium tracking-tight text-ink">{template.name}</span>
                  <span className="font-mono text-xs text-slate">{template.asset_type}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full border px-2 py-0.5 font-mono text-xs ${
                      template.mapping_status === 'confirmed'
                        ? 'border-forest/30 text-forest'
                        : 'border-wine/30 text-wine'
                    }`}
                  >
                    {template.mapping_status === 'confirmed' ? 'Confirmed' : 'Pending review'}
                  </span>
                  {hasProposal || template.mapping_status === 'confirmed' ? (
                    <Link href={`/templates/${template.id}/mapping`} className="font-mono text-xs uppercase tracking-widest text-wine hover:text-brick">
                      Review mapping →
                    </Link>
                  ) : (
                    <form action={analyzeTemplate.bind(null, template.id)}>
                      <button type="submit" className="font-mono text-xs uppercase tracking-widest text-wine hover:text-brick">
                        Analyze →
                      </button>
                    </form>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
