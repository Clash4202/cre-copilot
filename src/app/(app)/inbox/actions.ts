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
import { ingestGeneralDocument } from '@/app/(app)/projects/[projectId]/vault/actions'
import { MAX_NAME_CHARS, MAX_DESCRIPTION_CHARS } from '@/lib/library-limits'
import { checkRateLimit, rateLimitMessage, RateLimitError } from '@/lib/rate-limit'

const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50MB, matches existing Vault upload limit
const MAX_STRUCTURE_SUMMARY_CHARS = 20_000 // caps prompt size for very large templates

// The Inbox is the only ingestion entry point in the app, so this is the only place anything is
// stopped before it reaches storage — the `accept=` on the upload form is a client-side hint that a
// direct server-action post ignores. The list mirrors what the app can actually parse downstream
// (PDF/plain text via extractTextFromFile, .xlsx via ExcelJS, .pptx via extractPptxSlideText).
// Gated on the extension rather than the reported content type because the extension is what
// classifyInboxFile and every parse branch below already route on; letting a `.exe` in under a
// borrowed `application/pdf` content type would put an unparseable file in the bucket and, on
// confirm, a `failed` document row attached to a real project.
const ALLOWED_UPLOAD_EXTENSIONS = ['.pdf', '.txt', '.xlsx', '.pptx']

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

export async function stageInboxUpload(formData: FormData): Promise<{ error: string } | undefined> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Checked before the file reaches storage, so a rejection leaves nothing behind to clean up.
  if (!(await checkRateLimit(supabase, 'inbox_stage'))) {
    return { error: rateLimitMessage('inbox_stage') }
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) throw new Error('No file provided')
  if (file.size > MAX_FILE_BYTES) throw new Error('File is too large (max 50MB)')
  const lowerName = file.name.toLowerCase()
  if (!ALLOWED_UPLOAD_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
    throw new Error('Only PDF, plain text, .xlsx, and .pptx files are supported')
  }

  const safeName = sanitizeFilename(file.name)
  const storagePath = `${user.id}/${randomUUID()}-${safeName}`
  const { error: uploadError } = await supabase.storage.from('inbox').upload(storagePath, file)
  if (uploadError) {
    console.error('Inbox upload failed:', uploadError)
    throw new Error('Upload failed. Please try again.')
  }

  // Everything from here to the insert is enrichment: parsing the file and asking the model where it
  // should go. All of it can throw on inputs and conditions we do not control — a corrupt .xlsx or
  // .pptx, an Anthropic network error or 429, or parseSectionMatchResponse rejecting malformed model
  // output by design. None of that is worth losing the user's upload over: the file is already in the
  // bucket, and the confirm screen lets them pick a destination by hand. So a failure here degrades
  // to an empty proposal and the item is still created, per the design spec's graceful-degradation
  // requirement. Without this, a throw left a file in the inbox bucket that no row referenced and no
  // item for the user to retry.
  let detectedType = classifyInboxFile(file.name, null)
  let proposal: Record<string, unknown> = {}

  try {
    let xlsxKind: 't12' | 'rent_roll' | 'unknown' | null = null
    let workbook: ExcelJS.Workbook | null = null

    if (lowerName.endsWith('.xlsx')) {
      const arrayBuffer = await file.arrayBuffer()
      workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(arrayBuffer)
      const firstSheet = workbook.worksheets[0]
      const rows = firstSheet ? readWorksheetRows(firstSheet) : []
      xlsxKind = detectDocumentKind(rows)
    }

    detectedType = classifyInboxFile(file.name, xlsxKind)

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
  } catch (err) {
    console.error('Could not build an inbox proposal for', file.name, err)
    proposal = {}
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
    // Nothing references the uploaded object now, so drop it rather than leaving it orphaned.
    const { error: removeError } = await supabase.storage.from('inbox').remove([storagePath])
    if (removeError) {
      console.error('Failed to clean up orphaned inbox upload', storagePath, removeError)
    }
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

// confirmInboxItem writes several rows across several tables with no transaction around them, so the
// window between "the destination rows exist" and "the inbox item is closed out" is a duplication
// hazard: while the item is still pending_review and the staged file is still in the bucket, another
// Confirm re-runs the whole branch and produces a second bucket copy, a second row, and a second
// project link. Closing the item out the moment its destination rows exist shrinks that window to
// nothing and makes any later step (ingestion, which is the slowest and most failure-prone part)
// unable to reopen it — a failure there is already reported through the document's own status
// column, and with the staged file gone a repeat Confirm fails at the copy step before writing
// anything.
async function closeOutInboxItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  storagePath: string
) {
  await supabase.storage.from('inbox').remove([storagePath])
  await supabase.from('inbox_items').update({ status: 'confirmed' }).eq('id', itemId)
}

// The confirm form ships the AI's proposed library/section ids alongside the editable name fields.
// Those ids only mean anything while the user leaves the proposed name alone — once they retype it
// they are asking for a different destination, so the id must be ignored and the named
// library/section created instead. Compared trimmed and case-insensitively so incidental whitespace
// or capitalization does not read as a deliberate edit.
function matchesProposedName(submitted: string, proposed: FormDataEntryValue | null): boolean {
  if (typeof proposed !== 'string') return false
  return submitted.trim().toLowerCase() === proposed.trim().toLowerCase()
}

