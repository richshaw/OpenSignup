---
name: run-opensignup
description: Build, start and drive OpenSignup (Next.js + Postgres) in a headless Linux container, and take screenshots of it. Use when asked to run or start the app, click through or tophat a change, screenshot a page, sign in as an organizer, sign up as a participant, or run the e2e tests in a cloud container.
---

OpenSignup runs as a production Next.js build on :3000 against Postgres on :5433. `app.sh` brings it all up in one command, and `driver.mjs` drives it: a headless-Chromium REPL that reads commands on stdin and writes screenshots to `/tmp/opensignup-shots/`. All paths are relative to the repo root.

## Prerequisites

Nothing needs installing in the Claude Code cloud container. Node 22, pnpm 9, Postgres 16 (`/usr/lib/postgresql/16/bin`) and Chromium (`/opt/pw-browsers/chromium`) are already there. The Docker CLI is present but its daemon is not, so `docker compose up -d` from the README doesn't work here. `app.sh` starts the preinstalled Postgres instead, which needs root. On a machine where `docker compose up -d` already serves :5433, `app.sh` uses that.

## Build and start

```bash
bash .claude/skills/run-opensignup/app.sh up      # about 75 s, plus pnpm install on a fresh clone
```

`up` runs these steps in order. Each can also run on its own:

