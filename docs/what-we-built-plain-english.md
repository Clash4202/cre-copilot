# What we built and how — plain-English recap

Written 2026-08-11, for Clayton, covering everything from the first planning
session through the first real, live end-to-end test.

## The big picture

You're building a real AI tool for commercial real estate — inspired by
Henry.ai — where you upload real documents (leases, market reports, loan
lists, whatever) and can ask it questions in plain English. It answers only
from what you actually uploaded, and always tells you exactly which
document and passage it pulled the answer from (a "citation"), so you're
never just trusting it blindly.

## Session 1: building the app itself

Before today, across an earlier session, we:

- Decided what v1 should actually do: just document upload + "ask
  questions, get cited answers." Not the full Henry.ai feature set (no
  underwriting models, no pitch decks yet) — those come later, once this
  core piece is proven.
- Picked the technology: **Next.js** (the framework the website/app itself
  is built in), **Vercel** (where it will eventually live on the internet),
  **Supabase** (login system + database + file storage, all in one),
  **Anthropic's Claude** (the actual AI that reads your documents and
  answers questions — the same technology as this conversation), and
  **Voyage AI** (a smaller, specialized AI that turns text into a
  searchable format so the app can find the right paragraph instead of
  re-reading every document for every question).
- I wrote the entire app: real login, a document Vault (upload area), the
  pipeline that processes an uploaded file into something searchable, and
  the "Ask the Brain" chat itself. Wrote automated tests. Did a security
  pass. All of it committed to a local project folder — but at that point,
  none of the actual online accounts existed yet, so nothing could
  actually run for real.

## Session 2 (today): turning it on for real

This was the "create every account, wire it all up, and prove it actually
works" session. Here's every site you signed up for and what each thing
you entered was for:

### 1. GitHub — github.com
**What it is:** permanent, versioned storage for the code itself — every
version of every file, forever, with a backup off your machine.
**What you did:** created an empty repository named `cre-copilot`.
**What I did:** connected your local project to it and pushed all the code
up. Nothing sensitive went here — just the app's source code.

### 2. Supabase — supabase.com
**What it is:** the "filing cabinet in the cloud" — stores user accounts
(who's logged in), the documents you upload, and the searchable index Claude
uses to find the right passage.
**What you did:** created a project, which gave you three values from its
Settings > API page.
**What went where:** all three (**Project URL**, a public **anon** key, and
a secret **service_role** key) went straight into a file called
`.env.local` on your own computer — a private settings file that's
deliberately excluded from GitHub, so it never gets uploaded or shared
anywhere.
**What I also did:** ran a one-time setup script (a "migration") that
created the actual structure inside that empty database — the tables for
documents and their searchable chunks, a rule enforced *by the database
itself* called row-level security (meaning even if the app's code had a
bug, the database would still refuse to let one user see another user's
files), and a private storage locker for the uploaded files.

### 3. Anthropic — console.anthropic.com
**What it is:** the actual AI brain. This is Claude's API — separate from
this chat, but the same underlying technology, wired directly into your
app so it can read your documents and answer questions about them.
**What you did:** signed up, added a small amount of pay-as-you-go billing
credit, created an API key.
**Where it went:** `.env.local`, same as above.

### 4. Voyage AI — dash.voyageai.com
**What it is:** turns document text into a list of numbers that capture
its *meaning*, so the app can instantly find the most relevant paragraph
for a question instead of dumping every document into every request.
**What you did:** signed up, got an API key (went into `.env.local`), and
later added a payment method after hitting a usage limit on the free tier
(more on that below).
**Money note:** it's pure pay-as-you-go with 200 million free tokens
before anything would ever be charged — nowhere close to being used yet.

### 5. Resend — resend.com
**What it is:** a dedicated email-sending service.
**Why it came up:** Supabase's own free email sender turned out to be
heavily rate-limited (a handful of emails per hour) — we hit that limit
mid-testing. Rather than just wait it out, we set this up properly, which
also let us fix the sign-in-link email to use a cleaner, more secure
format.
**What you did:** signed up with your own email specifically, created an
API key.
**Where it went:** straight into Supabase's own dashboard settings —
*not* into `.env.local`, and not through me at all. I never saw that key.

## The bugs we found by actually testing (this is normal and expected)

Testing with real logins and real documents surfaced things that no amount
of code review alone would have caught:

1. **Sign-in links didn't work at first.** Supabase's default "here's your
   link" email didn't match the format the app's code expected, so
   clicking it silently bounced back to the login page. Fixed by rewriting
   how the app reads that link — now works with both formats.
2. **Uploads over 1MB failed**, even though the app's own code allowed up
   to 20MB. Next.js (the framework) has its *own*, separate 1MB limit that
   nobody had told to match. Fixed, then raised to 50MB at your request.
3. **Two of your real test PDFs were scanned images**, not real typed
   text — basically a photograph of a page rather than a document a
   computer can read text from. The app can only read real text right now,
   not photos of text. That's the "OCR" (reading text out of images)
   feature we're building next session.
4. **The Vault's design was completely unstyled** (plain black-and-white
   default). Gave it a real visual identity — warm background, deep green
   and wine-red accents (avoiding blue and orange per your direction),
   proper typography — before doing the real test.

