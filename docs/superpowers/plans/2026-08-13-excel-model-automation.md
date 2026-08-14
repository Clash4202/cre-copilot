# Excel/DCF Model Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take a T12 and rent roll (`.xlsx` exports) and an arbitrary, user-uploaded DCF/direct-cap
Excel template, and produce a filled copy of that template — automatically, without manual retyping
or hardcoded row ranges — flagging anything the source documents don't supply instead of guessing.

**Architecture:** Three layers. (1) Deterministic structural parsers turn a T12 or rent roll `.xlsx`
into structured data by walking row patterns (GL codes, subtotal rows, `Unit Type:` markers), not
fixed row numbers. (2) An AI-assisted mapping step — run once per uploaded template, reviewed and
corrected by the user, then reused forever — tells the system which template cells are inputs and
which T12/rent-roll value or assumption each one should hold. (3) Model generation applies a
confirmed mapping to a specific deal's parsed T12/rent-roll plus typed-in assumptions, writing only
the resolved input cells as plain values into a copy of the template. Every formula already in the
template — EGI, NOI, the DCF value indication, everything downstream — is left completely untouched;
opening the generated file in Excel recalculates it normally. No server-side recalculation or
formula-evaluation engine is built or needed.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS + Storage), Anthropic Claude API
(`@anthropic-ai/sdk`, already a dependency), Vitest. New dependency: `exceljs` (reads and writes
`.xlsx` — the app currently only reads PDF/text via `unpdf`; nothing handles spreadsheets yet).

## Global Constraints

- **New dependency:** `exceljs` (`npm install exceljs`). It ships its own TypeScript types — do not
  install `@types/exceljs`.
- **No formula evaluation, ever.** This system only ever writes literal input values into cells a
  confirmed mapping identifies as inputs. It never evaluates, reproduces, or reimplements a
  template's own formulas (EGI, NOI, DCF value indication, etc.) in any task below. If a task
  description here seems to call for that, it's a bug in this plan — stop and flag it rather than
  building it.
- Code style matches the existing codebase: no semicolons, single quotes, `'use server'` at the top
  of server action files.
- Next.js 16 App Router: dynamic route `params` are async — type as `params: Promise<{ ... }>` and
  `await params` before use (same convention `docs/superpowers/plans/2026-08-13-project-workspaces.md`
  already established).
- Row-level security is the real security boundary. Every new table has RLS enabled from creation;
  every new query relies on it rather than manual `user_id` filtering in application code.
- Reuse the existing "deed and ledger" design tokens from `src/app/globals.css` (`bg-forest`,
  `text-wine`, `border-hairline`, `bg-paper`, `text-ink`, `text-slate`, `font-mono uppercase
  tracking-widest` for labels, `font-display` for headings). No new design pass — match the existing
  Vault/Projects pages' look exactly.
- Following the existing codebase convention: pure functions in `src/lib/*.ts` get unit tests
  (Vitest). Server Components, Server Actions, and API routes (`page.tsx`, `actions.ts`, `route.ts`)
  do not get dedicated test files — they get `npx tsc --noEmit` and the manual end-to-end walkthrough
  in the final task instead.
- Storage buckets are private, per-user-folder, same RLS pattern as the existing `documents` bucket
  in `supabase/migrations/0001_init.sql`.

---

### Task 1: Database migration — templates, generated models, storage buckets, document kind

**Files:**
- Create: `supabase/migrations/0004_excel_models.sql`

**Interfaces:**
- Produces: `templates` table (`id`, `user_id`, `name`, `asset_type`, `storage_path`, `mapping`
  jsonb, `mapping_status`, `created_at`); `generated_models` table (`id`, `project_id`,
  `template_id`, `t12_document_id`, `rent_roll_document_id`, `storage_path`, `assumptions` jsonb,
  `summary` jsonb, `gaps` jsonb, `created_at`); `documents.detected_kind` column; storage buckets
  `templates` and `generated-models`. Later tasks insert/select these exact table and column names.

- [ ] **Step 1: Write the migration**

```sql
create table templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  asset_type text not null,
  storage_path text not null,
  mapping jsonb,
  mapping_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table generated_models (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  template_id uuid not null references templates(id),
  t12_document_id uuid references documents(id),
  rent_roll_document_id uuid references documents(id),
  storage_path text not null,
  assumptions jsonb not null default '{}',
  summary jsonb not null default '{}',
  gaps jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table documents add column detected_kind text;

alter table templates enable row level security;
alter table generated_models enable row level security;

create policy "Users manage their own templates"
  on templates for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own generated models"
  on generated_models for all
  using (
    auth.uid() = (select user_id from projects where id = project_id)
  )
  with check (
    auth.uid() = (select user_id from projects where id = project_id)
    and template_id in (select id from templates where user_id = auth.uid())
  );

insert into storage.buckets (id, name, public)
values
  ('templates', 'templates', false),
  ('generated-models', 'generated-models', false)
on conflict (id) do nothing;

create policy "Users upload templates to their own folder"
  on storage.objects for insert
  with check (bucket_id = 'templates' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users read their own templates"
  on storage.objects for select
  using (bucket_id = 'templates' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users upload generated models to their own folder"
  on storage.objects for insert
  with check (bucket_id = 'generated-models' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users read their own generated models"
  on storage.objects for select
  using (bucket_id = 'generated-models' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: Apply the migration to the dev Supabase project and confirm it runs clean**

Run the migration the same way prior migrations in this project were applied (Supabase SQL editor or
CLI, matching how `0003_projects.sql` was applied). Confirm no errors and that `templates`,
`generated_models` appear in the table list, `documents` has a new `detected_kind` column, and both
new storage buckets exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0004_excel_models.sql
git commit -m "Add templates, generated_models tables and storage buckets"
```

---

### Task 2: exceljs dependency + raw row reader

**Files:**
- Modify: `package.json` (add `exceljs`)
- Create: `src/lib/xlsx-rows.ts`
- Test: `src/lib/xlsx-rows.test.ts`

**Interfaces:**
- Produces: `XlsxRow = (string | number | null)[]` type; `readWorksheetRows(worksheet:
  ExcelJS.Worksheet): XlsxRow[]`. Tasks 3, 4, 5, 6, 12 all import `XlsxRow` from this file.

- [ ] **Step 1: Install exceljs**

```bash
npm install exceljs
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/lib/xlsx-rows.test.ts
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { readWorksheetRows } from './xlsx-rows'

describe('readWorksheetRows', () => {
  it('reads populated cells into 0-indexed row arrays', () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Sheet1')
    sheet.getCell('A1').value = 'Account'
    sheet.getCell('B1').value = 'Account Name'
    sheet.getCell('O1').value = 'Total'
    sheet.getCell('A2').value = '5005-0000'
    sheet.getCell('B2').value = 'Gross Market Rent'
    sheet.getCell('O2').value = 10641115.44

    const rows = readWorksheetRows(sheet)

    expect(rows[0][0]).toBe('Account')
    expect(rows[0][1]).toBe('Account Name')
    expect(rows[0][14]).toBe('Total')
    expect(rows[1][0]).toBe('5005-0000')
    expect(rows[1][1]).toBe('Gross Market Rent')
    expect(rows[1][14]).toBe(10641115.44)
  })

  it('returns null for empty cells within the used range', () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Sheet1')
    sheet.getCell('A1').value = 'x'
    sheet.getCell('F1').value = 'y'

    const rows = readWorksheetRows(sheet)

    expect(rows[0][2]).toBeNull()
  })

  it('returns an empty array for a sheet with no data', () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Empty')

    expect(readWorksheetRows(sheet)).toEqual([])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/xlsx-rows.test.ts`
Expected: FAIL — `src/lib/xlsx-rows.ts` does not exist yet.

- [ ] **Step 4: Write the implementation**

```typescript
// src/lib/xlsx-rows.ts
import type { Worksheet } from 'exceljs'

export type XlsxRow = (string | number | null)[]

export function readWorksheetRows(worksheet: Worksheet): XlsxRow[] {
  const rows: XlsxRow[] = []

  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values: XlsxRow = []
    for (let col = 1; col <= worksheet.columnCount; col++) {
      const raw = row.getCell(col).value
      if (typeof raw === 'number' || typeof raw === 'string') {
        values[col - 1] = raw
      } else if (raw === null || raw === undefined) {
        values[col - 1] = null
      } else {
        values[col - 1] = row.getCell(col).text || null
      }
    }
    rows[row.number - 1] = values
  })

  return rows.map((row) => row ?? [])
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/xlsx-rows.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/xlsx-rows.ts src/lib/xlsx-rows.test.ts
git commit -m "Add exceljs and a raw worksheet-row reader"
```

---

### Task 3: T12 structural parser

**Files:**
- Create: `src/lib/t12.ts`
- Test: `src/lib/t12.test.ts`

**Interfaces:**
- Consumes: `XlsxRow` from `src/lib/xlsx-rows.ts` (Task 2).
- Produces: `T12LineItem { accountCode: string; label: string; total: number }`; `ParsedT12 {
  lineItems: T12LineItem[]; subtotalsByLabel: Record<string, number> }`; `parseT12(rows: XlsxRow[]):
  ParsedT12`. Task 5 (`xlsx-detect.ts`) and Task 11 (`model-generation.ts`) import `ParsedT12` and
  `parseT12` by these exact names.

- [ ] **Step 1: Write the failing test**

This uses real values from a real AppFolio T12 export (`Monthly Operating Statement - May 2026.xlsx`,
inspected directly), not fabricated numbers — the classification logic must produce these exact
figures from that real row shape.

