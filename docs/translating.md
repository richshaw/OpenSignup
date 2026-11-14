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

| Audience    | Namespaces                       | What's in them today                                                                                                                                  |
| ----------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| participant | `participant`, `email`, `common` | The signup's page, the sign-up sheet, the edit, cancelled and unsubscribe pages, both not-found pages, the participant emails, and the footer's links |
| organizer   | `organizer`, `auth`, `common`    | Organizer text that shows on a participant page: the bar across the top, the Preview banner, and the note on your own draft                           |
| site        | `site`, `common`                 | Nothing yet                                                                                                                                           |

`auth` and `site` have no messages yet. `participant.defaults` holds the names
a new signup's first fields get ("What", "Date") and a new field's ("Untitled",
"Option 1"). Organizers see them on the Build tab, but they become the
signup's own text, which participants read, so they're in the signup's
language.

Organizer text stays English for now. The `organizer` namespace has no
Swedish, and its text is marked `lang="en"` where it sits on a Swedish page.
The rest of the organizer app, the sign-in email, the landing, help and legal
pages, and API error text and AI connector tool descriptions aren't in the
catalogs at all. API errors and tool descriptions stay English on purpose:
developers and models read them.

A language's catalog can be partial. Any message it lacks comes out in
English (`withEnglishUnder` in `src/i18n/translator.ts`), so a half-done
language never shows a key's name.

Each language but English also has a record of the English each of its
messages was translated from, `src/i18n/translated-from/<language>.json`, so
the catalog check can tell when a translation has fallen behind its English
(see "Stale translations").

## How a message reaches the screen

- **Which language.** A signup's pages and emails are in `signupLocale`
  (`src/i18n/config.ts`): the language saved in the signup's settings once it
  has shipped to participants, else the site's `DEFAULT_LOCALE` once that has
  shipped, else English. Emails use the same rule (`emailLocale` in
  `src/email/commitment-row.ts`).
- **Server code** (pages, emails, the reminder worker) calls
  `getServerTranslator(locale, namespace)` from `src/i18n/server.ts`.
- **Client components** call next-intl's `useTranslations` inside
  `<ClientMessages>`, which the page above them fills from `messagesFor`, with
  the sections they read. Only those sections reach the browser. The
  participant forms' lists are in `src/app/s/[slug]/client-namespaces.ts`, so a
  client component that reads a new section needs it added there, or it shows
  the key's name and logs an error.
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
"keep": "… så vidarebefordra inte mejlet.{reminder, select, yes { Vi skickar också en påminnelse {hours, plural, =24 {dagen innan} one {# timme innan} other {# timmar innan}}.} other {}}"
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
language so its record drops the old key and, for a rename, marks the new
one.

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
  language has shipped. A site's `DEFAULT_LOCALE` counts only for audiences its
  language has shipped to (`defaultFor`).

Today `CATALOG_LOCALES` is `en` and `sv`, and `SHIPPED` holds only `en`, for
every audience.

Adding a language to `SHIPPED.participant` is its launch. From then on the
catalog check requires every message in `participant`, `email` and `common`,
so a language ships only when it's complete. It ships only after it has also
passed the review in context, which no test can check: the pull request that
adds it says so.

`E2E_UNSHIPPED_LOCALES` is for tests only. `playwright.config.ts` sets it for
the server it starts, so the seeded Swedish signups show in Swedish before
Swedish ships. It keeps a language already saved in a signup's row, and does
nothing else: nothing in the app can save a language that hasn't shipped. The
web server and the worker log a warning when they start with it set. A reused
`pnpm dev` needs it too: `E2E_UNSHIPPED_LOCALES=sv pnpm dev`. Never set it on
a real site.

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
   language as "Stale translations" says.

## Adding a language

1. **Make its catalog.** Add `src/messages/<code>.json` (start it as `{}`),
   add the code to `CATALOG_LOCALES`, and import the catalog into `CATALOGS`
   in `src/i18n/translator.ts`. Use a bare language code, like `sv`, never a
   region (`sv-SE`). Its record, `src/i18n/translated-from/<code>.json`,
   comes with the first messages you mark as translated.
