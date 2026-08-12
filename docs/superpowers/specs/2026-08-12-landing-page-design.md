# Public landing page — design

## Context

The app today has no public-facing page — `/` immediately redirects every visitor to `/login` or `/vault`. Clayton wants the software to grow beyond a bare input/output chat tool into a real product, and identified this as the first of five build pieces: **landing page → login polish → dashboard shell → spreadsheets → trends**. This spec covers only the landing page. The others are separate, later specs.

Modeled on Henry.ai's landing page (the CRE-AI company Clayton named directly): a marketing page with a "book a demo" CTA, and a small, secondary way to reach the existing sign-in flow.

## Reference research

Before designing, looked at two real, well-regarded pages to ground the structure and motion decisions rather than guessing:

- **Henry.ai** (henry.ai) — the direct model Clayton named. Nav: logo, a couple of nav links, "Log In" alone in the top-right corner. Hero: bold headline, "Book a Call" as the primary CTA. Scrolling down: client-logo social proof, four feature deep-dives, a trust/security badge, testimonial quotes with photos and titles, an FAQ section, then a bold closing statement ("Walk into the room like you already won the deal") that repeats the CTA one more time right before the footer.
- **Linear.app** — used for scroll-motion reference, not structure (a dev-tools page, not a good content model for this audience). Login/signup sit top-right, de-emphasized against the primary CTA. Feature sections reveal progressively as the visitor scrolls, rather than sitting static on load.

Both confirm the pattern Clayton asked for: sign-in is small and secondary, a demo/action CTA carries the actual conversion weight, and the page builds trust by *showing*, not just describing.

## Audience and goal

Written for a real CRE professional evaluating whether to trust this with real deal documents — not a generic public self-serve funnel (the product is pre-revenue and unvalidated by outside users). Primary CTA throughout is "Book a demo," not "Sign up."

## Routing

`/` becomes conditional instead of an unconditional redirect:
- Logged in → redirect to `/vault`, exactly as today (no change to this path).
- Logged out → render the new marketing page directly, instead of redirecting to `/login`.

This is the only routing change. The magic-link flow (`/auth/confirm` → `/` → `/vault` once authenticated) is untouched.

## Page structure

Single scrolling page, in this order:

1. **Nav** — wordmark on the left; "Book a demo" as a real button; "Sign in" as a smaller, quieter text link next to it, top-right. Sticky: transparent/blended over the hero at the very top, then becomes a solid bar with a subtle shadow once the visitor scrolls past the hero (see Motion section).
2. **Hero** — headline + subhead stating the real value prop (grounded, cited answers from your own documents), primary CTA "Book a demo" (scrolls to the form section), secondary "Sign in" link.
3. **See it in action** — a real example of a cited answer, styled using the same citation-card treatment already built in `src/app/chat/page.tsx` (numbered citation chips, expandable excerpt) — not a generic screenshot, not fabricated marketing copy. This is the page's visual anchor: enlarged, given more weight than a utility-page citation would get, and the one section where the entrance animation is deliberately more noticeable than elsewhere (see Motion section) — it's the "this is the actual product" moment.
4. **Social proof strip** — client logos / "trusted by" row. Not rendered on the live page yet (see Deferred content below) — no real logos exist today.
5. **How it works** — 3 steps: Upload → Ask → Get a cited answer.
6. **What's coming** — a clearly-labeled roadmap section naming spreadsheets and trend detection as *upcoming*, explicitly not available today. No claims that these exist.
7. **FAQ** — real questions with honest answers Clayton can stand behind today:
   - "Is my data secure?" — documents are private to your account, protected by row-level security in the database; nothing is used to train any model.
   - "What file types are supported?" — PDFs today, including scanned/image-only PDFs via automatic OCR.
   - "How is this different from just using ChatGPT or Claude directly?" — every answer is grounded in and cites the exact document and passage it came from, instead of a general-purpose model guessing from memory.

   Pricing/availability is intentionally **not** one of the FAQ questions, and isn't mentioned elsewhere on the page — raising a question only to give a vague or "TBD" answer reads worse than not raising it at all, and access is instead handled implicitly through the "Book a demo" CTA. Clayton should read the drafted Q&A copy before this ships, since these are factual claims about security and functionality, not just marketing tone.
