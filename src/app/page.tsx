import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteNav } from '@/components/landing/site-nav'
import { Hero } from '@/components/landing/hero'
import { ExampleAnswer } from '@/components/landing/example-answer'

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
    </>
  )
}
