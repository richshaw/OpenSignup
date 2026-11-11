import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from './policy';

const recordActivityBestEffort = vi.fn(async () => {});
const pending: Array<() => unknown> = [];

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'user-agent': 'Mozilla/5.0 (iPhone) Mobile' }),
}));
vi.mock('next/server', () => ({ after: (fn: () => unknown) => pending.push(fn) }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/activity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/activity')>()),
  recordActivityBestEffort,
}));

const { trackOrganizerView } = await import('./view-tracker');

const organizer: Actor = {
  kind: 'organizer',
  id: 'org_1',
  email: 'pat@example.com',
  workspaceIds: ['ws_1'],
  workspaceRoles: { ws_1: 'owner' },
};

describe('trackOrganizerView', () => {
  beforeEach(() => {
    recordActivityBestEffort.mockClear();
    pending.length = 0;
  });

  it('writes the row with the actor activityActor builds, after the page is sent', async () => {
    await trackOrganizerView({
      actor: organizer,
      signupId: 'sig_1',
      workspaceId: 'ws_1',
      eventType: 'signup.editor_opened',
      payload: { section: 'settings' },
    });
    expect(recordActivityBestEffort).not.toHaveBeenCalled();
    await Promise.all(pending.map((fn) => fn()));
    expect(recordActivityBestEffort).toHaveBeenCalledWith(
      {},
      {
        actor: { actorId: 'org_1', actorType: 'organizer' },
        signupId: 'sig_1',
        workspaceId: 'ws_1',
        eventType: 'signup.editor_opened',
        payload: { section: 'settings', device: 'phone' },
      },
    );
  });

  it('refuses an actor that is not an organizer', async () => {
    await expect(
      trackOrganizerView({
        actor: { kind: 'anonymous' },
        signupId: null,
        workspaceId: 'ws_1',
        eventType: 'signup.draft_started',
      }),
    ).rejects.toThrow();
    expect(pending).toHaveLength(0);
  });
});
