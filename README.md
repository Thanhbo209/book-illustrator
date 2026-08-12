# Gradion Book Illustration Pipeline

A local-only web app that turns a book's text into character portraits and a
chapter illustration, using the Gemini API.

## Overview

You paste or upload a book's text, then click through five steps, one at a
time:

```
Book text → 1. Style → 2. Characters → 3. Portraits → 4. Chapters → 5. Illustrations
```

Each step calls Gemini once, saves the result, and waits for you to click
the next step. The final illustration is supposed to reuse the generated
character portraits, so characters look the same in the scene as in their
own portraits.

**Why five separate steps instead of one "generate everything" button?**
If one step fails, you only retry that step — not the whole book. It also
lets you see the style and characters before spending more calls on later
steps.

## Current Status — what actually works

### Works, confirmed with real Gemini calls: Style, Characters

Two different claims live under "works," and they're not the same:
Gemini returning valid text is one; the step **flow** — sequencing,
duplicate-call blocking, replay-blocking, context chaining — actually
working is another. Both are confirmed here, not just the first one.
Run twice, live, against the real API and the real running dev server,
with two different books:

- Style then Characters each produced different, on-topic output both
  times (art style description, two character names + prompts).
- Firing a **second, concurrent request** at a step already `RUNNING`
  returned `409` with the Gemini call count unchanged — checked by
  counting calls, not assumed.
- Calling an already-`COMPLETED` step again returned `409` instead of
  re-running it.
- Characters' request reused `previous_interaction_id` from the Style
  interaction and successfully recalled that context, instead of
  resending the full book text.

**This confirms the flow only for Style → Characters.** It does not
extend to Portraits/Chapters/Illustrations — see below.

### Does NOT work right now: Portraits, Chapters, Illustrations (real images)

To be precise about what I'm claiming here: **the implementation is
tested, not verified working.** Those are different things, and I'm not
blurring them together. "Tested" means the code for all three steps is
finished and passes 154 automated tests against a mocked Gemini — that
proves the code correctly handles a well-formed image response _if_ Gemini
sends one shaped the way I assumed. "Verified working" would mean I
actually got a real image back from Gemini and confirmed the code handled
it correctly. I have not done that, because I could not get a single real
image response back — every attempt hit a quota error before Gemini ever
returned image data. So I am not claiming this works because the code
looks correct; I'm telling you it's untested against reality, and here's
the exact evidence for why:

**1. Every image model on this API key returns a hard quota error (not a
soft rate limit) — the real response body:**

```
ERROR: You exceeded your current quota, please check your plan and billing
details. For more information on this error, head to:
https://ai.google.dev/gemini-api/docs/rate-limits.

* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count,
  limit: 0, model: gemini-3.1-flash-image
* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests,
  limit: 0, model: gemini-3.1-flash-image
```

Tested against three different image models, same result on all three:
`gemini-3.1-flash-image`, `gemini-2.5-flash-image`,
`gemini-3.1-flash-lite-image`.

**2. Confirmed a second way, on the Google AI Studio usage dashboard:**
every "Nano Banana" image model row (`Nano Banana`, `Nano Banana Pro`,
`Nano Banana 2`, `Nano Banana 2 Lite`) shows `0/0` across RPM, TPM, _and_
RPD. The limit is zero from the start, not "used up." This matches Google's
own pricing page: free-tier image generation is `0` by design — it needs a
paid, billing-enabled project.

---

![alt text](image.png)

---

**3. I tried to actually fix it by enabling billing, and hit a second,
separate problem:** Google Cloud's billing-activation page fails with
`This action couldn't be completed. [OR_BACR2_44]`. That's a known bug on
Google's side — it shows up in Google's own support forums (Workspace Admin
Community, Google Developers forum) with reports going back months and no
fix. So right now, even the documented way out of problem #1 is blocked by
something outside this app's control.

**4. Free-tier text quota isn't unlimited either.** During testing, the
dashboard also showed `RPD 24/20` on the text model — 24 requests used
against a 20-per-day cap. Style/Characters worked when I ran them, but on a
fresh key you can still hit this same daily ceiling with normal use.

**What this means concretely:**

