import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceException, serviceError } from '@/lib/errors';
import type { Actor } from '@/lib/policy';
import { ok } from '@/lib/result';

const getSignupForOrganizer = vi.fn();
const committedBySlot = vi.fn();

vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/services/signups', () => ({
  getSignupForOrganizer: (...args: unknown[]) => getSignupForOrganizer(...args),
  getPublicSignup: vi.fn(),
}));
vi.mock('@/services/commitments', () => ({
  committedBySlot: (...args: unknown[]) => committedBySlot(...args),
}));

const { loadCommittedBySlotForOrganizer, loadSignupForOrganizer } =
  await import('./signups.cached');

const actor: Actor = {
  kind: 'organizer',
  id: 'org_1',
  email: 'pat@example.com',
  workspaceIds: ['ws_mine'],
  workspaceRoles: { ws_mine: 'owner' },
};

function refuseAsForeignWorkspace() {
  getSignupForOrganizer.mockRejectedValue(
    new ServiceException(serviceError('forbidden', 'not a member of that workspace')),
  );
}

describe('loadSignupForOrganizer', () => {
  beforeEach(() => {
    getSignupForOrganizer.mockReset();
    committedBySlot.mockReset();
  });

  it('reports a signup in another workspace as not found, the same as a made-up id', async () => {
    refuseAsForeignWorkspace();
    const result = await loadSignupForOrganizer(actor, 'sig_theirs');
    expect(result).toEqual({
      ok: false,
      error: { code: 'not_found', message: 'signup not found' },
    });
  });

  it('passes a found signup through unchanged', async () => {
    getSignupForOrganizer.mockResolvedValue(ok({ id: 'sig_1' }));
    expect(await loadSignupForOrganizer(actor, 'sig_1')).toEqual(ok({ id: 'sig_1' }));
  });

  it('lets any other failure go on up', async () => {
    getSignupForOrganizer.mockRejectedValue(new Error('connection refused'));
    await expect(loadSignupForOrganizer(actor, 'sig_1')).rejects.toThrow('connection refused');
  });

  it('gives no counts for a signup in another workspace', async () => {
    refuseAsForeignWorkspace();
    const result = await loadCommittedBySlotForOrganizer(actor, 'sig_theirs');
    expect(result.ok).toBe(false);
    expect(committedBySlot).not.toHaveBeenCalled();
  });
});
