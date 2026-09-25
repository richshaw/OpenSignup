---
name: help-pages
description: Add, update and check OpenSignup's in-app help pages (/help, src/help). Use when asked to write or add a help article, help page or organizer guide; to update help after changing a screen, button label, step, email, setting or anything a help page describes; to check whether a change needs a help update; to fix a help page that's wrong or out of date; to re-take help screenshots; or to review help text for accuracy and plain English. Use it for any code change that renames or moves something organizers see, even if nobody mentions help.
---

# Help pages

Organizer help lives in the app at `/help` and ships with the code, so every
OpenSignup site has it. Each article is a small bundle that has to stay in step
with the product:

| file                                          | what it is                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `src/help/articles/<slug>.tsx`                | the article                                                             |
| `src/help/articles/<slug>.ui.ts`              | every on-screen name the article prints (buttons, boxes, messages)      |
| `tests/e2e/help/<slug>.spec.ts`               | the walkthrough: clicks through the article's steps by those same names |
| `public/help/<slug>/*.png`                    | screenshots, taken by the walkthrough                                   |
| `src/help/articles.ts`, `src/help/bodies.tsx` | where it's registered                                                   |

Three things keep an article true, and your job is to keep all three working:
facts the code decides are **imported**, not typed (`REMINDER_LEAD_HOURS`);
the **walkthrough** fails when a named control is renamed or moved; and
`src/help/articles.test.tsx` fails on the style rules a machine can check.
None of them can tell whether a sentence is true, which is why every change
ends with a fact-check against the code.

Read `docs/writing-help.md` before writing a word. It's short, and the checks
enforce it.

## Get the app running

Help work means looking at real screens: to learn their exact names, to run the
walkthrough and to take screenshots. Start the app and drive it with the
`run-opensignup` skill (`.claude/skills/run-opensignup/SKILL.md`). Its driver
can sign in, click through a flow and screenshot each step, which is the
fastest way to see what a reader will see.

In Claude's cloud container, Playwright needs the run skill's config to find
Chromium, so run walkthroughs with
`-c .claude/skills/run-opensignup/playwright.container.config.ts`. Elsewhere
the plain `pnpm test:e2e` / `pnpm help:screenshots` work.

## Update help after a change

1. **Find the articles the change touches.**

   ```bash
   node .claude/skills/help-pages/scripts/affected-articles.mjs          # vs. where the branch left main
   node .claude/skills/help-pages/scripts/affected-articles.mjs HEAD~1   # or any base
   ```

   It reports, per article, on-screen names that a changed line removed or
   renamed, imported facts whose module changed, and direct edits; then screen
   files that changed without matching any name. Treat it as a lead, not a
   verdict. A change can alter a task without renaming anything (a new required
   step, a different default, something moving from one tab to another), so
   read the diff and skim the article titles yourself.

   If the script finds nothing and the change doesn't alter a documented task,
   say so and stop. Don't touch help pages that are still right.

2. **Size the job.** Most changes are one of two kinds, and they need very
   different amounts of work:
   - **Only a name changed.** Same control, same place, same result, new
     words. Change it in `<slug>.ui.ts`, reread each sentence that uses it (a
     new name can make the sentence around it wrong), and run the style checks
     and the walkthrough. The walkthrough finds the control by the new name,
     so a pass proves the page matches the screen; you don't need to walk the
     app or start reviewers for this. Look at the article's pictures in
     `public/help/<slug>/` and re-take only the ones that show the old name.
   - **What happens changed.** A new or removed step, a different default, a
     control that moved, a different result, a new email. Do steps 3 to 5.

   Either way, `git grep -n "<old name>"` for anything else that looked for
   the old wording. Component tests (`*.test.tsx`) often find controls by
   label and fail after a rename; fix them in the same change and say so in
   your report.

3. **See the screen as it is now.** Walk the affected steps in the running app
   with the driver, desktop and phone, and note the exact names. Don't trust the
   diff for wording: labels are often assembled from pieces or come from
   `aria-label`.

4. **Update the name list first, then the article, then the walkthrough.**
   `<slug>.ui.ts` is the single place a name lives; the article prints
   `<Ui>{UI.x}</Ui>` and the walkthrough finds `UI.x`. Rewrite the steps that
   changed, and make the walkthrough check the new behaviour, not just that the
   button exists. Re-take the screenshots whose screens changed ("Screenshots"
   below).

5. **Run the checks, review, and look at the page** (the last three sections).

## Add a new help page

1. **Pick one task.** The title is that task in the reader's words, starting
   with a verb ("Close a signup", not "Closing"). Check `HELP_ARTICLES` in
   `src/help/articles.ts` so you don't duplicate or overlap a page. Help is for
   organizers; people signing up get everything they need on the signup page.

