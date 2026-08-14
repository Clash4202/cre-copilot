import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { saveMapping, confirmMapping } from './actions'
import type { MappingField, MappingSource } from '@/lib/template-mapping'

const SOURCE_OPTIONS: MappingSource[] = [
  'assumption',
  't12_subtotal',
  't12_line_item',
  'rent_roll_unit_count',
  'rent_roll_average_budgeted_rent',
]

export default async function TemplateMappingPage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params
  const supabase = await createClient()

  const { data: template } = await supabase
    .from('templates')
    .select('id, name, asset_type, mapping, mapping_status')
    .eq('id', templateId)
    .single()
  if (!template) notFound()

  const fields = (template.mapping?.fields ?? []) as MappingField[]
  const saveForTemplate = saveMapping.bind(null, templateId)
  const confirmForTemplate = confirmMapping.bind(null, templateId)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-slate">Template mapping</span>
        <h1 className="font-display text-3xl font-medium tracking-tight">{template.name}</h1>
        <p className="text-sm text-slate">
          Review what Claude proposed for each input cell. Correct anything wrong, then confirm — this
          mapping is reused for every future deal on this template.
        </p>
      </div>

      <form action={saveForTemplate} className="flex flex-col gap-3">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-hairline">
              <th className="py-2 font-mono text-xs font-normal uppercase tracking-widest text-slate">Label</th>
              <th className="py-2 font-mono text-xs font-normal uppercase tracking-widest text-slate">Sheet!Cell</th>
              <th className="py-2 font-mono text-xs font-normal uppercase tracking-widest text-slate">Source</th>
              <th className="py-2 font-mono text-xs font-normal uppercase tracking-widest text-slate">Source key</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, i) => (
              <tr key={field.id} className="border-b border-hairline">
                <td className="py-2">
                  <input type="hidden" name={`fields[${i}].id`} value={field.id} />
                  <input
                    name={`fields[${i}].label`}
                    defaultValue={field.label}
                    className="w-full rounded border border-hairline bg-paper px-2 py-1 text-sm"
                  />
                </td>
                <td className="py-2 font-mono text-xs text-slate">
                  <input
                    name={`fields[${i}].sheet`}
                    defaultValue={field.sheet}
                    className="mb-1 w-full rounded border border-hairline bg-paper px-2 py-1 text-xs"
                  />
                  <input
                    name={`fields[${i}].cell`}
                    defaultValue={field.cell}
                    className="w-full rounded border border-hairline bg-paper px-2 py-1 text-xs"
                  />
                </td>
                <td className="py-2">
                  <select
                    name={`fields[${i}].source`}
                    defaultValue={field.source}
                    className="rounded border border-hairline bg-paper px-2 py-1 text-xs"
                  >
                    {SOURCE_OPTIONS.map((source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2">
                  <input
                    name={`fields[${i}].sourceKey`}
                    defaultValue={field.sourceKey ?? ''}
                    placeholder="(none)"
                    className="w-full rounded border border-hairline bg-paper px-2 py-1 text-xs"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <input type="hidden" name="fieldCount" value={fields.length} />
        <button
          type="submit"
          className="self-start rounded-md border border-hairline px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest"
        >
          Save changes
        </button>
      </form>

      <form action={confirmForTemplate}>
        <button
          type="submit"
          disabled={fields.length === 0}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-forest disabled:cursor-not-allowed disabled:opacity-40"
        >
          {template.mapping_status === 'confirmed' ? 'Re-confirm mapping' : 'Confirm mapping'}
        </button>
      </form>
    </div>
  )
}
