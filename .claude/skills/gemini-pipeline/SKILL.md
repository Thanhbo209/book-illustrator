# Gemini Book Illustration Pipeline

## Purpose

Implement the exact five-step Gemini book illustration pipeline required
by the Gradion assessment.

The Google Gemini cookbook notebook is the authoritative reference for
the pipeline mechanics.

Do not invent a simplified or alternative pipeline merely because it is
easier to implement.

---

# Source of Truth

Before implementing Gemini pipeline behavior:

1. Read the assessment:
   `docs/gradion-assessment-intern-software-engineer.md`

2. Read the Google cookbook notebook:
   "Illustrate a book: The Wind in the Willows".
   Here's the notebook link:
   > https://colab.research.google.com/github/google-gemini/cookbook/blob/main/examples/Book_illustration.ipynb
3. Identify how the notebook performs:
   - file/text upload
   - context reuse
   - conversation/session chaining
   - structured output
   - image generation
   - image/reference reuse

4. Read the relevant Gemini REST/API documentation.

5. Record the selected implementation approach in:
   `docs/plan.md`

Do not guess how the notebook chains context.

If the notebook and an implementation shortcut differ,
follow the notebook.

---

# Required Pipeline

The application must implement exactly these five user-triggered steps.

STYLE → CHARACTERS → PORTRAITS → CHAPTERS → ILLUSTRATIONS

Every step must succeed before the next step can start.

No automatic progression.

---

## Step 1 — Style

### Input

- book text
- optional user-provided style

### Output

- selected/generated art style

If the user supplies a style:

- preserve the user's intent
- do not unnecessarily replace it with a generated style

If no style is supplied:

- Gemini generates an appropriate art style based on the book content

Persist the resulting style before marking STYLE complete.

---

## Step 2 — Characters

### Input

- existing book context
- generated/selected style

### Output

Structured character list.

### Rules

- adult characters only
- maximum 2 characters
- each character must contain:
  - name
  - image prompt

The maximum of 2 characters is a server-side invariant.

Never rely only on frontend validation.

### Structured Output

Validate Gemini's response before persistence.

Never blindly trust model-generated JSON.

---

## Step 3 — Portraits

Generate one portrait for each persisted character.

### Input

- character information
- character image prompt
- established style
- required notebook context

### Requirements

- preserve established style
- preserve character identity
- persist each generated image before marking that character complete

Portrait generation must support incremental progress.

For example:

Character 1 complete
→ Character 2 still generating

The UI must be able to represent this state.

Do not treat the entire portrait step as one opaque operation.

---

## Step 4 — Chapters

### Input

- existing book context
- established style
- generated character information
- required notebook context

### Output

Structured chapter list.

### Rules

- maximum 1 chapter
- chapter prompt should reference generated characters where appropriate
- validate Gemini output before persistence
- enforce the maximum server-side

Persist the chapter before marking CHAPTERS complete.

---

## Step 5 — Illustrations

Generate one scene illustration for each persisted chapter.

### Input

- chapter prompt
- established style
- character information
- generated character portraits
- required notebook context

Character portraits must be reused as visual references.

The purpose is to maintain character consistency between:

CHARACTER → PORTRAIT → CHAPTER ILLUSTRATION

Persist the generated illustration before marking ILLUSTRATIONS complete.

---

# Context Reuse

The book text must not be unnecessarily sent in full to Gemini
for every step.

Use the context/session/file reuse mechanism established by the
reference notebook.

The implementation must preserve enough Gemini context for later steps
to build on earlier results.

Do not independently summarize or resend the entire book at every step
unless the notebook explicitly requires it.

Document the selected mechanism in:

`docs/plan.md`

Also document the final decision in:

`DECISIONS.md`

---

# Structured Output

Whenever the notebook requires structured output:

1. Define an explicit schema.
2. Request structured output from Gemini.
3. Parse the response.
4. Validate the response.
5. Enforce application limits.
6. Persist only validated data.

Never:

- blindly `JSON.parse()` arbitrary model text
- assume model output is valid
- persist malformed structured data
- rely exclusively on frontend validation

Prefer schema validation using the project's established validation
library.

---

# Image Generation

Image generation is expensive and may take significantly longer than
text generation.

Every image generation operation must have persisted server-side state.

Never:

- automatically retry Gemini indefinitely
- retry a Gemini request because of a browser refresh
- regenerate a successfully persisted image
- generate the same image because two requests arrived concurrently
- regenerate completed portraits when generating the chapter illustration

The server must determine whether an image generation operation is
already running or already completed.

---

# Concurrency

Gemini generation must be protected against duplicate execution.

The following must not create duplicate Gemini calls:

- double-clicking the Generate button
- refreshing the browser
- opening the project in a second tab
- sending concurrent requests
- reopening a project while generation is running

The server must own the generation state.

The frontend is not a concurrency boundary.

---

# Pipeline State

Pipeline state must distinguish:

- completed progress
- currently running step
- failed step
- recoverable/stale running step

Do not model the entire pipeline using a single ambiguous status field
if that prevents the application from representing these states correctly.

A persisted running operation must have enough information to determine
whether it can safely be retried.

---

# Failure Handling

If Gemini fails:

- preserve all completed work
- persist the failure state
- keep the project usable
- allow the user to retry the failed step
- retry only the failed/current step
- never reset successful previous steps
- never automatically retry in a loop

A Gemini failure must not corrupt the project.

---

# Stuck Operations

A step may remain in RUNNING if the server dies during a Gemini request.

The application must provide a recovery path.

Users must never need to manually modify storage to recover a project.

A stale operation must eventually become retryable according to the
application's documented recovery policy.

Do not automatically rerun the Gemini request merely because an operation
became stale.

Recovery is user-triggered.

---

# Model Configuration

Do not scatter Gemini model IDs throughout the codebase.

Use environment configuration:

GEMINI_API_KEY
GEMINI_TEXT_MODEL
GEMINI_IMAGE_MODEL

Never commit real credentials.

Provide `.env.example`.

Before implementation, verify that the selected model IDs are currently
supported by the Gemini API.

Record:

- selected text model
- selected image model
- why they were selected
- relevant limitations

in `DECISIONS.md`.

---

# Gemini Service Boundary

Gemini API calls must remain server-side.

React components must never call Gemini directly.

Keep Gemini-specific request construction and response handling inside
a dedicated server-side service/module.

Pipeline orchestration should call the Gemini service rather than
embedding HTTP/API logic directly inside route handlers.

---

# Testing

Automated tests must not call the real Gemini API.

Mock the Gemini service.

Mocks must support:

- successful text generation
- valid structured output
- malformed structured output
- Gemini API failure
- image generation failure
- slow generation
- concurrent invocation

Tests must verify application behavior, not Gemini model quality.

At minimum, test:

- correct step ordering
- character cap
- chapter cap
- structured-output validation
- retry behavior
- duplicate-call prevention
- stale-step recovery
- preservation of completed results

---

# Scope Control

Implement only the five required pipeline steps.

Do NOT implement:

- Veo animation
- Lyria music
- TTS narration
- media mixing
- audiobook generation

Do not add additional Gemini features unless explicitly requested.

The assessment rewards a reliable, right-sized implementation,
not feature count.
