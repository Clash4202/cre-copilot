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
