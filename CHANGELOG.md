# Changelog

All notable changes to Signup are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow semantic versioning.

## [Unreleased]

### Added
- Initial v1 scaffolding: Next.js 15 + TypeScript + Drizzle + Auth.js v5 + pg-boss.
- Full entity schema (workspaces, organizers, members, signups, slot groups, slots, participants, commitments, activity, magic links, claims).
- Zod schemas as source of truth with discriminated union on `slot_type`.
- Capacity-safe commitment service with `(slot_id, position)` unique enforcement.
- Organizer magic-link login and personal-workspace auto-create.
- Mobile-first participant page with bottom-drawer commit flow.
- 48-hour reminder emails via pg-boss.
- Pluggable email transport: console, SMTP, Resend.
- AGPL-3.0 license.
