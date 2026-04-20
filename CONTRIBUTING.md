# Contributing to Signup

Signup is AGPL-3.0. Contributions retain your copyright and are licensed under the same terms.

## Principles that override feature requests

1. **Slots are the atom, not questions.** Form-builder patterns do not apply here.
2. **Strict schemas, forgiving ingress, teaching errors.** Closed enums. Typed discriminators. Error responses explain what to do instead.
3. **Participants are not users.** No account, ever, for anyone signing up for a slot.
4. **Advanced layer goes in first.** Workspace scoping, activity log, stable refs — the things that hurt to retrofit.
5. **One source of truth per concern.** Zod for shape, Drizzle for storage, activity for history.
6. **Self-hostable.** No new vendor dependency without an adapter.

## Setup

```bash
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev
```

Run `pnpm test` for unit tests, `pnpm test:db` for integration tests against the compose Postgres, and `pnpm test:e2e` for Playwright.

## Pull requests

- Keep PRs tight. One logical change per PR.
- Include tests. For service logic, tests are required and go first (TDD).
- `pnpm lint && pnpm typecheck && pnpm test` must pass locally.
- UI changes should include a Playwright smoke or a screenshot.

## Reporting security issues

See [`SECURITY.md`](SECURITY.md).
