# Account setup guide (plain language)

You need 5 accounts before the app can actually run for real. I can't create these for you —
account creation and passwords are things you have to enter yourself — but here's exactly what
each one is, why we need it, and what to do with the result.

**Golden rule for all of these:** once you get an API key (a long password-like string a service
gives your app so it can use their service), paste it into the `.env.local` file on your own
computer (copy `.env.example` to `.env.local` first), never into our chat. Chat messages can be
logged; a local file that's git-ignored is not. I'll tell you exactly which line each key goes on.

## 1. GitHub — where your code lives online

**What it is:** a place to store your code with full history, so nothing is ever truly lost, and
so Vercel (next) can automatically deploy new versions whenever you save changes.
**What to do:** go to github.com, sign up (free), create a new empty repository named
`cre-copilot`. Don't add a README/license/gitignore when creating it — we already have those.
**What you'll give me:** the repository URL, so I can connect your local project to it.

## 2. Supabase — your database, login system, and file storage in one

**What it is:** think of it as a filing cabinet in the cloud. It stores your users, their
documents, and (once we build search) the AI's "index" of what's in each document.
**What to do:** go to supabase.com, sign up (free tier is enough to start), create a new project.
Pick any name and a strong database password (Supabase will generate one for you — save it
somewhere safe, like a password manager, not in chat).
**What you'll give me:** from Project Settings > API in your new project, there are three values:
`Project URL`, `anon public` key, and `service_role` key. Put them in `.env.local` as
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
The `service_role` key is powerful (it can bypass your security rules) — it stays in
`.env.local` only, never anywhere public.

## 3. Anthropic — the AI that reads documents and answers questions

**What it is:** the actual "brain" of the app — this is Claude's API, separate from this chat.
Your app will send it document text and questions, and it sends back grounded answers.
**What to do:** go to console.anthropic.com, sign up, add a small amount of billing credit
(this is pay-as-you-go, typically cents to a few dollars while testing). Create an API key.
**What you'll give me:** the key, to go in `.env.local` as `ANTHROPIC_API_KEY`.

## 4. Voyage AI — turns document text into something searchable

**What it is:** a second, smaller AI service that converts text into a list of numbers (an
"embedding") that captures its meaning, so we can find the most relevant paragraph of a document
for a given question instead of dumping every document into every request. Anthropic recommends
Voyage specifically for this because Claude itself doesn't do this particular job.
**What to do:** go to dash.voyageai.com, sign up (there's a free tier that covers a lot of usage
before you'd need to pay).
**What you'll give me:** the key, to go in `.env.local` as `VOYAGE_API_KEY`.

## 5. Vercel — hosting, so the app has a real web address

**What it is:** where the app actually runs once it's more than just "on my computer" —
Vercel is built by the same team as Next.js and is the standard place to host it. Free tier
is enough for this project's stage.
**What to do:** go to vercel.com, sign up using your GitHub account (this links the two so
Vercel can deploy automatically whenever code is pushed to GitHub).
**What you'll give me:** nothing — once linked to GitHub, I can guide you through connecting the
project in a couple of clicks, and Vercel will ask you to paste the same environment variables
from `.env.local` into its dashboard (their equivalent of a `.env.local` for the live version).

## Order to do these in

You don't need all 5 before we start building — GitHub and Supabase first (I'll need those to
build the login/database pieces), Anthropic and Voyage once we're ready to build the actual
document chat, Vercel last, once there's something worth putting on the internet.
