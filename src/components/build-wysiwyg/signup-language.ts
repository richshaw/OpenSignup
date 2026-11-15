import { createContext, useContext } from 'react';
import { useLocale } from 'next-intl';
import { langWhereDifferent, type CatalogLocale } from '@/i18n/config';

/**
 * The signup's language, which `BuildWysiwyg` gives everything under it, the
 * Fields dialog's portal included. Without it, as when a test renders one
 * part on its own, the signup's words are taken to be in the page's language.
 */
export const SignupLanguage = createContext<CatalogLocale | null>(null);

/**
 * The signup's language on the Build tab: `locale`, which its dates and times
 * are formatted in, as its participants read them, and `lang`, the mark its
 * own words carry (its title and description, field names, values and list
 * items), set only where it isn't the organizer's, which the tab's own words
 * are in (`ClientMessages`). Both render on the server first, then in the
 * browser, so the two must format alike: build-tab-language.spec.ts checks
 * each language hydrates with no mismatch.
 */
export function useSignupLanguage(): { locale: CatalogLocale; lang: CatalogLocale | undefined } {
  const around = useLocale();
  const locale = useContext(SignupLanguage) ?? around;
  return { locale, lang: langWhereDifferent(locale, around) };
}
