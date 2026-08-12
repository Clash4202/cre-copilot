'use client'

import { useState } from 'react'

interface Citation {
  index: number
  documentId: string
  fileName: string
  excerpt: string
}

interface ChatTurn {
  question: string
  answer: string
  citations: Citation[]
}

export default function ChatPage() {
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim() || loading) return
    setLoading(true)
    const currentQuestion = question
    setQuestion('')

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: currentQuestion }),
    })
    const data = await response.json()
    setTurns((prev) => [
      ...prev,
      { question: currentQuestion, answer: data.answer ?? data.error, citations: data.citations ?? [] },
    ])
    setLoading(false)
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-slate">
          Ask the Brain
        </span>
        <h1 className="font-display text-3xl font-medium tracking-tight">
          Ask your documents
        </h1>
      </div>

      {turns.length === 0 ? (
        <p className="text-sm text-slate">
          Ask a question about anything in your vault. Every answer cites the exact document
          and passage it came from.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {turns.map((turn, i) => (
            <div key={i} className="flex flex-col gap-3">
              <p className="font-display text-lg font-medium tracking-tight">{turn.question}</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{turn.answer}</p>
              {turn.citations.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {turn.citations.map((c) => (
                    <details
                      key={c.index}
                      className="group rounded-md border border-hairline px-2 py-1 open:bg-wine/5"
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-mono text-xs text-wine marker:content-none">
                        <span className="rounded-full bg-wine px-1.5 text-paper">
                          {c.index}
                        </span>
                        {c.fileName}
                      </summary>
                      <p className="mt-1.5 max-w-sm text-xs text-slate">&quot;{c.excerpt}&quot;</p>
                    </details>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="sticky bottom-6 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your uploaded documents..."
          className="flex-1 rounded-md border border-hairline bg-paper px-3 py-2.5 text-sm text-ink shadow-sm outline-none transition-colors placeholder:text-slate/70 focus:border-forest focus:ring-2 focus:ring-forest/20"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper shadow-sm transition-colors hover:bg-forest disabled:opacity-50"
        >
          {loading ? 'Thinking...' : 'Ask'}
        </button>
      </form>
    </div>
  )
}
