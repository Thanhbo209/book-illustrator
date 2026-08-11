# 002 — Projects: Create, List, Detail

## Goal

Implement the assessment's project-management requirement (§4.2): a user
can create a project from a book's text (pasted or uploaded as `.txt`)
plus a title, see a list of their own projects with status, and open one
to see exactly where it is in the pipeline. This is also the vertical
slice that proves out filesystem storage (book text on disk, never in the
DB) and the pipeline-state derivation that later steps build on.

## Skills Read

- `.claude/skills/pipeline-state/SKILL.md` — separate `currentStep` /
  `stepState` rather than one ambiguous status field; informed
  `lib/pipeline/state.ts` and how `ProjectDetail.isStale` /
  `ProjectSummary.status` are derived.
- `.claude/skills/testing/SKILL.md` — prioritize pipeline correctness,
  persistence/resumability, and ownership over incidental coverage.
- `.claude/skills/ux-ui/SKILL.md` — required project-list and
  project-detail screens (title, created date, status pill, 5-step
  progress indicator; full book text readable at any pipeline stage).
- `AGENTS.md` §7 (API Route Rules), §9 (file uploads, filesystem paths) —
  ownership checks, action-style endpoints, never trusting a client
  filename as a path.

## Existing Code Inspected

- `lib/storage/db.ts` — existing Prisma client singleton, reused as-is.
- `prisma/schema.prisma` — `Project`, `Character`, `Chapter` models
  already defined (from the plan) with `currentStep`/`stepState` kept
  separate per the skill above.
- `lib/auth/session.ts` — `getCurrentUser()`, reused for ownership on every
  route and page.
- `types/domain.ts`, `types/api.ts`, `types/pipeline.ts` — shared DTOs
  already defined; extended rather than duplicated.
- `components/ui/*` — shadcn primitives (card, input, textarea, badge,
  button) reused throughout.
- `app-demo.html` — skimmed for the project-list/detail scope (status
  pill, 5-step progress indicator, empty state).

## Decisions or Assumptions

- **`lib/pipeline/state.ts` built in full now**, not stubbed — the plan
  had it as a later step, but `ProjectDetail.isStale` and the derived
  `ProjectStatus` needed real logic immediately, and stubbing it would
  just mean redoing the same small pure-function module days later.
- **`ProjectStatus` is derived, never stored** (`DRAFT` = `currentStep ===
  STYLE && stepState === IDLE`; `DONE` = `currentStep === DONE`; else
  `IN_PROGRESS`) — one less field to keep in sync, at the cost of
  diverging from the two-field pattern AGENTS.md's own DECISIONS.md
  example illustrates.
- **File-upload detection uses `instanceof File`,** not duck-typing. I
  initially changed this to duck-typing after a Vitest test showed
  `instanceof File` failing under jsdom (filename came back as `"blob"`).
  You overrode that — the real bug was the test running under the wrong
  Vitest environment, not the production check. Fixing the test
  environment (`@vitest-environment node` on backend test files) resolved
  it with zero production code changes, and `instanceof File` still passes
  every test. Recorded in `DECISIONS.md`.
- **Server Components call the storage layer directly**
  (`getProjectForUser`, `listProjectsForUser`), not via `fetch` to our own
  API routes — avoids a pointless self-network-hop for SSR. The API routes
  exist for client-side use, which the running-step polling in later steps
  will need.
- **A project that exists but belongs to someone else returns 404, not
  403** — identical to "doesn't exist" — no signal is given to a caller
  that the id is otherwise valid.

## Files Changed

- `lib/pipeline/state.ts` (+ `state.test.ts`) — `isStale`, `canClaim`,
  `nextStep`, `deriveProjectStatus`.
- `lib/storage/files.ts` — book-text and future image path helpers, always
  built from a server-controlled `projectId` + fixed order.
- `lib/validation/project.ts` — title/book-text Zod schemas + multipart
  form parsing (`parseCreateProjectForm`).
