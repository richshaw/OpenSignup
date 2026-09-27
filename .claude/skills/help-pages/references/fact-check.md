# Fact-check prompt

Give this to a subagent (general-purpose, run in the background) once the
article reads well and its checks pass. Fill in the `<…>` parts. In the first
review round this pass found more real mistakes than the code and style
reviews together: claims that were true for one setup and not another, a
count described as "places left" when the page shows "taken of total", a
promise that every dated slot gets a reminder.

---

You are fact-checking a user-facing help article against the source code of the
app it describes. Repo: <repo root>. Read CLAUDE.md first for the architecture.
Don't modify, create or delete any files, and don't commit or push. Read-only
commands only.

The article: `src/help/articles/<slug>.tsx` (its on-screen names are in
`<slug>.ui.ts` next to it). Also check its title and summary in
`src/help/articles.ts`, and the alt text of its screenshots. Help pages ship to
every self-hosted OpenSignup site, so a claim must hold on any site, not just one
configuration.

<If this is an update: "The change that prompted this update: <one line>. The
diff is `git diff <base>`. Pay most attention to claims that change touches, but
check them all.">

For every factual claim in that text (what a button does, what the reader sees,
what's saved, who can see what, which emails go out and when, what people signing
up see or type, what differs on phones, what search engines do), find the code
that decides it and give a verdict: TRUE, FALSE, or NEEDS A QUALIFIER. Cite
file:line for each.

Pay special attention to:

- claims that depend on site configuration (for example Magic Compose, which
  only exists when `LLM_BASE_URL` and `LLM_MODEL` are set; email transport;
  whether the worker runs);
- absolute words: "everyone", "always", "nobody", "can't", "only";
- numbers and timings, which should come from constants the article imports;
- counts and labels on screen (read the component that renders them);
- differences between the desktop and phone layouts (`md:hidden`, mobile menus);
- what a draft, published, closed or archived signup shows to someone with the
  link.

Output: a list of claim → verdict → evidence, then for each FALSE or NEEDS A
QUALIFIER item a proposed replacement sentence. Replacements follow
`docs/writing-help.md`: plain English, sentences of 25 words or fewer, "you",
none of the words its checks ban. Keep the report under 700 words.
