import type { ReactNode } from 'react'

interface SectionShellProps {
  id?: string
  children: ReactNode
  className?: string
  bleed?: ReactNode
}

/**
 * Full-bleed outer section with a wide (not narrow) constrained inner
 * column. Replaces the old max-w-3xl/max-w-5xl pattern that made every
 * section sit in a fixed ~768-1024px box regardless of screen width.
 */
export function SectionShell({ id, children, className = '', bleed }: SectionShellProps) {
  return (
    <section id={id} className={`relative w-full overflow-hidden ${className}`}>
      {bleed && <div className="pointer-events-none absolute inset-0">{bleed}</div>}
      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 sm:px-10 lg:px-16">
        {children}
      </div>
    </section>
  )
}
