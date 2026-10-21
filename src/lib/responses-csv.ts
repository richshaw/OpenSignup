import type { LabelledField } from '@/lib/slot-label';

/**
 * The file an organizer downloads with Export: one row per sign-up, one column
 * per signup field headed by its label, then who signed up and how it stands.
 *
 * Field values go out as stored (dates `YYYY-MM-DD`, times `HH:MM`, numbers as
 * numbers), not as `renderFieldValue` shows them, so a spreadsheet sorts the
 * file by day or item. `slots.ref` and `slots.slot_at` stay out: one is a key
 * nobody typed, the other the reminder job's noon-UTC anchor for a date-only
 * slot, which a spreadsheet reads as a time.
 */

export interface ResponsesCsvInput {
  fields: readonly LabelledField[];
  slots: readonly { id: string; values: unknown }[];
  commitments: readonly {
    id: string;
    slotId: string;
    participantName: string;
    participantEmail: string | null;
    status: string;
    quantity: number;
    notes: string | null;
    createdAt: Date;
  }[];
  /** `howCommitmentsEnded`: which cancelled ones an organizer removed or moved. */
  ended: ReadonlyMap<string, 'removed' | 'moved'>;
}

const RESPONSE_COLUMNS = ['Name', 'Email', 'Status', 'Spots', 'Notes', 'Signed up'];

// Excel on Windows reads a file without it as the local code page, and garbles
// accented names.
const UTF8_BOM = '﻿';

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  // A number can't carry a formula, and quoting a negative one would turn it
  // into text.
  if (typeof value === 'number') return String(value);
  let s = String(value);
  // Defuse spreadsheet-formula injection: prefix any leading =, +, -, @, tab, or CR with a single quote.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Field labels can repeat, and can match a response column ("Name"), so a
 * repeat gets " (2)", " (3)"... The response columns keep their own names.
 */
function headers(fields: readonly LabelledField[]): string[] {
  const taken = new Set(RESPONSE_COLUMNS);
  const fieldHeaders = fields.map((f) => {
    let header = f.label;
    for (let n = 2; taken.has(header); n++) header = `${f.label} (${n})`;
    taken.add(header);
    return header;
  });
  return [...fieldHeaders, ...RESPONSE_COLUMNS];
}

export function responsesCsv({ fields, slots, commitments, ended }: ResponsesCsvInput): string {
  const valuesBySlot = new Map(
    slots.map((s) => [s.id, (s.values as Record<string, unknown> | null) ?? {}]),
  );
  const lines: unknown[][] = [headers(fields)];
  for (const c of commitments) {
    const values = valuesBySlot.get(c.slotId) ?? {};
    lines.push([
      ...fields.map((f) => values[f.ref]),
      c.participantName,
      c.participantEmail,
      // As the Responses tab says it: "cancelled" is the participant's own.
      c.status === 'cancelled' ? (ended.get(c.id) ?? c.status) : c.status,
      c.quantity,
      c.notes,
      c.createdAt.toISOString(),
    ]);
  }
  return UTF8_BOM + lines.map((cells) => cells.map(csvEscape).join(',')).join('\n');
}
