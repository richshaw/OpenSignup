#!/usr/bin/env bash
# Brings OpenSignup up (or down) in a headless Linux container. Run from anywhere in the repo.
#
#   app.sh up       db + env + deps + seed + build + start (everything below, in order)
#   app.sh db       Postgres on :5433 (starts the preinstalled PG 16 if nothing listens there), then migrates
#   app.sh env      .env.local from .env.example, filled with the values `pnpm build` insists on
#   app.sh seed     e2e fixture data -> tests/e2e/.seed.json, and clears rate limits
#   app.sh build    pnpm build (log: /tmp/opensignup-build.log)
#   app.sh start    pnpm start in the background (log: /tmp/opensignup.log), waits for /api/public/health
#   app.sh stop     stops whatever listens on :3000
#   app.sh status   what is up, and the seeded ids
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

PORT=3000
LOG=/tmp/opensignup.log
BUILD_LOG=/tmp/opensignup-build.log
PGBIN=/usr/lib/postgresql/16/bin
# Postgres must be able to traverse the path to its data dir, and a scratch dir's
# permissions can change under it, so the cluster lives in postgres's own home.
PGROOT=/var/lib/postgresql/opensignup

listening() { (echo >"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

set_env() { # set_env KEY VALUE: fills KEY in .env.local only when it is missing or blank
  if grep -q "^$1=." .env.local; then return; fi
  if grep -q "^$1=" .env.local; then
    sed -i "s|^$1=.*|$1=$2|" .env.local
  else
    echo "$1=$2" >>.env.local
  fi
}

cmd_env() {
  [ -f .env.local ] || cp .env.example .env.local
  # src/lib/site-config.ts parses these at build time; .env.example leaves them blank.
  set_env NEXT_PUBLIC_INSTANCE_NAME 'OpenSignup (local)'
  set_env NEXT_PUBLIC_SUPPORT_EMAIL 'support@example.com'
  set_env NEXT_PUBLIC_GOVERNING_LAW 'Example State'
  local secret
  secret=$(grep '^AUTH_SECRET=' .env.local | cut -d= -f2-)
  if [ ${#secret} -lt 32 ]; then sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -hex 32)|" .env.local; fi
  echo "env: .env.local ready"
}

cmd_deps() {
  [ -d node_modules/.bin ] || pnpm install --frozen-lockfile
}

cmd_db() {
  cmd_env >/dev/null
  if listening 5433; then
    echo "db: something already listens on :5433 (docker compose or an earlier run); using it"
  else
    if [ ! -x "$PGBIN/initdb" ]; then
      echo "db: nothing on :5433 and no $PGBIN. Start Postgres with: docker compose up -d" >&2
      exit 1
    fi
    if [ ! -d "$PGROOT/data" ]; then
      mkdir -p "$PGROOT" && chown postgres:postgres "$PGROOT"
      su postgres -c "$PGBIN/initdb -D $PGROOT/data -U postgres --auth=trust" >/dev/null
      su postgres -c "$PGBIN/pg_ctl -D $PGROOT/data -o '-p 5433 -k /tmp' -l $PGROOT/log -w start" >/dev/null
      psql -h localhost -p 5433 -U postgres -q \
        -c "create role signup login password 'signup' superuser" \
        -c "create database signup owner signup"
    else
      su postgres -c "$PGBIN/pg_ctl -D $PGROOT/data -o '-p 5433 -k /tmp' -l $PGROOT/log -w start" >/dev/null
    fi
    echo "db: started Postgres 16 on :5433 (data $PGROOT/data, log $PGROOT/log)"
  fi
  cmd_deps
  pnpm -s db:migrate >/dev/null
  echo "db: migrated"
}

cmd_seed() {
  # The same fixtures the e2e suite uses: an organizer with a session, published and
  # draft signups, a commitment with an edit token. Rewrites tests/e2e/.seed.json.
  pnpm -s exec tsx -e "import('./tests/e2e/global-setup.ts').then((m) => (m.default.default ?? m.default)()).then(() => process.exit(0))"
  # Magic links are capped at 5 an hour per address; local runs hit that fast.
  psql "$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-)" -qc 'delete from rate_limits'
  echo "seed: done (ids in tests/e2e/.seed.json), rate limits cleared"
}

cmd_build() {
  echo "build: pnpm build (about a minute)"
  if ! pnpm build >"$BUILD_LOG" 2>&1; then
    tail -30 "$BUILD_LOG" >&2
    exit 1
  fi
  echo "build: ok"
}

cmd_stop() {
  # By port, never `pkill -f "next start"`: that pattern also matches the calling shell.
  if listening $PORT; then
    fuser -k -TERM $PORT/tcp >/dev/null 2>&1 || true
    timeout 15 bash -c "while (echo >/dev/tcp/127.0.0.1/$PORT) 2>/dev/null; do sleep 0.5; done"
    echo "stop: :$PORT is free"
  else
    echo "stop: nothing on :$PORT"
  fi
}

cmd_start() {
  cmd_stop >/dev/null
  setsid nohup pnpm start >"$LOG" 2>&1 </dev/null &
  if ! timeout 60 bash -c "until curl -sf localhost:$PORT/api/public/health >/dev/null; do sleep 1; done"; then
    tail -30 "$LOG" >&2
    exit 1
  fi
  echo "start: http://localhost:$PORT is up (log $LOG)"
}

cmd_status() {
  listening 5433 && echo "db:  up on :5433" || echo "db:  down"
  if listening $PORT; then echo "app: $(curl -s localhost:$PORT/api/public/health)"; else echo "app: down"; fi
  if [ -f tests/e2e/.seed.json ]; then
    node -e "const s=require('./tests/e2e/.seed.json'); for (const k of ['organizerEmail','draftSignupId','draftTitle','publicSlug','editSlug']) console.log('seed', k.padEnd(15), s[k])"
  else
    echo "seed: none (run app.sh seed)"
  fi
}

case "${1:-}" in
  up) cmd_env; cmd_db; cmd_seed; cmd_build; cmd_start ;;
  env) cmd_env ;;
  db) cmd_db ;;
  seed) cmd_seed ;;
  build) cmd_build ;;
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  *) sed -n '2,12p' "$0"; exit 2 ;;
esac
