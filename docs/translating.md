# Translating OpenSignup

OpenSignup can show a signup, its sign-up sheet, the pages for changing or
cancelling a spot and its emails in the signup's own language. English is the
only language people can choose today. Swedish is being translated and isn't
offered yet.

This guide is for anyone who changes English text people read, adds a
language, or fixes a translation, including an AI assistant doing any of
those. It says where the words live, how to write a message, what the checks
catch and what they miss, and when a language can be offered. The Swedish
glossary is at the end.

Translations are made and checked by machine. Nobody is paid to translate, so
a Claude session translates with the `translate` skill
(`.claude/skills/translate/SKILL.md`), and a different model reviews the result
from screenshots of the participant screens and the rendered emails.
Corrections from people who speak the language are welcome as pull requests.

## Where the words live

Each language has one catalog, `src/messages/<language>.json`. English,
`en.json`, is the source: every other catalog has some or all of its keys and
nothing else.

A catalog's top-level sections are its namespaces. Each audience reads its
own, as `AUDIENCE_NAMESPACES` in `src/i18n/config.ts` lists them:

| Audience    | Namespaces                       | What's in them today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| participant | `participant`, `email`, `common` | The signup's page, the sign-up sheet, the edit, cancelled and unsubscribe pages, both not-found pages, the participant emails, and the footer's links                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| organizer   | `organizer`, `auth`, `common`    | Organizer text: on a participant page, the bar across the top, the Preview banner and the note on your own draft; in the organizer app, the header, the crumbs, Your signups, the card for a signup that can't be loaded, account Settings and Connected apps, on a signup's own pages its header, status, tabs, publish, close and reopen, and the share panel, a signup's Settings, Build and Responses tabs and the column names and statuses in its CSV, New signup, every Magic Compose screen and the banner on a draft it made, and what New signup, the Settings pages and Connected apps say when a save is refused; and, in `auth`, the sign-in pages, the sign-in email, and the screen that connects an AI assistant with its permissions and error pages |
| site        | `site`, `common`                 | Nothing yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

`site` has no messages yet. `participant.defaults` holds the names
a new signup's first fields get ("What", "Date") and a new field's ("Untitled",
"Option 1"). Organizers see them on the Build tab, but they become the
signup's own text, which participants read, so they're in the signup's
language. `participant.share` is the same: the message the share panel offers
an organizer to send with the link ("21 spots open", "Sign up here, no account
needed: …") is read by the people it's sent to, so it's in the signup's
language, though the panel around it is in the organizer's.

Organizer text is in the organizer's own language (`localeOfOrganizer`,
below), and marked with it where it sits on a page in a signup's language.
While no language but English has shipped to organizers, that's English for
everyone. The other way round, a signup's own words in the organizer app are
in the signup's language, whatever the organizer's, and marked with it where
the two differ (`langWhereDifferent` in `src/i18n/config.ts`): so far its title
on Your signups, in its header and as the last crumb, and the message the
share panel offers to send. On Preview, the tip of a disabled Sign up button
is the organizer's: a `title` can't carry a language of its own, so screen
readers get the tip from hidden text marked with the organizer's language
(`aria-describedby`), while the title still shows it to a mouse. The landing, help and legal pages,
and API error text and AI connector tool descriptions aren't in the catalogs
at all. API errors and tool descriptions stay English on purpose:
developers and models read them. A screen never shows an API error's `message`
(but for Magic Compose's `refusal`, whose message is the AI's own reason): it
words the error itself, from its `code` and `details.reason` (`ErrorReason` in
`src/lib/errors.ts`), so its words can be in the reader's language.

A language's catalog can be partial. Any message it lacks comes out in
English (`withEnglishUnder` in `src/i18n/translator.ts`), so a half-done
language never shows a key's name.

Each language but English also has a record of the English each of its
messages was translated from, `src/i18n/translated-from/<language>.json`, so
the catalog check can tell when a translation has fallen behind its English
(see "Stale translations").

## How a message reaches the screen

**Which language.** Every page, email and new signup gets its language by
one rule, `resolveLocale` in `src/i18n/config.ts`: the stored language if it
has shipped to that audience, else the site's `DEFAULT_LOCALE` if it has,
else English. Nothing reads the browser but `newOrganizerLocale`, once, when
an account is created. Ask for the language of what you're rendering:

| You're rendering, or deciding                                                                    | Ask (`src/i18n/locale.ts` unless named)                                                        |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| A signup's pages, its emails, and its own words wherever they show (title, slots, share message) | `localeOfSignup(signup.settings.locale)`                                                       |
| An organizer's own screens, the consent screen, CSV headers                                      | `localeOfOrganizer(session)`                                                                   |
| A page nobody is signed in on: `/login` and its check and confirm pages, the OAuth error pages   | `signInLocale()`: the site default, else English                                               |
| The sign-in email, which has an address but no session                                           | `signInEmailLocale(db, email)` (`src/auth/sign-in-email-locale.ts`)                            |
| A `/s` page with no signup in hand: not-found, a link it can't read                              | `requestedSignupLocale()` or `signupLocaleForSlug(slug)` (`src/app/s/[slug]/signup-locale.ts`) |
| What to store: on a new signup, on a new account                                                 | `newSignupLocale(session)`, `newOrganizerLocale(…)` (`src/i18n/organizer-locale.ts`)           |

Each organizer page asks `localeOfOrganizer` with its own session, since a
layout above it doesn't re-render on a client-side navigation, and passes the
language to `getServerTranslator`. The sign-in pages (`/login`, the
check-your-email and confirm pages) have nobody signed in, so `signInLocale`
is the language an account with nothing stored gets, and nothing is worked
out from the browser. The sign-in email is in `signInEmailLocale`
(`src/auth/sign-in-email-locale.ts`): the language the organizer app would
show the account at its address, so an address with no account gets the
sign-in pages' language. It's read only once the request has been charged to
the sign-in rate limits. The screen that connects an AI assistant (OAuth
consent) and the replies when the organizer chooses are in
`localeOfOrganizer`, since they're signed in by then, and so are the
permission lines on it and on Connected apps (`auth.scopes`). The OAuth
provider's error page and its rate-limit page are in `signInLocale`, since the
provider doesn't know who is signed in. An app's name and domain, the scope
names, the error codes and the JSON `error_description` clients read stay as
they are.

- **Server code** (pages, emails, the reminder worker) calls
  `getServerTranslator(locale, namespace)` from `src/i18n/server.ts`.
- **Client components** call next-intl's `useTranslations` inside
  `<ClientMessages>`, which the page above them fills from `messagesFor`, with
  the sections they read. Only those sections reach the browser. The
  participant forms' lists are in `src/app/s/[slug]/client-namespaces.ts`,
  the Build tab's in `src/components/build-wysiwyg/client-namespaces.ts`, and
  Magic Compose's in `src/components/magic-compose/client-namespaces.ts`, so a
  client component that reads a new section needs it added there, or it shows
  the key's name and logs an error. The banner on a draft Magic Compose made
  words its warnings in the browser, from codes the tab keeps: the signup's
  layout passes it `organizer.aiDraft.warnings`, and it loads the provider
  only when there are warnings to show.
