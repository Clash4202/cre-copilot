# Public Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public marketing landing page at `/` (modeled on Henry.ai's real page), with a small "Sign in" link and a "Book a demo" CTA that leads to a working demo-request form, plus tasteful scroll motion.

**Architecture:** The existing authenticated app header currently renders unconditionally for every route (including `/login`, and what will become the public `/`). Before the landing page can look right, the app's chrome gets split into a `(app)` route group so only `/vault` and `/chat` get the authenticated header. The landing page itself is a set of small, focused presentational components under `src/components/landing/`, composed in `src/app/page.tsx`, sharing one `Reveal` wrapper component for all scroll-triggered motion (built on the `motion` library) so the reduced-motion accessibility handling exists in exactly one place.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Tailwind CSS v4, `motion` (new dependency, React bindings for scroll/entrance animation), Resend REST API via `fetch` (new integration, no SDK — matches the existing `src/lib/voyage.ts` pattern of calling vendor REST APIs directly instead of adding an SDK dependency), Vitest.

## Global Constraints

- Reuse the existing "deed and ledger" design tokens exactly as defined in `src/app/globals.css` (`--color-paper`, `--color-ink`, `--color-forest`, `--color-wine`, `--color-slate`, `--color-brick`, `--color-hairline`) and the existing fonts (`font-display` = Fraunces, `font-mono` = IBM Plex Mono, default sans = IBM Plex Sans). No new colors, no new fonts.
- No fabricated social proof: social proof / testimonials sections exist as components but are **not** imported into the live page (self-guard by returning `null` when their data arrays are empty, as defense in depth).
- No pricing/availability messaging anywhere on the page.
- Every scroll/entrance animation must respect `prefers-reduced-motion` via the shared `Reveal` component's use of `motion`'s `useReducedMotion()` hook — this is a correctness requirement, not optional polish.
- All "Book a demo" buttons/links point to `#demo` (the demo form's `id`), not to an external URL.
- Follow existing codebase conventions: Server Actions live in an `actions.ts` colocated with the route that uses them (or the existing root `src/app/actions.ts` for root-level actions); vendor API calls in `src/lib/*.ts` use raw `fetch` with unit tests that mock `global.fetch`, matching `src/lib/voyage.ts` / `src/lib/voyage.test.ts`.

---

### Task 1: Split app chrome into an `(app)` route group

The current `src/app/layout.tsx` renders the authenticated header (Vault / Ask the Brain / Sign out) unconditionally for every route. That's wrong for the new public landing page at `/` (and, as a pre-existing rough edge, for `/login` too — visiting `/login` today already shows a "Sign out" link a logged-out visitor can't use). Move the header into a route-group layout that only wraps `/vault` and `/chat`.

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Move: `src/app/vault/page.tsx` → `src/app/(app)/vault/page.tsx`
- Move: `src/app/vault/actions.ts` → `src/app/(app)/vault/actions.ts`
- Move: `src/app/chat/page.tsx` → `src/app/(app)/chat/page.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: URLs `/vault` and `/chat` are unchanged (route groups don't affect URLs — only file organization). No other task depends on file locations here, only on the URLs staying the same.

- [ ] **Step 1: Move the route files with `git mv` (preserves history)**

```bash
mkdir -p "src/app/(app)/vault" "src/app/(app)/chat"
git mv src/app/vault/page.tsx "src/app/(app)/vault/page.tsx"
git mv src/app/vault/actions.ts "src/app/(app)/vault/actions.ts"
git mv src/app/chat/page.tsx "src/app/(app)/chat/page.tsx"
```

- [ ] **Step 2: Create `src/app/(app)/layout.tsx` with the extracted header**

```tsx
import { signOut } from '@/app/actions'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b-2 border-hairline">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a href="/vault" className="flex items-baseline gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-wine" aria-hidden="true" />
            <span className="font-display text-lg font-medium tracking-tight">
              cre-copilot
            </span>
          </a>
          <div className="flex items-center gap-6">
            <a
              href="/vault"
              className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
            >
              Vault
            </a>
            <a
              href="/chat"
              className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
            >
              Ask the Brain
            </a>
            <form action={signOut}>
              <button
                type="submit"
                className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-brick"
              >
                Sign out
              </button>
            </form>
          </div>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </>
  )
}
```

- [ ] **Step 3: Strip the header out of the root layout and add smooth-scrolling**

Replace the full contents of `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "cre-copilot",
  description: "Ask questions grounded in your real CRE documents.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Verify the build and existing tests still pass**

