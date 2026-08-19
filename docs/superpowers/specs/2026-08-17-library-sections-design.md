# Library/sections system + BOV automation — design

## Background

This spec redirects the plan laid out in `2026-08-13-excel-model-automation-design.md`. That doc
split "Excel + BOV slide automation" into two specs, reasoning that BOV slide generation was
different enough (layout/design work vs. spreadsheet math) to defer until the Excel piece was
proven. The Excel piece (subsystem 1) is now built, reviewed, and live-tested. During a live
walkthrough of it, Clayton redirected: he doesn't want templates and BOVs organized as a flat
account-level list (what subsystem 1 shipped), and he wants BOV generation designed now rather than
deferred further. This spec supersedes that deferral and covers both the reorganization and BOV
generation together, per his explicit choice during brainstorming.

Two separate, independent pieces of feedback drove this:

1. **Organization.** Clayton wants one unified upload area for everything — T12s, rent rolls,
   templates, BOVs — where the system figures out what each file is and where it belongs, instead
   of the current split (T12/rent roll go into a project's Vault; templates go into a separate flat
   account-level list with no grouping). He wants templates and BOVs organized into user-created,
   user-described "sections" inside "libraries" (e.g. a "Templates" library containing "General
   Template" and "Office Building Template" sections; a separate "BOV" library with its own
   sections), fully customizable — not hardcoded categories.
2. **Retrieval.** He wants to ask, in the existing chat, for a filled-out template/BOV for a given
   kind of property, and have the system recognize which template and BOV fit, based on the section
   names/descriptions he wrote, and hand off into the existing generation flow.

The mapping-review screen (the 116-row table subsystem 1 shipped for confirming a template's AI
proposed mapping) was also flagged as tedious. That is a separate, smaller, self-contained problem
and is being scoped as its own follow-up spec, not part of this one.

## Scope

**In scope for this spec:**
- A generic, user-extensible library/section data model, replacing the flat `templates` list
- A single unified upload flow ("inbox") for T12s, rent rolls, templates, BOVs, and general
  documents, with AI-suggested destination (property, or library + section) and human confirmation
  before anything is filed
- A library browsing UI (libraries as tabs, sections as sub-tabs within, files within a section),
  replacing the current flat `/templates` page
- Chat gaining the ability to recognize a generation request (not just answer questions), match it
  to a template/BOV/property using section metadata, and hand off to the existing generation screen
- A new BOV (PowerPoint) generation engine, mirroring subsystem 1's Excel engine: read a `.pptx`
  template's structure, AI-assisted human-confirmed mapping (once per template, reused per deal),
  fill only — no layout/design regeneration, no invented data (unmatched fields left blank, listed
  as gaps)

**Explicitly deferred, not solved here:**
- The mapping-review UX itself (reducing the manual row-by-row review burden) — separate spec
- Any change to how the Excel/DCF fill engine itself works (subsystem 1's cell-writing logic is
  reused unchanged; only how a template is found/organized changes)
- Text-overflow handling when a filled BOV value is longer than its placeholder text — flagged as a
  known limitation, not solved in v1 (see Error handling)
- Cross-account/team sharing of libraries — that remains subsystem 3's job (team/company
  collaboration), unchanged from the original roadmap

## Data model

New tables:

- **`libraries`** — `id, user_id, name, created_at`. Fully generic; not hardcoded to "Templates" or
  "BOV". Created automatically the first time the inbox needs one that doesn't exist yet, or
  manually from the library browsing UI.
- **`library_sections`** — `id, library_id, name, description, created_at`. The description is what
  chat and the inbox's auto-suggestion match against — it's load-bearing, not decorative.
- **`templates`** (existing, from subsystem 1) — gains a `section_id` column referencing
  `library_sections(id)`. Everything else about this table (mapping jsonb, mapping_status,
  asset_type, storage_path) is unchanged; the Excel fill engine is untouched by this spec.
- **`bov_templates`** — new, shaped like `templates` but for PowerPoint: `id, user_id, section_id,
  name, storage_path, mapping jsonb, mapping_status, created_at`. Kept as its own table rather than
  merged into `templates`, because the mapping shape is genuinely different (Excel sheet+cell
  addresses vs. PowerPoint slide+shape+text-run locations) — one polymorphic table would mean losing
  type safety on `mapping` for both engines.
- **`generated_bovs`** — new, mirrors `generated_models`: `id, project_id, bov_template_id,
  source_document_ids uuid[], storage_path, gaps jsonb, created_at`.

## The unified inbox

One upload area, reachable from anywhere in the app — not scoped to a specific project or to the
old `/templates` page. Dropping a file in triggers AI classification and a confirm step; nothing is
filed away without the user seeing and confirming the destination first:

1. **`.xlsx` that structurally matches a T12 or rent roll** (reusing `detectDocumentKind` from
   subsystem 1 unchanged) → Claude reads the file's header for a property name, and either matches
   it against an existing project or proposes creating a new one. User confirms or corrects.
