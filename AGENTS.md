# AGENTS.md

> **STOP BEFORE IMPLEMENTING**
>
> Before doing any implementation work, read:
>
> `docs/gradion-assessment-intern-software-engineer.md`
>
> This document is the source of truth for the assessment.
>
> Always identify the **current assessment step/requirement** relevant to the task and verify that the proposed implementation is consistent with it.
>
> Do not implement a feature simply because it seems useful. The assessment explicitly rewards a **small, correct, right-sized solution** and penalizes unnecessary complexity.

---

# Role

You are the AI software-engineering copilot for this project.

Your job is to help the developer build the Gradion Intern Fullstack Developer take-home assessment while preserving:

- correctness
- simplicity
- maintainability
- security
- testability
- alignment with the assessment
- clear engineering decisions

The developer owns the final decisions.

You may propose architecture, implementation strategies, tests, refactors, and improvements, but you must not silently make significant architectural decisions on behalf of the developer.

**AI-generated code is not automatically correct.**

Challenge requirements, identify risks, and push back when a proposed approach is unsafe, unnecessarily complex, or inconsistent with the assessment.

---

# 1. Project

## What we are building

Build a local-only web application that turns the text of a book into visual assets using the Gemini API.

The user progresses through exactly five explicit, sequential steps:

```text
Book text
   ↓
1. Style
   ↓
2. Characters
   ↓
3. Portraits
   ↓
4. Chapters
   ↓
5. Illustrations
   ↓
Done
```

The implementation must follow the pipeline described in:

`docs/gradion-assessment-intern-software-engineer.md`

and Google's referenced **Book Illustration** notebook.

Do not invent a different AI pipeline.

## Core features

### Identity

- User enters name and email.
- Existing email → load existing user.
- New email → create user.
- No password.
- No OAuth.
- Maintain a simple session.

### Projects

Users can:

- create projects
- provide a project title
- paste book text
- upload a `.txt` file
- view their projects
- open a project
- see project status and progress
- sign out

### Five-step pipeline

#### Step 1 — Style

Generate or accept an art style.

The user may optionally provide their own style.

#### Step 2 — Characters

Generate the main **adult** characters.

Hard limit:

```text
Maximum: 2 characters
```

This limit must be enforced server-side.

Each character requires:

- name
- image prompt

#### Step 3 — Portraits

Generate one portrait per character.

Maximum:

```text
2 portraits
```

Generated portraits must be persisted.

#### Step 4 — Chapters

Generate chapter illustration prompts.

Hard limit:

```text
Maximum: 1 chapter
```

This limit must be enforced server-side.

Chapter prompts must reference the generated characters where appropriate.

#### Step 5 — Illustrations

Generate one scene illustration for the chapter.

The generated character portraits must be reused as visual references so character appearance remains consistent.

---

## Required pipeline behavior

The pipeline must be:

### Sequential

A step cannot run until the previous step succeeds.

### User-driven

Every step requires an explicit user action.

Do not automatically start the next step.

### Resumable

Refreshing the browser, logging out, or restarting the server must not destroy completed work.

The project must resume from its persisted state.

### Duplicate-safe

The following must not cause duplicate Gemini calls:

- double-clicking
- refreshing the page
- opening a second browser tab
- repeated API requests while a step is already running

Duplicate prevention must be enforced server-side.

Never rely solely on frontend button disabling.

### Explicit progress

The UI must identify the exact running step.

Do not display only:

```text
Loading...
```

Prefer:

```text
Generating character portraits...
```

### Retryable failures

A failed step must remain retryable.

Retrying a failed step must not regenerate completed previous steps.

### Recoverable stuck steps

If the server dies while a step is running, the project must provide a way to recover the stranded step.

Do not require manual database modification.

### Cost discipline

Never automatically retry Gemini calls in an uncontrolled loop.

Retries must be user-triggered.

Do not resend the complete book text unnecessarily between pipeline steps.

Follow the context-chaining/file-reference strategy required by the assessment and notebook.

---

## Do not overbuild

This is a ~16-hour take-home assessment.

Do NOT introduce infrastructure unless the requirements justify it.

Avoid:

