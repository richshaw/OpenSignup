import { describe, expect, it } from 'vitest';
import { resolveWorkspaceId, type ToolContext } from './context';

function ctx(defaultWorkspaceId: string | null): ToolContext {
  return {
    db: {} as ToolContext['db'],
    actor: {
      kind: 'organizer',
      id: 'org_1',
      email: 'a@example.com',
      workspaceIds: ['ws_1'],
      workspaceRoles: { ws_1: 'owner' },
    } as ToolContext['actor'],
    scopes: ['signups:read'],
    clientId: 'c',
    defaultWorkspaceId,
    workspaces: [],
  };
}

describe('resolveWorkspaceId', () => {
  it('uses the workspace it was given', () => {
    const r = resolveWorkspaceId(ctx('ws_default'), 'ws_2');
    expect(r).toEqual({ ok: true, value: 'ws_2' });
  });

  it('falls back to the default workspace when none is given', () => {
    const r = resolveWorkspaceId(ctx('ws_default'), undefined);
    expect(r).toEqual({ ok: true, value: 'ws_default' });
  });

  it('refuses an empty workspaceId instead of quietly using the default', () => {
    for (const empty of ['', '   ']) {
      const r = resolveWorkspaceId(ctx('ws_default'), empty);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.error.code).toBe('invalid_input');
      expect(r.error.field).toBe('workspaceId');
    }
  });

  it('explains itself when there is no default workspace either', () => {
    const r = resolveWorkspaceId(ctx(null), undefined);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('invalid_input');
  });
});
