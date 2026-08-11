# 001 — Authentication Flow

## Goal

Implement the assessment's identity requirement (§4.1): name + email only,
no password, no OAuth. An existing email loads that user; a new email
creates one. Maintain a simple session so subsequent requests know who the
current user is, without the frontend ever being trusted to supply a
`userId`.

## Skills Read

- `AGENTS.md` §1 (Identity), §7 (API Route Rules), §9 (Security) — the
  concrete rules this feature had to satisfy.
- `.claude/skills/testing/SKILL.md` — informed testing at the route/session
  boundary rather than chasing coverage.
- `.claude/skills/prisma-client-api`, `.claude/skills/prisma-database-setup`
  — the `User` model and Prisma client were already wired in a prior step;
  this feature only consumes them.

## Existing Code Inspected

- `lib/storage/db.ts` — existing Prisma client singleton (adapter-based,
  Prisma 7).
- `prisma/schema.prisma` — `User` model (`id`, `name`, `email @unique`).
- `types/domain.ts`, `types/api.ts` — shared `User` / `ApiErrorBody` types
  already defined, reused rather than redefined.
- `components/ui/*` — shadcn primitives already installed (card, input,
  label, button, alert) reused for the form.
- `app-demo.html` — skimmed earlier for identity-screen scope (name+email,
  validation, loading/error state); not yet pixel-compared in a browser —
  see Known Limitations.

## Decisions or Assumptions

- **Custom HMAC-signed cookie instead of an auth library** (next-auth,
  etc.). The spec says session representation is our call, and AGENTS.md
  explicitly avoids "unnecessary complexity" / "complex authentication."
  Cookie is `userId.HMAC-SHA256(userId)`, verified with `timingSafeEqual`.
- **Existing-email login does not overwrite the stored name.** Identity is
  keyed on email only; the name captured at first signup is treated as the
  durable one.
- **Login race handled by catch-and-relookup, not a transaction.** Two
  concurrent first-time signups for the same brand-new email can both miss
  the initial `findUnique`; the `create` that loses the unique-constraint
  race just re-reads the winner's row instead of erroring. A DB
  transaction was considered and rejected as overkill for a single-table,
  single-statement conflict.

## Files Changed

- `lib/auth/session.ts` — `createSession`, `clearSession`, `getCurrentUser`.
- `lib/validation/identity.ts` — Zod schema for name/email.
- `lib/api/errors.ts` — shared `{ error: { message } }` response shape.
- `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`.
- `components/identity/LoginForm.tsx`, `app/login/page.tsx`.
- `tests/mocks/next-headers.ts` (in-memory cookie jar — `next/headers`
  only works inside Next's own request lifecycle, so route/session tests
  mock it), `tests/mocks/server-only-noop.ts` (the real `server-only`
  package throws outside Next's bundler; aliased to a no-op for Vitest).
- `vitest.config.ts` — the `server-only` alias, plus a dedicated
  `test.db` via `test.env` so tests never touch the dev database.
- `lib/auth/session.test.ts`, `app/api/auth/login/route.test.ts`.

## Implementation Requirements

- Name + email only; no password; no OAuth (assessment §4.1).
- Existing email → load user; new email → create user.
- Session must be established and validated server-side; the browser is
  never trusted to supply a `userId` directly (AGENTS.md §7).
- Client-side validation for immediate feedback; server-side validation
  (Zod) is the actual boundary — invalid input never reaches the DB.

## Security Requirements

- Cookie: `httpOnly`, `sameSite=lax`, `secure` in production.
- Cookie value is tamper-evident (HMAC signature, constant-time compare) —
  a forged `userId` without the server's `SESSION_SECRET` is rejected.
- `SESSION_SECRET` lives only in env, never sent to the client.
- No secrets or PII logged.

## Acceptance Criteria

- New email creates a user and starts a session.
- Existing email loads that user without changing their stored name.
- Invalid name/email is rejected with 400 before any DB write.
- Logout clears the session cookie.
- A tampered session cookie is treated as logged out, not as a different
  user.
- Two concurrent signups for the same new email do not produce a 500.

## Checks Run

- `npm run lint` — clean.
- `npx tsc --noEmit` — clean.
- `npm test` — 7/7 passed (`lib/auth/session.test.ts`,
  `app/api/auth/login/route.test.ts`).
- `next build` (production build) — **not run this round**; deferred to
  the next natural milestone rather than after every task.

## Exact Manual Test Steps

1. `npm run dev`, visit `http://localhost:3000/login`.
2. Submit with an empty name → inline "Name is required", no request sent.
3. Submit with an invalid email → inline "Enter a valid email address".
4. Submit with a new name/email → session cookie is set (`httpOnly`); the
   redirect target `/projects` will 404 until that page exists (next
   implementation step).
5. `curl -X POST /api/auth/login` again with the same email but a
   different name → response `name` still matches the original, not the
   new one.
6. `curl -X POST /api/auth/logout` → `Set-Cookie` clears `session`.

Verified manually via the steps above against the real dev server (not
just the automated tests) before writing this artifact.

## Known Limitations / Follow-ups

- The login screen has not been visually compared side-by-side with
  `app-demo.html`'s identity screen in a browser yet — tracked as part of
  the UI polish pass later in `docs/plan.md` (implementation order, step
  10), not skipped permanently.
- `/projects` doesn't exist yet, so the post-login redirect currently
  404s; resolved by the next implementation step.
