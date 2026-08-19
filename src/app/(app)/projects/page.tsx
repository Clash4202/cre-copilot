import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createProject } from './actions'

interface ProjectRow {
  id: string
  name: string
  created_at: string
  project_documents: { count: number }[]
}

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('projects')
    .select('id, name, created_at, project_documents(count)')
    .order('created_at', { ascending: false })

  const projects = (data ?? []) as unknown as ProjectRow[]

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-slate">Projects</span>
        <h1 className="font-display text-3xl font-medium tracking-tight">Your projects</h1>
      </div>

      <Link
        href="/projects/all/chat"
        className="rounded-md border border-wine/30 px-4 py-3 text-sm text-wine transition-colors hover:-translate-y-0.5 hover:bg-wine/5 hover:shadow-sm motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        Ask across everything →
      </Link>

      <form
        action={createProject}
        className="flex items-center gap-2 rounded-md border border-dashed border-hairline px-4 py-4 transition-colors focus-within:border-brass/50"
      >
        <input
          type="text"
          name="name"
          placeholder="New project name (e.g. 123 Main St)"
          required
          className="flex-1 rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
        />
        <button
          type="submit"
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-forest"
        >
          Create
        </button>
      </form>

      {projects.length === 0 ? (
        <div className="rounded-md border border-dashed border-hairline px-4 py-8 text-center">
          <p className="text-sm text-slate">No projects yet. Create your first one above.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((project) => {
            const count = project.project_documents[0]?.count ?? 0
            return (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}/vault`}
                  className="group flex items-center justify-between rounded-md border border-hairline px-4 py-3 text-sm transition hover:-translate-y-0.5 hover:border-forest hover:shadow-sm motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <span className="font-display text-base font-medium tracking-tight text-ink transition-colors group-hover:text-forest">
                    {project.name}
                  </span>
                  <span className="rounded-full border border-hairline px-2 py-0.5 font-mono text-xs text-slate">
                    {count} document{count === 1 ? '' : 's'}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
