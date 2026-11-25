import { describe, expect, it } from 'vitest';
import { CATALOG_LOCALES } from '@/i18n/config';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { getTranslator } from '@/i18n/translator';
import {
  attachmentNamed,
  csvSeparator,
  responsesCsv,
  type ResponsesCsvInput,
} from './responses-csv';

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

/** The file as an organizer reading English gets it. */
const inEnglish = (input: ResponsesCsvInput) =>
  responsesCsv(input, getTestTranslator('organizer.responses'));

describe('responsesCsv', () => {
  it('writes one column per field, in field order, then the response columns', () => {
    expect(rows(inEnglish(base))).toEqual([
      'Date,What,Name,Email,Status,Spots,Notes,Signed up',
      '2026-11-14,Fruit and water,Pat,pat@example.com,confirmed,1,,2026-10-01T09:30:00.000Z',
    ]);
  });

  it('writes dates, times and numbers as their stored values, not display text', () => {
    const [, row] = rows(
      inEnglish({
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
      inEnglish({
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
      inEnglish({
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
      inEnglish({
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
      inEnglish({
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
    const csv = inEnglish({
      ...base,
      commitments: [{ ...commitment, participantName: 'Pat "P", Jr', notes: 'a\nb' }],
    });
    expect(csv).toContain(',"Pat ""P"", Jr",');
    expect(csv).toContain(',"a\nb",');
  });

  it('writes the header alone when nobody has signed up', () => {
    expect(rows(inEnglish({ ...base, commitments: [] }))).toEqual([
      'Date,What,Name,Email,Status,Spots,Notes,Signed up',
    ]);
  });
});

/** Every language with a catalog but English. */
const OTHER_LOCALES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

describe.each(OTHER_LOCALES)('responsesCsv for an organizer reading %s', (locale) => {
  const t = getStandInTranslator(locale, 'organizer.responses');
  const say = (key: string) => `organizer.responses.${key} in ${locale}`;

  it('names the response columns and each status in that language, and nothing else', () => {
    const commitment = base.commitments[0]!;
    const out = rows(
      responsesCsv(
        {
          ...base,
          commitments: [
            { ...commitment, id: 'com_a' },
            { ...commitment, id: 'com_b', status: 'cancelled' },
            { ...commitment, id: 'com_c', status: 'cancelled', notes: 'Bringing cups' },
          ],
          ended: new Map([['com_c', 'removed']]),
        },
        t,
      ),
    );
    expect(out).toEqual([
      [
        // The organizer's own labels, as written.
        'Date',
        'What',
        say('csv.name'),
        say('csv.email'),
        say('csv.status'),
        say('csv.spots'),
        say('csv.notes'),
        say('csv.signedUp'),
      ].join(','),
      // Values, names, counts and the signed-up time as stored.
      `2026-11-14,Fruit and water,Pat,pat@example.com,${say('status.confirmed')},1,,2026-10-01T09:30:00.000Z`,
      `2026-11-14,Fruit and water,Pat,pat@example.com,${say('status.cancelled')},1,,2026-10-01T09:30:00.000Z`,
      `2026-11-14,Fruit and water,Pat,pat@example.com,${say('status.removed')},1,Bringing cups,2026-10-01T09:30:00.000Z`,
    ]);
  });

  it('gives a field label that matches a column’s name in that language a header of its own', () => {
    const [header] = rows(
      responsesCsv(
        {
          ...base,
          fields: [
            { ref: 'who', label: say('csv.name'), fieldType: 'text' },
            // English's column name is just a label here.
            { ref: 'name', label: 'Name', fieldType: 'text' },
          ],
        },
        t,
      ),
    );
    expect(header?.split(',').slice(0, 3)).toEqual([
      `${say('csv.name')} (2)`,
      'Name',
      say('csv.name'),
    ]);
  });
});

describe('csvSeparator', () => {
  it('is a comma where decimals are written with a point', () => {
    expect(csvSeparator('en')).toBe(',');
  });

  it('is a semicolon where decimals are written with a comma, as Excel splits there', () => {
    expect(csvSeparator('sv')).toBe(';');
    expect(csvSeparator('de')).toBe(';');
  });
});

describe('responsesCsv with a semicolon separator', () => {
  const sv = getTranslator('sv', 'organizer.responses', {
    onError: (error) => {
      throw error;
    },
  });
  const inSwedish = (input: ResponsesCsvInput) => responsesCsv(input, sv, ';');

  it('splits cells on semicolons, keeps the BOM and the stored values', () => {
    expect(
      rows(
        inSwedish({
          ...base,
          fields: [...base.fields, { ref: 'qty', label: 'Qty', fieldType: 'number' }],
          slots: [{ id: 'slot_1', values: { date: '2026-11-14', what: 'Frukt', qty: 1.5 } }],
        }),
      ),
    ).toEqual([
      'Date;What;Qty;Namn;E-post;Status;Antal platser;Kommentar;Anmäld',
      `2026-11-14;Frukt;1.5;Pat;pat@example.com;${sv('status.confirmed')};1;;2026-10-01T09:30:00.000Z`,
    ]);
  });

  it('quotes semicolons, commas, quotes and line breaks', () => {
    const commitment = base.commitments[0]!;
    const csv = inSwedish({
      ...base,
      commitments: [
        { ...commitment, participantName: 'Pat; Sam', notes: 'Kaffe, te' },
        { ...commitment, id: 'com_2', participantName: 'Pat "P"', notes: 'a\nb' },
      ],
    });
    expect(csv).toContain(';"Pat; Sam";');
    expect(csv).toContain(';"Kaffe, te";');
    expect(csv).toContain(';"Pat ""P""";');
    expect(csv).toContain(';"a\nb";');
  });
});

describe('responsesCsv with the default separator', () => {
  it('leaves a semicolon in a cell unquoted, as before', () => {
    const commitment = base.commitments[0]!;
    const csv = inEnglish({ ...base, commitments: [{ ...commitment, notes: 'cups; plates' }] });
    expect(csv).toContain(',cups; plates,');
  });
});

describe('attachmentNamed', () => {
  it('names an ASCII file as before', () => {
    expect(attachmentNamed('snack-duty-responses.csv')).toBe(
      'attachment; filename="snack-duty-responses.csv"',
    );
  });

  it('gives a name with å, ä or ö in filename*, with a plain fallback beside it', () => {
    const name = getTranslator('sv', 'organizer.responses', {
      onError: (error) => {
        throw error;
      },
    })('csv.fileName', { slug: 'snack-duty' });
    expect(name).toBe('snack-duty-anmälningar.csv');
    expect(attachmentNamed(name)).toBe(
      `attachment; filename="snack-duty-anmalningar.csv"; filename*=UTF-8''snack-duty-anm%C3%A4lningar.csv`,
    );
  });

  it('keeps quotes out of the plain name and encodes what RFC 5987 refuses', () => {
    expect(attachmentNamed('a "b" (ü).csv')).toBe(
      `attachment; filename="a _b_ (u).csv"; filename*=UTF-8''a%20%22b%22%20%28%C3%BC%29.csv`,
    );
  });
});