Run: `npm run build`
Expected: succeeds with no type or route errors.

Run: `npm test`
Expected: all existing tests still pass (this task touches no `src/lib` code).

- [ ] **Step 5: Manually verify in the browser**

Start the dev server and visit `/login` — confirm the authenticated header (Vault / Ask the Brain / Sign out) no longer appears there. If you can sign in, visit `/vault` and `/chat` and confirm the header still appears there exactly as before.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Move authenticated app chrome into an (app) route group"
```

---

### Task 2: Resend email module

New `src/lib/resend.ts` module that sends an email via the Resend REST API, following the exact pattern of `src/lib/voyage.ts` (raw `fetch`, no SDK, throws with the response body on failure).

**Files:**
- Create: `src/lib/resend.ts`
- Test: `src/lib/resend.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `sendDemoRequestEmail(data: { name: string; email: string; firm: string; note: string }): Promise<void>` — throws on failure. Task 3's `requestDemo` action calls this.

- [ ] **Step 1: Write the failing test**

Create `src/lib/resend.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendDemoRequestEmail } from './resend'

describe('sendDemoRequestEmail', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.DEMO_REQUEST_NOTIFY_EMAIL = 'clayton@example.com'
  })

  it('sends the demo request details to the Resend API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock as unknown as typeof fetch

    await sendDemoRequestEmail({
      name: 'Jamie Broker',
      email: 'jamie@example.com',
      firm: 'Example Realty',
      note: 'Interested in a demo',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      })
    )
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.to).toBe('clayton@example.com')
    expect(body.text).toContain('Jamie Broker')
    expect(body.text).toContain('jamie@example.com')
  })

  it('throws with the response body on failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid key',
    }) as unknown as typeof fetch

    await expect(
      sendDemoRequestEmail({ name: 'A', email: 'a@example.com', firm: 'B', note: 'C' })
    ).rejects.toThrow('401')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/resend.test.ts`
Expected: FAIL — `Cannot find module './resend'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/resend.ts`:

```ts
const RESEND_FROM_EMAIL = 'cre-copilot <onboarding@resend.dev>'

interface DemoRequest {
  name: string
  email: string
  firm: string
  note: string
}

export async function sendDemoRequestEmail(data: DemoRequest): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: process.env.DEMO_REQUEST_NOTIFY_EMAIL,
      subject: `Demo request from ${data.name}`,
      text: `Name: ${data.name}\nEmail: ${data.email}\nFirm: ${data.firm}\n\n${data.note}`,
    }),
  })

  if (!response.ok) {
    throw new Error(`Resend request failed: ${response.status} ${await response.text()}`)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/resend.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Add the new env vars**

Add to `.env.example`, after the existing Voyage section:

```
# Resend API key (resend.com) — used to email Clayton when someone requests a demo via the
# landing page. Reuses the same Resend account already configured as custom SMTP for
# Supabase magic-link emails; no new account needed.
RESEND_API_KEY=

# Email address that receives demo request notifications.
DEMO_REQUEST_NOTIFY_EMAIL=
```

Add the same two variables (with real values) to `.env.local`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/resend.ts src/lib/resend.test.ts .env.example
git commit -m "Add Resend email module for demo request notifications"
```

---

### Task 3: `requestDemo` server action with rate limiting

**Files:**
- Modify: `src/app/actions.ts`

**Interfaces:**
- Consumes: `sendDemoRequestEmail` from Task 2 (`src/lib/resend.ts`); `checkRateLimit(key: string, limit: number, windowMs: number): boolean` from the existing `src/lib/rate-limit.ts`.
- Produces: `requestDemo(data: { name: string; email: string; firm: string; note: string }): Promise<{ success: boolean }>` — Task 8's demo form calls this, mirroring the exact `{ success: boolean }` shape and calling convention already used by `sendMagicLink` in `src/app/login/actions.ts`.

- [ ] **Step 1: Add the action**

Replace the full contents of `src/app/actions.ts` with:

```ts
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
```

