# Excel/DCF model automation — design

## Background

This is the second of three planned subsystems (project workspaces, then Excel/BOV template
automation, then team/company collaboration). Project workspaces shipped first because it
introduced the "project" concept the other two build on. This subsystem was originally scoped as
"Excel + BOV slide automation" together, but was split during brainstorming: this spec covers only
the Excel/DCF piece. BOV slide generation (matching a deck template's visual design) is different
enough technically — layout/design work vs. spreadsheet math — that it gets its own spec once this
one is proven, same reasoning that kept team/company collaboration sequenced last.

Clayton wants to take a T12 (trailing-twelve-month operating statement) and a rent roll — both real
exports he already has (from AppFolio) — and have the app fill out a DCF/direct-cap Excel
underwriting model, instead of doing it by hand.

## What we learned from real files

Three real files were inspected before designing this (not hypothetical structure):

- **T12** (`Monthly Operating Statement - May 2026.xlsx`): a clean AppFolio export. One sheet,
  267 rows: GL account code + account name + 12 monthly columns + total, with section headers
  (`Operating Income`, `Operating Expenses`, etc.) and subtotal rows (`Total General &
  Administrative`, `NET OPERATING INCOME`, ...) down to `NET INCOME (LOSS)`. Structurally regular —
  classifiable by which columns are populated, not by fixed row numbers.
- **Rent roll** (`Rent Roll - May 2026.xlsx`): also a clean AppFolio export, 1,071 rows, grouped
  into blocks by `Unit Type: X` header rows, each followed by unit-level rows and an `X Total:`
  subtotal row. Same story — structurally regular, parseable by walking the grouping markers.
- **A real, currently-in-use model** (`The Avery Philly Analysis.xlsx`, 14 tabs) and **a second,
  structurally unrelated template** (`General Property Valuation Template.xlsx`, 11 tabs) were both
  inspected. The two confirmed the central design problem: they don't share a shape. Avery's is a
  multifamily unit-mix model with a `T12` tab its `Cash Flow (DCF)` tab links to; the general
  template is a commercial tenant-by-tenant lease roll model with no `T12` tab at all and flat $
  expense-assumption inputs instead of category totals. A parser hardcoded to either one is useless
  for the other. Avery's file also revealed two problems worth automating away specifically:
  operating-expense totals in `Cash Flow (DCF)` are **manually retyped** from the T12 rather than
  formula-linked, and the unit-mix table references **hardcoded row ranges** in the Rent Roll tab
  per unit type, which have to be manually re-identified for every new property. Avery's file
  additionally has several broken tabs (`Summary Output`, `Historical Operating Statement` — full of
  `#REF!`/`#VALUE!`/`#DIV/0!` from old edits) and tabs that inherently need outside data (comps,
  parcel/tax records) no T12 or rent roll can supply — these are explicitly not this subsystem's
  job to fix or fill.

## Scope

**In scope for this spec:** T12 + rent roll (`.xlsx` only) as the two data sources; arbitrary,
user-uploaded DCF/direct-cap templates (not one fixed schema); an AI-assisted, human-confirmed
mapping from template structure to source data; generating a filled model with real formulas.

**Explicitly deferred, tracked for future specs, not solved here:**
- Tax assessment screenshots (OCR/vision extraction for property/land/tax fields)
- CoStar export parsing (format not yet seen — designing against it now would be guessing)
- Site images (embedding into an Images tab / BOV slides)
- Comps sourcing (Sales/Land/Rental Comps) — needs market data access or manual entry regardless
  of automation quality; flagged as a gap, not solved
- PDF-based T12/rent roll (structured cell-level extraction needs an actual spreadsheet)
- Cross-account template sharing in the full "per company" sense — that's subsystem 3
- BOV slide generation — separate spec, sequenced after this one

## Approach

Three pieces, in the order a deal actually flows through them:

### 1. Structured extraction (deterministic, not AI)

T12 and rent roll rows are classified by structural pattern, not fixed row numbers, so extraction
survives a property with a different number of units or GL accounts than Avery's:

- **T12**: a row with a GL-code-shaped value in the account column is a line item; a row with no
  account code but a label and a total is a subtotal; a row with only a label (no total) is a
  section header. This walks the whole sheet into a category → subtotal → line-item tree.
- **Rent roll**: `Unit Type: X` rows start a block, unit rows follow, `X Total:` ends it. This
  produces the unit-type groupings (counts, market/actual rents) that a DCF's unit-mix table needs,
  without any hardcoded row ranges.

### 2. Template mapping (AI-assisted, human-confirmed, reused)

Templates vary too much for fixed logic — this has to be semantic. When a template is uploaded and
tagged with an asset type, Claude reads its full structure (all sheets, labels, existing formulas)
and proposes a mapping: which cells are assumption inputs, which ranges are where unit/tenant rows
go, and which T12 subtotal or rent-roll aggregate feeds which cell. The mapping is reviewed and
corrected once, in a plain editable list UI, then saved as confirmed and reused for every future deal
on that template — editable again later if it turns out wrong on real use.

The mapping only ever describes *inputs* — cells sourced from the T12, rent roll, or a typed-in
assumption. It never attempts to describe a template's own downstream arithmetic (EGI, NOI, a
multi-year DCF value indication, and similar). Those stay exactly what they already are in the
blank template: real formulas, referencing the input cells this system fills, that Excel evaluates
normally the moment the generated file is opened. This is a deliberate boundary, not an oversight —
see Model Generation below for why.

### 3. Model generation

