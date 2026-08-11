import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { embedTexts } from '@/lib/voyage'
import { askClaude } from '@/lib/claude'
import { checkRateLimit } from '@/lib/rate-limit'

const MAX_QUESTION_CHARS = 2000
const RATE_LIMIT_MAX_REQUESTS = 20
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

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

  if (!checkRateLimit(user.id, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json({ error: 'Too many requests. Try again in a few minutes.' }, { status: 429 })
  }

  const { question } = await request.json()
  if (typeof question !== 'string' || !question.trim()) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json({ error: 'Question is too long.' }, { status: 400 })
  }

  const [queryEmbedding] = await embedTexts([question], 'query')

  const { data: matches, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_count: 8,
  })
  if (error) {
    console.error('match_document_chunks failed:', error)
    return NextResponse.json({ error: 'Something went wrong searching your documents.' }, { status: 500 })
  }

  const chunkMatches = (matches ?? []) as ChunkMatch[]
  if (chunkMatches.length === 0) {
    return NextResponse.json({
      answer: "I don't have any documents to search yet — upload something in the Vault first.",
      citations: [],
    })
  }

  const documentIds = [...new Set(chunkMatches.map((m) => m.document_id))]
  const { data: documents } = await supabase.from('documents').select('id, file_name').in('id', documentIds)
  const fileNameById = new Map((documents ?? []).map((d) => [d.id, d.file_name]))

  const contextChunks = chunkMatches.map((m) => ({
    fileName: fileNameById.get(m.document_id) ?? 'unknown document',
    content: m.content,
  }))

  const answer = await askClaude(question, contextChunks)

  return NextResponse.json({
    answer,
    citations: chunkMatches.map((m, i) => ({
      index: i + 1,
      documentId: m.document_id,
      fileName: fileNameById.get(m.document_id) ?? 'unknown document',
      excerpt: m.content.slice(0, 200),
    })),
  })
}
