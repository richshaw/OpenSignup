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
- Reminder emails the day before a dated slot, via pg-boss.
- Pluggable email transport: console, SMTP, Resend.
- AGPL-3.0 license.

### Changed
- Reminders are set on the date field itself: the field editor on the Build tab has a "Send a reminder email before this date" checkbox, one date field per signup carries it (a bell marks it in the fields list), and the Settings tab's reminders card is gone — Settings keeps only the danger zone.
- Reminders go out a fixed 24 hours before a slot. The per-signup lead time (`reminderLeadHours`, 2/24/48/72h) is gone: `slot_at` pins the organizer's wall clock to UTC because a signup carries no timezone, so a short lead was wrong by the organizer's UTC offset, and a longer one was rarely what anyone meant. Migration `0005` drops the stored value; `sendReminders` remains the only off switch.
- `settings.reminderFromFieldRef` is now always the date field slots take their instant from — calendar links, date ordering and reminder timing all read it. It is set on creation (the first date field), moved by the field services when that field is deleted or retyped, and refused by `PATCH /api/signups/[id]` when it names anything else; an omitted key keeps the current anchor instead of clearing it. Migration `0005` pins it on existing signups and rebuilds `slot_at` where the old auto-pick had resolved to nothing.
- The reminder time-of-day field is paired with the chosen date field rather than picked globally, so a return date can no longer be stamped with a departure time.
- Removed the orphaned `/app/signups/[id]/fields` and `/app/signups/[id]/slots` pages and the server actions only they used. Neither was reachable from the signup tabs; the Build tab already covers field and slot editing and grouping.

### Fixed
- Adding, editing or deleting a slot field now rebuilds `slots.slot_at`. Previously only deleting the chosen date field did, so a field change could leave some slots stale and others null depending on edit order.
- A signup with two date fields and no chosen one used to resolve to *no* date field, which silently switched off reminders and the "Add to calendar" button for the whole signup. Resolution no longer guesses; the anchor is always explicit.
- The build page now mirrors the server when a field change moves or drops the reminder anchor or the group-by field, so its next settings save cannot resurrect a field that no longer exists.
- Slot fields added without an explicit `sortOrder` now append instead of landing at position 0. The build page never sends one, so every field it added sorted ahead of the template's date column (`DEFAULT_TEMPLATE` pins it at 1) and reappeared mid-grid after a reload. Appends take a row lock on the signup so two concurrent adds cannot claim the same position.
- Landing-page JSON-LD no longer declares a `SoftwareApplication`, which Google's rich result requires to carry `aggregateRating` or `review`; it now describes the site and its publisher with `WebSite` + `Organization`.
- The landing page rendered two `<h1>` elements — the hero headline plus the example signup card. `SignupViewBody` now emits an `h2` in `showcase` mode.
- Meta descriptions on the landing page, root layout, and the three legal pages are within the 110–160 character range crawlers expect.
- The privacy, terms, and cookies pages now declare a self-referencing canonical URL.
- `/login` and `/login/check` now render the site footer, so both link to the privacy policy and terms.
- Slot `date` and `time` values are validated as real dates and times, not just as shapes: `2026-13-45`, `2026-02-30` and `99:99` are rejected on the way in, and `extractSlotAt` never stores an Invalid Date.
- A date-only slot is anchored at noon UTC rather than midnight, so its day-before reminder lands on the day before in every timezone from UTC-11 to UTC+11 (it used to arrive two days early for organizers west of Greenwich). Its calendar export is now an all-day event rather than a timed one at 12:00Z. Migration `0006` moves existing date-only slots.
