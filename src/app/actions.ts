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

export async function requestDemo(data: {
  name: string
  email: string
  firm: string
  note: string
}): Promise<{ success: boolean }> {
  const ip = (await headers()).get('x-forwarded-for') ?? 'unknown'

  if (!checkRateLimit(`demo:${ip}`, DEMO_REQUEST_RATE_LIMIT, DEMO_REQUEST_RATE_WINDOW_MS)) {
    return { success: false }
  }

  if (!data.name.trim() || !data.email.trim()) {
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
