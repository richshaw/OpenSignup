import { describe, expect, it } from 'vitest';
import { activityActor } from './activity';
import { ServiceException } from './errors';
import type { Actor } from './policy';

const base: Actor = {
  kind: 'organizer',
  id: 'org_1',
  email: 'a@example.com',
  workspaceIds: ['ws_1'],
  workspaceRoles: { ws_1: 'owner' },
};

describe('activityActor', () => {
  it('maps a browser organizer to a plain organizer actor', () => {
    expect(activityActor(base)).toEqual({ actorId: 'org_1', actorType: 'organizer' });
  });

  it('carries the connected app id when the actor came through a bearer token', () => {
    expect(activityActor({ ...base, via: { clientId: 'https://claude.ai/oauth/x' } })).toEqual({
      actorId: 'org_1',
      actorType: 'organizer',
      clientId: 'https://claude.ai/oauth/x',
    });
  });

  it('refuses anything that is not an organizer', () => {
    expect(() => activityActor({ kind: 'anonymous' })).toThrow(ServiceException);
  });
});
