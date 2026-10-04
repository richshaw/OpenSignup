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

Rows written by the signup, slot, and field services (`signup.*`, `slot.*`,
`field.*`) may also carry `viaClientId`: the connected app's client id
(usually a URL) when the change came through the MCP server rather than the
browser. It is added by `recordActivity` whenever the actor came through
`activityActor` with a bearer-token actor, and is not listed per event. The
key is reserved: `recordActivity` drops a `viaClientId` passed in a caller's
payload, so the only way to set it is through the actor. The `oauth.*` events
identify the app by `clientDomain` instead.

### Signup lifecycle

| event | actor | payload | fired from |
|---|---|---|---|
| `signup.created` | organizer | `{ templateId, fieldsAdded, slotsAdded }` — `templateId` is `default`, `magic-compose`, or `mcp` (created by a connected assistant) | `services/signups.ts` |
| `signup.updated` | organizer | `{ changed }` (the keys the update sent, changed or not) | `services/signups.ts` |
| `signup.published` | organizer | `{ from, to }` | `services/signups.ts` |
| `signup.closed` | organizer | `{ from, to }` | `services/signups.ts` |
| `signup.archived` | organizer | `{ from, to }` | `services/signups.ts` |
| `signup.deleted` | organizer | `{ status }` (the status it had when deleted) | `services/signups.ts` |
| `signup.draft_started` | organizer | `{}` | RSC at `/app/signups/new` |
| `signup.editor_opened` | organizer | `{ section: 'settings' \| 'responses' }` | RSC at `/app/signups/[id]/settings` and `/app/signups/[id]/responses` |
| `signup.previewed` | organizer | `{}` | RSC at `/app/signups/[id]/preview` |
| `signup.viewed` | system | `{ uaClass, refererHost, isReturning, signupStatus }` | RSC at `/s/[slug]` |
| `signup.viewed` | organizer | `{}` (the organizer opening the Build tab, not a participant view; filter on `actor_type = 'system'` to leave these out) | RSC at `/app/signups/[id]/build` |

### Slot / field lifecycle

| event | actor | payload | fired from |
|---|---|---|---|
| `slot.created` | organizer | `{ slotId }` from `addSlot`; `{ count, bulk: true, slotIds, beforeSlotId? }` from `addSlotsBulk` (the bulk endpoint and the `add_slots` tool), one row per call | `services/slots.ts` |
| `slot.updated` | organizer | `{ slotId, changed }` (the keys the update sent) | `services/slots.ts` |
| `slot.reordered` | organizer | `{ slotIds }` (every slot, in the new order; written even when the order did not change) | `services/slots.ts` (`reorderSlots`, from the `reorder_slots` tool; a drag in the Build tab writes a `slot.updated` per moved slot instead) |
| `slot.deleted` | organizer | `{ slotId, commitmentsRemoved, places }` (the sign-ups deleted with it, as commitments and as places) | `services/slots.ts` |
| `field.created` | organizer | `{ fieldId, ref, fieldType, reminderFromFieldRef? }` | `services/slot-fields.ts` |
| `field.updated` | organizer | `{ fieldId, ref, changes, reminderFromFieldRef? }` (`changes` maps each key the update sent to its new value) | `services/slot-fields.ts` |
| `field.deleted` | organizer | `{ fieldId, ref, reminderFromFieldRef?, removedFromGroupByFieldRefs? }` | `services/slot-fields.ts` |

`reminderFromFieldRef` is present only when the change moved the date field
reminders are timed from (`null` when none is left).

### Participant funnel

| event | actor | payload | fired from |
|---|---|---|---|
| `participant.created` | participant | `{ participantId }` | `services/commitments.ts` |
| `commitment.created` | participant | `{ commitmentId, slotId }` | `services/commitments.ts` |
| `commitment.confirmation_sent` | participant | `{ commitmentId, participantId, channel: 'email' }` | `email/notify.ts`, after the response to a sign-up or a move to another slot |
| `commitment.updated` | participant | `{ commitmentId, changed }` (the keys the edit sent) | `services/commitments.ts` |
| `commitment.cancelled` | participant | `{ commitmentId }` | `services/commitments.ts` |
| `commitment.swapped` | participant | `{ from, to }` (the old and new commitment ids) | `services/commitments.ts` |
| `commitment.attempt_failed` | system when signing up; participant when raising a quantity from the edit link | `{ slotId, reason: 'closed' \| 'over_window' \| 'capacity_full', detail?, requested?, remaining?, source? }` (`source: 'update'` marks a quantity raise) | `services/commitments.ts` (each rejection site) |
| `commitment.edit_link_followed` | participant | `{ commitmentId }` | RSC at `/s/[slug]/c/[id]` |

A move to another slot writes `commitment.swapped` and a `commitment.created`
for the new commitment. The old one is cancelled without a
`commitment.cancelled` row.

A participant who gave no email is sent nothing, so their commitments get no
`commitment.confirmation_sent` row (and no `reminder.sent`). A commitment
without one has not always had a send fail.

### Reminder pipeline

| event | actor | payload | fired from |
|---|---|---|---|
| `reminder.sent` | system | `{ commitmentId, participantId, channel: 'email' }` | `jobs/reminders.ts` |
| `reminder.opted_out` | participant | `{ participantId }` | `services/reminder-optout.ts`, from a reminder's unsubscribe link or the mail provider's one-click unsubscribe |
| `reminder.opted_in` | participant | `{ participantId }` | `services/reminder-optout.ts`, from the unsubscribe page, turning reminders back on |

