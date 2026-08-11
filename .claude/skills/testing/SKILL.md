# Testing Skill

## Purpose

Keep AI-generated implementation honest through executable tests.

Tests should focus on behavior, correctness, failure modes, and assessment-critical risks — not arbitrary coverage numbers.

Do not write tests merely to increase coverage.

---

## Core Rule

Every test must verify behavior that matters to the assessment.

Prioritize:

1. Pipeline correctness
2. Persistence and resumability
3. Concurrency / duplicate-call prevention
4. Retry and failure recovery
5. Frontend user-visible states

Do not test implementation details when behavior can be tested instead.

---

# Backend Testing

The backend tests must cover the pipeline state machine and its persistence behavior.

## Step Ordering

Required cases:

1. STYLE can start on a new project.
2. CHARACTERS cannot start before STYLE succeeds.
3. PORTRAITS cannot start before CHARACTERS succeeds.
4. CHAPTERS cannot start before PORTRAITS succeeds.
5. ILLUSTRATIONS cannot start before CHAPTERS succeeds.
6. A step cannot be skipped.
7. A step cannot be started twice after it has completed.

---

## Pipeline Progress

Test that pipeline state accurately represents progress.

Required cases:

1. A new project starts at the first step.
2. A running step is persisted as `RUNNING`.
3. A successful step is persisted as completed.
4. The next step becomes the current step after success.
5. A failed step remains retryable.
6. Previously completed steps remain completed after a later failure.
7. Project status correctly reflects Draft / In Progress / Done.

---

## Resumability

Test that persisted state survives process/request boundaries.

Required cases:

1. Reopening a project returns its persisted pipeline state.
2. Previously generated results are not lost.
3. A project does not restart from STYLE after reload.
4. A completed step is never regenerated when the project is reopened.
5. A stranded `RUNNING` step can be detected and recovered.

---

## Retry Behavior

Required cases:

1. A failed step can be retried.
2. Retrying only executes the failed/current step.
3. Successful previous steps are not executed again.
4. A retry failure leaves the project in a usable retryable state.
5. No automatic retry loop exists.

---

## Concurrency / Duplicate Execution

This is a critical requirement.

Test that concurrent requests for the same project and step cannot trigger multiple Gemini calls.

Required cases:

1. Two simultaneous requests for the same step result in only one Gemini execution.
2. A second request observes the existing `RUNNING` state.
3. A completed step cannot be started again concurrently.
4. Concurrent requests for different projects do not corrupt each other's state.

Use mocks/spies to verify the number of Gemini calls.

---

## Hard Limits

The assessment limits must be enforced server-side.

Required cases:

1. Character generation never accepts or persists more than 2 characters.
2. Chapter generation never accepts or persists more than 1 chapter.
3. Client-side validation must not be the only protection for these limits.

---

# Gemini Mocking

Automated tests must never call the real Gemini API.

Mock the Gemini client/service.

Tests should be able to simulate:

- successful text generation
- valid structured output
- malformed structured output
- API failure
- image generation failure
- slow response
- duplicate/concurrent invocation

Use controlled mocks so reliability behavior is deterministic.

---

# Frontend Testing

Test important user-visible behavior rather than every component or visual detail.

Required states:

- empty project list
- project list with projects
- loading project
- project at each pipeline stage
- running pipeline step
- correct running-step label
- disabled action while running
- failed pipeline step
- retry action
- stuck-step recovery
- completed project
- stepper showing done/current/pending
- generated character/portrait state
- generated chapter/illustration state
- identity validation
- new-project validation

Do not test:

- exact CSS values
- animations
- every static text element
- implementation details of components

unless they affect user-visible behavior or accessibility.

---

# Integration Testing

If time permits, add one integration test covering:

STYLE → CHARACTERS → PORTRAITS → CHAPTERS → ILLUSTRATIONS

Use a mocked Gemini service.

The integration test must verify:

- correct step ordering
- persisted results
- correct state transitions
- character/chapter caps
- final DONE state

Do not call the real Gemini API.

---

# Test Report

After implementation:

1. Run the actual project test command.
2. Capture the real output.
3. Record the result in `TESTING.md`.
4. Include failed tests if they occurred and were subsequently fixed.
5. Never manually claim tests passed without running them.

The test report must represent an actual test run.

---

# TESTING.md Requirements

`TESTING.md` must explain:

- What backend behavior is tested.
- What frontend behavior is tested.
- What is deliberately not tested.
- Why those areas were excluded.
- How Gemini is mocked.
- The actual test command.
- The actual test output.

Do not invent coverage numbers or test results.

---

# AI Implementation Rule

When asking an AI coding agent to implement functionality:

1. Ask it to write or update the relevant tests first when practical.
2. Run the tests after implementation.
3. Inspect failures before accepting the implementation.
4. Do not allow the AI to declare a feature complete solely because the code looks correct.
5. Use test failures and manual UAT as the source of truth.

The human owns the final judgment.
