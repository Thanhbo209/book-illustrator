---

# 5. Testing skill

```md
# Testing Skill

## Purpose

Keep AI-generated implementation honest through executable tests.

Tests should focus on behavior and risk, not arbitrary coverage numbers.

---

## Backend Priority

Test the pipeline state machine first.

Required cases:

1. STYLE can start on a new project.
2. CHARACTERS cannot start before STYLE.
3. PORTRAITS cannot start before CHARACTERS.
4. CHAPTERS cannot start before PORTRAITS.
5. ILLUSTRATIONS cannot start before CHAPTERS.
6. Maximum 2 characters is enforced.
7. Maximum 1 chapter is enforced.
8. Failed steps are retryable.
9. Completed steps are not rerun.
10. Concurrent requests cannot start the same step twice.
11. Stale running steps can be recovered.

---

## Gemini Mocking

Do not call the real Gemini API in automated tests.

Mock the Gemini client.

Tests should control:

- success
- malformed structured output
- API failure
- slow response

This allows reliability behavior to be tested deterministically.

---

## Frontend Priority

Test important user-visible states:

- empty project list
- loading project
- running pipeline step
- failed pipeline step
- retry button
- completed project

Do not test every visual detail.

---

## Test Report

After implementation:

1. Run the actual test command.
2. Capture the output.
3. Put the real result in `TESTING.md`.

Never manually claim tests passed without running them.
