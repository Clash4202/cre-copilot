import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChatInterface } from '@/components/chat-interface'

export default async function ProjectChatPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const supabase = await createClient()
  const { data: project } = await supabase.from('projects').select('id, name').eq('id', projectId).single()
  if (!project) notFound()

  return (
    <ChatInterface
      projectId={project.id}
      eyebrow="Ask the Brain"
      heading={`Ask ${project.name}`}
      emptyStateText="Ask a question about this project's documents. Every answer cites the exact document and passage it came from."
    />
  )
}
