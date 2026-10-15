import { describe, expect, it, vi } from 'vitest';

vi.mock('./log', () => ({ log: { warn: vi.fn() } }));

import type { Db, Tx } from '@/db/client';
import { activityActor, activityPayload, recordActivityBestEffort } from './activity';
import { log } from './log';
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

  it('treats a missing or null payload as empty', () => {
    expect(activityPayload({ actorId: null, actorType: 'system' })).toEqual({});
    expect(activityPayload({ actorId: null, actorType: 'system' }, null)).toEqual({});
  });
});

describe('recordActivityBestEffort', () => {
  it('logs a failed insert and resolves, so the caller carries on', async () => {
    const failure = new Error('connection reset');
    const db = {
      insert: () => ({
        values: () => Promise.reject(failure),
      }),
    } as unknown as Db;

    await expect(
      recordActivityBestEffort(db, {
        actor: { actorId: null, actorType: 'system' },
        eventType: 'auth.magic_link_sent',
      }),
    ).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      { err: failure, eventType: 'auth.magic_link_sent' },
      'recordActivity failed',
    );
  });

  it('does not accept a transaction', () => {
    // A swallowed failure inside a transaction still aborts it, so the type
    // rules a Tx out. Checked by `pnpm typecheck`, not at run time.
    const insideTx = (tx: Tx) =>
      // @ts-expect-error a transaction is not a Db
      recordActivityBestEffort(tx, { actor: { actorId: null, actorType: 'system' }, eventType: 'auth.magic_link_sent' });
    expect(insideTx).toBeTypeOf('function');
  });
});
