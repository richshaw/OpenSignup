# Telemetry

OpenSignup writes an append-only event log to the `activity` table in
Postgres. There is no built-in analytics dashboard — by design. Operators
point Metabase, Grafana, Superset, or any SQL-aware BI tool at the database
and answer whatever question they care about.

## Schema

Source: [`src/db/schema/activity.ts`](../src/db/schema/activity.ts).

| column         | type           | notes                                                  |
|----------------|----------------|--------------------------------------------------------|
| `id`           | text PK        | prefix `act_`                                          |
| `signup_id`    | text FK        | nullable; cascade delete                               |
| `workspace_id` | text FK        | nullable; cascade delete                               |
| `actor_id`     | text           | organizer id, participant id, or NULL for system       |
| `actor_type`   | text           | `'organizer'` &#124; `'participant'` &#124; `'system'` |
| `event_type`   | text           | one of the events below                                |
| `payload`      | jsonb          | event-specific; see catalogue                          |
| `occurred_at`  | timestamptz    | defaults to `now()`                                    |

Indices: `(signup_id, occurred_at)`, `(workspace_id, occurred_at)`, `(event_type)`.
The column is `text`, not a PG enum, so adding a new event type is a code-only
change — no migration required.

## Event catalogue

Every entry maps to a fired event in the codebase. If you change a payload
shape or add an event, update both the `ACTIVITY_EVENTS` tuple and this table.

### Signup lifecycle

| event | actor | payload | fired from |
|---|---|---|---|
| `signup.created` | organizer | `{ templateId, fieldsAdded, slotsAdded }` | `services/signups.ts` |
| `signup.updated` | organizer | `{ changes }` | `services/signups.ts` |
| `signup.published` | organizer | `{}` | `services/signups.ts` |
| `signup.closed` | organizer | `{}` | `services/signups.ts` |
| `signup.archived` | organizer | `{}` | `services/signups.ts` |
| `signup.duplicated` | organizer | `{ sourceSignupId }` | `services/signups.ts` |
| `signup.deleted` | organizer | `{}` | `services/signups.ts` |
| `signup.draft_started` | organizer | `{}` | RSC at `/app/signups/new` |
| `signup.editor_opened` | organizer | `{ section: 'fields' \| 'slots' \| 'settings' \| 'responses' }` | RSC under `/app/signups/[id]/...` |
| `signup.previewed` | organizer | `{}` | RSC at `/app/signups/[id]/preview` |
| `signup.viewed` | system | `{ uaClass, refererHost, isReturning, signupStatus }` | RSC at `/s/[slug]` |

### Slot / field lifecycle

| event | actor | payload | fired from |
|---|---|---|---|
| `slot.created` / `slot.updated` / `slot.deleted` | organizer | `{ ref }` | `services/slots.ts` |
| `field.created` / `field.updated` / `field.deleted` | organizer | `{ ref, fieldType }` | `services/slot-fields.ts` |

### Participant funnel

| event | actor | payload | fired from |
|---|---|---|---|
| `participant.created` | participant | `{ participantId }` | `services/commitments.ts` |
| `commitment.created` | participant | `{ commitmentId, slotId }` | `services/commitments.ts` |
| `commitment.updated` | participant | `{ changes }` | `services/commitments.ts` |
| `commitment.cancelled` | participant | `{ slotId }` | `services/commitments.ts` |
| `commitment.swapped` | participant | `{ from, to }` | `services/commitments.ts` |
| `commitment.orphaned` | system | `{ slotId }` | `services/commitments.ts` |
| `commitment.attempt_failed` | system or participant | `{ slotId, reason: 'closed' \| 'over_window' \| 'capacity_full', detail?, requested?, remaining? }` | `services/commitments.ts` (each rejection site) |
| `commitment.edit_link_followed` | participant | `{ commitmentId }` | RSC at `/s/[slug]/c/[id]` |

### Reminder pipeline

| event | actor | payload | fired from |
|---|---|---|---|
| `reminder.scheduled` | system | `{ commitmentId, sendAt }` | `services/commitments.ts` |
| `reminder.sent` | system | `{ commitmentId, channel }` | `jobs/reminders.ts` |
| `reminder.failed` | system | `{ commitmentId, error }` | `jobs/reminders.ts` |

