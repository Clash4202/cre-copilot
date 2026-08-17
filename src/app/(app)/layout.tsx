import Link from 'next/link'
import { signOut } from '@/app/actions'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b-2 border-hairline">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a href="/projects" className="flex items-baseline gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-wine" aria-hidden="true" />
            <span className="font-display text-lg font-medium tracking-tight">cre-copilot</span>
          </a>
          <div className="flex items-center gap-6">
            <Link
              href="/libraries"
              className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
            >
              Libraries
            </Link>
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
