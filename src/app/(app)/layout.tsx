import Image from 'next/image'
import { signOut } from '@/app/actions'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.05] dark:opacity-[0.08]">
        <Image
          src="/images/dashboard-texture.jpg"
          alt=""
          fill
          priority
          className="object-cover"
        />
      </div>
      <header className="border-b border-hairline bg-paper/90 backdrop-blur-sm">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a href="/projects" className="flex items-baseline gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-wine" aria-hidden="true" />
            <span className="font-display text-lg font-medium tracking-tight text-ink">
              cre-copilot
            </span>
          </a>
          <form action={signOut}>
            <button
              type="submit"
              className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-brick"
            >
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