export async function confirmInboxItem(
  itemId: string,
  formData: FormData
): Promise<{ error: string } | undefined> {
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
      const { data: ownedProject } = await supabase
        .from('projects')
        .select('id')
        .eq('id', existingProjectId)
        .eq('user_id', user.id)
        .single()
      if (!ownedProject) throw new Error('Project not found')
      projectId = ownedProject.id
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

    await closeOutInboxItem(supabase, itemId, item.storage_path)
  } else if (item.detected_type === 'candidate_template' || item.detected_type === 'candidate_bov') {
    const libraryName = formData.get('libraryName')
    const sectionName = formData.get('sectionName')
    const sectionDescription = formData.get('sectionDescription')
    const existingLibraryId = formData.get('existingLibraryId')
    const existingSectionId = formData.get('existingSectionId')
    const proposedLibraryName = formData.get('proposedLibraryName')
    const proposedSectionName = formData.get('proposedSectionName')
    if (typeof libraryName !== 'string' || !libraryName.trim()) throw new Error('Give the library a name')
    if (typeof sectionName !== 'string' || !sectionName.trim()) throw new Error('Give the section a name')
    if (typeof sectionDescription !== 'string') throw new Error('Description is required')
    // Same caps createLibrary/createSection enforce: these rows can be created from a model-authored
    // name, so the cap has to hold on this path too.
    if (libraryName.length > MAX_NAME_CHARS) throw new Error('Library name is too long')
    if (sectionName.length > MAX_NAME_CHARS) throw new Error('Section name is too long')
    if (sectionDescription.length > MAX_DESCRIPTION_CHARS) throw new Error('Description is too long')

    const keepProposedLibrary = matchesProposedName(libraryName, proposedLibraryName)
    const keepProposedSection = matchesProposedName(sectionName, proposedSectionName)

    let libraryId: string
    let createdNewLibrary = false
    if (typeof existingLibraryId === 'string' && existingLibraryId && keepProposedLibrary) {
      const { data: ownedLibrary } = await supabase
        .from('libraries')
        .select('id')
        .eq('id', existingLibraryId)
        .eq('user_id', user.id)
        .single()
      if (!ownedLibrary) throw new Error('Library not found')
      libraryId = ownedLibrary.id
    } else {
      createdNewLibrary = true
      const { data: newLibrary, error: libraryError } = await supabase
        .from('libraries')
        .insert({ user_id: user.id, name: libraryName.trim() })
        .select('id')
        .single()
      if (libraryError || !newLibrary) throw new Error('Could not create the library.')
      libraryId = newLibrary.id
    }

    // A proposed section id only exists inside the proposed library. If the library fell through to
    // create-new, that id can never be reused here, whatever the section name says.
    let sectionId: string
    if (typeof existingSectionId === 'string' && existingSectionId && keepProposedSection && !createdNewLibrary) {
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

    await closeOutInboxItem(supabase, itemId, item.storage_path)
  } else {
    // Only this branch reaches an AI vendor (ingestGeneralDocument: Voyage embeddings, and OCR if
    // the PDF is scanned) — property_document and candidate_template/candidate_bov above copy files
    // and insert rows at zero vendor cost. So this is checked only here, and before any row in this
    // branch is created, so a rejection leaves nothing half-built and the item stays pending_review.
    if (!(await checkRateLimit(supabase, 'ingest'))) {
      return { error: rateLimitMessage('ingest') }
    }

    const propertyName = formData.get('propertyName')
    const existingProjectId = formData.get('existingProjectId')
    if (typeof propertyName !== 'string' || !propertyName.trim()) {
      throw new Error('Give this document a project to belong to')
    }

    let projectId: string
    if (typeof existingProjectId === 'string' && existingProjectId) {
      const { data: ownedProject } = await supabase
        .from('projects')
        .select('id')
        .eq('id', existingProjectId)
        .eq('user_id', user.id)
        .single()
      if (!ownedProject) throw new Error('Project not found')
      projectId = ownedProject.id
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

    // Closed out before ingestion, not after: ingestGeneralDocument marks the document `failed` and
    // rethrows, and the Vault reads that status, so there is nothing left for the inbox item to
    // communicate — while leaving it open would let a retry duplicate everything above.
    await closeOutInboxItem(supabase, itemId, item.storage_path)

    try {
      await ingestGeneralDocument(supabase, newDocument.id, destinationPath, item.file_name)
    } catch (err) {
      // confirmInboxItem is reached from a Server Action, where production strips a thrown error
      // down to an opaque digest. Every other ingestion failure keeps throwing exactly as before
      // (the document already carries the reason in its own `failed` status column), but the OCR
      // rate-limit rejection is an expected, actionable condition, so it comes back as a return
      // value instead, the same way every other rate-limit rejection in this file does.
      if (err instanceof RateLimitError) {
        revalidateInboxPaths()
        return { error: err.message }
      }
      throw err
    }
  }

  revalidateInboxPaths()
}

function revalidateInboxPaths() {
  revalidatePath('/inbox')
  revalidatePath('/libraries')
  revalidatePath('/projects')
}
