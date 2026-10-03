# Contributing to OpenSignup

OpenSignup is AGPL-3.0. Contributions retain your copyright and are licensed under the same terms.

## Principles that override feature requests

1. **Slots are the atom, not questions.** Form-builder patterns do not apply here.
2. **Strict schemas, forgiving ingress, teaching errors.** Closed enums. Typed discriminators. Error responses explain what to do instead.
3. **Participants are not users.** No account, ever, for anyone signing up for a slot.
4. **Advanced layer goes in first.** Workspace scoping, activity log, stable refs — the things that hurt to retrofit.
5. **One source of truth per concern.** Zod for shape, Drizzle for storage, activity for history.
6. **Self-hostable.** No new vendor dependency without an adapter.
7. **Fast, and no bigger than it needs to be.** Pages load at once and requests make as few trips to the database as they can. Complexity is fine while you work something out; once you have, take the scaffolding down. Delete before you add.

## Setup

```bash
pnpm install
cp .env.example .env.local
docker compose up -d            # local Postgres on :5433
pnpm db:migrate
pnpm dev                         # http://localhost:3000
```

In a separate terminal, run the reminder worker if you're touching jobs or email:

```bash
pnpm worker
```

Run `pnpm test` for unit tests, `pnpm test:db` for integration tests against the compose Postgres, and `pnpm test:e2e` for Playwright.

## Pull requests

- Keep PRs tight. One logical change per PR.
- Include tests. For service logic, tests are required and go first (TDD).
- `pnpm lint && pnpm typecheck && pnpm knip && pnpm test` must pass locally.
- `pnpm knip` lists files, exports and dependencies that nothing uses. Delete them rather than ignoring them; an entry in `knip.jsonc` needs a comment saying why it has to stay.
- [`budgets.json`](budgets.json) caps how much JavaScript each page loads (`pnpm budgets`, after `pnpm build`) and how many statements the public signup page and the sign-up request send to Postgres (`src/app/query-budget.db.test.ts`, in `pnpm test:db`). Going over fails CI. If a change really needs more, raise the number in the same PR and say why. If you come in under, lower it, so the saving stays saved.
- UI changes should include a Playwright smoke or a screenshot.
- If you add or change an `ACTIVITY_EVENTS` entry or its payload shape, update [`docs/telemetry.md`](docs/telemetry.md).
- If you change a screen that a help page at `/help` describes, update the page, its walkthrough and its screenshots in the same PR. How to write help: [`docs/writing-help.md`](docs/writing-help.md).

## Reporting security issues

See [`SECURITY.md`](SECURITY.md).
