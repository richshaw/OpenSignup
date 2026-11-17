import { type CatalogLocale, SHIPPED, languageName } from '@/i18n/config';

/**
 * The radios that pick a language, one per language shipped to participants,
 * for Account Settings and a signup's Settings tab. Each language is named in
 * itself (English, Svenska), so an organizer finds theirs whatever language
 * the rest of the page is in. The page around it keeps its own fieldset,
 * legend and help text, and passes the help's id as `describedBy`.
 */
export function LanguageRadios({
  current,
  describedBy,
}: {
  /** The language shown as chosen. */
  current: CatalogLocale;
  /** The id of the help text each radio is described by. */
  describedBy: string;
}) {
  const languages: readonly CatalogLocale[] = SHIPPED.participant;
  return (
    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
      {languages.map((locale) => (
        <label key={locale} className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            name="locale"
            value={locale}
            defaultChecked={locale === current}
            aria-describedby={describedBy}
            className="h-4 w-4 accent-brand"
          />
          <span lang={locale}>{languageName(locale)}</span>
        </label>
      ))}
    </div>
  );
}
