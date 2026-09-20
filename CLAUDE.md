# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

OpenSignup — ad-free, open-source coordination tool (a self-hostable sign-up coordination tool). Organizers create *signups* containing *slots*; *participants* commit to slots without ever creating an account. AGPL-3.0.

The product name is **OpenSignup** (one word, served from `opensignup.org`). Lowercase `signup` remains acceptable for code/infra identifiers (folders, table, types, ID prefix `sig_`), and an individual entity is still called a "signup".

Authoritative build plan: `docs/plans/2026-04-19-signup-v1.md` (local-only — `docs/plans/` is gitignored and not in the public repo). Read this first when picking up significant new work — phases, task numbering, and "non-negotiables" referenced throughout the code originate there.

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
pnpm eval:magic-compose # offline eval of Magic Compose drafts (needs LLM_* env)
```

Run a single vitest file: `pnpm test src/lib/policy.test.ts`. Run a single test name: `pnpm test -t 'rejects over-capacity'`.

Local Postgres comes from `docker compose up -d` (port **5433**, db/user/password all `signup`). Default `DATABASE_URL` matches.

First-time setup: `pnpm install && cp .env.example .env.local && docker compose up -d && pnpm db:migrate`.

## Architecture

Next.js 15 App Router monolith, TypeScript strict mode (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`-adjacent flags on). Postgres via Drizzle. Auth.js v5 (magic link). pg-boss for jobs. React Email + pluggable transport. Path alias `@/*` → `src/*`.

### Layered request flow

Every mutation must go through this chain — route handlers stay thin:

1. `src/app/api/.../route.ts` — Next.js handler. Parses request, builds `Actor`, calls service.
2. `src/services/{signups,slots,commitments,slot-fields}.ts` — pure(-ish) functions `(db, actor, input) => Promise<Result<T, ServiceError>>`. Business rules live here. Server components read via `src/services/signups.cached.ts`, which wraps service reads in React `cache()` for per-request dedupe — prefer the cached entry points in RSC, raw services elsewhere.
3. `src/lib/policy.ts` — `Actor` (organizer | participant | anonymous), `requireWorkspaceAccess`, `requireWorkspaceWrite`. **No service queries the DB without first calling a policy guard.** Every tenant-table query includes `workspace_id = ?`. Workspace roles are `owner | admin | editor | viewer`; only `viewer` is read-only — use `requireWorkspaceWrite` for any mutation.
4. `src/db/client.ts` — `getDb()` returns a Drizzle handle backed by a singleton `postgres` client (cached on `globalThis.__signup_pg__`). `Db | Tx` are interchangeable via `Queryable`.
5. `src/db/schema/*.ts` — one file per entity, re-exported from `schema/index.ts`. `casing: 'snake_case'` is set in both Drizzle config and client, so TS uses camelCase, SQL uses snake_case.

Helpers used by every service:

- `src/lib/result.ts` — `Result<T, E>`, `ok`, `err`. Services return `Result`; route handlers convert to HTTP via `api-response.ts`.
- `src/lib/errors.ts` — `ServiceError` with `code` from a closed enum (`not_found | conflict | capacity_full | closed | forbidden | unauthorized | invalid_input | rate_limited | already_consumed | internal`), `httpStatusFor`, `fromZodError`, `ServiceException` (thrown by guards).
- `src/lib/parse.ts` — wraps Zod parsing into a `Result`.
- `src/lib/activity.ts` — `recordActivity(tx, …)` writes to the append-only activity log **inside the same transaction** as the mutation it describes. Telemetry-only events (no describing mutation) write outside a tx; see `src/lib/view-tracker.ts` and `safeRecordAttemptFailed` in `src/services/commitments.ts`.
- `src/lib/ids.ts` — UUIDv7 + base62 + 3–4 char type prefix (`sig_`, `slot_`, `org_`, `ws_`, `mem_`, `com_`, `par_`).
- `src/lib/idempotency.ts`, `src/lib/rate-limit.ts` — Postgres-backed (no Redis); applied at API boundaries. Rate-limited surfaces: magic link (per email + per IP), public commit POST (per IP), `/api/commitments/[id]` token ops (per IP), signup create + Magic Compose (per organizer), landing telemetry (per IP). Every unauthenticated write endpoint must consume a rate limit before doing any work.

### Schemas: Zod is the source of truth