```typescript
// src/lib/t12.test.ts
import { describe, it, expect } from 'vitest'
import { parseT12 } from './t12'
import type { XlsxRow } from './xlsx-rows'

function row(accountCode: string | null, label: string | null, total: number | string | null): XlsxRow {
  const r: XlsxRow = new Array(15).fill(null)
  r[0] = accountCode
  r[1] = label
  r[14] = total
  return r
}

describe('parseT12', () => {
  it('extracts GL-coded rows as line items, keyed with their account code', () => {
    const rows = [
      row('Income Statement', null, null),
      row('Operating Income', null, null),
      row('Gross Potential Rent', null, null),
      row('5005-0000', 'Gross Market Rent', 10641115.44),
      row('5010-0000', 'Contract Gain(Loss) to Lease', -318151.66),
    ]

    const result = parseT12(rows)

    expect(result.lineItems).toEqual([
      { accountCode: '5005-0000', label: 'Gross Market Rent', total: 10641115.44 },
      { accountCode: '5010-0000', label: 'Contract Gain(Loss) to Lease', total: -318151.66 },
    ])
  })

  it('extracts unaccounted rows with a label and a numeric total as subtotals', () => {
    const rows = [
      row('5005-0000', 'Gross Market Rent', 10641115.44),
      row('5010-0000', 'Contract Gain(Loss) to Lease', -318151.66),
      row(null, 'Gross Potential Rent', 10322963.78),
      row(null, 'Total General & Administrative', 214125.62),
      row(null, 'NET OPERATING INCOME', 1488873.7),
    ]

    const result = parseT12(rows)

    expect(result.subtotalsByLabel).toEqual({
      'Gross Potential Rent': 10322963.78,
      'Total General & Administrative': 214125.62,
      'NET OPERATING INCOME': 1488873.7,
    })
  })

  it('ignores title rows, section-header-only rows, and the column header row', () => {
    const rows = [
      row('Income Statement', null, null),
      row('Avery Philly', null, null),
      row('Accrual Basis', null, null),
      row('Operating Income', null, null),
      row('Account', 'Account Name', 'Total'),
    ]

    const result = parseT12(rows)

    expect(result.lineItems).toEqual([])
    expect(result.subtotalsByLabel).toEqual({})
  })

  it('returns empty structures for an empty sheet', () => {
    expect(parseT12([])).toEqual({ lineItems: [], subtotalsByLabel: {} })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/t12.test.ts`
Expected: FAIL — `src/lib/t12.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/t12.ts
import type { XlsxRow } from './xlsx-rows'

const GL_CODE_PATTERN = /^\d{4}-\d{4}$/
const ACCOUNT_COL = 0
const LABEL_COL = 1
const TOTAL_COL = 14

export interface T12LineItem {
  accountCode: string
  label: string
  total: number
}

export interface ParsedT12 {
  lineItems: T12LineItem[]
  subtotalsByLabel: Record<string, number>
}

export function parseT12(rows: XlsxRow[]): ParsedT12 {
  const lineItems: T12LineItem[] = []
  const subtotalsByLabel: Record<string, number> = {}

  for (const row of rows) {
    const accountCode = row[ACCOUNT_COL]
    const label = row[LABEL_COL]
    const total = row[TOTAL_COL]

    const isGlCodeRow = typeof accountCode === 'string' && GL_CODE_PATTERN.test(accountCode)

    if (isGlCodeRow && typeof label === 'string' && typeof total === 'number') {
      lineItems.push({ accountCode: accountCode as string, label, total })
    } else if (accountCode === null && typeof label === 'string' && typeof total === 'number') {
      subtotalsByLabel[label] = total
    }
  }

  return { lineItems, subtotalsByLabel }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/t12.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/t12.ts src/lib/t12.test.ts
git commit -m "Add structural T12 parser"
```

---

### Task 4: Rent roll structural parser

**Files:**
- Create: `src/lib/rent-roll.ts`
- Test: `src/lib/rent-roll.test.ts`

**Interfaces:**
- Consumes: `XlsxRow` from `src/lib/xlsx-rows.ts` (Task 2).
- Produces: `RentRollUnit { unitId: string; status: string | null; marketRent: number;
  budgetedRent: number; actualCharges: number }`; `RentRollUnitTypeBlock { unitType: string; units:
  RentRollUnit[] }`; `ParsedRentRoll { unitTypeBlocks: RentRollUnitTypeBlock[] }`;
  `parseRentRoll(rows: XlsxRow[]): ParsedRentRoll`; `averageBudgetedRent(units: RentRollUnit[]):
  number`. Task 5 and Task 11 import these by these exact names.

- [ ] **Step 1: Write the failing test**

This also uses real values, from a real AppFolio rent roll export (`Rent Roll - May 2026.xlsx`,
inspected directly) — the Retail block (4 units, all $0 budgeted rent) and the start of the A1 Studio
block.

```typescript
// src/lib/rent-roll.test.ts
import { describe, it, expect } from 'vitest'
import { parseRentRoll, averageBudgetedRent } from './rent-roll'
import type { XlsxRow } from './xlsx-rows'

function row(
  label: string | null,
  status: string | null,
  marketRent: number | null,
  budgetedRent: number | null,
  actualCharges: number | null
): XlsxRow {
  const r: XlsxRow = new Array(11).fill(null)
  r[0] = label
  r[2] = status
  r[8] = marketRent
  r[9] = budgetedRent
  r[10] = actualCharges
  return r
}

describe('parseRentRoll', () => {
  it('groups units into blocks by Unit Type header, closing on the Total: row', () => {
    const rows = [
      row('Rent Roll', null, null, null, null),
      row('Unit Details', null, null, null, null),
      row('Bldg-Unit', 'Unit Status', null, null, null),
      row('Unit Type: Retail', null, null, null, null),
      row('RetailSpace 1', 'Occupied No Notice', 0, 0, 6481),
      row('RetailSpace 2', 'Occupied No Notice', 0, 0, 5706.95),
      row('RetailSpace 3', 'Vacant Unrented Ready', 0, 0, 0),
      row('RetailSpace 4', 'Vacant Unrented Ready', 0, 0, 0),
      row('Retail Total:', null, 0, 0, 12187.95),
      row('Unit Type: A1 Studio', null, null, null, null),
      row('159', 'Vacant Unrented Ready', 1399, 1249, 0),
      row('162', 'Vacant Unrented Ready', 1399, 1249, 0),
      row('163', 'Vacant Unrented Ready', 1399, 1249, 0),
      row('164', 'Occupied No Notice', 1399, 1249, 612.95),
    ]

    const result = parseRentRoll(rows)

    expect(result.unitTypeBlocks).toHaveLength(2)
    expect(result.unitTypeBlocks[0].unitType).toBe('Retail')
    expect(result.unitTypeBlocks[0].units).toEqual([
      { unitId: 'RetailSpace 1', status: 'Occupied No Notice', marketRent: 0, budgetedRent: 0, actualCharges: 6481 },
      { unitId: 'RetailSpace 2', status: 'Occupied No Notice', marketRent: 0, budgetedRent: 0, actualCharges: 5706.95 },
      { unitId: 'RetailSpace 3', status: 'Vacant Unrented Ready', marketRent: 0, budgetedRent: 0, actualCharges: 0 },
      { unitId: 'RetailSpace 4', status: 'Vacant Unrented Ready', marketRent: 0, budgetedRent: 0, actualCharges: 0 },
    ])
    expect(result.unitTypeBlocks[1].unitType).toBe('A1 Studio')
    expect(result.unitTypeBlocks[1].units).toHaveLength(4)
    expect(result.unitTypeBlocks[1].units[3]).toEqual({
      unitId: '164',
      status: 'Occupied No Notice',
      marketRent: 1399,
      budgetedRent: 1249,
      actualCharges: 612.95,
    })
  })

  it('ignores rows before the first Unit Type header', () => {
    const rows = [row('Some stray label', 'Occupied No Notice', 500, 500, 500)]

    expect(parseRentRoll(rows).unitTypeBlocks).toEqual([])
  })

  it('returns an empty structure for an empty sheet', () => {
    expect(parseRentRoll([])).toEqual({ unitTypeBlocks: [] })
  })
})

describe('averageBudgetedRent', () => {
  it('averages budgeted rent across every unit in a block, vacant or occupied', () => {
    const units = [
      { unitId: '159', status: 'Vacant Unrented Ready', marketRent: 1399, budgetedRent: 1249, actualCharges: 0 },
      { unitId: '162', status: 'Vacant Unrented Ready', marketRent: 1399, budgetedRent: 1249, actualCharges: 0 },
      { unitId: '163', status: 'Vacant Unrented Ready', marketRent: 1399, budgetedRent: 1249, actualCharges: 0 },
      { unitId: '164', status: 'Occupied No Notice', marketRent: 1399, budgetedRent: 1249, actualCharges: 612.95 },
    ]

    expect(averageBudgetedRent(units)).toBe(1249)
  })

  it('returns 0 for an empty unit list', () => {
    expect(averageBudgetedRent([])).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/rent-roll.test.ts`
Expected: FAIL — `src/lib/rent-roll.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/rent-roll.ts
import type { XlsxRow } from './xlsx-rows'

const LABEL_COL = 0
const STATUS_COL = 2
const MARKET_RENT_COL = 8
const BUDGETED_RENT_COL = 9
const ACTUAL_CHARGES_COL = 10
const UNIT_TYPE_PREFIX = 'Unit Type: '

export interface RentRollUnit {
  unitId: string
  status: string | null
  marketRent: number
  budgetedRent: number
  actualCharges: number
}

export interface RentRollUnitTypeBlock {
  unitType: string
  units: RentRollUnit[]
}

export interface ParsedRentRoll {
  unitTypeBlocks: RentRollUnitTypeBlock[]
}

export function parseRentRoll(rows: XlsxRow[]): ParsedRentRoll {
  const unitTypeBlocks: RentRollUnitTypeBlock[] = []
  let currentBlock: RentRollUnitTypeBlock | null = null

  for (const row of rows) {
    const label = row[LABEL_COL]
    if (typeof label !== 'string') continue

    if (label.startsWith(UNIT_TYPE_PREFIX)) {
      currentBlock = { unitType: label.slice(UNIT_TYPE_PREFIX.length), units: [] }
      unitTypeBlocks.push(currentBlock)
      continue
    }
    if (label.endsWith(' Total:') || label === 'Total') continue
    if (!currentBlock) continue

    const status = row[STATUS_COL]
    const marketRent = row[MARKET_RENT_COL]
    const budgetedRent = row[BUDGETED_RENT_COL]
    const actualCharges = row[ACTUAL_CHARGES_COL]

    currentBlock.units.push({
      unitId: label,
      status: typeof status === 'string' ? status : null,
      marketRent: typeof marketRent === 'number' ? marketRent : 0,
      budgetedRent: typeof budgetedRent === 'number' ? budgetedRent : 0,
      actualCharges: typeof actualCharges === 'number' ? actualCharges : 0,
    })
  }

  return { unitTypeBlocks }
}

export function averageBudgetedRent(units: RentRollUnit[]): number {
  if (units.length === 0) return 0
  return units.reduce((sum, unit) => sum + unit.budgetedRent, 0) / units.length
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/rent-roll.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/rent-roll.ts src/lib/rent-roll.test.ts
git commit -m "Add structural rent roll parser"
```

