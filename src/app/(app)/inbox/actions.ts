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

async function copyFromInboxTo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fromPath: string,
  toBucket: string,
  toPath: string
) {
  const { data: downloaded, error: downloadError } = await supabase.storage.from('inbox').download(fromPath)
  if (downloadError || !downloaded) {
    throw new Error('Could not read the staged file.')
  }
  const { error: uploadError } = await supabase.storage.from(toBucket).upload(toPath, downloaded)
  if (uploadError) {
    throw new Error('Could not move the staged file into place.')
  }
}

export async function confirmInboxItem(itemId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: item } = await supabase
    .from('inbox_items')
    .select('id, user_id, file_name, storage_path, detected_type')
    .eq('id', itemId)
    .eq('user_id', user.id)
    .single()
  if (!item) throw new Error('Inbox item not found')

  const destinationPath = `${user.id}/${randomUUID()}-${sanitizeFilename(item.file_name)}`

  if (item.detected_type === 'property_document') {
    const propertyName = formData.get('propertyName')
    const existingProjectId = formData.get('existingProjectId')
    if (typeof propertyName !== 'string' || !propertyName.trim()) {
      throw new Error('Give this property a name')
    }

    let projectId: string
    if (typeof existingProjectId === 'string' && existingProjectId) {
      projectId = existingProjectId
    } else {
      const { data: newProject, error: projectError } = await supabase
        .from('projects')
        .insert({ user_id: user.id, name: propertyName.trim() })
        .select('id')
        .single()
      if (projectError || !newProject) throw new Error('Could not create the project.')
      projectId = newProject.id
    }

    await copyFromInboxTo(supabase, item.storage_path, 'documents', destinationPath)

    let detectedKind: string | null = null
    const { data: downloadedBlob } = await supabase.storage.from('documents').download(destinationPath)
    if (downloadedBlob) {
      const arrayBuffer = await downloadedBlob.arrayBuffer()
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(arrayBuffer)
      const firstSheet = workbook.worksheets[0]
      const rows = firstSheet ? readWorksheetRows(firstSheet) : []
      const kind = detectDocumentKind(rows)
      detectedKind = kind === 'unknown' ? null : kind
    }

    const { data: newDocument, error: documentError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        file_name: item.file_name,
        storage_path: destinationPath,
        doc_type: 'xlsx',
        status: 'ready',
        detected_kind: detectedKind,
      })
      .select('id')
      .single()
    if (documentError || !newDocument) throw new Error('Could not save the document.')

    const { error: linkError } = await supabase
      .from('project_documents')
      .insert({ project_id: projectId, document_id: newDocument.id })
    if (linkError) throw new Error('Could not link the document to the project.')
  } else if (item.detected_type === 'candidate_template' || item.detected_type === 'candidate_bov') {
    const libraryName = formData.get('libraryName')
    const sectionName = formData.get('sectionName')
    const sectionDescription = formData.get('sectionDescription')
    const existingLibraryId = formData.get('existingLibraryId')
    const existingSectionId = formData.get('existingSectionId')
    if (typeof libraryName !== 'string' || !libraryName.trim()) throw new Error('Give the library a name')
    if (typeof sectionName !== 'string' || !sectionName.trim()) throw new Error('Give the section a name')
    if (typeof sectionDescription !== 'string') throw new Error('Description is required')

    let libraryId: string
    if (typeof existingLibraryId === 'string' && existingLibraryId) {
      const { data: ownedLibrary } = await supabase
        .from('libraries')
        .select('id')
        .eq('id', existingLibraryId)
        .eq('user_id', user.id)
        .single()
      if (!ownedLibrary) throw new Error('Library not found')
      libraryId = ownedLibrary.id
    } else {
      const { data: newLibrary, error: libraryError } = await supabase
        .from('libraries')
        .insert({ user_id: user.id, name: libraryName.trim() })
        .select('id')
        .single()
      if (libraryError || !newLibrary) throw new Error('Could not create the library.')
      libraryId = newLibrary.id
    }

    let sectionId: string
    if (typeof existingSectionId === 'string' && existingSectionId) {
      const { data: ownedSection } = await supabase
        .from('library_sections')
        .select('id, library_id, libraries!inner(user_id)')
        .eq('id', existingSectionId)
        .eq('library_id', libraryId)
        .eq('libraries.user_id', user.id)
        .single()
      if (!ownedSection) throw new Error('Section not found')
      sectionId = ownedSection.id
    } else {
      const { data: newSection, error: sectionError } = await supabase
        .from('library_sections')
        .insert({ library_id: libraryId, name: sectionName.trim(), description: sectionDescription.trim() })
        .select('id')
        .single()
      if (sectionError || !newSection) throw new Error('Could not create the section.')
      sectionId = newSection.id
    }

    const bucket = item.detected_type === 'candidate_template' ? 'templates' : 'bov-templates'
    const table = item.detected_type === 'candidate_template' ? 'templates' : 'bov_templates'
    await copyFromInboxTo(supabase, item.storage_path, bucket, destinationPath)

    const { error: fileError } = await supabase.from(table).insert({
      user_id: user.id,
      section_id: sectionId,
      name: item.file_name,
      storage_path: destinationPath,
      ...(table === 'templates' ? { asset_type: 'unspecified' } : {}),
    })
    if (fileError) throw new Error('Could not save the file.')
  } else {
    const propertyName = formData.get('propertyName')
    const existingProjectId = formData.get('existingProjectId')
    if (typeof propertyName !== 'string' || !propertyName.trim()) {
      throw new Error('Give this document a project to belong to')
    }

    let projectId: string
    if (typeof existingProjectId === 'string' && existingProjectId) {
      projectId = existingProjectId
    } else {
      const { data: newProject, error: projectError } = await supabase
        .from('projects')
        .insert({ user_id: user.id, name: propertyName.trim() })
        .select('id')
        .single()
      if (projectError || !newProject) throw new Error('Could not create the project.')
      projectId = newProject.id
    }

    await copyFromInboxTo(supabase, item.storage_path, 'documents', destinationPath)

    const { data: newDocument, error: documentError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        file_name: item.file_name,
        storage_path: destinationPath,
        doc_type: item.file_name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'text',
        status: 'processing',
      })
      .select('id')
      .single()
    if (documentError || !newDocument) throw new Error('Could not save the document.')

    const { error: linkError } = await supabase
      .from('project_documents')
      .insert({ project_id: projectId, document_id: newDocument.id })
    if (linkError) throw new Error('Could not link the document to the project.')
  }

  await supabase.storage.from('inbox').remove([item.storage_path])
  await supabase.from('inbox_items').update({ status: 'confirmed' }).eq('id', itemId)

  revalidatePath('/inbox')
  revalidatePath('/libraries')
  revalidatePath('/projects')
}