`src/schemas/*.ts` defines per-entity input/output schemas. Slots don't have a fixed type; each signup defines its own custom fields in `slot_fields` (ref, label, `sortOrder`), and every field carries a `field_type` — `text | date | time | number | enum` — validated by `SlotFieldConfigSchema`, a discriminated union over `fieldType` (`src/schemas/slot-fields.ts`). A slot's answers live in `slots.values`, a jsonb map keyed by field ref. DB stores both `config` and `values` as `jsonb`; validation lives in Zod, not in PG enums.

### Capacity safety (the hot path)

`POST /api/slots/{id}/commitments` is the most safety-critical endpoint. The pattern: open a transaction, `SELECT ... FOR UPDATE` on the slot row, count current commitments, insert with a `position` integer, and rely on a unique constraint on `(slot_id, position)` as a final race-safety net. Cancelled commitments do not count toward capacity. Tests in `src/services/*.db.test.ts` exercise concurrent commit races — when changing this code, run `pnpm test:db`.

### Auth

`src/auth/config.ts` — Auth.js v5 with magic-link provider. `src/auth/adapter.ts` — custom Drizzle adapter that, on first login, creates an Organizer + personal Workspace + owner Member in one transaction. Magic-link emails go through our `EmailTransport` (not Auth.js's nodemailer) so there is one email pipeline. `src/auth/session.ts` builds the `Actor` consumed by the policy module. The magic-link email also carries a six-digit code (`src/auth/login-code.ts`: email-keyed HMAC, callback URL encrypted at rest, single use, rate-limited) so sign-in can finish in the window that requested it; redemption hands the callback URL back to the client for a top-level navigation — a server-action `redirect()` to it would lose Auth.js's cookie. `/login` and `/login/check` poll `/api/auth/session` and move on once a session exists.

### OAuth authorization server (AI connectors)

An organizer can connect an AI assistant (Claude app, Claude Code, ChatGPT, any MCP client) to their account. Organizer-facing docs: `docs/connect-ai-assistant.md`.

The MCP server lives in `src/mcp/`: `route.ts` is the only entry point (it meters, caps the body, answers `GET` with 405 since there are no sessions, peeks the JSON-RPC body to learn which scope a `tools/call` needs, and hands that to `resolveBearerActor`, so a missing scope is the standard 403 step-up); `handler.ts` builds a stateless per-request `McpServer` through the SDK's `createMcpHandler`; `tools/index.ts` lists the tools; `registry.ts` converts each zod 3 input schema to JSON Schema once at module load (`zod-to-json-schema` + the SDK's `fromJsonSchema` with a pass-through validator, because the SDK refuses zod 3 schemas directly and its own Ajv check would give unstructured errors); `results.ts` runs the scope check a second time, then the zod parse, and maps `Result` / `ServiceException` to tool results with the same error shape as the REST API — the repeated scope check is what makes the registry safe on its own, without the route's gate. A tool handler calls one mutating service and does not query the DB itself; the one thing it may do besides that is consume a rate limit (`create_signup` charges the same per-organizer create quota the browser does), and `create_signup` alone reads its result back through the read service `getSignupForOrganizer`, so it returns the same fields and slots `get_signup` would; if that read fails it still reports the create, because an error would invite a retry that makes a duplicate. Compose ids with `.extend()` (never `.and()`) and strip the id before calling the service; `update_signup` passes sparse settings with `mergeSettings: true`, so `updateSignup` merges them over the row (null clears a key) instead of replacing them as the browser does. Every mutation made through a token carries `viaClientId` in its activity payload (`activityActor` in `src/lib/activity.ts`). `instructions.ts` builds the server `instructions` a client gets on initialize (how to design a signup, which link to give when, which tools to ask about first) from the tool list, once at module load; it must stay within 2048 bytes, tools line last, and tool descriptions still stand on their own because some clients ignore it. Its design rules are the same constants the Magic Compose prompt interpolates from `src/lib/signup-rules.ts` — a test on each side checks `RULES_IN_BOTH` word for word, and `magic-compose/__golden__/system-prompt.txt` pins the prompt's bytes, so editing a shared rule means an eval run. Run `pnpm test:db` when touching `src/mcp`.

