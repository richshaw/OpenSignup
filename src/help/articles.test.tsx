// @vitest-environment jsdom

/**
 * Checks every help article, as a reader sees it, against the rules in
 * `docs/writing-help.md` that a machine can check. Failures say which rule
 * and why, so they read as a review comment rather than a puzzle.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APP_ORIGIN, INSTANCE_NAME, SUPPORT_EMAIL } from '@/lib/site-config';
import { HELP_ARTICLES } from './articles';
import { HELP_BODIES } from './bodies';

const BANNED: ReadonlyArray<readonly [RegExp, string]> = [
  [/\busers?\b/i, 'say "you" or "people who sign up"'],
  [/\bsimply\b/i, 'cut it: if it were simple, they would not be reading help'],
  [/\bjust\b/i, 'cut it'],
  [/\beas(y|ily|ier|iest)\b/i, 'cut it: it is not easy for someone who is stuck'],
  [/\b(click|tap)(s|ed|ing|ped|ping)?\b/i, 'say "choose": it works for a mouse and a finger'],
  [/\bplease note\b|\bnote that\b/i, 'cut it and say the thing'],
  [/\bslugs?\b|\btokens?\b|\bAPI\b|\bdatabase\b/i, 'leave out technical words'],
  [/\binstances?\b/i, 'say "your site"'],
  [/\b(go|goes|going|went|gone) live\b|\blaunch(es|ed|ing)?\b/i, 'say "publish"'],
  [/\bcoming soon\b/i, 'describe what the product does now'],
  [/!/, 'no exclamation marks'],
  [/\p{Extended_Pictographic}/u, 'no emoji'],
  [/\bTODO\b|\bFIXME\b/, 'finish the page: a new article starts with TODOs on purpose'],
];

const MAX_WORDS_PER_SENTENCE = 25;

// Capitalised words a sentence-case heading may still contain.
const PROPER_NOUNS = new Set(['OpenSignup', 'AI', 'Google', 'Claude', 'ChatGPT', 'I']);

function words(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

function bare(word: string): string {
  return word.replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Words after the first that start with a capital and have no excuse to. An
 * on-screen name keeps its own capitals, so each one is swapped for a
 * lowercase stand-in first; a short all-caps word is taken as an acronym.
 */
function titleCaseWords(
  heading: string,
  uiNames: ReadonlySet<string>,
  allowed: ReadonlySet<string>,
): string[] {
  let text = heading;
  for (const name of [...uiNames].sort((a, b) => b.length - a.length)) {
    text = text.split(name).join('x');
  }
  return words(text)
    .slice(1)
    .map(bare)
    .filter((w) => /^\p{Lu}/u.test(w) && !allowed.has(w) && !/^\p{Lu}{2,5}$/u.test(w));
}

const BLOCK_TAGS = new Set([
  'ARTICLE',
  'SECTION',
  'HEADER',
  'DIV',
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'OL',
  'UL',
  'LI',
  'FIGURE',
  'FIGCAPTION',
  'BLOCKQUOTE',
  'TABLE',
  'TR',
  'TD',
  'TH',
]);

/** Text to copy (`CopyText`): not prose, so the style checks leave it alone. */
function isCopyText(el: Element): boolean {
  return el.closest('[data-help-copy]') !== null;
}

/** A block's own text: its text and inline children, not the blocks inside it. */
function ownText(el: Element): string {
  let text = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? '';
    else if (node instanceof Element && !BLOCK_TAGS.has(node.tagName) && !isCopyText(node)) {
      text += node.textContent ?? '';
    }
  }
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Text of each block on its own. `textContent` would run a heading straight
 * into the next line ("Invite usersSign in"), hiding words at the join.
 */
function blocks(root: Element): string[] {
  return [root, ...root.querySelectorAll('*')]
    .filter((el) => (BLOCK_TAGS.has(el.tagName) || el === root) && !isCopyText(el))
    .map(ownText)
    .filter(Boolean);
}

/** What else a reader meets that isn't body text: alt text. */
function altTexts(root: Element): string[] {
  return [...root.querySelectorAll('img[alt]')].map((img) => img.getAttribute('alt') ?? '');
}

