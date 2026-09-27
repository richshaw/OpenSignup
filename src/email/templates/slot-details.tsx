import { Fragment } from 'react';
import { Text } from '@react-email/components';
import type { SlotDetail } from '@/lib/slot-label';

export interface SlotDetailsTextProps {
  /** Every field value for the slot, from `slotDetails()`. */
  details: readonly SlotDetail[];
  /** Rendered as one more line when the participant took more than one spot. */
  spots?: number | undefined;
}

/**
 * The block of `Label: value` lines describing a slot. Shared by the
 * confirmation and the reminder so both name a slot identically — the two
 * templates used to each hand-roll a "What:"/"When:" pair, in opposite orders.
 *
 * Renders nothing at all when there is nothing to say, rather than an empty
 * bordered paragraph.
 */
export function SlotDetailsText({ details, spots }: SlotDetailsTextProps) {
  const lines: SlotDetail[] = [
    ...details,
    ...(spots !== undefined && spots > 1 ? [{ label: 'Spots', value: String(spots) }] : []),
  ];
  if (lines.length === 0) return null;
  return (
    <Text className="mt-4 text-[#0b1220]">
      {lines.map((line, i) => (
        <Fragment key={`${line.label}-${i}`}>
          {i > 0 ? <br /> : null}
          <strong>{line.label}:</strong> {line.value}
        </Fragment>
      ))}
    </Text>
  );
}
