'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

const SIGNING_IN_MESSAGE = (
  <p className="mx-auto mt-32 max-w-sm px-4 text-center text-sm text-slate">Signing you in...</p>
)

function ConfirmHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    async function confirm() {
      const supabase = createClient()
      const token_hash = searchParams.get('token_hash')
      const type = searchParams.get('type') as EmailOtpType | null

      if (token_hash && type) {
        // Custom email template pointing directly here with a token hash.
        const { error } = await supabase.auth.verifyOtp({ token_hash, type })
        if (!error) {
          router.replace('/')
          return
        }
      } else {
        // Default Supabase email template: it redirects here with the session in the
        // URL's hash fragment (never sent to the server) instead of a query param. The
        // browser client auto-detects and consumes that fragment on load, so by the time
        // getSession() resolves, the session is already set if the link was valid.
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (session) {
          router.replace('/')
          return
        }
      }

      router.replace('/login?error=invalid_link')
    }
    confirm()
  }, [router, searchParams])

  return SIGNING_IN_MESSAGE
}

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={SIGNING_IN_MESSAGE}>
      <ConfirmHandler />
    </Suspense>
  )
}
