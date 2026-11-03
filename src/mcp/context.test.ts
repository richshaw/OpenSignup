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

// The rule itself is tested in src/lib/workspace-choice.test.ts; these check
// that tools get it with suggestions that name the MCP tools.
describe('resolveWorkspaceId', () => {
  it('uses the workspace it was given, else the default', () => {
    expect(resolveWorkspaceId(ctx('ws_default'), 'ws_2')).toEqual({ ok: true, value: 'ws_2' });
    expect(resolveWorkspaceId(ctx('ws_default'), undefined)).toEqual({
      ok: true,
      value: 'ws_default',
    });
  });

  it('points a blank workspaceId at list_workspaces', () => {
    const r = resolveWorkspaceId(ctx('ws_default'), '   ');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('invalid_input');
    expect(r.error.suggestion).toContain('list_workspaces');
  });

  it('points at list_workspaces when there is no default workspace either', () => {
    const r = resolveWorkspaceId(ctx(null), undefined);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('invalid_input');
    expect(r.error.suggestion).toContain('list_workspaces');
  });
});
