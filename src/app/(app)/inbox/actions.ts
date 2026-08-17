'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { readWorksheetRows } from '@/lib/xlsx-rows'
import { detectDocumentKind } from '@/lib/xlsx-detect'
import { describeWorkbookStructure } from '@/lib/excel-structure'
import { classifyInboxFile } from '@/lib/inbox-classify'
import { extractPropertyName, matchProjectByName } from '@/lib/property-match'
import { proposeSectionMatch, type LibrarySummary } from '@/lib/section-match'
import { extractPptxSlideText } from '@/lib/pptx-text'

const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50MB, matches existing Vault upload limit
const MAX_STRUCTURE_SUMMARY_CHARS = 20_000 // caps prompt size for very large templates

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\]/g, '_').replace(/[\x00-\x1f]/g, '').slice(0, 200) || 'upload'
}

async function loadLibrarySummaries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<LibrarySummary[]> {
  const { data: librariesData } = await supabase.from('libraries').select('id, name').eq('user_id', userId)
  return Promise.all(
    (librariesData ?? []).map(async (l) => {
      const { data: sectionsData } = await supabase
        .from('library_sections')
        .select('id, name, description')
        .eq('library_id', l.id)
      return { id: l.id, name: l.name, sections: sectionsData ?? [] }
    })
  )
}

export async function stageInboxUpload(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) throw new Error('No file provided')
  if (file.size > MAX_FILE_BYTES) throw new Error('File is too large (max 50MB)')

  const safeName = sanitizeFilename(file.name)
  const storagePath = `${user.id}/${randomUUID()}-${safeName}`
  const { error: uploadError } = await supabase.storage.from('inbox').upload(storagePath, file)
  if (uploadError) {
    console.error('Inbox upload failed:', uploadError)
    throw new Error('Upload failed. Please try again.')
  }

  const lower = file.name.toLowerCase()
  let xlsxKind: 't12' | 'rent_roll' | 'unknown' | null = null
  let workbook: ExcelJS.Workbook | null = null

  if (lower.endsWith('.xlsx')) {
    const arrayBuffer = await file.arrayBuffer()
    workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(arrayBuffer)
    const firstSheet = workbook.worksheets[0]
    const rows = firstSheet ? readWorksheetRows(firstSheet) : []
    xlsxKind = detectDocumentKind(rows)
  }

  const detectedType = classifyInboxFile(file.name, xlsxKind)

  let proposal: Record<string, unknown> = {}

  if (detectedType === 'property_document' && workbook) {
    const firstSheet = workbook.worksheets[0]
    const rows = firstSheet ? readWorksheetRows(firstSheet) : []
    const propertyName = await extractPropertyName(rows.slice(0, 10))

    const { data: projectsData } = await supabase.from('projects').select('id, name').eq('user_id', user.id)
    const matchedProject = propertyName ? matchProjectByName(propertyName, projectsData ?? []) : null

    proposal = {
      propertyName: propertyName ?? '',
      matchedProjectId: matchedProject?.id ?? null,
      matchedProjectName: matchedProject?.name ?? null,
    }
  } else if (detectedType === 'candidate_template' && workbook) {
    const structure = describeWorkbookStructure(workbook)
    const structureSummary = JSON.stringify(structure).slice(0, MAX_STRUCTURE_SUMMARY_CHARS)

    const libraries = await loadLibrarySummaries(supabase, user.id)
    const match = await proposeSectionMatch(libraries, 'template', structureSummary)
    proposal = { ...match }
  } else if (detectedType === 'candidate_bov') {
    const arrayBuffer = await file.arrayBuffer()
    const slideTexts = await extractPptxSlideText(Buffer.from(arrayBuffer))
    const structureSummary = slideTexts.join(' | ').slice(0, MAX_STRUCTURE_SUMMARY_CHARS)

    const libraries = await loadLibrarySummaries(supabase, user.id)
    const match = await proposeSectionMatch(libraries, 'bov', structureSummary)
    proposal = { ...match }
  }

  const { error: insertError } = await supabase.from('inbox_items').insert({
    user_id: user.id,
    file_name: file.name,
    storage_path: storagePath,
    detected_type: detectedType,
    proposal,
  })
  if (insertError) {
    console.error('Failed to create inbox item:', insertError)
    throw new Error('Could not stage this file for review. Please try again.')
  }

  revalidatePath('/inbox')
}
