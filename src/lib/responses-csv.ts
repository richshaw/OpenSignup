import type { Translator } from '@/i18n/translator';
import { commitmentStatusLabel } from '@/lib/commitment-status-label';
import { shownCommitmentStatus } from '@/services/commitments';
import type { LabelledField } from '@/lib/slot-label';

/**
 * The file an organizer downloads with the Responses tab's Download CSV: one
 * row per sign-up, one column per signup field headed by its label, then who
 * signed up and how it stands.
 *
 * OpenSignup's own words, the response columns' names and each status, are in
 * the translator's language: the organizer's. What the organizer and their
 * participants wrote stays as written: the field labels, the values, names
 * and notes. Field values go out as stored (dates `YYYY-MM-DD`, times `HH:MM`,
 * numbers as numbers), not as `renderFieldValue` shows them, so a spreadsheet
 * sorts the file by day or item. `slots.ref` and `slots.slot_at` stay out:
 * one is a key nobody typed, the other the reminder job's noon-UTC anchor for
 * a date-only slot, which a spreadsheet reads as a time.
 *
 * The one thing besides those words that follows the organizer's language is
 * the separator between cells (`csvSeparator`), because Excel doesn't read it
 * from the file: it splits on the list separator of the computer's regional
 * settings, which is `;` wherever the decimal mark is a comma. The values,
 * numbers included, stay as stored.
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

/** The columns after the fields', named in the translator's language. */
function responseColumns(t: Translator<'organizer.responses'>): string[] {
  return [
    t('csv.name'),
    t('csv.email'),
    t('csv.status'),
    t('csv.spots'),
    t('csv.notes'),
    t('csv.signedUp'),
  ];
}

// Excel on Windows reads a file without it as the local code page, and garbles
// accented names.
const UTF8_BOM = '﻿';

/**
 * The separator a spreadsheet in `locale` splits a CSV on: `;` where the
 * language writes decimals with a comma, as Excel's regional default does,
 * else `,`. Worked out from `Intl` rather than a table, so a new language
 * needs nothing here. No `sep=` line goes in the file instead: Excel then
 * ignores the BOM and garbles accented names, and other spreadsheets show it
 * as a row.
 */
export function csvSeparator(locale: string): CsvSeparator {
  const decimal = new Intl.NumberFormat(locale)
    .formatToParts(1.5)
    .find((part) => part.type === 'decimal')?.value;
  return decimal === ',' ? ';' : ',';
}

export type CsvSeparator = ',' | ';';

function csvEscape(value: unknown, separator: CsvSeparator): string {
  if (value === null || value === undefined) return '';
  // A number can't carry a formula, and quoting a negative one would turn it
  // into text.
  if (typeof value === 'number') return String(value);
  let s = String(value);
  // Defuse spreadsheet-formula injection: prefix any leading =, +, -, @, tab, or CR with a single quote.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  // A comma is quoted whatever the separator, so a program that guesses it
  // still reads a cell whole.
  if (/[",\n\r]/.test(s) || s.includes(separator)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Field labels can repeat, and can match a response column ("Name"), so a
 * repeat gets " (2)", " (3)"... The response columns keep their own names.
 */
function headers(fields: readonly LabelledField[], columns: readonly string[]): string[] {
  const taken = new Set(columns);
  const fieldHeaders = fields.map((f) => {
    let header = f.label;
    for (let n = 2; taken.has(header); n++) header = `${f.label} (${n})`;
    taken.add(header);
    return header;
  });
  return [...fieldHeaders, ...columns];
}

export function responsesCsv(
  { fields, slots, commitments, ended }: ResponsesCsvInput,
  t: Translator<'organizer.responses'>,
  separator: CsvSeparator = ',',
): string {
  const valuesBySlot = new Map(
    slots.map((s) => [s.id, (s.values as Record<string, unknown> | null) ?? {}]),
  );
  const lines: unknown[][] = [headers(fields, responseColumns(t))];
  for (const c of commitments) {
    const values = valuesBySlot.get(c.slotId) ?? {};
    lines.push([
      ...fields.map((f) => values[f.ref]),
      c.participantName,
      c.participantEmail,
      commitmentStatusLabel(shownCommitmentStatus(c, ended), t),
      c.quantity,
      c.notes,
      c.createdAt.toISOString(),
    ]);
  }
  return (
    UTF8_BOM +
    lines.map((cells) => cells.map((cell) => csvEscape(cell, separator)).join(separator)).join('\n')
  );
}

/**
 * A download named `fileName`. A name with letters outside ASCII (å, ä, ö)
 * goes in `filename*`, which browsers prefer, beside a plain `filename` with
 * those letters' accents dropped for clients that don't read it.
 */
export function attachmentNamed(fileName: string): string {
  const plain = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]|["\\]/g, '_');
  if (plain === fileName) return `attachment; filename="${fileName}"`;
  return `attachment; filename="${plain}"; filename*=UTF-8''${encodeRfc5987(fileName)}`;
}

/** `encodeURIComponent`, plus the four characters it leaves that RFC 5987 doesn't allow. */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
