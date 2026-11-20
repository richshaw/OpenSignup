import { describe, it, expect } from 'vitest';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { prettyHeader, emptyHeaderCopy } from './prettyHeader';

/** The Build tab's messages in English, from the catalog. */
const t = getTestTranslator('organizer.build');

describe('prettyHeader', () => {
  it('formats an ISO date as the public page does (the CSS uppercases it)', () => {
    expect(prettyHeader(t, '2026-05-21', 'date', 'en')).toBe('Thu, May 21');
  });

  // The language is a `CatalogLocale`, so typecheck refuses a call written
  // before it took one, with the field's label in its place.
  it('takes a language after the field type, never a label', () => {
    // @ts-expect-error: 'Date' is a label, not a language with a catalog.
    const oldStyle = () => prettyHeader(t, '2026-05-21', 'date', 'Date');
    expect(oldStyle).toBeTypeOf('function');
  });

  it('returns "Set a date" when value is empty and field is date', () => {
    expect(prettyHeader(t, '', 'date', 'en')).toBe('Set a date');
    expect(prettyHeader(t, null, 'date', 'en')).toBe('Set a date');
    expect(prettyHeader(t, undefined, 'date', 'en')).toBe('Set a date');
  });

  it('returns "Set a time" when value is empty and field is time', () => {
    expect(prettyHeader(t, '', 'time', 'en')).toBe('Set a time');
  });

  it('derives empty-header copy from the field label when provided', () => {
    expect(prettyHeader(t, '', 'text', 'en', 'What')).toBe('Set what');
    expect(prettyHeader(t, null, 'text', 'en', 'Item')).toBe('Set item');
    expect(prettyHeader(t, '', 'enum', 'en', 'Course')).toBe('Set course');
    expect(prettyHeader(t, '', 'number', 'en', 'Quantity')).toBe('Set quantity');
  });

  it('falls back to "Set a value" when value is empty and no label is supplied', () => {
    expect(prettyHeader(t, '', 'enum', 'en')).toBe('Set a value');
    expect(prettyHeader(t, null, 'text', 'en')).toBe('Set a value');
    expect(prettyHeader(t, '', 'text', 'en', '   ')).toBe('Set a value');
  });

  it('passes through non-date field values unchanged', () => {
    expect(prettyHeader(t, 'Main course', 'enum', 'en')).toBe('Main course');
    expect(prettyHeader(t, 'Auditorium', 'text', 'en')).toBe('Auditorium');
  });

  it('formats an HH:MM time on a 12-hour clock', () => {
    expect(prettyHeader(t, '18:30', 'time', 'en')).toBe('6:30\u00a0PM');
    expect(prettyHeader(t, '00:00', 'time', 'en')).toBe('12:00\u00a0AM');
  });

  it('reads a date or time in the language it is given', () => {
    expect(prettyHeader(t, '2025-05-03', 'date', 'sv')).toBe('lör 3 maj');
    expect(prettyHeader(t, '18:30', 'time', 'sv')).toBe('18:30');
  });

  it('passes through unparseable time values unchanged', () => {
    expect(prettyHeader(t, 'after the game', 'time', 'en')).toBe('after the game');
  });

  it('passes through non-ISO date strings unchanged', () => {
    expect(prettyHeader(t, '05/21/2026', 'date', 'en')).toBe('05/21/2026');
    expect(prettyHeader(t, 'next Tuesday', 'date', 'en')).toBe('next Tuesday');
  });

  it('passes through ISO-shaped but invalid dates unchanged (no silent normalization)', () => {
    // Feb 31 would otherwise roll forward into March.
    expect(prettyHeader(t, '2026-02-31', 'date', 'en')).toBe('2026-02-31');
    // Month 13.
    expect(prettyHeader(t, '2026-13-01', 'date', 'en')).toBe('2026-13-01');
  });

  it('passes through a typed date that is not in the stored shape', () => {
    // `new Date()` would read this as Nov 14, 2001, a Wednesday.
    expect(prettyHeader(t, 'Sat, Nov 14', 'date', 'en')).toBe('Sat, Nov 14');
  });
});

describe('emptyHeaderCopy', () => {
  it('returns fixed copy for date and time regardless of label', () => {
    expect(emptyHeaderCopy(t, 'date', 'en', 'Ignored')).toBe('Set a date');
    expect(emptyHeaderCopy(t, 'time', 'en', 'Ignored')).toBe('Set a time');
  });

  it('derives from label for text/number/enum', () => {
    expect(emptyHeaderCopy(t, 'text', 'en', 'What')).toBe('Set what');
    expect(emptyHeaderCopy(t, 'number', 'en', 'Quantity')).toBe('Set quantity');
    expect(emptyHeaderCopy(t, 'enum', 'en', 'Course')).toBe('Set course');
  });

  it('keeps the label’s capital when the signup is in a language that capitalizes nouns', () => {
    expect(emptyHeaderCopy(t, 'text', 'de', 'Rolle')).toBe('Set Rolle');
  });

  it('falls back to "Set a value" when no label is supplied', () => {
    expect(emptyHeaderCopy(t, 'text', 'en')).toBe('Set a value');
    expect(emptyHeaderCopy(t, 'number', 'en', '')).toBe('Set a value');
  });
});

describe('empty-header copy in the organizer’s language', () => {
  const swedish = getStandInTranslator('sv', 'organizer.build');

  it('takes each prompt from the catalog, whatever language the dates are in', () => {
    expect(emptyHeaderCopy(swedish, 'date', 'en', 'Ignored')).toBe(
      'organizer.build.empty.date in sv',
    );
    expect(emptyHeaderCopy(swedish, 'time', 'en')).toBe('organizer.build.empty.time in sv');
    expect(emptyHeaderCopy(swedish, 'text', 'en', 'What')).toBe(
      'organizer.build.empty.named in sv',
    );
    expect(emptyHeaderCopy(swedish, 'text', 'en')).toBe('organizer.build.empty.other in sv');
    expect(prettyHeader(swedish, '', 'date', 'en')).toBe('organizer.build.empty.date in sv');
  });

  it('formats a value in the language it is given, not the organizer’s', () => {
    expect(prettyHeader(swedish, '2026-05-21', 'date', 'en')).toBe('Thu, May 21');
  });
});
