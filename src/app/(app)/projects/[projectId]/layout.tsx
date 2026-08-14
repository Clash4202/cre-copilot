import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const supabase = await createClient()
  const { data: project } = await supabase.from('projects').select('id, name').eq('id', projectId).single()
  if (!project) notFound()

  return (
    <div>
      <div className="border-b border-hairline">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-baseline gap-3">
            <Link
              href="/projects"
              className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
            >
              ← Projects
            </Link>
            <span className="font-display text-base font-medium tracking-tight">{project.name}</span>
          </div>
          <div className="flex items-center gap-6">
            <Link
              href={`/projects/${project.id}/vault`}
              className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
            >
              Vault
            </Link>
            <Link
              href={`/projects/${project.id}/chat`}
              className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
            >
              Ask the Brain
            </Link>
            <Link
              href={`/projects/${project.id}/model`}
              className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
            >
              Model
            </Link>
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}
