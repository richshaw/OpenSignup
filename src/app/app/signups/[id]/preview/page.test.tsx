import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceException, serviceError } from '@/lib/errors';
import { ok } from '@/lib/result';

const getSignupForOrganizer = vi.fn();
const committedBySlot = vi.fn();

vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/auth/session', () => ({
  requireOrganizerSession: async () => ({ organizerId: 'org_1' }),
  toActor: () => ({ kind: 'organizer', organizerId: 'org_1' }),
}));
vi.mock('@/services/signups', () => ({
  getSignupForOrganizer: (...args: unknown[]) => getSignupForOrganizer(...args),
  getPublicSignup: vi.fn(),
}));
vi.mock('@/services/commitments', () => ({
  committedBySlot: (...args: unknown[]) => committedBySlot(...args),
}));
vi.mock('@/lib/view-tracker', () => ({ trackOrganizerView: vi.fn() }));

const { default: SignupPreviewPage } = await import('./page');

const signup = {
  id: 'sig_1',
  workspaceId: 'ws_1',
  slug: 'snack-duty',
  title: 'Snack duty — Spring season',
  description: null,
  status: 'open',
  settings: {},
  closesAt: null,
  fields: [],
  slots: [
    { id: 'slot_a', ref: 'a', values: {}, capacity: 2, status: 'open', slotAt: null },
    { id: 'slot_b', ref: 'b', values: {}, capacity: 1, status: 'open', slotAt: null },
  ],
};

type ViewProps = { slots: { id: string; committed: number }[] };

describe('organizer preview page', () => {
  beforeEach(() => {
    getSignupForOrganizer.mockReset();
    getSignupForOrganizer.mockResolvedValue(ok(signup));
    committedBySlot.mockReset();
    committedBySlot.mockResolvedValue({ slot_a: 1, slot_b: 1 });
  });

  it('asks for the sign-up counts and shows them, as the public page does', async () => {
    const page = (await SignupPreviewPage({
      params: Promise.resolve({ id: 'sig_1' }),
    })) as ReactElement<{ children: ReactElement<ViewProps> }>;

    expect(committedBySlot).toHaveBeenCalledWith({}, 'sig_1');
    const committed = page.props.children.props.slots.map((s) => [s.id, s.committed]);
    expect(committed).toEqual([
      ['slot_a', 1],
      ['slot_b', 1],
    ]);
  });

  it('shows "signup not found" for a signup in a workspace the organizer is not in', async () => {
    getSignupForOrganizer.mockRejectedValue(
      new ServiceException(serviceError('forbidden', 'not a member of that workspace')),
    );
    const page = (await SignupPreviewPage({
      params: Promise.resolve({ id: 'sig_theirs' }),
    })) as ReactElement<{ message: string }>;

    expect(page.props.message).toBe('signup not found');
    expect(committedBySlot).not.toHaveBeenCalled();
  });
});
