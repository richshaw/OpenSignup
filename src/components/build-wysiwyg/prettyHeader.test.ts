import { describe, it, expect } from 'vitest';
import { prettyHeader, emptyHeaderCopy } from './prettyHeader';

describe('prettyHeader', () => {
  it('formats an ISO date into uppercase weekday + month + day', () => {
    expect(prettyHeader('2026-05-21', 'date')).toBe('THU, MAY 21');
  });

  it('returns "Set a date" when value is empty and field is date', () => {
    expect(prettyHeader('', 'date')).toBe('Set a date');
    expect(prettyHeader(null, 'date')).toBe('Set a date');
    expect(prettyHeader(undefined, 'date')).toBe('Set a date');
  });

  it('returns "Set a time" when value is empty and field is time', () => {
    expect(prettyHeader('', 'time')).toBe('Set a time');
  });

  it('derives empty-header copy from the field label when provided', () => {
    expect(prettyHeader('', 'text', 'What')).toBe('Set what');
    expect(prettyHeader(null, 'text', 'Item')).toBe('Set item');
    expect(prettyHeader('', 'enum', 'Course')).toBe('Set course');
    expect(prettyHeader('', 'number', 'Quantity')).toBe('Set quantity');
  });

  it('falls back to "Set a value" when value is empty and no label is supplied', () => {
    expect(prettyHeader('', 'enum')).toBe('Set a value');
    expect(prettyHeader(null, 'text')).toBe('Set a value');
    expect(prettyHeader('', 'text', '   ')).toBe('Set a value');
  });

  it('passes through non-date field values unchanged', () => {
    expect(prettyHeader('Main course', 'enum')).toBe('Main course');
    expect(prettyHeader('Auditorium', 'text')).toBe('Auditorium');
  });

  it('passes through non-ISO date strings unchanged', () => {
    expect(prettyHeader('05/21/2026', 'date')).toBe('05/21/2026');
    expect(prettyHeader('next Tuesday', 'date')).toBe('next Tuesday');
  });

  it('passes through ISO-shaped but invalid dates unchanged (no silent normalization)', () => {
    // Feb 31 would otherwise roll forward into March.
    expect(prettyHeader('2026-02-31', 'date')).toBe('2026-02-31');
    // Month 13.
    expect(prettyHeader('2026-13-01', 'date')).toBe('2026-13-01');
  });
});

describe('emptyHeaderCopy', () => {
  it('returns fixed copy for date and time regardless of label', () => {
    expect(emptyHeaderCopy('date', 'Ignored')).toBe('Set a date');
    expect(emptyHeaderCopy('time', 'Ignored')).toBe('Set a time');
  });

  it('derives from label for text/number/enum', () => {
    expect(emptyHeaderCopy('text', 'What')).toBe('Set what');
    expect(emptyHeaderCopy('number', 'Quantity')).toBe('Set quantity');
    expect(emptyHeaderCopy('enum', 'Course')).toBe('Set course');
  });

  it('falls back to "Set a value" when no label is supplied', () => {
    expect(emptyHeaderCopy('text')).toBe('Set a value');
    expect(emptyHeaderCopy('number', '')).toBe('Set a value');
  });
});
