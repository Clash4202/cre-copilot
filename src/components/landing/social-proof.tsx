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
