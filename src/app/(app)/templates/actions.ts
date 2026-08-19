'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { describeWorkbookStructure } from '@/lib/excel-structure'
import { proposeMapping } from '@/lib/template-mapping'

const MAX_TEMPLATE_FILE_BYTES = 20 * 1024 * 1024 // 20MB — blank templates, smaller than a document upload
const MAX_NAME_CHARS = 200

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\]/g, '_').replace(/[\x00-\x1f]/g, '').slice(0, 200) || 'upload'
}

export async function uploadTemplate(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const name = formData.get('name')
  const assetType = formData.get('assetType')
  const file = formData.get('file')

  if (typeof name !== 'string' || !name.trim()) throw new Error('Give the template a name')
  if (name.length > MAX_NAME_CHARS) throw new Error('Template name is too long')
  if (typeof assetType !== 'string' || !assetType.trim()) throw new Error('Give the template an asset type')
  if (!(file instanceof File) || file.size === 0) throw new Error('No file provided')
  if (file.size > MAX_TEMPLATE_FILE_BYTES) throw new Error('File is too large (max 20MB)')
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Only .xlsx files are supported')

  const safeName = sanitizeFilename(file.name)
  const storagePath = `${user.id}/${randomUUID()}-${safeName}`
  const { error: uploadError } = await supabase.storage.from('templates').upload(storagePath, file)
  if (uploadError) {
    console.error('Template upload failed:', uploadError)
    throw new Error('Upload failed. Please try again.')
  }

  const { error: insertError } = await supabase.from('templates').insert({
    user_id: user.id,
    name: name.trim(),
    asset_type: assetType.trim(),
    storage_path: storagePath,
  })
  if (insertError) {
    console.error('Failed to record template:', insertError)
    throw new Error('Could not save this template. Please try again.')
  }

  revalidatePath('/templates')
}

export async function analyzeTemplate(templateId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: template, error: fetchError } = await supabase
    .from('templates')
    .select('storage_path, asset_type')
    .eq('id', templateId)
    .single()
  if (fetchError || !template) throw new Error('Template not found')

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from('templates')
    .download(template.storage_path)
  if (downloadError || !fileBlob) {
    console.error('Failed to download template for analysis:', downloadError)
    throw new Error('Could not read this template. Please try again.')
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await fileBlob.arrayBuffer())
  const structure = describeWorkbookStructure(workbook)

  const mapping = await proposeMapping(structure, template.asset_type)

  const { error: updateError } = await supabase
    .from('templates')
    .update({ mapping })
    .eq('id', templateId)
  if (updateError) {
    console.error('Failed to save proposed mapping:', updateError)
    throw new Error('Could not save the proposed mapping. Please try again.')
  }

  revalidatePath('/templates')
  revalidatePath('/libraries')
  revalidatePath(`/templates/${templateId}/mapping`)
}
