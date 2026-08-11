# 003 — Gemini Client/Service Verification + Style Step End-to-End

## Goal

Build the Gemini integration layer (`lib/gemini/client.ts`, `service.ts`)
against mechanics verified live against the real REST API rather than
guessed from documentation, then wire the assessment's Step 1 (Style) end
to end: claim → call Gemini → persist/advance → retryable failure →
recoverable stuck state, matching the pipeline-state and gemini-pipeline
skills.

## Skills Read

- `.claude/skills/gemini-pipeline/SKILL.md` — pipeline order, context
  reuse, structured-output validation, duplicate/retry/stuck-step rules,
  Gemini service boundary.
- `.claude/skills/pipeline-state/SKILL.md` — separate `currentStep`/
  `stepState`, informed the claim/advance/fail design.
- `.claude/skills/testing/SKILL.md` — mock Gemini in tests, never call the
  real API from the suite.

## Existing Code Inspected

- `lib/storage/db.ts`, `lib/storage/files.ts`, `prisma/schema.prisma` —
  `Project.bookFileUri`/`bookFileExpiresAt`/`lastInteractionId`/`style`/
  `currentStep`/`stepState`/`stepStartedAt`/`stepError` already modeled
  from the plan; nothing new needed here.
- `lib/pipeline/state.ts` — reused `isStale`/`canClaim`/`STALE_MS`/
  `nextStep` directly rather than reimplementing claim logic.
- `types/domain.ts`, `types/api.ts` — `ProjectDetail.isStale`, `ApiErrorBody`
  reused as-is.
- `components/ui/*` — shadcn primitives reused for the step panel.

## Decisions or Assumptions

- **Gemini mechanics verified live, not from docs.** A prior research pass
  (web search) had gotten some of it wrong. Before writing `client.ts`,
  ran a real smoke test against `generativelanguage.googleapis.com`:
  confirmed the Interactions API, `previous_interaction_id` chaining, file
  upload + `{"type":"document","uri",...}` referencing (field is `uri`,
  not the initially-guessed `file_uri`), `response_format` as a raw JSON
  Schema, and `system_instruction` as a real top-level field (the
  notebook's cell 20 uses it; cell 14 has a literal
  `# TODO: Sysyem instructions` comment showing the notebook author's own
  intent to move to it). Model IDs `gemini-3.6-flash` / `gemini-3.1-flash-image`
  confirmed real and current via `GET /v1beta/models`.
- **Full notebook inspected and compared** (all 37 code cells, read
  directly, not summarized) against the implementation. See the separate
  Characters-step comparison for the itemized diff log going forward —
  this artifact only reflects mechanics needed for Style.
- **Image generation is quota-blocked** (0 free-tier quota on every image
  model tested) — irrelevant to Style itself (text-only) but constrains
  `lib/gemini/imageResponse.ts`'s design: strict runtime validation with a
  diagnosable error rather than a trusted assumption, since the output
  shape was never actually observed.
- **You overrode my file-detection fix** (`instanceof File` vs. duck
  typing) during the Projects-CRUD work — kept for this task's context
  since it shaped how defensively `client.ts`/`service.ts` handle
  cross-realm concerns generally (they don't; Node-only, no such issue).
- **Image chain rejected** (`lastImageInteractionId` not added) — your
  explicit "Option C" decision after a dedicated analysis: portraits and
  illustrations are independent Gemini calls built from persisted style
  text, character/chapter prompts, and reference images, not from a
  second persisted interaction chain. Not directly exercised by Style,
  but shaped `service.ts`'s `generatePortrait`/`generateIllustration`
  signatures (no `previousInteractionId` param).
- **Style step performs exactly one Gemini call**, attaching the book
  document directly to the style-generation instruction rather than the
  notebook's two-call pattern (silent book-seed interaction, then a
  separate style call chained from it). Verified live that combining
  works. Saves one call per project; the resulting interaction's `id`
  becomes the project's `lastInteractionId` that Characters chains from.
- **Synchronous POST, not background job.** The step route awaits the
  full Gemini call (up to ~36s observed live) before responding, rather
  than kicking off a background task. Justified by AGENTS.md's explicit
  "avoid unnecessary background-job infrastructure," and made safe by the
  atomic claim: a second concurrent request (refresh, second tab) hits
  the DB claim (fast) and gets 409 immediately, never reaching Gemini,
  regardless of how long the first request's Gemini call takes.

