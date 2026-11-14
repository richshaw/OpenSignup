---
name: translate
description: Translate OpenSignup's text into a language, or bring a language up to date after its English changed, then have a different model review the result from screenshots and rendered emails. Use when asked to translate OpenSignup, add a language, fill in or fix sv.json (or any src/messages catalog), review a translation, or update translations; and in any pull request that changes src/messages/en.json, since each shipped language has to be updated in the same pull request.
---

# Translate

OpenSignup has no human translators. A language is translated by a Claude
session following this skill, and checked by a different model, which reads
the result in context: screenshots of every participant screen and the
rendered emails. The four steps below are the same for a whole language and
for one changed sentence.

Read `docs/translating.md` before you write a word. It explains the catalogs,
how to write ICU messages (plurals, selects, tags, numbers), what the checks
catch and what they miss, and holds the glossary for each language. The
glossary decides the words; follow it, or change it in the same pull request
and say why.

## Get set up

Translating needs only the JSON, but steps 2 and 3 need the app: the checks,
a production build and the e2e specs. Follow the `run-opensignup` skill
(`.claude/skills/run-opensignup/SKILL.md`) for Postgres, `.env.local` and
migrations. In Claude's cloud container:

```bash
pg_isready -h localhost -p 5433 || service postgresql start
pnpm install --frozen-lockfile && pnpm db:migrate
```

## 1. Translate what's missing or stale

List what needs doing, namespace by namespace:

```bash
pnpm exec tsx .claude/skills/translate/scripts/to-translate.mjs sv
```

It compares `src/messages/sv.json` with `en.json` in the participant
namespaces (`participant`, `email`, `common`) and lists each message as:

- **missing**: English has it and the translation doesn't;
- **stale**: its English changed on this branch and the translation didn't, so
  it may still say the old thing;
- **check**: both changed on this branch; read them together;
- **extra**: the translation has a key English doesn't; delete it.

It compares English with where your branch left `origin/main`. On a branch
stacked on another, pass the branch below as the base:
`to-translate.mjs sv origin/<base-branch>`. For organizer text, add
`--audience organizer`; organizer text stays English for now, so only do that
when asked.

Then translate in `src/messages/<language>.json`, one namespace at a time,
from `en.json`:

- Keep the keys in `en.json`'s order, and `pnpm format` the file after.
- Keep every placeholder, tag and select branch, with the same names. Move
  them to wherever the sentence reads naturally.
- Give each plural the branches the language's grammar needs (CLDR's plural
  categories), with the number in every branch that should show it. Move
  words into the branches when they agree with the number.
- Keep the spaces at the start of a select branch; they join two sentences.
- Write `{n, number}`, not English's `{n, number, ::group-off}`, unless the
  glossary says otherwise.
- Use the glossary's words, its tone and its punctuation. Translate the
  meaning, not the words: a calque that reads as English in disguise is a
  finding waiting to happen.
- Watch the length of buttons and labels. Some sit in fixed boxes 80 pixels
  wide (the row's Sign up button, the sheet's Spots box).
- Never edit `en.json` to suit a translation in the same step. If the English
  is wrong or can't be translated well, change it on purpose, as English, and
  say so in the pull request.

## 2. Run the checks

```bash
pnpm test src/i18n src/email
pnpm lint && pnpm format:check && pnpm typecheck && pnpm knip && pnpm test
```

The first line runs the catalog check, the two formatters' comparison and the
email tests; the second is what CI runs. A catalog check line reads
`<language> <key>: <what's wrong>`: fix the message it names. If you changed
`en.json`, run `pnpm build` (or `pnpm dev`) once so `src/messages/en.d.json.ts`
is rewritten, and commit it.

For labels in fixed boxes, also run the layout spec on the built app (below):
`tests/e2e/slot-row-layout.spec.ts`.

## 3. Have a different model review it in context

Make what the reviewer reads. With no dev server running:

```bash
pnpm build
pnpm translation:screenshots -c .claude/skills/run-opensignup/playwright.container.config.ts
```

Leave out the `-c …` part outside Claude's cloud container: it points
Playwright at the Chromium installed there. The command writes, under
`translation-review/` (gitignored):

- `<language>/screens/chromium/*.png` and `<language>/screens/chromium-phone/*.png`:
  each participant screen and state the Swedish e2e spec checks, at desktop
  and phone width;
- `en/emails/*.html` and `<language>/emails/*.html`, with a `.txt` of each:
  every participant email, from `scripts/lib/email-samples.ts`.

Open a few of the images yourself first, to be sure they show what they say.
If a spec fails on `rate_limited` after several runs in an hour, empty the
`rate_limits` table in your own database and run it again.

Then start the reviewer as a subagent with the Agent tool, **on a model other
than your own** (set the tool's `model`; your system prompt names yours), so
the review isn't the translator marking its own work. Give it the prompt in
`references/review.md`, with its `<…>` parts filled in. If your Agent tool has
no `model` setting, start a separate cloud session for the review instead
(`create_session` with a `model`, on your pushed branch), and have it run
steps 2 and 3's commands before reviewing.

## 4. Fix what it finds, and list it in the pull request

Check each finding against the English and the glossary before you change
anything: reviewers are sometimes wrong. Then:

- fix the messages, and run step 2's checks again;
- re-take the screenshots if a fix could change how something fits;
- if a finding changes a glossary word, change the glossary in
  `docs/translating.md` and every message that uses the word, in the same pull
  request;
- don't change English to settle a translation finding without saying so.

In the pull request, add a section listing every finding: the key, what the
reviewer said, and what you did (fixed, with the new text; or not, and why).
Name the model that reviewed. Matters of taste you didn't take go in the
glossary's open questions, so the next pass sees them.

## When English changes

A pull request that changes English text people read changes it in `en.json`,
and in the same pull request runs this skill for every language in `SHIPPED`
(`src/i18n/config.ts`). For a language with a catalog that hasn't shipped yet
(Swedish today), do it too, so the language stays ready to launch. A one-line
change still gets the review; give the reviewer just the changed keys and the
screens they show on.

## Adding a language

Follow "Adding a language" in `docs/translating.md`: the catalog, its test
signups and screenshot spec, and its glossary come before step 1. Its launch
(adding it to `SHIPPED.participant`) is a pull request of its own, for the
owner to approve.

## Report

Say which namespaces you translated, how many messages, what the checks said,
which model reviewed, and each finding with what you did about it. Name
anything you couldn't check: a message no screenshot shows (judge it from its
key and its English), or a screen the e2e spec doesn't reach.
