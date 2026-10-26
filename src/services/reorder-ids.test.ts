import { describe, expect, it } from 'vitest';
import { everyIdOnceError } from './reorder-ids';

describe.each([
  {
    noun: 'slot',
    field: 'slotIds',
    message: 'slotIds must list every slot of the signup exactly once',
    suggestion:
      'call get_signup to see the ids of its slots, then send every one of them once, ' +
      'in the order you want them shown',
  },
  {
    noun: 'field',
    field: 'fieldIds',
    message: 'fieldIds must list every field of the signup exactly once',
    suggestion:
      'call get_signup to see the ids of its fields, then send every one of them once, ' +
      'in the order you want them shown',
  },
] as const)('$noun reorder IDs', ({ noun, field, message, suggestion }) => {
  it('accepts each current ID exactly once, in any order', () => {
    expect(everyIdOnceError(['c', 'a', 'b'], ['a', 'b', 'c'], noun)).toBeNull();
    expect(everyIdOnceError([], [], noun)).toBeNull();
  });

  it('preserves the complete error and the order of each invalid ID list', () => {
    expect(
      everyIdOnceError(
        ['c', 'foreign-b', 'c', 'foreign-a', 'a', 'foreign-b', 'c'],
        ['a', 'b', 'c', 'd'],
        noun,
      ),
    ).toStrictEqual({
      code: 'invalid_input',
      message,
      field,
      details: {
        missing: ['b', 'd'],
        unknown: ['foreign-b', 'foreign-a'],
        duplicates: ['c', 'foreign-b'],
      },
      suggestion,
    });
  });

  it('includes only the applicable error details', () => {
    expect(everyIdOnceError(['a', 'b', 'other'], ['a', 'b'], noun)?.details).toEqual({
      unknown: ['other'],
    });
    expect(everyIdOnceError(['a', 'a', 'b'], ['a', 'b'], noun)?.details).toEqual({
      duplicates: ['a'],
    });
    expect(everyIdOnceError(['b'], ['a', 'b'], noun)?.details).toEqual({ missing: ['a'] });
  });
});