### Marketing / acquisition

| event | actor | payload | fired from |
|---|---|---|---|
| `landing.viewed` | system | `{ uaClass, refererHost }` | RSC at `/` (marketing home) |

`landing.viewed` rows have both `signup_id` and `workspace_id` set to `NULL`
— the page is tenant-independent. It is the top of the organizer funnel
(`landing.viewed` → `auth.magic_link_sent` → `auth.signed_in` →
`signup.draft_started` → `signup.created`).

### Auth & workspace

| event | actor | payload | fired from |
|---|---|---|---|
| `auth.magic_link_sent` | system | `{ emailDomain, expiresInMinutes }` | `auth/config.ts` (`sendVerificationRequest`) |
| `auth.signed_in` | organizer | `{ isNewUser }` | `auth/config.ts` (`events.signIn`) |
| `workspace.created` | organizer | `{ kind: 'personal' }` | `auth/adapter.ts` (first-login tx) |

> Note: `auth.magic_link_sent` and `auth.signed_in` are workspace-scoped to
> `NULL` because magic-link delivery happens before the workspace is known
> (and after, in the case of the response). Filter by `event_type` alone
> when computing auth funnels.

## Privacy guarantees

The `landing.viewed`, `signup.viewed`, and `commitment.edit_link_followed`
events are deliberately minimal:

- **No IP address.** Postgres receives no client IP for view events.
- **No request body, form input, or email address** (in view events).
- `uaClass` is one of `'browser'` / `'bot'` / `'unknown'` — never the full
  User-Agent string.
- `refererHost` is the host only (e.g. `news.ycombinator.com`), never the
  path or query string.
- `DNT: 1` and `Sec-GPC: 1` short-circuit the insert before any DB write.
- Bots are skipped via a User-Agent regex.

