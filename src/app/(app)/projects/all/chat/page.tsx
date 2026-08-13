import Link from 'next/link'
import { ChatInterface } from '@/components/chat-interface'

export default function AllProjectsChatPage() {
  return (
    <>
      <div className="mx-auto max-w-3xl px-6 pt-6">
        <Link
          href="/projects"
          className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
        >
          ← All projects
        </Link>
      </div>
      <ChatInterface
        eyebrow="Ask the Brain — All Projects"
        heading="Ask across everything"
        emptyStateText="Ask a question across every project's documents. Each answer's citations show which project the source came from."
      />
    </>
  )
}
