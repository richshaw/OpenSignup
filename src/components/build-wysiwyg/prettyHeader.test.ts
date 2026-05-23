import { describe, it, expect } from 'vitest';
import { prettyHeader } from './prettyHeader';

describe('prettyHeader', () => {
  it('formats an ISO date into uppercase weekday + month + day', () => {
    expect(prettyHeader('2026-05-21', 'date')).toBe('THU, MAY 21');
  });

  it('returns "Set a date" when value is empty and field is date', () => {
    expect(prettyHeader('', 'date')).toBe('Set a date');
    expect(prettyHeader(null, 'date')).toBe('Set a date');
    expect(prettyHeader(undefined, 'date')).toBe('Set a date');
  });

  it('returns "Set a value" when value is empty and field is not date', () => {
    expect(prettyHeader('', 'enum')).toBe('Set a value');
    expect(prettyHeader(null, 'text')).toBe('Set a value');
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