| step     | what it does                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env`    | copies `.env.example` to `.env.local` if missing, and fills the three `NEXT_PUBLIC_*` values `pnpm build` refuses to run without                                    |
| `db`     | starts Postgres on :5433 unless something already listens there (data in `/var/lib/postgresql/opensignup`), then `pnpm db:migrate`                                  |
| `seed`   | loads the e2e fixtures (an organizer with a session, a published "Bake Sale", a "Draft Picnic" draft), writes ids to `tests/e2e/.seed.json`, and clears rate limits |
| `build`  | `pnpm build`, logging to `/tmp/opensignup-build.log`                                                                                                                |
| `start`  | `pnpm start` in the background, logging to `/tmp/opensignup.log`, and waits for `/api/public/health`                                                                |
| `stop`   | frees :3000                                                                                                                                                         |
| `status` | shows what's up, plus the seeded ids                                                                                                                                |

After changing code, run `app.sh build` then `app.sh start`. Run `app.sh seed` before each click-through; it also undoes the previous run's sign-ins.

## Drive it (agent path)

Pipe commands to the driver. `${key}` is replaced from `tests/e2e/.seed.json`. When input is piped, the driver stops at the first failing command and exits 1.

```bash
bash .claude/skills/run-opensignup/app.sh seed
rm -rf /tmp/opensignup-shots
node .claude/skills/run-opensignup/driver.mjs <<'EOF'
# participant side: the public page, no account
nav /s/${publicSlug}
wait-for text=Cookies
ss public-page Public signup page
# organizer side: a signed-out deep link, signed in through the real email link
nav /app/signups/${draftSignupId}/build?from=email
ss deep-link Signed out: sent to sign-in with the page as callbackUrl
send-link
email-link
click role=link[name=/Sign in/]
wait-url /build?from=email
wait-for role=heading[name="${draftTitle}"]
ss landed Back on the Build tab after sign-in
sql select status from signups where id = '${draftSignupId}'
errors
EOF
```

Each command echoes as `> cmd` with its result indented below, for example `/tmp/opensignup-shots/03-landed.png`. **Look at the screenshots**, not only the exit code. `ss <name> <caption…>` draws a bar with the caption and current URL, with sign-in tokens masked. Without a caption the shot is plain. Numbering restarts with each run, hence the `rm -rf` above.

A participant signing up, at phone size:

```bash
node .claude/skills/run-opensignup/driver.mjs <<'EOF'
device phone
nav /s/${publicSlug}
click li:has-text("${openSlotLabel}") >> role=button[name=/Sign up/]
fill-label Your name = Pat Example
fill-label Email = pat@example.com
click role=button[name=/Confirm/]
wait-for role=heading[name=/You.re in/]
ss phone-committed Confirmation
EOF
```

Commands (`help` prints them):

| command                                                                         | what it does                                                                           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `nav <path>` / `url` / `text <sel>`                                             | open a page (prints the URL after redirects) / print the URL / print an element's text |
| `click <sel>` / `fill <sel> = <v>` / `fill-label <Label> = <v>` / `press <key>` | act on the first visible match                                                         |
| `wait-for <sel>` / `wait-url <text>` / `sleep <ms>`                             | wait                                                                                   |
| `ss <name> [caption…]`                                                          | screenshot                                                                             |
| `login` / `logout`                                                              | set the seeded organizer's session cookie / drop all cookies (the DB session stays)    |
| `send-link [email]` / `email-link [email]`                                      | on `/login`, send a magic link / open the link that email carries                      |
| `tab <n>` / `device desktop\|phone`                                             | switch tabs (they share cookies) / new 1280×800 or iPhone 14 context                   |
| `errors` / `eval <js>` / `sql <query>` / `seed`                                 | console and page errors / evaluate in the page / query the DB / list the seeded ids    |

`login` is the fast way into the organizer app. Use `send-link` then `email-link` when the sign-in itself is what you're testing.

## Test

```bash
pnpm lint && pnpm typecheck && pnpm test     # unit (no DB)
pnpm test:db                                 # needs app.sh db
pnpm exec playwright test --config .claude/skills/run-opensignup/playwright.config.ts
```

The last line is the e2e suite. Start the app first (`app.sh start`); the config reuses that server. It reseeds the database, so run `app.sh seed` afterwards before driving the app again. The result is 44 passed and 5 skipped; `oauth-consent.spec.ts` skips itself. Plain `pnpm test:e2e` fails in this container (see Troubleshooting).

## Gotchas

- **There is no WebKit here.** The config above runs the `mobile-safari` project on Chromium with the iPhone 14 profile, so a Safari-only bug won't show up. Never run `playwright install`.
- **The server log never contains the magic link.** The console email transport strips query strings from the URLs it logs. `email-link` rebuilds the link from the login code the app stored (`emailed-link.ts`).
- **Magic links are capped at 5 an hour per address.** A few runs in a row start failing on "Send magic link", or with "Too many tries" on the code. `app.sh seed` clears the rate limits.
- **Clicking "Sign out" in the UI deletes the seeded session row.** After that, `login` sets a dead cookie until the next `app.sh seed`. To simulate a session ending, use `logout`.
- **Seeded ids change on every `app.sh seed` and every e2e run.** Use `${key}` rather than pasting ids.
- **Quoted `role=` names must match the whole name.** `role=link[name="Sign in"]` finds nothing, because the link reads "Sign in →". Use `role=link[name=/Sign in/]`. An apostrophe inside `/…/` breaks the selector parser, so write `.` instead (`/You.re in/`).
- **`text=` matches headings too.** On the confirm page, `text=Sign in` hits "Sign in to OpenSignup" first.
- **`click` prints the URL before a client-side navigation lands.** Follow it with `wait-url` or `wait-for`.
- **Stop the server by port, not by name.** `pkill -f "next start"` also matches the calling shell and kills it (exit 144). `app.sh stop` frees the port instead.
- **Screenshots can contain secrets.** The commit confirmation shows the participant's edit link, token included, and this repo is public. Only captions are masked.
- **The worker is not started.** `app.sh` doesn't run `pnpm worker`, so health reports `"worker":"unknown"` and the Postgres log shows `relation "pgboss.job" does not exist`. This is harmless unless you're testing reminders.

## Troubleshooting

- **`browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1217/...`** The installed Playwright expects a newer browser build than the container has. Use the driver or the config above; both launch `/opt/pw-browsers/chromium` (override with `CHROMIUM_PATH`).
- **`Invalid site config: NEXT_PUBLIC_INSTANCE_NAME is required` from `pnpm build`.** `.env.example` leaves the site config blank. Run `app.sh env`.
- **`failed to connect to the docker API at unix:///var/run/docker.sock`.** There's no Docker daemon. Run `app.sh db`.
- **Postgres `PANIC: could not open file ".../global/pg_control": Permission denied`.** The data dir was somewhere whose permissions changed, such as the session scratchpad. `app.sh` keeps the data in `/var/lib/postgresql/opensignup`.
- **`ERROR: locator.click: Timeout 10000ms exceeded.`** Usually the selector matched nothing: see the `role=` gotcha. Check with `eval document.querySelectorAll('<css>').length`.
- **`InvalidSelectorError: ... unexpected symbol ">"`.** There's an apostrophe inside a `/regex/` name.
- **`m.default is not a function` when running `tests/e2e/global-setup.ts` through `tsx -e`.** This is CommonJS interop. `app.sh seed` calls `(m.default.default ?? m.default)()`.
