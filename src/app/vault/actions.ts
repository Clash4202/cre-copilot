'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { extractTextFromFile, extractPdfPages, isPageScanned } from '@/lib/parse'
import { exceedsOcrLimits, transcribeScannedPdf } from '@/lib/ocr'
import { chunkText } from '@/lib/chunk'
import { embedTexts } from '@/lib/voyage'

const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50MB
const MAX_EXTRACTED_TEXT_CHARS = 2_000_000 // ~generous for a large real OM; blocks decompression-bomb-style PDFs
const MAX_CHUNKS_PER_DOCUMENT = 500 // caps the single Voyage embedding batch and the ingestion cost per upload

function sanitizeFilename(name: string): string {
  // Untrusted input: strip path separators and control characters before it becomes part of a storage key.
  return name.replace(/[/\\]/g, '_').replace(/[\x00-\x1f]/g, '').slice(0, 200) || 'upload'
}

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
    throw new Error('File is too large (max 50MB)')
  }
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const isText = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')
  if (!isPdf && !isText) {
    throw new Error('Only PDF and plain text files are supported')
  }

  const safeName = sanitizeFilename(file.name)
  const storagePath = `${user.id}/${randomUUID()}-${safeName}`
  const { error: uploadError } = await supabase.storage.from('documents').upload(storagePath, file)
  if (uploadError) {
    console.error('Vault upload failed:', uploadError)
    throw new Error('Upload failed. Please try again.')
  }

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
    console.error('Failed to record document:', insertError)
    throw new Error('Could not save this document. Please try again.')
  }

  try {
    let text: string
    let ocrPageCount = 0

    if (isPdf) {
      const arrayBuffer = await file.arrayBuffer()
      const pages = await extractPdfPages(new Uint8Array(arrayBuffer))
      ocrPageCount = pages.filter(isPageScanned).length

      if (ocrPageCount > 0) {
        const limitError = exceedsOcrLimits(file.size, pages.length)
        if (limitError) {
          throw new Error(limitError)
        }
        const ocrPages = await transcribeScannedPdf(arrayBuffer, pages.length)
        const splicedPages = pages.map((pageText, i) => (isPageScanned(pageText) ? ocrPages[i] : pageText))
        text = splicedPages.join('\n\n')
      } else {
        text = pages.join('\n\n')
      }
    } else {
      text = await extractTextFromFile(file)
    }

    if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
      throw new Error('This document is too large to process (extracted text exceeds the v1 limit).')
    }

    const chunks = chunkText(text)
    if (chunks.length === 0) {
      throw new Error('No extractable text found in this file')
    }
    if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
      throw new Error('This document is too large to process (too many sections for v1).')
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
    if (chunksError) {
      console.error('Failed to store document chunks:', chunksError)
      throw new Error('Could not process this document. Please try again.')
    }

    const { error: readyError } = await supabase
      .from('documents')
      .update({ status: 'ready', ocr_page_count: ocrPageCount })
      .eq('id', documentRow.id)
    if (readyError) {
      console.error('Failed to mark document ready:', readyError)
      throw new Error('Could not finish processing this document. Please try again.')
    }
  } catch (err) {
    console.error('Ingestion failed for document', documentRow.id, err)
    await supabase.from('documents').update({ status: 'failed' }).eq('id', documentRow.id)
    throw err
  }

  revalidatePath('/vault')
}