---

### Task 5: Document kind detection

**Files:**
- Create: `src/lib/xlsx-detect.ts`
- Test: `src/lib/xlsx-detect.test.ts`

**Interfaces:**
- Consumes: `parseT12` (Task 3), `parseRentRoll` (Task 4), `XlsxRow` (Task 2).
- Produces: `DocumentKind = 't12' | 'rent_roll' | 'unknown'`; `detectDocumentKind(rows: XlsxRow[]):
  DocumentKind`. Task 6 imports this by this exact name.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/xlsx-detect.test.ts
import { describe, it, expect } from 'vitest'
import { detectDocumentKind } from './xlsx-detect'
import type { XlsxRow } from './xlsx-rows'

function t12Row(accountCode: string | null, label: string | null, total: number | null): XlsxRow {
  const r: XlsxRow = new Array(15).fill(null)
  r[0] = accountCode
  r[1] = label
  r[14] = total
  return r
}

function rentRollRow(label: string | null, budgetedRent: number | null): XlsxRow {
  const r: XlsxRow = new Array(11).fill(null)
  r[0] = label
  r[9] = budgetedRent
  return r
}

describe('detectDocumentKind', () => {
  it('detects a T12 by its GL-coded line items and labeled subtotals', () => {
    const rows = [
      t12Row('5005-0000', 'Gross Market Rent', 10641115.44),
      t12Row(null, 'Gross Potential Rent', 10322963.78),
    ]

    expect(detectDocumentKind(rows)).toBe('t12')
  })

  it('detects a rent roll by its Unit Type blocks with units', () => {
    const rows = [
      rentRollRow('Unit Type: Retail', null),
      rentRollRow('RetailSpace 1', 0),
    ]

    expect(detectDocumentKind(rows)).toBe('rent_roll')
  })

  it('returns unknown for a sheet matching neither structure', () => {
    const rows: XlsxRow[] = [['Just', 'some', 'random', 'spreadsheet', 'data']]

    expect(detectDocumentKind(rows)).toBe('unknown')
  })

  it('returns unknown for an empty sheet', () => {
    expect(detectDocumentKind([])).toBe('unknown')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/xlsx-detect.test.ts`
Expected: FAIL — `src/lib/xlsx-detect.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/xlsx-detect.ts
import type { XlsxRow } from './xlsx-rows'
import { parseT12 } from './t12'
import { parseRentRoll } from './rent-roll'

export type DocumentKind = 't12' | 'rent_roll' | 'unknown'

export function detectDocumentKind(rows: XlsxRow[]): DocumentKind {
  const t12 = parseT12(rows)
  if (t12.lineItems.length > 0 && Object.keys(t12.subtotalsByLabel).length > 0) {
    return 't12'
  }

  const rentRoll = parseRentRoll(rows)
  if (rentRoll.unitTypeBlocks.some((block) => block.units.length > 0)) {
    return 'rent_roll'
  }

  return 'unknown'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/xlsx-detect.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/xlsx-detect.ts src/lib/xlsx-detect.test.ts
git commit -m "Add T12/rent-roll document kind detection"
```

---

### Task 6: Extend Vault upload to accept and classify T12/rent-roll `.xlsx` files

**Files:**
- Modify: `src/app/(app)/projects/[projectId]/vault/actions.ts`
- Modify: `src/app/(app)/projects/[projectId]/vault/page.tsx`

**Interfaces:**
- Consumes: `readWorksheetRows` (Task 2), `detectDocumentKind` (Task 5).
- Produces: `documents.detected_kind` populated as `'t12' | 'rent_roll'` for classified `.xlsx`
  uploads. Task 13's model-generation page reads `documents.detected_kind` to offer T12/rent-roll
  documents by these exact string values.

- [ ] **Step 1: Extend `uploadDocument` to accept `.xlsx` and classify it**

In `src/app/(app)/projects/[projectId]/vault/actions.ts`, add the imports and extend the file-type
branch and post-upload handling:

```typescript
import ExcelJS from 'exceljs'
import { readWorksheetRows } from '@/lib/xlsx-rows'
import { detectDocumentKind } from '@/lib/xlsx-detect'
```

Change the type-check block from:

```typescript
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const isText = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')
  if (!isPdf && !isText) {
    throw new Error('Only PDF and plain text files are supported')
  }
```

to:

```typescript
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const isText = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')
  const isXlsx =
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.name.toLowerCase().endsWith('.xlsx')
  if (!isPdf && !isText && !isXlsx) {
    throw new Error('Only PDF, plain text, and .xlsx files are supported')
  }
```

Where the storage upload, `documents` insert, and `project_documents` link already happen (keep that
logic as-is — same for all file types), change `doc_type: isPdf ? 'pdf' : 'text'` to:

```typescript
      doc_type: isPdf ? 'pdf' : isXlsx ? 'xlsx' : 'text',
```

Then, inside the existing `try { ... }` ingestion block, branch before the existing PDF/text logic:

```typescript
  try {
    if (isXlsx) {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(arrayBuffer)
      const firstSheet = workbook.worksheets[0]
      const rows = firstSheet ? readWorksheetRows(firstSheet) : []
      const kind = detectDocumentKind(rows)

      if (kind === 'unknown') {
        throw new Error(
          "This spreadsheet doesn't look like a T12 or rent roll export we recognize. Only recognized T12/rent roll exports are supported for .xlsx uploads right now."
        )
      }

      const { error: readyError } = await supabase
        .from('documents')
        .update({ status: 'ready', detected_kind: kind })
        .eq('id', documentRow.id)
      if (readyError) {
        console.error('Failed to mark document ready:', readyError)
        throw new Error('Could not finish processing this document. Please try again.')
      }

      revalidatePath(`/projects/${projectId}/vault`)
      return
    }

    let text: string
    let ocrPageCount = 0
    // ... existing PDF/text logic below is unchanged
```

(The existing PDF/text logic, chunking, embedding, and final `revalidatePath` stay exactly as they
are today — this only adds a new branch that returns early for `.xlsx` files, since T12/rent-roll
spreadsheets are structured data for model generation, not narrative text for chat search, and don't
go through chunking/embedding at all.)

- [ ] **Step 2: Update the file input's `accept` attribute and status display**

In `src/app/(app)/projects/[projectId]/vault/page.tsx`, change:

```typescript
            accept=".pdf,.txt"
```

to:

```typescript
            accept=".pdf,.txt,.xlsx"
```

Add `detected_kind: string | null` to the `DocumentRow` interface and to the `select` query
(`'created_at, documents(id, file_name, doc_type, status, created_at, ocr_page_count, detected_kind)'`).
Add a badge next to the existing OCR badge, shown when `doc.detected_kind` is set:

```tsx
                      {doc.detected_kind && (
                        <span className="rounded-full border border-forest/30 px-1.5 py-0.5 font-mono text-[10px] text-forest">
                          {doc.detected_kind === 't12' ? 'T12' : 'Rent Roll'}
                        </span>
                      )}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Manual verification**

Start the dev server, open a project's Vault, upload the real `Monthly Operating Statement - May
2026.xlsx` and confirm it appears with a "T12" badge and `status: ready` (no chunking spinner, no
OCR badge). Upload the real `Rent Roll - May 2026.xlsx` and confirm a "Rent Roll" badge. Upload an
unrelated `.xlsx` (e.g. a random spreadsheet) and confirm it's rejected with the "doesn't look like a
T12 or rent roll" error rather than silently accepted.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/projects/[projectId]/vault/actions.ts" "src/app/(app)/projects/[projectId]/vault/page.tsx"
git commit -m "Accept and classify T12/rent-roll .xlsx uploads in the Vault"
```

---

### Task 7: Template structure description

**Files:**
- Create: `src/lib/excel-structure.ts`
- Test: `src/lib/excel-structure.test.ts`

**Interfaces:**
- Produces: `CellDescriptor { sheet: string; cell: string; value: string | number | null; formula:
  string | null }`; `describeWorkbookStructure(workbook: ExcelJS.Workbook, maxCellsPerSheet?:
  number): CellDescriptor[]`. Task 8 imports `CellDescriptor` and calls this function by this exact
  name.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/excel-structure.test.ts
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { describeWorkbookStructure } from './excel-structure'

describe('describeWorkbookStructure', () => {
  it('describes literal values, formulas, and which sheet each cell is on', () => {
    const workbook = new ExcelJS.Workbook()
    const sheet1 = workbook.addWorksheet('Cash Flow (DCF)')
    sheet1.getCell('A1').value = 'Discount Rate'
    sheet1.getCell('B1').value = 0.08
    sheet1.getCell('C1').value = { formula: 'A1&B1', result: 'Discount Rate0.08' }
    const sheet2 = workbook.addWorksheet('Direct Cap')
    sheet2.getCell('A1').value = 'Overall Rate'

    const cells = describeWorkbookStructure(workbook)

    expect(cells).toContainEqual({ sheet: 'Cash Flow (DCF)', cell: 'A1', value: 'Discount Rate', formula: null })
    expect(cells).toContainEqual({ sheet: 'Cash Flow (DCF)', cell: 'B1', value: 0.08, formula: null })
    expect(cells).toContainEqual({ sheet: 'Cash Flow (DCF)', cell: 'C1', value: null, formula: 'A1&B1' })
    expect(cells).toContainEqual({ sheet: 'Direct Cap', cell: 'A1', value: 'Overall Rate', formula: null })
  })

  it('skips empty cells', () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Sheet1')
    sheet.getCell('A1').value = 'x'

    const cells = describeWorkbookStructure(workbook)

    expect(cells).toHaveLength(1)
  })

  it('caps the number of cells described per sheet', () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Sheet1')
    sheet.getCell('A1').value = 'one'
    sheet.getCell('A2').value = 'two'
    sheet.getCell('A3').value = 'three'

    const cells = describeWorkbookStructure(workbook, 2)

    expect(cells).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/excel-structure.test.ts`
Expected: FAIL — `src/lib/excel-structure.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/excel-structure.ts
import type { Workbook } from 'exceljs'

export interface CellDescriptor {
  sheet: string
  cell: string
  value: string | number | null
  formula: string | null
}

const DEFAULT_MAX_CELLS_PER_SHEET = 2000

export function describeWorkbookStructure(
  workbook: Workbook,
  maxCellsPerSheet: number = DEFAULT_MAX_CELLS_PER_SHEET
): CellDescriptor[] {
  const cells: CellDescriptor[] = []

  workbook.eachSheet((worksheet) => {
    let count = 0
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (count >= maxCellsPerSheet) return
        const raw = cell.value
        if (raw === null || raw === undefined) return

        let value: string | number | null = null
        let formula: string | null = null

        if (typeof raw === 'object' && raw !== null && 'formula' in raw) {
          formula = (raw as { formula: string }).formula
        } else if (typeof raw === 'number' || typeof raw === 'string') {
          value = raw
        } else {
          value = cell.text || null
        }

        cells.push({ sheet: worksheet.name, cell: cell.address, value, formula })
        count++
      })
    })
  })

  return cells
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/excel-structure.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/excel-structure.ts src/lib/excel-structure.test.ts
git commit -m "Add workbook structure description for template mapping"
```

---

### Task 8: AI-assisted template mapping

**Files:**
- Create: `src/lib/template-mapping.ts`
- Test: `src/lib/template-mapping.test.ts`

**Interfaces:**
- Consumes: `CellDescriptor` from `src/lib/excel-structure.ts` (Task 7).
- Produces: `MappingSource = 'assumption' | 't12_subtotal' | 't12_line_item' |
  'rent_roll_unit_count' | 'rent_roll_average_budgeted_rent'`; `MappingField { id: string; label:
  string; sheet: string; cell: string; source: MappingSource; sourceKey: string | null }`;
  `TemplateMapping { fields: MappingField[] }`; `buildMappingPrompt(structure: CellDescriptor[],
  assetType: string): string`; `parseMappingResponse(responseText: string): TemplateMapping`;
  `proposeMapping(structure: CellDescriptor[], assetType: string): Promise<TemplateMapping>`. Task 9
  imports `proposeMapping` and `TemplateMapping`. Task 11 imports `TemplateMapping`, `MappingField`,
  and `MappingSource`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/template-mapping.test.ts
import { describe, it, expect } from 'vitest'
import { buildMappingPrompt, parseMappingResponse } from './template-mapping'
import type { CellDescriptor } from './excel-structure'

describe('buildMappingPrompt', () => {
  it('embeds the asset type and the serialized structure', () => {
    const structure: CellDescriptor[] = [
      { sheet: 'Cash Flow (DCF)', cell: 'M8', value: 0.08, formula: null },
    ]

    const prompt = buildMappingPrompt(structure, 'multifamily')

    expect(prompt).toContain('multifamily')
    expect(prompt).toContain('"sheet":"Cash Flow (DCF)"')
    expect(prompt).toContain('"cell":"M8"')
  })

  it('lists every valid source kind so the model knows the fixed vocabulary', () => {
    const prompt = buildMappingPrompt([], 'retail')

    expect(prompt).toContain('assumption')
    expect(prompt).toContain('t12_subtotal')
    expect(prompt).toContain('t12_line_item')
    expect(prompt).toContain('rent_roll_unit_count')
    expect(prompt).toContain('rent_roll_average_budgeted_rent')
  })
})

describe('parseMappingResponse', () => {
  it('parses a clean JSON response', () => {
    const response = JSON.stringify({
      fields: [
        { id: 'assumption.discountRate', label: 'Discount Rate', sheet: 'Cash Flow (DCF)', cell: 'M8', source: 'assumption', sourceKey: null },
      ],
    })

    const result = parseMappingResponse(response)

    expect(result.fields).toEqual([
      { id: 'assumption.discountRate', label: 'Discount Rate', sheet: 'Cash Flow (DCF)', cell: 'M8', source: 'assumption', sourceKey: null },
    ])
  })

  it('extracts JSON even when wrapped in prose or a code fence', () => {
    const response =
      'Here is the mapping:\n```json\n{"fields":[{"id":"a","label":"A","sheet":"S","cell":"A1","source":"assumption","sourceKey":null}]}\n```\nLet me know if you want changes.'

    const result = parseMappingResponse(response)

    expect(result.fields).toHaveLength(1)
    expect(result.fields[0].id).toBe('a')
  })

  it('throws a clear error when the response has no JSON object', () => {
    expect(() => parseMappingResponse('Sorry, I could not analyze this template.')).toThrow(
      /did not contain a JSON object/
    )
  })

  it('throws a clear error when the JSON is malformed', () => {
    expect(() => parseMappingResponse('{"fields": [')).toThrow(/not valid JSON/)
  })

  it('filters out fields with an invalid source value instead of throwing', () => {
    const response = JSON.stringify({
      fields: [
        { id: 'a', label: 'A', sheet: 'S', cell: 'A1', source: 'not_a_real_source', sourceKey: null },
        { id: 'b', label: 'B', sheet: 'S', cell: 'B1', source: 'assumption', sourceKey: null },
      ],
    })

    const result = parseMappingResponse(response)

    expect(result.fields).toHaveLength(1)
    expect(result.fields[0].id).toBe('b')
  })

  it('filters out fields missing required keys', () => {
    const response = JSON.stringify({
      fields: [{ id: 'a', source: 'assumption' }],
    })

    expect(parseMappingResponse(response).fields).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/template-mapping.test.ts`
Expected: FAIL — `src/lib/template-mapping.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/template-mapping.ts
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

Identify every input cell and propose which real-world value should fill it. Respond with ONLY a JSON object of this exact shape, no other text:

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
  const end = responseText.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Mapping response did not contain a JSON object')
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
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    messages: [{ role: 'user', content: buildMappingPrompt(structure, assetType) }],
  })

  const textBlock = message.content.find((block) => block.type === 'text')
  return parseMappingResponse(textBlock?.type === 'text' ? textBlock.text : '')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/template-mapping.test.ts`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/template-mapping.ts src/lib/template-mapping.test.ts
git commit -m "Add AI-assisted template mapping proposal and response parsing"
```

---

### Task 9: Templates list, upload, and mapping analysis

**Files:**
- Create: `src/app/(app)/templates/page.tsx`
- Create: `src/app/(app)/templates/actions.ts`

**Interfaces:**
- Consumes: `proposeMapping`, `TemplateMapping` (Task 8); `describeWorkbookStructure` (Task 7).
- Produces: `uploadTemplate(formData: FormData)`, `analyzeTemplate(templateId: string)` server
  actions. Task 10's mapping review page links to/from this page.

- [ ] **Step 1: Write the templates account-level page**

```tsx
// src/app/(app)/templates/page.tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { uploadTemplate, analyzeTemplate } from './actions'

interface TemplateRow {
  id: string
  name: string
  asset_type: string
  mapping_status: string
  mapping: { fields: unknown[] } | null
  created_at: string
}

export default async function TemplatesPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('templates')
    .select('id, name, asset_type, mapping_status, mapping, created_at')
    .order('created_at', { ascending: false })

  const templates = (data ?? []) as TemplateRow[]

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-slate">Templates</span>
        <h1 className="font-display text-3xl font-medium tracking-tight">Your DCF/direct-cap templates</h1>
      </div>

      <form
        action={uploadTemplate}
        className="flex flex-col gap-3 rounded-md border border-dashed border-hairline px-6 py-8"
      >
        <p className="text-sm text-slate">Upload a blank Excel underwriting template.</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            name="name"
            placeholder="Template name (e.g. Multifamily DCF)"
            required
            className="flex-1 rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
          <input
            type="text"
            name="assetType"
            placeholder="Asset type (e.g. multifamily)"
            required
            className="flex-1 rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            name="file"
            accept=".xlsx"
            required
            className="text-sm text-slate file:mr-3 file:rounded-md file:border file:border-hairline file:bg-paper file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:border-forest"
          />
          <button
            type="submit"
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-forest"
          >
            Upload
          </button>
        </div>
      </form>

      {templates.length === 0 ? (
        <p className="text-sm text-slate">No templates yet. Upload your first one above.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {templates.map((template) => {
            const hasProposal = Array.isArray(template.mapping?.fields) && template.mapping.fields.length > 0
            return (
              <li key={template.id} className="flex items-center justify-between rounded-md border border-hairline px-4 py-3 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="font-display text-base font-medium tracking-tight text-ink">{template.name}</span>
                  <span className="font-mono text-xs text-slate">{template.asset_type}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full border px-2 py-0.5 font-mono text-xs ${
                      template.mapping_status === 'confirmed'
                        ? 'border-forest/30 text-forest'
                        : 'border-wine/30 text-wine'
                    }`}
                  >
                    {template.mapping_status === 'confirmed' ? 'Confirmed' : 'Pending review'}
                  </span>
                  {hasProposal || template.mapping_status === 'confirmed' ? (
                    <Link href={`/templates/${template.id}/mapping`} className="font-mono text-xs uppercase tracking-widest text-wine hover:text-brick">
                      Review mapping →
                    </Link>
                  ) : (
                    <form action={analyzeTemplate.bind(null, template.id)}>
                      <button type="submit" className="font-mono text-xs uppercase tracking-widest text-wine hover:text-brick">
                        Analyze →
                      </button>
                    </form>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write the server actions**

```typescript
// src/app/(app)/templates/actions.ts
'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { describeWorkbookStructure } from '@/lib/excel-structure'
import { proposeMapping } from '@/lib/template-mapping'

const MAX_TEMPLATE_FILE_BYTES = 20 * 1024 * 1024 // 20MB — blank templates, smaller than a document upload
const MAX_NAME_CHARS = 200

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\]/g, '_').replace(/[\x00-\x1f]/g, '').slice(0, 200) || 'upload'
}

export async function uploadTemplate(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const name = formData.get('name')
  const assetType = formData.get('assetType')
  const file = formData.get('file')

  if (typeof name !== 'string' || !name.trim()) throw new Error('Give the template a name')
  if (name.length > MAX_NAME_CHARS) throw new Error('Template name is too long')
  if (typeof assetType !== 'string' || !assetType.trim()) throw new Error('Give the template an asset type')
  if (!(file instanceof File) || file.size === 0) throw new Error('No file provided')
  if (file.size > MAX_TEMPLATE_FILE_BYTES) throw new Error('File is too large (max 20MB)')
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Only .xlsx files are supported')

  const safeName = sanitizeFilename(file.name)
  const storagePath = `${user.id}/${randomUUID()}-${safeName}`
  const { error: uploadError } = await supabase.storage.from('templates').upload(storagePath, file)
  if (uploadError) {
    console.error('Template upload failed:', uploadError)
    throw new Error('Upload failed. Please try again.')
  }

  const { error: insertError } = await supabase.from('templates').insert({
    user_id: user.id,
    name: name.trim(),
    asset_type: assetType.trim(),
    storage_path: storagePath,
  })
  if (insertError) {
    console.error('Failed to record template:', insertError)
    throw new Error('Could not save this template. Please try again.')
  }

  revalidatePath('/templates')
}

export async function analyzeTemplate(templateId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: template, error: fetchError } = await supabase
    .from('templates')
    .select('storage_path, asset_type')
    .eq('id', templateId)
    .single()
  if (fetchError || !template) throw new Error('Template not found')

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from('templates')
    .download(template.storage_path)
  if (downloadError || !fileBlob) {
    console.error('Failed to download template for analysis:', downloadError)
    throw new Error('Could not read this template. Please try again.')
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await fileBlob.arrayBuffer())
  const structure = describeWorkbookStructure(workbook)

  const mapping = await proposeMapping(structure, template.asset_type)

  const { error: updateError } = await supabase
    .from('templates')
    .update({ mapping })
    .eq('id', templateId)
  if (updateError) {
    console.error('Failed to save proposed mapping:', updateError)
    throw new Error('Could not save the proposed mapping. Please try again.')
  }

  revalidatePath('/templates')
  revalidatePath(`/templates/${templateId}/mapping`)
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Manual verification**

Start the dev server, go to `/templates`, upload the real `General Property Valuation Template.xlsx`
with asset type "commercial", confirm it appears as "Pending review" with an "Analyze" link, click it,
and confirm the button disappears in favor of "Review mapping →" once the Claude call completes
(check server logs for errors if it doesn't — this is the first task that exercises the real Claude
call end-to-end).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/templates/page.tsx" "src/app/(app)/templates/actions.ts"
git commit -m "Add template upload and mapping analysis"
```

---

### Task 10: Mapping review and confirmation UI

**Files:**
- Create: `src/app/(app)/templates/[templateId]/mapping/page.tsx`
- Create: `src/app/(app)/templates/[templateId]/mapping/actions.ts`

**Interfaces:**
- Consumes: `TemplateMapping`, `MappingField`, `MappingSource` (Task 8).
- Produces: `saveMapping(templateId: string, formData: FormData)`,
  `confirmMapping(templateId: string)` server actions. Task 9's template list page links here.

- [ ] **Step 1: Write the mapping review page**

```tsx
// src/app/(app)/templates/[templateId]/mapping/page.tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { saveMapping, confirmMapping } from './actions'
import type { MappingField, MappingSource } from '@/lib/template-mapping'

const SOURCE_OPTIONS: MappingSource[] = [
  'assumption',
  't12_subtotal',
  't12_line_item',
  'rent_roll_unit_count',
  'rent_roll_average_budgeted_rent',
]

export default async function TemplateMappingPage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params
  const supabase = await createClient()

  const { data: template } = await supabase
    .from('templates')
    .select('id, name, asset_type, mapping, mapping_status')
    .eq('id', templateId)
    .single()
  if (!template) notFound()

  const fields = (template.mapping?.fields ?? []) as MappingField[]
  const saveForTemplate = saveMapping.bind(null, templateId)
  const confirmForTemplate = confirmMapping.bind(null, templateId)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-slate">Template mapping</span>
        <h1 className="font-display text-3xl font-medium tracking-tight">{template.name}</h1>
        <p className="text-sm text-slate">
          Review what Claude proposed for each input cell. Correct anything wrong, then confirm — this
          mapping is reused for every future deal on this template.
        </p>
      </div>

      <form action={saveForTemplate} className="flex flex-col gap-3">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-hairline">
              <th className="py-2 font-mono text-xs font-normal uppercase tracking-widest text-slate">Label</th>
              <th className="py-2 font-mono text-xs font-normal uppercase tracking-widest text-slate">Sheet!Cell</th>
              <th className="py-2 font-mono text-xs font-normal uppercase tracking-widest text-slate">Source</th>
              <th className="py-2 font-mono text-xs font-normal uppercase tracking-widest text-slate">Source key</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, i) => (
              <tr key={field.id} className="border-b border-hairline">
                <td className="py-2">
                  <input type="hidden" name={`fields[${i}].id`} value={field.id} />
                  <input
                    name={`fields[${i}].label`}
                    defaultValue={field.label}
                    className="w-full rounded border border-hairline bg-paper px-2 py-1 text-sm"
                  />
                </td>
                <td className="py-2 font-mono text-xs text-slate">
                  <input
                    name={`fields[${i}].sheet`}
                    defaultValue={field.sheet}
                    className="mb-1 w-full rounded border border-hairline bg-paper px-2 py-1 text-xs"
                  />
                  <input
                    name={`fields[${i}].cell`}
                    defaultValue={field.cell}
                    className="w-full rounded border border-hairline bg-paper px-2 py-1 text-xs"
                  />
                </td>
                <td className="py-2">
                  <select
                    name={`fields[${i}].source`}
                    defaultValue={field.source}
                    className="rounded border border-hairline bg-paper px-2 py-1 text-xs"
                  >
                    {SOURCE_OPTIONS.map((source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2">
                  <input
                    name={`fields[${i}].sourceKey`}
                    defaultValue={field.sourceKey ?? ''}
                    placeholder="(none)"
                    className="w-full rounded border border-hairline bg-paper px-2 py-1 text-xs"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <input type="hidden" name="fieldCount" value={fields.length} />
        <button
          type="submit"
          className="self-start rounded-md border border-hairline px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest"
        >
          Save changes
        </button>
      </form>

      <form action={confirmForTemplate}>
        <button
          type="submit"
          disabled={fields.length === 0}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-forest disabled:cursor-not-allowed disabled:opacity-40"
        >
          {template.mapping_status === 'confirmed' ? 'Re-confirm mapping' : 'Confirm mapping'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Write the server actions**

```typescript
// src/app/(app)/templates/[templateId]/mapping/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { MappingField, MappingSource, TemplateMapping } from '@/lib/template-mapping'

const VALID_SOURCES: MappingSource[] = [
  'assumption',
  't12_subtotal',
  't12_line_item',
  'rent_roll_unit_count',
  'rent_roll_average_budgeted_rent',
]

function parseFieldsFromForm(formData: FormData): MappingField[] {
  const count = Number(formData.get('fieldCount') ?? 0)
  const fields: MappingField[] = []

  for (let i = 0; i < count; i++) {
    const id = formData.get(`fields[${i}].id`)
    const label = formData.get(`fields[${i}].label`)
    const sheet = formData.get(`fields[${i}].sheet`)
    const cell = formData.get(`fields[${i}].cell`)
    const source = formData.get(`fields[${i}].source`)
    const sourceKeyRaw = formData.get(`fields[${i}].sourceKey`)

    if (
      typeof id !== 'string' ||
      typeof label !== 'string' ||
      typeof sheet !== 'string' ||
      typeof cell !== 'string' ||
      typeof source !== 'string' ||
      !VALID_SOURCES.includes(source as MappingSource)
    ) {
      continue
    }

    const sourceKey = typeof sourceKeyRaw === 'string' && sourceKeyRaw.trim() !== '' ? sourceKeyRaw : null

    fields.push({ id, label, sheet, cell, source: source as MappingSource, sourceKey })
  }

  return fields
}

export async function saveMapping(templateId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const mapping: TemplateMapping = { fields: parseFieldsFromForm(formData) }

  const { error } = await supabase.from('templates').update({ mapping }).eq('id', templateId)
  if (error) {
    console.error('Failed to save mapping edits:', error)
    throw new Error('Could not save your changes. Please try again.')
  }

  revalidatePath(`/templates/${templateId}/mapping`)
}

export async function confirmMapping(templateId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('templates').update({ mapping_status: 'confirmed' }).eq('id', templateId)
  if (error) {
    console.error('Failed to confirm mapping:', error)
    throw new Error('Could not confirm this mapping. Please try again.')
  }

  revalidatePath('/templates')
  revalidatePath(`/templates/${templateId}/mapping`)
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Manual verification**

From the template analyzed in Task 9, click "Review mapping →", confirm the proposed fields render
in the table, edit one field's label, save, confirm the edit persists on reload, then click "Confirm
mapping" and confirm the templates list now shows "Confirmed" for it.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/templates/[templateId]/mapping/page.tsx" "src/app/(app)/templates/[templateId]/mapping/actions.ts"
git commit -m "Add mapping review, edit, and confirmation UI"
```

---

### Task 11: Model generation core logic

**Files:**
- Create: `src/lib/model-generation.ts`
- Test: `src/lib/model-generation.test.ts`

**Interfaces:**
- Consumes: `TemplateMapping`, `MappingField` (Task 8); `ParsedT12` (Task 3); `ParsedRentRoll`,
  `averageBudgetedRent` (Task 4).
- Produces: `CellWrite { sheet: string; cell: string; value: number }`; `Gap { fieldId: string;
  label: string; reason: string }`; `FilledField { label: string; value: number }`;
  `GenerationResult { writes: CellWrite[]; gaps: Gap[]; filled: FilledField[] }`; `Assumptions =
  Record<string, number>`; `generateModel(mapping: TemplateMapping, t12: ParsedT12 | null, rentRoll:
  ParsedRentRoll | null, assumptions: Assumptions): GenerationResult`. Task 12 imports `CellWrite`.
  Task 13 imports `generateModel`, `GenerationResult`, `Assumptions`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/model-generation.test.ts
import { describe, it, expect } from 'vitest'
import { generateModel } from './model-generation'
import type { TemplateMapping } from './template-mapping'
import type { ParsedT12 } from './t12'
import type { ParsedRentRoll } from './rent-roll'

const t12: ParsedT12 = {
  lineItems: [{ accountCode: '7005-0000', label: 'Property Taxes', total: 1056595.25 }],
  subtotalsByLabel: {
    'Total General & Administrative': 214125.62,
    'NET OPERATING INCOME': 1488873.7,
  },
}

const rentRoll: ParsedRentRoll = {
  unitTypeBlocks: [
    {
      unitType: 'A1 Studio',
      units: [
        { unitId: '159', status: 'Vacant Unrented Ready', marketRent: 1399, budgetedRent: 1249, actualCharges: 0 },
        { unitId: '164', status: 'Occupied No Notice', marketRent: 1399, budgetedRent: 1249, actualCharges: 612.95 },
      ],
    },
  ],
}

describe('generateModel', () => {
  it('resolves an assumption field from the entered assumptions', () => {
    const mapping: TemplateMapping = {
      fields: [{ id: 'assumption.discountRate', label: 'Discount Rate', sheet: 'DCF', cell: 'M8', source: 'assumption', sourceKey: null }],
    }

    const result = generateModel(mapping, null, null, { 'assumption.discountRate': 0.08 })

    expect(result.writes).toEqual([{ sheet: 'DCF', cell: 'M8', value: 0.08 }])
    expect(result.gaps).toEqual([])
    expect(result.filled).toEqual([{ label: 'Discount Rate', value: 0.08 }])
  })

  it('flags an unentered assumption as a gap', () => {
    const mapping: TemplateMapping = {
      fields: [{ id: 'assumption.discountRate', label: 'Discount Rate', sheet: 'DCF', cell: 'M8', source: 'assumption', sourceKey: null }],
    }

    const result = generateModel(mapping, null, null, {})

    expect(result.writes).toEqual([])
    expect(result.gaps).toEqual([{ fieldId: 'assumption.discountRate', label: 'Discount Rate', reason: 'Not entered for this deal' }])
  })

  it('resolves a t12_subtotal field from the parsed T12', () => {
    const mapping: TemplateMapping = {
      fields: [{ id: 'opex.gna', label: 'G&A', sheet: 'DCF', cell: 'E34', source: 't12_subtotal', sourceKey: 'Total General & Administrative' }],
    }

    const result = generateModel(mapping, t12, null, {})

    expect(result.writes).toEqual([{ sheet: 'DCF', cell: 'E34', value: 214125.62 }])
  })

  it('flags a t12_subtotal field as a gap when no T12 was provided', () => {
    const mapping: TemplateMapping = {
      fields: [{ id: 'opex.gna', label: 'G&A', sheet: 'DCF', cell: 'E34', source: 't12_subtotal', sourceKey: 'Total General & Administrative' }],
    }

    const result = generateModel(mapping, null, null, {})

    expect(result.gaps).toEqual([{ fieldId: 'opex.gna', label: 'G&A', reason: 'No T12 was provided' }])
  })

  it('flags a t12_subtotal field as a gap when the label is not found in the T12', () => {
    const mapping: TemplateMapping = {
      fields: [{ id: 'opex.unknown', label: 'Unknown Category', sheet: 'DCF', cell: 'E99', source: 't12_subtotal', sourceKey: 'Not A Real Category' }],
    }

    const result = generateModel(mapping, t12, null, {})

    expect(result.gaps).toEqual([
      { fieldId: 'opex.unknown', label: 'Unknown Category', reason: 'Not found in the uploaded T12 (looked for "Not A Real Category")' },
    ])
  })

  it('resolves a t12_line_item field from the parsed T12', () => {
    const mapping: TemplateMapping = {
      fields: [{ id: 'opex.taxes', label: 'Property Taxes', sheet: 'DCF', cell: 'E44', source: 't12_line_item', sourceKey: 'Property Taxes' }],
    }

    const result = generateModel(mapping, t12, null, {})

    expect(result.writes).toEqual([{ sheet: 'DCF', cell: 'E44', value: 1056595.25 }])
  })

  it('resolves rent_roll_unit_count and rent_roll_average_budgeted_rent fields', () => {
    const mapping: TemplateMapping = {
      fields: [
        { id: 'unitmix.a1studio.count', label: 'A1 Studio Count', sheet: 'DCF', cell: 'C4', source: 'rent_roll_unit_count', sourceKey: 'A1 Studio' },
        { id: 'unitmix.a1studio.rent', label: 'A1 Studio Avg Rent', sheet: 'DCF', cell: 'F4', source: 'rent_roll_average_budgeted_rent', sourceKey: 'A1 Studio' },
      ],
    }

    const result = generateModel(mapping, null, rentRoll, {})

    expect(result.writes).toEqual([
      { sheet: 'DCF', cell: 'C4', value: 2 },
      { sheet: 'DCF', cell: 'F4', value: 1249 },
    ])
  })

  it('flags rent-roll fields as gaps when no rent roll was provided', () => {
    const mapping: TemplateMapping = {
      fields: [{ id: 'unitmix.a1studio.count', label: 'A1 Studio Count', sheet: 'DCF', cell: 'C4', source: 'rent_roll_unit_count', sourceKey: 'A1 Studio' }],
    }

    const result = generateModel(mapping, null, null, {})

    expect(result.gaps).toEqual([{ fieldId: 'unitmix.a1studio.count', label: 'A1 Studio Count', reason: 'No rent roll was provided' }])
  })

  it('flags rent-roll fields as gaps when the unit type is not found', () => {
    const mapping: TemplateMapping = {
      fields: [{ id: 'unitmix.penthouse.count', label: 'Penthouse Count', sheet: 'DCF', cell: 'C9', source: 'rent_roll_unit_count', sourceKey: 'Penthouse' }],
    }

    const result = generateModel(mapping, null, rentRoll, {})

    expect(result.gaps).toEqual([
      { fieldId: 'unitmix.penthouse.count', label: 'Penthouse Count', reason: 'Not found in the uploaded rent roll (looked for "Penthouse")' },
    ])
  })

  it('mixes resolved fields and gaps across sources in one pass', () => {
    const mapping: TemplateMapping = {
      fields: [
        { id: 'assumption.discountRate', label: 'Discount Rate', sheet: 'DCF', cell: 'M8', source: 'assumption', sourceKey: null },
        { id: 'opex.gna', label: 'G&A', sheet: 'DCF', cell: 'E34', source: 't12_subtotal', sourceKey: 'Total General & Administrative' },
        { id: 'unitmix.a1studio.count', label: 'A1 Studio Count', sheet: 'DCF', cell: 'C4', source: 'rent_roll_unit_count', sourceKey: 'A1 Studio' },
        { id: 'opex.missing', label: 'Missing Category', sheet: 'DCF', cell: 'E50', source: 't12_subtotal', sourceKey: 'Nonexistent' },
      ],
    }

    const result = generateModel(mapping, t12, rentRoll, { 'assumption.discountRate': 0.08 })

    expect(result.writes).toHaveLength(3)
    expect(result.gaps).toHaveLength(1)
    expect(result.gaps[0].fieldId).toBe('opex.missing')
    expect(result.filled).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/model-generation.test.ts`
Expected: FAIL — `src/lib/model-generation.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/model-generation.ts
import type { MappingField, TemplateMapping } from './template-mapping'
import type { ParsedT12 } from './t12'
import type { ParsedRentRoll } from './rent-roll'
import { averageBudgetedRent } from './rent-roll'

export interface CellWrite {
  sheet: string
  cell: string
  value: number
}

export interface Gap {
  fieldId: string
  label: string
  reason: string
}

export interface FilledField {
  label: string
  value: number
}

export interface GenerationResult {
  writes: CellWrite[]
  gaps: Gap[]
  filled: FilledField[]
}

export type Assumptions = Record<string, number>

export function generateModel(
  mapping: TemplateMapping,
  t12: ParsedT12 | null,
  rentRoll: ParsedRentRoll | null,
  assumptions: Assumptions
): GenerationResult {
  const writes: CellWrite[] = []
  const gaps: Gap[] = []
  const filled: FilledField[] = []

  for (const field of mapping.fields) {
    const value = resolveField(field, t12, rentRoll, assumptions)
    if (value === null) {
      gaps.push({ fieldId: field.id, label: field.label, reason: gapReason(field, t12, rentRoll) })
      continue
    }
    writes.push({ sheet: field.sheet, cell: field.cell, value })
    filled.push({ label: field.label, value })
  }

  return { writes, gaps, filled }
}

function resolveField(
  field: MappingField,
  t12: ParsedT12 | null,
  rentRoll: ParsedRentRoll | null,
  assumptions: Assumptions
): number | null {
  switch (field.source) {
    case 'assumption': {
      const value = assumptions[field.id]
      return typeof value === 'number' ? value : null
    }
    case 't12_subtotal': {
      if (!t12 || !field.sourceKey) return null
      const value = t12.subtotalsByLabel[field.sourceKey]
      return typeof value === 'number' ? value : null
    }
    case 't12_line_item': {
      if (!t12 || !field.sourceKey) return null
      const item = t12.lineItems.find((li) => li.label === field.sourceKey)
      return item ? item.total : null
    }
    case 'rent_roll_unit_count': {
      if (!rentRoll || !field.sourceKey) return null
      const block = rentRoll.unitTypeBlocks.find((b) => b.unitType === field.sourceKey)
      return block ? block.units.length : null
    }
    case 'rent_roll_average_budgeted_rent': {
      if (!rentRoll || !field.sourceKey) return null
      const block = rentRoll.unitTypeBlocks.find((b) => b.unitType === field.sourceKey)
      return block && block.units.length > 0 ? averageBudgetedRent(block.units) : null
    }
    default:
      return null
  }
}

function gapReason(field: MappingField, t12: ParsedT12 | null, rentRoll: ParsedRentRoll | null): string {
  if (field.source === 'assumption') return 'Not entered for this deal'
  if (field.source === 't12_subtotal' || field.source === 't12_line_item') {
    return t12 ? `Not found in the uploaded T12 (looked for "${field.sourceKey}")` : 'No T12 was provided'
  }
  return rentRoll
    ? `Not found in the uploaded rent roll (looked for "${field.sourceKey}")`
    : 'No rent roll was provided'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/model-generation.test.ts`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/model-generation.ts src/lib/model-generation.test.ts
git commit -m "Add model generation: resolve mapped fields into writes and gaps"
```

---

### Task 12: Excel writer

**Files:**
- Create: `src/lib/excel-write.ts`
- Test: `src/lib/excel-write.test.ts`

**Interfaces:**
- Consumes: `CellWrite` from `src/lib/model-generation.ts` (Task 11).
- Produces: `writeGeneratedWorkbook(templateBuffer: ArrayBuffer, writes: CellWrite[]):
  Promise<Buffer>`. Task 13 imports this by this exact name.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/excel-write.test.ts
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { writeGeneratedWorkbook } from './excel-write'

async function buildTemplateBuffer(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('DCF')
  sheet.getCell('A1').value = 0 // the input cell this test will write to
  sheet.getCell('B1').value = { formula: 'A1*2', result: 0 } // a formula cell that must survive untouched
  sheet.getCell('C1').value = 'label' // an untouched cell
  const buffer = await workbook.xlsx.writeBuffer()
  return buffer as ArrayBuffer
}

describe('writeGeneratedWorkbook', () => {
  it('writes only the given cells, leaving formulas and other cells untouched', async () => {
    const templateBuffer = await buildTemplateBuffer()

    const outputBuffer = await writeGeneratedWorkbook(templateBuffer, [{ sheet: 'DCF', cell: 'A1', value: 214125.62 }])

    const output = new ExcelJS.Workbook()
    await output.xlsx.load(outputBuffer)
    const sheet = output.getWorksheet('DCF')!

    expect(sheet.getCell('A1').value).toBe(214125.62)
    expect(sheet.getCell('B1').formula).toBe('A1*2')
    expect(sheet.getCell('C1').value).toBe('label')
  })

  it('skips a write targeting a sheet that does not exist in the template, without throwing', async () => {
    const templateBuffer = await buildTemplateBuffer()

    const outputBuffer = await writeGeneratedWorkbook(templateBuffer, [{ sheet: 'Nonexistent', cell: 'A1', value: 1 }])

    const output = new ExcelJS.Workbook()
    await output.xlsx.load(outputBuffer)
    expect(output.getWorksheet('DCF')!.getCell('A1').value).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/excel-write.test.ts`
Expected: FAIL — `src/lib/excel-write.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/excel-write.ts
import ExcelJS from 'exceljs'
import type { CellWrite } from './model-generation'

export async function writeGeneratedWorkbook(templateBuffer: ArrayBuffer, writes: CellWrite[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(templateBuffer)

  for (const write of writes) {
    const sheet = workbook.getWorksheet(write.sheet)
    if (!sheet) continue
    sheet.getCell(write.cell).value = write.value
  }

  return (await workbook.xlsx.writeBuffer()) as Buffer
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/excel-write.test.ts`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/excel-write.ts src/lib/excel-write.test.ts
git commit -m "Add generated-workbook writer that preserves untouched cells and formulas"
```

---

### Task 13: Model generation UI and orchestrating action

**Files:**
- Create: `src/app/(app)/projects/[projectId]/model/page.tsx`
- Create: `src/app/(app)/projects/[projectId]/model/actions.ts`
- Create: `src/app/(app)/projects/[projectId]/model/[generatedModelId]/page.tsx`

**Interfaces:**
- Consumes: `generateModel`, `Assumptions` (Task 11); `writeGeneratedWorkbook` (Task 12);
  `readWorksheetRows` (Task 2); `parseT12` (Task 3); `parseRentRoll` (Task 4); `MappingField` (Task
  8).
- Produces: `runModelGeneration(projectId: string, formData: FormData)` server action, redirecting to
  `/projects/[projectId]/model/[generatedModelId]` on success.

- [ ] **Step 1: Write the generation form page**

```tsx
// src/app/(app)/projects/[projectId]/model/page.tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { runModelGeneration } from './actions'
import type { MappingField } from '@/lib/template-mapping'

interface TemplateOption {
  id: string
  name: string
  asset_type: string
  mapping: { fields: MappingField[] } | null
}

export default async function ModelGenerationPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const supabase = await createClient()

  const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).single()
  if (!project) notFound()

  const { data: templateRows } = await supabase
    .from('templates')
    .select('id, name, asset_type, mapping')
    .eq('mapping_status', 'confirmed')
  const templates = (templateRows ?? []) as unknown as TemplateOption[]

  const { data: links } = await supabase
    .from('project_documents')
    .select('documents(id, file_name, detected_kind)')
    .eq('project_id', projectId)

  const documents = ((links ?? []) as unknown as { documents: { id: string; file_name: string; detected_kind: string | null } }[])
    .map((link) => link.documents)
    .filter(Boolean)
  const t12Documents = documents.filter((d) => d.detected_kind === 't12')
  const rentRollDocuments = documents.filter((d) => d.detected_kind === 'rent_roll')

  const generateForProject = runModelGeneration.bind(null, projectId)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-slate">Model</span>
        <h1 className="font-display text-3xl font-medium tracking-tight">Generate a model</h1>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-slate">
          No confirmed templates yet. Upload and confirm one on the{' '}
          <a href="/templates" className="text-wine hover:text-brick">
            Templates
          </a>{' '}
          page first.
        </p>
      ) : (
        <form action={generateForProject} className="flex flex-col gap-6">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-mono text-xs uppercase tracking-widest text-slate">Template</span>
            <select name="templateId" required className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink">
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.asset_type})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-mono text-xs uppercase tracking-widest text-slate">T12 (optional)</span>
            <select name="t12DocumentId" className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink">
              <option value="">— none —</option>
              {t12Documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.file_name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-mono text-xs uppercase tracking-widest text-slate">Rent roll (optional)</span>
            <select name="rentRollDocumentId" className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink">
              <option value="">— none —</option>
              {rentRollDocuments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.file_name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-3">
            <span className="font-mono text-xs uppercase tracking-widest text-slate">Assumptions</span>
            {templates.map((t) =>
              (t.mapping?.fields ?? [])
                .filter((f) => f.source === 'assumption')
                .map((f) => (
                  <label key={f.id} className="flex items-center gap-2 text-sm" data-template-id={t.id}>
                    <span className="w-48 text-slate">{f.label}</span>
                    <input
                      type="number"
                      step="any"
                      name={`assumption.${f.id}`}
                      className="flex-1 rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink"
                    />
                  </label>
                ))
            )}
          </div>

          <button
            type="submit"
            className="self-start rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-forest"
          >
            Generate
          </button>
        </form>
      )}
    </div>
  )
}
```

(Assumption inputs are rendered for every confirmed template up front, since the template isn't known
until the form is submitted — matching this app's existing preference for plain server-rendered forms
over client-side JS. Only the fields for the chosen template's assumptions end up populated in
`formData`; the action below reads assumptions by field id, scoped implicitly to whichever template
was actually selected.)

- [ ] **Step 2: Write the orchestrating server action**

```typescript
// src/app/(app)/projects/[projectId]/model/actions.ts
'use server'

import { randomUUID } from 'crypto'
import { redirect } from 'next/navigation'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { readWorksheetRows } from '@/lib/xlsx-rows'
import { parseT12 } from '@/lib/t12'
import { parseRentRoll } from '@/lib/rent-roll'
import { generateModel, type Assumptions } from '@/lib/model-generation'
import { writeGeneratedWorkbook } from '@/lib/excel-write'
import type { MappingField, TemplateMapping } from '@/lib/template-mapping'

export async function runModelGeneration(projectId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const templateId = formData.get('templateId')
  if (typeof templateId !== 'string' || !templateId) throw new Error('Pick a template')

  const { data: template, error: templateError } = await supabase
    .from('templates')
    .select('storage_path, mapping')
    .eq('id', templateId)
    .eq('mapping_status', 'confirmed')
    .single()
  if (templateError || !template) throw new Error('Template not found or not confirmed')

  const mapping = (template.mapping ?? { fields: [] }) as TemplateMapping

  const t12DocumentId = formData.get('t12DocumentId')
  const rentRollDocumentId = formData.get('rentRollDocumentId')

  const parsedT12 =
    typeof t12DocumentId === 'string' && t12DocumentId
      ? await downloadAndParse(supabase, t12DocumentId, parseT12)
      : null
  const parsedRentRoll =
    typeof rentRollDocumentId === 'string' && rentRollDocumentId
      ? await downloadAndParse(supabase, rentRollDocumentId, parseRentRoll)
      : null

  const assumptions: Assumptions = {}
  for (const field of mapping.fields as MappingField[]) {
    if (field.source !== 'assumption') continue
    const raw = formData.get(`assumption.${field.id}`)
    if (typeof raw === 'string' && raw.trim() !== '') {
      const value = Number(raw)
      if (!Number.isNaN(value)) assumptions[field.id] = value
    }
  }

  const result = generateModel(mapping, parsedT12, parsedRentRoll, assumptions)

  const { data: templateBlob, error: templateDownloadError } = await supabase.storage
    .from('templates')
    .download(template.storage_path)
  if (templateDownloadError || !templateBlob) {
    console.error('Failed to download template for generation:', templateDownloadError)
    throw new Error('Could not read the template. Please try again.')
  }

  const outputBuffer = await writeGeneratedWorkbook(await templateBlob.arrayBuffer(), result.writes)

  const outputPath = `${user.id}/${randomUUID()}-generated-model.xlsx`
  const { error: uploadError } = await supabase.storage.from('generated-models').upload(outputPath, outputBuffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  if (uploadError) {
    console.error('Failed to upload generated model:', uploadError)
    throw new Error('Could not save the generated model. Please try again.')
  }

  const { data: generatedRow, error: insertError } = await supabase
    .from('generated_models')
    .insert({
      project_id: projectId,
      template_id: templateId,
      t12_document_id: typeof t12DocumentId === 'string' && t12DocumentId ? t12DocumentId : null,
      rent_roll_document_id: typeof rentRollDocumentId === 'string' && rentRollDocumentId ? rentRollDocumentId : null,
      storage_path: outputPath,
      assumptions,
      summary: { filled: result.filled },
      gaps: result.gaps,
    })
    .select('id')
    .single()
  if (insertError || !generatedRow) {
    console.error('Failed to record generated model:', insertError)
    throw new Error('Could not save the generated model. Please try again.')
  }

  redirect(`/projects/${projectId}/model/${generatedRow.id}`)
}

async function downloadAndParse<T>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documentId: string,
  parse: (rows: ReturnType<typeof readWorksheetRows>) => T
): Promise<T | null> {
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', documentId)
    .single()
  if (docError || !document) return null

  const { data: blob, error: downloadError } = await supabase.storage.from('documents').download(document.storage_path)
  if (downloadError || !blob) return null

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await blob.arrayBuffer())
  const firstSheet = workbook.worksheets[0]
  if (!firstSheet) return null

  return parse(readWorksheetRows(firstSheet))
}
```

- [ ] **Step 3: Write the results page**

```tsx
// src/app/(app)/projects/[projectId]/model/[generatedModelId]/page.tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

interface FilledEntry {
  label: string
  value: number
}

interface GapEntry {
  fieldId: string
  label: string
  reason: string
}

export default async function GeneratedModelPage({
  params,
}: {
  params: Promise<{ projectId: string; generatedModelId: string }>
}) {
  const { generatedModelId } = await params
  const supabase = await createClient()

  const { data: generated } = await supabase
    .from('generated_models')
    .select('id, storage_path, summary, gaps, created_at')
    .eq('id', generatedModelId)
    .single()
  if (!generated) notFound()

  const filled = (generated.summary?.filled ?? []) as FilledEntry[]
  const gaps = (generated.gaps ?? []) as GapEntry[]

  const { data: signedUrl } = await supabase.storage
    .from('generated-models')
    .createSignedUrl(generated.storage_path, 3600)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-slate">Generated model</span>
        <h1 className="font-display text-3xl font-medium tracking-tight">
          {new Date(generated.created_at).toLocaleString()}
        </h1>
      </div>

      {signedUrl?.signedUrl && (
        <a
          href={signedUrl.signedUrl}
          className="self-start rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-forest"
        >
          Download .xlsx
        </a>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-medium tracking-tight">Filled ({filled.length})</h2>
        {filled.length === 0 ? (
          <p className="text-sm text-slate">Nothing was filled.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <tbody>
              {filled.map((entry, i) => (
                <tr key={i} className="border-b border-hairline">
                  <td className="py-2">{entry.label}</td>
                  <td className="py-2 font-mono tabular-nums text-slate">{entry.value.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-medium tracking-tight text-wine">Needs your input ({gaps.length})</h2>
        {gaps.length === 0 ? (
          <p className="text-sm text-slate">Nothing flagged.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {gaps.map((gap) => (
              <li key={gap.fieldId} className="rounded-md border border-wine/30 px-3 py-2 text-sm">
                <span className="font-medium text-ink">{gap.label}</span>
                <span className="block text-xs text-slate">{gap.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Manual verification**

In a project with the real `Monthly Operating Statement - May 2026.xlsx` and `Rent Roll - May
2026.xlsx` uploaded (Task 6) and the general template confirmed (Tasks 9-10), go to
`/projects/[projectId]/model`, select the template and both documents, enter a value for any
assumption fields, generate, and confirm: redirected to a results page showing filled entries with
plausible values (e.g. a T12 category total, a unit-type count/avg rent), a gaps list for anything
unmapped, and a working "Download .xlsx" link that opens in Excel with the expected cells populated
and every original formula in the template intact.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/projects/[projectId]/model"
git commit -m "Add model generation UI, orchestrating action, and results page"
```

---

### Task 14: Security audit pass

**Files:** No new files — this is a review task.

- [ ] **Step 1: Review RLS coverage**

Confirm, by reading the migration from Task 1 and testing directly in the Supabase SQL editor (or via
two test accounts) that:
- A user cannot select, insert, update, or delete another user's `templates` row.
- A user cannot insert a `generated_models` row pointing at a `template_id` they don't own — the
  `with check` clause on `generated_models` must reject it.
- A user cannot insert a `generated_models` row under a `project_id` they don't own.
- Storage: a user cannot download another user's file from the `templates` or `generated-models`
  buckets (test with a direct `storage_path` belonging to a different user's folder — the RLS storage
  policies from Task 1 should reject it).

- [ ] **Step 2: Review upload validation**

Confirm `uploadTemplate` (Task 9) rejects a file over 20MB and a non-`.xlsx` file. Confirm the Vault's
extended `uploadDocument` (Task 6) still rejects a `.xlsx` over 50MB and an unrecognized `.xlsx`
structure (not silently accepted as either T12 or rent roll).

- [ ] **Step 3: Review the AI mapping call for prompt-injection surface**

The template-structure JSON fed to Claude in `buildMappingPrompt` (Task 8) comes from a file the
authenticated user uploaded themselves — not from another user's data and not from an untrusted
external source, so this is lower risk than the chat pipeline's cross-document citation surface.
Confirm this reasoning holds: `describeWorkbookStructure` only ever runs on a `templates` row the
requesting user owns (verified by the `templates` RLS policy before `analyzeTemplate` can read it),
so there's no path for one user's prompt to include another user's data.

- [ ] **Step 4: Confirm no server-side formula evaluation was introduced**

Grep the new code for anything that evaluates a formula string, and confirm there's none — re-read
the "No formula evaluation, ever" global constraint and confirm every task honored it:

```bash
grep -rn "formula" src/lib/model-generation.ts src/lib/excel-write.ts
```

Expected: no matches (or only the `CellWrite` type/comments, never an evaluation call) — writes are
always plain values, never formula strings.

- [ ] **Step 5: Document findings and fix anything found**

If any of the above checks fail, fix the underlying policy or validation and re-verify. Commit any
fixes with a clear message describing what was wrong and how it was fixed.

---

### Task 15: End-to-end manual walkthrough

**Files:** No new files — this is a verification task.

- [ ] **Step 1: Walk through the full flow with real files**

Using the three real files this spec was designed against:

1. Upload `General Property Valuation Template.xlsx` on `/templates`, asset type "commercial retail",
   analyze it, review the proposed mapping, correct anything wrong, confirm it.
2. In a project, upload `Monthly Operating Statement - May 2026.xlsx` and `Rent Roll - May
   2026.xlsx` to the Vault; confirm both are classified correctly ("T12" / "Rent Roll" badges).
3. Go to `/projects/[projectId]/model`, generate using the confirmed template and both documents,
   entering assumption values.
4. On the results page, confirm the filled list contains real numbers traceable back to the source
   files (e.g. a T12 subtotal that matches the real T12's total column), and the gaps list is
   sensible (things the general commercial template's fields couldn't find in these two multifamily
   source files — expected, since the template and the source files are for different asset types in
   this specific test).
5. Download the `.xlsx`, open it in Excel (or LibreOffice), and confirm: the mapped input cells hold
   the expected values; every formula that was already in the blank template is still present and
   recalculates correctly; every tab the mapping didn't touch (comps, demographics, etc.) is present
   and unchanged from the blank template.

- [ ] **Step 2: Repeat with a mismatched-but-real second template scenario**

Upload a second confirmed template (or reuse the same one with a different asset-type tag) and
generate again with only the T12 provided (no rent roll selected). Confirm generation still succeeds,
produces a partially-filled workbook, and every rent-roll-sourced field appears in the gaps list with
the "No rent roll was provided" reason — validates the "fill what you can, flag the rest" behavior
end-to-end, not just at the unit-test level.

- [ ] **Step 3: Run the full test suite one more time**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: all tests pass, no type errors.

- [ ] **Step 4: Update `docs/what-we-built-plain-english.md`**

Add a new section, `## Session N: Excel/DCF model automation`, in the same plain-English style as the
existing sections — what was built, what real files it was tested against, what's automated vs. what
still needs manual review (comps tabs, non-input formulas), matching how prior sessions were
documented.

- [ ] **Step 5: Final commit**

```bash
git add docs/what-we-built-plain-english.md
git commit -m "Document Excel/DCF model automation session in plain English"
```