This action isn't given its own unit test file — `src/app/actions.ts` and its sibling `actions.ts` files (`login/actions.ts`, `vault/actions.ts`) follow the existing codebase convention of testing the underlying `src/lib` logic in isolation (done in Task 2) and verifying the thin orchestration layer by hand in the browser, which happens in Task 8 once the form exists to drive it. This mirrors an already-documented gap in `vault/actions.ts` rather than introducing a new inconsistency.

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions.ts
git commit -m "Add requestDemo server action with rate limiting"
```

---

### Task 4: Install `motion`; build the `Reveal` wrapper, site nav, and hero

First visible slice of the landing page: the nav and hero render at `/` for logged-out visitors.

**Files:**
- Create: `src/components/landing/reveal.tsx`
- Create: `src/components/landing/site-nav.tsx`
- Create: `src/components/landing/hero.tsx`
- Modify: `src/app/page.tsx`
- Modify: `package.json` / `package-lock.json` (via `npm install`)

**Interfaces:**
- Produces: `Reveal` component — `{ children: ReactNode; delay?: number; duration?: number; className?: string }`, wraps children in a `motion.div` that fades/slides into view on scroll, collapsing to an instant opacity-only change when `useReducedMotion()` is true. Every later landing section (Tasks 5–9) wraps its content in `Reveal`.

- [ ] **Step 1: Install the `motion` package**

```bash
npm install motion
```

- [ ] **Step 2: Create the shared `Reveal` component**

Create `src/components/landing/reveal.tsx`:

```tsx
'use client'

import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

interface RevealProps {
  children: ReactNode
  delay?: number
  duration?: number
  className?: string
}

export function Reveal({ children, delay = 0, duration = 0.5, className }: RevealProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{
        duration: shouldReduceMotion ? 0.01 : duration,
        delay: shouldReduceMotion ? 0 : delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  )
}
```

- [ ] **Step 3: Create the sticky site nav**

Create `src/components/landing/site-nav.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'

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
          ? 'border-b border-hairline bg-paper/95 shadow-sm backdrop-blur'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <a href="/" className="flex items-baseline gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-wine" aria-hidden="true" />
          <span className="font-display text-lg font-medium tracking-tight">cre-copilot</span>
        </a>
        <div className="flex items-center gap-6">
          <a
            href="/login"
            className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
          >
            Sign in
          </a>
          <a
            href="#demo"
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper shadow-sm transition hover:-translate-y-0.5 hover:bg-forest motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            Book a demo
          </a>
        </div>
      </nav>
    </header>
  )
}
```

- [ ] **Step 4: Create the hero**

Create `src/components/landing/hero.tsx`:

```tsx
'use client'

import { Reveal } from './reveal'

export function Hero() {
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-start gap-6 px-6 pb-24 pt-40 text-left">
      <Reveal>
        <span className="font-mono text-xs uppercase tracking-widest text-slate">
          For commercial real estate
        </span>
      </Reveal>
      <Reveal delay={0.1}>
        <h1 className="font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">
          Answers grounded in your own deal documents.
        </h1>
      </Reveal>
      <Reveal delay={0.2}>
        <p className="max-w-xl text-base leading-relaxed text-slate">
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
    </section>
  )
}
```

- [ ] **Step 5: Wire up `src/app/page.tsx`**

Replace the full contents of `src/app/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteNav } from '@/components/landing/site-nav'
import { Hero } from '@/components/landing/hero'

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
    </>
  )
}
```

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 7: Manually verify in the browser**

Start the dev server, visit `/` while logged out. Confirm: the hero fades/slides in on load; the nav is transparent at the top and becomes a solid bar with a shadow once you scroll down; "Book a demo" and "Sign in" are both visible in the nav, with "Book a demo" as the bolder button.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add landing page nav, hero, and Reveal motion wrapper"
```

---

### Task 5: "See it in action" example-answer section

The page's visual anchor — reuses the citation-card treatment from `src/app/(app)/chat/page.tsx`, enlarged, with a more noticeable entrance than other sections.

**Files:**
- Create: `src/components/landing/example-answer.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/landing/example-answer.tsx`:

