import { createClient } from '@/lib/supabase/server'
import { uploadDocument } from './actions'

export default async function VaultPage() {
  const supabase = await createClient()
  const { data: documents } = await supabase
    .from('documents')
    .select('id, file_name, doc_type, status, created_at')
    .order('created_at', { ascending: false })

  const docCount = documents?.length ?? 0
  const readyCount = documents?.filter((d) => d.status === 'ready').length ?? 0

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Vault</h1>
      <div className="flex gap-6 text-sm text-gray-600">
        <span>{docCount} documents</span>
        <span>{readyCount} ready to search</span>
      </div>

      <form action={uploadDocument} className="flex items-center gap-2">
        <input type="file" name="file" accept=".pdf,.txt" required className="text-sm" />
        <button type="submit" className="rounded bg-black px-4 py-2 text-sm text-white">
          Upload
        </button>
      </form>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">File</th>
            <th className="py-2">Status</th>
            <th className="py-2">Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {(documents ?? []).map((doc) => (
            <tr key={doc.id} className="border-b">
              <td className="py-2">{doc.file_name}</td>
              <td className="py-2">{doc.status}</td>
              <td className="py-2">{new Date(doc.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
