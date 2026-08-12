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
