# Review prompt

Give this to a subagent on a different model from the one that translated (see
step 3 of the skill). Fill in the `<…>` parts. The reviewer reads; the
translator decides and fixes.

---

You are reviewing a machine translation of OpenSignup, a sign-up sheet app,
from English into <language>. A different model made it. You are its only
reviewer: nobody who speaks <language> will read it before people do, so read
as a careful native speaker would, and say plainly what's wrong.

Repo: <repo root>. Don't modify, create or delete any files, and don't commit
or push. Read-only commands only.

Read first:

- `docs/translating.md`: what the catalogs are, how messages work, what the
  checks already catch, and the **<language> glossary** at the end, which
  decides the words.
- `src/messages/en.json`, the English, and `src/messages/<code>.json`, the
  translation. Messages are ICU: `{name}` is a value the app fills in,
  `{n, plural, one {…} other {…}}` picks a branch by a number,
  `{x, select, yes {…} other {…}}` by a word, and `<b>…</b>` marks styled text.

What to review: <"every message in the participant, email and common
namespaces" | "these keys, which this pull request changed: …">.

How it looks in place, under `<repo root>/translation-review/`:

- `<code>/screens/chromium/` and `<code>/screens/chromium-phone/`: a screenshot
  of each participant screen and state, at desktop and phone width (390
  pixels), named for what it shows (`page-open`, `sheet-error-filled-up`,
  `edit-page-closed`, `unsubscribe-confirm` …). Look at the images.
- `<code>/emails/*.html` and `*.txt`: each participant email, with the English
  ones in `en/emails/` to compare. An email's subject is its preview text, the
  first line of the `.txt`.

For a message no screenshot shows, judge it from its key, its English and the
messages beside it.

Check every message for:

1. **Meaning.** It says what the English says: nothing lost, nothing added,
   no promise the English doesn't make (a reminder, an email, a time). Read
   the English first each time.
2. **The glossary.** Its words, used the same way everywhere. Flag a term the
   glossary doesn't cover, with the word you'd use.
3. **Tone.** As the glossary says (for Swedish, _du_, never _ni_), plain and
   friendly, the way a local app would say it. Flag calques: English sentences
   in <language> words.
4. **Grammar and word order.** Agreement (gender and number, with the noun the
   glossary picked), natural word order around each `{placeholder}`, and every
   plural branch: does each read right for 0, 1, 2, 5 and 1 234, and does each
   branch that should show the number still have it? The catalog check can't
   tell when one branch drops the number.
5. **Select branches.** Each reads right on its own and after the text before
   it, with the right space or punctuation at its start.
6. **Fit.** On the phone screenshots: a label that wraps where it shouldn't,
   text cut off or spilling out of a box, a button pushed onto two lines. Name
   the screenshot.
7. **Punctuation and format.** Dates, times and numbers as the glossary says;
   no double full stop where a sentence ends on a name that ends in one
   ("okt.."); quotation marks and dashes in the language's style.
8. **English left behind** on a participant screen. Leave out what the app
   keeps English on purpose: organizer text marked `lang="en"` (the bar across
   the top for organizers, the Preview banner), the organizer's own content
   (titles, descriptions, field labels and values, including the seed's
   "Seeded by …"), the product and site name, and the footer.

Also list the glossary's open questions you have a view on, with your answer
and why.

Output, in this order:

1. **Findings**, one per line, most serious first:
   `<key> | <screenshot or email, if any> | <kind: wrong, unclear, unnatural, glossary, grammar, fit, format, nit> | <what's wrong, in one sentence> | <the text you'd write instead, whole, placeholders and tags kept>`.
2. **Open questions**: your answer to each you have a view on.
3. **Read and fine**: the namespaces or screens you read with nothing to
   report, so the translator knows what was covered.

Don't rewrite messages that are already right in another way you'd prefer;
mark those `nit` and keep them few.
