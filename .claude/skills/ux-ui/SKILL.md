# UI/UX Skill

## Purpose

Build a polished, production-quality interface for the Gradion Book
Illustration Pipeline.

The supplied `app-demo.html` defines the minimum UI scope and behavior.

The assessment specification is the source of truth.

Do not invent additional product features unless explicitly approved.

Do not overbuild.

---

# Reference

Before implementing UI:

1. Read `docs/gradion-assessment-intern-software-engineer.md`.
2. Inspect `app-demo.html`.
3. Compare the current implementation against both.
4. Follow the assessment requirements over the demo when they differ.

The demo is a reference, not the backend contract.

The demo uses fake timings and local browser state.

Do NOT copy:

- `localStorage` pipeline state
- fake timing logic
- browser-only duplicate-call protection
- fake stuck-step thresholds

The real application state must come from the backend.

---

# Required Screens

## 1. Identity

Must support:

- name
- email
- validation
- submit action
- loading state
- error state

Behavior:

- existing email → load existing user/projects
- new email → create user
- no password
- no OAuth

---

## 2. Project List

Each project must show:

- title
- created date
- current status
- five-step progress indicator

Required statuses:

- Draft
- In Progress
- Done

Also implement:

- empty state
- create project action
- loading state
- error state

Only show projects belonging to the current user.

---

## 3. New Project

Must support:

- project title
- `.txt` upload
- pasted book text
- validation
- submit/loading state
- validation errors
- API errors

The user must be able to use either:

- uploaded `.txt`
- pasted text

Do not require both.

---

# Project Detail

Show:

- project title
- created date
- creator/user
- full book text
- five-step pipeline stepper
- current step
- generated style
- characters
- portraits
- chapters
- illustrations

The book text must remain readable at every pipeline stage.

---

# Pipeline Stepper

Display all five steps:

1. Style
2. Characters
3. Portraits
4. Chapters
5. Illustrations

Each step must visually communicate:

- completed
- current
- pending

The UI must never allow a user to start a future step.

Only the current step can be executed.

---

# Current Step Action

There must be one clear primary action for the current step.

Examples:

- Generate Style
- Generate Characters
- Generate Portraits
- Generate Chapter
- Generate Illustration

Step 1 additionally supports:

- optional user-provided art style

Do not expose actions for future steps.

Completed steps must not be presented as needing regeneration.

---

# Running State

Every Gemini operation can take 10–30+ seconds.

Never display only:

"Loading..."

The UI must identify the actual operation.

Examples:

- "Generating art style..."
- "Generating characters..."
- "Generating character portraits..."
- "Generating chapter..."
- "Generating illustration..."

The action button must become disabled while the step is running.

---

# Per-Item Image Progress

Portrait generation must communicate progress per character.

Example:

```text
Character A     ✓ Generated
Character B     Generating...
```
