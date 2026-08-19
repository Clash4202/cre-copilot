import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { resolveTheme, THEME_STORAGE_KEY } from '@/lib/theme'
import { ThemeProvider } from '@/components/landing/theme-provider'
import { SiteNav } from '@/components/landing/site-nav'
import { Hero } from '@/components/landing/hero'
import { ProductTour } from '@/components/landing/product-tour'
import { HowItWorks } from '@/components/landing/how-it-works'
import { WhatsComing } from '@/components/landing/whats-coming'
import { FAQ } from '@/components/landing/faq'
import { ClosingCTA } from '@/components/landing/closing-cta'
import { DemoForm } from '@/components/landing/demo-form'
import { SiteFooter } from '@/components/landing/site-footer'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/projects')
  }

  const cookieStore = await cookies()
  const initialTheme = resolveTheme(cookieStore.get(THEME_STORAGE_KEY)?.value)

  return (
    <ThemeProvider initialTheme={initialTheme}>
      <SiteNav />
      <Hero />
      <ProductTour />
      <HowItWorks />
      <WhatsComing />
      <FAQ />
      <ClosingCTA />
      <DemoForm />
      <SiteFooter />
    </ThemeProvider>
  )
}
