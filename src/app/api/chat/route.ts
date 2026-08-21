import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { embedTexts } from '@/lib/voyage'
import { askClaude } from '@/lib/claude'
import { checkRateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { buildCitations } from '@/lib/citations'

const MAX_QUESTION_CHARS = 2000

interface ChunkMatch {
  id: string
  document_id: string
  content: string
  similarity: number
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (!(await checkRateLimit(supabase, 'chat'))) {
    return NextResponse.json({ error: rateLimitMessage('chat') }, { status: 429 })
  }

  const { question, projectId } = await request.json()
  if (typeof question !== 'string' || !question.trim()) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json({ error: 'Question is too long.' }, { status: 400 })
  }
  const scopedToProject = typeof projectId === 'string' && projectId.length > 0

  const [queryEmbedding] = await embedTexts([question], 'query')

  const { data: matches, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_count: 8,
    filter_project_id: scopedToProject ? projectId : null,
  })
  if (error) {
    console.error('match_document_chunks failed:', error)
    return NextResponse.json({ error: 'Something went wrong searching your documents.' }, { status: 500 })
  }

  const chunkMatches = (matches ?? []) as ChunkMatch[]
  if (chunkMatches.length === 0) {
    return NextResponse.json({
      answer: "I don't have any documents to search yet. Upload something in the Vault first.",
      citations: [],
    })
  }

  const documentIds = [...new Set(chunkMatches.map((m) => m.document_id))]
  const { data: documents } = await supabase.from('documents').select('id, file_name').in('id', documentIds)
  const fileNameById = new Map((documents ?? []).map((d) => [d.id, d.file_name]))

  // Only look up which project(s) each source document belongs to when the question
  // wasn't scoped to one project already — in scoped mode the user already knows.
  let projectNamesByDocId: Map<string, string[]> | undefined
  if (!scopedToProject) {
    const { data: links } = await supabase
      .from('project_documents')
      .select('document_id, projects(name)')
      .in('document_id', documentIds)

    projectNamesByDocId = new Map()
    for (const link of (links ?? []) as unknown as { document_id: string; projects: { name: string } | null }[]) {
      const name = link.projects?.name
      if (!name) continue
      const existing = projectNamesByDocId.get(link.document_id) ?? []
      existing.push(name)
      projectNamesByDocId.set(link.document_id, existing)
    }
  }

  const contextChunks = chunkMatches.map((m) => ({
    fileName: fileNameById.get(m.document_id) ?? 'unknown document',
    content: m.content,
  }))

  const answer = await askClaude(question, contextChunks)

  return NextResponse.json({
    answer,
    citations: buildCitations(chunkMatches, fileNameById, projectNamesByDocId),
  })
}
