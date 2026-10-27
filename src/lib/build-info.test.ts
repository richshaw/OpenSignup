import { describe, expect, it } from 'vitest';
import { shortCommit } from './build-info';

describe('shortCommit', () => {
  it('shortens a full hash to 7 characters', () => {
    expect(shortCommit('1d4ff3a9c0b2e8f7a6d5c4b3a2918070f6e5d4c3')).toBe('1d4ff3a');
  });

  it('keeps a hash that is already short', () => {
    expect(shortCommit('1d4ff3a')).toBe('1d4ff3a');
  });

  it('lowercases and trims', () => {
    expect(shortCommit(' 1D4FF3A9\n')).toBe('1d4ff3a');
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['the literal undefined Next inlines', 'undefined'],
    ['too short', '1d4ff3'],
    ['too long', 'a'.repeat(41)],
    ['not hex', 'main-branch'],
    ['a version number', '0.1.0'],
  ])('is null when %s', (_name, raw) => {
    expect(shortCommit(raw)).toBeNull();
  });
});