- **A signup's own words in the organizer app** are in the signup's language,
  whatever the organizer's. The Build tab formats its dates and times in it,
  on the server and again in the browser (`useSignupLanguage` in
  `src/components/build-wysiwyg/signup-language.ts`), so Node's ICU and the
  browser's must write them alike: `tests/e2e/build-tab-language.spec.ts`
  checks each language hydrates with no mismatch. Responses formats its
  slots' values on the server. Both mark the signup's words with its language
  where it isn't the organizer's (`langWhereDifferent` in
  `src/i18n/config.ts`): on the Build tab its title, description, group
  headings, slot values, field names (in the Fields dialog too) and list
  items, and on Responses the Slot column. A box the organizer types in keeps
  the organizer's language, since its `lang` would also be its name's, and
  what participants gave isn't marked. The one exception is the share panel's
  message box (`SharePanel`): it holds the message participants will read,
  written in the signup's language (`participant.share`), so it's marked
  with that language, and its name comes from a `<label>` outside it, in the
  organizer's.
- **Types come from English.** next-intl's plugin writes
  `src/messages/en.d.json.ts` from `en.json` on every `pnpm dev` and
  `pnpm build`, and TypeScript checks every key and argument against it. After
  you change `en.json`, run one of them and commit the rewritten file:
  `src/i18n/messages-declaration.test.ts` fails until you do.
- **Two formatters.** In the Next build, the plugin compiles each catalog
  (`precompile` in `next.config.mjs`) and the web process formats the compiled
  messages. The reminder worker and the tests format the raw JSON.
  `src/i18n/precompiled.test.ts` runs every message in every catalog through
  both and fails where they disagree.
