'use client';

import type { SelectHTMLAttributes } from 'react';
import type { CatalogLocale } from '@/i18n/config';
import { formatSlotTime } from '@/lib/slot-label';
import { timeOptions } from './timeOptions';

type TimeSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> & {
  /** "HH:MM", or '' for no time. */
  value: string;
  onChange: (value: string) => void;
  /** List only times after this one. */
  after?: string;
  /** Text after each listed time, in brackets, like its length from `after`. */
  note?: (time: string) => string;
  /** The choice for no time, in the reader's language. */
  noTimeLabel: string;
  /**
   * The language the times are written in, as `formatSlotTime` writes a
   * slot's: the signup's on the Build tab, the organizer's in Magic Compose.
   */
  locale: CatalogLocale;
};

/**
 * The one way the app takes a time of day. A native select rather than
 * `<input type="time">`: on desktop that box is typed into segment by segment,
 * while a select opens a list and jumps to what's typed ("9" → 9:00 AM).
 * Phones keep their own picker. Times read as on the public page, on the
 * 12-hour clock in English; the value stays "HH:MM".
 */
export function TimeSelect({
  value,
  onChange,
  after,
  note,
  noTimeLabel,
  locale,
  ...rest
}: TimeSelectProps) {
  return (
    <select {...rest} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{noTimeLabel}</option>
      {timeOptions(value, after).map((t) => (
        <option key={t} value={t}>
          {formatSlotTime(t, locale) ?? t}
          {note && (!after || t > after) ? ` (${note(t)})` : ''}
        </option>
      ))}
    </select>
  );
}