- **Hybrid, deliberately.** Auth.js still owns human sign-in (magic link / Google) and nothing about it changed. `oidc-provider` (node-oidc-provider) issues tokens to apps. The resource-server pieces — RFC 9728 protected-resource metadata and the bearer challenge — come from the official MCP SDK `@modelcontextprotocol/server`. Access tokens are verified in-process with `jose`, no HTTP round trip to our own JWKS.
- **The seam.** `resolveBearerActor` in `src/auth/bearer.ts` is the **only** auth import allowed under MCP routes and tool handlers. It returns the same `Actor` the cookie path builds (both go through `src/auth/organizer-session.ts`), so `requireWorkspaceAccess` / `requireWorkspaceWrite` still judge every call. Scope checks sit *on top of* the policy layer, never instead of it: `signups:write` does not let a viewer write.
- **Where things live.** `src/oauth/*` (config, scopes, provider, consent, grants, adapter, keys, node-shim); routes at `src/app/api/oauth/[[...path]]` and `src/app/.well-known/*`; consent UI at `src/app/oauth/consent/[uid]`; organizer UI at `src/app/app/(chrome)/settings/connected-apps`.
- **Node shim gotchas** (`src/oauth/node-shim.ts`): Koa needs `host` present, `content-length` on POST bodies, and `socket.writable === true` or `respond()` silently drops the body. Every request is re-anchored to the `AUTH_URL` origin, so a proxy hostname can never leak into discovery.
- **`commitments:read` is not advertised** in the protected-resource metadata (`ADVERTISED_SCOPES` in `src/oauth/scopes.ts`). Clients request everything the metadata lists, so advertising it would put participant emails in the very first authorization request. It is reached by an explicit step-up (403 `insufficient_scope`) and flagged in amber on the consent screen. Don't "fix" the asymmetry.
- **TTLs** (`OAUTH_TTL` in `src/oauth/config.ts`): access token 15 min, code 60 s, refresh 30 days rotating, grant ceiling 90 days from the original approval. Access tokens are JWTs — **nothing can revoke one early**; disconnect only stops the next refresh, and both the connected-apps page and the legal pages say so.
- Clients identify by Client ID Metadata Document (CIMD); dynamic registration is off. `OAUTH_STATIC_CLIENTS` (JSON array) pre-registers clients that cannot serve one. Requires Node 22.12 or later (`engines` in package.json).
- **Run `pnpm test:db` when touching `src/oauth`** — the adapter, key, and full-flow tests are DB tests.

### Email

Participant emails (confirmation and reminder) describe a slot by printing **every** field the organizer defined, as `Label: value` lines, via `slotDetails` in `src/lib/slot-label.ts` and the shared `SlotDetailsText` block. There is no rule picking a "What" field or deriving a "When" line: any such rule guessed wrong on date-grouped signups and dropped the organizer's other fields. Values render through the same `renderFieldValue` the public page uses, so a slot reads identically in the inbox and on `/s/[slug]`. Subject lines come from `src/email/subjects.ts`, shared with the templates so subject and preview text cannot drift, and name the slot with `summarizeSlotValues` — the same `slotDetails` walk the organizer's responses table joins as `summarizeSlot`.

`src/email/transport.ts` defines the port. Adapters: `console.ts` (dev — prints to stdout), `smtp.ts` (nodemailer), `resend.ts` (fetch). `src/email/index.ts` is a factory selecting on `EMAIL_TRANSPORT`. Templates in `src/email/templates/*.tsx` (React Email).

### Jobs

