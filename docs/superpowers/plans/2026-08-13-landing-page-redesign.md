# Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public landing page's layout, theme, and motion so it reads as a real, confident marketing site on a normal desktop screen instead of a narrow, dull content column.

**Architecture:** Replace the existing `max-w-3xl`/`max-w-5xl` centered-column pattern with a full-bleed `SectionShell` primitive used by every section; add a dark-first theme system scoped to just this page via a `data-theme` attribute (independent of the app's existing `prefers-color-scheme` behavior, which stays untouched); add a hand-coded animated SVG skyline motif as the page's signature "alive" visual moment. All changes are presentational — no routing, data, or backend logic changes.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4 (CSS-variable-driven theming, no `tailwind.config` file), `motion` v13 (`motion/react`) — already a dependency, no new packages.

## Global Constraints

- No new npm dependencies — `motion` (already installed) covers all animation needs; no icon library, no theme library.
- No new color hues — only the existing `--color-paper`/`--color-ink`/`--color-forest`/`--color-wine`/`--color-slate`/`--color-brick`/`--color-hairline` tokens from `src/app/globals.css`.
- No new fonts — Fraunces (`font-display`) and IBM Plex (`font-sans`/`font-mono`) only.
- No fabricated stats, testimonials, or customer logos — that policy is unchanged from the prior landing-page spec.
- Scope is the public landing page (`/`, i.e. `src/app/page.tsx` and `src/components/landing/*`) only. Do not modify `src/app/(app)/*`, `src/app/login/*`, or the theme behavior those pages currently get from `prefers-color-scheme` in `globals.css`.
- Every animation must respect `prefers-reduced-motion` via `motion`'s `useReducedMotion` hook — this is a correctness requirement, not optional polish.
- No unit tests for presentational JSX components — this matches the existing project convention (no test files exist today for `hero.tsx`, `faq.tsx`, etc.); they're verified via manual browser preview instead. Only genuinely pure logic (the theme toggle helpers) gets a unit test, matching how `src/lib/*.test.ts` files are used elsewhere in this codebase.

## File Structure

**New files:**
- `src/lib/theme.ts` — pure theme logic (types, storage key, toggle function). Unit tested.
- `src/lib/theme.test.ts` — tests for the above.
- `src/components/landing/theme-provider.tsx` — client component: theme state, localStorage persistence, anti-flash boot script, React context.
- `src/components/landing/theme-toggle.tsx` — small button consuming the theme context.
- `src/components/landing/section-shell.tsx` — full-bleed outer / wide-constrained inner layout primitive used by every section.
- `src/components/landing/skyline.tsx` — animated SVG skyline motif (hero + closing variants).

**Modified files:**
- `src/app/globals.css` — add `[data-theme='dark']` / `[data-theme='light']` override blocks.
- `src/app/page.tsx` — wrap the page tree in `ThemeProvider`.
- `src/components/landing/site-nav.tsx` — wider container, glass restyle, theme toggle added.
- `src/components/landing/hero.tsx` — full-bleed, fluid type, skyline background.
- `src/components/landing/example-answer.tsx` — app-frame mockup treatment.
- `src/components/landing/how-it-works.tsx` — connected alternating sequence.
- `src/components/landing/whats-coming.tsx` — timeline card treatment.
- `src/components/landing/faq.tsx` — two-column layout.
- `src/components/landing/closing-cta.tsx` — full-bleed, skyline bookend.
- `src/components/landing/demo-form.tsx` — split layout with trust bullets.
- `src/components/landing/site-footer.tsx` — fuller footer with anchor nav.

---

### Task 1: Theme system (logic, provider, toggle)

**Files:**
- Create: `src/lib/theme.ts`
- Create: `src/lib/theme.test.ts`
- Create: `src/components/landing/theme-provider.tsx`
- Create: `src/components/landing/theme-toggle.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `Theme` (type, `'dark' | 'light'`), `THEME_STORAGE_KEY` (string constant), `DEFAULT_THEME` (`Theme`, value `'dark'`), `isValidTheme(value: string | null): value is Theme`, `getNextTheme(current: Theme): Theme` — all from `@/lib/theme`.
- Produces: `ThemeProvider({ children }: { children: ReactNode })` — client component, from `@/components/landing/theme-provider`. Renders a `<div id="landing-root" data-theme={theme} className="bg-paper text-ink">` wrapping its children — this div is the themed root; everything inside it must live inside this wrapper to pick up the correct theme.
- Produces: `useTheme(): { theme: Theme; toggleTheme: () => void }` — from `@/components/landing/theme-provider`. Throws if called outside `ThemeProvider`.
- Produces: `ThemeToggle()` — from `@/components/landing/theme-toggle`. Must be rendered somewhere inside `ThemeProvider`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/theme.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isValidTheme, getNextTheme, DEFAULT_THEME } from './theme'

describe('isValidTheme', () => {
  it('accepts "dark" and "light"', () => {
    expect(isValidTheme('dark')).toBe(true)
    expect(isValidTheme('light')).toBe(true)
  })

  it('rejects null and unrecognized values', () => {
    expect(isValidTheme(null)).toBe(false)
    expect(isValidTheme('blue')).toBe(false)
    expect(isValidTheme('')).toBe(false)
  })
})

describe('getNextTheme', () => {
  it('toggles dark to light', () => {
    expect(getNextTheme('dark')).toBe('light')
  })

  it('toggles light to dark', () => {
    expect(getNextTheme('light')).toBe('dark')
  })
})

describe('DEFAULT_THEME', () => {
  it('is dark, per the decision to make dark the deliberate default', () => {
    expect(DEFAULT_THEME).toBe('dark')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/theme.test.ts`
Expected: FAIL — `./theme` module not found.

- [ ] **Step 3: Write the theme logic module**

Create `src/lib/theme.ts`:

```ts
export type Theme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'cre-copilot-landing-theme'
export const DEFAULT_THEME: Theme = 'dark'

export function isValidTheme(value: string | null): value is Theme {
  return value === 'dark' || value === 'light'
}

export function getNextTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/theme.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Add scoped theme override blocks to globals.css**

In `src/app/globals.css`, add this new block immediately after the existing `@media (prefers-color-scheme: dark) { ... }` block (which stays exactly as-is — it still governs the rest of the app):

```css
/*
 * Scoped to the public landing page only (see ThemeProvider). Duplicates
 * the values above deliberately, so the landing page's explicit choice
 * always wins regardless of what @media (prefers-color-scheme) says —
 * login/vault/chat are untouched and keep following the OS setting.
 */
[data-theme='dark'] {
  --color-paper: #1a1613;
  --color-ink: #ede8de;
  --color-forest: #7fa98d;
  --color-wine: #d98fa0;
  --color-slate: #a69c8e;
  --color-brick: #d9827d;
  --color-hairline: #3a342c;
}

[data-theme='light'] {
  --color-paper: #f6f5f0;
  --color-ink: #201a1a;
  --color-forest: #2f4a3d;
  --color-wine: #7a2e3a;
  --color-slate: #5c5650;
  --color-brick: #8c2f2f;
  --color-hairline: #ddd7cb;
}
```

- [ ] **Step 6: Write the ThemeProvider**

Create `src/components/landing/theme-provider.tsx`:

```tsx
'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  getNextTheme,
  isValidTheme,
  type Theme,
} from '@/lib/theme'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return ctx
}

