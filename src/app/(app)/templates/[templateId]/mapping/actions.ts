'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { MappingField, MappingSource, TemplateMapping } from '@/lib/template-mapping'

const VALID_SOURCES: MappingSource[] = [
  'assumption',
  't12_subtotal',
  't12_line_item',
  'rent_roll_unit_count',
  'rent_roll_average_budgeted_rent',
]

function parseFieldsFromForm(formData: FormData): MappingField[] {
  const count = Number(formData.get('fieldCount') ?? 0)
  const fields: MappingField[] = []

  for (let i = 0; i < count; i++) {
    const id = formData.get(`fields[${i}].id`)
    const label = formData.get(`fields[${i}].label`)
    const sheet = formData.get(`fields[${i}].sheet`)
    const cell = formData.get(`fields[${i}].cell`)
    const source = formData.get(`fields[${i}].source`)
    const sourceKeyRaw = formData.get(`fields[${i}].sourceKey`)

    if (
      typeof id !== 'string' ||
      typeof label !== 'string' ||
      typeof sheet !== 'string' ||
      typeof cell !== 'string' ||
      typeof source !== 'string' ||
      !VALID_SOURCES.includes(source as MappingSource)
    ) {
      continue
    }

    const sourceKey = typeof sourceKeyRaw === 'string' && sourceKeyRaw.trim() !== '' ? sourceKeyRaw : null

    fields.push({ id, label, sheet, cell, source: source as MappingSource, sourceKey })
  }

  return fields
}

export async function saveMapping(templateId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const mapping: TemplateMapping = { fields: parseFieldsFromForm(formData) }

  const { error } = await supabase.from('templates').update({ mapping }).eq('id', templateId)
  if (error) {
    console.error('Failed to save mapping edits:', error)
    throw new Error('Could not save your changes. Please try again.')
  }

  revalidatePath(`/templates/${templateId}/mapping`)
}

export async function confirmMapping(templateId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('templates').update({ mapping_status: 'confirmed' }).eq('id', templateId)
  if (error) {
    console.error('Failed to confirm mapping:', error)
    throw new Error('Could not confirm this mapping. Please try again.')
  }

  revalidatePath('/templates')
  revalidatePath(`/templates/${templateId}/mapping`)
}
