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
import { INSTANCE_NAME, SUPPORT_EMAIL } from '@/lib/site-config';
import { HELP_ARTICLES } from './articles';
import { HELP_BODIES } from './bodies';

const BANNED: ReadonlyArray<readonly [RegExp, string]> = [
  [/\busers?\b/i, 'say "you" or "people who sign up"'],
  [/\bsimply\b/i, 'cut it: if it were simple, they would not be reading help'],
  [/\bjust\b/i, 'cut it'],
  [/\beas(y|ily|ier)\b/i, 'cut it: it is not easy for someone who is stuck'],
  [/\bclick(s|ed|ing)?\b/i, 'say "choose" (people use phones)'],
  [/\bplease note\b|\bnote that\b/i, 'cut it and say the thing'],
  [/\bslugs?\b|\btokens?\b|\bAPI\b|\bdatabase\b/i, 'leave out technical words'],
  [/\binstances?\b/i, 'say "your site"'],
  [/\bgo(es)? live\b|\blaunch(es)?\b/i, 'say "publish"'],
  [/\bcoming soon\b/i, 'describe what the product does now'],
  [/!/, 'no exclamation marks'],
  [/\p{Extended_Pictographic}/u, 'no emoji'],
];

const MAX_WORDS_PER_SENTENCE = 25;

// Capitalised words a sentence-case heading may still contain.
const PROPER_NOUNS = new Set(['OpenSignup', 'AI', 'Google', 'Claude', 'ChatGPT', 'I']);

function words(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

/** Words after the first that start with a capital and have no excuse to. */
function titleCaseWords(heading: string, allowed: ReadonlySet<string>): string[] {
  return words(heading)
    .slice(1)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => /^\p{Lu}/u.test(w) && !allowed.has(w));
}

/** Text of each paragraph-like block, so a heading doesn't run into the next sentence. */
function blocks(root: HTMLElement): string[] {
  return [...root.querySelectorAll('p, h2, h3, li, figcaption')]
    .filter((el) => el.tagName !== 'LI' || !el.querySelector('p'))
    .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function sentences(block: string): string[] {
  return block.split(/(?<=[.?])\s+/);
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
    const allowedCaps = new Set([
      ...PROPER_NOUNS,
      ...words(INSTANCE_NAME),
      ...[...uiNames].flatMap(words).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')),
    ]);

    function renderBody(): HTMLElement {
      return render(<Body />).container;
    }

    it('avoids the words the style guide rules out', () => {
      const text = [article.title, article.summary, renderBody().textContent ?? ''].join('\n');
      const hits = BANNED.flatMap(([re, why]) => {
        const m = text.match(re);
        return m ? [`"${m[0]}": ${why}`] : [];
      });
      expect(hits, 'docs/writing-help.md#words').toEqual([]);
    });

    it(`keeps sentences to ${MAX_WORDS_PER_SENTENCE} words or fewer`, () => {
      const long = blocks(renderBody())
        .flatMap(sentences)
        .filter((s) => words(s).length > MAX_WORDS_PER_SENTENCE);
      expect(long, 'split these sentences').toEqual([]);
    });

    it('uses sentence case for the title and headings', () => {
      const headings = [
        article.title,
        ...[...renderBody().querySelectorAll('h2, h3')].map((h) => h.textContent ?? ''),
      ];
      const offenders = headings.filter((h) => titleCaseWords(h, allowedCaps).length > 0);
      expect(offenders, 'only the first word and names take a capital').toEqual([]);
    });

    it('starts the title with a verb, not a noun', () => {
      // Cheap proxy: a task title never starts with an article or "How".
      expect(article.title).not.toMatch(/^(a|an|the|how|about)\b/i);
    });

    it('writes no site address or email into the text', () => {
      const text = renderBody().textContent ?? '';
      expect(text, 'use INSTANCE_NAME from site-config').not.toMatch(
        /opensignup\.org|https?:\/\//i,
      );
      const emails = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
      expect(
        emails.filter((e) => e !== SUPPORT_EMAIL),
        'use SUPPORT_EMAIL from site-config',
      ).toEqual([]);
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