// A sentence ends at . ? or !, perhaps followed by a closing quote or bracket.
function sentences(block: string): string[] {
  return block.split(/(?<=[.?!][\u201D\u2019"')]?)\s+/);
}

/** Words for counting length: a lone dash or symbol isn't one. */
function countedWords(sentence: string): string[] {
  return words(sentence).filter((w) => /[\p{L}\p{N}]/u.test(w));
}

function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe.each(HELP_ARTICLES.map((a) => [a.slug, a] as const))(
  'help article %s',
  (_slug, article) => {
    const { Body, ui } = HELP_BODIES[article.slug];
    const uiNames = new Set(Object.values(ui));
    const allowedCaps = new Set([...PROPER_NOUNS, ...words(INSTANCE_NAME).map(bare)]);

    function renderBody(): HTMLElement {
      return render(<Body />).container;
    }

    it('avoids the words the style guide rules out', () => {
      const root = renderBody();
      const text = [article.title, article.summary, ...blocks(root), ...altTexts(root)].join('\n');
      const hits = BANNED.flatMap(([re, why]) => {
        const m = text.match(re);
        return m ? [`"${m[0]}": ${why}`] : [];
      });
      expect(hits, 'docs/writing-help.md#words').toEqual([]);
    });

    it(`keeps sentences to ${MAX_WORDS_PER_SENTENCE} words or fewer`, () => {
      const long = blocks(renderBody())
        .flatMap(sentences)
        .filter((s) => countedWords(s).length > MAX_WORDS_PER_SENTENCE);
      expect(long, 'split these sentences').toEqual([]);
    });

    it('uses sentence case for the title and headings', () => {
      const headings = [
        article.title,
        ...[...renderBody().querySelectorAll('h2, h3')].map((h) => h.textContent ?? ''),
      ];
      const offenders = headings.filter((h) => titleCaseWords(h, uiNames, allowedCaps).length > 0);
      expect(offenders, 'only the first word and names take a capital').toEqual([]);
    });

    it('starts the title with a verb, not a noun', () => {
      // Cheap proxy: a task title never starts with an article or "How".
      expect(article.title).not.toMatch(/^(a|an|the|how|about)\b/i);
    });

    it('writes no site address or email into the text or links', () => {
      const root = renderBody();
      const hrefs = [...root.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? '');
      const text = [...blocks(root), ...altTexts(root)].join('\n');
      expect(text, 'use INSTANCE_NAME from site-config').not.toMatch(
        /opensignup\.org|https?:\/\//i,
      );
      expect(
        hrefs.filter((h) => /^https?:\/\/|opensignup\.org/i.test(h)),
        'link to a path on this site, like /help/...',
      ).toEqual([]);
      // Must end on a letter or digit, so a sentence's full stop isn't taken as part of it.
      const emails = [
        ...(text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []),
        ...hrefs.filter((h) => h.startsWith('mailto:')).map((h) => h.slice('mailto:'.length)),
      ];
      expect(
        emails.filter((e) => e !== SUPPORT_EMAIL),
        'use SUPPORT_EMAIL from site-config',
      ).toEqual([]);
    });

    it("puts only this site's own address in text to copy", () => {
      const copied = [...renderBody().querySelectorAll('[data-help-copy]')].map(
        (el) => el.textContent ?? '',
      );
      // Once this site's own address is taken out, no other may be left.
      const foreign = copied.filter((text) =>
        /https?:\/\/|opensignup\.org/i.test(text.split(APP_ORIGIN).join('')),
      );
      expect(foreign, 'build addresses from APP_ORIGIN in site-config').toEqual([]);
    });

    it('bolds only on-screen names, and only ones the walkthrough knows', () => {
      const root = renderBody();
      const bare = [...root.querySelectorAll('strong, b')].filter(
        (el) => !el.hasAttribute('data-help-ui'),
      );
      expect(
        bare.map((el) => el.textContent),
        'wrap on-screen names in <Ui>',
      ).toEqual([]);
      const unknown = [...root.querySelectorAll('[data-help-ui]')]
        .map((el) => el.textContent ?? '')
        .filter((name) => !uiNames.has(name));
      expect(unknown, "add these to the article's UI list and its walkthrough").toEqual([]);
    });

    it('gives every screenshot a file, alt text and its real size', () => {
      const shots = [...renderBody().querySelectorAll('[data-help-shot]')];
      for (const fig of shots) {
        const src = fig.getAttribute('data-help-shot') ?? '';
        const img = fig.querySelector('img');
        const alt = img?.getAttribute('alt') ?? '';
        expect(alt.trim(), `${src} needs alt text`).not.toBe('');
        expect(alt, `${src}: say what it shows, not that it is a picture`).not.toMatch(
          /^(screenshot|image|picture)\b/i,
        );

        const file = path.join(process.cwd(), 'public', src);
        expect(existsSync(file), `${src} is missing: run pnpm help:screenshots`).toBe(true);
        // Captured at 2x for sharp text; the component's size is in CSS pixels.
        const { width, height } = pngSize(file);
        expect(
          {
            width: Number(img?.getAttribute('width')),
            height: Number(img?.getAttribute('height')),
          },
          `${src} is ${width}×${height}; set width and height to half that`,
        ).toEqual({ width: width / 2, height: height / 2 });
      }
    });
  },
);
