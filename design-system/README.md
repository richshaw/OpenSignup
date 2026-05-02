# OpenSignup Design System

> Ad‑free, open‑source coordination for school parents, coaches, and community organizers. A calm, modern way to coordinate sign‑ups.

This folder is the design system for **[OpenSignup](https://github.com/richshaw/OpenSignup)** — a self‑hostable sign‑up coordination tool. It captures the brand's tokens, voice, components, and product surfaces so any agent or designer can produce on‑brand artwork, slides, mocks, and production code without re‑deriving the system from screenshots.

It's lifted directly from the OpenSignup codebase (Tailwind config, `globals.css`, the App‑Router pages and components) — not from screenshots and not from imagination.

---

## What OpenSignup is

A modern, self‑hostable sign‑up and volunteer coordination tool. Organizers create **signups** (a page) containing **slots** (a date, a role, an item, a quantity); **participants** commit to slots **without ever creating an account**.

Four product principles set the tone for everything visual and verbal:

1. **Slots are the atom, not questions.** This is not a form builder.
2. **Participants are not users.** No login, ever, for the people signing up.
3. **Self‑hostable from day one.** `git clone` + Docker Compose, no vendor accounts.
4. **AI‑native.** Clean primitives designed for Claude/MCP/agent surfaces.

The product name is **OpenSignup** (one word). Lowercase `signup` is fine in code/infra (`sig_` ID prefix, `signups` table). An individual entity is "a signup".

### Surfaces

OpenSignup is a single Next.js app with three distinct surfaces — design accordingly:

| Surface | Path | Audience | Vibe |
|---|---|---|---|
| **Marketing / landing** | `/` | Curious organizers | Quiet, confident, no hype |
| **Organizer app** | `/app/...` | Logged‑in organizers | Functional admin chrome |
| **Public participant page** | `/s/[slug]` | Anyone with the link | Frictionless, single‑task |

The participant surface is sacred — it must work for a grandparent on a phone link from a school WhatsApp group. No login, no sidebar, no tabs.

---

## Sources used to build this system

Everything below was extracted from this single repo — no Figma, no screenshots beyond the live app structure.

- **Repo:** `richshaw/OpenSignup` ([github](https://github.com/richshaw/OpenSignup)), branch `main`.
- **Design tokens:** `tailwind.config.ts`, `src/app/globals.css`.
- **Brand voice:** `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, the actual UI copy in pages.
- **Components & layouts:** `src/app/page.tsx` (landing), `src/app/login/page.tsx`, `src/app/s/[slug]/*` (public participant), `src/app/app/(chrome)/*` (organizer dashboard, signup detail, new signup), `src/components/chrome/Crumb.tsx`.

If you want primary sources, clone the repo — the design language is pleasingly small and easy to read end‑to‑end.

---

## Index

Once you've skimmed this README, the rest of the folder is:

```
README.md                 ← you are here
SKILL.md                  ← short skill manifest for Claude Code reuse
colors_and_type.css       ← single source of truth for tokens (CSS vars + base classes)
fonts/                    ← bundled Inter variable fonts (SIL OFL 1.1) + license

assets/                   ← logos, marks
preview/                  ← Design System tab cards (one HTML per token group)
ui_kits/
  participant/            ← public /s/[slug] surface — pixel rebuild
  organizer/              ← /app dashboard + signup detail surface
```

The Design System tab in this project shows everything in `preview/` plus the UI kits, grouped (Type / Colors / Spacing / Components / Brand). Use that tab as your visual table of contents.

The `preview/*.html` cards open fine via `file://` (just double-click). The `ui_kits/*` prototypes use in-browser Babel and **must be served over HTTP** — `python3 -m http.server 8000 --directory design-system` from the repo root, then browse to `http://localhost:8000/ui_kits/...`. See each kit's README.

---

## CONTENT FUNDAMENTALS

OpenSignup's voice is the most distinctive part of the brand — more than the colors. If you can only get one thing right, get the writing right.

### The vibe in one sentence

Calm, dry, anti‑hype. The product respects the reader's time and never asks them to be excited about a sign‑up sheet.

### Casing

- **Sentence case for everything user‑facing.** Page titles, buttons, table headers, form labels — all sentence case. Never Title Case.
  - ✅ "Your signups", "New signup", "Send magic link", "Sign up for Snack — Game 3"
  - ❌ "Your Signups", "Create A New Signup"
- **The product name is one word with one cap: `OpenSignup`.** Never `Open Signup`, never `OPENSIGNUP`. Lowercase `signup` is correct when referring to an instance ("create a signup", "/s/[slug]").
- **Section heads in the docs use sentence case too** — see CLAUDE.md's "Conventions that hurt to violate".

### Person & address

- **Address the reader as "you".** Never "the user", never "users". The product principle "Participants are not users" is taken seriously in copy.
- **First person plural ("we") is used sparingly** — for system actions only ("we'll send you a magic link", "we've saved your spot"). The product doesn't have a personality; "we" is the system, not a brand voice.
- **Never refer to participants as "users".** Say "participants", "people who signed up", or just "people".

### Tone & rhythm

- **Short. Declarative. No hedging.** "You're in." beats "Great news! You've been successfully signed up!"
- **No exclamation points** outside of genuinely warm confirmation copy ("You're in.").
- **No marketing intensifiers.** Avoid: "powerful", "delightful", "seamless", "intuitive", "effortlessly", "amazing". Use: "calm", "ad‑free", "no accounts", "five minutes", real specifics.
- **Lead with the concrete.** "Snack duty — Spring season" is a better placeholder than "My Awesome Event".
- **Errors are kind and short.** "Something went wrong. Try again." — no stack trace, no apology theater.
- **Empty states do work.** They prompt the next action: "No signups yet — start one below." not "Nothing here."

### Specific examples lifted from the codebase

| Surface | Copy |
|---|---|
| Landing hero subtitle | "Ad‑free, open‑source coordination for school parents, coaches, and community organizers. A calm, modern way to coordinate sign‑ups." |
| Login | "Enter your email and we'll send you a magic link. No passwords." |
| New signup placeholder | "Snack duty — Spring season" |
| New signup helper | "You can add slots after it's created. Nothing is visible until you publish." |
| Empty dashboard | "Coordinate snacks, carpool, potluck, volunteer shifts, or anything else." |
| Confirmation modal | "You're in." / "We've saved your spot for X. Bookmark this link to edit or cancel later:" |
| Footer | "Ad‑free · Run by OpenSignup · About" |
| Closed banner | "This signup is no longer collecting responses." |
| Preview banner | "This is what people will see once you publish. No signups will be saved." |

### Punctuation tics

- **The middle dot `·`** is the brand's separator of choice. It appears in footers, slot meta lines, and cards (`Date · Location`, `Ad‑free · Run by OpenSignup · About`). Use it instead of pipes `|` or em‑dashes for inline lists of two or three items.
- **Em‑dashes `—`** are used liberally in body copy and hero blurbs. Always with spaces around them.
- **No emoji.** Anywhere. The product avoids them and so should mocks. Use a Lucide icon if you need a graphical accent.
- **Curly apostrophes** in user‑facing strings (`isn't`, `you're`, `we've`) — the codebase uses `&apos;` for JSX‑escape but the rendered output is curly.

### Numerical conventions

- **Counts use a slash for capacity:** `3/5 signed up`, `0/12`. Never `3 of 5`.
- **Status labels are lowercase single words:** `draft`, `open`, `closed`, `archived`, `full`.
- **Dates are short:** `Tue, Apr 21` for slot rows; locale default is fine.

---

## VISUAL FOUNDATIONS

OpenSignup's visual language is **deliberately quiet**. It looks like a well‑made government form, not a SaaS landing page. Generous whitespace, one accent color, no gradients, no illustrations of smiling families.

### Colors

The whole system runs on a 13‑swatch palette. There are no off‑palette colors anywhere in the codebase.

| Token | Hex | Used for |
|---|---|---|
| `--ink` | `#0b1220` | Body text, headings, dark UI |
| `--ink-muted` | `#5b6474` | Secondary text, helper copy |
| `--ink-soft` | `#8a93a4` | Tertiary, footer, separators |
| `--brand` | `#1f6feb` | Primary buttons, links, focus ring |
| `--brand-soft` | `#dbe7ff` | Available; rarely used in v1 |
| `--surface` | `#ffffff` | Page background |
| `--surface-raised` | `#f7f8fa` | Hover, table headers |
| `--surface-sunk` | `#eef1f5` | Borders, dividers |
| `--success` | `#1a7f4a` | Open status, success states |
| `--warn` | `#b45309` | Draft status, warnings |
| `--danger` | `#be123c` | Errors, destructive actions |

**Status pills use a `color/10` tinted background + the same color for text** — see `--brand-tint`, `--success-tint`, etc. in `colors_and_type.css`. Don't invent new tints.

**No gradients. No alpha overlays except the dialog backdrop (`bg-ink/30 backdrop-blur-sm`).**

### Typography

- **One family: Inter.** The codebase declares `ui-sans-serif/system-ui` as the stack but enables Inter‑specific stylistic sets (`ss01`, `cv02`, `cv11`) via `font-feature-settings` on `<body>`. Read: the system was *designed for Inter* — render that whenever possible.
  - **Fonts that ship here:** Inter is bundled as a self-hosted variable font in `fonts/` (`InterVariable.ttf` + `InterVariable-Italic.ttf`, licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/) — see `fonts/InterVariable-OFL.txt`). JetBrains Mono is still pulled from Google Fonts (used only for code/kbd accents); swap in a self-hosted file if you need fully offline rendering. The OpenSignup app proper does not currently bundle fonts — it relies on the system stack — so this folder is a small superset.
- **Weights used:** 400 (body), 500 (labels, secondary buttons), 600 (headings, primary buttons), 700 only for emphasis runs in body copy.
- **Tracking:** all headings carry `tracking-tight` (`-0.02em`). Body is normal.
- **Sizing in real usage:**
  - Landing h1: `text-4xl sm:text-5xl` (36 → 48px)
  - Participant page h1: `text-3xl` (30px)
  - Dashboard h1: `text-2xl` (24px)
  - Section h2: `text-lg` (18px) — note: small. Hierarchy is more about weight + spacing than size.
  - Body: `text-base` (16px); `text-sm` (14px) for tables and helper copy.

### Spacing & layout

- **Two containers, used consistently:**
  - **`container-tight`** = `max-w-[720px]` on participant pages and login. Small, focused, single‑task.
  - **`max-w-[1100px]`** on the organizer chrome (`/app/...`).
- **Vertical rhythm:** sections separate with `space-y-6` to `space-y-8` (24–32px). Cards have internal padding `p-5` to `p-8` (20–32px) depending on density.
- **List rows:** `flex items-center justify-between gap-4 px-5 py-4` is the canonical row. Memorize it.

### Backgrounds

- **Plain white pages.** The body is `bg-surface` (#ffffff).
- **No full‑bleed imagery, no patterns, no textures, no illustrations.** The aesthetic is closer to a Postgres docs page than a Notion landing page. If you need a "hero" image, the answer is "you don't".
- **Cards float on white** — they use a hairline border (`border-surface-sunk`, #eef1f5), not a shadow, in most places. The shadow (`shadow-card`) is reserved for modals and the occasional elevated surface.

### Borders & dividers

- **Hairline `1px solid #eef1f5`** is the default border. It's almost invisible — you read it as a soft separator more than a frame.
- **Dividers between list rows use `divide-y divide-surface-sunk`** — same color, no shadow, no extra padding.
- **Border radii:** **14px** on buttons, inputs, cards. **18px** on dialogs and large cards. **9999px** (full pill) on status badges. Small (`6px`) only on the focus‑ring outline.
- **Dashed borders** appear on empty states (`border-dashed border-surface-sunk`) — soft cue that something is missing.

### Shadows & elevation

There are exactly **two shadow recipes** in the codebase:

```css
--shadow-card: 0 1px 2px rgb(11 18 32 / 0.04), 0 4px 16px rgb(11 18 32 / 0.06);
--shadow-sm:   0 1px 2px rgb(11 18 32 / 0.04);
```

Use `shadow-card` for dialogs and floating panels. Use `shadow-sm` on inputs (very subtle, almost imperceptible). **No glow, no inner shadow, no colored shadows.**

### Transparency & blur

Used in exactly **one place**: the dialog backdrop. `bg-ink/30 backdrop-blur-sm`. Don't introduce blur elsewhere.

### Interaction states

- **Hover on primary brand buttons:** `hover:brightness-110`. The codebase uses CSS `filter: brightness()` rather than a swapped color so the brand stays consistent.
- **Hover on secondary buttons / list rows:** `hover:bg-surface-raised` (#f7f8fa) or `hover:bg-surface`. Subtle.
- **Hover on text links:** `hover:text-ink hover:underline`. Underlines are pulled out by default and added on hover.
- **No hover scale, no hover translate, no hover shadow.**
- **Press / active states:** the codebase doesn't define any — the browser default is fine. No "shrink on press". Mobile gets `-webkit-tap-highlight-color: transparent; touch-action: manipulation;` from `globals.css` instead.
- **Disabled:** `opacity: 0.5–0.6` plus `cursor-not-allowed`. The brand color stays; just dimmed.
- **Focus ring (universal):** `outline: 2px solid var(--brand); outline-offset: 2px; border-radius: 6px` — applied via `:focus-visible` in `globals.css`. Honor this — don't replace with box‑shadow rings.

### Motion

- **`transition` (no specifics) on hover‑capable elements.** Tailwind defaults — ~150ms ease.
- **No bouncy springs, no stagger, no celebration animations.** Even the success state is just a copy swap inside the same dialog.
- **`useEase: cubic-bezier(0.2, 0.7, 0.2, 1)`** defined here for completeness, but the codebase mostly relies on browser defaults. Anything new should match.

### Imagery

- **None ships in the repo.** No photos, no illustrations, no icon sets beyond Lucide. If a mock needs imagery, prefer:
  - A **placeholder rect** (a flat `--surface-raised` panel with a label) over inventing photography.
  - Real, clearly‑marked screenshots of the UI itself.
- **If you must add imagery,** lean warm/documentary (school gymnasium, paper sign‑up sheet on a clipboard, a hand writing on a list). Wes Anderson if Wes Anderson did open‑source: symmetric framing, muted warm palette. **Ask the user before introducing this** — the brand currently has none of it.

### Layout rules

- **Header bar** on `/app` is a fixed‑height white bar with breadcrumbs left, account right. Single line.
- **Tables** have a `bg-surface-raised` `<thead>` and `divide-y` rows; otherwise no chrome.
- **Forms** stack vertically with `space-y-4`. Each input is full‑width with a label above. The "Add slot" form is the one exception — it grids to 4 columns on `sm:` for inline data entry.
- **Dialogs** anchor to the bottom on mobile (`items-end`), center on `sm:`. Always backdrop‑blur.

---

## ICONOGRAPHY

OpenSignup uses **[Lucide](https://lucide.dev/)** (`lucide-react@^0.468.0`). That's the only icon set in the codebase. Lucide is line‑weight 2px, 24×24 grid, rounded joins — its visual rhythm matches OpenSignup's quiet aesthetic well.

- **No icon font, no SVG sprite.** Each Lucide icon is a tree‑shaken React component (`import { Calendar } from 'lucide-react'`).
- **No emoji.** Ever. Brand decision; honor it.
- **Lucide is loaded from a CDN in this design system** (rather than re‑exporting the npm package) so prototypes work without a build step. See `preview/iconography.html` for an inline picker of the most-used icons, and the UI kits import individual icons inline. If you need icons in a static HTML file, drop them in as inline SVGs from `unpkg.com/lucide-static@latest/icons/<name>.svg` — same source, just static.
- **The middle dot `·`** functions as a kind of semantic icon for "and" / "·" separators in lists. Treat it like part of the icon system.

### Logo & wordmark

OpenSignup doesn't ship a logo file in the repo. The wordmark is **the literal word "OpenSignup" set in Inter Semibold, tracking‑tight**. That's it — the entire brand identity. See `assets/wordmark.svg` for a reusable mark and `assets/favicon.svg` for a square favicon variant. Keep type at >=14px so the joinery between `Open` and `Signup` reads cleanly.

---

## Caveats / things to confirm

- **No Figma was provided**, so this system is reverse‑engineered from the codebase. If a design file exists, share it and I'll reconcile.
- **The OpenSignup app does not yet bundle fonts** (it leans on the system stack). This design-system folder ships Inter so prototypes and mocks render the way they're intended; if/when the app self-hosts Inter, the two will be in lockstep.
- **No logo file in the codebase.** The wordmark + favicon in `assets/` were generated from the type system. Replace if you have a real mark.
- **No imagery** in the brand at all. The codebase doesn't ship any, and the cool‑blue primary system stands alone — no second theme is recommended.
- **The organizer surface is admin‑grade.** It's deliberately under‑designed in the codebase. The UI kit faithfully reproduces that — don't add chrome that isn't there.
