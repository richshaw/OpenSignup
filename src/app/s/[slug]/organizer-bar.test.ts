import { describe, expect, it } from 'vitest';
import type { Actor, WorkspaceRole } from '@/lib/policy';
import { organizerBarSignupId } from './organizer-bar';

function organizer(roles: Record<string, WorkspaceRole>): Actor {
  return {
    kind: 'organizer',
    id: 'org_1',
    email: 'pat@example.com',
    workspaceIds: Object.keys(roles),
    workspaceRoles: roles,
  };
}

const SIGNUP = { id: 'sig_1', workspaceId: 'ws_1' };

describe('organizerBarSignupId', () => {
  it.each(['owner', 'admin', 'editor', 'viewer'] as const)(
    'gives the signup id to a member with the %s role',
    (role) => {
      expect(organizerBarSignupId(organizer({ ws_1: role }), SIGNUP)).toBe('sig_1');
    },
  );

  it('gives nothing to an organizer from another workspace', () => {
    expect(organizerBarSignupId(organizer({ ws_2: 'owner' }), SIGNUP)).toBeNull();
  });

  it('gives nothing to a signed-out visitor', () => {
    expect(organizerBarSignupId({ kind: 'anonymous' }, SIGNUP)).toBeNull();
  });

  it('gives nothing for a signup with no workspace', () => {
    expect(
      organizerBarSignupId(organizer({ ws_1: 'owner' }), { id: 'sig_1', workspaceId: null }),
    ).toBeNull();
  });
});
