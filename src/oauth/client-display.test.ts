import { describe, expect, it } from 'vitest';
import { describeClient } from './client-display';

describe('describeClient', () => {
  it('names a CIMD client by the host its id was fetched from', () => {
    expect(describeClient('https://claude.ai/oauth/claude-code-client-metadata', 'Claude Code')).toEqual({
      domain: 'claude.ai',
      name: 'Claude Code',
      isUrl: true,
    });
  });
  it('does not let a misleading name change the domain line', () => {
    const d = describeClient('https://attacker.example/meta.json', 'Claude');
    expect(d.domain).toBe('attacker.example');
    expect(d.name).toBe('Claude');
  });
  it('treats a non-URL id as a static client and trims a blank name to null', () => {
    expect(describeClient('inspector', '  ')).toEqual({ domain: 'inspector', name: null, isUrl: false });
  });
  it('caps runaway names', () => {
    expect(describeClient('x', 'a'.repeat(500)).name).toHaveLength(100);
  });
});