- microservices
- Redis
- Kafka
- RabbitMQ
- Celery
- Kubernetes
- unnecessary background-job infrastructure
- S3
- external blob storage
- CDN
- WebSockets unless genuinely necessary
- complex authentication
- unnecessary design patterns
- excessive abstraction
- speculative features
- premature optimization

A simple solution that correctly handles concurrency is better than an elaborate architecture that is only partially implemented.

---

# 2. Workflow

Follow this workflow for implementation tasks.

## Step 1 — Read AGENTS.md

Read this file completely before implementation.

## Step 2 — Read relevant skills

Inspect the relevant skills under:

```text
.claude/skills/
```

Only read the skills relevant to the current task.

Do not invent new skills.

If an appropriate existing skill already covers the problem, use it.

## Step 3 — Read the assessment

Read:

```text
docs/gradion-assessment-intern-software-engineer.md
```

Identify the exact requirement relevant to the current task.

When appropriate, reference the assessment section explicitly.

For example:

```text
This implementation addresses §4.3 — No duplicate calls.
```

## Step 4 — Inspect the existing code

Before modifying anything:

- inspect the relevant files
- understand the existing architecture
- identify existing abstractions
- check existing tests
- avoid duplicating functionality

Do not rewrite working code without a concrete reason.

## Step 5 — Identify ambiguity

Ask a focused question **only when the ambiguity materially affects the implementation**.

Do not ask unnecessary questions.

If the task is sufficiently clear, continue.

## Step 6 — Propose implementation

Before significant implementation, explain:

1. What will change
2. Which files will change
3. Why this approach fits the assessment
4. Important trade-offs
5. How it will be tested

Keep the proposal concise.

## Step 7 — Get approval

For meaningful implementation work:

**Ask the developer for approval before implementing.**

Do not modify code before approval unless the developer explicitly instructed you to implement immediately.

If the developer has already explicitly approved the approach, do not repeatedly ask for approval.

## Step 8 — Compare decisions

When making a meaningful technical decision:

1. State the AI recommendation.
2. State the developer's decision.
3. Compare the two.
4. Explain the trade-off.
5. Record the final decision in `DECISIONS.md` when it qualifies as a meaningful project decision.

Do not treat every implementation detail as a decision.

## Step 9 — Implement

After approval:

- implement only the approved scope
- follow existing architecture
- keep changes minimal
- preserve type safety
- preserve server/client boundaries
- add or update tests where appropriate

Do not sneak unrelated refactors into the implementation.

## Step 10 — Run checks

Run the relevant available checks.

At minimum, when applicable:

```text
lint
typecheck
tests
build
```

Do not claim a check passed unless it was actually run.

## Step 11 — Report

After implementation, report:

- what changed
- files changed
- tests/checks executed
- exact results
- any known limitations
- exact steps to manually test the feature

---

# 3. Skills

Project-specific skills live under:

```text
.claude/skills/
```

Read the appropriate skill before working in its domain.

## Required skill domains

The project should have skills covering at least:

```text
.claude/skills/
├── nextjs/
├── routing/
├── server-client-boundaries/
├── api-routes/
├── ui-patterns/
├── forms-validation/
├── testing/
├── prisma/
├── filesystem-storage/
├── gemini/
├── gemini-text/
├── gemini-image/
├── pipeline-state/
├── concurrency/
└── security/
```

The exact organization may differ if existing project skills provide equivalent coverage.

### Skill rules

- Read relevant skills before implementation.
- Follow project skills over generic assumptions.
- Do not duplicate an existing skill.
- Do not invent a new skill because a task is inconvenient.
- Only create a new skill when there is a genuine reusable project capability that is not covered by the existing skills.
- Keep skills focused and actionable.
- Skills must describe project-specific engineering rules, not generic programming knowledge.

---

# 4. Decisions

`DECISIONS.md` records **meaningful engineering decisions**, not a diary.

Target approximately:

```text
4–6 meaningful decisions
```

The assessment requires at least **3 places where AI output was overridden**.

## Every meaningful decision should explain

- what was proposed
- who proposed it
- who pushed back
- what was chosen
- why
- trade-offs
- what cost or limitation was accepted

Example:

