# Signups

Ad-free, open-source, AI-native coordination for school parents, coaches, and community organizers.

A modern, self-hostable sign-up and volunteer coordination tool.

- **Slots are the atom, not questions.** Commitments, capacity, reminders — not form fields.
- **Participants are not users.** No account required, ever, to sign up.
- **Self-hostable from day one.** `git clone`, one Docker Compose, zero vendor accounts required.
- **AI-native.** Clean primitives designed for Claude, MCP, and future agent surfaces.

Licensed under [AGPL-3.0](LICENSE). If you run a modified version of Signups as a network service, the AGPL requires you to offer your users the corresponding source. See the [AGPL FAQ](https://www.gnu.org/licenses/agpl-3.0.html) for details.

## Quickstart (five minutes)

```bash
git clone https://github.com/richardshaw/signup.git && cd signup
cp .env.example .env.local
docker compose up -d           # local Postgres on :5433
pnpm install
pnpm db:migrate
pnpm dev                        # http://localhost:3000
```

In a second terminal:

```bash
pnpm worker                     # reminder worker
```

Open `http://localhost:3000`, request a magic link with any email, and look at the server log — with `EMAIL_TRANSPORT=console`, login links are printed directly to stdout for local development.

## Self-host

Docker image is published to GHCR on release. See `docker-compose.yml` for the canonical setup (app + db + worker). Configuration is entirely via environment variables — see `.env.example`.

Email transport is pluggable (`console` for dev, `smtp` for generic self-host, `resend` for hosted). No other external accounts required.

## Status

v1 — deliberately narrow. See [`docs/plans/2026-04-19-signup-v1.md`](docs/plans/2026-04-19-signup-v1.md) for the full build plan.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Contributors retain copyright on their contributions and license them under AGPL-3.0.

