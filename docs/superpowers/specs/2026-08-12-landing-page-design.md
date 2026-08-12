# Public landing page — design

## Context

The app today has no public-facing page — `/` immediately redirects every visitor to `/login` or `/vault`. Clayton wants the software to grow beyond a bare input/output chat tool into a real product, and identified this as the first of five build pieces: **landing page → login polish → dashboard shell → spreadsheets → trends**. This spec covers only the landing page. The others are separate, later specs.

Modeled on Henry.ai's landing page: a marketing page with a "book a demo" CTA, and a way to reach the existing sign-in flow.

## Audience and goal

Written for a real CRE professional evaluating whether to trust this with real deal documents — not a generic public self-serve funnel (the product is pre-revenue and unvalidated by outside users). Primary CTA is "book a demo," not "sign up."

## Routing

`/` becomes conditional instead of an unconditional redirect:
- Logged in → redirect to `/vault`, exactly as today (no change to this path).
- Logged out → render the new marketing page directly, instead of redirecting to `/login`.

This is the only routing change. The magic-link flow (`/auth/confirm` → `/` → `/vault` once authenticated) is untouched.

## Page structure

Single scrolling page, in this order:

1. **Nav** — wordmark, "Sign in" link to `/login`.
2. **Hero** — headline + subhead stating the real value prop (grounded, cited answers from your own documents), primary CTA "Book a demo" (scrolls to the form section), secondary "Sign in" link.
3. **See it in action** — a real example of a cited answer, styled using the same citation-card treatment already built in `src/app/chat/page.tsx` (numbered citation chips, expandable excerpt) — not a generic screenshot, not fabricated marketing copy. This is also the page's visual anchor — enlarged and given more visual weight than a utility-page citation would get.
4. **How it works** — 3 steps: Upload → Ask → Get a cited answer.
5. **What's coming** — a clearly-labeled roadmap section naming spreadsheets and trend detection as *upcoming*, explicitly not available today. No claims that these exist.
6. **Book a demo** — a form (name, email, firm, note) submitted via a server action that sends an email through the Resend setup already configured for magic links (same `RESEND_API_KEY` / sending domain, no new account). No database table for submissions — email only, given near-zero expected volume right now; a table can be added later if that changes. Inline success/error state, matching the pattern already used in `src/app/login/page.tsx`.
7. **Footer** — minimal: sign-in link, copyright.

**Testimonials/metrics/"as seen in":** not rendered on the live page yet. Real testimonials, real metrics, and press mentions don't exist yet, and empty placeholder boxes reading "testimonial here" would read as thin to a sharp CRE visitor rather than ambitious. Instead, build these as ready-to-fill components that exist in the codebase (e.g. `src/components/landing/testimonials.tsx`) but are not imported into the live page yet — so dropping in real content later is a one-line edit (add the import, render the component), not a redesign.

## Visual direction

Reuse the existing "deed and ledger" tokens exactly as defined in `src/app/globals.css` — paper background, forest green, wine-red accent, Fraunces (display) + IBM Plex (sans/mono) — no new colors, no new fonts. A marketing page earns more visual confidence than a utility screen, so the design leans on stronger typographic hierarchy, more generous whitespace, and one signature visual moment (the enlarged citation card in "See it in action") rather than introducing new brand elements. Built using the `frontend-design` and `design-elevation` skills to get genuine visual craft rather than a templated Tailwind default.

## Data flow

- Demo request form → a new `requestDemo` server action added to the existing `src/app/actions.ts` (currently holds only `signOut`) → Resend API call → email to Clayton. No Supabase read/write involved.
- No changes to document upload, chat, or embedding pipelines.

## Error handling

Demo form: if the Resend call fails, show an inline error message and let the visitor retry, matching the existing error-state pattern in `src/app/login/page.tsx` (`status: 'idle' | 'sending' | 'sent' | 'error'`). No partial state to worry about — this is a single fire-and-forget email send, not a multi-step process.

## Testing

- Routing: manual/browser verification that logged-in and logged-out visitors each land on the correct page.
- Demo form: verify the Resend call fires with correct content (unit test with a mocked Resend client, following the existing `voyage.test.ts` mocking pattern) and that the UI shows the right state on success/failure.
- Visual: browser-preview check (screenshot, console/network check) before calling this done, per the project's existing verification habit.

## Security

Low new attack surface — this page has no auth-gated data and no new database access. The one new concern: the demo-request form is a public, unauthenticated write path (an email send). Apply the same posture as the existing chat rate limiter (`src/lib/rate-limit.ts`) — a lightweight rate limit on the demo-form server action to prevent it being used to spam arbitrary email content through Clayton's Resend account.

## Explicitly deferred

- Dashboard shell, spreadsheet export, trend detection — separate specs, later in the sequence.
- Demo-request database table — add only if email-only tracking becomes insufficient.
- Testimonials/metrics/press sections — built as unrendered components now, wired in once real content exists.
- The "dev mode" / admin panel Clayton mentioned wanting eventually — already tracked as a deferred, security-sensitive item in project memory; not part of this spec.
