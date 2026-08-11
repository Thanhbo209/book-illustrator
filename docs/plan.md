# Book Illustrator — Implementation Plan

## Context

Gradion take-home assessment: a local-only Next.js app that turns book text into
character portraits + one chapter illustration via the Gemini API, through a
5-step user-driven pipeline (Style → Characters → Portraits → Chapters →
Illustrations). The repo currently has only a fresh `create-next-app` scaffold
(root-level `app/`, no `lib/`, no Prisma, no tests) plus governance files
(`AGENTS.md`, skills, the assessment doc, `app-demo.html`). This is the
`docs/plan.md` artifact required by the `gemini-pipeline` skill and by the
assessment's AI-artifact requirement (§2.2).

Source docs read: `AGENTS.md`, `docs/gradion-assessment-intern-software-engineer.md`,
all four skills (`gemini-pipeline`, `pipeline-state`, `testing`, `ux-ui`),
current scaffold files, `app-demo.html` (skimmed for scope). Gemini mechanics
were cross-checked against `ai.google.dev` docs — confidence is moderate, not
certain (see Risks). The notebook was not run in Colab by the AI (no Python/
Colab access); the developer has not run it yet either as of plan approval,
so `lib/gemini/client.ts` will be verified against a live curl smoke test
before being wired into any route, and corrected if the developer's own
notebook run surfaces differences.

---

## 1. Architecture & project structure

Keep the existing root-level layout (`app/`, not `src/app/`) rather than
migrating to the `src/` tree shown in `AGENTS.md` §5 — the scaffold already
exists at root with `tsconfig.json` `@/*` → `./*`, and moving it is pure
churn with no functional benefit. Deliberate deviation from the AGENTS.md
diagram (Decision 2, see below).

```
app/
├── layout.tsx, page.tsx (redirect to /login or /projects)
├── login/page.tsx
├── projects/
│   ├── page.tsx                 (list)
│   ├── new/page.tsx
│   └── [projectId]/page.tsx     (detail + stepper)
└── api/
    ├── auth/{login,logout}/route.ts
    ├── projects/route.ts               (GET list, POST create)
    └── projects/[projectId]/
        ├── route.ts                    (GET detail)
        ├── image/[kind]/[id]/route.ts  (GET — streams a persisted image, ownership-checked)
        └── steps/{style,characters,portraits,chapters,illustrations}/route.ts (POST)

components/
├── ui/          (shadcn primitives)
├── identity/    (LoginForm)
├── projects/    (ProjectList, ProjectCard, NewProjectForm)
└── pipeline/    (Stepper, StepActionPanel, CharacterCard, ChapterCard, RunningState, StuckStepBanner)

lib/
├── gemini/      (client.ts — Interactions/Files REST wrapper; service.ts — the 5 pipeline calls)
├── pipeline/    (state.ts — pure state-machine functions; run.ts — claim+execute+persist per step)
├── storage/     (db.ts — Prisma client; files.ts — book text + image read/write on disk)
├── validation/  (zod schemas: identity, new-project, gemini structured output)
└── auth/        (session.ts — cookie read/write, getCurrentUser)

types/           (User, Project, PipelineStep, StepState, Character, Chapter, API req/res types)
prisma/schema.prisma
data/projects/<project-id>/{book.txt, characters/{1,2}.png, chapters/1.png}
tests/ (or co-located *.test.ts — see Testing section)
```

Server owns all pipeline/ownership/Gemini logic (route handlers + `lib/`).
Client components only render state and call the step endpoints — no
authoritative state in the browser, per AGENTS.md §5/§7.

---

## 2. Data / storage model

