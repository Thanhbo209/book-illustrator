# 004 — Characters Step End-to-End

## Goal

Wire the assessment's Step 2 (Characters) end to end: chain from the
completed Style interaction (`BOOK → STYLE → CHARACTERS`), generate the
main adult characters (max 2, enforced server-side), persist them, and
advance the pipeline — following the exact claim/run/persist/advance
pattern already proven by Style.

## Skills Read

- `.claude/skills/gemini-pipeline/SKILL.md` — character cap enforcement,
  context reuse (chain from the prior step, don't resend the book),
  structured-output validation.
- `.claude/skills/pipeline-state/SKILL.md` — reused the existing
  `claimStep`/`failStep` machinery unchanged; no new state-model needed
  for a single-shot text step.
- `.claude/skills/testing/SKILL.md` — mock Gemini in tests, verify caps
  and concurrency, never call the real API from the suite.

## Existing Code Inspected

Before writing anything: `lib/gemini/service.ts` (`generateCharacters`
already existed from the client/service verification work),
`lib/storage/projects.ts` (`claimStep`, `completeStyleStep`, `failStep`
as the pattern to mirror), `prisma/schema.prisma` (`Character` model
already had every field needed — no schema change anticipated), the full
Style pipeline/route/UI as the template, and notebook cell 12 (Characters
generation) for a request/response comparison — see the plan
conversation for the itemized diff.

## Decisions or Assumptions

- **Approved: add the notebook's "at least 50 words" instruction** to
  `generateCharacters()`'s prompt, so downstream Portrait prompts have
  enough material to work with. The only open decision from the planning
  comparison; everything else in that comparison was either already
  resolved in the Gemini-verification work or a straightforward
  mechanical port of the Style pattern.
- **No `service.ts` changes needed beyond the prompt wording** —
  `generateCharacters({ previousInteractionId })` was already shaped
  correctly; the only missing piece was the orchestration layer that
  reads `project.lastInteractionId` (set by Style) and calls it.

## Files Changed

- `lib/gemini/service.ts` — added the 50-word instruction.
- `lib/storage/projects.ts` — `completeCharactersStep()` (transactional:
  replace `Character` rows, advance to `PORTRAITS`).
- `lib/pipeline/characters.ts` (new) — orchestration mirroring `style.ts`.
- `app/api/projects/[projectId]/steps/characters/route.ts` (new).
- `components/pipeline/CharactersStepPanel.tsx`, `CharacterCard.tsx` (new),
  wired into `app/projects/[projectId]/page.tsx`.
- `prisma/schema.prisma` + migration `20260811131058_cascade_delete_characters_chapters`
  — see bug below.
- Matching test files for every module above.

## A Real Bug Found And Fixed

The new tests (which persist `Character` rows) exposed that
`Project → Character`/`Chapter` had no `onDelete: Cascade`. Deleting a
project with characters attached threw a foreign-key violation in test
cleanup — and that failure appeared to degrade the shared SQLite
connection enough to cause unrelated tests in the same run to time out.
Fixed with a migration. Not just a test-cleanup workaround: the app
itself would hit the identical error if project deletion is ever added
later, so this was a genuine, if latent, application bug.

## Implementation Requirements

- Chain from `project.lastInteractionId` (the Style interaction's own
  id) — never re-send the book document.
- Max 2 characters, adults only, enforced by the existing Zod schema
  (`charactersResponseSchema.max(2)`), which rejects overshoot rather
  than silently truncating.
- No duplicate Gemini calls under double-click/refresh/second tab.
- A step can't be replayed once `currentStep` has advanced past it.
- Failed step remains retryable; a stuck (stale `RUNNING`) step is
  recoverable without DB surgery — identical guarantees to Style, for
  free, by reusing `claimStep`.

## Security Requirements

- Same as Style: session-derived identity, ownership enforced inside the
  atomic claim, error messages never expose internals.

## Acceptance Criteria

- Characters step only runnable once Style has completed.
- Exactly ≤2 `Character` rows persisted, each with `name` + a
  ≥50-word `prompt`.
- `currentStep` advances to `PORTRAITS` on success.
- Replaying after advancing → 409, no Gemini call.
- Two concurrent requests on a fresh step → exactly one reaches Gemini.

## Checks Run

- `npm run lint` — clean.
- `npx tsc --noEmit` — clean.
- `npm test` — 93/93 passed (including the cascade-delete fix and its
  regression coverage).

## Exact Manual Test Steps (real Gemini API, not mocked)

1. `npm run dev`, create a project with real book text mentioning Mole,
   Water Rat, Mr. Toad, and Badger.
2. Run Style → real generated style description.
3. Run Characters (chained from Style's interaction, no book resend) →
   Gemini correctly narrowed to exactly **2 adults** (Mole, Mr. Toad),
   each with a rich, style-consistent ~80+ word prompt referencing the
   exact palette Style established — direct proof the chain carried
   context without resending anything.
4. Replaying Characters after it advanced to `PORTRAITS` → 409.
5. Fired two concurrent Characters requests on a fresh project → one
   completed normally (2 different, relevant characters generated from a
   second test book about a fox and owl), the other got 409 immediately
   with zero characters generated.

## Known Limitations / Follow-ups

- Portraits, Chapters, and Illustrations were not yet implemented as of
  this artifact — that work is tracked separately (in progress as of
  this writing; see the next prompt artifact once that arc closes).
