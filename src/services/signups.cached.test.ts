import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceException, serviceError } from '@/lib/errors';
import type { Actor } from '@/lib/policy';
import { ok } from '@/lib/result';

const getSignupForOrganizer = vi.fn();
const committedBySlot = vi.fn();
const getSignupRowBySlug = vi.fn();
const getPublicSignup = vi.fn();

// Outside a server render React's cache() passes every call straight through,
// so here it stands in for one request's cache: the first call with some
// arguments runs, later ones get its result, until newRequest().
const request = vi.hoisted(() => ({ id: 0 }));
function newRequest() {
  request.id += 1;
}
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
    const seen: { request: number; args: A; result: R }[] = [];
    return (...args: A): R => {
      const hit = seen.find(
        (s) =>
          s.request === request.id &&
          s.args.length === args.length &&
          s.args.every((a, i) => Object.is(a, args[i])),
      );
      if (hit) return hit.result;
      const result = fn(...args);
      seen.push({ request: request.id, args, result });
      return result;
    };
  },
}));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/services/signups', () => ({
  getSignupForOrganizer: (...args: unknown[]) => getSignupForOrganizer(...args),
  getSignupRowBySlug: (...args: unknown[]) => getSignupRowBySlug(...args),
  getPublicSignup: (...args: unknown[]) => getPublicSignup(...args),
}));
vi.mock('@/services/commitments', () => ({
  committedBySlot: (...args: unknown[]) => committedBySlot(...args),
}));

const {
  loadCommittedBySlotForOrganizer,
  loadPublicSignup,
  loadSignupForOrganizer,
  loadSignupRowBySlug,
} = await import('./signups.cached');

beforeEach(newRequest);

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

describe('loadPublicSignup', () => {
  const row = { id: 'sig_1', slug: 'snack-duty', status: 'open' };

  beforeEach(() => {
    getSignupRowBySlug.mockReset().mockResolvedValue(row);
    getPublicSignup.mockReset().mockResolvedValue(ok({ ...row, slots: [] }));
  });

  it('gets its row through loadSignupRowBySlug, so a request reads the signup once', async () => {
    // A layout's read, then the page's metadata and the page itself.
    await loadSignupRowBySlug('snack-duty');
    await loadPublicSignup('snack-duty');
    await loadPublicSignup('snack-duty');

    expect(getSignupRowBySlug).toHaveBeenCalledTimes(1);
    expect(getSignupRowBySlug).toHaveBeenCalledWith(expect.anything(), 'snack-duty');
    // The row, not the slug: given the slug, it would read the signup again.
    expect(getPublicSignup).toHaveBeenCalledTimes(1);
    expect(getPublicSignup).toHaveBeenCalledWith(expect.anything(), row);
  });

  it('passes on that no live signup has the slug, rather than the slug to look up again', async () => {
    getSignupRowBySlug.mockResolvedValue(null);
    await loadPublicSignup('gone');
    expect(getPublicSignup).toHaveBeenCalledWith(expect.anything(), null);
  });
});
