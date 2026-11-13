import { getTranslator, type Namespace } from '../translator';

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