2. **Give it test signups.** Add a seed like `makeSwedishSignup` in
   `tests/e2e/helpers/seed.ts`, add the code to `E2E_UNSHIPPED_LOCALES` in
   `playwright.config.ts`, and write a spec like
   `tests/e2e/swedish-signup.spec.ts` that saves a `translationShot` of every
   screen it checks. Add the spec to `TRANSLATION_SPECS` in
   `playwright.config.ts`, and to `pnpm translation:screenshots` in
   `package.json`. Add the participant emails in the language to
   `scripts/lib/email-samples.ts`, and their names to the lists in
   `src/email/templates/emails.test.tsx` and `worker-render.test.ts`.
3. **Write its glossary** below, before translating: the product's own terms,
   the tone and the date style.
4. **Translate and review** with the `translate` skill, namespace by namespace.
5. **Check the layout.** `tests/e2e/slot-row-layout.spec.ts` checks that the
   row buttons and the sheet's labels fit their boxes, on the English and the
   Swedish signup. Add the new language's signup to it.
6. **Launch** in a pull request of its own, which the owner approves: add the
   code to `SHIPPED.participant`, take it out of `E2E_UNSHIPPED_LOCALES`, and
   say what changes in `CHANGELOG.md` and the README.

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
email's HTML and plain text, in English and Swedish, and makes the Swedish e2e
specs save a screenshot of each screen and state they check, on a desktop and
at a phone's width (390 pixels). Everything goes to `translation-review/`,
which git ignores. Without the flag the tests write nothing, so CI is
unaffected. In Claude's cloud container, Playwright's own Chromium isn't
installed: add `-c .claude/skills/run-opensignup/playwright.container.config.ts`.

Some messages have no screenshot, and the reviewer reads them in the catalog.
A signup that doesn't exist has no language, so its not-found page
(`participant.gonePage.signup`) is in the site's language, which can't be
Swedish until Swedish ships. And the spec doesn't reach a few rarer states: a
cancelled spot whose slot has since filled or closed, someone the organizer
took off a slot or moved, someone signed up for more than one slot, the edit
page's errors when cancelling, and copying the link.

## Swedish glossary

