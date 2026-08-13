'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const MAX_NAME_CHARS = 200

export async function createProject(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const name = formData.get('name')
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Give the project a name')
  }
  if (name.length > MAX_NAME_CHARS) {
    throw new Error('Project name is too long')
  }

  const { data: project, error } = await supabase
    .from('projects')
    .insert({ user_id: user.id, name: name.trim() })
    .select('id')
    .single()
  if (error || !project) {
    console.error('Failed to create project:', error)
    throw new Error('Could not create this project. Please try again.')
  }

  redirect(`/projects/${project.id}/vault`)
}
