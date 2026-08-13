# Landing page redesign — design

## Context

The landing page shipped 2026-08-12 (`docs/superpowers/specs/2026-08-12-landing-page-design.md`) got the right content and structure in place, but Clayton's read after seeing it live: "barebones... dull and empty... not very much appeal." Two concrete problems, in his words:

1. **Framing** — the page reads like it's sitting in a smaller frame than a normal computer screen.
2. **Energy** — it doesn't feel like a real, alive marketing site.

He pointed at landonorris.com as an example of a site with real presence, and Henry.ai's animated-building hero (already the structural model for this page, see the prior spec) as a specific effect he liked the spirit of. This spec covers a visual/motion/layout redesign of the same single landing page — not new pages, not new content sections, not a change to the honesty rules already established (no fabricated stats, testimonials, or customer logos).

## Root cause of "framing"

Every section is built on a narrow, centered container — `max-w-3xl` (768px) in the hero, `max-w-5xl` (1024px) in the nav — regardless of actual viewport width. On a normal desktop monitor (1440–1920px+) this leaves large dead margins on both sides and caps headline sizes at fixed Tailwind steps (`text-5xl` = 48px), which reads as small and cramped rather than confident.

## Reference research

- **landonorris.com** — full-bleed sections (no centered narrow column anywhere), oversized display type, horizontal-scroll photo galleries, dark immersive theme, deliberate "moment" sections (Hall of Fame grid, tap-to-lock hero interaction).
- **ramp.com** — proof the "alive" quality works in serious B2B software, not just personal/athlete brand sites: live ticking stat counters, named customer quotes with photos/video, before/after comparison visuals, bold two-line headlines, full-width alternating sections. Not directly reusable here since cre-copilot has no real customers/stats yet — but confirms the visual techniques (bold type, full-bleed sections, motion) translate to professional software.
- **henry.ai** — the existing structural model (already referenced in the prior spec) — Clayton specifically called out its animated-building hero effect as the kind of macro real-estate motion he wants, without wanting a literal copy.

## Decisions (confirmed with Clayton)

1. **Visual identity**: open up further than a literal re-skin of the existing app, but stay recognizably the same brand as the login/authenticated app — no new hues, no palette that would feel disconnected when a visitor clicks through to sign in.
2. **Theme**: dark becomes the deliberate, designed-for default for this page. Light stays fully built and reachable via a toggle. (Today the app only has a `prefers-color-scheme` media query — an accident of OS setting, not a real design decision.)
3. **Visual asset approach**: typography and motion stay the primary visual device (matches the existing "deed and ledger" editorial identity — this is a paper/ledger brand, not a photography brand). Real product screenshots remain the honesty anchor for "See it in action." One custom-built, hand-coded (not AI-generated-photo) skyline motif is added as the macro-real-estate "alive" moment, inspired by, not copying, Henry's building animation. Higgsfield image generation is available and may be used for a smaller supporting visual if a specific gap appears during implementation, but is not committed to any specific spot up front — a generated photoreal image would clash with the line-art/editorial brand in most of the obvious spots (hero, section backgrounds), so it's a fallback tool, not the default plan.
4. **Scope**: this single landing page (`/`) only. No new pages. No change to login/vault/chat pages' visual behavior. No change to the no-fabricated-content policy (no logos, stats, or testimonials — still deferred exactly as the prior spec left them).

## Layout system

Replace the single global `max-w` container pattern with a two-layer structure per section:

- **Outer layer**: full-bleed, `w-full`, spans the entire viewport. This is where section background treatment lives (solid color, gradient, the skyline motif, subtle texture).
- **Inner content layer**: a much wider content constraint than today — around 1400px, not 768–1024px — so text and interactive elements stay readable but the section itself no longer looks like it's floating in a narrow column on a real monitor.
- **Typography**: headline sizes move from fixed Tailwind steps to fluid `clamp()`-based scaling (roughly 48px at small viewports up to 120px+ on large desktop screens for the hero), so the page actually uses the space on a wide monitor instead of hitting a ceiling.

This is the direct fix for the framing complaint and applies to every section, not just the hero.

## Theme system