2. **Do the task in the app before writing anything.** Use the driver to walk
   it on desktop and on a phone (`open phone`). Write down every name you click
   or read, where it is, what changes on screen, who else sees the change, and
   which emails go out (the driver's `email` command reads them from the log).
   This walk is what the article is made of; writing from the code alone gets
   names and order wrong.

3. **Scaffold it.**

   ```bash
   node .claude/skills/help-pages/scripts/new-article.mjs close-a-signup "Close a signup" "Stop new sign-ups and keep the ones you have."
   ```

   This creates the three files, registers the article in `articles.ts` and
   `bodies.tsx`, and adds its address to the sitemap test
   (`src/lib/seo.test.ts`). The files contain TODOs on purpose:
   `pnpm test src/help` fails on "TODO" and the walkthrough throws, so a
   half-written page can't pass CI.

4. **Fill in the name list, the article and the walkthrough**, in that order.
   Use `src/help/articles/create-and-publish-a-signup.tsx` and its walkthrough
   as the model: its structure (intro saying what the reader ends up with;
   short sections with numbered steps; a "what happens next" part) has been
   through a full review.

5. **Screenshots, checks, review, look at the page** (below).

## Writing the article

The rules are in `docs/writing-help.md`; these are the ones that are easy to
get wrong in code:

- **Facts come from the code.** Import the constant and phrase it with a small
  helper, the way the existing article turns `REMINDER_LEAD_HOURS` into "the
  day before". A typed "24 hours" goes stale silently.
- **Say it before the step.** Emails sent, things other people will see, and
  anything that can't be undone go before the action, not after.
- **Features a site can switch off** (Magic Compose needs `LLM_BASE_URL`) get
  a `<Note>` starting "Some sites…", and the steps follow the path every site
  has.
- **Icon-only buttons** (the three dots, the copy icon) are described in
  words and not bolded. Their accessible name still goes in `.ui.ts` so the
  walkthrough can find them.
- **Bold only through `<Ui>`**, and only names that are in the `.ui.ts` list.

## Writing the walkthrough

It follows the article step by step, finds every control by `UI.*`, and
asserts what the article says happens (a banner, a count, a page someone else
sees), not just that a button exists. Patterns that save time here:

- **Both headers are in the DOM.** The phone and desktop headers render
  together, one hidden by CSS, so text like `draft` or `Public link` matches
  twice. Add `.locator('visible=true')`.
- **Give the phone path its own test** with `test.use({ viewport: { width: 390, height: 844 } })`;
  skip the desktop test when `isMobile` (the local `mobile-safari` project).
- **A site setting can change the path.** When drafting is on, New signup
  opens a different screen. Wait for either screen
  (`expect(a.or(b)).toBeVisible()`) before branching: `isVisible()` doesn't
  wait. Names on screens CI can't reach get a unit test that renders the
  component instead (`create-and-publish-a-signup.test.tsx`).
- **Wait for `Saved`** after editing in the builder before navigating away:
  edits save in the background.
- **Dialogs can rename themselves** (Fields becomes "Edit field"); find them by
  role without a name.
- **A participant is a fresh context**: open the public link in a new page
  from `browser.newPage()`, or copy it first (grant clipboard permission).

## Screenshots

The walkthrough takes them when `HELP_SCREENSHOTS=1`, through its `shot()`
helper or a `page.screenshot({ clip })`, at `deviceScaleFactor: 2`.

- Crop to the part the step is about. A full-width header shrinks to
  unreadable text in the article column.
- Replace this test server's address with `https://your-site.example/…`
  before the shot (the existing walkthrough shows how). Only the displayed
  text changes.
- Only made-up data: the seeded organizer and names like `Sam Example`. The repo
  is public.
- In the article, `<Screenshot width height>` are half the PNG's pixel size
  (the style check tells you the right numbers if they're off), and the alt
  text says what the picture shows, not "Screenshot of…".
- Look at every picture after taking it. The copy button once showed a tick
  because the shot was taken after clicking it.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test          # style checks: src/help/articles.test.tsx
pnpm exec playwright test -c .claude/skills/run-opensignup/playwright.container.config.ts tests/e2e/help --project=chromium
HELP_SCREENSHOTS=1 pnpm exec playwright test -c .claude/skills/run-opensignup/playwright.container.config.ts tests/e2e/help --project=chromium
```

The walkthrough needs a production build (`pnpm build`, dev server stopped)
for a reliable run; see the run skill. Re-taking screenshots of unchanged
screens produces identical files, so `git status` shows only real changes.

If a style check is wrong rather than your text, fix the rule in
`articles.test.tsx` and the matching line in `docs/writing-help.md` together.

## Review before you finish

For a new page or a rewritten step, start two subagents in parallel, in the
background, with the prompts in `references/fact-check.md` and
`references/style-review.md`. The fact-check matters most: it reads the code
behind every claim, and it's where the real mistakes turn up (claims true for
one setup but not another, counts described wrongly, promises the code doesn't
keep). In testing, a page written without it told organizers that people
"still get a reminder email" after a signup closes, which is true only when
reminders are on and the slots have a date.

If you can't start subagents (you may be one), do both reviews yourself, one
after the other, following the same prompts. Do the fact-check first and
write down the verdict for each claim before you move on, so you can't
skip one.

Check each finding in the code yourself before applying it; reviewers are
sometimes wrong. Then look at the page: `nav /help/<slug>` and `ss` with the
driver, on desktop and phone (`open phone`). The driver's `ss` scrolls first so
lazy-loaded screenshots appear.

## Report

Tell the user, in plain English: which pages changed and why, what the
fact-check found and what you did about it, anything you couldn't verify (a
screen CI can't reach, behaviour that depends on site setup), and the test
results. If no page needed changing, say so and say why.
