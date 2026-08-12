# 006 — Illustrations Step End-to-End

## Goal

Wire the assessment's Step 5 (Illustrations), the pipeline's terminal
step: generate one scene illustration for the persisted chapter, reusing
the persisted character portraits as explicit visual references so
character appearance stays consistent, persist the result, and advance
the project to `DONE`.

## Skills Read

- `.claude/skills/gemini-pipeline/SKILL.md` — "character portraits must
  be reused as visual references," persist before marking complete, never
  regenerate a successfully persisted image.
- `.claude/skills/pipeline-state/SKILL.md` — `claimStep`/`failStep`
  reused unchanged; `DONE` is the terminal `PipelineStep` already modeled
  in the schema and handled by `Stepper`/`deriveProjectStatus`.
- `.claude/skills/testing/SKILL.md` — mock Gemini, verify the reference
  images actually get passed, never call the real API.

## Existing Code Inspected

`lib/gemini/service.ts` (`generateIllustration` already existed, already
shaped as `{ chapter, style, characterPortraits }` — an independent call
per Decision #4, no `previousInteractionId` parameter at all),
`lib/storage/files.ts` (`chapterIllustrationPath`, `mimeTypeForPath`,
`readImage`/`writeImage` — all already mimeType-aware per Decision #3),
`lib/storage/projects.ts` (`completeIllustrationStep` already existed
from the earlier storage-layer work), `lib/pipeline/portraits.ts` as the
closest template for "read/write real image bytes," not
`characters.ts`/`chapters.ts` (which are text-only).

## Decisions or Assumptions

No new decisions — this step is where two already-settled decisions
converge and get exercised together for the first time:
- **Decision #4 (independent image calls)**: no interaction id is passed
  to `generateIllustration` — character consistency comes entirely from
  the explicit reference images, not conversational memory.
- **Decision #3 (real MIME type, no PNG assumption)**: reference portraits
  are read from disk and their MIME type is derived from *their own
  stored path's extension* (`mimeTypeForPath`), not assumed — a portrait
  saved as `.jpg` is correctly read back and sent to Gemini as
  `image/jpeg`, not silently mislabeled. The generated illustration
  itself is saved the same way, using Gemini's actual returned MIME type.
- **Only `COMPLETED` portraits with a path are included** as references
  — structurally this can't currently happen (Illustrations can't run
  until Portraits fully succeeds), but the check is there defensively
  rather than assuming the in-memory list is exactly right.

## Files Changed

- `lib/pipeline/illustrations.ts` (new) — reads all persisted portraits,
  base64-encodes them with their real MIME type, calls
  `generateIllustration`, writes the result with Gemini's real returned
  MIME type, persists via `completeIllustrationStep`.
- `app/api/projects/[projectId]/steps/illustrations/route.ts` (new) —
  same claim→run→return shape as every other step route.
- Matching test files: `lib/pipeline/illustrations.test.ts` (3 tests,
  including one that asserts the reference images sent to Gemini contain
  the exact bytes and MIME type read back from disk),
  `app/api/projects/[projectId]/steps/illustrations/route.test.ts`
  (6 tests).

## Implementation Requirements

- Can't run before Chapters has completed.
- Persisted character portraits passed as explicit image references
  alongside the chapter prompt and style.
- Image written to disk *before* the `Chapter` row is marked
  `illustrationState: COMPLETED` (mirrors the same ordering already
  enforced in Portraits).
- Project only reaches `DONE` after the illustration is actually
  persisted — not before, and not on a Gemini failure.
- No duplicate Gemini calls; failed step retryable.

## Security Requirements

Same as every prior step: session-derived identity, ownership enforced
inside the atomic claim, error messages never expose internals or raw
file paths.

## Acceptance Criteria

- Illustrations step only runnable once Chapters has completed.
- All persisted portraits are read and passed as references, with the
  correct MIME type for each.
- Illustration persisted with Gemini's real returned MIME type (verified
  in tests with `image/webp`, deliberately not PNG).
- `currentStep` advances to `DONE`, `status` becomes `DONE`, only on
  success.
- Gemini failure → safe error, chapter's `illustrationState` stays
  `IDLE` (not falsely marked done), step stays retryable.

## Checks Run

- `npm run lint` — clean.
- `npx tsc --noEmit` — clean.
- `lib/pipeline/illustrations.test.ts` — 3/3 passed (isolated).
- `app/api/projects/[projectId]/steps/illustrations/route.test.ts` —
  6/6 passed (isolated).
- Full suite (after the `testTimeout` fix noted in 005) — 140/140 passed,
  twice in a row.

## Known Limitations / Follow-ups

- **Real image-generation output remains unverified.** Every image model
  tested returned 0 free-tier quota during the earlier Gemini
  verification work. `parseGeneratedImage()` (shared by Portraits and
  Illustrations) validates strictly and fails loudly if the assumed
  `{type: "image", data, mime_type}` shape is wrong — but that's a
  safety net, not proof the shape is right. This is the last step where
  that assumption matters, since it's the final consumer of both a
  generated image and multiple reference images in one call.
- No live UAT performed for this step yet, for the same reason.
- Once quota is available: a real end-to-end run (Style→Characters→
  Portraits→Chapters→Illustrations) would validate the MIME-type
  handling and reference-image passing against actual Gemini output for
  the first time.
