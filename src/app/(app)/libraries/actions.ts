'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { MAX_NAME_CHARS, MAX_DESCRIPTION_CHARS } from '@/lib/library-limits'

export async function createLibrary(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const name = formData.get('name')
  if (typeof name !== 'string' || !name.trim()) throw new Error('Give the library a name')
  if (name.length > MAX_NAME_CHARS) throw new Error('Library name is too long')

  const { error } = await supabase.from('libraries').insert({ user_id: user.id, name: name.trim() })
  if (error) {
    console.error('Failed to create library:', error)
    throw new Error('Could not create the library. Please try again.')
  }

  revalidatePath('/libraries')
}

export async function createSection(libraryId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const name = formData.get('name')
  const description = formData.get('description')
  if (typeof name !== 'string' || !name.trim()) throw new Error('Give the section a name')
  if (name.length > MAX_NAME_CHARS) throw new Error('Section name is too long')
  if (typeof description !== 'string') throw new Error('Description is required')
  if (description.length > MAX_DESCRIPTION_CHARS) throw new Error('Description is too long')

  const { data: library } = await supabase
    .from('libraries')
    .select('id')
    .eq('id', libraryId)
    .eq('user_id', user.id)
    .single()
  if (!library) throw new Error('Library not found')

  const { error } = await supabase
    .from('library_sections')
    .insert({ library_id: libraryId, name: name.trim(), description: description.trim() })
  if (error) {
    console.error('Failed to create section:', error)
    throw new Error('Could not create the section. Please try again.')
  }

  revalidatePath('/libraries')
}
