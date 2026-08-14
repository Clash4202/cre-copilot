'use server'

import { randomUUID } from 'crypto'
import { redirect } from 'next/navigation'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { readWorksheetRows } from '@/lib/xlsx-rows'
import { parseT12 } from '@/lib/t12'
import { parseRentRoll } from '@/lib/rent-roll'
import { generateModel, type Assumptions } from '@/lib/model-generation'
import { writeGeneratedWorkbook } from '@/lib/excel-write'
import type { MappingField, TemplateMapping } from '@/lib/template-mapping'

export async function runModelGeneration(projectId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const templateId = formData.get('templateId')
  if (typeof templateId !== 'string' || !templateId) throw new Error('Pick a template')

  const { data: template, error: templateError } = await supabase
    .from('templates')
    .select('storage_path, mapping')
    .eq('id', templateId)
    .eq('mapping_status', 'confirmed')
    .single()
  if (templateError || !template) throw new Error('Template not found or not confirmed')

  const mapping = (template.mapping ?? { fields: [] }) as TemplateMapping

  const t12DocumentId = formData.get('t12DocumentId')
  const rentRollDocumentId = formData.get('rentRollDocumentId')

  const parsedT12 =
    typeof t12DocumentId === 'string' && t12DocumentId
      ? await downloadAndParse(supabase, t12DocumentId, parseT12)
      : null
  const parsedRentRoll =
    typeof rentRollDocumentId === 'string' && rentRollDocumentId
      ? await downloadAndParse(supabase, rentRollDocumentId, parseRentRoll)
      : null

  const assumptions: Assumptions = {}
  for (const field of mapping.fields as MappingField[]) {
    if (field.source !== 'assumption') continue
    const raw = formData.get(`assumption.${field.id}`)
    if (typeof raw === 'string' && raw.trim() !== '') {
      const value = Number(raw)
      if (!Number.isNaN(value)) assumptions[field.id] = value
    }
  }

  const result = generateModel(mapping, parsedT12, parsedRentRoll, assumptions)

  const { data: templateBlob, error: templateDownloadError } = await supabase.storage
    .from('templates')
    .download(template.storage_path)
  if (templateDownloadError || !templateBlob) {
    console.error('Failed to download template for generation:', templateDownloadError)
    throw new Error('Could not read the template. Please try again.')
  }

  const outputBuffer = await writeGeneratedWorkbook(await templateBlob.arrayBuffer(), result.writes)

  const outputPath = `${user.id}/${randomUUID()}-generated-model.xlsx`
  const { error: uploadError } = await supabase.storage.from('generated-models').upload(outputPath, outputBuffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  if (uploadError) {
    console.error('Failed to upload generated model:', uploadError)
    throw new Error('Could not save the generated model. Please try again.')
  }

  const { data: generatedRow, error: insertError } = await supabase
    .from('generated_models')
    .insert({
      project_id: projectId,
      template_id: templateId,
      t12_document_id: typeof t12DocumentId === 'string' && t12DocumentId ? t12DocumentId : null,
      rent_roll_document_id: typeof rentRollDocumentId === 'string' && rentRollDocumentId ? rentRollDocumentId : null,
      storage_path: outputPath,
      assumptions,
      summary: { filled: result.filled },
      gaps: result.gaps,
    })
    .select('id')
    .single()
  if (insertError || !generatedRow) {
    console.error('Failed to record generated model:', insertError)
    throw new Error('Could not save the generated model. Please try again.')
  }

  redirect(`/projects/${projectId}/model/${generatedRow.id}`)
}

async function downloadAndParse<T>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documentId: string,
  parse: (rows: ReturnType<typeof readWorksheetRows>) => T
): Promise<T | null> {
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', documentId)
    .single()
  if (docError || !document) return null

  const { data: blob, error: downloadError } = await supabase.storage.from('documents').download(document.storage_path)
  if (downloadError || !blob) return null

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await blob.arrayBuffer())
  const firstSheet = workbook.worksheets[0]
  if (!firstSheet) return null

  return parse(readWorksheetRows(firstSheet))
}
