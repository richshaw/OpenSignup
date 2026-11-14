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
"onlyLeft": "Det finns bara {remaining, plural, one {{remaining, number} plats} other {{remaining, number} platser}} kvar, och du bad om {requested, number}."
```

A translation may move more of the sentence into the branches when its
grammar needs it. Swedish puts the possessive there, because "your" agrees
with the number:

```json
"keepsYours": "No one new can sign up, but your {count, plural, one {spot is} other {spots are}} still yours."
"keepsYours": "Inga fler kan anmäla sig, men {count, plural, one {din plats är kvar} other {dina platser är kvar}}."
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
shows two ("Du är anmäld till Kaffe · fre 4 dec.."). Today that's
`participant.signupView.signedUp`, `participant.dialog.shareText`, and
`savedNotEmailed` after `<b>{slot}</b>`. Where the language lets you, word the
sentence so the name doesn't end it.

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
  namespace (see the next section).

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
- **A stale translation.** When an English message changes, its translation
  keeps saying the old thing, and nothing fails yet. The `translate` skill's
  script lists the messages whose English changed on your branch.

The review in context (below) is what catches these.

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
   `SHIPPED` (none but English today). For a language that has a catalog but
   hasn't shipped, Swedish today, do it too when you can, so it stays ready to
   launch. Until someone does, its test signups show the old translation, or
   English for a new message.

## Adding a language

1. **Make its catalog.** Add `src/messages/<code>.json` (start it as `{}`),
   add the code to `CATALOG_LOCALES`, and import the catalog into `CATALOGS`
   in `src/i18n/translator.ts`. Use a bare language code, like `sv`, never a
   region (`sv-SE`). `pnpm typecheck` then points at the tests that keep a
   table by language, like `KEEP_IT_PRIVATE` in
   `src/app/s/[slug]/commit-dialog.test.tsx`: give each an entry once the
   messages it checks are translated.
