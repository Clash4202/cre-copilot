'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ThemeToggle } from './theme-toggle'

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 80)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 motion-reduce:transition-none ${
        scrolled
          ? 'border-b border-hairline bg-paper/90 shadow-sm backdrop-blur-md'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <nav className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 py-4 sm:px-10 lg:px-16">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-wine" aria-hidden="true" />
          <span className="font-display text-lg font-medium tracking-tight">cre-copilot</span>
        </Link>
        <div className="flex items-center gap-4 sm:gap-6">
          <a
            href="/login"
            className="hidden font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink sm:inline"
          >
            Sign in
          </a>
          <a
            href="#demo"
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper shadow-sm transition hover:-translate-y-0.5 hover:bg-forest motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            Book a demo
          </a>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
