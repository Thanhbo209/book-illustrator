# Testing

## Strategy

Tests target *behavior that matters to the assessment* — pipeline
correctness, persistence/resumability, duplicate-call prevention, retry
and stuck-step recovery, and the user-visible frontend states — not a
coverage number. Every automated backend test mocks Gemini; **the suite
never calls the real API.**

Separately, a handful of critical flows were also verified live against
the real Gemini API by hand during development (not part of `npm test`,
since that would cost quota and can't be deterministic). See "Live
verification" below for exactly what that covered and what it didn't.

## Backend Tests

**Auth & sessions** (`lib/auth/session.test.ts`, `app/api/auth/login/route.test.ts`)
Session cookie is HMAC-signed and tamper-evident — a forged cookie is
treated as logged-out, not as a different user. Existing email loads the
existing user without overwriting their stored name; a new email creates
one.

**Projects** (`lib/storage/projects.test.ts`, `app/api/projects/route.test.ts`,
`app/api/projects/[projectId]/route.test.ts`)
Creation from pasted text or an uploaded `.txt`; rejects non-`.txt`
uploads and submissions with neither. A project is only visible to its
owner — everywhere in the API, another user's project returns **404**,
not 403 (deliberate — see `DECISIONS.md`).

**Pipeline state machine** (`lib/pipeline/state.test.ts`)
Pure, DB-free tests for `isStale`, `canClaim`, `nextStep`,
`deriveProjectStatus` — the rules every step route is built on.

**Step ordering & duplicate-call prevention** (every `steps/*/route.test.ts`,
plus `claimStep`'s own suite in `lib/storage/projects.test.ts`)
A step can't run before the previous one has completed (asserted per
route: `cannot be triggered before X has completed`). The atomic claim
is tested directly — two concurrent claims on the same step, only one
succeeds — and end-to-end through every route: a duplicate concurrent
request gets `409` with the Gemini mock asserted as **never called**. A
stale (server-died-mid-call) `RUNNING` step becomes reclaimable after
the timeout; a fresh one does not.

**Retry & failure recovery** (every `lib/pipeline/*.test.ts` and route test)
A Gemini failure persists a safe `FAILED` state with the real error
message, leaves `currentStep` untouched, and is retryable without
redoing completed work — verified for all 5 steps. Unexpected
(non-Gemini) errors are still caught and converted to a generic message,
never a raw stack trace or file path (`never throws` in every pipeline
module).

**Structured output validation** (`lib/validation/gemini.test.ts`,
`lib/gemini/service.test.ts`)
Characters capped at 2, Chapters capped at exactly 1 — enforced by
**rejecting** Gemini's output if it doesn't match, not by silently
truncating extras. Malformed or non-JSON model output is rejected before
it ever reaches the database.

**Portraits: per-character behavior** (`lib/pipeline/portraits.test.ts`)
A character whose portrait is already `COMPLETED` is skipped (never
regenerated). One character's failure doesn't block the other — both are
attempted, and the step only advances to Chapters once *every* character
is `COMPLETED`. Retry only regenerates the character(s) that previously
failed.

**Image persistence & serving** (`lib/gemini/imageResponse.test.ts`,
`app/api/projects/[projectId]/image/[kind]/[refId]/route.test.ts`)
Gemini's real MIME type — not an assumed PNG — drives both the saved
file's extension and the served `Content-Type`; tested with `image/jpeg`
and `image/webp` specifically to prove nothing is hardcoded. Ownership,
invalid `kind`/`refId`, and "the DB row exists but the file is gone" all
return a safe 404 — never a filesystem path.

**Gemini client/service boundary** (`lib/gemini/client.test.ts`,
`lib/gemini/service.test.ts`)
The one place the actual wire format is tested: request shape (`model`,
`input`, `previous_interaction_id`, `response_format`,
`system_instruction`) asserted against a mocked `fetch`. Every test above
this layer mocks `lib/gemini/service.ts` instead, not `fetch` directly.

**How Gemini is mocked:** `vi.mock("@/lib/gemini/service", () => ({...}))`
per test file, replacing only the functions under test
(`generateStyle`, `generateCharacters`, etc.) with `vi.fn()`. Nothing in
`npm test` reaches `generativelanguage.googleapis.com`.

## Frontend Tests

`CharacterCard` / `ChapterCard` — generating / failed / completed
rendering states (pulsing indicator, error badge + message, image).

`PortraitsStepPanel` — the specific running label (not a generic
"Loading..."), Retry button + message on failure, Recover button on a
stale step, and one deliberately non-trivial test: **polling while its
own request is still in flight**, using fake timers to advance past the
poll interval before the mocked `fetch` resolves, proving the
Portraits-specific behavior from `DECISIONS.md`'s polling decision
actually works — not just that the code compiles.

`CharactersStepPanel` — the running label, plus a **contrast test**
proving it does *not* poll during its own in-flight request, guarding
the boundary of that same decision against accidental regression.

## Deliberately Not Tested

- **Exact CSS, spacing, animations** — not user-visible *behavior*.
- **`StyleStepPanel`, `ChaptersStepPanel`, `IllustrationsStepPanel`,
  `ProjectList`, `NewProjectForm` frontend states** — each follows the
  same pattern already exercised by `CharactersStepPanel`
  (idle/running/failed/stale), minus per-item progress. Given limited
  time, backend pipeline/concurrency correctness was prioritized over
  testing four more near-identical component variants.
- **Real Gemini image *output*.** Every image-generation model
  (`gemini-3.1-flash-image`, and every other "Nano Banana" variant)
  returns `0` free-tier quota on the available API key — confirmed via
  the pricing docs and the AI Studio rate-limit dashboard, not a code
  issue. `parseGeneratedImage()` is unit-tested against constructed
  response shapes (see next section for exactly what that does and
  doesn't prove) and will be checked against a real response once
  billing is resolved on that Google Cloud project.
- **A single named "all 5 steps in one test" integration test.** Not
  added as its own test, though every step's setup helper already walks
  the prior steps for real (e.g., the Illustrations tests set up a
  project through real `completeStyleStep`/`completeCharactersStep`/
  portrait-persist/`completeChaptersStep` calls before exercising
  Illustrations itself) — so the sequence is exercised repeatedly, just
  not asserted as one dedicated end-to-end test.
- **Browser automation (Playwright/Cypress)** — explicitly out of scope
  per the assessment ("E2E is not expected").

## Live Verification (manual, outside the automated suite)

Run against the real Gemini API and the real dev server during
development — not repeatable/deterministic enough for `npm test`, but
real evidence the automated suite's mocked assumptions match reality:

- **Style → Characters, full chain, twice**, with different real book
  text each time. Confirmed: real generated style text; Characters
  correctly narrowed to ≤2 adults with rich, style-consistent prompts;
  `previous_interaction_id` chaining recalls prior context without
  resending the book; concurrent duplicate requests → one succeeds, one
  gets `409` with zero extra Gemini calls; replaying a completed step →
  `409`.
- **Portraits, failure path, for real.** Both generated characters
  ("Flora the Sun-Gardener", "Sol the Artisan") independently attempted
  and independently failed with Gemini's real `quota exceeded ... limit:
  0` message — confirming continue-past-one-failure, the real
  (non-generic) error surfacing safely in the UI, and the `Portrait
  failed` state rendering correctly against real data, not just test
  fixtures.
- **Not yet verified**: a *successful* image generation. This is the one
  meaningful gap — `parseGeneratedImage()`'s assumed response shape
  (`{type: "image", data, mime_type}` inside `model_output`) is inferred
  from the symmetric, verified *input* shape and corroborated by the
  reference notebook's own extraction code, but has never been checked
  against a real successful response. It fails loudly and specifically
  if wrong, rather than silently — but "fails loudly if wrong" isn't the
  same as "confirmed right."

## Test Report

Command: **`npm test`** (runs `pretest` — applies migrations to a
dedicated `test.db`, never the dev database — then `vitest run`).
Also run: `npm run lint`, `npx tsc --noEmit` — both clean.

```
> book-illustrator@0.1.0 pretest
> cross-env DATABASE_URL=file:./test.db prisma migrate deploy

Datasource "db": SQLite database "test.db" at "file:./test.db"
2 migrations found in prisma/migrations
No pending migrations to apply.

> book-illustrator@0.1.0 test
> vitest run

 RUN  v4.1.10 E:/projects/book-illustrator/book-illustrator

 Test Files  25 passed (25)
      Tests  154 passed (154)
   Start at  13:46:50
   Duration  8.93s (transform 3.21s, setup 23.06s, import 11.06s, tests 67.44s, environment 7.58s)
```

<details>
<summary>Full per-test output (154/154, real run)</summary>

```
 ✓ app/api/projects/[projectId]/steps/illustrations/route.test.ts > POST /api/projects/:id/steps/illustrations > rejects an unauthenticated request 12ms
 ✓ app/api/projects/[projectId]/image/[kind]/[refId]/route.test.ts > GET /api/projects/:id/image/:kind/:refId > rejects an unauthenticated request 8ms
 ✓ app/api/projects/[projectId]/route.test.ts > GET /api/projects/:id > rejects an unauthenticated request 14ms
 ✓ app/api/projects/[projectId]/steps/chapters/route.test.ts > POST /api/projects/:id/steps/chapters > rejects an unauthenticated request 12ms
 ✓ app/api/projects/route.test.ts > /api/projects > rejects GET without a session 9ms
 ✓ app/api/projects/route.test.ts > /api/projects > rejects POST without a session 5ms
 ✓ app/api/projects/[projectId]/steps/style/route.test.ts > POST /api/projects/:id/steps/style > rejects an unauthenticated request 13ms
 ✓ app/api/projects/[projectId]/steps/portraits/route.test.ts > POST /api/projects/:id/steps/portraits > rejects an unauthenticated request 12ms
 ✓ app/api/auth/login/route.test.ts > POST /api/auth/login > creates a new user for an unseen email 283ms
 ✓ app/api/auth/login/route.test.ts > POST /api/auth/login > loads the existing user without overwriting the stored name 16ms
 ✓ app/api/auth/login/route.test.ts > POST /api/auth/login > rejects invalid input before touching the database 3ms
 ✓ app/api/projects/[projectId]/steps/style/route.test.ts > POST /api/projects/:id/steps/style > runs the step and returns the completed project 511ms
 ✓ app/api/projects/[projectId]/steps/style/route.test.ts > POST /api/projects/:id/steps/style > returns 409 and skips Gemini entirely on a duplicate concurrent request 40ms
 ✓ app/api/projects/[projectId]/steps/style/route.test.ts > POST /api/projects/:id/steps/style > rejects invalid input before claiming the step 38ms
 ✓ lib/pipeline/illustrations.test.ts > runIllustrationsStep > passes persisted portraits as references, persists the image, and advances to DONE 856ms
 ✓ app/api/projects/[projectId]/steps/characters/route.test.ts > POST /api/projects/:id/steps/characters > rejects an unauthenticated request 12ms
 ✓ app/api/projects/route.test.ts > /api/projects > creates a project from pasted text and lists it back 660ms
 ✓ app/api/projects/route.test.ts > /api/projects > creates a project from an uploaded .txt file 151ms
 ✓ app/api/projects/route.test.ts > /api/projects > rejects a non-.txt upload 14ms
 ✓ app/api/projects/route.test.ts > /api/projects > rejects a request with neither pasted text nor a file 14ms
 ✓ lib/pipeline/illustrations.test.ts > runIllustrationsStep > persists a FAILED state with a safe message when Gemini errors, without advancing 360ms
 ✓ lib/pipeline/illustrations.test.ts > runIllustrationsStep > never throws — always resolves to a terminal state even on unexpected errors 265ms
 ✓ app/api/projects/[projectId]/image/[kind]/[refId]/route.test.ts > GET /api/projects/:id/image/:kind/:refId > returns 404 for a nonexistent project 1522ms
 ✓ app/api/projects/[projectId]/image/[kind]/[refId]/route.test.ts > GET /api/projects/:id/image/:kind/:refId > returns 404 (not 403) for another user's project — indistinguishable from missing 265ms
 ✓ app/api/projects/[projectId]/steps/characters/route.test.ts > POST /api/projects/:id/steps/characters > runs the step and returns the completed project with persisted characters 1678ms
 ✓ app/api/projects/[projectId]/image/[kind]/[refId]/route.test.ts > GET /api/projects/:id/image/:kind/:refId > rejects an invalid kind 120ms
 ✓ app/api/projects/[projectId]/image/[kind]/[refId]/route.test.ts > GET /api/projects/:id/image/:kind/:refId > rejects an invalid refId 0 52ms
 ✓ app/api/projects/[projectId]/image/[kind]/[refId]/route.test.ts > GET /api/projects/:id/image/:kind/:refId > rejects an invalid refId -1 36ms
 ✓ lib/storage/projects.test.ts > project storage > creates a project, persists book text to disk, and starts as DRAFT 2015ms
 ✓ lib/auth/session.test.ts > session > returns null when no session cookie is set 5ms
 ✓ lib/storage/projects.test.ts > project storage > only lists projects belonging to the requesting user 183ms
 ✓ lib/auth/session.test.ts > session > resolves the signed-in user after createSession 478ms
 ✓ lib/auth/session.test.ts > session > returns null after clearSession 13ms
 ✓ lib/auth/session.test.ts > session > rejects a tampered session cookie 13ms
 ✓ app/api/projects/[projectId]/image/[kind]/[refId]/route.test.ts > GET /api/projects/:id/image/:kind/:refId > rejects an invalid refId abc 66ms
 ✓ app/api/projects/[projectId]/image/[kind]/[refId]/route.test.ts > GET /api/projects/:id/image/:kind/:refId > rejects an invalid refId 1.5 34ms
 ✓ app/api/projects/[projectId]/steps/characters/route.test.ts > POST /api/projects/:id/steps/characters > cannot be triggered before Style has completed 118ms
 ✓ app/api/projects/[projectId]/image/[kind]/[refId]/route.test.ts > GET /api/projects/:id/image/:kind/:refId > returns 404 when no character exists at that order 523ms
 ✓ app/api/projects/[projectId]/image/[kind]/[refId]/route.test.ts > GET /api/projects/:id/image/:kind/:refId > returns 404 when the character exists but has no portrait yet 45ms
 ✓ app/api/projects/[projectId]/image/[kind]/[refId]/route.test.ts > GET /api/projects/:id/image/:kind/:refId > returns 404 when the row points at a file that no longer exists on disk 46ms
 ✓ lib/storage/projects.test.ts > project storage > returns null when the project belongs to a different user 77ms
 ✓ lib/storage/projects.test.ts > project storage > returns null for a nonexistent project id 14ms
 ✓ app/api/projects/[projectId]/steps/characters/route.test.ts > POST /api/projects/:id/steps/characters > returns 409 and skips Gemini entirely on a duplicate concurrent request 1009ms
 ✓ lib/storage/projects.test.ts > project storage > claimStep > claims a fresh IDLE step and marks it RUNNING 724ms
 ✓ lib/storage/projects.test.ts > project storage > claimStep > only lets one of two concurrent claims succeed 37ms
 ✓ lib/storage/projects.test.ts > project storage > claimStep > refuses to claim a step that isn't current 31ms
 ✓ app/api/projects/[projectId]/steps/characters/route.test.ts > POST /api/projects/:id/steps/characters > returns 404 for another user's project 105ms
 ✓ app/api/projects/[projectId]/steps/chapters/route.test.ts > POST /api/projects/:id/steps/chapters > runs the step and returns the completed project with the persisted chapter 3245ms
 ✓ app/api/projects/[projectId]/steps/chapters/route.test.ts > POST /api/projects/:id/steps/chapters > cannot be triggered before Portraits has completed 36ms
 ✓ components/pipeline/PortraitsStepPanel.test.tsx > PortraitsStepPanel > renders nothing when Portraits isn't the current step 21ms
 ✓ components/pipeline/PortraitsStepPanel.test.tsx > PortraitsStepPanel > shows the specific running label, not a generic spinner 24ms
 ✓ app/api/projects/[projectId]/image/[kind]/[refId]/route.test.ts > GET /api/projects/:id/image/:kind/:refId > serves a character portrait with the correct bytes and Content-Type derived from the real extension 47ms
 ✓ components/pipeline/PortraitsStepPanel.test.tsx > PortraitsStepPanel > shows the error and a Retry button when FAILED 149ms
 ✓ components/pipeline/PortraitsStepPanel.test.tsx > PortraitsStepPanel > shows a stuck-step banner and Recover button when RUNNING but stale 12ms
 ✓ components/pipeline/PortraitsStepPanel.test.tsx > PortraitsStepPanel > polls while its own request is in flight (Decision #2) 34ms
 ✓ app/api/projects/[projectId]/image/[kind]/[refId]/route.test.ts > GET /api/projects/:id/image/:kind/:refId > serves a chapter illustration by the same route 753ms
 ✓ app/api/projects/[projectId]/steps/chapters/route.test.ts > POST /api/projects/:id/steps/chapters > returns 409 and skips Gemini entirely on a duplicate concurrent request 152ms
 ✓ lib/storage/projects.test.ts > project storage > claimStep > refuses to claim a fresh RUNNING step 115ms
 ✓ lib/storage/projects.test.ts > project storage > claimStep > allows reclaiming a stale RUNNING step 60ms
 ✓ app/api/projects/[projectId]/steps/portraits/route.test.ts > POST /api/projects/:id/steps/portraits > runs the step and returns the completed project with a persisted portrait 3105ms
 ✓ lib/storage/projects.test.ts > project storage > claimStep > refuses to claim another user's project 330ms
 ✓ lib/storage/projects.test.ts > project storage > completeStyleStep / failStep > persists the style and advances to CHARACTERS 78ms
 ✓ app/api/projects/[projectId]/steps/style/route.test.ts > POST /api/projects/:id/steps/style > returns 404 for another user's project 84ms
 ✓ app/api/projects/[projectId]/steps/portraits/route.test.ts > POST /api/projects/:id/steps/portraits > cannot be triggered before Characters has completed 648ms
 ✓ app/api/projects/[projectId]/steps/style/route.test.ts > POST /api/projects/:id/steps/style > persists a retryable FAILED state when Gemini errors 2990ms
 ✓ app/api/projects/[projectId]/steps/chapters/route.test.ts > POST /api/projects/:id/steps/chapters > returns 404 for another user's project 253ms
 ✓ app/api/projects/[projectId]/steps/portraits/route.test.ts > POST /api/projects/:id/steps/portraits > returns 409 and skips Gemini entirely on a duplicate concurrent request 168ms
 ✓ lib/storage/projects.test.ts > project storage > completeStyleStep / failStep > persists a failure without advancing the step 192ms
 ✓ app/api/projects/[projectId]/steps/chapters/route.test.ts > POST /api/projects/:id/steps/chapters > persists a retryable FAILED state when Gemini errors, then succeeds on retry 459ms
 ✓ components/pipeline/CharacterCard.test.tsx > CharacterCard > shows a generating indicator while the portrait is RUNNING 83ms
 ✓ lib/storage/projects.test.ts > project storage > completeCharactersStep > persists ordered character rows and advances to PORTRAITS 355ms
 ✓ lib/storage/projects.test.ts > project storage > completeCharactersStep > overwrites any existing character rows rather than duplicating them 86ms
 ✓ app/api/projects/[projectId]/steps/portraits/route.test.ts > POST /api/projects/:id/steps/portraits > returns 404 for another user's project 107ms
 ✓ lib/gemini/client.test.ts > createInteraction > posts the expected body and returns the parsed response 100ms
 ✓ lib/gemini/client.test.ts > createInteraction > throws GeminiApiError with the server's message on failure 3ms
 ✓ lib/gemini/client.test.ts > createInteraction > throws GeminiApiError when the response body isn't parseable JSON 1ms
 ✓ lib/gemini/client.test.ts > getModelOutputText > extracts text from the model_output step 1ms
 ✓ lib/gemini/client.test.ts > getModelOutputText > throws GeminiResponseShapeError when no model_output text step exists 1ms
 ✓ lib/gemini/client.test.ts > uploadFile > performs the resumable start+upload flow and returns the file resource 2ms
 ✓ lib/gemini/client.test.ts > uploadFile > throws GeminiApiError when the start request doesn't return an upload URL 1ms
 ✓ components/pipeline/CharacterCard.test.tsx > CharacterCard > shows the failure badge and message when the portrait FAILED 14ms
 ✓ components/pipeline/CharacterCard.test.tsx > CharacterCard > renders the portrait image once COMPLETED 195ms
 ✓ components/pipeline/CharacterCard.test.tsx > CharacterCard > shows neither indicator while IDLE (nothing generated yet) 7ms
 ✓ app/api/projects/[projectId]/steps/portraits/route.test.ts > POST /api/projects/:id/steps/portraits > persists a retryable FAILED state when Gemini errors, then succeeds on retry 451ms
 ✓ lib/pipeline/style.test.ts > runStyleStep > uploads the book once, generates the style, and advances to CHARACTERS 3317ms
 ✓ lib/pipeline/style.test.ts > runStyleStep > passes the user-provided style through to the Gemini call 45ms
 ✓ lib/pipeline/style.test.ts > runStyleStep > does not re-upload the book if the existing file hasn't expired 1193ms
 ✓ lib/pipeline/style.test.ts > runStyleStep > re-uploads the book if the existing file has expired 72ms
 ✓ app/api/projects/[projectId]/route.test.ts > GET /api/projects/:id > returns the project detail for its owner 4317ms
 ✓ lib/storage/projects.test.ts > project storage > per-character portrait state > tracks a single character's portrait through running -> completed independently of the others 487ms
 ✓ lib/pipeline/portraits.test.ts > runPortraitsStep > generates and persists a portrait for every character, then advances to CHAPTERS 4620ms
 ✓ lib/gemini/service.test.ts > uploadBookText > uploads the book text as a text/plain file 4ms
 ✓ lib/gemini/service.test.ts > generateStyle > attaches the book document and returns the generated style 4ms
 ✓ lib/gemini/service.test.ts > generateStyle > preserves a user-provided style instead of asking Gemini to invent one 1ms
 ✓ lib/gemini/service.test.ts > generateCharacters > chains from the previous interaction and returns validated characters 7ms
 ✓ lib/gemini/service.test.ts > generateCharacters > throws GeminiResponseShapeError when Gemini returns non-JSON 3ms
 ✓ lib/gemini/service.test.ts > generateCharacters > throws GeminiResponseShapeError when Gemini returns more than 2 characters 2ms
 ✓ lib/gemini/service.test.ts > generateChapters > references character names and returns exactly one validated chapter 2ms
 ✓ lib/gemini/service.test.ts > generatePortrait > returns the generated image and interaction id, without chaining 1ms
 ✓ lib/gemini/service.test.ts > generatePortrait > propagates a shape error if Gemini doesn't return an image 2ms
 ✓ lib/gemini/service.test.ts > generateIllustration > passes character portraits as image inputs alongside the chapter prompt, without chaining 1ms
 ✓ lib/storage/projects.test.ts > project storage > per-character portrait state > records a failure on one character without affecting the other 82ms
 ✓ lib/storage/projects.test.ts > project storage > per-character portrait state > advancePortraitsStep moves the project to CHAPTERS 281ms
 ✓ lib/validation/gemini.test.ts > charactersResponseSchema > accepts 1 or 2 well-formed characters 6ms
 ✓ lib/validation/gemini.test.ts > charactersResponseSchema > rejects more than 2 characters 2ms
 ✓ lib/validation/gemini.test.ts > charactersResponseSchema > rejects an empty list 1ms
 ✓ lib/validation/gemini.test.ts > charactersResponseSchema > rejects malformed items 1ms
 ✓ lib/validation/gemini.test.ts > chaptersResponseSchema > accepts exactly 1 chapter 1ms
 ✓ lib/validation/gemini.test.ts > chaptersResponseSchema > rejects 0 or 2+ chapters 1ms
 ✓ lib/validation/gemini.test.ts > toGeminiSchema > strips $schema and keeps the JSON Schema shape Gemini expects 3ms
 ✓ lib/storage/projects.test.ts > project storage > completeChaptersStep / completeIllustrationStep > persists the chapter, updates the text chain, and advances to ILLUSTRATIONS 180ms
 ✓ lib/pipeline/style.test.ts > runStyleStep > persists a FAILED state with a safe message when Gemini errors, without advancing 555ms
 ✓ lib/pipeline/portraits.test.ts > runPortraitsStep > skips a character whose portrait is already COMPLETED (resumability) 392ms
 ✓ lib/gemini/imageResponse.test.ts > parseGeneratedImage > extracts base64 data and mime type from a well-formed response 3ms
 ✓ lib/gemini/imageResponse.test.ts > parseGeneratedImage > throws when there is no image content item 1ms
 ✓ lib/gemini/imageResponse.test.ts > parseGeneratedImage > throws when there is no model_output step at all 0ms
 ✓ lib/gemini/imageResponse.test.ts > parseGeneratedImage > throws when data is missing 1ms
 ✓ lib/gemini/imageResponse.test.ts > parseGeneratedImage > throws when data is not valid base64 0ms
 ✓ lib/gemini/imageResponse.test.ts > parseGeneratedImage > throws when mime_type is missing or not an image type 0ms
 ✓ lib/pipeline/state.test.ts > isStale > is false when idle 2ms
 ✓ lib/pipeline/state.test.ts > isStale > is false for a fresh RUNNING step 1ms
 ✓ lib/pipeline/state.test.ts > isStale > is true once a RUNNING step exceeds the stale threshold 1ms
 ✓ lib/pipeline/state.test.ts > canClaim > allows claiming IDLE and FAILED steps 1ms
 ✓ lib/pipeline/state.test.ts > canClaim > blocks a fresh RUNNING step 0ms
 ✓ lib/pipeline/state.test.ts > canClaim > allows reclaiming a stale RUNNING step 1ms
 ✓ lib/pipeline/state.test.ts > canClaim > blocks a COMPLETED step 0ms
 ✓ lib/pipeline/state.test.ts > nextStep > walks the pipeline in order and ends at DONE 0ms
 ✓ lib/pipeline/state.test.ts > deriveProjectStatus > is DRAFT for a brand-new project 1ms
 ✓ lib/pipeline/state.test.ts > deriveProjectStatus > is IN_PROGRESS once style generation has started or any step is mid-pipeline 0ms
 ✓ lib/pipeline/state.test.ts > deriveProjectStatus > is DONE once the pipeline has finished 0ms
 ✓ lib/storage/projects.test.ts > project storage > completeChaptersStep / completeIllustrationStep > persists the illustration and advances the project to DONE 257ms
 ✓ lib/pipeline/characters.test.ts > runCharactersStep > chains from the Style step's interaction id and persists the result 5496ms
 ✓ lib/pipeline/characters.test.ts > runCharactersStep > persists a FAILED state with a safe message when Gemini errors, without advancing 84ms
 ✓ lib/pipeline/characters.test.ts > runCharactersStep > never throws — always resolves to a terminal state even on unexpected errors 60ms
 ✓ app/api/projects/[projectId]/steps/illustrations/route.test.ts > POST /api/projects/:id/steps/illustrations > runs the step and returns the completed, DONE project with the persisted illustration 2383ms
 ✓ app/api/projects/[projectId]/steps/illustrations/route.test.ts > POST /api/projects/:id/steps/illustrations > cannot be triggered before Chapters has completed 35ms
 ✓ lib/pipeline/style.test.ts > runStyleStep > never throws — always resolves to a terminal state even on unexpected errors 532ms
 ✓ components/pipeline/CharactersStepPanel.test.tsx > CharactersStepPanel > shows the specific running label 56ms
 ✓ components/pipeline/CharactersStepPanel.test.tsx > CharactersStepPanel > does NOT poll while its own request is in flight — Decision #2 scopes the polling fix to Portraits only 220ms
 ✓ app/api/projects/[projectId]/steps/characters/route.test.ts > POST /api/projects/:id/steps/characters > persists a retryable FAILED state when Gemini errors, then succeeds on retry 2888ms
 ✓ lib/pipeline/portraits.test.ts > runPortraitsStep > continues past one character's failure, persists the other, and fails the overall step 716ms
 ✓ lib/pipeline/portraits.test.ts > runPortraitsStep > on retry, regenerates only the previously failed character 130ms
 ✓ lib/pipeline/portraits.test.ts > runPortraitsStep > wraps unexpected errors in a safe, generic message 80ms
 ✓ app/api/projects/[projectId]/route.test.ts > GET /api/projects/:id > returns 404 for another user's project 1544ms
 ✓ app/api/projects/[projectId]/route.test.ts > GET /api/projects/:id > returns 404 for a nonexistent project 13ms
 ✓ lib/pipeline/chapters.test.ts > runChaptersStep > chains from the Characters step's interaction id (skipping Portraits) and persists the result 5959ms
 ✓ lib/pipeline/chapters.test.ts > runChaptersStep > persists a FAILED state with a safe message when Gemini errors, without advancing 75ms
 ✓ lib/pipeline/chapters.test.ts > runChaptersStep > never throws — always resolves to a terminal state even on unexpected errors 124ms
 ✓ app/api/projects/[projectId]/steps/illustrations/route.test.ts > POST /api/projects/:id/steps/illustrations > returns 409 and skips Gemini entirely on a duplicate concurrent request 3785ms
 ✓ app/api/projects/[projectId]/steps/illustrations/route.test.ts > POST /api/projects/:id/steps/illustrations > returns 404 for another user's project 94ms
 ✓ app/api/projects/[projectId]/steps/illustrations/route.test.ts > POST /api/projects/:id/steps/illustrations > persists a retryable FAILED state when Gemini errors, then succeeds on retry 121ms
 ✓ components/pipeline/ChapterCard.test.tsx > ChapterCard > shows a generating indicator while the illustration is RUNNING 48ms
 ✓ components/pipeline/ChapterCard.test.tsx > ChapterCard > shows the failure badge and message when the illustration FAILED 8ms
 ✓ components/pipeline/ChapterCard.test.tsx > ChapterCard > renders the illustration image once COMPLETED 121ms

 Test Files  25 passed (25)
      Tests  154 passed (154)
   Start at  13:46:50
   Duration  8.93s (transform 3.21s, setup 23.06s, import 11.06s, tests 67.44s, environment 7.58s)
```

</details>