```tsx
'use client'

import { Reveal } from './reveal'

export function ExampleAnswer() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <Reveal duration={0.8}>
        <div className="flex flex-col gap-1 pb-8">
          <span className="font-mono text-xs uppercase tracking-widest text-slate">
            See it in action
          </span>
          <h2 className="font-display text-2xl font-medium tracking-tight text-ink">
            A real answer, not a guess
          </h2>
        </div>
      </Reveal>
      <Reveal delay={0.15} duration={0.8}>
        <div className="rounded-lg border border-hairline bg-paper p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
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
      </Reveal>
    </section>
  )
}
```

This uses illustrative example content (clearly labeled "Example"), not a fabricated claim about a real client's real deal — consistent with the spec's "no fabricated social proof" rule, which applies to claims of trust (logos, testimonials, metrics), not to an illustrative product demo. If Clayton wants to swap in the literal Q&A from his real end-to-end test instead, that's a content-only edit to this file.

- [ ] **Step 2: Add it to the page**

In `src/app/page.tsx`, add the import and render it after `<Hero />`:

```tsx
import { ExampleAnswer } from '@/components/landing/example-answer'
```

```tsx
      <SiteNav />
      <Hero />
      <ExampleAnswer />
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Manually verify in the browser**

Reload `/`, scroll to the example section, confirm it fades/slides in as it enters view and the citation chip expands on click, matching the chat page's existing behavior.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add See it in action example-answer section"
```

---

### Task 6: How it works + What's coming sections

**Files:**
- Create: `src/components/landing/how-it-works.tsx`
- Create: `src/components/landing/whats-coming.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create the how-it-works section**

Create `src/components/landing/how-it-works.tsx`:

```tsx
'use client'

import { Reveal } from './reveal'

const STEPS = [
  {
    title: 'Upload',
    body: 'Add leases, offering memoranda, T-12s, and market reports — PDFs, including scanned ones.',
  },
  {
    title: 'Ask',
    body: 'Ask a question the way you’d ask a colleague who already read the file.',
  },
  {
    title: 'Get a cited answer',
    body: 'Every answer points to the exact document and passage it came from.',
  },
]

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <Reveal>
        <span className="font-mono text-xs uppercase tracking-widest text-slate">
          How it works
        </span>
      </Reveal>
      <div className="mt-8 grid gap-8 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <Reveal key={step.title} delay={i * 0.1}>
            <div className="flex flex-col gap-2">
              <span className="font-display text-2xl text-wine">{i + 1}</span>
              <h3 className="font-display text-lg font-medium tracking-tight text-ink">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-slate">{step.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create the what's-coming section**

Create `src/components/landing/whats-coming.tsx`:

```tsx
'use client'

import { Reveal } from './reveal'

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
    <section className="mx-auto max-w-4xl px-6 py-24">
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
      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        {UPCOMING.map((item, i) => (
          <Reveal key={item.title} delay={i * 0.1}>
            <div className="rounded-lg border border-hairline p-6">
              <h3 className="font-display text-lg font-medium tracking-tight text-ink">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate">{item.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Add both to the page**

In `src/app/page.tsx`, add the imports and render both after `<ExampleAnswer />`:

```tsx
import { HowItWorks } from '@/components/landing/how-it-works'
import { WhatsComing } from '@/components/landing/whats-coming'
```

```tsx
      <ExampleAnswer />
      <HowItWorks />
      <WhatsComing />
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 5: Manually verify in the browser**

Reload `/`, scroll down, confirm the three how-it-works steps stagger in one after another, and the "Coming soon" badge is clearly visible on the what's-coming section.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add How it works and What's coming sections"
```

---

### Task 7: FAQ section

**Files:**
- Create: `src/components/landing/faq.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/landing/faq.tsx`:

```tsx
'use client'

import { Reveal } from './reveal'

const FAQS = [
  {
    q: 'Is my data secure?',
    a: 'Your documents are private to your account, protected by row-level security in the database. Nothing you upload is used to train any model.',
  },
  {
    q: 'What file types are supported?',
    a: 'PDFs today, including scanned or image-only PDFs — those are automatically transcribed so they’re still searchable.',
  },
  {
    q: 'How is this different from just using ChatGPT or Claude directly?',
    a: 'Every answer is grounded in and cites the exact document and passage it came from, instead of a general-purpose model guessing from memory.',
  },
]