## What's actually working right now

Signed in for real, uploaded a real market report (CBD Office Submarket),
it processed successfully, and asking it a real question returned a real
answer with a citation pointing back to the right source. The core promise
of the app — "answers grounded in your real documents, with proof" —
works, end to end, live, for the first time.

## What's NOT done yet

- **It only runs on your own computer right now** (`localhost:3000`) —
  nobody else on the internet can reach it. That's why the money-safety
  questions today had a reassuring answer: nothing except you, clicking
  buttons on your own machine, can currently trigger any AI usage at all.
- **Vercel** (the 5th and last account) — this is what will give the app a
  real, public web address. Deliberately saved for last, once there was
  something worth putting online.
- **OCR for scanned PDFs** — next session.
- **A safety limit on back-to-back uploads** — needs to happen before
  Vercel deployment, so that once this *is* public, nobody could spam the
  upload button and run up real AI costs. Already on the list, agreed to
  fix before going live rather than right now.

## Session 3: Excel/DCF model automation (subsystem 1 of 3)

Written 2026-08-14. This is the second of three planned subsystems (project
workspaces shipped first). It builds the piece Clayton actually asked for
next: take a T12 and a rent roll, and fill out a DCF/direct-cap Excel
underwriting model — without manual retyping and without the model being
tied to one fixed spreadsheet layout.

### The big picture

You upload a blank Excel underwriting template once (any layout — a
multifamily unit-mix model and a commercial tenant-roll model both work,
since the two are structurally nothing alike and this had to handle both).
Claude reads the template and proposes which cells are inputs and what
should fill them; you review and correct that proposal once, and it's
reused for every future deal on that template. Then, per deal, you pick a
T12 and/or rent roll from a project's Vault, type in this deal's
assumptions (rent growth, vacancy, cap rate — always blank by default,
never guessed), and generate. The system fills in what it can and lists
what it can't as gaps, rather than blocking or guessing. Every formula
already in the template — NOI, EGI, the DCF valuation, everything
downstream — is left completely untouched; the file's own math still works
exactly as it did before, Excel just recalculates it normally when you open
the file.

### How it's built, in one sentence per piece

- Two small, deterministic parsers read a T12 and a rent roll export by
  their structure (GL account codes, subtotal rows, "Unit Type:" markers) —
  not by fixed row numbers, so a different property with more or fewer
  units still works.
- A third piece asks Claude to read a blank template's structure once and
  propose a mapping (which cells are inputs, what should fill them); you
  review it in a table and confirm it.
- A fourth piece takes that confirmed mapping plus a deal's parsed
  documents and typed-in assumptions, and writes only the resolved values —
  as plain numbers, never formulas — into a fresh copy of the template.

### What was tested, and how

Every parser was tested against the *real* files you sent (a real AppFolio
T12 export, a real AppFolio rent roll export, and a real, complex
multifamily deal workbook) — not made-up examples. Beyond the automated
test suite, the extraction and AI-mapping pieces were also run directly
against those real files one more time as a final check, which is how two
real problems got caught and fixed before you ever would have hit them:

1. **The AI mapping step was breaking on a real, large template.** Your
   general commercial template has 11 sheets, and the first version of the
   prompt asked Claude to map *every* input-looking cell across *all* of
   them — including a Demographics sheet (population/growth data at
   several mile-radii) and comps tables, which have nothing to do with a
   T12 or rent roll and were always meant to stay out of scope. That
   produced a response too long for its token budget, which cut off
   mid-way and failed. Fixed by telling Claude explicitly what's in scope
   (DCF/valuation assumptions, T12-derived expenses, rent-roll-derived unit
   mix) and what isn't (property records, demographics, comps) — Claude
   now skips the out-of-scope stuff entirely instead of trying to map it.
2. **A related SDK limit.** Fixing problem 1 needs more output room from
   Claude, and past a certain size Anthropic's own API requires a
   different, "streaming" way of asking for it rather than just waiting for
   one big reply. Switched to that.

Both fixes were verified by actually re-running the AI mapping against your
real template afterward, not just by re-reading the code.

### What's NOT verified yet (needs you)

The very last step — actually clicking through the app (upload a template,
review its mapping, upload a T12/rent roll to a project, generate, download
the result, open it in Excel) — could not be completed this session. The
app requires a real emailed sign-in link to log in, and the second one
requested during this session's live walkthrough never arrived (the first,
earlier one did, and got this far checked out live: signed in fine, saw
your existing "Test Deal" and "General" projects). Everything *up through*
that point — the actual parsing and AI-mapping logic — was independently
verified against your real files by calling the same code directly,
bypassing only the browser. The one thing that genuinely still needs a
live click-through with your own login is confirming the upload → generate
→ download flow end-to-end in the browser, and opening the resulting
`.xlsx` in Excel to eyeball it.
