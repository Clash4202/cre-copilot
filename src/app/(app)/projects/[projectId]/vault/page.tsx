import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { uploadDocument } from './actions'

const STATUS_LABEL: Record<string, string> = {
  ready: 'Ready to search',
  processing: 'Processing',
  failed: 'Failed',
}

const STATUS_DOT: Record<string, string> = {
  ready: 'bg-forest',
  processing: 'bg-slate',
  failed: 'bg-brick',
}

interface DocumentRow {
  id: string
  file_name: string
  doc_type: string | null
  status: string
  created_at: string
  ocr_page_count: number
}

export default async function ProjectVaultPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const supabase = await createClient()

  const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).single()
  if (!project) notFound()

  const { data: links } = await supabase
    .from('project_documents')
    .select('created_at, documents(id, file_name, doc_type, status, created_at, ocr_page_count)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  const documents = ((links ?? []) as unknown as { documents: DocumentRow }[])
    .map((link) => link.documents)
    .filter(Boolean)

  const docCount = documents.length
  const readyCount = documents.filter((d) => d.status === 'ready').length
  const uploadToThisProject = uploadDocument.bind(null, projectId)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-slate">Vault</span>
        <h1 className="font-display text-3xl font-medium tracking-tight">This project&apos;s documents</h1>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 rounded-md border border-hairline px-4 py-3">
          <div className="font-mono text-2xl tabular-nums">{docCount}</div>
          <div className="text-xs text-slate">documents in this project</div>
        </div>
        <div className="flex-1 rounded-md border border-hairline px-4 py-3">
          <div className="font-mono text-2xl tabular-nums text-forest">{readyCount}</div>
          <div className="text-xs text-slate">ready to search</div>
        </div>
      </div>

      <form
        action={uploadToThisProject}
        className="flex flex-col items-center gap-2 rounded-md border border-dashed border-hairline px-6 py-8 text-center"
      >
        <p className="text-sm text-slate">Add a PDF or plain text file to this project.</p>
        <div className="flex items-center gap-2">
          <input
            type="file"
            name="file"
            accept=".pdf,.txt"
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

      {docCount === 0 ? (
        <p className="text-sm text-slate">
          No documents yet. Upload your first file above to start building this project&apos;s vault.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-hairline">
              <th className="py-2 font-mono text-xs font-normal uppercase tracking-widest text-slate">File</th>
              <th className="py-2 font-mono text-xs font-normal uppercase tracking-widest text-slate">Status</th>
              <th className="py-2 font-mono text-xs font-normal uppercase tracking-widest text-slate">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id} className="border-b border-hairline">
                <td className="py-3">
                  <span className="flex items-center gap-2">
                    {doc.file_name}
                    {doc.ocr_page_count > 0 && (
                      <span
                        className="rounded-full border border-wine/30 px-1.5 py-0.5 font-mono text-[10px] text-wine"
                        title={`This PDF had ${doc.ocr_page_count} image-only page${doc.ocr_page_count === 1 ? '' : 's'}, so the whole document was transcribed by AI. Double-check exact figures against the original.`}
                      >
                        AI-transcribed
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-3">
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[doc.status] ?? 'bg-slate'}`}
                      aria-hidden="true"
                    />
                    {STATUS_LABEL[doc.status] ?? doc.status}
                  </span>
                </td>
                <td className="py-3 font-mono text-xs tabular-nums text-slate">
                  {new Date(doc.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