2. **`.xlsx` that doesn't match either T12 or rent roll shape** → treated as a candidate DCF/
   underwriting template. Claude compares its structure against the user's existing library
   sections' names/descriptions and proposes the best-fitting (library, section) pair — creating
   either or both if nothing fits well enough, with a suggested name and description. User confirms
   or corrects either way.
3. **`.pptx`** → same section-matching flow as (2), but scoped to BOV-flavored libraries/sections.
4. **Anything else (PDF, `.txt`)** → unchanged from today's Vault upload behavior: a
   chat-searchable document, tied to a project via the same confirm-or-pick step as (1).

The inbox replaces *uploading through* a specific project's Vault page — you no longer need to
open a project first to add its documents. A project's Vault page itself still exists for browsing
that project's already-filed documents; the inbox is the new entry point for getting files in.

Auto-detection never silently guesses. Low-confidence or ambiguous matches (property name unclear,
multiple existing projects could fit, no section is a good match) stop and ask the user directly,
rather than picking a "best guess" quietly.

## Library browsing UI

Replaces the flat `/templates` page. Libraries (Templates, BOV, any others the user has created)
appear as top-level tabs. Within a library, sections appear as sub-tabs, each showing its
description and the files filed into it. Files show the same status badges and Analyze → Review
mapping → Confirm flow subsystem 1 already built — this UI reorganizes where that flow lives, it
doesn't change the flow itself. Libraries and sections can also be created directly here, not only
through the inbox's auto-suggestion.

## Chat: from Q&A to action

The existing `/api/chat` route (vector search over `document_chunks`, answer with citations) keeps
working exactly as it does today for plain questions — this spec adds a second capability alongside
it, not a replacement.

Claude gets tool-calling access to a new capability: recognizing when a message is asking for a
generated document rather than a question. When it recognizes that intent, it:

1. Matches the request against the user's library section names/descriptions to find the
   best-fitting template and/or BOV
2. Matches any property mentioned against the user's existing projects
3. Responds describing what it found, with a link into the existing generation screen, pre-filled
   with the matched template/BOV and property — the user finishes there (types or skips
   assumptions, clicks generate), reusing the generation screen subsystem 1 already built rather
   than reinventing it inside chat

If the match is ambiguous or low-confidence (multiple sections could fit, property unclear), Claude
says so and asks rather than guessing — same rule as the inbox. If the message is a plain question,
behavior is unchanged from today.

## BOV (PowerPoint) generation engine

Mirrors subsystem 1's Excel engine's philosophy exactly, adapted for PowerPoint's structure. A
`.pptx` file is a zip of per-slide XML files; there is no computed/formula layer analogous to
Excel's, so "fill only, never regenerate" here specifically means: locate exact text runs and table
cells, and only ever overwrite their text content — layout, fonts, images, and slide design are
never touched.

1. **Read structure** — walk every slide's XML, extracting every text run and table cell with a
   stable location (slide number + shape + position) — the PowerPoint equivalent of
   `describeWorkbookStructure`.
2. **AI-assisted mapping** — Claude reads that structure once per uploaded BOV template and proposes
   which text spots are fillable placeholders and what known data fills them (T12/rent-roll derived
   facts, property info pulled from documents already in the project — there is no "assumption"
   input type for BOVs, per Clayton: a BOV only pulls information that's already known). Reviewed
   and confirmed once, reused for every future deal on that BOV template, same as Excel template
   mapping.
3. **Generate** — write plain text into exactly the located spots and re-zip as the output `.pptx`.
   Anything Claude can't find data for is left blank and listed as a gap, identical in spirit to
   today's Excel gaps list.

## Error handling

- Auto-detection (property matching, library/section matching, chat's template/BOV/property
  resolution) never silently guesses on low confidence — it always stops and asks the user.
- Files that don't match any recognized shape (T12, rent roll, Excel template, PowerPoint BOV,
  general document) fall back to today's generic document behavior rather than erroring.
- Chat's new action-taking capability degrades gracefully: if it can't confidently resolve a
  template, BOV, or property, it says so and still answers what it can from documents, rather than
  linking to a broken/half-filled generation screen.
- **Known, unsolved limitation:** a filled BOV text value substantially longer than its placeholder
  can visually overflow its text box, since PowerPoint has no automatic layout recalculation the way
  Excel does. Not solved in v1 — generated BOVs need an eyeball check before use, same as generated
  Excel models get opened in Excel to confirm.

## Testing

Same convention as subsystem 1: pure functions (pptx structure reader, pptx writer, property-name
matching, section-matching prompt builders) get Vitest unit tests, ideally against real files where
available. Pages, server actions, and the chat route's new branch get `npx tsc --noEmit` plus a
manual browser walkthrough once built — no dedicated test files for those, matching existing
project convention.

## Sequencing note

This is a larger scope than subsystem 1 (new data model, unified inbox, library UI, chat
tool-calling, and an entirely new PowerPoint fill engine). It will very likely need to be built in
phases, the way subsystem 1 was sequenced into 15 tasks — but that phasing is a decision for the
implementation plan (`writing-plans`), not locked in at this spec stage.
