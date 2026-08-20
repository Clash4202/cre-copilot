import { createClient } from '@/lib/supabase/server'
import { confirmInboxItem } from './actions'
import { InboxUploadForm } from './inbox-upload-form'

interface InboxItemRow {
  id: string
  file_name: string
  detected_type: string
  proposal: Record<string, unknown>
}

const TYPE_LABELS: Record<string, string> = {
  property_document: 'T12 / Rent Roll',
  candidate_template: 'Template',
  candidate_bov: 'BOV',
  general_document: 'Document',
}

export default async function InboxPage() {
  const supabase = await createClient()
  const { data: itemsData } = await supabase
    .from('inbox_items')
    .select('id, file_name, detected_type, proposal')
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false })
  const items = (itemsData ?? []) as InboxItemRow[]

  const { data: projectsData } = await supabase.from('projects').select('id, name').order('name')
  const projects = projectsData ?? []

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-slate">Inbox</span>
        <h1 className="font-display text-3xl font-medium tracking-tight">Add files</h1>
        <p className="text-sm text-slate">
          Drop in a T12, rent roll, template, BOV, or any document — we&apos;ll figure out what it is
          and where it belongs. You confirm before anything is filed.
        </p>
      </div>

      <InboxUploadForm />

      {items.length === 0 ? (
        <p className="text-sm text-slate">Nothing pending review.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 rounded-md border border-hairline px-4 py-4">
              <div className="flex items-center justify-between">
                <span className="font-display text-base font-medium tracking-tight text-ink">{item.file_name}</span>
                <span className="rounded-full border border-hairline px-2 py-0.5 font-mono text-xs text-slate">
                  {TYPE_LABELS[item.detected_type] ?? item.detected_type}
                </span>
              </div>

              <form action={confirmInboxItem.bind(null, item.id)} className="flex flex-col gap-2">
                {(item.detected_type === 'property_document' || item.detected_type === 'general_document') && (
                  <>
                    <label className="text-xs text-slate">Property / project</label>
                    <select
                      name="existingProjectId"
                      defaultValue={(item.proposal.matchedProjectId as string | null) ?? ''}
                      className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
                    >
                      <option value="">Create new project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      name="propertyName"
                      defaultValue={
                        (item.proposal.matchedProjectName as string | null) ??
                        (item.proposal.propertyName as string | null) ??
                        ''
                      }
                      placeholder="New project name"
                      className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
                    />
                  </>
                )}

                {(item.detected_type === 'candidate_template' || item.detected_type === 'candidate_bov') && (
                  <>
                    <input type="hidden" name="existingLibraryId" value={(item.proposal.libraryId as string) ?? ''} />
                    <input type="hidden" name="existingSectionId" value={(item.proposal.sectionId as string) ?? ''} />
                    {/* The proposed names travel with the ids so confirmInboxItem can tell an
                        untouched proposal from one the user edited; an edited name must create a
                        new library/section rather than silently filing into the proposed one. */}
                    <input type="hidden" name="proposedLibraryName" value={(item.proposal.libraryName as string) ?? ''} />
                    <input type="hidden" name="proposedSectionName" value={(item.proposal.sectionName as string) ?? ''} />
                    <label className="text-xs text-slate">Library</label>
                    <input
                      type="text"
                      name="libraryName"
                      defaultValue={(item.proposal.libraryName as string) ?? ''}
                      required
                      className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
                    />
                    <label className="text-xs text-slate">Section</label>
                    <input
                      type="text"
                      name="sectionName"
                      defaultValue={(item.proposal.sectionName as string) ?? ''}
                      required
                      className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
                    />
                    <label className="text-xs text-slate">Section description</label>
                    <input
                      type="text"
                      name="sectionDescription"
                      defaultValue={(item.proposal.sectionDescription as string) ?? ''}
                      required
                      className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
                    />
                  </>
                )}

                <button
                  type="submit"
                  className="mt-1 self-start rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-forest"
                >
                  Confirm
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