These are the words the Swedish catalog uses. A change to one of them changes
it everywhere it appears, in the same pull request. The first full review of
the Swedish translation (#639) settled the questions earlier passes left
open; "Settled" below says what it chose and why, so a later pass doesn't
undo it by accident.

### Terms

| English                                                      | Swedish                       | Notes                                                                                    |
| ------------------------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------- |
| signup (the list people sign up on)                          | anmälningslista               | "Den här anmälningslistan är inte klar ännu". No short form ("listan")                   |
| sign up (the button)                                         | Anmäl dig                     | "Anmäl dig till {slot}"                                                                  |
| signed up                                                    | anmäld, anmälda               | "Du är anmäld", "2 anmälda"                                                              |
| your spot, your sign-up (the one you made)                   | din anmälan, dina anmälningar | "Visa eller ändra din anmälan", "Din anmälan är avbokad". Never _din plats_              |
| Sign up (the tab title of a signup page that can't be shown) | Anmälan                       |                                                                                          |
| slot                                                         | pass (the same in the plural) | Only where the sentence needs the noun: "det här passet", "Pass utan namn"               |
| spot, spots (a number of them)                               | plats, platser                | "1 plats", "19 av 20 platser kvar", "Behåll den plats du har"                            |
| the Spots box                                                | Platser                       | "Antal platser" doesn't fit the 80-pixel box on the sheet                                |
| Spots, in an email                                           | Antal platser                 | "Antal platser: 2", which can't be read as an organizer's "Plats:" field                 |
| organizer                                                    | arrangör                      | "Kontakta arrangören"                                                                    |
| participant                                                  | deltagare                     | No participant message uses it yet; people are "du"                                      |
| cancel (your spot)                                           | avboka                        | "Avboka", "Ja, avboka", "Din anmälan är avbokad"                                         |
| Cancel (close the sheet)                                     | Avbryt                        |                                                                                          |
| Keep                                                         | Behåll                        | "Behåll", "Behåll dem"                                                                   |
| Edit                                                         | Ändra                         | "Ändra eller avboka"                                                                     |
| Full (a slot)                                                | Fullt                         | Agrees with _pass_; "Tyvärr, det blev precis fullt."                                     |
| Closed (a slot's row)                                        | Stängt                        | Agrees with _pass_, and reads as a sign                                                  |
| Closed (the signup page's banner)                            | Anmälan är stängd             | The usual phrase                                                                         |
| Closed (the edit page's banner)                              | Stängt för nya anmälningar    | The signup or the slot closed; the participant's own sign-up still works                 |
| open: spots still free                                       | ledig, ledigt                 | "vad som fortfarande är ledigt"                                                          |
| open: a signup taking sign-ups                               | öppen                         | No participant message says it yet                                                       |
| ask for (a number of spots)                                  | välja                         | "Välj 5 eller färre", "du valde 6"                                                       |
| email (the address, the box)                                 | e-post                        | "E-post (valfritt)"                                                                      |
| an email (a message); to email                               | mejl; mejla                   | "bekräftelsemejl", "påminnelsemejl", "Vi mejlar dig"                                     |
| reminder                                                     | påminnelse                    | "Stäng av påminnelser om {title}", "Slå på påminnelserna igen"                           |
| a new date or time (the change emails)                       | ny tid; Tiden har ändrats     | Subject "Ny tid: {title}"; "har flyttat din anmälan till ett nytt datum eller en ny tid" |
| Notes (optional)                                             | Kommentar (valfritt)          |                                                                                          |
| (optional)                                                   | (valfritt)                    |                                                                                          |
| link                                                         | länk                          | "Spara din länk", "Kopiera länk"                                                         |
| Add to calendar                                              | Lägg till i kalendern         | The definite form, as Swedish says it                                                    |
| Save; Saved.                                                 | Spara; Sparat.                |                                                                                          |
| Done                                                         | Klart                         |                                                                                          |
| (no {label})                                                 | (utan {label})                | "(utan datum)"                                                                           |
| Untitled slot; Untitled (a field)                            | Pass utan namn; Namnlös       |                                                                                          |
| What, Date, Option 1 (a new signup's fields)                 | Vad, Datum, Alternativ 1      |                                                                                          |
| Sorry                                                        | Tyvärr                        | "Tyvärr, den här länken fungerar inte"                                                   |
| Privacy (the footer link)                                    | Integritetspolicy             |                                                                                          |
| Keep this email to yourself                                  | Dela inte mejlet med någon    | Or "vidarebefordra inte mejlet", as the confirmation says it                             |

### Style

- **Tone.** _Du_, never _ni_, and the plain, friendly tone of the English.
  Instructions are imperatives: "Försök igen.", "Kontrollera den och försök
  igen."
- **Dates and times.** The app formats them, not the catalog: "lör 3 maj",
  "lör 5 sep." (`Intl` puts a full stop after an abbreviated month, and none
  after a short one like _maj_), and "18:30" on the 24-hour clock. So never
  end a sentence on a slot's name (see "A name at the end of a sentence").
- **Numbers.** `{n, number}`, so "1 234" with a no-break space.
- **Punctuation.** A spaced en dash (–) inside a sentence, where English has
  an em dash. An ellipsis is one character: "Sparar…".
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
  avbokade.", "en påminnelse innan det är dags", "Du har 3 anmälningar".

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
   they're only sent for a new date or time.
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
   dem", which fit side by side at 390 pixels.

### Open questions

None at the moment. A matter of taste a review raises and the translator
doesn't take goes here, so the next pass sees it.