- `parseGeneratedImage()` (the code that reads Gemini's image response) is
  written to fail loudly and specifically if the real shape doesn't match
  what I assumed — on purpose, because I never got to verify that
  assumption against a real response.
- If you run this with a billing-enabled key, try Portraits first. It will
  either work, or fail with a clear, visible error instead of silently
  doing the wrong thing.
- This is a Google account/billing limitation, not a code bug — but I'm
  flagging it here instead of hiding behind "should work in theory."

**One more distinction worth being precise about, for Portraits
specifically: only its *failure* branch of the flow was ever live-tested,
not its success branch.** Two real characters independently hit the real
quota error above. That's live proof the flow correctly kept going after
the first character's failure instead of aborting the whole step, recorded
a distinct `FAILED` state per character, and surfaced the real error
safely instead of crashing. It is *not* proof the success branch — claim →
Gemini returns an image → `parseGeneratedImage()` → persist → advance —
works, because no real image response has ever reached that code. Chapters
and Illustrations have no live evidence in either direction, only the 154
mocked tests.

## Tech Stack

| Tool                              | Why this one                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Next.js (App Router) + TypeScript | One project holds both the pages and the API — no separate backend server to run or deploy.                                      |
| SQLite + Prisma                   | This app runs on one computer for one person. A real database server (Postgres, etc.) would add setup work for no benefit here.  |
| Zod                               | Checks anything coming from the browser or from Gemini before it's trusted. Both are outside our control, so both get validated. |
| shadcn/ui + Tailwind CSS          | Ready-made, accessible components, so time goes into the pipeline logic instead of rebuilding buttons and cards.                 |
| Vitest + React Testing Library    | Fast, and made for this kind of Next.js/React project.                                                                           |
| Gemini API (Interactions API)     | Required by the assessment.                                                                                                      |

## Architecture

```
Browser  →  Next.js pages/API routes  →  lib/pipeline (rules)  →  lib/gemini (Gemini calls)
                                       →  Prisma / SQLite (state)
                                       →  local disk (book text + images)
```

- The **server** decides everything that matters: whose project it is, what
  step comes next, and when Gemini gets called. The browser only shows
  state and asks the server to run a step — it never decides these things
  itself.
- **Concurrency** (double-clicks, two tabs, page refresh) is handled with
  one atomic database update: "mark this step RUNNING, but only if it isn't
  already." If two requests race, only one wins; the other is told the step
  is already running. **Why not a queue or lock system?** This app is one
  process talking to one SQLite file — a plain atomic update already solves
  the problem, so a queue would be extra moving parts with nothing to do.
- **Images and book text live on disk** (`data/projects/<id>/...`), not in
  the database. The database only stores the file path. **Why:** databases
  are a poor place for large binary files; a database column would be
  slower and larger for no gain.

## Prerequisites

- Node.js 20 or newer (built and tested on 22)
- A Gemini API key — **with billing enabled** if you want real image
  generation to actually succeed (see "Current Status" above — without
  billing, Portraits/Chapters/Illustrations will fail with a quota error,
  by design of Gemini's free tier, not a bug here)

## Environment Variables

Copy `.env.example` to `.env` and fill it in:

| Variable             | What it's for                            | Why                                                                           |
| -------------------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| `DATABASE_URL`       | Where the SQLite file lives              | Created automatically the first time you migrate — nothing to install         |
| `SESSION_SECRET`     | Signs the login cookie                   | Without this, sessions could be forged                                        |
| `GEMINI_API_KEY`     | Your Gemini API key                      | Server-only — never sent to the browser                                       |
| `GEMINI_TEXT_MODEL`  | Model used for style/characters/chapters | Kept as an env var, not hardcoded, so it can be swapped without a code change |
| `GEMINI_IMAGE_MODEL` | Model used for portraits/illustrations   | Same reason as above                                                          |

## Getting Started

```bash
npm install
cp .env.example .env        # then fill in GEMINI_API_KEY
npx prisma migrate deploy   # creates the SQLite database file
npm run dev
```

Open http://localhost:3000, sign in with any name + email (no password —
this app doesn't need real accounts), and create a project.

## Testing

```bash
npm test
```

Every automated test **mocks Gemini** — no test ever calls the real API.
**Why:** real Gemini calls cost quota, take time, and aren't the same twice,
which makes them a bad fit for a test suite that should run the same way
every time. A few flows (Style, Characters, and the Portraits failure path)
were also checked by hand against the real API — see `TESTING.md` for what
that covered and the full real test output.

## Project Structure

```
app/          pages and API routes (Next.js App Router)
components/   UI, grouped by area (ui/, identity/, projects/, pipeline/)
lib/          server logic: auth, gemini, pipeline rules, storage, validation
types/        shared TypeScript types used by both frontend and backend
prisma/       database schema and migrations
data/         book text + generated images (created at runtime, not committed)
prompts/      saved AI prompts used for meaningful implementation steps
```

## AI-Assisted Development

This project was built with Claude as a coding assistant, under the rules
in `AGENTS.md`. Two things are kept up to date, honestly, as evidence of
that process:

- `DECISIONS.md` — real cases where Claude's first suggestion was changed
  or rejected, with the reason and the actual commit it landed in.
- `prompts/` — the prompts behind each meaningful feature, not a transcript
  of every message.

---

**Docs:** [Implementation plan](docs/plan.md) · [Decisions log](DECISIONS.md) · [Testing report](TESTING.md) · [Skills](.claude/skills) · [AGENTS.md](AGENTS.md) · [CLAUDE.md](CLAUDE.md)
