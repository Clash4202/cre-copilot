import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

// C1 regression guard.
//
// /libraries is an async Server Component and this repo has no RSC render harness (vitest runs in
// the node environment, and there is no jsdom or testing-library), so there is no honest way to
// render the page and click through it here. What is testable is the exact condition the final
// review used to find the bug: after Task 7 replaced the flat /templates page with this one, the
// "Analyze →" half of its conditional was dropped, and `analyzeTemplate` was left with zero UI
// callers anywhere in src/. That left every inbox-ingested template permanently unusable — it is
// inserted with mapping = null, the mapping page's Confirm is disabled while fields.length === 0,
// and model generation only lists mapping_status = 'confirmed'. So the check is: some page must
// still invoke analyzeTemplate, and /libraries must still offer both halves of the branch.

const SRC_DIR = path.resolve(__dirname, '../../../../src')
const LIBRARIES_PAGE = path.resolve(__dirname, 'page.tsx')
const ANALYZE_ACTION = path.resolve(__dirname, '../templates/actions.ts')
const ANALYZE_TEMPLATE_FORM = path.resolve(__dirname, 'analyze-template-form.tsx')

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return collectSourceFiles(full)
    return /\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full) ? [full] : []
  })
}

describe('the /libraries page keeps a template out of a mapping dead end', () => {
  it('invokes analyzeTemplate from at least one UI component, not just defining it', () => {
    const callers = collectSourceFiles(SRC_DIR).filter(
      (file) => file !== ANALYZE_ACTION && readFileSync(file, 'utf8').includes('analyzeTemplate')
    )

    expect(callers).not.toHaveLength(0)
    expect(callers).toContain(ANALYZE_TEMPLATE_FORM)
  })

  it('offers Analyze as well as Review mapping, gated on whether a mapping proposal exists', () => {
    const source = readFileSync(LIBRARIES_PAGE, 'utf8')

    expect(source).toContain('AnalyzeTemplateForm')
    expect(source).toMatch(/Analyze/)
    expect(source).toMatch(/Review mapping/)
    // The two must be alternatives, not both rendered unconditionally: a template with a proposal
    // goes to review, one without goes to analyze.
    expect(source).toMatch(/mapping\?\.fields/)
  })
})