- Color tokens themselves don't change — same `--color-paper`, `--color-ink`, `--color-forest`, `--color-wine`, `--color-slate`, `--color-brick`, `--color-hairline` already approved for the app.
- New mechanism, **scoped to the landing page only**: a `data-theme="dark" | "light"` attribute on a wrapper around the landing page tree, defaulting to `dark`, switchable via a small toggle in the nav, persisted in `localStorage`. This is deliberately separate from the existing `@media (prefers-color-scheme: dark)` rule that governs the authenticated app (login/vault/chat) — those pages are explicitly out of scope and keep their current OS-driven behavior untouched. No risk to working app pages.
- Toggle state is read before paint (small inline script in the landing page's layout, same pattern Next.js apps commonly use for theme flashes) so there's no flash of the wrong theme on load.

## The skyline motif

An original, hand-coded SVG city skyline — line-art building silhouettes rising from a blueprint/ledger-grid baseline, drawn in the existing palette (forest/wine/ink depending on theme). Built as a reusable component (`src/components/landing/skyline.tsx`), animated with `motion` (already a dependency from the prior landing-page work):

- **In the hero**: the primary, more elaborate appearance — buildings rise into place on load (staggered, not all at once), then settle into a slow, quiet ambient drift as the visitor scrolls past, sitting behind/beside the headline rather than fighting it.
- **In the closing CTA**: a quieter, simpler reappearance of the same motif to bookend the page.
- Built as crisp vector shapes (not a raster image) specifically so it re-themes correctly between light/dark and stays sharp at any screen size.
- Respects `prefers-reduced-motion` exactly like the existing `Reveal` component does today: buildings appear at final height instantly instead of growing, no ambient drift.

## Section-by-section changes

- **Nav**: full-width, blurred/glass bar on scroll (existing behavior, restyled), theme toggle added next to Sign in / Book a demo.
- **Hero**: full-bleed, real vertical breathing room, skyline motif, fluid oversized headline type.
- **See it in action**: the real product screenshot (Vault/chat citation card — unchanged, still 100% real) presented inside a styled app-frame mockup (window-chrome treatment, subtle shadow/glow), enlarged and given more visual weight than today.
- **How it works**: rebuilt from a plain 3-column grid into a connected vertical sequence — numbered steps linked by a running line, alternating layout (icon/text sides swap per step), full-bleed rows instead of a boxed column. (A horizontal scroll-driven version was considered — closer to Lando's galleries — but a vertical connected sequence gets most of the same "alive" feeling with meaningfully less engineering complexity and fewer ways to break on mobile, which matters given this codebase doesn't have a dedicated frontend engineer maintaining it long-term.)
- **What's coming**: timeline-style visual treatment, still clearly labeled as roadmap, no claims of current availability.
- **FAQ**: bolder two-column layout, same honest copy, no content changes.
- **Closing CTA**: full-bleed, skyline motif bookend, large type.
- **Demo form**: split layout — reinforcing copy and trust bullets (data stays private, nothing trains a model) on one side, the actual form fields on the other, instead of one stacked centered box.
- **Footer**: slightly fuller — wordmark, anchor links to on-page sections (How it works, FAQ), sign-in link, copyright. No links to pages that don't exist (no fabricated privacy-policy/terms links).

## Visual craft process

Built using `frontend-design` and `design-elevation` skills for aesthetic direction, cross-checked against the `ui-ux-pro-max` design-system/ui-styling tools for structural, motion, and Tailwind-execution best practices — same process used for the original app UI pass and the first landing-page build, so the result reads as crafted rather than a templated default. Higgsfield available as a fallback for any one specific spot that turns out to need a generated image once building is underway (not pre-committed to any section).

## Accessibility

Unchanged requirement from the prior spec, extended to the new motion: every animation (skyline build-in, ambient drift, section reveals, how-it-works sequence) respects `prefers-reduced-motion` via `motion`'s `useReducedMotion` hook — reveals become instant, no slide/scale/growth. This is a correctness requirement, not optional polish.

## Testing

- **Framing fix, specifically**: screenshot at real desktop width (1440–1920px), not just the default preview viewport, to actually confirm the "smaller frame" complaint is resolved — this was the original bug report, so it needs its own explicit check, not just a general visual pass.
- Theme toggle: verify it switches correctly, persists across reload (`localStorage`), and doesn't flash the wrong theme on load.
- Reduced motion: verify enabling "reduce motion" suppresses the skyline build-in and all scroll reveals (same manual OS/browser-emulation check as the prior spec).
- Responsive: mobile (375px) and tablet (768px) — full-bleed sections must not introduce horizontal scrolling, and the how-it-works sequence and demo-form split layout need to collapse sensibly to single-column.
- `npm run build`, `npm test`, `npm run lint` all passing, per the project's standing verification habit.
- Visual: browser-preview screenshots of hero, see-it-in-action, how-it-works, and the demo form, in both themes, for Clayton to review directly.

## Explicitly not changing

- No new pages, no pricing/availability messaging, no testimonials/social-proof/logos — same deferred status as the prior spec.
- No changes to login/vault/chat pages' visual behavior or theme mechanism.
- No changes to routing, the demo-request server action, rate limiting, or any backend/data logic — this is a visual/layout/motion pass only.
