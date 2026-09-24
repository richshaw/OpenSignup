---
name: run-opensignup
description: Start, run, build, test and drive OpenSignup (Next.js + Postgres + reminder worker). Use when asked to run or start the app, sign in as an organizer, create or publish a signup, sign up as a participant, take a screenshot of a page, read the emails it sends, call its API, run unit, database or e2e tests, or check a change in the running app.
---

OpenSignup is a Next.js 15 app with Postgres and a separate reminder worker. An agent runs `pnpm dev` and `pnpm worker` in the background and drives the UI with **`.claude/skills/run-opensignup/driver.mjs`**, a headless-Chromium command driver that signs in the real way: it requests a magic link and reads it from the dev server's console email. All paths are relative to the repo root.

## Prerequisites

Verified in Claude's Ubuntu 24.04 cloud container: Node 22, pnpm 9.15.9, PostgreSQL 16 already installed from apt, Chromium under `/opt/pw-browsers`. There is no Docker daemon there, so `docker compose up -d` (the README path) fails; use the local Postgres on the port the app expects:

```bash
sed -i 's/^port = 5432/port = 5433/' /etc/postgresql/16/main/postgresql.conf
service postgresql start
su postgres -c "psql -p 5433 -v ON_ERROR_STOP=1" <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'signup') THEN
    CREATE ROLE signup LOGIN SUPERUSER PASSWORD 'signup';
  END IF;
END $$;
SQL
su postgres -c "createdb -p 5433 -O signup signup" 2>/dev/null || echo "database signup already exists"
```

