import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteNav } from '@/components/landing/site-nav'
import { Hero } from '@/components/landing/hero'
import { ExampleAnswer } from '@/components/landing/example-answer'
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
    redirect('/vault')
  }

  return (
    <>
      <SiteNav />
      <Hero />
      <ExampleAnswer />
      <HowItWorks />
      <WhatsComing />
      <FAQ />
      <ClosingCTA />
      <DemoForm />
      <SiteFooter />
    </>
  )
}