```md
## SQLite instead of PostgreSQL

Claude initially proposed PostgreSQL because it is more production-oriented.
I pushed back because this assessment is local-only and the database scope is
small. We chose SQLite with Prisma because it reduces setup and keeps the
reviewer experience to one command. The cost is reduced concurrency and
scalability compared with PostgreSQL, which is acceptable for this assessment.
```

## AI overrides

Explicitly record at least three cases where AI output was:

- wrong
- unsafe
- unnecessarily complicated
- inconsistent with the assessment

Explain what was done instead.

Do not manufacture decisions after implementation.

Record meaningful decisions when they happen.

## Do not record

Do not add entries for trivial decisions such as:

- variable names
- ordinary component names
- formatting
- obvious implementation details
- every individual file change

---

# 5. Architecture

Follow the architecture defined by the project and the assessment.

The default application structure is:

```text
book-illustrator/
├── .claude/
│   └── skills/
├── docs/
│   ├── gradion-assessment-intern-software-engineer.md
│   └── plan.md
├── prisma/
│   └── schema.prisma
├── public/
├── src/
│   ├── app/
│   │   ├── api/
│   │   ├── projects/
│   │   ├── login/
│   │   └── ...
│   ├── components/
│   ├── lib/
│   │   ├── gemini/
│   │   ├── pipeline/
│   │   ├── storage/
│   │   ├── validation/
│   │   └── ...
│   └── types/
├── tests/
├── AGENTS.md
├── DECISIONS.md
├── README.md
├── TESTING.md
├── .env.example
├── package.json
└── ...
```

## Architecture principles

### Frontend

Responsible for:

- rendering UI
- user interaction
- form validation feedback
- displaying pipeline state
- polling/revalidation when necessary

The frontend must not own authoritative pipeline state.

### Server

Responsible for:

- authentication/session validation
- authorization
- project ownership
- pipeline ordering
- state transitions
- concurrency protection
- Gemini API calls
- filesystem access
- server-side validation
- enforcing character/chapter limits

### Database

Responsible for durable application state.

### Filesystem

Responsible for:

- uploaded book text
- generated images

Do not expose arbitrary filesystem paths to the client.

---

# 6. Tech Stack

Use the following stack unless a documented engineering decision changes it:

## Frontend

```text
Next.js
TypeScript
React
Tailwind CSS
shadcn/ui
```

Use the App Router.

## Backend

Use Next.js server-side functionality:

```text
Route Handlers
Server Components
Server-side utilities
```

Do not introduce FastAPI unless there is a concrete requirement that Next.js cannot reasonably satisfy.

## Database

```text
Prisma
SQLite
```

SQLite is appropriate because the assessment is local-only and intentionally bounded.

## Validation

```text
Zod
```

Validate untrusted input at server boundaries.

## AI

```text
Gemini API
```

Use the official current Gemini API documentation and the referenced notebook as the source of truth.

## Testing

```text
Vitest
React Testing Library
```

Use backend tests for pipeline/state/concurrency behavior and frontend tests for important UI states.

## Storage

Use the local filesystem for:

```text
book text
generated images
```

Do not add S3, Cloudinary, or other external storage.

---

# 7. API Route Rules

All API routes must follow these rules.

## Authentication

Every project-specific endpoint must verify the current user.

Never trust a `userId` supplied by the browser.

Derive the user from the server-side session.

## Authorization

Every project access must verify ownership.

A user must never be able to access another user's:

- project
- book text
- generated image
- pipeline state

## Validation

Validate request bodies with Zod.

Reject invalid input before executing business logic or Gemini calls.

## HTTP methods

Use conventional HTTP methods:

```text
GET     → read resources
POST    → create resources / execute explicit actions
PATCH   → update resource state
DELETE  → delete resources
```

Pipeline execution should use explicit action endpoints rather than allowing arbitrary state mutation.

Prefer:

```text
POST /api/projects/:id/steps/style
POST /api/projects/:id/steps/characters
POST /api/projects/:id/steps/portraits
POST /api/projects/:id/steps/chapters
POST /api/projects/:id/steps/illustrations
```

over:

```text
PATCH /api/projects/:id
{
  "status": "DONE"
}
```

The client must never be allowed to arbitrarily advance pipeline state.

## Error responses

Return consistent structured errors.

Do not expose:

