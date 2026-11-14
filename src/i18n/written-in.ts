/**
 * Whether an organizer's signups look written in a language, from their
 * titles: the guess behind the notice on Your signups that offers a language
 * to an organizer who hasn't chosen one (#640).
 *
 * Pure: it reads only the titles it's given, which `listSignupSummariesForWorkspace`
 * already loads for that page, so the guess adds no query. Server code only:
 * like everything in src/i18n/ but config.ts, no client file may import it
 * (`opensignup/no-catalogs-in-client`), and the page decides and passes a flag
 * down. It shows no text, so it has no catalog keys.
 */
import type { CatalogLocale } from './config';

/** What a language's writing looks like to the guess. */
interface WritingMarkers {
  /**
   * Letters the language writes and English doesn't. A word spelled with one
   * is weak evidence: names have them, and so do the neighbouring languages.
   */
  readonly letters: string;
  /**
   * Every letter the language spells its own words with. A word with any
   * other letter (æ or ø from Danish and Norwegian, ü or ß from German) isn't
   * in the language, so the title it's in is never weak evidence.
   */
  readonly alphabet: string;
  /**
   * Common words that are the language's own: not English words, and not
   * spelled the same in the languages around it. One in a title is strong
   * evidence. Each entry is a group of words separated by spaces.
   */
  readonly words: readonly string[];
}

/**
 * The languages the guess can look for. The next one adds an entry here and
 * no code. English has none: it's what a signup without a language already
 * gets, so nothing ever needs to offer it.
 */
const WRITING: Partial<Record<CatalogLocale, WritingMarkers>> = {
  sv: {
    letters: 'åäö',
    alphabet: 'abcdefghijklmnopqrstuvwxyzåäöé',
    words: [
      // Small words: and, to, not, for, is, from, also, when, here, there,
      // even, two, our, over, ahead of, between, who, what.
      'och att inte för är från också när här där även två våra över inför mellan vem vad',
      // Days and times signups name. Onsdag, torsdag and fredag are Danish
      // and Norwegian too.
      'måndag tisdag lördag söndag vecka veckan kväll augusti sommar',
      // What signups are for: sign-up, a lift, the school, cakes.
      'anmälan skjuts skolan kakor',
      // Left out on purpose: på, med, av, som, det, vi, om, hos and ett, which
      // Danish or Norwegian write the same; till, which is English too ("open
      // till noon") and a German first name; fika, which English has borrowed
      // ("Fika Friday").
    ],
  },
};

interface CompiledMarkers {
  letters: ReadonlySet<string>;
  alphabet: ReadonlySet<string>;
  words: ReadonlySet<string>;
}

/** Each language's markers as sets, in the same form `wordsOf` gives words. */
const COMPILED = new Map<CatalogLocale, CompiledMarkers>(
  Object.entries(WRITING).map(([locale, markers]) => {
    const lower = (text: string) => text.normalize('NFC').toLocaleLowerCase(locale);
    return [
      locale as CatalogLocale,
      {
        letters: new Set(lower(markers.letters)),
        alphabet: new Set(lower(markers.alphabet + markers.letters)),
        words: new Set(markers.words.flatMap((group) => lower(group).trim().split(/\s+/))),
      },
    ];
  }),
);

/** A run of letters, with any combining marks inside it. */
const WORD = /[\p{L}\p{M}]+/gu;

/**
 * The title's words, in lower case by the language's rules, leaving out
 * one-letter words: Swedish "i" (in), "å" and "ö" look like English "a" and
 * "I" to a guess, so none of them counts either way. Digits, punctuation and
 * emoji split words and count for nothing, and an apostrophe splits one too
 * ("Åsa's" is "åsa" and "s").
 */
function wordsOf(title: string, locale: CatalogLocale): string[] {
  const words = title.normalize('NFC').toLocaleLowerCase(locale).match(WORD) ?? [];
  return words.filter((word) => [...word].length > 1);
}

/**
 * What one title says. `strong`: it has one of the language's words.
 * `weak`: every word in it is spelled with the language's letters and no
 * others ("Städdag", "Föräldramöte"), which a title of only names
 * ("Malmö") or a word from a neighbouring language ("Kesäjuhla") also is.
 * `none`: anything else, which is what a title with an English word in it
 * ("Carpool to Malmö") is. `empty`: no words, so it says nothing and isn't
 * counted at all.
 */
function titleEvidence(
  title: string,
  locale: CatalogLocale,
  markers: CompiledMarkers,
): 'strong' | 'weak' | 'none' | 'empty' {
  const words = wordsOf(title, locale);
  if (words.length === 0) return 'empty';
  if (words.some((word) => markers.words.has(word))) return 'strong';
  const spelledInLanguage = (word: string) => {
    const letters = [...word];
    return (
      letters.some((letter) => markers.letters.has(letter)) &&
      letters.every((letter) => markers.alphabet.has(letter))
    );
  };
  return words.every(spelledInLanguage) ? 'weak' : 'none';
}

/**
 * Whether `signups` look written in `locale`, judged by their titles: yes when
 * any title has one of the language's own words, or when at least half the
 * titles with words in them are weak evidence (`titleEvidence`). So one
 * plainly Swedish title is enough; titles spelled only with Swedish letters,
 * as a Swedish compound ("Föräldramöte") and a lone name ("Malmö") both are,
 * count only when they make up at least half the list; and an English title
 * with a Swedish name in it counts for nothing. A language with no entry
 * in `WRITING` (English among them) never looks written in, and neither does
 * an empty list.
 *
 * Leans towards yes, because a wrong yes costs the organizer one click on the
 * notice it shows, while a wrong no leaves them not knowing the language is
 * there. Takes what the Your signups page already holds
 * (`listSignupSummariesForWorkspace`'s rows), not a database handle.
 */
export function signupsLookWrittenIn(
  locale: CatalogLocale,
  signups: readonly { readonly title: string }[],
): boolean {
  const markers = COMPILED.get(locale);
  if (!markers) return false;
  let withWords = 0;
  let weak = 0;
  for (const { title } of signups) {
    const evidence = titleEvidence(title, locale, markers);
    if (evidence === 'strong') return true;
    if (evidence === 'empty') continue;
    withWords += 1;
    if (evidence === 'weak') weak += 1;
  }
  return weak > 0 && weak * 2 >= withWords;
}
