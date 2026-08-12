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
