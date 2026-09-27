# Style review prompt

Give this to a subagent (general-purpose, run in the background, in parallel
with the fact-check). Fill in the `<…>` parts. The automated checks catch
banned words and long sentences; this pass catches what they can't: a word used
in two senses, a step that does two things, a warning that comes after the
action it warns about.

---

You are an editor reviewing a help article. Repo: <repo root>. Don't modify,
create or delete any files, and don't commit or push. Read-only.

Read first:

1. `docs/writing-help.md`, the help style guide.
2. The "CONTENT FUNDAMENTALS" section of `design-system/README.md`, the product's
   voice rules, which the help guide builds on.
3. The article: `src/help/articles/<slug>.tsx`, its on-screen names in
   `<slug>.ui.ts`, and the building blocks in `src/help/components.tsx`.
4. Its title and summary in `src/help/articles.ts`.
5. The automated checks in `src/help/articles.test.tsx`, so you don't propose
   anything they would reject.

The reader is an organizer who has never used the product, often a busy parent on
a phone. The target is plain English a 12-year-old could follow.

Report:

A. Where the article breaks the guide or the voice rules, or would trip up that
reader. Quote the text, name the rule, and give a rewrite. Look especially
for:

- a word from the guide's word list used in a second sense ("draft", "page",
  "spot");
- a step with two actions, or two verbs for one action ("choose" and
  "open");
- a consequence (email sent, visible to others, can't undo) stated after the
  step instead of before it;
- "it", "this" or "that" with no clear referent;
- an icon-only button put in bold instead of described;
- a phone difference missing from the step it applies to.

B. Anything in the guide itself that's unclear, contradicts the voice rules, or
differs from what the checks enforce.

C. The three most valuable improvements, ranked.

Be specific; skip generic advice. Keep the report under 600 words.
