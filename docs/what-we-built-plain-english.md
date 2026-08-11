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