- `lib/storage/projects.ts` (+ `projects.test.ts`) — `createProject`,
  `listProjectsForUser`, `getProjectForUser`, DTO mappers.
- `app/api/projects/route.ts` (+ test), `app/api/projects/[projectId]/route.ts`
  (+ test) — GET/POST with session-derived ownership.
- `components/pipeline/Stepper.tsx`, `components/projects/{ProjectCard,ProjectList,NewProjectForm}.tsx`,
  `components/identity/SignOutButton.tsx`.
- `app/projects/layout.tsx` (auth guard + header), `app/projects/page.tsx`,
  `app/projects/new/page.tsx`, `app/projects/[projectId]/page.tsx`.
- `app/page.tsx` (root redirect based on session), `app/layout.tsx`
  (metadata).

## Implementation Requirements

- Create a project from a title + pasted text **or** uploaded `.txt` (not
  both required); uploaded file takes priority if both are present.
- List only the current user's projects, each with title, created date,
  status, and 5-step progress.
- Opening a project shows its true pipeline state and the full book text.
- `.txt`-only uploads, 5MB cap, filename never used as a filesystem path.

## Security Requirements

- Every project route/page derives the user from the session cookie —
  never a client-supplied id.
- Ownership enforced on every read: `getProjectForUser(projectId, userId)`
  returns `null` for both "not found" and "not yours."
- Filesystem paths for book text (and, later, images) are always
  `data/projects/<server-generated-id>/...` — never built from request
  parameters or the uploaded filename.

## Acceptance Criteria

- New project (pasted text) is created, persisted to
  `data/projects/<id>/book.txt`, and appears in the owner's list as
  `DRAFT`.
- New project (uploaded `.txt`) works the same way; non-`.txt` uploads are
  rejected.
- A request with neither pasted text nor a file is rejected before
  touching the database.
- A second user cannot see or open the first user's project (404).
- Reopening a project after "restart" (fresh process) shows the same
  persisted state — proven indirectly here since state lives in
  SQLite/disk, not memory; full resumability-after-crash is exercised
  once step execution exists.

## Checks Run

- `npm run lint` — clean.
- `npx tsc --noEmit` — clean.
- `npm test` — 32/32 passed across 6 files (session, login route, pipeline
  state, project storage, both project API routes).
- `next build` — not run this round; deferred to the next milestone.

## Exact Manual Test Steps

1. `npm run dev`.
2. Log in, land on `/projects` with the empty state.
3. `/projects/new` → paste some text, give it a title, submit → redirected
   to `/projects/:id` with the Style step current and the book text
   visible.
4. Confirm `data/projects/<id>/book.txt` exists on disk with the pasted
   content.
5. Go back to `/projects` → the new project appears with a "Draft" badge
   and the same 5-step indicator.
6. In a second browser/incognito session, log in as a different user and
   try to open the first project's URL directly → 404.
7. Visit `/projects` while logged out → redirected to `/login`.

Verified manually via curl against the real dev server (not just the
automated tests) before writing this artifact: signup, project creation,
disk persistence, detail/list rendering, unauthenticated redirect, and
cross-user 404 all confirmed live.

## UI Notes

- Status pill uses the shadcn `Badge` variants already installed
  (`outline` for Draft, `default` for In Progress, `secondary` for Done)
  rather than inventing new colors.
- `Stepper` renders all 5 steps with done/current/pending states and a
  connecting line; reused at both card scale (project list) and full
  scale (project detail).
- Empty state (no projects) follows the `ux-ui` skill's requirement:
  message + a clear "New project" action, not a bare blank screen.
- New-project form uses a plain two-button toggle (not a new Tabs
  primitive) between "Paste text" and "Upload .txt" — avoids adding a
  dependency for something two styled buttons already do.
- Not yet compared pixel-for-pixel against `app-demo.html` — deferred to
  the dedicated polish pass (`docs/plan.md`, implementation order step
  10).
