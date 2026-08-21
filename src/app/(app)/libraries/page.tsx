import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createLibrary, createSection } from './actions'
import { AnalyzeTemplateForm } from './analyze-template-form'

interface SectionRow {
  id: string
  name: string
  description: string
}

interface LibraryRow {
  id: string
  name: string
}

interface TemplateFileRow {
  id: string
  name: string
  mapping_status: string
  mapping: { fields: unknown[] } | null
  section_id: string | null
}

interface BovFileRow {
  id: string
  name: string
  mapping_status: string
  section_id: string | null
}

export default async function LibrariesPage({
  searchParams,
}: {
  searchParams: Promise<{ library?: string }>
}) {
  const { library: selectedLibraryId } = await searchParams
  const supabase = await createClient()

  const { data: librariesData } = await supabase
    .from('libraries')
    .select('id, name')
    .order('created_at', { ascending: true })
  const libraries = (librariesData ?? []) as LibraryRow[]

  const activeLibrary = selectedLibraryId
    ? libraries.find((l) => l.id === selectedLibraryId)
    : libraries[0]

  let sections: SectionRow[] = []
  const templatesBySectionId = new Map<string, TemplateFileRow[]>()
  const bovsBySectionId = new Map<string, BovFileRow[]>()

  if (activeLibrary) {
    const { data: sectionsData } = await supabase
      .from('library_sections')
      .select('id, name, description')
      .eq('library_id', activeLibrary.id)
      .order('created_at', { ascending: true })
    sections = (sectionsData ?? []) as SectionRow[]

    const sectionIds = sections.map((s) => s.id)

    const { data: templatesData } = await supabase
      .from('templates')
      .select('id, name, mapping_status, mapping, section_id')
      .in('section_id', sectionIds.length > 0 ? sectionIds : ['00000000-0000-0000-0000-000000000000'])
    for (const t of (templatesData ?? []) as TemplateFileRow[]) {
      const list = templatesBySectionId.get(t.section_id!) ?? []
      list.push(t)
      templatesBySectionId.set(t.section_id!, list)
    }

    const { data: bovsData } = await supabase
      .from('bov_templates')
      .select('id, name, mapping_status, section_id')
      .in('section_id', sectionIds.length > 0 ? sectionIds : ['00000000-0000-0000-0000-000000000000'])
    for (const b of (bovsData ?? []) as BovFileRow[]) {
      const list = bovsBySectionId.get(b.section_id!) ?? []
      list.push(b)
      bovsBySectionId.set(b.section_id!, list)
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-slate">Libraries</span>
        <h1 className="font-display text-3xl font-medium tracking-tight">Templates &amp; BOVs</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-hairline pb-4">
        {libraries.map((library) => (
          <Link
            key={library.id}
            href={`/libraries?library=${library.id}`}
            className={`rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-widest transition-colors ${
              activeLibrary?.id === library.id
                ? 'border-forest bg-forest/10 text-forest'
                : 'border-hairline text-slate hover:text-ink'
            }`}
          >
            {library.name}
          </Link>
        ))}
        <form action={createLibrary} className="flex items-center gap-2">
          <input
            type="text"
            name="name"
            placeholder="New library name"
            required
            className="rounded-md border border-hairline bg-paper px-2 py-1 text-xs text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
          <button type="submit" className="font-mono text-xs uppercase tracking-widest text-wine hover:text-brick">
            + Library
          </button>
        </form>
      </div>

      {!activeLibrary ? (
        <p className="text-sm text-slate">No libraries yet. Create one above, or drop a file into the Inbox and confirm where it goes.</p>
      ) : (
        <div className="flex flex-col gap-6">
          <form action={createSection.bind(null, activeLibrary.id)} className="flex flex-col gap-2 rounded-md border border-dashed border-hairline px-4 py-4">
            <p className="text-sm text-slate">Add a section to {activeLibrary.name}.</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                name="name"
                placeholder="Section name (e.g. Office Building Template)"
                required
                className="flex-1 rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
              />
              <input
                type="text"
                name="description"
                placeholder="Description (used to auto-match files and requests)"
                required
                className="flex-[2] rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
              />
              <button type="submit" className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-forest">
                Add section
              </button>
            </div>
          </form>

          {sections.length === 0 ? (
            <p className="text-sm text-slate">No sections yet in {activeLibrary.name}.</p>
          ) : (
            sections.map((section) => {
              const templateFiles = templatesBySectionId.get(section.id) ?? []
              const bovFiles = bovsBySectionId.get(section.id) ?? []
              return (
                <div key={section.id} className="flex flex-col gap-2 rounded-md border border-hairline px-4 py-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-display text-base font-medium tracking-tight text-ink">{section.name}</span>
                    <span className="text-xs text-slate">{section.description}</span>
                  </div>
                  {templateFiles.length === 0 && bovFiles.length === 0 ? (
                    <p className="text-xs text-slate">No files in this section yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {templateFiles.map((t) => {
                        const hasProposal = Array.isArray(t.mapping?.fields) && t.mapping.fields.length > 0
                        return (
                        <li key={t.id} className="flex items-center justify-between text-sm">
                          <span className="text-ink">{t.name}</span>
                          <div className="flex items-center gap-3">
                            <span className={`rounded-full border px-2 py-0.5 font-mono text-xs ${
                              t.mapping_status === 'confirmed' ? 'border-forest/30 text-forest' : 'border-wine/30 text-wine'
                            }`}>
                              {t.mapping_status === 'confirmed' ? 'Confirmed' : 'Pending review'}
                            </span>
                            {hasProposal || t.mapping_status === 'confirmed' ? (
                              <Link href={`/templates/${t.id}/mapping`} className="font-mono text-xs uppercase tracking-widest text-wine hover:text-brick">
                                Review mapping →
                              </Link>
                            ) : (
                              <AnalyzeTemplateForm templateId={t.id} />
                            )}
                          </div>
                        </li>
                        )
                      })}
                      {bovFiles.map((b) => (
                        <li key={b.id} className="flex items-center justify-between text-sm">
                          <span className="text-ink">{b.name}</span>
                          <span className="rounded-full border border-hairline px-2 py-0.5 font-mono text-xs text-slate">
                            BOV — mapping not available yet
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
