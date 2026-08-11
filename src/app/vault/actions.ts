'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { extractTextFromFile } from '@/lib/parse'
import { chunkText } from '@/lib/chunk'
import { embedTexts } from '@/lib/voyage'

const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20MB

export async function uploadDocument(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('No file provided')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('File is too large (max 20MB)')
  }
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const isText = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')
  if (!isPdf && !isText) {
    throw new Error('Only PDF and plain text files are supported')
  }

  const storagePath = `${user.id}/${randomUUID()}-${file.name}`
  const { error: uploadError } = await supabase.storage.from('documents').upload(storagePath, file)
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

  const { data: documentRow, error: insertError } = await supabase
    .from('documents')
    .insert({
      user_id: user.id,
      file_name: file.name,
      storage_path: storagePath,
      doc_type: isPdf ? 'pdf' : 'text',
      status: 'processing',
    })
    .select('id')
    .single()
  if (insertError || !documentRow) {
    throw new Error(`Failed to record document: ${insertError?.message}`)
  }

  try {
    const text = await extractTextFromFile(file)
    const chunks = chunkText(text)
    if (chunks.length === 0) {
      throw new Error('No extractable text found in this file')
    }

    const embeddings = await embedTexts(chunks, 'document')

    const { error: chunksError } = await supabase.from('document_chunks').insert(
      chunks.map((content, i) => ({
        document_id: documentRow.id,
        user_id: user.id,
        chunk_index: i,
        content,
        embedding: embeddings[i],
      }))
    )
    if (chunksError) throw new Error(`Failed to store chunks: ${chunksError.message}`)

    await supabase.from('documents').update({ status: 'ready' }).eq('id', documentRow.id)
  } catch (err) {
    await supabase.from('documents').update({ status: 'failed' }).eq('id', documentRow.id)
    throw err
  }

  revalidatePath('/vault')
}
