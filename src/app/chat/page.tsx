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
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Ask the Brain</h1>
      <div className="flex flex-col gap-6">
        {turns.map((turn, i) => (
          <div key={i} className="flex flex-col gap-2">
            <p className="font-medium">{turn.question}</p>
            <p className="whitespace-pre-wrap text-sm text-gray-700">{turn.answer}</p>
            {turn.citations.length > 0 && (
              <div className="flex flex-col gap-1 text-xs text-gray-500">
                {turn.citations.map((c) => (
                  <div key={c.index}>
                    [{c.index}] {c.fileName}: &quot;{c.excerpt}...&quot;
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your uploaded documents..."
          className="flex-1 rounded border px-3 py-2"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? 'Thinking...' : 'Ask'}
        </button>
      </form>
    </div>
  )
}
