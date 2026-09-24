# Writing help pages

Help pages live in the app at `/help`, so every OpenSignup site has them. They
are written once, here in the repository, and each site fills in its own name
and contact details.

This guide is for anyone writing or changing a help page, including an AI
assistant drafting one. Read the voice rules in the design system first
([Content fundamentals](../design-system/README.md#content-fundamentals)):
calm, plain, sentence case, "you", no hype, no emoji. Everything below adds to
those rules; nothing here replaces them.

## Who is reading

An organizer who has not used OpenSignup before. Picture a parent setting up
snack duty on their phone between other jobs. They want to finish a task, not
learn the product.

- Write so a 12-year-old could follow it.
- Use short sentences. One idea per sentence.
- Use everyday words: "choose", not "select"; "change", not "modify"; "show",
  not "display".

## One task per page

- The title is the task, in the reader's words: "Let more than one person take
  a slot", not "Capacity". Start it with a verb.
- The first paragraph says what the reader will have when they finish.
- Then the steps. Then anything they might want to know afterwards.
- Keep each numbered list to about seven steps. If a task needs more, break it
  into sections with their own headings, or split it into two pages and link
  them.

## Steps

- Number the steps. One action per step.
- Name each button, link or box exactly as it appears on screen, in bold, using
  the `Ui` component: `<Ui>{UI.publish}</Ui>`. The walkthrough test clicks
  every one of these by name, so if the screen changes, the test fails and
  points at the page.
- Say where to find it when it is not obvious: "at the top of the page".
- When a phone shows it somewhere else, say so in the same step. For example,
  on a phone **Publish** is under **More actions**.
- Don't write "click". Write "choose" or "tap" (people use phones).

## Words

Use these words, the same way every time. Explain a word the first time a page
uses it.

| Say                        | Meaning                                | Don't say                  |
| -------------------------- | -------------------------------------- | -------------------------- |
| signup                     | the page people sign up on             | sheet, form, event, list   |
| slot                       | one thing people can sign up for       | row, item, entry, question |
| field                      | a detail every slot has, like its date | column, attribute          |
| how many people (capacity) | how many people can take one slot      | limit, quota               |
| publish                    | make the signup open to people         | go live, launch, activate  |
| people who sign up         | anyone taking a slot                   | users, customers, members  |
| your site                  | the OpenSignup site the reader is on   | the instance, the server   |

Leave out technical words: slug, token, workspace ID, API, database. The page
about connecting an AI assistant is the one place terms like MCP are allowed,
and it explains them.

## Say what happens next

- Tell the reader what people who sign up will see.
- When a step sends an email or shows something to other people, say so in
  that step, before they do it.
- When something can't be undone, say so before the step, not after.

## Works on every site

Help pages ship with the code, so they run on every OpenSignup site, not just
opensignup.org.

- Never write a site address or a contact email into the text. Use
  `INSTANCE_NAME` and `SUPPORT_EMAIL` from `src/lib/site-config.ts`.
- Some features are switched on by the person who runs the site (for example,
  drafting a signup from a description). Write "if your site offers…" and
  cover the path that always works.
- Describe what the product does now. No "coming soon".

## Facts come from the code

Any number or list that the code decides is imported, not typed. "Reminders go
out 24 hours before" reads `REMINDER_LEAD_HOURS`; a button name reads the
page's `UI` list. Then the page changes when the code does.

## Screenshots

- Only from the walkthrough test, which uses made-up data. Never from a real
  site, and never with a real name or email in it.
- Crop to the part that matters, not the whole page.
- Every screenshot needs alt text that says what it shows ("The New signup
  form with a title filled in"), not "Screenshot of the form".
- Where a screenshot would show this test server's address, the walkthrough
  swaps in a stand-in (`your-site.example`), since every site's address
  differs.
- Refresh them with `pnpm help:screenshots` after a change to the screens they
  show.

## What the checks catch

`pnpm test` (`src/help/articles.test.tsx`) reads every help page as a reader
sees it and fails on:

- "user", "simply", "just", "easy", "click", "please note", "note that",
  "instance", "go live", "launch", "coming soon", technical words (slug, token,
  API, database), exclamation marks and emoji
- a sentence longer than 25 words
- a title or heading in Title Case
- a site address, or any email other than the site's support email, written
  into the text
- bold text that isn't an on-screen name in `<Ui>`, or a `<Ui>` name that isn't
  in the page's `UI` list
- a screenshot with no alt text, alt text that starts "Screenshot of", a
  missing image file, or a width and height that don't match the file

`pnpm test:e2e` runs each page's walkthrough, which follows the steps by the
same names. CI runs both on every pull request.

The checks can't tell whether a page is clear or true. Read it out loud, and
follow it once on a real screen, before you open the pull request.

## Adding a page

1. Put the page's on-screen names in `src/help/articles/<slug>.ui.ts`.
2. Write the page in `src/help/articles/<slug>.tsx`, following the existing
   one.
3. Add it to `HELP_ARTICLES` in `src/help/articles.ts` and to `HELP_BODIES` in
   `src/help/bodies.tsx`.
4. Write its walkthrough in `tests/e2e/help/`, clicking through the same steps
   by the names in the `UI` list.
5. If the page has pictures, run `pnpm help:screenshots` (it needs the same
   setup as `pnpm test:e2e`) and set each `Screenshot`'s width and height to
   half the file's size. They are taken at double size so text stays sharp.
6. Run `pnpm lint && pnpm typecheck && pnpm test` and the walkthrough.

When a pull request changes a screen that a help page describes, update the
page, its walkthrough and its screenshots in the same pull request.