The opt-out rows are written only when the setting changes, so a repeated
unsubscribe adds nothing.

### Marketing / acquisition

| event | actor | payload | fired from |
|---|---|---|---|
| `landing.viewed` | system | `{ uaClass, refererHost }` | RSC at `/` (marketing home) |
| `landing.cta_clicked` | system | `{ cta, uaClass, refererHost }` | client beacon from a landing-page CTA on `/`, via `POST /api/telemetry/landing-cta-clicked?cta=…`. `cta` discriminates which CTA fired: `start_signup` \| `demo_video` |

Both rows have `signup_id` and `workspace_id` set to `NULL` — the page is
tenant-independent. Together they form the top of the organizer funnel
(`landing.viewed` → `landing.cta_clicked` → `auth.magic_link_sent` →
`auth.signed_in` → `signup.draft_started` → `signup.created`).
`landing.cta_clicked` is the only client-emitted event in the catalogue;
all others fire server-side. The beacon reads UA/referer/DNT from request
headers server-side — no client-supplied data is trusted.

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

### Connected apps (OAuth)

| event | actor | payload | fired from |
|---|---|---|---|
| `oauth.consent_granted` | organizer | `{ clientDomain, scopes, extended }` | `oauth/consent.ts` |
| `oauth.consent_denied` | organizer | `{ clientDomain, scopes }` | `oauth/consent.ts` |
| `oauth.grant_revoked` | organizer | `{ clientDomain }` | `oauth/grants.ts` |

These fire when an organizer approves, declines, or disconnects a third-party
app (an AI assistant over MCP, in practice). `signup_id` and `workspace_id`
are `NULL`: a grant belongs to the organizer and spans every workspace they
belong to, so it is not tenant-scoped. `clientDomain` is the host the client
id was served from — the part a client cannot forge — never its self-reported
name; for a client the operator pre-registered in `OAUTH_STATIC_CLIENTS` it is
the configured client id instead, since there is no fetched document.
`scopes` lists the resource scopes only, for granted and denied events alike. `extended` is `true` when the
approval extended an existing grant rather than creating a new one (the
organizer re-approving the same app). No event carries a token, an
authorization code, or an email address.

## Privacy guarantees

The `landing.viewed`, `landing.cta_clicked`, public-page `signup.viewed`, and
`commitment.edit_link_followed` events are deliberately minimal:

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
  count(*) FILTER (WHERE a.event_type = 'signup.viewed' AND a.actor_type = 'system')           AS views,
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

### Reminders sent (last 7 days)

```sql
SELECT count(*) AS sent
FROM activity
WHERE workspace_id = $1
  AND event_type = 'reminder.sent'
  AND occurred_at >= now() - interval '7 days';
```

Besides sends, the activity log records only opt-outs and opt-ins
(`reminder.opted_out`, `reminder.opted_in`): no schedule and no failures.
Nothing schedules a reminder in advance (the dispatch scan finds the due ones
every 10 minutes), and a failed send is retried by pg-boss rather than
recorded here. To find failures, look for `reminder send failed` in the
worker's log, or count failed `reminders.send` jobs in pg-boss's own tables
(`pgboss.job`, then `pgboss.archive` once pg-boss archives them). Those tables
are not scoped to a workspace; to filter by one, join `commitments` on
`commitments.id = j.data->>'commitmentId'`.

```sql
SELECT count(DISTINCT data->>'commitmentId') AS commitments_with_failed_sends
FROM (
  SELECT name, data, state, completed_on FROM pgboss.job
  UNION ALL
  SELECT name, data, state, completed_on FROM pgboss.archive
) AS j
WHERE name = 'reminders.send'
  AND state = 'failed'
  AND completed_on >= now() - interval '7 days';
```

The window is on `completed_on`, which pg-boss sets when a job finally fails, so it counts when sends failed rather than when they were queued. Count commitments, not jobs. The queue does not deduplicate sends: while a
commitment's reminder keeps failing, the dispatch scan enqueues a new job for
it every 10 minutes, and each of those fails on its own, so a two-hour mail
outage leaves about a dozen failed jobs for one commitment. A commitment
counted here may still have had its reminder on a later attempt; its
`reminder.sent` row says so.

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
  AND actor_type = 'system'
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
(`signup.editor_opened`, `signup.previewed`, `signup.draft_started`, and the
Build tab's `signup.viewed`) which are written with the organizer as actor.
The public page's `signup.viewed` is system-actor and does not advance
`last_active_at`.

### What's not captured

- Slot click / commit-dialog open on the participant page — would require
  client JS, deliberately excluded to keep `/s/[slug]` vendor-free and
  privacy-friendly.
- Share-link copy on the organizer side — would require client JS.
- Email delivery, bounce, or complaint events — would require a Resend
  webhook handler. Not implemented. What is recorded is that the mail
  transport accepted a message: `auth.magic_link_sent`,
  `commitment.confirmation_sent` and `reminder.sent`. A send that fails
  writes no row and shows up only in the server or worker log.
- HTTP errors and Web Vitals — these belong in pino + Sentry, not the
  activity log. Sentry env stubs (`SENTRY_DSN`) exist in `src/lib/env.ts`
  but are not yet wired up; see Task 2.8 in the internal v1 build plan
  (`docs/plans/`, kept local).
