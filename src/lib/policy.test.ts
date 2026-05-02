import { describe, expect, it } from 'vitest';
import {
  type Actor,
  isInWorkspace,
  requireOrganizerId,
  requireWorkspaceAccess,
  requireWorkspaceWrite,
  workspaceRole,
} from './policy';

function organizer(workspaces: Record<string, 'owner' | 'admin' | 'editor' | 'viewer'>): Actor {
  return {
    kind: 'organizer',
    id: 'org_123',
    email: 'a@b.c',
    workspaceIds: Object.keys(workspaces),
    workspaceRoles: workspaces,
  };
}

describe('policy', () => {
  it('isInWorkspace returns true for member', () => {
    const a = organizer({ ws_one: 'owner' });
    expect(isInWorkspace(a, 'ws_one')).toBe(true);
    expect(isInWorkspace(a, 'ws_two')).toBe(false);
  });

  it('requireWorkspaceAccess allows owner', () => {
    const a = organizer({ ws_one: 'owner' });
    expect(() => requireWorkspaceAccess(a, 'ws_one')).not.toThrow();
  });

  it('requireWorkspaceAccess rejects non-member', () => {
    const a = organizer({ ws_one: 'owner' });
    expect(() => requireWorkspaceAccess(a, 'ws_other')).toThrow(/not a member/);
  });

  it('requireWorkspaceWrite blocks viewer', () => {
    const a = organizer({ ws_one: 'viewer' });
    expect(() => requireWorkspaceWrite(a, 'ws_one')).toThrow(/cannot modify/);
  });

  it('requireWorkspaceWrite allows editor', () => {
    const a = organizer({ ws_one: 'editor' });
    expect(() => requireWorkspaceWrite(a, 'ws_one')).not.toThrow();
  });

  it('anonymous cannot access workspace', () => {
    const anon: Actor = { kind: 'anonymous' };
    expect(() => requireWorkspaceAccess(anon, 'ws_any')).toThrow(/organizer session/);
  });

  it('workspaceRole returns null for anon and unknown ws', () => {
    const a = organizer({ ws_one: 'owner' });
    expect(workspaceRole(a, 'ws_unknown')).toBeNull();
  });

  it('requireOrganizerId returns the organizer id', () => {
    const a = organizer({ ws_one: 'owner' });
    expect(requireOrganizerId(a)).toBe('org_123');
  });

  it('requireOrganizerId throws for anonymous actor', () => {
    const anon: Actor = { kind: 'anonymous' };
    expect(() => requireOrganizerId(anon)).toThrow(/organizer session/);
  });

  it('requireOrganizerId throws for participant actor', () => {
    const participant: Actor = {
      kind: 'participant',
      signupId: 'sig_1',
      participantId: 'par_1',
      commitmentId: 'com_1',
    };
    expect(() => requireOrganizerId(participant)).toThrow(/organizer session/);
  });
});
