import { describe, expect, it } from 'vitest';
import {
  ADVERTISED_SCOPES,
  ALL_SCOPES,
  SCOPE_DESCRIPTIONS,
  describeScopes,
  isScope,
  parseScopeString,
  type Scope,
} from './scopes';

describe('scopes', () => {
  it('defines exactly the three resource scopes plus offline_access', () => {
    expect(ALL_SCOPES).toEqual([
      'signups:read',
      'signups:write',
      'commitments:read',
      'offline_access',
    ]);
  });

  it('keeps commitments:read out of the advertised set so clients must step up to it', () => {
    expect(ADVERTISED_SCOPES).toEqual(['signups:read', 'signups:write']);
    expect(ADVERTISED_SCOPES).not.toContain('commitments:read');
  });

  it('has a human-readable description for every scope that appears on the consent screen', () => {
    for (const scope of ALL_SCOPES) {
      expect(SCOPE_DESCRIPTIONS[scope].length).toBeGreaterThan(10);
    }
    expect(SCOPE_DESCRIPTIONS['commitments:read']).toMatch(/names and email addresses/);
  });

  it('parses a space-separated scope string, dropping unknown and duplicate entries', () => {
    expect(parseScopeString('signups:read  bogus signups:read offline_access')).toEqual([
      'signups:read',
      'offline_access',
    ]);
    expect(parseScopeString(undefined)).toEqual([]);
    expect(parseScopeString('')).toEqual([]);
  });

  it('isScope narrows strings', () => {
    expect(isScope('signups:write')).toBe(true);
    expect(isScope('admin')).toBe(false);
  });

  it('describeScopes orders participant-data access last and omits offline_access', () => {
    const scopes: Scope[] = ['offline_access', 'commitments:read', 'signups:read'];
    expect(describeScopes(scopes).map((d) => d.scope)).toEqual(['signups:read', 'commitments:read']);
    expect(describeScopes(scopes).find((d) => d.scope === 'commitments:read')?.sensitive).toBe(true);
  });
});