// Runs before React hydrates, so a returning visitor who previously chose
// "light" doesn't see a flash of the default dark theme. Dark itself needs
// no boot script since it's already the server-rendered default.
const BOOT_SCRIPT = `(function(){try{var t=window.localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});if(t==='light'){document.getElementById('landing-root').setAttribute('data-theme','light')}}catch(e){}})()`

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME)

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (isValidTheme(stored)) {
      setTheme(stored)
    }
  }, [])

  function toggleTheme() {
    setTheme((current) => {
      const next = getNextTheme(current)
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div id="landing-root" data-theme={theme} className="bg-paper text-ink">
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
        {children}
      </div>
    </ThemeContext.Provider>
  )
}
```

- [ ] **Step 7: Write the ThemeToggle button**

Create `src/components/landing/theme-toggle.tsx`:

```tsx
'use client'

import { useTheme } from './theme-provider'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="rounded-full border border-hairline p-2 text-slate transition-colors hover:border-ink/40 hover:text-ink"
    >
      {theme === 'dark' ? (
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
        </svg>
      )}
    </button>
  )
}
```

- [ ] **Step 8: Verify the project still builds**

Run: `npm run build`
Expected: succeeds with no type errors (these components aren't wired into the page yet, but must type-check standalone).

- [ ] **Step 9: Commit**

```bash
git add src/lib/theme.ts src/lib/theme.test.ts src/components/landing/theme-provider.tsx src/components/landing/theme-toggle.tsx src/app/globals.css
git commit -m "Add scoped dark-first theme system for the landing page"
```

---

### Task 2: Layout shell and skyline motif

**Files:**
- Create: `src/components/landing/section-shell.tsx`
- Create: `src/components/landing/skyline.tsx`

**Interfaces:**
- Produces: `SectionShell({ id, children, className, bleed }: { id?: string; children: ReactNode; className?: string; bleed?: ReactNode })` — from `@/components/landing/section-shell` (relative import `./section-shell` within `components/landing`). Full-bleed `<section>`; `bleed` renders absolutely-positioned behind an inner column constrained to `max-w-[1400px]`.
- Produces: `Skyline({ variant, className }: { variant?: 'hero' | 'closing'; className?: string })` — from `./skyline`. Renders an `<svg>` with buildings that grow in via `whileInView` once, respecting `useReducedMotion`.

- [ ] **Step 1: Write the SectionShell primitive**

Create `src/components/landing/section-shell.tsx`:

```tsx
import type { ReactNode } from 'react'

