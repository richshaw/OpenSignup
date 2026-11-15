import type { Translator } from '@/i18n/translator';
import type { DraftWarning } from '@/lib/magic-compose/draft-warnings';

/** The message in `organizer.aiDraft.warnings` for each code, by its arguments. */
export function warningText(
  warning: DraftWarning,
  t: Translator<'organizer.aiDraft.warnings'>,
  locale: string,
): string {
  switch (warning.code) {
    case 'values_blanked':
      return t('valuesBlanked', { count: warning.count });
    case 'enum_fields_to_text':
      return t('enumFieldsToText', {
        count: warning.fields.length,
        // A list without "and", as the fields have always been named: "a, b" in English.
        fields: new Intl.ListFormat(locale, { type: 'unit', style: 'short' }).format(
          warning.fields,
        ),
      });
    case 'duplicate_fields':
      return t('duplicateFields', { count: warning.count });
    case 'stray_values':
      return t('strayValues', { count: warning.count });
    case 'text_cut':
      return warning.field === 'title'
        ? t('titleCut', { max: warning.max })
        : t('descriptionCut', { max: warning.max });
  }
}
