import { describe, expect, it } from 'vitest';
import { removeRefusal } from './remove-refusal';

describe('removeRefusal', () => {
  it('says the person is gone for not_found', () => {
    expect(removeRefusal('not_found')).toBe(
      'This person is no longer on this signup. Reload to see the latest.',
    );
  });

  it('says a viewer cannot edit', () => {
    expect(removeRefusal('forbidden')).toBe('You don’t have edit access.');
  });

  it.each(['conflict', 'internal', 'unauthorized'] as const)('falls back for %s', (code) => {
    expect(removeRefusal(code)).toBe('Couldn’t remove them. Try again.');
  });
});
