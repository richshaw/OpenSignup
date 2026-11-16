import { getTranslator, type Namespace, type Translator } from '../translator';

/**
 * The English translator for tests. Anything the translator would report (a
 * missing key, a message that can't be formatted) is thrown, so it fails the
 * test rather than rendering a key path.
 */
export function getTestTranslator<N extends Namespace>(namespace: N) {
  return getTranslator('en', namespace, {
    onError: (error) => {
      throw error;
    },
  });
}

/**
 * A translator that answers every key with where it was asked for, whatever
 * the catalogs hold: `t('full')` on `participant.signupView` in Swedish is
 * "participant.signupView.full in sv". `rich` and `markup` answer the same,
 * tags and all left out. For a test that text comes from the catalog, in the
 * namespace and language it should, including a language with no catalog
 * yet.
 */
export function getStandInTranslator<N extends Namespace>(
  locale: string,
  namespace: N,
): Translator<N> {
  const answer = (key: string) => `${namespace}.${key} in ${locale}`;
  return Object.assign(answer, { rich: answer, markup: answer }) as unknown as Translator<N>;
}

/**
 * What a component test mocks `getServerTranslator` from `@/i18n/server`
 * with: English from the catalog, as `getTestTranslator` gives it, and any
 * other language as `getStandInTranslator` answers, since only English has a
 * catalog yet. So a test on a Swedish page sees which text was asked for in
 * Swedish, and English text where the page keeps it.
 */
export function getTestServerTranslator<N extends Namespace>(locale: string, namespace: N) {
  return locale === 'en' ? getTestTranslator(namespace) : getStandInTranslator(locale, namespace);
}
