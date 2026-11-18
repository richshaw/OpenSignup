import { labelInSentence, type CatalogLocale } from '@/i18n/config';
import type { Translator } from '@/i18n/translator';
import { renderFieldValue } from '@/lib/slot-label';
import type { FieldType } from '@/schemas/slot-fields';

/**
 * Prettify a group key for display in a WysiwygGroup header.
 * - ISO dates (YYYY-MM-DD) -> "Thu, May 21", as the public page prints them
 *   (the header's CSS uppercases it).
 * - Times (HH:MM) -> "6:30 PM", the 12-hour clock the public page uses.
 * - Empty / no-value sentinel -> type/label-aware prompt (see emptyHeaderCopy),
 *   in `t`'s language, the organizer's.
 * - Anything else -> pass through.
 *
 * The rule is `renderFieldValue`'s, the one every other surface reads a value
 * with, so a heading and the rows under it cannot disagree about a date.
 */
export function prettyHeader(
  t: Translator<'organizer.build'>,
  rawKey: string | null | undefined,
  fieldType: FieldType,
  locale: CatalogLocale,
  fieldLabel?: string,
): string {
  if (!rawKey) {
    return emptyHeaderCopy(t, fieldType, locale, fieldLabel);
  }
  return (
    renderFieldValue({ ref: '', label: fieldLabel ?? '', fieldType }, rawKey, locale) ?? rawKey
  );
}

/**
 * Action-prompt copy for an empty-bucket group header.
 * date/time get a fixed phrase; other types derive from the field label when
 * provided so an "Item" field reads "Set item" rather than the bland fallback.
 * The label goes in as `labelInSentence` writes it in `locale`, the signup's
 * language, which the organizer wrote it in: "Set role", "Set Rolle".
 */
export function emptyHeaderCopy(
  t: Translator<'organizer.build'>,
  fieldType: FieldType,
  locale: CatalogLocale,
  fieldLabel?: string,
): string {
  if (fieldType === 'date') return t('empty.date');
  if (fieldType === 'time') return t('empty.time');
  const trimmed = fieldLabel?.trim();
  return trimmed ? t('empty.named', { label: labelInSentence(trimmed, locale) }) : t('empty.other');
}
