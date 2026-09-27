import { describe, expect, it } from 'vitest';
import { protectedResourceMetadata, protectedResourceMetadataUrl } from './resource-metadata';

describe('protected resource metadata', () => {
  it('binds the resource to the issuer and advertises only the non-sensitive scopes', () => {
    const doc = protectedResourceMetadata('https://signup.example.org', 'https://signup.example.org/api/mcp');
    expect(doc).toEqual({
      resource: 'https://signup.example.org/api/mcp',
      authorization_servers: ['https://signup.example.org'],
      scopes_supported: ['signups:read', 'signups:write'],
      resource_name: 'OpenSignup',
      resource_documentation: undefined,
    });
  });
  it('derives the well-known URL from the resource path', () => {
    expect(protectedResourceMetadataUrl('https://signup.example.org/api/mcp')).toBe(
      'https://signup.example.org/.well-known/oauth-protected-resource/api/mcp',
    );
  });
  it('allows a plain-http issuer only for local development', () => {
    expect(() => protectedResourceMetadata('http://localhost:3000', 'http://localhost:3000/api/mcp')).not.toThrow();
    expect(() => protectedResourceMetadata('http://example.org', 'http://example.org/api/mcp')).toThrow();
  });
});
