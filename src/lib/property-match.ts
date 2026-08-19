import Anthropic from '@anthropic-ai/sdk'
import type { XlsxRow } from './xlsx-rows'
// The header rows below are raw cell values from a user-uploaded workbook, placed inside <rows>.
import { escapeForPrompt } from './escape-prompt'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MAX_HEADER_ROWS = 10

export function buildPropertyNamePrompt(headerRows: XlsxRow[]): string {
  const rowsJson = escapeForPrompt(JSON.stringify(headerRows.slice(0, MAX_HEADER_ROWS)))

  return `Below are the first rows of a commercial real estate T12 or rent roll export, as JSON arrays of cell values.

<rows>
${rowsJson}
</rows>

Identify the property name (not the report title like "Income Statement", not the accounting basis like "Accrual Basis", not a date range) mentioned in these rows. Respond with ONLY the property name, no other text. If you cannot confidently identify a property name, respond with exactly: UNKNOWN`
}

export function parsePropertyNameResponse(responseText: string): string | null {
  const cleaned = responseText.trim().replace(/^["']|["']$/g, '').trim()
  if (!cleaned || cleaned === 'UNKNOWN') {
    return null
  }
  return cleaned
}

export async function extractPropertyName(headerRows: XlsxRow[]): Promise<string | null> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 100,
    messages: [{ role: 'user', content: buildPropertyNamePrompt(headerRows) }],
  })

  const textBlock = message.content.find((block) => block.type === 'text')
  return parsePropertyNameResponse(textBlock?.type === 'text' ? textBlock.text : '')
}

export function matchProjectByName(
  name: string,
  projects: { id: string; name: string }[]
): { id: string; name: string } | null {
  if (!name) return null
  const target = name.trim().toLowerCase()
  return projects.find((p) => p.name.trim().toLowerCase() === target) ?? null
}
