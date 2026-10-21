import { describe, expect, it } from 'vitest';
import { responsesCsv, type ResponsesCsvInput } from './responses-csv';

const BOM = '﻿';

function rows(csv: string): string[] {
  expect(csv.startsWith(BOM)).toBe(true);
  return csv.slice(BOM.length).split('\n');
}

const base: ResponsesCsvInput = {
  fields: [
    { ref: 'date', label: 'Date', fieldType: 'date' },
    { ref: 'what', label: 'What', fieldType: 'text' },
  ],
  slots: [{ id: 'slot_1', values: { date: '2026-11-14', what: 'Fruit and water' } }],
  commitments: [
    {
      id: 'com_1',
      slotId: 'slot_1',
      participantName: 'Pat',
      participantEmail: 'pat@example.com',
      status: 'confirmed',
      quantity: 1,
      notes: null,
      createdAt: new Date('2026-10-01T09:30:00.000Z'),
    },
  ],
  ended: new Map(),
};

describe('responsesCsv', () => {
  it('writes one column per field, in field order, then the response columns', () => {
    expect(rows(responsesCsv(base))).toEqual([
      'Date,What,Name,Email,Status,Spots,Notes,Signed up',
      '2026-11-14,Fruit and water,Pat,pat@example.com,confirmed,1,,2026-10-01T09:30:00.000Z',
    ]);
  });

  it('writes dates, times and numbers as their stored values, not display text', () => {
    const [, row] = rows(
      responsesCsv({
        ...base,
        fields: [
          { ref: 'day', label: 'Day', fieldType: 'date' },
          { ref: 'at', label: 'At', fieldType: 'time' },
          { ref: 'qty', label: 'Qty', fieldType: 'number' },
          { ref: 'size', label: 'Size', fieldType: 'enum' },
        ],
        slots: [{ id: 'slot_1', values: { day: '2026-11-14', at: '18:30', qty: -2, size: 'L' } }],
      }),
    );
    expect(row?.startsWith('2026-11-14,18:30,-2,L,')).toBe(true);
  });

  it('leaves out values of fields that were deleted, and blanks missing ones', () => {
    const [header, row] = rows(
      responsesCsv({
        ...base,
        slots: [{ id: 'slot_1', values: { what: 'Juice', gone: 'old value' } }],
      }),
    );
    expect(header).toBe('Date,What,Name,Email,Status,Spots,Notes,Signed up');
    expect(row).not.toContain('old value');
    expect(row?.startsWith(',Juice,Pat,')).toBe(true);
  });

  it('says removed or moved where the Responses tab does, and keeps a participant cancel', () => {
    const commitment = base.commitments[0]!;
    const out = rows(
      responsesCsv({
        ...base,
        commitments: [
          { ...commitment, id: 'com_a', status: 'cancelled' },
          { ...commitment, id: 'com_b', status: 'cancelled' },
          { ...commitment, id: 'com_c', status: 'cancelled' },
        ],
        ended: new Map([
          ['com_a', 'removed'],
          ['com_b', 'moved'],
        ]),
      }),
    );
    expect(out.slice(1).map((line) => line.split(',')[4])).toEqual([
      'removed',
      'moved',
      'cancelled',
    ]);
  });

  it('gives repeated labels distinct headers, the fixed columns included', () => {
    const [header] = rows(
      responsesCsv({
        ...base,
        fields: [
          { ref: 'start', label: 'Time', fieldType: 'time' },
          { ref: 'end', label: 'Time', fieldType: 'time' },
          { ref: 'who', label: 'Name', fieldType: 'text' },
        ],
      }),
    );
    expect(header).toBe('Time,Time (2),Name (2),Name,Email,Status,Spots,Notes,Signed up');
  });

  it('defuses formulas in headers and text, but leaves negative numbers as numbers', () => {
    const [header, row] = rows(
      responsesCsv({
        ...base,
        fields: [
          { ref: 'sum', label: '=SUM(A1)', fieldType: 'text' },
          { ref: 'n', label: 'N', fieldType: 'number' },
        ],
        slots: [{ id: 'slot_1', values: { sum: '-1+1', n: -3 } }],
      }),
    );
    expect(header?.startsWith("'=SUM(A1),N,")).toBe(true);
    expect(row?.startsWith("'-1+1,-3,")).toBe(true);
  });

  it('quotes commas, quotes and line breaks', () => {
    const commitment = base.commitments[0]!;
    const csv = responsesCsv({
      ...base,
      commitments: [{ ...commitment, participantName: 'Pat "P", Jr', notes: 'a\nb' }],
    });
    expect(csv).toContain(',"Pat ""P"", Jr",');
    expect(csv).toContain(',"a\nb",');
  });

  it('writes the header alone when nobody has signed up', () => {
    expect(rows(responsesCsv({ ...base, commitments: [] }))).toEqual([
      'Date,What,Name,Email,Status,Spots,Notes,Signed up',
    ]);
  });
});