2. **Give it test signups.** Add a seed like `makeSwedishSignup` in
   `tests/e2e/helpers/seed.ts`, add the code to `E2E_UNSHIPPED_LOCALES` in
   `playwright.config.ts`, and write a spec like
   `tests/e2e/swedish-signup.spec.ts` that saves a `translationShot` of every
   screen it checks. Add the spec to `TRANSLATION_SPECS` in
   `playwright.config.ts`, and to `pnpm translation:screenshots` in
   `package.json`. Add the participant emails in the language to
   `scripts/lib/email-samples.ts`, and their names to the list in
   `src/email/templates/worker-render.test.ts`. The list in `emails.test.tsx`
   beside it holds only the Swedish ones (`lang === 'sv'`), so give the new
   language an assertion of its own there.
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
   glossary.
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
it everywhere it appears, in the same pull request. Where the catalog
disagrees with itself today, the open questions below say so, for the full
review of the Swedish translation (#639) to settle.

### Terms

| English                                      | Swedish                              | Notes                                                     |
| -------------------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| signup (the list people sign up on)          | anmälningslista                      | "Den här anmälningslistan är inte klar ännu"              |
| sign up (the button)                         | Anmäl dig                            | "Anmäl dig till {slot}"                                   |
| signed up                                    | anmäld, anmälda                      | "Du är anmäld", "2 anmälda"                               |
| a sign-up (the act); the page's tab title    | anmälan                              | "Anmälan", "Min anmälan till {slot}"                      |
| slot                                         | pass (the same in the plural)        | Open question 3                                           |
| spot                                         | plats, platser                       | Open question 1                                           |
| the Spots box                                | Platser                              | "Antal platser" doesn't fit the 80-pixel box on the sheet |
| organizer                                    | arrangör                             | "Kontakta arrangören"                                     |
| participant                                  | deltagare                            | No participant message uses it yet; people are "du"       |
| cancel (your spot)                           | avboka                               | "Avboka", "Ja, avboka", "Din plats är avbokad"            |
| Cancel (close the sheet)                     | Avbryt                               |                                                           |
| Keep                                         | Behåll                               | "Behåll", "Behåll dem"                                    |
| Edit                                         | Ändra                                | "Ändra eller avboka"                                      |
| Full (a slot)                                | Fullt                                | Agrees with _pass_                                        |
| Closed                                       | Stängd (the signup), Stängt (a slot) | Open question 4                                           |
| open: spots still free                       | ledig, ledigt                        | "vad som fortfarande är ledigt". Open question 2          |
| open: a signup taking sign-ups               | öppen                                | No participant message says it yet                        |
| email (the address, the box)                 | e-post                               | "E-post (valfritt)"                                       |
| an email (a message); to email               | mejl; mejla                          | "bekräftelsemejl", "påminnelsemejl", "Vi mejlar dig"      |
| reminder                                     | påminnelse                           | "Stäng av påminnelser", "Slå på påminnelserna igen"       |
| Notes (optional)                             | Kommentar (valfritt)                 |                                                           |
| (optional)                                   | (valfritt)                           |                                                           |
| link                                         | länk                                 | "Spara din länk", "Kopiera länk"                          |
| Save; Saved.                                 | Spara; Sparat.                       |                                                           |
| Done                                         | Klar                                 | Open question 6                                           |
| (no {label})                                 | ({label} saknas)                     | Open question 5                                           |
| Untitled slot; Untitled (a field)            | Pass utan namn; Namnlös              | Open question 6                                           |
| What, Date, Option 1 (a new signup's fields) | Vad, Datum, Alternativ 1             |                                                           |
| Sorry                                        | Tyvärr                               | "Tyvärr, passet blev precis fullt."                       |

### Style

- **Tone.** _Du_, never _ni_, and the plain, friendly tone of the English.
  Instructions are imperatives: "Försök igen.", "Kontrollera den och försök
  igen."
- **Dates and times.** The app formats them, not the catalog: "lör 3 maj",
  "lör 5 sep." (`Intl` puts a full stop after an abbreviated month, and none
  after a short one like _maj_), and "18:30" on the 24-hour clock.
- **Numbers.** `{n, number}`, so "1 234" with a no-break space.
- **Punctuation.** A spaced en dash (–) inside a sentence, where English has
  an em dash. An ellipsis is one character: "Sparar…".
- **Buttons named in a sentence** are written as on screen, today without
  quotation marks: "Tryck på Bekräfta igen."

### Open questions for the review (#639)

1. **The participant's own sign-up: _din plats_ or _din anmälan_?** The catalog
   uses both. The edit page's title, the cancelled page and the emails say
   _din plats_ ("Visa eller ändra din plats"); the sheet and the row say
   _din anmälan_ ("Vi har sparat din anmälan till …", "Ändra din anmälan till
   …"). _Plats_ is also the word organizers most often give a location field,
   so an email can show "Plats: Aulan" just above "Visa eller ändra din
   plats", which reads as "your location". _Din anmälan_ avoids that. The
   split isn't by screen, either: the signup page's own closed banner says
   "din plats är kvar" (`participant.signupView.closedBanner.keepsYours`) on
   the page whose sheet says _din anmälan_.
2. **Can a spot be "open"?** #638 defines _open_ as a signup people can sign
   up on now, but participant text also calls free spots open ("Reload the
   page to see what's still open"), and so do two help pages. Swedish keeps
   them apart: _ledig_ for a free spot, _öppen_ for a signup taking sign-ups.
   Keep that split whatever English settles on.
3. **_Pass_ for a slot.** It fits shifts, but reads oddly for things to bring:
   "Välj ett annat pass" and "Ditt pass har ändrats" on a fika list. Where a
   sentence can do without the noun, it may read better ("Tyvärr, det blev
   precis fullt."). The emails' "Ditt pass har ändrats" could become "Tiden
   har ändrats", since the change is always a new date or time.
4. **_Stängd_ or _Stängt_.** The signup page's banner says "Stängd", agreeing
   with _anmälningslista_. The edit page's banner says "Stängt", neuter as on
   a sign, because it can mean the signup or the slot. "Anmälan är stängd" is
   the usual phrase for the first.
5. **"({label} saknas)" or "(utan {label})".** As a heading, "(datum saknas)"
   reads like an error; "(utan datum)" reads as a group.
6. **Smaller wording.** "Klar" or "Klart"; "Be om" and "du bad om" or "Välj"
   and "du valde"; "Namnlös" or "Utan namn"; "Behåll mejlet för dig själv"
   (a calque) or "Vidarebefordra inte mejlet"; "Tryck på knappen ovan"
   (touch only) or "Använd knappen ovan"; "Antal platser" in emails, which
   have room for it; quoting a button's name (Knappen ”Lägg till i kalender”).
7. **Layout.** The unsubscribe page's Swedish buttons wrap at 390 pixels.
8. **"Du är anmäld som {name}".** The edit page's "You're editing this as
   {name}." (`participant.editPage.editingAs`, and `editingAsWithEmail`) is
   "Du är anmäld som {name}.", which says "You're signed up as". It reads
   naturally there, but it isn't what the English says.
9. **_Listan_ for short.** The draft page's body
   (`participant.signupPage.draft.body`) says "när listan är publicerad", the
   only place the catalog shortens _anmälningslista_. Its title has just said
   the whole word; elsewhere the catalog always does.

These come from the term tables in #914 and #916 and the reviews of #914,
#916, #920, #921 and #929, which have more detail on each.
