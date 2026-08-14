import Anthropic from '@anthropic-ai/sdk'
import type { CellDescriptor } from './excel-structure'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type MappingSource =
  | 'assumption'
  | 't12_subtotal'
  | 't12_line_item'
  | 'rent_roll_unit_count'
  | 'rent_roll_average_budgeted_rent'

const MAPPING_SOURCE_VALUES: MappingSource[] = [
  'assumption',
  't12_subtotal',
  't12_line_item',
  'rent_roll_unit_count',
  'rent_roll_average_budgeted_rent',
]

export interface MappingField {
  id: string
  label: string
  sheet: string
  cell: string
  source: MappingSource
  sourceKey: string | null
}

export interface TemplateMapping {
  fields: MappingField[]
}

export function buildMappingPrompt(structure: CellDescriptor[], assetType: string): string {
  const structureJson = JSON.stringify(structure)

  return `You are analyzing a blank commercial real estate underwriting template (asset type: ${assetType}) so its input cells can be filled automatically from a T12 operating statement and a rent roll.

Below is every non-empty cell in the template, as JSON: {sheet, cell, value, formula}. A cell with a formula is NOT an input — never map it. Only cells that currently hold a literal example/placeholder value, or are visibly meant to be typed into, are candidate input cells.

<template_structure>
${structureJson}
</template_structure>

Only map cells in these categories — everything else, skip entirely, do not list it at all:
- Core DCF/valuation assumptions on the model's income, expense, or valuation sheets (rent growth %, expense inflation %, vacancy %, discount rate, cap rates, replacement reserves, leasing commissions, tenant improvement allowances, and similar per-deal judgment calls) — "assumption" source.
- Operating income/expense inputs derivable from a T12 — "t12_subtotal" or "t12_line_item" source.
- Unit-mix inputs derivable from a rent roll — "rent_roll_unit_count" or "rent_roll_average_budgeted_rent" source.

Do NOT map property identity/record fields (address, zoning, year built, ownership entity, assessed value, parcel data), demographic/population data, or comparable-sales/land/lease-comp tables — those need external market research or county records, not a T12 or rent roll, and are out of scope here. Skip them entirely rather than mapping them as unresolved assumptions.

Respond with ONLY a JSON object of this exact shape, no other text:

{"fields": [{"id": "unique-snake-or-dot-id", "label": "human readable label", "sheet": "sheet name", "cell": "A1-style address", "source": "assumption | t12_subtotal | t12_line_item | rent_roll_unit_count | rent_roll_average_budgeted_rent", "sourceKey": "matching label text, or null for source=assumption"}]}

source meanings:
- "assumption": a market judgment call typed in per deal (rent growth %, vacancy %, discount rate, cap rate, etc.) — sourceKey must be null.
- "t12_subtotal": a category total from the T12 (e.g. "Total General & Administrative", "NET OPERATING INCOME") — sourceKey is that T12 label, exactly as it would appear on the T12.
- "t12_line_item": a single T12 GL line (e.g. "Property Taxes") — sourceKey is that line's label.
- "rent_roll_unit_count": the number of units of one unit type — sourceKey is that unit type's label.
- "rent_roll_average_budgeted_rent": the average budgeted rent for one unit type — sourceKey is that unit type's label.`
}

export function parseMappingResponse(responseText: string): TemplateMapping {
  const start = responseText.indexOf('{')
  if (start === -1) {
    throw new Error('Mapping response did not contain a JSON object')
  }

  const end = responseText.lastIndexOf('}')
  if (end === -1 || end < start) {
    throw new Error('Mapping response was not valid JSON')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(responseText.slice(start, end + 1))
  } catch {
    throw new Error('Mapping response was not valid JSON')
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { fields?: unknown }).fields)
  ) {
    throw new Error('Mapping response was missing a "fields" array')
  }

  const fields = (parsed as { fields: unknown[] }).fields.filter((candidate): candidate is MappingField => {
    if (typeof candidate !== 'object' || candidate === null) return false
    const f = candidate as Record<string, unknown>
    return (
      typeof f.id === 'string' &&
      typeof f.label === 'string' &&
      typeof f.sheet === 'string' &&
      typeof f.cell === 'string' &&
      typeof f.source === 'string' &&
      MAPPING_SOURCE_VALUES.includes(f.source as MappingSource) &&
      (f.sourceKey === null || typeof f.sourceKey === 'string')
    )
  })

  return { fields }
}

export async function proposeMapping(structure: CellDescriptor[], assetType: string): Promise<TemplateMapping> {
  // A real template's in-scope field list (after the prompt's own scoping) can still run to 100+
  // cells for a multi-tenant commercial template — 4096 max_tokens truncated mid-JSON during
  // verification against a real 11-sheet template. 24000 gives real headroom, but the Anthropic SDK
  // refuses a non-streaming request at that size ("Streaming is required for operations that may
  // take longer than 10 minutes"), so this uses the streaming API and accumulates the final message,
  // per the SDK's own guidance. 'low' effort matters just as much: this is structured
  // extraction/classification, not novel reasoning, and 'medium' effort spent most of the token
  // budget on thinking rather than the actual JSON output, causing truncation even with a higher
  // max_tokens alone.
  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-5',
    max_tokens: 24000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: buildMappingPrompt(structure, assetType) }],
  })
  const message = await stream.finalMessage()

  const textBlock = message.content.find((block) => block.type === 'text')
  return parseMappingResponse(textBlock?.type === 'text' ? textBlock.text : '')
}
