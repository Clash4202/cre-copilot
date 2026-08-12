'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendDemoRequestEmail } from '@/lib/resend'

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

const DEMO_REQUEST_RATE_LIMIT = 3
const DEMO_REQUEST_RATE_WINDOW_MS = 60 * 60 * 1000 // 1 hour

const NAME_MAX_LENGTH = 200
const EMAIL_MAX_LENGTH = 200
const FIRM_MAX_LENGTH = 200
const NOTE_MAX_LENGTH = 2000

export async function requestDemo(data: {
  name: string
  email: string
  firm: string
  note: string
}): Promise<{ success: boolean }> {
  const ip = ((await headers()).get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()

  if (!checkRateLimit(`demo:${ip}`, DEMO_REQUEST_RATE_LIMIT, DEMO_REQUEST_RATE_WINDOW_MS)) {
    return { success: false }
  }

  if (!data.name.trim() || !data.email.trim()) {
    return { success: false }
  }

  if (
    data.name.length > NAME_MAX_LENGTH ||
    data.email.length > EMAIL_MAX_LENGTH ||
    data.firm.length > FIRM_MAX_LENGTH ||
    data.note.length > NOTE_MAX_LENGTH
  ) {
    return { success: false }
  }

  try {
    await sendDemoRequestEmail(data)
    return { success: true }
  } catch (error) {
    console.error('requestDemo failed:', error)
    return { success: false }
  }
}
