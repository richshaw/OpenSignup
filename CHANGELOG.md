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

### Fixed
- Landing-page JSON-LD no longer declares a `SoftwareApplication`, which Google's rich result requires to carry `aggregateRating` or `review`; it now describes the site and its publisher with `WebSite` + `Organization`.
- The landing page rendered two `<h1>` elements — the hero headline plus the example signup card. `SignupViewBody` now emits an `h2` in `showcase` mode.
- Meta descriptions on the landing page, root layout, and the three legal pages are within the 110–160 character range crawlers expect.
- The privacy, terms, and cookies pages now declare a self-referencing canonical URL.
- `/login` and `/login/check` now render the site footer, so both link to the privacy policy and terms.