Within a project: pick a confirmed template, pick or upload a T12 and/or rent roll through the
existing Vault (auto-detected by structure), enter this deal's assumptions (rent growth, expense
inflation, vacancy, discount rate, cap rates, reserves — **always blank by default, never guessed or
pre-filled**, since these are market judgment calls, not something to fabricate). Neither source
document is required to generate — this follows from the same gap-flagging principle as everything
else here: generating with only a T12, only a rent roll, or neither, still produces a filled-as-far-
as-possible workbook, with everything the missing document(s) would have supplied listed as gaps
rather than blocking generation entirely. The system then:

- Applies the confirmed mapping to route parsed T12/rent-roll data and the entered assumptions into
  the right *input* cells, as plain values — the same thing Clayton does by hand today (e.g. typing
  a T12 category total into Avery's OpEx cells), just automated and no longer tied to a fixed row
  layout.
- Writes the output workbook with `exceljs` (new dependency — the app currently only reads PDF/text
  via `unpdf`; nothing handles `.xlsx` yet). Every formula already in the template — EGI, NOI,
  Op. Ex. Ratio, the DCF value indication, everything downstream of the input cells — is left
  completely untouched. Opening the generated file in Excel recalculates it normally, the same as
  opening any spreadsheet with formulas and no cached results; no server-side recalculation step is
  needed or attempted.
- Copies every tab the mapping doesn't touch through untouched (comps, demographics, whatever else
  the template has) — nothing stripped, nothing guessed at.
- Flags anything the mapping expects but the source documents don't supply (e.g., a per-unit-type
  bed count that isn't a rent-roll column, or a T12 expense category the mapping's never seen
  before) as a gap — shown in-app, never silently dropped or guessed.
- **In-app summary is intentionally limited to directly-sourced values** — unit counts and average
  rents by type, which T12 category totals were used, the assumptions entered, and the gap list.
  It does not show computed headline metrics (NOI, value indication, cap rate), because those come
  from each template's own multi-step formulas, which vary by template (a 6-year NPV with reversion
  in one, a differently-shaped one in another) — reproducing that would mean either evaluating
  arbitrary template formula text (a full spreadsheet-formula engine, unvetted for licensing and
  reliability) or reimplementing valuation math per template. Neither is in scope here. The real,
  correct computed numbers are always in the generated Excel file itself, visible the moment it's
  opened — just not mirrored in the app before that.

## Data model

New migration, `supabase/migrations/0004_excel_models.sql`:

```sql
create table templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  asset_type text not null,           -- 'multifamily', 'retail', 'office', etc. (free text for now)
  storage_path text not null,         -- blank template file in Supabase Storage
  mapping jsonb,                      -- null until confirmed
  mapping_status text not null default 'pending', -- 'pending' | 'confirmed'
  created_at timestamptz not null default now()
);

create table generated_models (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  template_id uuid not null references templates(id),
  t12_document_id uuid references documents(id),
  rent_roll_document_id uuid references documents(id),
  storage_path text not null,         -- generated .xlsx in Supabase Storage
  assumptions jsonb not null,         -- rent growth, vacancy, cap rate, etc. entered for this run
  summary jsonb,                      -- headline output numbers for in-app display
  gaps jsonb not null default '[]',   -- flagged missing/unmapped items
  created_at timestamptz not null default now()
);

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
```

`templates` is account-level (not tied to a project — matches how templates actually get reused
across deals of the same asset type). `generated_models` is project-scoped, same pattern as
`documents`.

## Navigation / UI

- Templates are managed at the account level (outside any single project) — upload, name, tag asset
  type, review/confirm the proposed mapping, edit later if needed.
- Within a project, a new "Model" trigger: pick a confirmed template, pick or upload a T12 and rent
  roll (through the existing Vault — the app auto-detects a `.xlsx` upload that structurally looks
  like a T12 or rent roll), enter this deal's assumptions, generate.
- Output: a downloadable `.xlsx`, plus an in-app summary of what was filled (unit counts/rents by
  type, T12 totals used, assumptions entered) and the gap list — see the note at the end of Model
  Generation above for why this doesn't include computed headline metrics.

## Error handling

Same "surface, never guess" principle the chat citations already follow: a T12/rent-roll row that
can't be confidently structurally classified is flagged, not dropped or misfiled; a mapped field
with no matching source data becomes a gap, not a silently blank cell; a template's own pre-existing
formula errors (like Avery's `#REF!`s) are left alone — that tab is copied through as-is like any
other untouched tab, not "fixed" by guessing at original intent.

## Security

Extends the same standing rule ("security review at every major milestone") used for OCR, v1, and
project workspaces:
- RLS on both new tables confirmed to prevent cross-user access to templates or generated models.
- Template and generated-model files are user-scoped Supabase Storage objects, same isolation as
  existing document uploads.
- Template and T12/rent-roll file uploads get the same type/size validation the existing Vault
  upload path already applies.
- The AI-assisted mapping step only ever reads a user's own uploaded template (via the existing
  server-side API key pattern, never client-exposed) — it doesn't call out to or need any new
  external service.

## Testing

Structural extraction (T12 row classification, rent-roll unit-block detection) is the most
unit-testable part of this — pure, deterministic functions, same pattern as `chunk.test.ts` and
`citations.test.ts` already use. Template mapping (AI-assisted) and full generation get verified
manually against two structurally different real files — Avery's model and the general template —
matching how OCR and v1 were verified: live, with real files, rather than front-loading a large
automated suite before anything has been used for real.