export function FAQ() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <Reveal>
        <span className="font-mono text-xs uppercase tracking-widest text-slate">FAQ</span>
      </Reveal>
      <div className="mt-8 flex flex-col divide-y divide-hairline">
        {FAQS.map((item, i) => (
          <Reveal key={item.q} delay={i * 0.08}>
            <div className="py-5">
              <h3 className="font-display text-base font-medium tracking-tight text-ink">
                {item.q}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate">{item.a}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
```

Clayton should read these three answers before this ships — they're factual claims about security and functionality (RLS, no training on uploaded documents, OCR support), not just marketing tone, and the plan can't verify their accuracy on his behalf.

- [ ] **Step 2: Add it to the page**

In `src/app/page.tsx`, add the import and render it after `<WhatsComing />`:

```tsx
import { FAQ } from '@/components/landing/faq'
```

```tsx
      <WhatsComing />
      <FAQ />
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Manually verify in the browser**

Reload `/`, scroll to the FAQ, confirm the three questions stagger in as the section enters view.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add FAQ section"
```

---

### Task 8: Closing CTA + demo request form

**Files:**
- Create: `src/components/landing/closing-cta.tsx`
- Create: `src/components/landing/demo-form.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `requestDemo` from Task 3 (`@/app/actions`).

- [ ] **Step 1: Create the closing CTA**

Create `src/components/landing/closing-cta.tsx`:

```tsx
'use client'

import { Reveal } from './reveal'

export function ClosingCTA() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24 text-center">
      <Reveal>
        <h2 className="font-display text-3xl font-medium tracking-tight text-ink sm:text-4xl">
          Your documents already have the answer.
        </h2>
      </Reveal>
      <Reveal delay={0.1}>
        <p className="mt-4 text-base text-slate">Let&apos;s find it together.</p>
      </Reveal>
      <Reveal delay={0.2}>
        <a
          href="#demo"
          className="mt-8 inline-block rounded-md bg-ink px-6 py-3 text-sm font-medium text-paper shadow-sm transition hover:-translate-y-0.5 hover:bg-forest motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          Book a demo
        </a>
      </Reveal>
    </section>
  )
}
```

- [ ] **Step 2: Create the demo form**

Create `src/components/landing/demo-form.tsx`, following the exact status-state-machine pattern already used in `src/app/login/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { requestDemo } from '@/app/actions'

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
      <section id="demo" className="mx-auto max-w-xl px-6 py-24 text-center">
        <span className="h-1.5 w-1.5 rounded-full bg-wine" aria-hidden="true" />
        <h2 className="mt-3 font-display text-2xl font-medium tracking-tight text-ink">
          Thanks — we&apos;ll be in touch
        </h2>
        <p className="mt-2 text-sm text-slate">We usually respond within a day or two.</p>
      </section>
    )
  }

  return (
    <section id="demo" className="mx-auto max-w-xl px-6 py-24">
      <div className="flex flex-col gap-1 pb-8 text-center">
        <span className="font-mono text-xs uppercase tracking-widest text-slate">
          Book a demo
        </span>
        <h2 className="font-display text-2xl font-medium tracking-tight text-ink">
          Tell us about your deals
        </h2>
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
    </section>
  )
}
```

- [ ] **Step 3: Add both to the page**

In `src/app/page.tsx`, add the imports and render both after `<FAQ />`:

```tsx
import { ClosingCTA } from '@/components/landing/closing-cta'
import { DemoForm } from '@/components/landing/demo-form'
```

```tsx
      <FAQ />
      <ClosingCTA />
      <DemoForm />
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 5: Manually verify in the browser (this is where `requestDemo` gets its real test)**

With `RESEND_API_KEY` and `DEMO_REQUEST_NOTIFY_EMAIL` set in `.env.local`: reload `/`, click any "Book a demo" button, confirm the page smooth-scrolls to the form. Fill it out and submit — confirm the button shows "Sending...", then the form is replaced by the "Thanks" message, and a real email arrives at the notify address. Submit it a 4th time within an hour to confirm the rate limit kicks in (`requestDemo` returns `{ success: false }`, form shows the error message).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add closing CTA and demo request form"
```

---

### Task 9: Footer, deferred placeholder components, final page assembly

**Files:**
- Create: `src/components/landing/site-footer.tsx`
- Create: `src/components/landing/social-proof.tsx`
- Create: `src/components/landing/testimonials.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create the footer**

Create `src/components/landing/site-footer.tsx`:

```tsx
export function SiteFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8">
        <span className="font-mono text-xs text-slate">
          &copy; {new Date().getFullYear()} cre-copilot
        </span>
        <a
          href="/login"
          className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
        >
          Sign in
        </a>
      </div>
    </footer>
  )
}
```

- [ ] **Step 2: Create the deferred social-proof placeholder (not rendered on the live page)**

Create `src/components/landing/social-proof.tsx`:

```tsx
// Not yet imported into the live page — see docs/superpowers/specs/2026-08-12-landing-page-design.md.
// Fill in `LOGOS` with real client logos and render <SocialProof /> in src/app/page.tsx when ready.

const LOGOS: { name: string; src: string }[] = []

export function SocialProof() {
  if (LOGOS.length === 0) return null

  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <div className="flex flex-wrap items-center justify-center gap-10 opacity-70 grayscale">
        {LOGOS.map((logo) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={logo.name} src={logo.src} alt={logo.name} className="h-6" />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Create the deferred testimonials placeholder (not rendered on the live page)**

Create `src/components/landing/testimonials.tsx`:

```tsx
// Not yet imported into the live page — see docs/superpowers/specs/2026-08-12-landing-page-design.md.
// Fill in `QUOTES` with real testimonials and render <Testimonials /> in src/app/page.tsx when ready.

interface Quote {
  quote: string
  name: string
  title: string
}

const QUOTES: Quote[] = []

export function Testimonials() {
  if (QUOTES.length === 0) return null

  return (
    <section className="mx-auto max-w-5xl px-6 py-24">
      <div className="grid gap-8 sm:grid-cols-3">
        {QUOTES.map((q) => (
          <div key={q.name} className="rounded-lg border border-hairline p-6">
            <p className="text-sm italic leading-relaxed text-ink">&quot;{q.quote}&quot;</p>
            <p className="mt-4 font-mono text-xs uppercase tracking-widest text-slate">
              {q.name}, {q.title}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

Both self-guard by returning `null` when their data array is empty, so even an accidental import before real content exists renders nothing rather than an empty box.

- [ ] **Step 4: Finalize `src/app/page.tsx` with the footer**

Replace the full contents of `src/app/page.tsx` with the complete composition:

```tsx
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
```

(`SocialProof` and `Testimonials` are deliberately not imported here — see Global Constraints.)

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 6: Manually verify in the browser**

Reload `/`, scroll all the way through — confirm the footer appears at the bottom with a working "Sign in" link, and that logged-in visitors going to `/` still land on `/vault` (test by signing in, then navigating to `/`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add footer, deferred social-proof/testimonials placeholders, finalize landing page"
```

---

### Task 10: Final QA pass

**Files:** none (verification only).

- [ ] **Step 1: Full automated check**

```bash
npm run build
npm test
npm run lint
```

Expected: all three succeed with no errors.

- [ ] **Step 2: Reduced-motion check**

Enable "reduce motion" in your OS accessibility settings (or emulate it via the browser's DevTools Rendering panel → "Emulate CSS media feature prefers-reduced-motion: reduce"), reload `/`, and scroll through. Confirm sections still appear but without the slide/scale motion — the `Reveal` component's `useReducedMotion` branch is what's being verified here, not just a visual preference.

- [ ] **Step 3: Responsive check**

Resize the browser to mobile width (375px) and tablet width (768px). Confirm no horizontal scrolling, the nav doesn't overflow or overlap, and the how-it-works / what's-coming grids collapse to a single column.

- [ ] **Step 4: Full visual walkthrough with screenshots**

Take a screenshot of the hero, the "See it in action" section, and the demo form, for Clayton to review directly.

- [ ] **Step 5: Confirm rate limiting holds under the app's existing security posture**

Re-read `src/lib/rate-limit.ts`'s header comment — it's an in-memory limiter that resets on redeploy and doesn't coordinate across instances. That's an accepted, already-documented tradeoff for this app's current scale (same posture as the existing chat rate limiter), not a new gap introduced by this feature.

No commit for this task — it's verification only. If any check fails, fix the underlying issue in the relevant earlier task's files and re-run this task's checks.
