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
