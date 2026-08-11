# cre-copilot v1 Design

**Status:** Approved, pre-implementation
**Date:** 2026-08-11
**Author:** Clayton Trevino, with Claude

## Background

Clayton wants to build a real, usable commercial real estate (CRE) AI tool inspired by
[Henry.ai](https://www.henry.ai) — an AI platform that automates CRE brokerage workflows
(underwriting, pitch decks/OMs, market research, buyer intelligence). Henry has raised $21M,
serves 150+ brokerage teams, and charges ~$1,500/mo+. Competitors doing similar work include
IntellCRE, Primer, Archer, RedIQ, Blooma, and Enodo.

Clayton previously built `Hilco Capstone Project 2.0` — a static-HTML CRE dashboard with a
document "Vault," an "Ask the Brain" AI chat with citations (demo/scripted, with an optional
BYOK live-AI hookup), per-vertical dashboards, and a deal review workflow. It runs entirely on
synthetic data with no real integrations. That project is left as-is; this is a new, separate
build that reuses its UX concepts, not its code.

## Scope decision

A pre-mortem (see conversation history) identified the two highest-risk failure modes as:
(1) building multiple hard Henry-style features before any one is validated by a real user, and
(2) running indefinitely on synthetic data with no real trust signal.

**v1 scope: a real document-intelligence tool.** Upload real CRE documents (OMs, rent rolls,
leases, Excel exports) and get Claude-generated answers grounded in and citing those documents —
a real version of "Ask the Brain," not scripted.

**Explicitly deferred to v2+:** underwriting/deck generation, buyer/CRM intelligence, Excel
two-way sync, multi-firm billing. These require either significant engineering investment
(Excel COM-level sync, deck design automation) or data/partnership access (licensed market data,
CRM integrations) that don't make sense to pursue before v1 proves the core loop works with a
real user.

**Build sequencing:** build the demo skeleton on synthetic data first (same pattern as the Hilco
capstone) to make the tool tangible and trustworthy-looking, then bring in Clayton's real contact
for feedback and real documents, rather than requiring real data before anything is buildable.

## Architecture

- **Frontend + backend:** Next.js (App Router), deployed to Vercel. One codebase serves both
  pages and backend API routes — no separate server to run or manage.
- **Database, auth, file storage:** Supabase (hosted Postgres) — user accounts, document storage,
  and `pgvector` (a Postgres extension for storing/searching AI embeddings) all in one service.
- **AI layer:** Anthropic Claude API for answering questions from retrieved document context;
  Voyage AI (Anthropic's recommended embeddings partner) for turning document text into
  searchable vectors.

## Core components (v1)

1. **Auth & workspace** — real login via Supabase, data isolated per user/workspace from day one.
2. **Document Vault** — upload real CRE documents; stored in Supabase Storage with metadata
   (firm, deal, doc type, upload date).
3. **Ingestion pipeline** — extract text → chunk → embed via Voyage → store in a `pgvector`
   column, making documents searchable.
4. **Ask-the-Brain chat** — question → embedded → vector similarity search finds relevant chunks
   → chunks handed to Claude with an instruction to answer only from them and cite sources →
   answer rendered with clickable citations back to the source document.
5. **Dashboard** — reuses the capstone's visual language; v1 shows real aggregate stats (doc
   counts, deal types on file) rather than synthetic KPIs. Full market dashboards are v2+.

## Data flow

```
Upload → Supabase Storage + metadata row → text extraction → chunking → Voyage embedding
  → pgvector table
  → [user asks a question] → question embedded → vector similarity search → top-k chunks
  → Claude call (system prompt: answer only from these chunks, cite sources, say "I don't know"
     if the chunks don't answer it)
  → response rendered with citations linking back to the source document
```

## Trust and safety guardrails

- Claude is instructed to refuse to answer beyond retrieved chunks — no filling gaps from
  general knowledge on real financial questions.
- Every claim must trace to a citation; if retrieval finds nothing relevant, the tool says so
  instead of guessing.
- Failed document parsing is surfaced to the user, never silently dropped.
- Before real documents from Clayton's contact go in, build a small evaluation set (known
  questions with known correct answers) and verify output against it.

## Security requirements (standing, not one-time)

- API keys (Anthropic, Voyage, Supabase service role) live server-side only, in
  environment variables — never shipped to the browser, never committed to git (`.env.local` is
  git-ignored; `.env.example` documents the variable names only).
- Supabase Row Level Security (RLS) policies enforce that a user can only read/write their own
  data, even if application code has a bug.
- File uploads are validated (type, size) before processing.
- A security review pass happens at every major implementation milestone, not just at the end.

## Testing approach

Mostly manual, matched to a learning-by-building pace: after each major piece works, verify it
live in the browser (upload a real doc, ask a real question, confirm the citation is accurate)
rather than front-loading a large automated test suite.

## Accounts required (Clayton must create these himself — account creation and credential entry
are not actions Claude can take on his behalf)

- Anthropic (Claude API key)
- Voyage AI (embeddings API key)
- Supabase (free tier)
- Vercel (free tier, hosting)
- GitHub (version control, deploy trigger)

## Open questions / future decisions

- Final product name (currently placeholder: `cre-copilot`).
- Whether v1 stays single-user (Clayton + his one contact) or is built multi-tenant from the
  start — current lean is multi-tenant-ready (Supabase auth from day one) since it costs little
  extra now and avoids a rebuild later.
