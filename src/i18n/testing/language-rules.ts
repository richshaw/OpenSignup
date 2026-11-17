/**
 * Each language's own rules for the catalog check (./catalog-check.ts), kept
 * short: rules a machine can apply, not taste. Wording stays with the review
 * in context (docs/translating.md, "How translations are made and checked").
 *
 * The glossary in docs/translating.md points here, so changing a banned word
 * means changing its glossary line too, and the other way round.
 */
export type LanguageRules = {
  /**
   * Messages whose translation rightly reads exactly as the English does, by
   * full key, each with why. Every other translation identical to its English
   * fails, unless it has no letters outside its placeholders and tags.
   */
  sameAsEnglish: Readonly<Record<string, string>>;
  /** Words the glossary rules out. */
  banned: readonly BannedWord[];
};

type BannedWord = {
  /** Matched against each run of the message's own text, never a placeholder's or tag's name. */
  pattern: RegExp;
  /** The namespaces it applies to; every namespace when left out. */
  namespaces?: readonly string[];
  /** The glossary line it enforces, as docs/translating.md heads it. */
  glossary: string;
  /** Why, as the failure line says it. */
  reason: string;
};

/** A whole word, wherever letters can't be on either side of it (`\b` knows only a–z). */
const word = (text: string) => new RegExp(`(?<!\\p{L})${text}(?!\\p{L})`, 'iu');

export const LANGUAGE_RULES: Readonly<Record<string, LanguageRules>> = {
  sv: {
    sameAsEnglish: {
      'common.footer.license': 'the site’s name and the licence’s, which stay as they are',
      'common.footer.cookies': 'Swedish uses the English word',
      'organizer.responses.table.status': 'Swedish uses the English word',
      'organizer.responses.csv.status': 'Swedish uses the English word',
      'organizer.chrome.home': 'the product’s name, which stays as it is',
    },
    banned: [
      {
        pattern: word('ni'),
        glossary: 'Style: Tone',
        reason: 'du, never ni',
      },
      {
        pattern: word('din plats'),
        namespaces: ['participant', 'email'],
        glossary: 'Terms: your spot, your sign-up; Settled in the first full review, 1',
        reason: 'a participant’s own sign-up is din anmälan, never din plats',
      },
      {
        pattern: /\.\.\./,
        glossary: 'Style: Punctuation',
        reason: 'an ellipsis is one character, …',
      },
    ],
  },
};
