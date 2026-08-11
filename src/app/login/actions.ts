'use server'

import { createClient } from '@/lib/supabase/server'

export async function sendMagicLink(email: string): Promise<{ success: boolean }> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    },
  })

  return { success: !error }
}