pg-boss runs against the same Postgres (schema `pgboss`). The Next.js server **does not** run the worker — `pnpm worker` (`src/jobs/worker.ts`) is a separate process. Three queues: `housekeeping` (hourly cron; `src/jobs/housekeeping.ts` deletes expired `oauth_records` and closed `rate_limits` windows — reads already ignore expired rows, so a missed run costs disk, not correctness), `reminderDispatch` (cron every 10 min, selects commitments whose reminder has come due — slot still ahead and within the fixed `REMINDER_LEAD_HOURS` of 24; `sendReminders` in the signup's settings is the only off switch) and `reminderSend` (per-commitment send with retries). Nothing is scheduled at commit time: the dispatch scan is the scheduler, `singletonKey: commitmentId` only collapses concurrent enqueues, and a `reminder.sent` activity row is what stops a commitment being selected again. A slot's instant comes from `slots.slot_at`, derived from the date field `settings.reminderFromFieldRef` names (see `src/lib/reminder-fields.ts`); the field services keep that ref valid. A date-only slot anchors at 12:00Z rather than midnight, so the 24h-before reminder lands on the day before in every timezone from UTC-11 to UTC+11; that instant is for *scheduling only*, and anything that must know whether a slot has a real time of day has to ask `slotTimeOfDay` rather than read the instant, since a genuine 12:00 slot stores the same value. Emails never render `slot_at` — they print the slot's own field values (see Email below), which sidesteps the question. Worker liveness is observable from the web process: `GET /api/public/health` reports `worker: ok | stale | unknown` by checking `pgboss.job` for a recent dispatch completion (`src/lib/worker-health.ts`) — informational only, never fails the HTTP check.

### Magic Compose (AI-drafted signups)

Optional feature: organizers paste a description and get a draft signup. Provider-agnostic — any OpenAI-compatible Chat Completions endpoint works (OpenRouter, OpenAI, Ollama). Disabled when `LLM_BASE_URL` is unset, so the "no vendor lock-in" rule still holds.

- `src/lib/magic-compose/llm-client.ts` — single fetch-based client. Sends `response_format: { type: 'json_object' }` (not strict `json_schema`); server-side Zod validation in `prompt.ts` is the source of truth for shape. Surfaces a closed set of error codes (`not_configured | rate_limited | upstream | invalid_json | schema_mismatch | timeout | aborted`).
- `src/app/api/signups/magic-compose/route.ts` — POST endpoint; rate-limited per organizer, calls the LLM, then **persists** via `createSignup` and returns `{ id, slug, summary, warnings, draft }` plus build/self/public links. Errors are mapped through `mapMagicComposeError` (`./errors.ts`); structured refusals from the model surface as `invalid_input` with `details.reason: 'refusal'`.
- `src/components/magic-compose/` — client UI; state machine drives loading/error/preview states.
- Env: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_TIMEOUT_MS` (default 180000 — structured outputs on large drafts can exceed 60s).
- Offline eval harness: `pnpm eval:magic-compose` (see `scripts/eval-magic-compose.ts`).

### Routes

- Organizer UI: `src/app/app/...` (requires session).
- Public participant page: `src/app/s/[slug]/...` (no auth, cookie-based "returning participant" flow).
- API: `src/app/api/...` — `signups`, `slots`, `commitments`, `public`, `auth`.

### Env

`src/lib/env.ts` parses `process.env` through Zod with `.superRefine` for conditional requirements (e.g. `RESEND_API_KEY` required when `EMAIL_TRANSPORT=resend`). Tests import the pure `parseEnv` function. `getEnv()` lazily parses once at runtime.

### Logging

`src/lib/log.ts` exports a pino logger (`pino-pretty` in dev, JSON in prod). `redact` strips `authorization`, `cookie`, `*.password`, `*.token`, `*.apiKey`, `RESEND_API_KEY`, `SMTP_PASSWORD`. Outside dev, also redact magic-link URLs and any token-bearing query strings before logging. When adding a new secret-shaped field, extend `redact.paths`.

## Conventions that hurt to violate

From `CONTRIBUTING.md` and the v1 plan:

- **Slots are the atom, not questions.** This is not a form builder — don't add free-form question fields.
- **Participants are not users.** Never gate a participant action behind login.
- **Workspace scoping at the policy layer.** No raw DB query in a service without a `requireWorkspaceAccess` / `requireWorkspaceWrite` upstream.
- **TDD for pure logic** (capacity, slugs, IDs, email-typo suggestion, policy, env). UI is not TDD'd; covered by Playwright smokes.
- **No vendor lock-in.** Anything requiring an external account (Resend, Sentry, PostHog) must be opt-in via env var with a console/noop default.
- **Activity log is append-only and writes inside the same transaction as the mutation.** Telemetry-only events that don't describe a mutation (page views, auth funnel, attempt-failed) are an exception: write them outside the tx (or via a SAVEPOINT helper if the only entry point is inside one) so a transient activity-insert failure never aborts the user's actual operation. See `safeRecordAttemptFailed` in `src/services/commitments.ts` and the `workspace.created` write in `src/auth/adapter.ts` for the patterns.
- **`pnpm lint && pnpm typecheck && pnpm test` must pass before any PR.**

## Test layout

- `src/**/*.test.ts(x)` — unit, run by `pnpm test`.
- `src/**/*.db.test.ts` — integration against real Postgres, run by `pnpm test:db` (sequential; needs `docker compose up -d` and migrations applied).
- `tests/e2e/**` — Playwright smokes (`testDir` in `playwright.config.ts`), run by `pnpm test:e2e`. Needs Postgres up, migrations applied, and a production build (`pnpm build`) — the config starts `pnpm start` itself; locally an already-running `pnpm dev` on :3000 is reused instead. `tests/e2e/global-setup.ts` reseeds fixture data (organizer + session, published/draft signups, a commitment with edit token) into the database on every run and writes ids/tokens to the gitignored `tests/e2e/.seed.json`. Axe (WCAG A/AA) specs cover `/s/[slug]` and the commit dialog in `tests/e2e/a11y.spec.ts`. CI runs the chromium project in a dedicated job.

## Recurring mistakes to avoid

- **No speculative schema.** Every column in `src/db/schema/*.ts` must be read or written by a service in the same change that introduces it. The lone exception is `commitments.customFieldValues`, which predates this rule and is grandfathered in — don't add new columns of that shape.
- **Public routes must handle every signup state.** `/s/[slug]` and any participant-facing route must render a real message for each of `draft`, `open`, `closed`, `archived`, and "not found". Never let a non-`open` state fall through to a generic 404.
- **Reuse banners and state-message components.** Before adding a new banner / notice / empty-state, grep for an existing one (preview banner, closed banner, etc.) and either reuse it or extract a shared component. Tailwind makes drift cheap to introduce and expensive to spot.
- **Verify before claiming done.** Before saying "tests pass" or proposing a commit, actually run `pnpm lint && pnpm typecheck && pnpm test` in the current turn and use that output as evidence. Past success doesn't count.
- **No `getEnv()` in statically prerendered pages.** Any module reachable from a static App Router page (anything without `dynamic`, `revalidate = 0`, `cookies()`, etc.) runs during `next build`. The Fly build image has no server env, so `getEnv()` will throw on `DATABASE_URL`/`AUTH_SECRET`/etc. and abort prerender. For values needed on static pages, expose them as `NEXT_PUBLIC_*` and read `process.env` directly; for server-only values, force the page dynamic.
- **`NEXT_PUBLIC_*` values used by static pages must be set at BUILD time, not just runtime.** Fly secrets are runtime-only — they won't satisfy a build-time Zod parse in `src/lib/site-config.ts`. Wire new required `NEXT_PUBLIC_*` vars through `fly.toml` `[build.args]`, the `x-instance-build` args in `docker-compose.prod.yml`, *and* a matching `ARG`/`ENV` pair in `Dockerfile` (above the `RUN pnpm build` line), or the deploy build will fail (or, for a var with a fallback like `NEXT_PUBLIC_APP_URL`, silently bake in `localhost`).
- **The OAuth query string must reach the provider.** `handleOAuthRequest` forwards the public path *with* its search params unless a route passes an explicit `path` override (only the well-known routes do). Drop the query and the authorization endpoint sees a request with no `client_id`.
- **Static OAuth clients need `application_type: 'native'`.** Without it `oidc-provider` matches loopback redirect URIs on the exact port, and every MCP client using an ephemeral callback port fails. `toClientMetadata` in `src/oauth/provider.ts` sets it; keep it set.
- **MCP tool schemas are zod 3, converted once.** `registerTool` needs a schema with `~standard.jsonSchema`; zod 3 has none, so every tool goes through `toJsonSchema` + `fromJsonSchema` in `src/mcp/registry.ts` at module load. Don't hand a raw zod object to the SDK, and don't move the conversion into the request path — `zodToJsonSchema` would then walk every tool's schema on every call. The SDK's own validator is deliberately a no-op (`zodDoesTheValidating`) so that zod does all validation in one pass and every input mistake comes back in the same structured shape.
- **Trust docs reflect the code, not the other way around.** When you change anything user-visible — cookies (`src/lib/returning-participant.ts`, Auth.js config), what we store about organizers or participants (DB schema, services), new third-party integrations (Resend, Sentry, PostHog, LLM provider), retention windows, or the rate-limit/idempotency pattern — update `src/app/(legal)/privacy/page.tsx`, `terms/page.tsx`, and `cookies/page.tsx` in the same PR and bump the "Last updated" date. The legal pages are public-facing copy people rely on; stale or fabricated detail (e.g. wrong cookie name) is a transparency bug, not a doc nit.
