import { describe, expect, it } from 'vitest';
import { activityActor, activityPayload } from './activity';
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

  it('refuses anything that is not an organizer with unauthorized, like requireOrganizerId', () => {
    let thrown: unknown;
    try {
      activityActor({ kind: 'anonymous' });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ServiceException);
    expect((thrown as ServiceException).serviceError.code).toBe('unauthorized');
  });
});

describe('activityPayload', () => {
  const CLIENT = 'https://client.example/meta.json';
  const FORGED = 'https://forged.example/meta.json';

  it('drops a forged viaClientId when the actor has no connected app', () => {
    const payload = activityPayload(
      { actorId: 'org_1', actorType: 'organizer' },
      { changed: ['title'], viaClientId: FORGED },
    );
    expect(payload).toEqual({ changed: ['title'] });
  });

  it("stamps the actor's own client id over a forged one", () => {
    const payload = activityPayload(
      { actorId: 'org_1', actorType: 'organizer', clientId: CLIENT },
      { changed: ['title'], viaClientId: FORGED },
    );
    expect(payload).toEqual({ changed: ['title'], viaClientId: CLIENT });
  });

  it('defaults to an empty payload', () => {
    expect(activityPayload({ actorId: null, actorType: 'system' })).toEqual({});
  });
});