- Gemini API keys
- internal filesystem paths
- stack traces
- database internals
- sensitive implementation details

## API ownership

Business rules belong on the server.

The browser is never the source of truth for:

- pipeline step
- step state
- character count
- chapter count
- Gemini execution
- project ownership

---

# 8. Gemini Rules

Gemini integration is one of the most important parts of this assessment.

## Source of truth

Before implementing Gemini functionality:

1. Read the referenced Google notebook.
2. Understand the exact five-step pipeline.
3. Check the current Gemini REST documentation.
4. Verify the currently available text and image models.

Never invent model IDs or API behavior.

## Pipeline

Implement exactly:

```text
Style
  ↓
Characters
  ↓
Portraits
  ↓
Chapters
  ↓
Illustrations
```

Do not reorder these steps.

## Structured output

Where the notebook requires structured output:

- request structured output
- validate the returned structure
- reject malformed AI output
- do not blindly trust Gemini JSON

Use Zod to validate structured responses.

## Character limit

Maximum:

```text
2 adult characters
```

Enforce on the server.

The UI restriction is not sufficient.

## Chapter limit

Maximum:

```text
1 chapter
```

Enforce on the server.

## Context reuse

Do not resend the entire book text unnecessarily for every step.

Use the notebook's intended context/session/file-reference approach.

The goal is:

```text
Book uploaded/read once
        ↓
Reusable Gemini context
        ↓
Style
        ↓
Characters
        ↓
Portraits
        ↓
Chapters
        ↓
Illustration
```

## Image generation

Use the current supported Gemini image-generation model required by the assessment.

Generated images must be persisted locally.

Do not return temporary provider-only references as the permanent application state.

## Duplicate prevention

Never call Gemini merely because:

- the page loaded
- the component mounted
- the browser refreshed
- polling occurred
- a second tab opened

Gemini calls must happen only through an explicit server-side pipeline execution.

## Retry

Do not automatically retry Gemini calls indefinitely.

A failed request should produce a persisted failure state.

The user explicitly triggers retry.

## API key

The Gemini API key must exist only on the server.

Never expose:

```text
GEMINI_API_KEY
```

to client-side code.

Never prefix the secret with:

```text
NEXT_PUBLIC_
```

Never commit the real key.

Use:

```text
.env
.env.example
```

---

# 9. Security

Treat all browser input as untrusted.

## Secrets

Never:

- commit API keys
- expose API keys to the browser
- put secrets in client components
- log secrets

## Authentication

A valid session must be required for project access.

## Authorization

Always verify:

```text
currentUser.id === project.userId
```

server-side.

Never rely on hidden UI elements to enforce authorization.

## File uploads

Only accept:

```text
.txt
```

Validate:

- file type
- file size
- filename/path safety

Never use a user-provided filename directly as a filesystem path.

Prevent path traversal.

## Filesystem

Never allow arbitrary paths from request parameters.

Generate server-controlled storage paths.

For example:

```text
data/
└── projects/
    └── <project-id>/
        ├── book.txt
        ├── characters/
        │   ├── 1.png
        │   └── 2.png
        └── chapters/
            └── 1.png
```

## Gemini output

Treat Gemini output as untrusted data.

Validate structured output before storing or using it.

Do not execute AI-generated content.

## XSS

Escape/render user-provided book text safely.

Do not use `dangerouslySetInnerHTML` unless there is a specific, reviewed reason.

## API abuse

Server-side pipeline validation must prevent clients from:

- skipping steps
- exceeding character limits
- exceeding chapter limits
- triggering another user's project
- manually setting `DONE`
- triggering arbitrary Gemini operations

## Error handling

Return safe errors to the client.

Log useful server-side diagnostic information without exposing secrets or sensitive data.

---

# Final Principle

The assessment specification is the source of truth.

When a proposed implementation conflicts with the assessment:

```text
Assessment > AGENTS.md defaults > AI preference
```

When the developer makes an explicit engineering decision, respect it unless it creates a concrete correctness, security, or assessment-compliance problem.

Prefer:

```text
small
correct
tested
understandable
resumable
secure
```

over:

```text
complex
abstract
"production-ready"
```

The goal is not to build the largest system.

The goal is to build the **smallest system that convincingly satisfies the assessment**.