interface SectionShellProps {
  id?: string
  children: ReactNode
  className?: string
  bleed?: ReactNode
}

/**
 * Full-bleed outer section with a wide (not narrow) constrained inner
 * column. Replaces the old max-w-3xl/max-w-5xl pattern that made every
 * section sit in a fixed ~768-1024px box regardless of screen width.
 */
export function SectionShell({ id, children, className = '', bleed }: SectionShellProps) {
  return (
    <section id={id} className={`relative w-full overflow-hidden ${className}`}>
      {bleed && <div className="pointer-events-none absolute inset-0">{bleed}</div>}
      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 sm:px-10 lg:px-16">
        {children}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Write the Skyline motif**

Create `src/components/landing/skyline.tsx`:

```tsx
'use client'

import { motion, useReducedMotion } from 'motion/react'

interface Building {
  x: number
  width: number
  height: number
}

const HERO_BUILDINGS: Building[] = [
  { x: 0, width: 46, height: 120 },
  { x: 50, width: 30, height: 78 },
  { x: 84, width: 54, height: 168 },
  { x: 142, width: 38, height: 96 },
  { x: 184, width: 62, height: 196 },
  { x: 250, width: 34, height: 66 },
  { x: 288, width: 46, height: 142 },
  { x: 338, width: 42, height: 108 },
]

const CLOSING_BUILDINGS: Building[] = HERO_BUILDINGS.slice(0, 5)

const BASELINE = 200

interface SkylineProps {
  variant?: 'hero' | 'closing'
  className?: string
}

// Buildings grow in once, on scroll-into-view, and then sit still — no
// continuous looping motion. That keeps this accessible (no auto-playing
// content to worry about under WCAG 2.2.2) and keeps the effect focused
// on the one moment it's meant to land, instead of becoming background
// noise the visitor has to tune out.
export function Skyline({ variant = 'hero', className = '' }: SkylineProps) {
  const shouldReduceMotion = useReducedMotion()
  const buildings = variant === 'closing' ? CLOSING_BUILDINGS : HERO_BUILDINGS
  const viewWidth = variant === 'closing' ? 320 : 400

  return (
    <svg
      viewBox={`0 0 ${viewWidth} ${BASELINE + 16}`}
      className={className}
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
    >
      <line
        x1={0}
        y1={BASELINE}
        x2={viewWidth}
        y2={BASELINE}
        stroke="var(--color-hairline)"
        strokeWidth={1}
      />
      {buildings.map((building, i) => (
        <motion.rect
          key={building.x}
          x={building.x}
          width={building.width}
          fill="none"
          stroke="var(--color-forest)"
          strokeWidth={1.5}
          initial={
            shouldReduceMotion
              ? { y: BASELINE - building.height, height: building.height }
              : { y: BASELINE, height: 0 }
          }
          whileInView={{ y: BASELINE - building.height, height: building.height }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{
            duration: shouldReduceMotion ? 0 : 1,
            delay: shouldReduceMotion ? 0 : i * 0.09,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      ))}
    </svg>
  )
}
```

- [ ] **Step 3: Verify the project still builds**

Run: `npm run build`
Expected: succeeds with no type errors. (Not visually verifiable yet — neither component is wired into a page. That happens in Tasks 3 and 8.)

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/section-shell.tsx src/components/landing/skyline.tsx
git commit -m "Add full-bleed section shell and skyline motif components"
```

---

### Task 3: Nav and Hero rebuild (first visual milestone)

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/landing/site-nav.tsx`
- Modify: `src/components/landing/hero.tsx`

**Interfaces:**
- Consumes: `ThemeProvider` from `@/components/landing/theme-provider` (Task 1), `ThemeToggle` from `./theme-toggle` (Task 1), `SectionShell` from `./section-shell` (Task 2), `Skyline` from `./skyline` (Task 2), `Reveal` from `./reveal` (existing).

- [ ] **Step 1: Wrap the page in ThemeProvider**

Replace the full contents of `src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ThemeProvider } from '@/components/landing/theme-provider'
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
    <ThemeProvider>
      <SiteNav />
      <Hero />
      <ExampleAnswer />
      <HowItWorks />
      <WhatsComing />
      <FAQ />
      <ClosingCTA />
      <DemoForm />
      <SiteFooter />
    </ThemeProvider>
  )
}
```

- [ ] **Step 2: Rebuild the nav**

Replace the full contents of `src/components/landing/site-nav.tsx`:

```tsx
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
```

- [ ] **Step 3: Rebuild the hero**

Replace the full contents of `src/components/landing/hero.tsx`:

```tsx
'use client'

import { Reveal } from './reveal'
import { SectionShell } from './section-shell'
import { Skyline } from './skyline'

export function Hero() {
  return (
    <SectionShell
      className="pb-24 pt-40 sm:pb-32 sm:pt-48"
      bleed={
        <Skyline
          variant="hero"
          className="absolute inset-x-0 bottom-0 h-[45%] w-full opacity-40 sm:h-[55%]"
        />
      }
    >
      <div className="flex max-w-3xl flex-col items-start gap-6 text-left">
        <Reveal>
          <span className="font-mono text-xs uppercase tracking-widest text-slate">
            For commercial real estate
          </span>
        </Reveal>
        <Reveal delay={0.1}>
          <h1 className="font-display text-[clamp(2.75rem,6vw,6.5rem)] font-medium leading-[1.02] tracking-tight text-ink">
            Answers grounded in your own deal documents.
          </h1>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="max-w-xl text-base leading-relaxed text-slate sm:text-lg">
            Upload leases, offering memoranda, and market reports. Ask a question in plain
            English and get an answer that cites the exact page it came from — not a guess.
          </p>
        </Reveal>
        <Reveal delay={0.3}>
          <div className="flex items-center gap-4 pt-2">
            <a
              href="#demo"
              className="rounded-md bg-ink px-5 py-3 text-sm font-medium text-paper shadow-sm transition hover:-translate-y-0.5 hover:bg-forest motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              Book a demo
            </a>
            <a
              href="/login"
              className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
            >
              Sign in
            </a>
          </div>
        </Reveal>
      </div>
    </SectionShell>
  )
}
```

- [ ] **Step 4: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both succeed with no errors.

- [ ] **Step 5: Manual browser verification**

Start the dev server, open `/` at a real desktop width (1440px or wider):
- Confirm the page defaults to dark, fills the full viewport width (no narrow centered column), and the skyline grows in behind the headline on load.
- Click the theme toggle in the nav; confirm the page switches to the light palette instantly.
- Reload the page; confirm it stays on light (persisted via `localStorage`).
- Toggle back to dark before continuing to the next task, so the default state is consistent for later manual checks.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/components/landing/site-nav.tsx src/components/landing/hero.tsx
git commit -m "Rebuild nav and hero as full-bleed with theme toggle and skyline motif"
```

---

### Task 4: "See it in action" app-frame mockup

**Files:**
- Modify: `src/components/landing/example-answer.tsx`

**Interfaces:**
- Consumes: `SectionShell` (Task 2), `Reveal` (existing). No new exports.

- [ ] **Step 1: Rebuild the example-answer section**

Replace the full contents of `src/components/landing/example-answer.tsx`:

```tsx
'use client'

import { Reveal } from './reveal'
import { SectionShell } from './section-shell'

export function ExampleAnswer() {
  return (
    <SectionShell className="py-24 sm:py-32">
      <Reveal duration={0.8}>
        <div className="flex flex-col gap-1 pb-10 text-center">
          <span className="font-mono text-xs uppercase tracking-widest text-slate">
            See it in action
          </span>
          <h2 className="font-display text-[clamp(1.75rem,3vw,2.75rem)] font-medium tracking-tight text-ink">
            A real answer, not a guess
          </h2>
        </div>
      </Reveal>
      <Reveal delay={0.15} duration={0.9}>
        <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-hairline bg-paper shadow-lg transition hover:-translate-y-1 hover:shadow-xl motion-reduce:transition-none motion-reduce:hover:translate-y-0">
          <div className="flex items-center gap-1.5 border-b border-hairline px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-hairline" aria-hidden="true" />
            <span className="h-2.5 w-2.5 rounded-full bg-hairline" aria-hidden="true" />
            <span className="h-2.5 w-2.5 rounded-full bg-hairline" aria-hidden="true" />
            <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-slate">
              cre-copilot — chat
            </span>
          </div>
          <div className="p-6">
            <span className="mb-3 inline-block rounded-full border border-hairline px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-slate">
              Example
            </span>
            <p className="font-display text-lg font-medium tracking-tight text-ink">
              Does this lease have a renewal option?
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">
              Yes. Section 4.2 grants the tenant one 5-year renewal option, exercisable with
              180 days&apos; written notice before the expiration date, at 95% of
              then-prevailing market rent.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <details className="group rounded-md border border-hairline px-2 py-1 open:bg-wine/5">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 font-mono text-xs text-wine marker:content-none">
                  <span className="rounded-full bg-wine px-1.5 text-paper">1</span>
                  Sample_Office_Lease.pdf
                </summary>
                <p className="mt-1.5 max-w-sm text-xs text-slate">
                  &quot;Tenant shall have one (1) option to renew this Lease for an
                  additional term of five (5) years, provided Tenant delivers written
                  notice...&quot;
                </p>
              </details>
            </div>
          </div>
        </div>
      </Reveal>
    </SectionShell>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Manual browser verification**

Reload `/`, scroll to "See it in action." Confirm the citation card now renders inside a window-chrome frame (three dots + label bar), is wider/more prominent than before, and the citation `<details>` disclosure still expands correctly on click.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/example-answer.tsx
git commit -m "Present the example answer in an app-frame mockup"
```

---

### Task 5: "How it works" connected sequence

**Files:**
- Modify: `src/components/landing/how-it-works.tsx`

**Interfaces:**
- Consumes: `SectionShell` (Task 2), `Reveal` (existing). Section gets `id="how-it-works"` — Task 10's footer links to `#how-it-works`.

- [ ] **Step 1: Rebuild the how-it-works section**

Replace the full contents of `src/components/landing/how-it-works.tsx`:

```tsx
'use client'

import { Reveal } from './reveal'
import { SectionShell } from './section-shell'

const STEPS = [
  {
    title: 'Upload',
    body: 'Add leases, offering memoranda, T-12s, and market reports — PDFs, including scanned ones.',
  },
  {
    title: 'Ask',
    body: "Ask a question the way you'd ask a colleague who already read the file.",
  },
  {
    title: 'Get a cited answer',
    body: 'Every answer points to the exact document and passage it came from.',
  },
]

export function HowItWorks() {
  return (
    <SectionShell id="how-it-works" className="py-24 sm:py-32">
      <Reveal>
        <span className="font-mono text-xs uppercase tracking-widest text-slate">
          How it works
        </span>
      </Reveal>
      <div className="relative mt-12 flex flex-col gap-12 sm:gap-16">
        <div
          className="absolute bottom-2 left-6 top-2 hidden w-px bg-hairline sm:block"
          aria-hidden="true"
        />
        {STEPS.map((step, i) => (
          <Reveal key={step.title} delay={i * 0.12}>
            <div
              className={`flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8 ${
                i % 2 === 1 ? 'sm:flex-row-reverse sm:text-right' : ''
              }`}
            >
              <span className="relative z-10 flex h-12 w-12 flex-none items-center justify-center rounded-full border border-hairline bg-paper font-display text-lg text-wine">
                {i + 1}
              </span>
              <div className="max-w-md">
                <h3 className="font-display text-xl font-medium tracking-tight text-ink sm:text-2xl">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate sm:text-base">
                  {step.body}
                </p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </SectionShell>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Manual browser verification**

Reload `/`, scroll to "How it works." Confirm the three steps appear in a connected sequence with a running line on desktop widths, alternating left/right on the middle step, and stagger in on scroll.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/how-it-works.tsx
git commit -m "Rebuild how-it-works as a connected alternating sequence"
```

---

### Task 6: "What's coming" timeline treatment

**Files:**
- Modify: `src/components/landing/whats-coming.tsx`

**Interfaces:**
- Consumes: `SectionShell` (Task 2), `Reveal` (existing). No new exports.

- [ ] **Step 1: Rebuild the what's-coming section**

Replace the full contents of `src/components/landing/whats-coming.tsx`:

```tsx
'use client'

import { Reveal } from './reveal'
import { SectionShell } from './section-shell'

const UPCOMING = [
  {
    title: 'Spreadsheets',
    body: 'Turn a set of questions across your documents into a structured table you can export and work with.',
  },
  {
    title: 'Trend detection',
    body: 'Surface patterns across your documents automatically — not just answers to what you ask.',
  },
]

export function WhatsComing() {
  return (
    <SectionShell className="py-24 sm:py-32">
      <Reveal>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-widest text-slate">
            What&apos;s coming
          </span>
          <span className="rounded-full border border-hairline px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-wine">
            Coming soon
          </span>
        </div>
      </Reveal>
      <div className="relative mt-12 grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-2">
        {UPCOMING.map((item, i) => (
          <Reveal key={item.title} delay={i * 0.1} className="bg-paper">
            <div className="h-full p-8">
              <span className="font-mono text-xs text-slate">0{i + 1}</span>
              <h3 className="mt-3 font-display text-xl font-medium tracking-tight text-ink">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate">{item.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </SectionShell>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Manual browser verification**

Reload `/`, scroll to "What's coming." Confirm the two roadmap cards render as a bordered grid with a visible hairline divider between them, and the "Coming soon" badge is still present.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/whats-coming.tsx
git commit -m "Give what's-coming a timeline card treatment"
```

---

### Task 7: FAQ two-column layout

**Files:**
- Modify: `src/components/landing/faq.tsx`

**Interfaces:**
- Consumes: `SectionShell` (Task 2), `Reveal` (existing). Section gets `id="faq"` — Task 10's footer links to `#faq`.

- [ ] **Step 1: Rebuild the FAQ section**

Replace the full contents of `src/components/landing/faq.tsx`:

```tsx
'use client'

import { Reveal } from './reveal'
import { SectionShell } from './section-shell'

const FAQS = [
  {
    q: 'Is my data secure?',
    a: 'Your documents are private to your account, protected by row-level security in the database. Nothing you upload is used to train any model.',
  },
  {
    q: 'What file types are supported?',
    a: "PDFs today, including scanned or image-only PDFs — those are automatically transcribed so they're still searchable.",
  },
  {
    q: 'How is this different from just using ChatGPT or Claude directly?',
    a: 'Every answer is grounded in and cites the exact document and passage it came from, instead of a general-purpose model guessing from memory.',
  },
]

export function FAQ() {
  return (
    <SectionShell id="faq" className="py-24 sm:py-32">
      <div className="grid gap-10 sm:grid-cols-[minmax(0,320px)_1fr] sm:gap-16">
        <Reveal>
          <span className="font-mono text-xs uppercase tracking-widest text-slate">FAQ</span>
          <h2 className="mt-3 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-medium tracking-tight text-ink">
            Common questions
          </h2>
        </Reveal>
        <div className="flex flex-col divide-y divide-hairline">
          {FAQS.map((item, i) => (
            <Reveal key={item.q} delay={i * 0.08}>
              <div className="py-6 first:pt-0">
                <h3 className="font-display text-lg font-medium tracking-tight text-ink">
                  {item.q}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate sm:text-base">{item.a}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </SectionShell>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Manual browser verification**

Reload `/`, scroll to FAQ. Confirm a two-column layout on desktop (label/heading on the left, questions on the right) that collapses to a single column on mobile widths.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/faq.tsx
git commit -m "Rebuild FAQ as a two-column layout"
```

---

### Task 8: Closing CTA skyline bookend

**Files:**
- Modify: `src/components/landing/closing-cta.tsx`

**Interfaces:**
- Consumes: `SectionShell`, `Skyline` (Task 2), `Reveal` (existing). No new exports.

- [ ] **Step 1: Rebuild the closing CTA**

Replace the full contents of `src/components/landing/closing-cta.tsx`:

```tsx
'use client'

import { Reveal } from './reveal'
import { SectionShell } from './section-shell'
import { Skyline } from './skyline'

export function ClosingCTA() {
  return (
    <SectionShell
      className="py-24 text-center sm:py-32"
      bleed={
        <Skyline
          variant="closing"
          className="absolute inset-x-0 bottom-0 h-[35%] w-full opacity-25"
        />
      }
    >
      <Reveal>
        <h2 className="font-display text-[clamp(2rem,4.5vw,4rem)] font-medium tracking-tight text-ink">
          Your documents already have the answer.
        </h2>
      </Reveal>
      <Reveal delay={0.1}>
        <p className="mt-4 text-base text-slate sm:text-lg">Let&apos;s find it together.</p>
      </Reveal>
      <Reveal delay={0.2}>
        <a
          href="#demo"
          className="mt-8 inline-block rounded-md bg-ink px-6 py-3 text-sm font-medium text-paper shadow-sm transition hover:-translate-y-0.5 hover:bg-forest motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          Book a demo
        </a>
      </Reveal>
    </SectionShell>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Manual browser verification**

Reload `/`, scroll to the closing CTA. Confirm a quieter second skyline appearance sits behind the closing statement, bookending the hero's skyline.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/closing-cta.tsx
git commit -m "Add skyline bookend to the closing CTA"
```

---

### Task 9: Demo form split layout

**Files:**
- Modify: `src/components/landing/demo-form.tsx`

**Interfaces:**
- Consumes: `SectionShell` (Task 2), `requestDemo` from `@/app/actions` (existing, unchanged signature: `(input: { name: string; email: string; firm: string; note: string }) => Promise<{ success: boolean }>`).

- [ ] **Step 1: Rebuild the demo form**

Replace the full contents of `src/components/landing/demo-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { requestDemo } from '@/app/actions'
import { SectionShell } from './section-shell'

const TRUST_POINTS = [
  'Your documents stay private to your account.',
  'Nothing you upload is used to train any model.',
]

export function DemoForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [firm, setFirm] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    const result = await requestDemo({ name, email, firm, note })
    setStatus(result.success ? 'sent' : 'error')
  }

  if (status === 'sent') {
    return (
      <SectionShell id="demo" className="py-24 text-center sm:py-32">
        <span className="mx-auto block h-1.5 w-1.5 rounded-full bg-wine" aria-hidden="true" />
        <h2 className="mt-3 font-display text-2xl font-medium tracking-tight text-ink">
          Thanks — we&apos;ll be in touch
        </h2>
        <p className="mt-2 text-sm text-slate">We usually respond within a day or two.</p>
      </SectionShell>
    )
  }

  return (
    <SectionShell id="demo" className="py-24 sm:py-32">
      <div className="grid gap-12 sm:grid-cols-2 sm:gap-20">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-widest text-slate">
              Book a demo
            </span>
            <h2 className="font-display text-[clamp(1.75rem,3vw,2.75rem)] font-medium tracking-tight text-ink">
              Tell us about your deals
            </h2>
          </div>
          <ul className="flex flex-col gap-3">
            {TRUST_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2 text-sm text-slate">
                <span
                  className="mt-1.5 h-1 w-1 flex-none rounded-full bg-wine"
                  aria-hidden="true"
                />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-widest text-slate">Name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-slate/70 focus:border-forest focus:ring-2 focus:ring-forest/20"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-widest text-slate">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-slate/70 focus:border-forest focus:ring-2 focus:ring-forest/20"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-widest text-slate">Firm</span>
            <input
              value={firm}
              onChange={(e) => setFirm(e.target.value)}
              className="rounded-md border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-slate/70 focus:border-forest focus:ring-2 focus:ring-forest/20"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-widest text-slate">
              What are you hoping to do?
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="rounded-md border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-slate/70 focus:border-forest focus:ring-2 focus:ring-forest/20"
            />
          </label>
          <button
            type="submit"
            disabled={status === 'sending'}
            className="mt-2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper shadow-sm transition hover:-translate-y-0.5 hover:bg-forest disabled:opacity-50 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            {status === 'sending' ? 'Sending...' : 'Request a demo'}
          </button>
          {status === 'error' && (
            <p className="text-sm text-brick">
              Something went wrong sending that. Try again, or email us directly.
            </p>
          )}
        </form>
      </div>
    </SectionShell>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Manual browser verification**

Reload `/`, scroll to the demo form. Confirm copy + trust bullets sit on one side and the form fields on the other on desktop, collapsing to a single stacked column on mobile. Submitting still shows the existing sending/sent/error states unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/demo-form.tsx
git commit -m "Rebuild demo form as a split layout with trust bullets"
```

---

### Task 10: Fuller footer

**Files:**
- Modify: `src/components/landing/site-footer.tsx`

**Interfaces:**
- Consumes: `#how-it-works` (Task 5), `#faq` (Task 7), `#demo` (existing, unchanged) as anchor targets. No new exports.

- [ ] **Step 1: Rebuild the footer**

Replace the full contents of `src/components/landing/site-footer.tsx`:

```tsx
const NAV_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#faq', label: 'FAQ' },
  { href: '#demo', label: 'Book a demo' },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-6 py-12 sm:px-10 sm:py-16 lg:px-16">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex items-baseline gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-wine" aria-hidden="true" />
            <span className="font-display text-lg font-medium tracking-tight text-ink">
              cre-copilot
            </span>
          </div>
          <nav className="flex flex-wrap items-center gap-6">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
              >
                {link.label}
              </a>
            ))}
            <a
              href="/login"
              className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
            >
              Sign in
            </a>
          </nav>
        </div>
        <span className="font-mono text-xs text-slate">
          &copy; {new Date().getFullYear()} cre-copilot
        </span>
      </div>
    </footer>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Manual browser verification**

Reload `/`, scroll to the footer. Confirm the "How it works" and "FAQ" links jump-scroll to their sections, and "Book a demo" jumps to the form.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/site-footer.tsx
git commit -m "Add anchor navigation to the footer"
```

---

### Task 11: Final QA pass

**Files:** none (verification only).

- [ ] **Step 1: Full automated check**

```bash
npm run build
npm test
npm run lint
```

Expected: all three succeed with no errors.

- [ ] **Step 2: Framing fix verification (the original bug report)**

Start the dev server, open `/` in a browser sized to a real desktop width — 1440px or wider, not the default preview viewport. Screenshot the hero. Confirm sections span the full width with no large dead margins on either side, and the headline is noticeably larger than the old fixed 48px cap.

- [ ] **Step 3: Theme verification**

Confirm the page loads dark by default. Toggle to light via the nav button — confirm every section (nav, hero, see-it-in-action, how-it-works, what's-coming, FAQ, closing CTA, demo form, footer) re-themes correctly with no leftover dark-only or light-only colors. Reload — confirm the choice persists. Clear the `cre-copilot-landing-theme` key from localStorage and reload — confirm it defaults back to dark with no flash of light.

- [ ] **Step 4: Reduced-motion verification**

Enable "reduce motion" (OS accessibility settings, or DevTools Rendering panel → "Emulate CSS media feature prefers-reduced-motion: reduce"). Reload `/` and scroll through. Confirm the skyline buildings appear at full height instantly (no grow-in), and all section reveals appear without the slide-up motion.

- [ ] **Step 5: Responsive verification**

Resize to 375px (mobile) and 768px (tablet). Confirm no horizontal scrolling anywhere, the how-it-works sequence and demo-form split layout collapse to single columns, and the nav doesn't overflow.

- [ ] **Step 6: Screenshot walkthrough**

Take screenshots of the hero, see-it-in-action, how-it-works, and demo form — in both dark and light — for Clayton to review directly.

No commit for this task — it's verification only. If any check fails, fix the underlying issue in the relevant earlier task's files and re-run this task's checks.