- **No hard-coded text.** In the files and folders `TRANSLATED` lists in
  `eslint.config.mjs` (a signup's pages and the participant emails among them),
  lint fails on text written into JSX or into props people read. When an area
  moves to the catalogs, add it there in the same pull request.

## Writing a message

Messages are ICU MessageFormat. The examples below are from the catalogs as
they are.

### Placeholders

A placeholder is a value the code fills in. A translation keeps every one,
with the same name, and puts it wherever its own word order needs it:

```json
"editFor": "Edit your spot for {slot}"
"editFor": "Ändra din anmälan till {slot}"
```

It can't add a placeholder English doesn't have: the code doesn't pass one.

### Whole sentences

Each message is a whole sentence, or a whole label. Never build a sentence
from pieces in code, because another language may need the pieces in another
order. When an optional part changes the sentence, English has two messages,
and so does every translation:

```json
"editingAs": "You're editing this as {name}.",
"editingAsWithEmail": "You're editing this as {name} ({email})."
```

### Plurals

A plural picks a branch by a number. Each language has its own branches
(CLDR's plural categories): English and Swedish use `one` and `other`; Polish
uses `one`, `few`, `many` and `other`. `other` is always required. `=1` or
`=24` matches that exact number, and `#` inside a branch prints the number.

```json
"onlyLeft": "Only {remaining, plural, one {{remaining, number, ::group-off} spot is} other {{remaining, number, ::group-off} spots are}} left, and you asked for {requested, number, ::group-off}."
"onlyLeft": "Det finns bara {remaining, plural, one {{remaining, number} plats} other {{remaining, number} platser}} kvar, och du valde {requested, number}."
```

A translation may move more of the sentence into the branches when its
grammar needs it. Swedish puts the possessive there, because "your" agrees
with the number:

```json
"keepsYours": "No one new can sign up, but your {count, plural, one {spot is} other {spots are}} still yours."
"keepsYours": "Inga fler kan anmäla sig, men {count, plural, one {din anmälan finns kvar} other {dina anmälningar finns kvar}}."
```

It may also add a plural where English needs none. English "N signed up"
(`participant.slot.signedUp`) doesn't change with N, but Swedish does:

```json
"signedUp": "{count, number, ::group-off} signed up"
"signedUp": "{count, plural, one {{count, number} anmäld} other {{count, number} anmälda}}"
```

Keep the number in every branch that should show it. The checks can't tell
when one branch drops it (see "What the checks miss").

### Select

A select picks a branch by a word the code passes. A translation has exactly
the branches English has, `other` included, since those are the values the
code sends. Each branch is translated on its own.

Spaces and punctuation inside a branch are part of the text. In
`email.confirmation.keep` (shortened here), the `yes` branch starts with a
space, because it adds a sentence after the full stop before it, and the
`other` branch is empty:

```json
"keep": "… so don't forward it.{reminder, select, yes { We'll also send you a reminder {hours, plural, =24 {the day before} one {# hour before} other {# hours before}}.} other {}}"
"keep": "… så dela inte mejlet med någon.{reminder, select, yes { Vi skickar också en påminnelse {hours, plural, =24 {dagen innan} one {# timme innan} other {# timmar innan}}.} other {}}"
```

`participant.dialog.emailHelp` starts its `yes` branch with ", and" for the
same reason. Leave out the space and the sentences run together; put one in
the empty branch and the text gets a stray space.

### Tags

Tags mark text the code styles or wraps: bold, a link, a button. A
translation keeps every tag with the same name, translates the text inside,
and may move it:

```json
"didYouMean": "Did you mean <suggestion>{email}</suggestion>?"
"didYouMean": "Menade du <suggestion>{email}</suggestion>?"
```

A tag can also move into a plural's or a select's branches, when the
sentence differs by branch. Swedish words the signed-up bar as a label for
one sign-up and as a count for several, with its tags in each branch:

```json
"signedUp": "<b>You're signed up</b> for <slot>{count, plural, =1 {{name}} other {{count, number, ::group-off} slots}}</slot>."
"signedUp": "{count, plural, =1 {<b>Du är anmäld:</b> <slot>{name}</slot>} other {<b>Du har</b> <slot>{count, number} anmälningar</slot>}}"
```

Tags take no attributes, and a tag can't be added. The link that stops
reminders, in the reminder and time-changed emails, is a message of its own
(`email.reminder.stop`, `email.slotChanged.stop`), not a tag in a sentence,
because it must come last and a translation could move a tag.

### Numbers

`{n, number}` prints a number the language's way. English writes
`{n, number, ::group-off}` only to keep printing "1234", as it did before the
catalogs. That's English's choice, not a rule: Swedish writes `{n, number}`
and gets "1 234", with a no-break space, so a count never splits across lines.

### Dates and times

Messages don't format slot dates or times. The code formats them with `Intl`
in `src/lib/slot-label.ts` ("Sat, Apr 25" and "6:30 PM" in English, "lör 3 maj"
and "18:30" in Swedish) and passes them in as text, like `{slot}`. So a
translation has nothing to do for them.

If a message ever takes a date or a time itself, write an ICU skeleton
(`{when, date, ::yyyyMMMd}`, `{when, time, ::Hm}`), never a style name. The
web process's formatter ignores style names, so `{when, time, short}` prints
the date there, and a time with no skeleton at all prints differently in the
two formatters. `precompiled.test.ts` catches both.

### Quotes and braces

ICU reads a straight apostrophe as the start of quoted text when a `{`, `}`
or `#` follows it. "You're" and "don't" are fine. To show a brace, quote it:
`'{'`. To show an apostrophe right before a placeholder, write two (`''`) or a
typographic one (’).

### Field labels in "(no …)"

The heading over slots with no value for a field reads "(no date)": the field's
label goes into `participant.slot.noValue` lowercased
(`src/app/s/[slug]/slot-format.ts`). That suits English and Swedish. A
language that capitalizes nouns, like German, would lose the capital: change
`slot-format.ts` when the first one comes.

### A name at the end of a sentence

A slot's name can end in a full stop of its own: a Swedish date such as
"fre 4 dec." does. A message that ends a sentence right after the name then
shows two ("Du är anmäld till Kaffe · fre 4 dec.."). In English that's
`participant.signupView.signedUp`, `participant.dialog.shareText`, and
`savedNotEmailed` after `<b>{slot}</b>`; English dates never end in a full
stop, so English is fine. A language whose dates can should word the sentence
so the name doesn't end it. Swedish does it three ways: a label and a colon
("Du är anmäld: {name}"), the name moved inside the sentence ("Din anmälan
till {slot} är sparad."), and a dash going on to the next clause ("Min
anmälan till {slot} – med den här länken …").

## The checks

`pnpm test` runs these, and CI runs `pnpm test` on every pull request:

- `src/i18n/catalogs.test.ts`, the catalog check
  (`src/i18n/testing/catalog-check.ts`)
- `src/i18n/precompiled.test.ts`: both formatters print every message alike
- `src/i18n/messages-declaration.test.ts`: `en.d.json.ts` matches `en.json`
- `src/email/templates/emails.test.tsx` and `worker-render.test.ts`: every
  email sample renders in English and Swedish, both ways, and under the
  worker's own build

Run just these with `pnpm test src/i18n src/email`. The catalog check takes a
few seconds to start, because it reads the app's code with the TypeScript
checker.

### What the catalog check catches

Each problem is one line, `<language> <key>: <what's wrong>`, for example
`sv participant.slot.left: drops {left}`. It fails on:

- a message that doesn't compile;
- a translation that drops a placeholder or a tag, or has one English doesn't;
- a placeholder formatted as a kind of value the code doesn't pass: a number
  or a date where English has text, say;
- a select whose branches differ from English's;
- a key English doesn't have, or a key with a dot in it;
- an English message nothing in the app uses (delete it from every catalog);
- a namespace no audience reads;
- a missing message, in a language shipped to an audience that reads its
  namespace (see "When a language can be chosen");
- a stale message, in the same languages and namespaces: one whose English
  has changed since it was translated, or one the language's record has no
  entry for (see "Stale translations");
- an entry in a language's record for a message English or the translation
  doesn't have, or a record for a language with no translation.

### What the checks miss

- **A number dropped from one plural branch.** The check sees the number in
  the other branches and passes. Sometimes it's meant (`=24 {the day before}`),
  so only a reader can tell.
- **A tag or placeholder dropped from one select branch** while another keeps
  it.
- **A plural branch the language needs and the message lacks.** The number
  falls back to `other`, which may be wrong grammar.
- **English left untranslated.** A copy of the English passes.
- **Spaces at the start or end of a branch**, and any punctuation.
- **Meaning, terms, tone, word order and length.** Whether the words say what
  the English says, use the glossary, sound natural, and fit their place on a
  phone.
- **Missing messages in a language that hasn't shipped.** English fills them,
  and nothing is reported.
- **Stale messages in a language that hasn't shipped.** The catalog test
  prints them as a warning and passes. The `translate` skill's
  `to-translate.mjs` lists them.
- **A message marked translated that wasn't.** The check believes the
  record, so marking a message without translating it, or editing the record
  by hand, hides it.

The review in context (below) is what catches these.

## Stale translations

When an English message changes, its translations keep saying the old thing
until someone translates it again. To notice, each language records the
English each of its messages was translated from, in
`src/i18n/translated-from/<language>.json`:

```json
{
  "participant.slot.signedUp": "{count, number, ::group-off} signed up",
  "participant.dialog.done": "Done"
}
```

Each entry is a message's full key and the English text it was translated
from, in `en.json`'s order. The catalog check compares it with `en.json`:

| What the check finds                                                       | In a namespace the language is shipped in | Anywhere else  |
| -------------------------------------------------------------------------- | ----------------------------------------- | -------------- |
| **Stale**: the recorded English isn't what `en.json` says now              | fails, like a missing message             | a warning only |
| **Unrecorded**: a translated message with no entry                         | fails                                     | a warning only |
| An entry for a message `en.json` or the translation doesn't have (deleted) | fails                                     | fails          |
| A record for a language with no catalog, or for English                    | fails                                     | fails          |

A message English doesn't have is already a failure in the catalog itself
("not in en.json; delete it"), so it isn't also reported as unrecorded.

**Only the `translate` skill's scripts touch the record**, never a person or
an editor's find-and-replace:

- `to-translate.mjs <language>` lists what's missing, stale and unrecorded,
  with the English each stale message was translated from beside the English
  now, and ends with the command that marks them.
- `mark-translated.mjs <language> <key or section> …` marks messages as
  translated from today's English: each named message the catalog
  translates gets `en.json`'s text now. A section or namespace
  (`participant.dialog`, `email`) names every message under it. Other
  entries stay as they were, so a stale one stays stale, and entries for
  messages that `en.json` or the catalog no longer has are dropped. With no
  keys, it only drops those. It makes the file the first time it runs for a
  language.

Run both with `pnpm exec tsx .claude/skills/translate/scripts/<script>`.

Mark a message once you've translated it, or once you've read a stale one
against its new English and found its translation still right (an English
typo fix, say). Fixing a translation whose English hasn't changed needs no
marking: the record holds the English, not the translation.

When you delete or rename an English message, delete or move its
translations too, as the check asks, then run `mark-translated.mjs` for each
language so its record drops the old key. For a rename, name the new key
(`mark-translated.mjs <language> <new key>`): a run with no keys only
drops entries, so the moved translation would be left unrecorded.

The record holds the English text rather than a hash of it. A hash would be
safe from a find-and-replace across the repo, but the text shows what
changed: `to-translate.mjs` prints the old English beside the new without
digging through git history (which a shallow clone doesn't have), and a pull
request's diff shows the English each translation now follows. So never let
a find-and-replace of English text reach `src/i18n/translated-from/`: it would
mark every translation it touches as up to date.

The record is outside `src/messages/` because next-intl's plugin
(`locales: 'infer'` in `next.config.mjs`) reads every JSON file there as a
language, and its catalog loader takes in any path that starts with
`src/messages`. Nothing in the app or the reminder worker imports it; only
the catalog check and the skill's scripts read it.

## When a language can be chosen

Two lists in `src/i18n/config.ts` decide it:

- **`CATALOG_LOCALES`** lists the languages with a catalog. The catalog check
  requires it to match the files in `src/messages/`, and `DEFAULT_LOCALE`
  accepts only these. Having a catalog doesn't show a language to anyone.
- **`SHIPPED`** lists, per audience, the languages it can be offered in. Only
  these can be saved on a signup or an account, sent through the API or the AI
  connector, or picked for a Magic Compose draft. The language controls on a
  signup's Settings tab and on the account settings page appear once a second
  language has shipped, and only a language other than English in this list
  can be stored on a new organizer account (below). A site's `DEFAULT_LOCALE`
  counts only for audiences its language has shipped to (`resolveLocale`).

Today `CATALOG_LOCALES` is `en` and `sv`, and `SHIPPED` holds only `en`, for
every audience.

A language launches for participants and organizers together: its launch
adds it to `SHIPPED.participant` and `SHIPPED.organizer` in one change, and
`src/i18n/config.test.ts` fails while the two lists differ. The account
Settings picker offers the participant list, while the organizer app follows
the organizer list, so a language in one list only would save on an account
and leave its screens in English. From the launch on, the catalog check
requires every message in `participant`, `email`, `organizer`, `auth` and
`common`, so a language ships only when it's complete. It ships only after it
has also passed the review in context, which no test can check: the pull
request that adds it says so.

`E2E_UNSHIPPED_LOCALES` is for tests only. `playwright.config.ts` sets it for
the server it starts, to every language with a catalog that hasn't shipped,
so the seeded Swedish signups show in Swedish before Swedish ships, and an
organizer whose account stores a listed language sees the organizer app in it
(`tests/e2e/organizer-language.spec.ts`, and the whole story, from account
Settings to a participant's email, in `organizer-language-story.spec.ts`).
It keeps a language already saved in a signup's or an account's row, and
does nothing else: nothing in the app can save a language that hasn't
shipped, and it never makes one the site's default, a new signup's, or a
choice. It's read in one place, `shown` in `src/i18n/locale.ts`, which
`localeOfSignup` and `localeOfOrganizer` go through, so it only ever changes
what's shown, never what's stored; `src/i18n/locale.test.ts` fails if any
other module reads it. The web
server and the worker log a warning when they start with it set. A reused
`pnpm dev` needs it too: `E2E_UNSHIPPED_LOCALES=sv pnpm dev`. Never set it on
a real site.

### An organizer's language

An organizer's language is the one the organizer app shows them, the one
their new signups start in, and the one Magic Compose falls back on. It's
stored on their account once, when the
account is created, from the browser that finishes signing in: the one that
opens the sign-in link or types the code, or comes back from a sign-in
provider such as Google. Nothing reads the browser's language after that. The
site default wins:

- If the site sets `DEFAULT_LOCALE`, nothing is stored, and the account
  follows the site's default.
- Otherwise the browser's top language is stored if it has shipped to
  participants and isn't English, which an account with nothing stored gets
  anyway. Only the top language counts: a browser that asks for German, then
  Swedish, stores nothing.
- In every other case nothing is stored.

So a stored language is always one the account wouldn't get otherwise, and a
site that sets or changes `DEFAULT_LOCALE` later moves every account with
nothing stored, including every account made before languages were stored.
The organizer changes their language in account Settings, and whatever they
choose there is stored. A stored language that later leaves
`SHIPPED.participant` counts as nothing stored.

With `sv` shipped to participants:

| Site default (`DEFAULT_LOCALE`) | Browser's top language | Stored  | The account gets |
| ------------------------------- | ---------------------- | ------- | ---------------- |
| none                            | `sv`                   | `sv`    | `sv`             |
| none                            | `en`                   | nothing | `en`             |
| none                            | `de` (not shipped)     | nothing | `en`             |
| none                            | none, or unreadable    | nothing | `en`             |
| `en`                            | `sv`                   | nothing | `en`             |
| `en`                            | `en`                   | nothing | `en`             |
| `en`                            | `de` (not shipped)     | nothing | `en`             |
| `en`                            | none, or unreadable    | nothing | `en`             |
| `sv`                            | `sv`                   | nothing | `sv`             |
| `sv`                            | `en`                   | nothing | `sv`             |
| `sv`                            | `de` (not shipped)     | nothing | `sv`             |
| `sv`                            | none, or unreadable    | nothing | `sv`             |

While only English has shipped, nothing is stored and every account gets
English. `newOrganizerLocale` in `src/i18n/organizer-locale.ts` applies the
rule, and `src/i18n/organizer-locale.test.ts` and `src/auth/adapter.db.test.ts`
run every row of this table against it.

## Changing English

1. Change the message in `en.json`. Keep it a whole sentence.
2. Run `pnpm dev` or `pnpm build` once, and commit the rewritten
   `src/messages/en.d.json.ts`.
3. In the same pull request, run the `translate` skill for each language in
   `SHIPPED` (none but English today): the catalog check fails each changed
   message in a shipped language as stale until it's translated again and
   marked. For a language that has a catalog but hasn't shipped, Swedish
   today, do it too when you can, so it stays ready to launch. Until someone
   does, the catalog test warns that it's stale, and its test signups show the
   old translation, or English for a new message.
4. If you deleted or renamed a message, run `mark-translated.mjs` for each
   language as "Stale translations" says, naming the new key for a rename: a
   run with no keys only drops the old entry.

## Adding a language

1. **Make its catalog.** Add `src/messages/<code>.json` (start it as `{}`),
   add the code to `CATALOG_LOCALES`, and import the catalog into `CATALOGS`
   in `src/i18n/translator.ts`. Use a bare language code, like `sv`, never a
   region (`sv-SE`). Its record, `src/i18n/translated-from/<code>.json`,
   comes with the first messages you mark as translated. `pnpm typecheck`
   then points at the tests that keep a table by language, like
   `KEEP_IT_PRIVATE` in `src/app/s/[slug]/commit-dialog.test.tsx`: give each
   an entry once the messages it checks are translated.
2. **Give it test signups.** Add a seed like `makeSwedishSignup` in
   `tests/e2e/helpers/seed.ts` (`playwright.config.ts` puts the code in
   `E2E_UNSHIPPED_LOCALES` itself), and write a spec like
   `tests/e2e/swedish-signup.spec.ts` that saves a `translationShot` of every
   screen it checks. Add the spec to `TRANSLATION_SPECS` in
   `playwright.config.ts`, and to `pnpm translation:screenshots` in
   `package.json`. Add the participant emails in the language to
   `scripts/lib/email-samples.ts` (the sign-in email's sample,
   `magic-link-<code>`, comes with the catalog), and every one's name to the
   list in `src/email/templates/worker-render.test.ts`. The list in
   `emails.test.tsx` beside it holds only the Swedish ones
   (`lang === 'sv'`), so give the new language an assertion of its own there.
3. **Write its glossary** below, before translating: the product's own terms,
   the tone and the date style.
4. **Translate and review** with the `translate` skill, namespace by
   namespace, for both audiences: participant text and organizer text
   (`to-translate.mjs <code> --audience organizer`).
5. **Check the layout.** `tests/e2e/slot-row-layout.spec.ts` checks that the
   row buttons and the sheet's labels fit their boxes, on the English and the
   Swedish signup. Add the new language's signup to it.
6. **Launch** in a pull request of its own, which the owner approves: add the
   code to `SHIPPED.participant` and `SHIPPED.organizer` together, and say
   what changes in `CHANGELOG.md` and the README. Tests that check the
   language stays unshipped (English pages, no picker, a refused save) fail
   then; update them in the same pull request.

Node's official builds include every language's date and number data. A
Node built with English-only ICU would print the new language's dates in
English.

## How translations are made and checked

The owner decided on 13 November 2026 that no language waits for a human
translator. Each one is made and checked the same way:

1. A Claude session translates the missing and stale messages with the
   `translate` skill, namespace by namespace, from `en.json`, following the
   glossary, and marks them in the language's record as translated from
   today's English.
2. The checks above pass.
3. A different model from the translator's reviews the result in context:
   screenshots of the participant screens and states, and every email's HTML.
   It checks meaning against the English, the glossary, the tone, natural word
   order and plurals, and text too long for its place.
4. The translator fixes what the review finds, and the pull request lists
   every finding and what was done about it.

The screenshots and emails come from one command, after `pnpm build`:

```bash
pnpm translation:screenshots
```

It sets `TRANSLATION_SCREENSHOTS=1`, which makes the email tests write each
email's HTML and plain text, in English and Swedish, with the subject on the
text's first line, and makes the Swedish e2e specs save a screenshot of each
screen and state they check, on a desktop and at a phone's width (390
pixels). Everything goes to `translation-review/`, which git ignores. Without
the flag the tests write nothing, so CI is unaffected. In Claude's cloud
container, Playwright's own Chromium isn't installed: add
`-c .claude/skills/run-opensignup/playwright.container.config.ts`.

Some messages have no screenshot, and the reviewer reads them in the catalog.
The reviewer's prompt (`.claude/skills/translate/references/review.md`) names
the ones only in a tab's title, a link preview, what a screen reader says, or
what a button hands to another app. A signup that doesn't exist has no
language, so its not-found page (`participant.gonePage.signup`) is in the
site's language, which can't be Swedish until Swedish ships. And the spec
doesn't reach a few rarer states: a cancelled spot whose slot has since filled
or closed, someone the organizer took off a slot or moved, someone signed up
for more than one slot, the edit page's errors when cancelling, and copying
the link.

## Swedish glossary

These are the words the Swedish catalog uses. A change to one of them changes
it everywhere it appears, in the same pull request. The first full review of
the Swedish translation (#639) settled the questions earlier passes left
open; "Settled" below says what it chose and why, so a later pass doesn't
undo it by accident.

### Terms

| English                                                      | Swedish                       | Notes                                                                                                                                            |
| ------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| signup (the list people sign up on)                          | anmälningslista               | "Den här anmälningslistan är inte klar ännu". No short form ("listan") but the organizer labels "Ny lista" and "Skapa lista", for fit            |
| sign up (the button)                                         | Anmäl dig                     | "Anmäl dig till {slot}"                                                                                                                          |
| signed up                                                    | anmäld, anmälda               | "Du är anmäld", "2 anmälda"                                                                                                                      |
| your spot, your sign-up (the one you made)                   | din anmälan, dina anmälningar | "Visa eller ändra din anmälan", "Din anmälan är avbokad". Never _din plats_                                                                      |
| Sign up (the tab title of a signup page that can't be shown) | Anmälan                       |                                                                                                                                                  |
| slot                                                         | pass (the same in the plural) | Only where the sentence needs the noun: "Pass utan namn", "Passet är stängt."                                                                    |
| spot, spots (a number of them)                               | plats, platser                | "1 plats", "19 av 20 platser kvar", "Behåll den plats du har"                                                                                    |
| the Spots box                                                | Platser                       | "Antal platser" doesn't fit the 80-pixel box on the sheet                                                                                        |
| Spots, in an email                                           | Antal platser                 | "Antal platser: 2", which can't be read as an organizer's "Plats:" field                                                                         |
| organizer                                                    | arrangör                      | "Kontakta arrangören"                                                                                                                            |
| participant                                                  | deltagare                     | No participant message uses it yet; people are "du"                                                                                              |
| cancel (your spot)                                           | avboka                        | "Avboka", "Ja, avboka", "Din anmälan är avbokad"                                                                                                 |
| Cancel (close the sheet)                                     | Avbryt                        |                                                                                                                                                  |
| Keep                                                         | Behåll                        | "Behåll", "Behåll dem"                                                                                                                           |
| Edit                                                         | Ändra                         | "Ändra eller avboka"                                                                                                                             |
| Full (a slot)                                                | Fullt                         | Agrees with _pass_; "Tyvärr, det blev precis fullt."                                                                                             |
| Closed (a slot's row)                                        | Stängt                        | Agrees with _pass_, and reads as a sign                                                                                                          |
| Closed (the signup page's banner)                            | Anmälan är stängd             | The usual phrase                                                                                                                                 |
| Closed (the edit page's banner)                              | Stängt för nya anmälningar    | The signup or the slot closed; the participant's own sign-up still works                                                                         |
| open: spots still free                                       | ledig, ledigt                 | "vad som fortfarande är ledigt"                                                                                                                  |
| open: a signup taking sign-ups                               | öppen                         | No participant message says it yet                                                                                                               |
| ask for (a number of spots)                                  | välja                         | "Välj 5 eller färre", "du valde 6"                                                                                                               |
| up to, at most (a number)                                    | högst                         | "Du kan ha högst 3 platser." Not _upp till_                                                                                                      |
| email (the address, the box)                                 | e-post                        | "E-post (valfritt)"                                                                                                                              |
| an email (a message); to email                               | mejl; mejla                   | "bekräftelsemejl", "påminnelsemejl", "Vi mejlar dig"                                                                                             |
| reminder                                                     | påminnelse                    | "Stäng av påminnelser om {title}", "Slå på påminnelserna igen"                                                                                   |
| a new date or time (the change emails)                       | ny tid; Tiden har ändrats     | Subject "Ny tid: {title}"; "har flyttat din anmälan till ett nytt datum eller en ny tid"                                                         |
| Notes (optional)                                             | Kommentar (valfritt)          |                                                                                                                                                  |
| (optional)                                                   | (valfritt)                    |                                                                                                                                                  |
| link                                                         | länk                          | "Spara din länk", "Kopiera länk"                                                                                                                 |
| Add to calendar                                              | Lägg till i kalendern         | The definite form, as Swedish says it                                                                                                            |
| Save; Saved.                                                 | Spara; Sparat.                |                                                                                                                                                  |
| Done                                                         | Klart                         |                                                                                                                                                  |
| (no {label})                                                 | (utan {label})                | "(utan datum)"                                                                                                                                   |
| Untitled slot; Untitled (a field)                            | Pass utan namn; Namnlös       |                                                                                                                                                  |
| What, Date, Option 1 (a new signup's fields)                 | Vad, Datum, Alternativ 1      |                                                                                                                                                  |
| Sorry                                                        | Tyvärr                        | "Tyvärr, den här länken fungerar inte"                                                                                                           |
| Privacy (the footer link)                                    | Integritetspolicy             |                                                                                                                                                  |
| Keep this email to yourself; keep it private                 | dela inte … med någon         | "Dela inte mejlet med någon", "så dela inte länken med någon", also where the confirmation email says "so don't forward it". Not _håll … privat_ |
| Too many tries just now                                      | För många försök på kort tid  | _Just nu_ means "right now", not "a moment ago"                                                                                                  |
| Cookies (the footer link)                                    | Cookies                       | Kept: _kakor_ is the recommended word, but most Swedish sites say "Cookies"                                                                      |

### Organizer terms

The organizer's screens (`organizer`) use the terms above where they apply
(_anmälningslista_, _pass_, _plats_, _arrangör_, _deltagare_), and these for
the words only organizers see. From #953's batches.

| English                                                                           | Swedish                                                                 | Notes                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Your signups; New signup                                                          | Dina anmälningslistor; Ny lista                                         | The whole word everywhere else, as participants read it. "Ny lista", the button on Your signups and its crumb, is the short label: "Ny anmälningslista" pushed Your signups 12 pixels past a 320-pixel screen, and its crumb ran into Hjälp at 390 px |
| New signup (the page's heading, Magic Compose's pill)                             | Ny anmälningslista                                                      | The page has room for the whole word, so its crumb "Ny lista" sits over the heading "Ny anmälningslista": the short label and the full name                                                                                                           |
| Create signup (the form's button)                                                 | Skapa lista                                                             | Short, as "Ny lista", for fit                                                                                                                                                                                                                         |
| draft (a signup not published yet)                                                | utkast                                                                  | "Bara du kan se det här utkastet", the same words on Your signups and on the draft's own page                                                                                                                                                         |
| publish; Publish and share                                                        | publicera; Publicera och dela                                           |                                                                                                                                                                                                                                                       |
| Published                                                                         | Publicerad                                                              | Agrees with _anmälningslista_                                                                                                                                                                                                                         |
| draft, open, closed, archived (the status pill)                                   | utkast, öppen, stängd, arkiverad                                        | Lower case, as in English; the adjectives agree with _anmälningslista_. "Stängd · …" and "Arkiverad · …" before the spots line                                                                                                                        |
| Close signup; Reopen signup; Signup closed                                        | Stäng anmälan; Öppna anmälan igen; Anmälan är stängd                    | _Anmälan_ as in "anmälan stänger": the usual phrase, which the first full review (#931) also chose for participants' closed banner                                                                                                                    |
| N spots taken; N of M spots taken                                                 | N platser är upptagna; N av M platser är upptagna                       | With _är_, so the participle can agree with N: "1 av 8 platser är upptagen"                                                                                                                                                                           |
| spots still open                                                                  | lediga platser                                                          | "5 av 8 platser är fortfarande lediga"                                                                                                                                                                                                                |
| Everyone already signed up keeps their spot                                       | Alla som redan är anmälda behåller sin plats                            |                                                                                                                                                                                                                                                       |
| N taken; N of M taken (a slot's row on the Build tab)                             | N upptagen, N upptagna; N av M upptagen, N av M upptagna                | Agrees with N, as the spots line does, without _platser_, to fit the row                                                                                                                                                                              |
| Preview (the button; the banner)                                                  | Förhandsgranska; Förhandsgranskning                                     | The verb on the button, the noun as the banner's title                                                                                                                                                                                                |
| Build, Responses, Settings (a signup's tabs)                                      | Bygg, Anmälningar, Inställningar                                        | _Anmälningar_, the sign-ups, since this isn't a form with answers (_svar_); "Se anmälningar" on the strip                                                                                                                                             |
| sign-ups, counted on Responses                                                    | anmälan, anmälningar                                                    | "6 anmälningar · 1 avbokad · 1 borttagen"                                                                                                                                                                                                             |
| a sign-up's status (on Responses, in the CSV)                                     | bekräftad, preliminär, väntelista, avbokad, uteblev, borttagen, flyttad | Lower case, as in English; the adjectives agree with _anmälan_. `no_show` is _uteblev_, didn't show up                                                                                                                                                |
| Spots; Notes; Signed up (columns on Responses and in its CSV)                     | Antal platser; Kommentar; Anmäld                                        | A column is read on its own, often beside an organizer's own "Plats" column, so _Antal platser_, as in an email. _Kommentar_ is what the sign-up sheet calls the box; _Anmäld_ heads the time each person signed up                                   |
| Edit signup; Edit                                                                 | Ändra anmälningslistan; Ändra                                           | _Ändra_, as participants' Edit                                                                                                                                                                                                                        |
| Editing (the Build tab's badge)                                                   | Redigerar                                                               | Says you're editing: _Ändrar_ on its own reads as "changes". _Redigering_ wrapped the Fields button at 320 pixels                                                                                                                                     |
| Edit slot; Editing slot (the slot editor's names)                                 | Ändra passet; Du ändrar passet                                          | "Du ändrar" keeps the open editor's name apart from the row's button                                                                                                                                                                                  |
| Duplicate                                                                         | Duplicera                                                               | Not _kopiera_, Copy link's verb                                                                                                                                                                                                                       |
| delete (a signup, a slot, a field); remove (a person from a slot, a field)        | radera; ta bort                                                         | By the English word: "Radera anmälningslistan", "Ta bort {name} från {slot}", "Ta bort fält"                                                                                                                                                          |
| Delete this signup (the Settings tab's last card)                                 | Radera anmälningslistan                                                 | The same words as its button: the card holds only that. It was "Danger zone", developer slang in English too; _Farozon_ copied it                                                                                                                     |
| field (a column the organizer defines)                                            | fält                                                                    |                                                                                                                                                                                                                                                       |
| Short text, Date, Time, Number, List (the field types)                            | Kort text, Datum, Tid, Tal, Lista                                       | _Tal_ is the spreadsheet word; _Nummer_ is an identifier, like a phone number                                                                                                                                                                         |
| an item in a List field                                                           | alternativ                                                              | As a new list's "Alternativ 1"                                                                                                                                                                                                                        |
| Set a date; Set a time; Set {label} (a slot's empty value)                        | Ange datum; Ange tid; Ange {label}                                      | The label in lower case, as in English: "Ange roll"                                                                                                                                                                                                   |
| No limit (a Spots box)                                                            | Obegränsat                                                              | On the Build tab and in Magic Compose, and "{item} (obegränsat)" in Magic Compose's answers. The help beside the Build tab's box says "obegränsat antal". Not _Inget tak_, which reads as "no ceiling"                                                |
| Group slots by; Don't group                                                       | Gruppera passen efter; Gruppera inte                                    |                                                                                                                                                                                                                                                       |
| Drag to reorder                                                                   | Dra för att flytta                                                      |                                                                                                                                                                                                                                                       |
| Required, Optional (a setting's choices)                                          | Obligatoriskt, Valfritt                                                 | Neuter, like "(valfritt)"                                                                                                                                                                                                                             |
| Share; Share…; Share the link                                                     | Dela; Dela…; Dela länken                                                |                                                                                                                                                                                                                                                       |
| Public link                                                                       | Offentlig länk                                                          |                                                                                                                                                                                                                                                       |
| Copy link; Copy message; Copied                                                   | Kopiera länk; Kopiera texten; Kopierat                                  | "Kopiera meddelande" wraps in its half-width button on a phone                                                                                                                                                                                        |
| Link copied; Message copied (what is announced)                                   | Länken är kopierad; Meddelandet är kopierat                             | The state, with _är_, as participants' "Länken är kopierad.", not _har kopierats_. "QR-koden är sparad" too                                                                                                                                           |
| Email it                                                                          | Mejla det                                                               |                                                                                                                                                                                                                                                       |
| QR code; Hide QR code                                                             | QR-kod; Dölj QR-kod                                                     | No article on the button, like Kopiera länk beside it                                                                                                                                                                                                 |
| Settings (the account page)                                                       | Inställningar                                                           | The same word as a signup's tab, as in English, and the same in the header's tip and the crumb                                                                                                                                                        |
| Language                                                                          | Språk                                                                   | Account Settings and a signup's Settings tab                                                                                                                                                                                                          |
| Save; Saved                                                                       | Spara; Sparat                                                           | Every Save button                                                                                                                                                                                                                                     |
| Reload (the page)                                                                 | Ladda om sidan                                                          |                                                                                                                                                                                                                                                       |
| your dashboard (the page, named in a sentence)                                    | dina anmälningslistor                                                   | What its heading says. _Översikt_ is only the browser tab's title                                                                                                                                                                                     |
| Connected apps                                                                    | Anslutna appar                                                          | The card on Settings and the page, the same words                                                                                                                                                                                                     |
| connect; disconnect (an app)                                                      | ansluta; koppla från                                                    | "Appen är frånkopplad."                                                                                                                                                                                                                               |
| access (what an app holds); permission                                            | åtkomst; behörighet                                                     |                                                                                                                                                                                                                                                       |
| AI assistant                                                                      | AI-assistent                                                            |                                                                                                                                                                                                                                                       |
| Draft my signup (Magic Compose's button)                                          | Skapa utkast                                                            | No article                                                                                                                                                                                                                                            |
| AI drafting; an AI draft                                                          | AI-utkastet; AI-utkast                                                  | "AI-utkastet tog för lång tid."                                                                                                                                                                                                                       |
| the AI; AI provider; AI service                                                   | AI:n; AI-leverantören; AI-tjänsten                                      |                                                                                                                                                                                                                                                       |
| description (what the organizer writes for Magic Compose, "prompt" in two errors) | beskrivning                                                             | One word for the box                                                                                                                                                                                                                                  |
| fill in by hand                                                                   | fyll i själv                                                            | Not _för hand_, which reads as handwriting                                                                                                                                                                                                            |
| placeholder (a slot or date a draft leaves to fill in)                            | platshållare                                                            |                                                                                                                                                                                                                                                       |
| free text (a field switched from a list)                                          | fritext                                                                 |                                                                                                                                                                                                                                                       |
| Not decided; Back                                                                 | Inte bestämt; Tillbaka                                                  |                                                                                                                                                                                                                                                       |
| workspace                                                                         | arbetsyta                                                               |                                                                                                                                                                                                                                                       |
| account; Sign in; Sign out                                                        | konto; Logga in; Logga ut                                               |                                                                                                                                                                                                                                                       |
| Help                                                                              | Hjälp                                                                   | As in the footer                                                                                                                                                                                                                                      |
| Dashboard (the tab's title)                                                       | Översikt                                                                |                                                                                                                                                                                                                                                       |
| Breadcrumb (the trail's name for screen readers)                                  | Du är här                                                               | What Swedish sites call it; _brödsmulor_ is the developer's word                                                                                                                                                                                      |
| More actions                                                                      | Fler åtgärder                                                           |                                                                                                                                                                                                                                                       |
| Dismiss (a notice's ✕)                                                            | Dölj                                                                    | Not _Stäng_, beside "Anmälan är stängd" and Stäng anmälan                                                                                                                                                                                             |
| a person the sentence doesn't name                                                | personen                                                                | Not _hen_ or _de_: "Personen får inget mejl om det."                                                                                                                                                                                                  |

- **Numbers.** Organizer text writes `{n, number}`, as the rest of Swedish
  does, with three exceptions that keep English's `::group-off`:
  - the message the share panel offers to send (`participant.share`), in
    `spotsOpen` and `spotsLeft`: it's plain text that leaves OpenSignup, for
    a chat, a text or an email, and a four-digit count without a space is
    good Swedish there;
  - a year, `{year, number, ::group-off}`
    (`organizer.build.refusal.dateTooEarly`): a year is never grouped, and
    "år 1 900" is wrong;
  - an HTTP status, `{status, number, ::group-off}`
    (`organizer.compose.errors.unavailable`, `providerErrorStatus`,
    `failed`): it's an identifier, not a count.
- **Plurals, where Swedish's shape differs from English's.** Each is
  deliberate:
  - a plural where English has none, so the participle agrees with the
    number: a slot's row on the Build tab ("1 upptagen", "2 upptagna",
    `organizer.build.slot.taken`, `takenOf`) and the spots line ("1 av 8
    platser är upptagen");
  - no plural where English has two, since _fält_ and _pass_ don't change:
    `organizer.aiDraft.title` formats each count as a plain number ("med 3
    fält och 5 pass"), which the catalog check accepts, since a plural and a
    number both take a number;
  - a whole sentence in each branch where a later word agrees with the
    number: `organizer.build.refusal.capacityBelowTaken` ("1 plats är redan
    upptagen. Ge passet minst 1 plats."), `organizer.responses.remove.question`
    ("Platsen blir ledig för någon annan.", "De 2 platserna blir lediga för
    andra.") and `organizer.aiDraft.warnings.*` (_dubbletten_,
    _dubbletterna_);
  - _personen_ where English says "they" of one person: in the `one` branch
    of `organizer.build.editor.signedUp`, and in
    `organizer.responses.remove.question`, which always removes one person.

### Sign-in and connecting an app

The sign-in pages, the sign-in email and the screen that connects an AI
assistant (`auth`) use the terms above, and these. From #953's second batch.

| English                                         | Swedish                                              | Notes                                                                                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in to OpenSignup                           | Logga in på OpenSignup                               | The sign-in pages' heading and the sign-in email's subject and heading, the same words. The product's name stays as it is                                |
| magic link; sign-in link                        | inloggningslänk                                      | "Skicka inloggningslänk". _Magisk länk_ is a calque; Swedish services say _inloggningslänk_                                                              |
| the six-digit code                              | koden; den sexsiffriga koden                         | "Logga in med kod". Not _engångskod_: the English never says one-time, and the page and the email must name it with the same word                        |
| request (a new link); Too many sign-in requests | begära; För många inloggningslänkar har begärts      | "Begär en ny länk". Not _inloggningsförsök_, which reads as wrong passwords, beside the code box's own "För många försök"                                |
| Too many requests (the OAuth pages)             | För många försök                                     | The person's tries to connect, as "För många anslutningsförsök". _Förfrågningar_ would be a second word beside _begäran_                                 |
| expires in {duration}; works for {duration}     | går ut om {duration}; gäller i {duration}            | A link "går ut", as on Connected apps; a code "gäller". The app writes the duration ("1 timme", "15 minuter"), so translate the whole sentence around it |
| Check your email; your inbox                    | Kolla din e-post; din inkorg                         | _E-post_ for the mailbox, _mejl_ for the message and the channel: "Öppnade du mejlet på en annan enhet?", "få en inloggningslänk via mejl"               |
| click (a link, a button)                        | klicka på                                            | As the English says: "Klicka på knappen nedan"                                                                                                           |
| Continue with {provider}; a provider            | Fortsätt med {provider}; en tjänst                   | Google's own Swedish button says "Fortsätt med Google"                                                                                                   |
| Allow; Don't allow                              | Tillåt; Tillåt inte                                  | What Swedish permission prompts say. The heading asks "Vill du tillåta … att använda ditt konto på …?", and the buttons answer it                        |
| approve (permissions, on Connected apps)        | godkänna                                             | "de behörigheter du har godkänt". The consent screen's "Only approve if …" is "Tillåt bara om …", so that screen uses one verb, its button's             |
| was set up by the people who run this site      | har lagts till av dem som driver den här webbplatsen | An app the site lists itself. Not _satts upp_, a light anglicism                                                                                         |
| Connection request                              | Begäran om anslutning                                | Also "Den här begäran om anslutning har gått ut"                                                                                                         |
| app, application                                | app                                                  | "Appen kommer att kunna", "Gå tillbaka till appen"                                                                                                       |
| It will be able to                              | Appen kommer att kunna                               | The heading over the permission lines, which each start with a verb ("Se …", "Skapa …"), so they read on from it and stand alone on Connected apps       |
| It acts as you                                  | Appen agerar i ditt namn                             | As Connected apps' intro: "agerar som du" can read as "behaves like you"                                                                                 |
| Go to your dashboard                            | Gå till översikten                                   | _Översikt_, as the dashboard's tab title                                                                                                                 |

- **The OAuth error page** prints oidc-provider's own description, in
  English, after the catalog's words (`<code>invalid_request</code> — …`).
  Its intro is a whole sentence with its own full stop, so an English line
  after it reads as a technical detail, not as the end of a Swedish sentence.

### Style

- **Tone.** _Du_, never _ni_, and the plain, friendly tone of the English.
  Instructions are imperatives: "Försök igen.", "Kontrollera den och försök
  igen."
- **Dates and times.** The app formats them, not the catalog: "lör 3 maj",
  "lör 5 sep." (`Intl` puts a full stop after an abbreviated month, and none
  after a short one like _maj_), and "18:30" on the 24-hour clock. So never
  end a sentence on a slot's name (see "A name at the end of a sentence").
- **Numbers.** `{n, number}`, so "1 234" with a no-break space. The few
  that keep `::group-off` are under "Organizer terms".
- **Punctuation.** A spaced en dash (–) inside a sentence, where English has
  an em dash. An ellipsis is one character: "Sparar…".
- **A channel takes _via_:** "via mejl", "via sms". "Med mejl" is a calque
  of "by email".
- **Buttons named in a sentence** are written as on screen, without quotation
  marks, when the name is one word: "Tryck på Bekräfta igen." When a longer
  name would run into the sentence around it, word the sentence around the
  action instead: "Lägger du till anmälan i kalendern, sparas länken där
  också." rather than "Knappen Lägg till i kalender sparar också länken."
- **A button in an email** is "knappen ovan" with _använd_, not _tryck på_,
  since an email is read on a computer as often as on a phone.
- **Leave out _pass_ where the sentence can do without it.** Most signups are
  shifts, where _pass_ fits, but many are things to bring, where "ditt pass"
  for a cake reads oddly. "Välj något annat.", "Det har blivit fullt sedan du
  avbokade.", "en påminnelse innan det är dags", "Du har 3 anmälningar", "Du
  är redan anmäld till det här." It stays only where the noun can't be left
  out: "Pass utan namn", "Passet är stängt.", "Arrangören har tagit bort dig
  från passet", "Din anmälan har flyttats till ett annat pass".

### Settled in the first full review (#639)

1. **_Din anmälan_, not _din plats_, for the participant's own sign-up.**
   _Plats_ is also the word organizers most often give a location field, so an
   email showed "Plats: Aulan" above "Visa eller ändra din plats", which reads
   as "your location". _Plats_ stays for a number of spots, where it can't be
   read that way.
2. **A spot isn't "open".** Free spots are _ledig_, a signup taking sign-ups is
   _öppen_, whatever English settles on.
3. **_Pass_ stays the word for a slot**, used only where the sentence needs
   the noun (Style, above). The change emails say "Tiden har ändrats", since
   they're only sent for a new date or time, and "har flyttat din anmälan
   till en ny tid". That can faintly suggest only this person was moved; "har
   ändrat datum eller tid för det du är anmäld till" would avoid it, but it's
   longer, and the English says "your slot" just as personally, with the new
   time printed right below.
4. **Closed.** The row says "Stängt"; the signup page's banner says "Anmälan
   är stängd", the usual phrase; the edit page's banner says "Stängt för nya
   anmälningar", since under the heading "Din anmälan" a bare "Anmälan är
   stängd" could read as the participant's own sign-up being closed. "Stängd"
   on its own isn't used.
5. **"(utan {label})"**, since as a heading "(datum saknas)" read like an
   error, and "(utan datum)" reads as a group.
6. **Smaller wording.** "Klart" on the Done button. "Välj" and "du valde" for
   the number of spots, rather than the literal "Be om" and "du bad om".
   "Namnlös" for an untitled field: the usual word for "Untitled" in Swedish
   software, one word, and short enough for a column heading. "Dela inte
   mejlet med någon" rather than the calque "Behåll mejlet för dig själv".
   "Antal platser" in emails.
7. **No no-break hyphens.** "e-post" and "e-postadress" may break after their
   hyphen at a phone's width. That's ordinary Swedish line breaking, and a
   no-break hyphen (U+2011) is missing from some fonts and can be read out
   oddly.
8. **"Du är anmäld som {name}"** on the edit page, where English says "You're
   editing this as {name}". It says what the line is for, whose sign-up this
   is, in the words Swedish uses for it; a literal "Du redigerar det här
   som" would read as English in disguise.
9. **Layout.** The unsubscribe page's buttons are "Stäng av dem" and "Behåll
   dem", which fit side by side at 390 pixels. A screen reader then says
   "Stäng av dem" with no noun: if the button ever gets an `aria-label`, make
   it "Stäng av påminnelserna".
10. **No short form of _anmälningslista_.** The draft page said "när listan
    är publicerad", the only "listan" in the catalog; it now says "Länken
    börjar fungera när det är gjort".
11. **"Cookies", not "Kakor"**, in the footer: _kakor_ is the recommended
    Swedish word, but most Swedish sites write "Cookies", and people look for
    it there.

The notes behind these are in the reviews and tophats of #914, #916, #918,
#920, #921, #926 and #929, and the table in #639's first pull request lists
each with what was done.

### Settled after the owner's walkthrough

The owner's tophat of the whole stack, on 15 November 2026, settled these.

1. **Short forms of _anmälningslista_ only where the whole word doesn't
   fit.** Organizer text keeps two, the button and crumb "Ny lista" and New
   signup's "Skapa lista" (Organizer terms says why). Everywhere else it's
   the whole word, so account Settings' language help says "under dess flik
   Inställningar", not "under listans flik".
2. **One way to say "don't share this email".** The confirmation email said
   "vidarebefordra inte mejlet" and the reminder and time-change emails "Dela
   inte mejlet med någon", for English's "don't forward it" and "Keep this
   email to yourself". All three now say "dela inte mejlet med någon".
3. **A language's name inside a sentence is in lower case**, as Swedish
   writes it: "Byt dem till svenska". The list to choose from keeps its
   capital ("Svenska"), and English keeps its own ("English") in a Swedish
   sentence. The code decides it, not the catalog
   (`languageNameInSentence`), from CLDR, so `{name}` arrives cased.
4. **No "open signup" before a count.** "Din öppna anmälningslista", like
   English's "your open signup", read as the product's name, OpenSignup.
   Account Settings says "1 av dina anmälningslistor är öppen och är inte på
   svenska än." and offers "Byt den till svenska" ("Byt dem" for more).

### Open questions

A matter of taste a review raises and the translator doesn't take goes here,
so the next pass sees it.

1. **"flytten" or "det du flyttade"** in the Build tab's two drag refusals
   (`organizer.build.refusal.slotsMoved`, `fieldsMoved`, from #981's review):
   _flytten_ alone mostly means moving house, but "så det du flyttade
   sparades inte" takes the rail to 8 lines at 320 pixels, against 7 for
   English and for "flytten". "så ordningen sparades inte" also fits in 7.
2. **"i hela tal" or "med hela tal"** for how many people
   (`organizer.compose.questions.problems.wholeNumbers`, from #982's review).
   The catalog keeps "i hela tal", as in "i hela kronor".
3. **"uppgifter man turas om med" or "uppgifter som går på tur"** for
   rotating roles (`organizer.compose.starters.community.blurb`, from #982's
   review): _turas om_ is the usual verb, and _gå på tur_ can read as going
   on an outing. Either takes the card to three lines at 320 and 1280
   pixels, where English has two; dropping "inför evenemang" keeps two, but
   loses the events.
4. **"Too many sign-in requests."** `auth.form.errors.rateLimited` reads "För
   många inloggningslänkar har begärts.", with the verb of "Begär en ny
   länk". #980's review offered the noun, "För många begäranden om
   inloggning.", which keeps the English's shape but is stiffer. Both say
   requests, not attempts.
5. **"Länk kopierad" or "Länken är kopierad".** The sign-up sheet's button
   says "Länk kopierad" once the link is copied
   (`participant.dialog.linkCopied`), while what's announced on the same
   sheet (`participant.dialog.copied`) and the share panel's chip and
   message say "Länken är kopierad", the state with _är_ that Organizer terms
   chose. From the review of the joined stack.
