'use client';

import type { SelectHTMLAttributes } from 'react';
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
};

/**
 * The one way the app takes a time of day. A native select rather than
 * `<input type="time">`: on desktop that box is typed into segment by segment,
 * while a select opens a list and jumps to what's typed ("9" → 9:00 AM).
 * Phones keep their own picker. Times read on the 12-hour clock, as on the
 * public page; the value stays "HH:MM".
 */
export function TimeSelect({ value, onChange, after, note, ...rest }: TimeSelectProps) {
  return (
    <select {...rest} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No time</option>
      {timeOptions(value, after).map((t) => (
        <option key={t} value={t}>
          {formatSlotTime(t) ?? t}
          {note && (!after || t > after) ? ` (${note(t)})` : ''}
        </option>
      ))}
    </select>
  );
}