## Setup

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
cat >> .env.local <<'EOF'
NEXT_PUBLIC_INSTANCE_NAME=OpenSignup (local)
NEXT_PUBLIC_SUPPORT_EMAIL=support@example.com
NEXT_PUBLIC_GOVERNING_LAW=your jurisdiction
OAUTH_STATIC_CLIENTS='[{"client_id":"e2e-client","client_name":"E2E test client","redirect_uris":["http://localhost:3000/e2e/oauth-callback"]}]'
EOF
pnpm db:migrate
```

`pnpm dev` runs on the untouched `.env.example`; the three `NEXT_PUBLIC_*` lines are for `pnpm build`, and `OAUTH_STATIC_CLIENTS` un-skips the OAuth e2e tests. Email goes to the server log (`EMAIL_TRANSPORT=console`).

## Run (agent path)

Start the web app (dev server, reloads on code changes) and the worker, each in its own process group so one `kill` stops everything it spawned:

```bash
setsid bash -c 'echo $$ > /tmp/opensignup-web.pid; exec pnpm dev' > /tmp/opensignup-web.log 2>&1 < /dev/null &
setsid bash -c 'echo $$ > /tmp/opensignup-worker.pid; exec pnpm worker' > /tmp/opensignup-worker.log 2>&1 < /dev/null &
timeout 120 bash -c 'until curl -sf localhost:3000/api/public/health >/dev/null; do sleep 1; done' && curl -s localhost:3000/api/public/health
```

Drive it by piping commands to the driver. This is a full organizer → participant flow; it exits 1 if any command failed:

```bash
node .claude/skills/run-opensignup/driver.mjs <<'EOF'
login pat@example.com
click New signup
fill Title = Snack duty — Spring season
click Create signup
wait-url /build
click Set what
fill What value = Fruit and water
fill Date value = 2030-04-06
fill Capacity = 2
wait Saved
click Done
ss organizer-builder
click Publish
wait Signup published
follow Open public page
as-visitor
wait Fruit and water
click Sign up
fill Your name = Sam Example
fill Email = sam@example.com
click Confirm
wait saved your spot
ss participant-confirmed
email sam@example.com
errors
EOF
```

Screenshots → `/tmp/opensignup-shots/`. Server logs → `/tmp/opensignup-web.log`, `/tmp/opensignup-worker.log`.

| command                                 | what it does                                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `login <email>`                         | Sign in as an organizer (first time creates the account). Reuses a saved session after that.                   |
| `nav <path>`                            | Go to a path or URL.                                                                                           |
| `click <name>`                          | Click the visible button, link, tab or text with that exact name. `click-css <selector>` for the rest.         |
| `fill <label> = <value>`                | Fill the field with that label. Builder cells are labelled `What value`, `Date value`; dates are `YYYY-MM-DD`. |
| `press <key>`                           | Press a key, e.g. `Escape`.                                                                                    |
| `wait <text>` / `wait-url <regex>`      | Wait up to 20s for visible text or a URL.                                                                      |
| `follow <link name>`                    | Open a link's address in this tab (for links that open a new tab, like `Open public page`).                    |
| `as-visitor`                            | Same page, fresh cookies: act as a participant.                                                                |
| `open desktop` / `open phone`           | New browser at 1280×900 or 390×844, fresh cookies.                                                             |
| `ss [name]` / `ss-el <selector> [name]` | Full-page screenshot (scrolls first so lazy images load) / one element.                                        |
| `text [selector]` · `url` · `eval <js>` | Read the page.                                                                                                 |
| `email [to]`                            | The newest console email (to that address) from the server log: subject and links.                             |
| `cookie`                                | The organizer session cookie, for `curl -b`.                                                                   |
| `errors`                                | Browser console errors since the last call.                                                                    |

Interactive, under tmux:

```bash
tmux new-session -d -s os -x 200 -y 50
tmux send-keys -t os 'node .claude/skills/run-opensignup/driver.mjs' Enter
tmux send-keys -t os 'login pat@example.com' Enter
timeout 60 bash -c 'until tmux capture-pane -t os -p | grep -q "signed in as"; do sleep 0.5; done'
tmux capture-pane -t os -p | grep -v '^$' | tail -3
tmux send-keys -t os 'quit' Enter
```

Call the REST API as the signed-in organizer:

```bash
COOKIE=$(node .claude/skills/run-opensignup/driver.mjs <<'EOF' | tail -1
login pat@example.com
cookie
EOF
)
curl -s -b "$COOKIE" localhost:3000/api/signups | head -c 300
```

### Direct invocation (no browser)

Most changes touch services or pure functions. Call them directly:

```bash
pnpm exec tsx -e "import { capacityLabel } from '@/app/s/[slug]/slot-format'; console.log(capacityLabel(1, 2));"
```

For code that needs the database, write a `.mts` file **inside the repo** (so packages and `@/` resolve), run it, delete it:

```bash
cat > scratch.tmp.mts <<'EOF'
import { config } from 'dotenv';
config({ path: '.env.local' });
const { getDb } = await import('@/db/client');
const { signups } = await import('@/db/schema');
console.log(await getDb().select({ title: signups.title, status: signups.status }).from(signups).limit(3));
process.exit(0);
EOF
pnpm exec tsx scratch.tmp.mts && rm scratch.tmp.mts
```

Reminders run on a 10-minute cron in the worker. To see what's due now, and send it straight away through the running worker:

```bash
pnpm reminders:due
pnpm reminders:due --dispatch
```

### Stop

```bash
kill -- -"$(cat /tmp/opensignup-web.pid)" -"$(cat /tmp/opensignup-worker.pid)"
```

## Run (human path)

`pnpm dev` and `pnpm worker` in two terminals, open http://localhost:3000, and copy the sign-in link from the `pnpm dev` output.

## Test

```bash
pnpm lint && pnpm typecheck && pnpm test   # 862 unit tests
pnpm test:db                               # 250 tests against Postgres, ~35s
```

E2E runs against a production build. Stop the dev server first (**Stop** above; the e2e config would otherwise reuse it), then use the container config, which points Playwright at the installed Chromium:

```bash
pnpm build
pnpm exec playwright test -c .claude/skills/run-opensignup/playwright.container.config.ts --project=chromium
```

All 29 pass. Re-take the help pages' screenshots the same way: `HELP_SCREENSHOTS=1 pnpm exec playwright test -c .claude/skills/run-opensignup/playwright.container.config.ts tests/e2e/help --project=chromium`.

## Gotchas

- **Sign-in only works from the dev server.** The console email transport blanks magic-link tokens and six-digit codes unless `NODE_ENV=development`, so under `pnpm start` the driver's `login` can't sign in. The link goes to a `/login/confirm` page with a **Sign in →** button (it protects the one-time link from email scanners); the driver clicks it.
- **5 sign-in emails per address per hour.** The driver saves each session to `/tmp/opensignup-shots/.session-<email>.json` and reuses it; delete the file to force a fresh sign-in, or use another address.
- **`pnpm build` fails on the untouched `.env.example`** (`Invalid site config: NEXT_PUBLIC_INSTANCE_NAME is required …`). `pnpm dev` fills placeholders; a build doesn't. The values are baked in at build time.
- **`lsof -ti:3000` sees nothing in this container**, so the usual "kill the port's listener" silently leaves the server up. Use the process-group `kill` above, or `fuser -k 3000/tcp`. Never `pkill -f next`: the pattern matches your own shell and kills it.
- **`setsid cmd & echo $!` saves the wrong PID**: setsid forks, and `$!` is a wrapper that has already exited. That's why the start lines record `$$` from inside the new group.
- **Playwright's own Chromium isn't installed here.** The repo pins a version whose browser build is missing; `pnpm test:e2e` and `pnpm help:screenshots` fail with `Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-…`. The container config and the driver use `/opt/pw-browsers/chromium`. Don't run `playwright install`.
- **E2E against `pnpm dev` is flaky on first visits**: pages compile on demand and a 5-second assertion can expire (the organizer "session that ends mid-visit" test did; it passed on rerun). Use the production build for a clean run.
- **`pnpm db:migrate` on an already-migrated database prints Postgres `NOTICE` objects** (`schema "drizzle" already exists, skipping`, `relation … already exists, skipping`). They're not errors; it ends with `Done.`
- **Worker health reads `stale` right after the worker starts**, until the first 10-minute dispatch completes. It's informational.
- **Confirmation emails are logged just after the response**, so check a moment later (the driver's `email` waits up to 10s).
- **Buttons can be on screen before they work.** Under `pnpm dev` a page's scripts compile on its first visit, and a click in that gap does nothing: after a restart, **Sign up** on the public page opened no dialog and every later step timed out. The driver waits for the network to go quiet after each navigation and click; in plain Playwright, wait for `networkidle` before clicking.
- **Phone and desktop headers are both in the DOM** (one hidden by CSS), so `draft`, `Public link` and more appear twice. The driver only acts on visible elements; plain Playwright needs `.locator('visible=true')`.
- **The Fields dialog renames itself**: its accessible name changes from `Fields` to `Edit field` once you open a field.
- **Screenshots from `pnpm dev` include Next's "N" badge** in the bottom-left corner.
- **Chromium phones home** (`www.google.com`, `redirector.gvt1.com`), and the container's proxy prints `connect_rejected` for each. Harmless.
- **Scratch TypeScript**: top-level `await` fails in a `.ts` file (`Top-level await is currently not supported with the "cjs" output format`: the package isn't ESM), so use `.mts`; and a file outside the repo can't find packages.

## Troubleshooting

- **`ECONNREFUSED 127.0.0.1:5433`** (migrate, tests, e2e global setup): Postgres doesn't survive a container restart. `service postgresql start`.
- **`failed to connect to the docker API at unix:///var/run/docker.sock`**: no Docker daemon. Use the Postgres setup above.
- **`pnpm start` exits with `EADDRINUSE` on :3000**: an old server still holds the port. `fuser -k 3000/tcp`.
- **Driver: `sign-in email has no usable link`**: the server is `pnpm start`. Run `pnpm dev`.
- **`Cannot find package 'dotenv' imported from /tmp/…`**: a scratch script outside the repo. Put it in the repo root.
