# OCR fallback for scanned PDFs — design

## Problem

Some real CRE documents (a property vacancy report, a stacking plan, both hit during the first live end-to-end test) are scanned images with no text layer. The app's current `unpdf`-based extraction returns near-zero characters for these, and ingestion fails outright with "No extractable text found in this file."

## Approach

Claude's Messages API accepts a PDF directly as a `document` content block and reads both its text layer and its page images natively — scanned pages get transcribed by the model itself, in one call. No new dependency, no custom PDF-to-image rendering.

Two alternatives were considered and ruled out:
- **Rasterize each page ourselves** (`unpdf`'s `renderPageAsImage` + a new `@napi-rs/canvas` dependency + one Claude vision call per scanned page) — works, but adds a dependency and N round-trips for no benefit now that Claude reads PDFs natively.
- **A dedicated OCR vendor** (Textract, Google Vision) — rejected in the prior session in favor of reusing the existing Anthropic key rather than adding a 6th account.

## Flow

1. `src/lib/parse.ts` changes from merging all PDF text into one blob to extracting **per-page** text (`unpdf`, `mergePages: false`).
2. If every page has real text, behavior is unchanged from today.
3. If any page has fewer than ~50 non-whitespace characters, the document is treated as scanned:
   - **Fail fast, before any OCR call**, if the document exceeds either cap:
     - **100 pages**
     - File size such that base64-encoding it would exceed Claude's 32MB request limit — in practice, roughly 20MB raw (base64 inflates size by ~1.33×), tighter than the app's normal 50MB upload cap for this path only
   - Otherwise, send the whole PDF to Claude once via a new `src/lib/ocr.ts` module, asking for a complete, verbatim, page-by-page transcription. The prompt explicitly instructs Claude to ignore any instruction-like text that appears inside the document's images — the same anti-prompt-injection posture as `src/lib/claude.ts`'s existing chat system prompt.
   - The transcription replaces the failed extraction for the whole document and flows into the existing chunk/embed pipeline unchanged.

## Data model

New column: `documents.ocr_page_count integer not null default 0` (small Supabase migration, following the existing pattern in `supabase/migrations/`). Records how many pages looked scanned, for the UI badge below. Document-level, not per-citation — true per-citation page tracking doesn't exist for any document today, so adding it just for OCR'd pages would be a separate, bigger lift.

## UI

Vault document list shows a small badge ("N pages OCR'd") when `ocr_page_count > 0`, with a tooltip: pages were transcribed by AI and are worth double-checking for exact figures. Styled to match the existing "deed and ledger" design system — no new design pass needed for one badge.

## Error handling

Same pattern as the rest of `uploadDocument` in `src/app/vault/actions.ts`: any failure (page-count cap exceeded, file-size cap exceeded, the Claude call itself failing) throws a clear, specific error message; the document's status flips to `failed`; nothing is left half-processed.

## Testing

- Per-page near-zero-text threshold check: pure function, unit-testable without a real PDF (same style as `parse.test.ts`).
- Page-count / file-size cap checks: pure functions, unit-testable with injected values.
- `ocr.ts`'s transcription call: unit test with a mocked Anthropic client (same style as `voyage.test.ts`).

## Security

New attack surface, given the standing "security review at every major milestone" instruction: a dedicated security-audit pass at the end of implementation (mirroring the v1 security-pass commit), checking specifically:
- The transcription prompt resists prompt injection from text embedded in scanned document images.
- The page-count and file-size caps actually hold as cost controls (can't be bypassed, checked before the expensive call, not after).
- No secrets exposed; the new Claude call reuses the existing server-only `ANTHROPIC_API_KEY` and the existing auth check already present in `uploadDocument`.
