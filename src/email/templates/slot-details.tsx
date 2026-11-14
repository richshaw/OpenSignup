import { Fragment } from 'react';
import { Text } from '@react-email/components';
import type { CatalogLocale } from '@/i18n/config';
import { getServerTranslator } from '@/i18n/server';
import type { SlotDetail } from '@/lib/slot-label';
import { strong } from './layout';

export interface SlotDetailsTextProps {
  /** The email's language, for the "Spots" line and each line's punctuation. */
  locale: CatalogLocale;
  /** Every field value for the slot, from `slotDetails()`. */
  details: readonly SlotDetail[];
  /** Rendered as one more line when the participant took more than one spot. */
  spots?: number | undefined;
}

/**
 * The block of `Label: value` lines describing a slot. Shared by the
 * confirmation and the reminder so both name a slot identically — the two
 * templates used to each hand-roll a "What:"/"When:" pair, in opposite orders.
 * The labels are the organizer's own and the values come formatted in the
 * email's language (`slotDetails()`); the catalog gives the line around them
 * and the "Spots" label.
 *
 * Renders nothing at all when there is nothing to say, rather than an empty
 * bordered paragraph.
 */
export function SlotDetailsText({ locale, details, spots }: SlotDetailsTextProps) {
  const t = getServerTranslator(locale, 'email.slotDetails');
  const lines: SlotDetail[] = [
    ...details,
    ...(spots !== undefined && spots > 1 ? [{ label: t('spots'), value: String(spots) }] : []),
  ];
  if (lines.length === 0) return null;
  return (
    <Text className="mt-4 text-[#0b1220]">
      {lines.map((line, i) => (
        <Fragment key={`${line.label}-${i}`}>
          {i > 0 ? <br /> : null}
          {t.rich('line', { label: line.label, value: line.value, b: strong })}
        </Fragment>
      ))}
    </Text>
  );
}
