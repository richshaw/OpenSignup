import { describe, expect, it } from 'vitest';
import { disconnectRefusal } from './disconnect-refusal';

describe('disconnectRefusal', () => {
  it('says the app is already disconnected for not_found', () => {
    expect(disconnectRefusal('not_found')).toBe('That app is already disconnected.');
  });

  it.each(['forbidden', 'internal', 'unauthorized'] as const)('falls back for %s', (code) => {
    expect(disconnectRefusal(code)).toBe('Couldn’t disconnect. Try again.');
  });

  it('falls back when there is no code (an unexpected error)', () => {
    expect(disconnectRefusal(undefined)).toBe('Couldn’t disconnect. Try again.');
  });
});