## Files Changed

- `lib/gemini/config.ts`, `errors.ts`, `client.ts`, `imageResponse.ts`,
  `imageInstructions.ts`, `service.ts` (new).
- `lib/validation/gemini.ts`, `lib/validation/pipeline.ts` (new).
- `lib/storage/projects.ts` — added `claimStep`, `completeStyleStep`,
  `failStep`.
- `lib/pipeline/style.ts` (new) — orchestration: resolve/re-upload book
  file if expired (~48h), call `generateStyle()`, persist success or a
  safe failure message; never throws.
- `app/api/projects/[projectId]/steps/style/route.ts` (new).
- `components/pipeline/StyleStepPanel.tsx` (new), wired into
  `app/projects/[projectId]/page.tsx`.
- Matching test files for every module above.

## Implementation Requirements

- Step 1 accepts an optional user-supplied style; if given, preserve the
  user's intent rather than replacing it with a generated one.
- Server-side ownership + step-order enforcement (can't run Style if the
  project isn't currently on Style).
- No duplicate Gemini calls under double-click, refresh, or a second tab.
- Explicit running-state label ("Generating art style..."), not a bare
  spinner.
- Failed step remains retryable without touching anything else; a
  server-died-mid-call stuck state is recoverable without DB surgery.
- Book text sent to Gemini at most once per project (until the uploaded
  file expires).

## Security Requirements

- `getCurrentUser()` derives identity from the session cookie on every
  route; the client never supplies `userId`.
- `claimStep`'s `where` clause includes `userId`, so ownership is enforced
  inside the same atomic operation as the claim — no separate
  check-then-act race.
- Error messages returned to the client come from `GeminiApiError`/
  `GeminiResponseShapeError` (Gemini's own message, or a generic fallback)
  — never a stack trace, file path, or internal detail.

## Acceptance Criteria

- New project → Style step runs → style persisted, `currentStep` advances
  to `CHARACTERS`, `stepState` resets to `IDLE`.
- Replaying Style after it's advanced past `STYLE` → 409, no Gemini call.
- Two concurrent requests on a fresh `STYLE` step → exactly one reaches
  Gemini; the other gets 409 immediately.
- A Gemini failure persists `FAILED` + a safe error message, doesn't
  advance `currentStep`, and is retryable.
- A stale `RUNNING` step (past `STALE_MS`) becomes claimable again without
  manual intervention.

## Checks Run

- `npm run lint` — clean.
- `npx tsc --noEmit` — clean.
- `npm test` — 82/82 passed.
- `next build` — not run this round.

## Exact Manual Test Steps (all run for real against the live dev server and real Gemini API)

1. `npm run dev`, log in, create a project with real book text.
2. `POST /api/projects/:id/steps/style` with `{}` → after ~36s, real
   generated style text came back, `currentStep` became `CHARACTERS`.
   Confirmed on disk that the book was uploaded to Gemini's Files API
   exactly once.
3. Re-`POST` the same endpoint on the now-past-Style project → `409`, and
   `generateStyle`/Gemini were never called (checked via mock call counts
   in the equivalent unit test, and by the fact no new interaction id
   appeared).
4. Fired two concurrent `POST`s on a fresh `STYLE` project → one returned
   `409` immediately (`stepState: RUNNING`, no style yet), the other
   returned `200` ~36s later with the generated style — proving the claim
   serializes correctly under real concurrency, not just in mocked tests.
5. UI: visited `/projects/:id`, confirmed the running-state message,
   optional style input, and (via a forced `FAILED`/stale state in
   testing) retry/recover button all render as expected.

## Known Limitations / Follow-ups

- Image-generation output shape remains unverified (quota). Isolated
  behind `parseGeneratedImage()`, which fails loudly and specifically if
  wrong — will re-verify once quota is resolved.
- `docs/plan.md`'s "Conflicts, risks, and decisions" list was trimmed
  after this work: the notebook-verification and model-ID entries were
  removed once confirmed resolved, rather than left struck through.