Prisma + SQLite (AGENTS.md's stated default; recorded in `DECISIONS.md` as
the stack/storage choice per the assessment's required coverage).

```prisma
model User {
  id        String    @id @default(cuid())
  name      String
  email     String    @unique
  createdAt DateTime  @default(now())
  projects  Project[]
}

model Project {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  title         String
  bookTextPath  String              // relative path under data/projects/<id>/book.txt
  createdAt     DateTime @default(now())

  currentStep   PipelineStep @default(STYLE)   // STYLE|CHARACTERS|PORTRAITS|CHAPTERS|ILLUSTRATIONS|DONE
  stepState     StepState    @default(IDLE)    // IDLE|RUNNING|COMPLETED|FAILED  (state of currentStep)
  stepStartedAt DateTime?
  stepError     String?

  style         String?             // step 1 result (user-provided or generated)

  // Gemini context-chaining bookkeeping (see §5)
  bookFileUri     String?
  bookFileExpiresAt DateTime?
  lastInteractionId String?

  characters    Character[]
  chapters      Chapter[]
}

model Character {
  id             String   @id @default(cuid())
  projectId      String
  project        Project  @relation(fields: [projectId], references: [id])
  order          Int                  // 1 | 2
  name           String
  prompt         String
  portraitPath   String?
  portraitState  StepState @default(IDLE)
  portraitError  String?
}

model Chapter {
  id                 String   @id @default(cuid())
  projectId          String
  project            Project  @relation(fields: [projectId], references: [id])
  order              Int                  // always 1
  title              String
  prompt             String
  illustrationPath   String?
  illustrationState  StepState @default(IDLE)
  illustrationError  String?
}
```

`currentStep`/`stepState` are kept separate per the `pipeline-state` skill
(not one ambiguous status field). Overall `Draft / In Progress / Done`
badges are **derived**, not stored: `Draft` = `currentStep===STYLE && stepState===IDLE`
with no characters yet; `Done` = `currentStep===DONE`; else `In Progress`.
Decision 3 (see below) — deliberately different from the two-field pattern
in AGENTS.md's own DECISIONS.md example, because deriving avoids a third
field that must be kept in sync.

Filesystem: `data/projects/<project-id>/book.txt`,
`.../characters/<order>.png`, `.../chapters/<order>.png`. Paths are always
built server-side from `projectId` + a fixed enum/order — never from
user-supplied strings, per AGENTS.md §9 (path traversal).

---

## 3. Five-step pipeline & state transitions

Pure, DB-free state machine in `lib/pipeline/state.ts`:

```ts
function canStart(project): boolean; // stepState is IDLE or FAILED, or RUNNING-but-stale
function isStale(project, now): boolean; // stepState===RUNNING && now - stepStartedAt > STALE_MS
function advance(project): Partial<Project>; // on success: bump currentStep, reset stepState/Error/StartedAt
```

Unit-testable without Prisma. `lib/pipeline/run.ts` wraps each step route:

1. Load project, verify ownership.
2. Verify `currentStep` matches the requested step (can't skip/replay).
3. Atomically claim the step (§6). If claim fails → 409 with current state, no Gemini call.
4. Call the matching `lib/gemini/service.ts` function.
5. Validate structured output with Zod (characters/chapters) before persisting.
6. On success: persist result (style text / character rows / portrait file /
   chapter row / illustration file), then `advance()` to move `currentStep`
   forward and reset `stepState` to `IDLE`.
7. On failure: persist `stepState=FAILED`, `stepError=<safe message>`. Never retry in a loop.

Portraits (2 items) and the single chapter's illustration reuse the same
claim-per-row mechanism at the `Character`/`Chapter` row level so each
image's progress is independently visible ("Character 1 done, Character 2
generating").

---

## 4. API routes

Following AGENTS.md §7 (action endpoints, not arbitrary PATCH):

```
POST   /api/auth/login              { name, email } → sets session cookie, creates/loads user
POST   /api/auth/logout
GET    /api/projects                → current user's projects (list view fields only)
POST   /api/projects                { title, bookText | uploaded .txt } → create
GET    /api/projects/:id            → full detail incl. pipeline state, characters, chapters
POST   /api/projects/:id/steps/style         { style?: string }
POST   /api/projects/:id/steps/characters
POST   /api/projects/:id/steps/portraits
POST   /api/projects/:id/steps/chapters
POST   /api/projects/:id/steps/illustrations
GET    /api/projects/:id/image/:kind/:refId  → streams a persisted PNG (kind=character|chapter), ownership-checked
```

Every project route derives the user from the session cookie and checks
`project.userId === user.id` before touching anything (AGENTS.md §7/§9).
Step routes are idempotent under retry: calling the _current_ step's route
while it's already `RUNNING` (and not stale) just returns the current state
(409 with state payload) — it never fires Gemini twice.

---

## 5. Gemini integration & context reuse

The pipeline uses the **Interactions API** (the "newest conversation API"
the assessment references, REST-first since only Python/JS SDKs wrap it).
Mechanics below were confirmed with a live smoke test against the real
API on 2026-08-11 (curl, not the notebook — the notebook still hadn't
been run by either side at that point):

- **Book upload (once):** `POST /upload/v1beta/files` (resumable) with
  `book.txt` → `file.uri`. Verified live: files expire in ~48h; store
  `bookFileUri` + `bookFileExpiresAt` on `Project`. If a later step needs
  book context and the file has expired, transparently re-upload from the
  persisted `data/projects/<id>/book.txt` before continuing.
- **Referencing the file:** `{"type": "document", "uri": <file.uri>,
  "mime_type": <file.mimeType>}` as an `input` item — confirmed live
  (field is `uri`, not `file_uri`, which was the first, wrong guess).
- **Context chaining:** Step 1 (Style) is the interaction that includes
  the document reference; its `id` becomes `lastInteractionId`. Every
  later step passes `previous_interaction_id: lastInteractionId` and
  stores the new interaction's `id` back — confirmed live that a later
  call correctly recalls information from an earlier one without it
  being resent, and that chaining + structured output work together in
  the same call.
- **Structured output:** `response_format` is the **raw JSON Schema**
  directly (confirmed live — an OpenAI-style wrapped shape was rejected).
  `lib/validation/gemini.ts` defines the schema once with Zod and derives
  the Gemini-facing schema via `z.toJSONSchema()` (Zod v4), so there's no
  hand-duplicated copy to drift. The response is parsed and
  **re-validated with the same Zod schema** before persistence —
  malformed or out-of-bounds output (e.g. 3 characters) is rejected, not
  trusted or silently truncated.
- **Models:** text = `gemini-3.6-flash`, image = `gemini-3.1-flash-image`
  — both real, current model IDs (confirmed via `GET /v1beta/models`),
  read from env vars (`GEMINI_TEXT_MODEL`, `GEMINI_IMAGE_MODEL`), never
  hardcoded inline.
- **Portrait reuse for illustrations:** persisted portrait images are
  read from disk, base64-encoded, and passed as `{"type": "image",
  "data": ..., "mime_type": ...}` input items alongside the chapter
  prompt. This exact input shape was verified live against the text
  model (which also accepts vision input).
- **Image generation output — unverified:** every image model
  (`gemini-3.1-flash-image`, `gemini-2.5-flash-image`,
  `gemini-3.1-flash-lite-image`) returned a hard `quota exceeded ...
  limit: 0` on the free tier during verification — not transient. The
  output shape is inferred (symmetric with the verified input shape:
  `{"type": "image", "data", "mime_type"}` in the `model_output` step)
  but not confirmed against a real response. `lib/gemini/imageResponse.ts`
  isolates this behind `parseGeneratedImage()`, which validates the shape
  strictly and throws a specific, diagnosable `GeminiResponseShapeError`
  if it's wrong, rather than trusting the assumption. **Needs the
  developer to resolve the image quota (likely: enable billing) before
  Portraits/Illustrations can be exercised for real.**
- **Boundary:** all of this lives in `lib/gemini/client.ts` (raw REST calls)
  and `lib/gemini/service.ts` (the 5 pipeline-shaped functions). Route
  handlers call `service.ts` only — never construct Gemini requests inline.
  `service.ts` is the single seam mocked in tests.

---

## 6. Duplicate-call prevention & recovery

Single-process local app on SQLite ⇒ a conditional `updateMany` is an
adequate atomic claim (no Redis/locks needed, per AGENTS.md "do not
overbuild"):

```ts
const claimed = await prisma.project.updateMany({
  where: {
    id: projectId,
    currentStep: step,
    OR: [
      { stepState: { in: ["IDLE", "FAILED"] } },
      { stepState: "RUNNING", stepStartedAt: { lt: staleCutoff(now) } },
    ],
  },
  data: { stepState: "RUNNING", stepStartedAt: now, stepError: null },
});
if (claimed.count !== 1) return conflict(currentProjectState); // no Gemini call
```

- Double-click / second tab / refresh mid-step: second request's `where`
  matches nothing (`stepState` already `RUNNING` and fresh) → `count===0` →
  409 with the current running state; frontend just polls/reflects it.
- **Stuck recovery:** if the server dies mid-call, `stepState` stays
  `RUNNING` forever unless claimed again. The `OR` clause above lets a
  _user-triggered_ retry reclaim a `RUNNING` row once `stepStartedAt` is
  older than `STALE_MS` (proposed: 3 minutes, one constant for all steps —
  simple, documented, adjustable). The UI shows a distinct "This step looks
  stuck — Recover" affordance instead of a spinner once stale, computed
  from `stepStartedAt` vs. now. No automatic re-trigger — recovery always
  requires a click.
- Portraits/illustration use the same pattern at the `Character`/`Chapter`
  row level.

---

## 7. Testing strategy

Vitest + React Testing Library (AGENTS.md §6). Per the `testing` skill:

**Backend** (mock `lib/gemini/service.ts`, never call the real API):

- `lib/pipeline/state.ts` — pure unit tests: step ordering, cannot skip,
  cannot restart a completed step, stale detection.
- `lib/pipeline/run.ts` / step routes — integration tests against a real
  SQLite test DB file: character cap (2) and chapter cap (1) enforced
  server-side even with a tampered request body; concurrent duplicate
  requests → exactly one Gemini call (spy count); failed step stays
  retryable without re-running earlier steps; stale `RUNNING` becomes
  claimable, fresh `RUNNING` does not.
- Zod schemas — malformed Gemini JSON rejected, valid JSON accepted.

**Frontend** (RTL, per `ux-ui`/`testing` skills — a handful of states, not
exhaustive):

- Stepper renders done/current/pending correctly at each stage.
- Running state shows the specific step label, not bare "Loading...".
- Failed step shows error + retry action.
- Stuck-step recovery affordance appears once stale.
- New-project form validation (no title / no text-or-file).
- Empty project list vs. populated list.

**Deliberately not tested:** Gemini output _quality_, visual/CSS regression,
exact copy text — documented as such in `TESTING.md` with rationale.
_Nice-to-have if time allows:_ one mocked end-to-end happy-path integration
test through all 5 steps.

Test DB: a dedicated SQLite file reset between test runs (not the dev DB).

---

## 8. Implementation order

1. Prisma schema + client, shared `types/` (domain types, discriminated
   unions per AGENTS.md TypeScript rules).
2. Auth: session cookie helper, `/api/auth/login|logout`, login page.
3. Projects: create (paste/upload `.txt`, Zod-validated), list, detail
   shell (stepper UI, no actions wired yet). Filesystem helper for
   `book.txt`.
4. `lib/pipeline/state.ts` + unit tests (no DB, no Gemini needed yet).
5. `lib/gemini/client.ts` + `service.ts` — build against real REST docs,
   do the live curl smoke test (§5 risk flag), keep behind an interface.
6. Wire **Style** end-to-end: claim → call service → validate/persist →
   advance → UI running/error/retry/stuck states. This is the full vertical
   slice — get concurrency + recovery + UI states right once here.
7. Repeat the proven pattern for Characters (cap 2), Portraits (per-item
   progress), Chapters (cap 1), Illustrations (portrait reuse).
8. Backend integration tests for concurrency/caps/retry (can start earlier
   alongside step 6 if that reads better against the harness).
9. Frontend RTL tests for the states listed above.
10. UI polish pass against `app-demo.html` + the required-screens checklist
    in the `ux-ui` skill.
11. `README.md`, `TESTING.md` (with a real test-run output pasted in),
    `DECISIONS.md` (Decisions 1–3 below plus any that come up while
    building), `start.sh`/`test.sh`, finalize `.env.example`.

---

## Conflicts, risks, and decisions

1. ~~Notebook not yet run~~ — superseded: Gemini mechanics were verified
   live against the real REST API (§5) before `lib/gemini/client.ts` was
   written. The notebook itself still hasn't been run by either side;
   flag it if a notebook run surfaces something the live test didn't
   catch. One real gap remains: the image-generation *output* shape is
   unverified (0 free-tier quota on every image model) — isolated behind
   `lib/gemini/imageResponse.ts` with strict runtime validation.
2. **`app/` at root vs. `src/app/`** — AGENTS.md §5 diagrams a `src/` tree;
   the actual scaffold is root-level. Keeping root-level (matches what
   exists, zero-value migration).
3. **Derived `status` vs. stored `status` field** — AGENTS.md's own
   DECISIONS.md example stores `status` separately from `step_state` and
   accepts a sync cost. Deriving it instead (one less field, no sync to get
   wrong). Functionally equivalent; diverges from the example in the
   governance doc.
4. **Stale-step threshold** — one constant, 3 minutes, for all steps.
5. ~~Model IDs~~ — confirmed live via `GET /v1beta/models`:
   `gemini-3.6-flash` (text) and `gemini-3.1-flash-image` (image) both
   exist and are current, not hallucinated.
