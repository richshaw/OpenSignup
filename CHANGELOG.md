# Changelog

All notable changes to OpenSignup are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow semantic versioning.

## [Unreleased]

### Added
- Landing-page CTA click telemetry (`landing.cta_clicked` activity event).
- Initial v1 scaffolding: Next.js 15 + TypeScript + Drizzle + Auth.js v5 + pg-boss.
- Full entity schema (workspaces, organizers, members, signups, slot groups, slots, participants, commitments, activity, magic links, claims).
- Zod schemas as source of truth with discriminated union on `slot_type`.
- Capacity-safe commitment service with `(slot_id, position)` unique enforcement.
- Organizer magic-link login and personal-workspace auto-create.
- Mobile-first participant page with bottom-drawer commit flow.
- 48-hour reminder emails via pg-boss.
- Pluggable email transport: console, SMTP, Resend.
- AGPL-3.0 license.

### Changed
- Reminder anchor resolution is now total: a signup with two or more date fields auto-picks the first (by `sortOrder`, then `ref`) instead of resolving to no anchor at all. Setting `reminderFromFieldRef` explicitly still wins, and still does not fall back if it points at nothing.
- The reminder time-of-day field is paired with the chosen date field rather than picked globally, so a return date can no longer be stamped with a departure time.
- Reminder lead times no longer offer "2 hours before". `slot_at` pins the organizer's wall clock to UTC, so every reminder is off by the organizer's UTC offset; at 24h that is a rounding error, at 2h it exceeds the lead. Migration `0005` moves stored 2h signups to 24h. Short leads return once a signup carries a timezone.
- Slot `date` and `time` values are validated as real dates and times, not just as shapes: `2026-13-45`, `2026-02-30` and `99:99` are rejected on the way in.
- The orphaned `/app/signups/[id]/fields` and `/app/signups/[id]/slots` pages are removed, along with the server actions only they used. Neither was in `TabsNav`; the build page already covers field CRUD, slot CRUD and grouping, and `/fields` held a second, contradictorily-labelled copy of the reminder anchor control.

### Fixed
- Adding, editing or deleting a slot field now rebuilds `slots.slot_at`. Previously only `deleteField` did so, and only when `reminderFromFieldRef` happened to be set, so a field change left some slots stale and others null depending on edit order — one signup where whether you got a reminder depended on when your slot was created. `pnpm backfill:slot-at` repairs existing rows.
- Retyping the reminder anchor field away from `date` now clears `reminderFromFieldRef`, matching what deleting the field already did. It previously left the ref dangling, which silently stopped reminders for the whole signup.
- The reminder date field on the settings page is keyed on its saved value, like the two controls beside it, so it cannot show a stale value after a save.
- The reminder date field's default option read "— No reminder —" while reminders were in fact being sent from the auto-picked date field. It now names the field it resolves to. `sendReminders` remains the only off switch.
- `extractSlotAt` returns null rather than an Invalid Date for an unparseable value. A NaN date never compares equal to itself, so `recomputeSlotAtForSignup` rewrote that row on every pass.
- The dispatcher's `sendReminders` check no longer casts jsonb straight to boolean. One row holding a non-boolean made the cast throw, failing the whole query and stopping reminders for every signup in the deployment on every tick.

- Landing-page JSON-LD no longer declares a `SoftwareApplication`, which Google's rich result requires to carry `aggregateRating` or `review`; it now describes the site and its publisher with `WebSite` + `Organization`.
- The landing page rendered two `<h1>` elements — the hero headline plus the example signup card. `SignupViewBody` now emits an `h2` in `showcase` mode.
- Meta descriptions on the landing page, root layout, and the three legal pages are within the 110–160 character range crawlers expect.
- The privacy, terms, and cookies pages now declare a self-referencing canonical URL.
- `/login` and `/login/check` now render the site footer, so both link to the privacy policy and terms.