`auth.magic_link_sent` records only the email **domain**, not the local-part.
Aggregate anti-abuse questions ("what fraction of magic-link sends go to
gmail.com / corporate domains / fresh free-mail providers?") work on the
domain alone, and consumption rate is computed by counting
`auth.magic_link_sent` vs `auth.signed_in` events — neither requires the
recipient's full address.

The remaining PII reachable from activity is the foreign-key path to
`organizers` via `actor_id` when `actor_type = 'organizer'`. Deny `SELECT`
on `organizers` separately if exposing this table to an analytics role.

## Workspace scoping

Every analytics query against tenant-scoped events **must** include
`workspace_id = $1`. Missing this predicate mixes data across workspaces.
The application enforces it at the policy layer; BI consumers must enforce
it in their queries.

## Example queries

### Daily signups created (last 30 days)

```sql
SELECT date_trunc('day', occurred_at) AS day, count(*)
FROM activity
WHERE workspace_id = $1
  AND event_type = 'signup.created'
  AND occurred_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1;
```

### View → commit funnel per signup (last 30 days)

```sql
SELECT
  s.id, s.title,
  count(*) FILTER (WHERE a.event_type = 'signup.viewed')                                       AS views,
  count(*) FILTER (WHERE a.event_type = 'signup.viewed' AND a.payload->>'isReturning' = 'true') AS views_returning,
  count(*) FILTER (WHERE a.event_type = 'signup.viewed' AND a.payload->>'uaClass'    = 'bot')   AS views_bot,
  count(*) FILTER (WHERE a.event_type = 'commitment.created')                                  AS commits,
  count(*) FILTER (WHERE a.event_type = 'commitment.attempt_failed')                           AS attempt_failures,
  count(*) FILTER (WHERE a.event_type = 'commitment.cancelled')                                AS cancels
FROM activity a
JOIN signups s ON s.id = a.signup_id
WHERE a.workspace_id = $1
  AND a.occurred_at >= now() - interval '30 days'
GROUP BY s.id, s.title
ORDER BY views DESC;
```

### Magic-link consumption rate (last 7 days)

```sql
SELECT
  count(*) FILTER (WHERE event_type = 'auth.magic_link_sent') AS sent,
  count(*) FILTER (WHERE event_type = 'auth.signed_in')       AS signed_in,
  count(*) FILTER (WHERE event_type = 'auth.signed_in'
                     AND payload->>'isNewUser' = 'true')      AS first_logins
FROM activity
WHERE occurred_at >= now() - interval '7 days';
```

### Commit-attempt failures broken down by reason

```sql
SELECT
  payload->>'reason' AS reason,
  count(*)
FROM activity
WHERE workspace_id = $1
  AND event_type = 'commitment.attempt_failed'
  AND occurred_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 2 DESC;
```

### Reminder pipeline health (last 7 days)

```sql
SELECT
  count(*) FILTER (WHERE event_type = 'reminder.scheduled') AS scheduled,
  count(*) FILTER (WHERE event_type = 'reminder.sent')      AS sent,
  count(*) FILTER (WHERE event_type = 'reminder.failed')    AS failed
FROM activity
WHERE workspace_id = $1
  AND occurred_at >= now() - interval '7 days';
```

### Organizer engagement: editor pageviews per section

```sql
SELECT
  payload->>'section' AS section,
  count(*) AS opens,
  count(DISTINCT actor_id) AS distinct_organizers
FROM activity
WHERE workspace_id = $1
  AND event_type = 'signup.editor_opened'
  AND occurred_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 2 DESC;
```

### Bot / DNT impact check (sanity)

```sql
SELECT payload->>'uaClass' AS ua_class, count(*)
FROM activity
WHERE event_type = 'signup.viewed'
GROUP BY 1;
-- expected: 'browser' >> 'unknown' > 0; 'bot' should be 0 (filtered upstream).
```

## Operational notes

### Volume

Pageview-shaped events (`landing.viewed`, `signup.editor_opened`,
`signup.previewed`, `signup.viewed`, `signup.draft_started`,
`commitment.edit_link_followed`) fire on every RSC render. Refreshes count. The activity table grows mostly
with these events. All dashboard queries should filter on `event_type` so
read performance scales with the queried subset, not the table size.

If write volume becomes a concern, splitting pageview events into a separate
table is a future optimization and would not change the egress contract
documented here.

### Adding event types

1. Append the new string literal to the `ACTIVITY_EVENTS` tuple in
   `src/db/schema/activity.ts`.
2. Fire it via `recordActivity(tx, { ... })` from a service or RSC.
3. Update the catalogue in this file.

The TypeScript compiler will enforce that every `recordActivity` call site
uses a known event type.

### Organizer activity timestamps

Every `recordActivity` call with `actor_type = 'organizer'` and a non-null
`actor_id` also bumps `organizers.last_active_at` on the same handle
(transaction-internal when the caller is inside one). WAU / MAU can therefore
be answered directly:

```sql
SELECT count(*) FROM organizers
WHERE last_active_at >= now() - interval '7 days';
```

without a `SELECT DISTINCT actor_id` scan of `activity`. The definition of
"active" is "any organizer-actor activity write" — signup mutations, slot
edits, `auth.signed_in`, **and** the organizer-side RSC pageview events
(`signup.editor_opened`, `signup.previewed`, `signup.draft_started`) which
are written with the organizer as actor. `signup.viewed` is system-actor
and does not advance `last_active_at`.

### What's not captured

- Slot click / commit-dialog open on the participant page — would require
  client JS, deliberately excluded to keep `/s/[slug]` vendor-free and
  privacy-friendly.
- Share-link copy on the organizer side — would require client JS.
- Email delivery, bounce, or complaint events — would require a Resend
  webhook handler. Not implemented; magic-link / reminder delivery success
  is currently observable only via `reminder.sent` / `reminder.failed` and
  pino logs.
- HTTP errors and Web Vitals — these belong in pino + Sentry, not the
  activity log. Sentry env stubs (`SENTRY_DSN`) exist in `src/lib/env.ts`
  but are not yet wired up; see Task 2.8 in
  [`docs/plans/2026-04-19-signup-v1.md`](plans/2026-04-19-signup-v1.md).