8. **Testimonials** — same treatment as social proof: not rendered yet, no real quotes exist.
9. **Closing CTA** — a bold, short closing statement (mirroring Henry's "walk into the room like you already won the deal" pattern) with the "Book a demo" button repeated once more, right before the footer.
10. **Book a demo form** — name, email, firm, note. Submits via a server action that sends an email through the Resend setup already configured for magic links (same `RESEND_API_KEY` / sending domain, no new account). No database table for submissions — email only, given near-zero expected volume right now; a table can be added later if that changes. Inline success/error state, matching the pattern already used in `src/app/login/page.tsx`. All CTA buttons throughout the page (nav, hero, closing) scroll-anchor down to this one section rather than linking out anywhere.
11. **Footer** — minimal: sign-in link, copyright.

### Deferred content: social proof and testimonials

Not rendered on the live page yet. Real logos, real testimonials, and real metrics don't exist yet, and empty placeholder boxes reading "testimonial here" would read as thin to a sharp CRE visitor rather than ambitious. Instead, build these as ready-to-fill components that exist in the codebase (e.g. `src/components/landing/social-proof.tsx`, `src/components/landing/testimonials.tsx`) but are not imported into the live page yet — so dropping in real content later is a one-line edit (add the import, render the component), not a redesign.

## Visual direction

Reuse the existing "deed and ledger" tokens exactly as defined in `src/app/globals.css` — paper background, forest green, wine-red accent, Fraunces (display) + IBM Plex (sans/mono) — no new colors, no new fonts. A marketing page earns more visual confidence than a utility screen, so the design leans on stronger typographic hierarchy, more generous whitespace, and one signature visual moment (the enlarged citation card in "See it in action") rather than introducing new brand elements. Built using the `frontend-design` and `design-elevation` skills, cross-checked against the `ui-ux-pro-max` design-system tool for structural and motion best practices, to get genuine visual craft rather than a templated Tailwind default.

## Motion and scroll effects

Goal: make the page feel alive without feeling busy or gimmicky — motion should draw attention to the one thing that matters (the real cited answer) and reinforce a calm, professional, trustworthy read, not distract from it.

**Library:** `motion` (the current name for Framer Motion), a new dependency. Chosen over GSAP/ScrollTrigger (the other option evaluated) because it's built React-idiomatically — it integrates as component props and hooks (`whileInView`, `useScroll`) instead of imperative DOM refs — which fits this Next.js/React codebase more naturally, and it handles reduced-motion accessibility with far less custom code.

**Effects:**
- **Scroll reveals** — each major section (social proof, how-it-works steps, what's-coming, FAQ items, closing CTA) fades and slides gently upward into place the first time it's ~20% visible, using `whileInView`. Grouped items (the 3 how-it-works steps, the FAQ list) stagger in one after another rather than appearing all at once.
- **Hero entrance** — headline, subhead, and CTA fade/slide in staggered on load (not scroll-triggered, since it's above the fold).
- **"See it in action" reveal** — the citation-card example gets the most deliberate entrance of any element on the page: a slightly longer, more noticeable reveal than the standard section fade, since this is the one moment meant to say "this is the real product, not a mockup."
- **Sticky nav** — transparent over the hero, transitions to a solid bar with a subtle shadow once the visitor scrolls past the hero section.
- **Hover micro-interactions** — buttons and the citation card get a small lift + color-shift transition (150–250ms) on hover, matching the touch/interaction guidance already used elsewhere in the app.
- **Smooth anchor scroll** — clicking any "Book a demo" button smooth-scrolls to the form section rather than jumping instantly.

**Explicitly not doing:** parallax background imagery (nothing to parallax — no photography on this page), autoplay video, count-up stat animations (no real numbers exist yet — ties back to the "no fabricated social proof" decision), or a testimonial carousel (no testimonials exist yet).

**Accessibility requirement:** every animation respects `prefers-reduced-motion` — reveals become instant opacity changes (no slide/scale) for visitors with that OS setting on, via `motion`'s `useReducedMotion` hook. This isn't optional polish; it's a correctness requirement, same tier as color contrast.

## Data flow

- Demo request form → a new `requestDemo` server action added to the existing `src/app/actions.ts` (currently holds only `signOut`) → Resend API call → email to Clayton. No Supabase read/write involved.
- No changes to document upload, chat, or embedding pipelines.

## Error handling

Demo form: if the Resend call fails, show an inline error message and let the visitor retry, matching the existing error-state pattern in `src/app/login/page.tsx` (`status: 'idle' | 'sending' | 'sent' | 'error'`). No partial state to worry about — this is a single fire-and-forget email send, not a multi-step process.

## Testing

- Routing: manual/browser verification that logged-in and logged-out visitors each land on the correct page.
- Demo form: verify the Resend call fires with correct content (unit test with a mocked Resend client, following the existing `voyage.test.ts` mocking pattern) and that the UI shows the right state on success/failure.
- Motion: manual browser-preview verification that scroll reveals trigger correctly and that enabling "reduce motion" in OS/browser settings actually suppresses the slide/scale animations (not just a code-review assumption).
- Visual: browser-preview check (screenshot, console/network check) before calling this done, per the project's existing verification habit.

## Security

Low new attack surface — this page has no auth-gated data and no new database access. The one new concern: the demo-request form is a public, unauthenticated write path (an email send). Apply the same posture as the existing chat rate limiter (`src/lib/rate-limit.ts`) — a lightweight rate limit on the demo-form server action to prevent it being used to spam arbitrary email content through Clayton's Resend account. The new `motion` dependency is client-side animation only — no new data access, no new attack surface beyond a standard npm package audit.

## Explicitly deferred

- Dashboard shell, spreadsheet export, trend detection — separate specs, later in the sequence.
- Demo-request database table — add only if email-only tracking becomes insufficient.
- Social proof strip and testimonials sections — built as unrendered components now, wired in once real content exists.
- Pricing/availability messaging — deliberately absent from the FAQ and the rest of the page until pricing is actually decided.
- The "dev mode" / admin panel Clayton mentioned wanting eventually — already tracked as a deferred, security-sensitive item in project memory; not part of this spec.
