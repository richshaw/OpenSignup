# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

Signup — ad-free, open-source coordination tool (a self-hostable sign-up coordination tool). Organizers create *signups* containing *slots*; *participants* commit to slots without ever creating an account. AGPL-3.0.

Authoritative build plan: `docs/plans/2026-04-19-signup-v1.md`. Read this first when picking up significant new work — phases, task numbering, and "non-negotiables" referenced throughout the code originate there.

## Common commands

```bash
pnpm dev                # Next.js on :3000
pnpm worker             # pg-boss reminder worker (separate process; required for jobs)
pnpm build / pnpm start
pnpm lint               # eslint (flat config, next/core-web-vitals + TS strict)
pnpm typecheck          # tsc --noEmit
pnpm test               # vitest unit tests (excludes *.db.test.ts and *.e2e.test.ts)
pnpm test:watch
pnpm test:db            # vitest against real Postgres (vitest.db.config.ts, fileParallelism:false)
pnpm test:e2e           # playwright
pnpm format / pnpm format:check
pnpm db:generate        # drizzle-kit: generate SQL migrations from schema/*.ts
pnpm db:migrate         # apply migrations via tsx src/db/migrate.ts
pnpm db:push            # drizzle-kit push (dev-only; bypass migrations)
pnpm db:studio
pnpm email:dev          # react-email preview server on :3001
```

Run a single vitest file: `pnpm test src/lib/policy.test.ts`. Run a single test name: `pnpm test -t 'rejects over-capacity'`.

Local Postgres comes from `docker compose up -d` (port **5433**, db/user/password all `signup`). Default `DATABASE_URL` matches.

## Architecture

Next.js 15 App Router monolith, TypeScript strict mode (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`-adjacent flags on). Postgres via Drizzle. Auth.js v5 (magic link). pg-boss for jobs. React Email + pluggable transport. Path alias `@/*` → `src/*`.

### Layered request flow

Every mutation must go through this chain — route handlers stay thin:

1. `src/app/api/.../route.ts` — Next.js handler. Parses request, builds `Actor`, calls service.
2. `src/services/{signups,slots,commitments}.ts` — pure(-ish) functions `(db, actor, input) => Promise<Result<T, ServiceError>>`. Business rules live here.
3. `src/lib/policy.ts` — `Actor` (organizer | participant | anonymous), `requireWorkspaceAccess`, `requireWorkspaceWrite`. **No service queries the DB without first calling a policy guard.** Every tenant-table query includes `workspace_id = ?`.
4. `src/db/client.ts` — `getDb()` returns a Drizzle handle backed by a singleton `postgres` client (cached on `globalThis.__signup_pg__`). `Db | Tx` are interchangeable via `Queryable`.
5. `src/db/schema/*.ts` — one file per entity, re-exported from `schema/index.ts`. `casing: 'snake_case'` is set in both Drizzle config and client, so TS uses camelCase, SQL uses snake_case.

Helpers used by every service:

- `src/lib/result.ts` — `Result<T, E>`, `ok`, `err`. Services return `Result`; route handlers convert to HTTP via `api-response.ts`.
- `src/lib/errors.ts` — `ServiceError` with `code` from a closed enum (`not_found | conflict | capacity_full | closed | forbidden | unauthorized | invalid_input | rate_limited | already_consumed | internal`), `httpStatusFor`, `fromZodError`, `ServiceException` (thrown by guards).
- `src/lib/parse.ts` — wraps Zod parsing into a `Result`.
- `src/lib/activity.ts` — `recordActivity(tx, …)` writes to the append-only activity log **inside the same transaction** as the mutation it describes.
- `src/lib/ids.ts` — UUIDv7 + base62 + 3–4 char type prefix (`sig_`, `slot_`, `org_`, `ws_`, `mem_`, `com_`, `par_`).
- `src/lib/idempotency.ts`, `src/lib/rate-limit.ts` — Postgres-backed (no Redis); applied at API boundaries.

### Schemas: Zod is the source of truth

`src/schemas/*.ts` defines per-entity input/output schemas. Slot `type_data` is a discriminated union over `slot_type` (`date | time | item | role | quantity`). DB stores `type_data` as `jsonb`; validation lives in Zod, not in PG enums.

### Capacity safety (the hot path)

`POST /api/slots/{id}/commitments` is the most safety-critical endpoint. The pattern: open a transaction, `SELECT ... FOR UPDATE` on the slot row, count current commitments, insert with a `position` integer, and rely on a unique constraint on `(slot_id, position)` as a final race-safety net. Cancelled commitments do not count toward capacity. Tests in `src/services/*.db.test.ts` exercise concurrent commit races — when changing this code, run `pnpm test:db`.

### Auth

`src/auth/config.ts` — Auth.js v5 with magic-link provider. `src/auth/adapter.ts` — custom Drizzle adapter that, on first login, creates an Organizer + personal Workspace + owner Member in one transaction. Magic-link emails go through our `EmailTransport` (not Auth.js's nodemailer) so there is one email pipeline. `src/auth/session.ts` builds the `Actor` consumed by the policy module.

### Email

`src/email/transport.ts` defines the port. Adapters: `console.ts` (dev — prints to stdout), `smtp.ts` (nodemailer), `resend.ts` (fetch). `src/email/index.ts` is a factory selecting on `EMAIL_TRANSPORT`. Templates in `src/email/templates/*.tsx` (React Email).

### Jobs

pg-boss runs against the same Postgres (schema `pgboss`). The Next.js server **does not** run the worker — `pnpm worker` (`src/jobs/worker.ts`) is a separate process. Two queues: `reminderDispatch` (cron every 10 min, scans the 48h window) and `reminderSend` (per-commitment send with retries). On commit, schedule with `singletonKey: commitmentId` so swap/edit replaces the prior job.

### Routes

- Organizer UI: `src/app/app/...` (requires session).
- Public participant page: `src/app/s/[slug]/...` (no auth, cookie-based "returning participant" flow).
- API: `src/app/api/...` — `signups`, `slots`, `commitments`, `public`, `auth`.

### Env

`src/lib/env.ts` parses `process.env` through Zod with `.superRefine` for conditional requirements (e.g. `RESEND_API_KEY` required when `EMAIL_TRANSPORT=resend`). Tests import the pure `parseEnv` function. `getEnv()` lazily parses once at runtime.

## Conventions that hurt to violate

From `CONTRIBUTING.md` and the v1 plan:

- **Slots are the atom, not questions.** This is not a form builder — don't add free-form question fields.
- **Participants are not users.** Never gate a participant action behind login.
- **Workspace scoping at the policy layer.** No raw DB query in a service without a `requireWorkspaceAccess` / `requireWorkspaceWrite` upstream.
- **TDD for pure logic** (capacity, slugs, IDs, email-typo suggestion, policy, env). UI is not TDD'd; covered by Playwright smokes.
- **No vendor lock-in.** Anything requiring an external account (Resend, Sentry, PostHog) must be opt-in via env var with a console/noop default.
- **Activity log is append-only and writes inside the same transaction as the mutation.**
- **`pnpm lint && pnpm typecheck && pnpm test` must pass before any PR.**

## Test layout

- `src/**/*.test.ts(x)` — unit, run by `pnpm test`.
- `src/**/*.db.test.ts` — integration against real Postgres, run by `pnpm test:db` (sequential; needs `docker compose up -d` and migrations applied).
- Playwright specs — `pnpm test:e2e`, includes axe-core a11y on `/s/[slug]`.
