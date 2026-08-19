import Anthropic from '@anthropic-ai/sdk'
// structureSummary is derived from a user-uploaded file's content (fully untrusted); librariesJson
// reflects the user's own section names/descriptions, which they could still craft adversarially
// within their own account. Both go inside XML-style tags below, so both are escaped.
import { escapeForPrompt } from './escape-prompt'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface LibrarySummary {
  id: string
  name: string
  sections: { id: string; name: string; description: string }[]
}

export interface SectionMatchResult {
  libraryId: string | null
  libraryName: string
  sectionId: string | null
  sectionName: string
  sectionDescription: string
}

export function buildSectionMatchPrompt(
  libraries: LibrarySummary[],
  fileKind: 'template' | 'bov',
  structureSummary: string
): string {
  const librariesJson = escapeForPrompt(JSON.stringify(libraries))
  const escapedStructureSummary = escapeForPrompt(structureSummary)

  return `A user just uploaded a commercial real estate ${fileKind} file. Here is a summary of its structure/content:

<file_structure>
${escapedStructureSummary}
</file_structure>

Here are the user's existing libraries and sections, as JSON (each library has a name and a list of sections, each section has a name and description):

<existing_libraries>
${librariesJson}
</existing_libraries>

Decide which existing section this file best belongs in, OR propose creating a new library and/or section for it if nothing existing fits well. Respond with ONLY a JSON object of this exact shape, no other text:

{"libraryId": "existing library id, or null to propose a new library", "libraryName": "the library's name (existing or your proposed new name)", "sectionId": "existing section id, or null to propose a new section", "sectionName": "the section's name (existing or your proposed new name)", "sectionDescription": "the section's description (existing description if matching an existing section, or a short proposed description if new)"}`
}

export function parseSectionMatchResponse(responseText: string): SectionMatchResult {
  const start = responseText.indexOf('{')
  const end = responseText.lastIndexOf('}')

  if (start === -1) {
    throw new Error('Section match response did not contain a JSON object')
  }

  if (end === -1 || end < start) {
    throw new Error('Section match response was not valid JSON')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(responseText.slice(start, end + 1))
  } catch {
    throw new Error('Section match response was not valid JSON')
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Section match response was missing required fields')
  }

  const p = parsed as Record<string, unknown>
  const hasRequiredFields =
    (typeof p.libraryId === 'string' || p.libraryId === null) &&
    typeof p.libraryName === 'string' &&
    (typeof p.sectionId === 'string' || p.sectionId === null) &&
    typeof p.sectionName === 'string' &&
    typeof p.sectionDescription === 'string'

  if (!hasRequiredFields) {
    throw new Error('Section match response was missing required fields')
  }

  return {
    libraryId: p.libraryId as string | null,
    libraryName: p.libraryName as string,
    sectionId: p.sectionId as string | null,
    sectionName: p.sectionName as string,
    sectionDescription: p.sectionDescription as string,
  }
}

export async function proposeSectionMatch(
  libraries: LibrarySummary[],
  fileKind: 'template' | 'bov',
  structureSummary: string
): Promise<SectionMatchResult> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 500,
    messages: [{ role: 'user', content: buildSectionMatchPrompt(libraries, fileKind, structureSummary) }],
  })

  const textBlock = message.content.find((block) => block.type === 'text')
  return parseSectionMatchResponse(textBlock?.type === 'text' ? textBlock.text : '')
}
