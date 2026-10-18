import { describe, expect, it } from 'vitest';
import {
  buildMetaSegments,
  capacityLabel,
  formatGroupLabel,
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

  it('counts the spots left, as the sign-up sheet does', () => {
    expect(capacityLabel(0, 2)).toEqual({ text: '2 left', sr: '2 of 2 spots left' });
    expect(capacityLabel(1, 2)).toEqual({ text: '1 left', sr: '1 of 2 spots left' });
    expect(capacityLabel(10, 12)).toEqual({ text: '2 left', sr: '2 of 12 spots left' });
  });

  it('shows nothing for a full slot, where the action column says "Full"', () => {
    expect(capacityLabel(4, 4)).toEqual({ text: '', sr: null });
    // The organizer can lower a slot's capacity under its sign-ups.
    expect(capacityLabel(5, 3)).toEqual({ text: '', sr: null });
  });

  it('shows nothing for a non-positive capacity rather than a meaningless "0/0"', () => {
    // CapacitySchema is `.positive()`, so no validated write produces this;
    // the type still admits it, and the function should be total.
    expect(capacityLabel(0, 0)).toEqual({ text: '', sr: null });
  });

  it('hides a bare count on an unlimited slot until someone has signed up', () => {
    // A lone "0" has no denominator to anchor it and reads as noise.
    expect(capacityLabel(0, null)).toEqual({ text: '', sr: null });
    expect(capacityLabel(3, null)).toEqual({ text: '3', sr: '3 signed up' });
  });
});
