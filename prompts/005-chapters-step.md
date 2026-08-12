# 005 — Chapters Step End-to-End

## Goal

Wire the assessment's Step 4 (Chapters): continue the text interaction
chain from Characters (`BOOK → STYLE → CHARACTERS → CHAPTERS`, explicitly
skipping over Portraits, which is an independent image step per Decision
#4), generate exactly one chapter (title + illustration prompt
referencing the established characters), validate the structured output,
persist it, and advance to `ILLUSTRATIONS`.

## Skills Read

- `.claude/skills/gemini-pipeline/SKILL.md` — chapter cap (exactly 1),
  "chapter prompts must reference the generated characters," structured
  output validation before persistence.
- `.claude/skills/pipeline-state/SKILL.md` — reused `claimStep`/`failStep`
  unchanged, same as every prior step.
- `.claude/skills/testing/SKILL.md` — mock Gemini, verify step ordering,
  caps, and concurrency without calling the real API.

## Existing Code Inspected

`lib/gemini/service.ts` (`generateChapters` already existed and already
took `{ previousInteractionId, characters }`), `lib/storage/projects.ts`
(`completeCharactersStep`/`advancePortraitsStep` as the pattern —
`completeChaptersStep` needed to be added following the same shape),
`lib/pipeline/characters.ts` as the direct template for
`lib/pipeline/chapters.ts`, and `prisma/schema.prisma`'s `Chapter` model
(already had every field needed).

## Decisions or Assumptions

No new decisions. This step is a mechanical continuation of already-settled
architecture:
- **Chains from `lastInteractionId` as-is** — after Portraits runs (an
  independent call per Decision #4), `lastInteractionId` still points at
  Characters' own interaction id, since Portraits never touches it. This
  is exactly what makes the `BOOK→STYLE→CHARACTERS→CHAPTERS` chain work
  without Chapters needing to know or care that Portraits happened in
  between.
- **Cap enforcement**: `chaptersResponseSchema.length(1)` (already
  existed) rejects anything other than exactly one chapter — same
  reject-not-truncate posture as Characters' `.max(2)`.

## Files Changed

- `lib/storage/projects.ts` — `completeChaptersStep()` (transactional:
  replace the one `Chapter` row, update `lastInteractionId`, advance to
  `ILLUSTRATIONS`).
- `lib/pipeline/chapters.ts` (new) — orchestration mirroring
  `characters.ts`.
- `app/api/projects/[projectId]/steps/chapters/route.ts` (new) —
  identical claim→run→return shape as every other step route.
- Matching test files: `lib/pipeline/chapters.test.ts` (3 tests),
  `app/api/projects/[projectId]/steps/chapters/route.test.ts` (6 tests).
- `vitest.config.ts` — `testTimeout: 15000`. Unrelated to Chapters logic
  itself, but surfaced while testing this step: multiple Vitest workers
  share one SQLite file via `better-sqlite3` (single-writer), and the
  setup chains for later steps (Style→Characters→Portraits→Chapters,
  each a `$transaction`) now involve enough sequential DB round-trips
  that some runs exceeded the 5s default under parallel contention.
  Confirmed flaky (different test failed each run) before the fix,
  reliable across two full-suite runs after it.

## Implementation Requirements

- Can't run before Portraits has completed (`claimStep` gates on
  `currentStep === "CHAPTERS"`).
- Exactly 1 chapter persisted, referencing established character names in
  its prompt.
- No duplicate Gemini calls under double-click/refresh/second tab.
- Failed step retryable; stuck step recoverable — identical guarantees to
  every prior step, for free, via `claimStep`.

## Security Requirements

Same as every prior step: session-derived identity, ownership enforced
inside the atomic claim, error messages never expose internals.

## Acceptance Criteria

- Chapters step only runnable once Portraits has completed.
- Exactly 1 `Chapter` row persisted (title + prompt).
- `currentStep` advances to `ILLUSTRATIONS` on success.
- Replaying after advancing → 409, no Gemini call.
- Concurrent duplicate requests → exactly one reaches Gemini.
- A Gemini failure leaves the project retryable without touching the
  already-persisted characters/portraits.

## Checks Run

- `npm run lint` — clean.
- `npx tsc --noEmit` — clean.
- `lib/pipeline/chapters.test.ts` — 3/3 passed (isolated).
- `app/api/projects/[projectId]/steps/chapters/route.test.ts` — 6/6
  passed (isolated).
- Full suite after the `testTimeout` fix — 140/140 passed, twice in a row.

## Known Limitations / Follow-ups

- **No live UAT yet.** Unlike Style and Characters (both verified against
  the real Gemini API earlier in this project), Chapters has only been
  exercised against the mocked `generateChapters`. It's text-only, so a
  live run is possible and cheap (same as Style/Characters) — just not
  done yet as of this artifact. Worth doing once the full
  Portraits→Chapters→Illustrations UI is wired, so the whole pipeline can
  be walked end to end in one pass.
- Portraits and Illustrations remain quota-blocked for real image output
  verification — unrelated to Chapters itself, but the reason a full
  live walkthrough hasn't happened yet.
