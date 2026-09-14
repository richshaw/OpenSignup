import { describe, expect, it } from 'vitest';
import type { Scope } from '@/oauth/scopes';
import { requiredScopesFor } from './scope-gate';

const lookup = (name: string): Scope | null =>
  ({ list_signups: 'signups:read', create_signup: 'signups:write' } as Record<string, Scope>)[name] ?? null;

describe('requiredScopesFor', () => {
  it('maps a tools/call to the tool scope', () => {
    expect(
      requiredScopesFor({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_signup' } }, lookup),
    ).toEqual(['signups:write']);
  });

  it('needs nothing extra for other methods and unknown tools', () => {
    expect(requiredScopesFor({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, lookup)).toEqual([]);
    expect(
      requiredScopesFor({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nope' } }, lookup),
    ).toEqual([]);
    expect(requiredScopesFor(undefined, lookup)).toEqual([]);
    expect(requiredScopesFor('garbage', lookup)).toEqual([]);
  });

  it('unions across a legacy batch', () => {
    const batch = [
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_signups' } },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'create_signup' } },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'create_signup' } },
    ];
    expect(requiredScopesFor(batch, lookup)).toEqual(['signups:read', 'signups:write']);
  });
});
