import { afterEach, describe, expect, it } from 'vitest';
import {
  buildMetaSegments,
  capacityLabel,
  formatGroupLabel,
  formatSlotDate,
  pickPrimaryField,
  renderFieldValue,
} from './slot-format';
import type { SignupViewField } from './signup-view-types';

const text = (ref: string, label: string): SignupViewField => ({
  ref,
  label,
  fieldType: 'text',
});

const fields: SignupViewField[] = [
  text('game', 'Game'),
  text('opponent', 'Opponent'),
  text('field', 'Field'),
];

describe('formatSlotDate', () => {
  const originalTZ = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  it('returns null for null/empty/invalid', () => {
    expect(formatSlotDate(null)).toBeNull();
    expect(formatSlotDate(undefined)).toBeNull();
    expect(formatSlotDate('')).toBeNull();
    expect(formatSlotDate('not-a-date')).toBeNull();
  });

  it('formats ISO into Weekday, Mon Day', () => {
    // 2026-04-25 is a Saturday in UTC; we accept any locale-correct prefix
    // by asserting the shape rather than the exact string.
    const out = formatSlotDate('2026-04-25T15:00:00Z');
    expect(out).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/);
  });

  it('renders YYYY-MM-DD on the same calendar day across timezones', () => {
    // 2026-04-25 is a Saturday. With `new Date('2026-04-25')` the value parses
    // as UTC midnight, then `toLocaleDateString` shifts to the host TZ — so in
    // negative offsets it would render as Fri, Apr 24. Verify both sides of
    // UTC return the intended calendar day.
    process.env.TZ = 'America/Los_Angeles';
    expect(formatSlotDate('2026-04-25')).toBe('Sat, Apr 25');
    process.env.TZ = 'Pacific/Auckland';
    expect(formatSlotDate('2026-04-25')).toBe('Sat, Apr 25');
  });
});

describe('pickPrimaryField', () => {
  it('returns null when no fields', () => {
    expect(pickPrimaryField([])).toBeNull();
  });

  it('returns the first field when no group is set', () => {
    expect(pickPrimaryField(fields)?.ref).toBe('game');
  });

  it('skips the group field and returns the next', () => {
    expect(pickPrimaryField(fields, 'game')?.ref).toBe('opponent');
  });

  it('returns null when only field is the group field', () => {
    const single = [text('game', 'Game')];
    expect(pickPrimaryField(single, 'game')).toBeNull();
  });
});

describe('renderFieldValue', () => {
  it('returns null for empty/null/undefined values', () => {
    expect(renderFieldValue(text('a', 'A'), undefined)).toBeNull();
    expect(renderFieldValue(text('a', 'A'), null)).toBeNull();
    expect(renderFieldValue(text('a', 'A'), '')).toBeNull();
  });

  it('passes text/number values through as strings', () => {
    expect(renderFieldValue(text('a', 'A'), 'hello')).toBe('hello');
    const num: SignupViewField = { ref: 'n', label: 'N', fieldType: 'number' };
    expect(renderFieldValue(num, 12)).toBe('12');
    expect(renderFieldValue(num, 0)).toBe('0');
  });

  it('formats date fields using slot-date format', () => {
    const date: SignupViewField = { ref: 'd', label: 'D', fieldType: 'date' };
    const out = renderFieldValue(date, '2026-04-25');
    expect(out).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/);
  });

  it('falls back to raw string when date value is unparseable', () => {
    const date: SignupViewField = { ref: 'd', label: 'D', fieldType: 'date' };
    expect(renderFieldValue(date, 'not-a-date')).toBe('not-a-date');
  });
});

describe('buildMetaSegments', () => {
  const slot = { values: { game: 'Game 1', opponent: 'vs Hawks', field: 'Field B' } };

  it('includes every value with no labels', () => {
    expect(
      buildMetaSegments({ fields, slot }),
    ).toEqual(['Game 1', 'vs Hawks', 'Field B']);
  });

  it('skips the primary field', () => {
    expect(
      buildMetaSegments({ fields, slot, primaryRef: 'game' }),
    ).toEqual(['vs Hawks', 'Field B']);
  });

  it('skips the group field', () => {
    expect(
      buildMetaSegments({ fields, slot, groupRef: 'field' }),
    ).toEqual(['Game 1', 'vs Hawks']);
  });

  it('skips both primary and group', () => {
    expect(
      buildMetaSegments({ fields, slot, primaryRef: 'game', groupRef: 'field' }),
    ).toEqual(['vs Hawks']);
  });

  it('omits empty values', () => {
    const partial = { values: { game: 'Game 1', opponent: '', field: null } };
    expect(buildMetaSegments({ fields, slot: partial })).toEqual(['Game 1']);
  });

  it('preserves field-definition order regardless of values key order', () => {
    const reordered = { values: { field: 'Field B', opponent: 'vs Hawks', game: 'Game 1' } };
    expect(
      buildMetaSegments({ fields, slot: reordered }),
    ).toEqual(['Game 1', 'vs Hawks', 'Field B']);
  });
});

describe('formatGroupLabel', () => {
  it('formats the value via renderFieldValue (date stays a date)', () => {
    const date: SignupViewField = { ref: 'd', label: 'Date', fieldType: 'date' };
    expect(formatGroupLabel(date, '2026-04-25')).toMatch(
      /^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/,
    );
  });

  it('passes text values through', () => {
    expect(formatGroupLabel(text('g', 'Game'), 'GAME 1')).toBe('GAME 1');
  });

  it('falls back to "(no <label>)" for empty/null/undefined', () => {
    const game = text('g', 'Game');
    expect(formatGroupLabel(game, undefined)).toBe('(no game)');
    expect(formatGroupLabel(game, null)).toBe('(no game)');
    expect(formatGroupLabel(game, '')).toBe('(no game)');
  });
});

describe('capacityLabel', () => {
  it('shows nothing for a capacity-1 slot, where the action column says it all', () => {
    expect(capacityLabel(0, 1)).toEqual({ text: '', sr: null });
    expect(capacityLabel(1, 1)).toEqual({ text: '', sr: null });
  });

  it('shows the fraction once there is a denominator worth reading', () => {
    expect(capacityLabel(2, 4)).toEqual({ text: '2/4', sr: '2 of 4 signed up' });
  });

  it('announces a full count to screen readers rather than "ten slash twelve"', () => {
    expect(capacityLabel(10, 12).sr).toBe('10 of 12 signed up');
  });

  it('hides a bare count on an unlimited slot until someone has signed up', () => {
    // A lone "0" has no denominator to anchor it and reads as noise.
    expect(capacityLabel(0, null)).toEqual({ text: '', sr: null });
    expect(capacityLabel(3, null)).toEqual({ text: '3', sr: '3 signed up' });
  });
});
