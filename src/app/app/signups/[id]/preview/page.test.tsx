import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/lib/result';

const getSignupForOrganizer = vi.fn();

vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/auth/session', () => ({
  requireOrganizerSession: async () => ({ organizerId: 'org_1' }),
  toActor: () => ({ kind: 'organizer', organizerId: 'org_1' }),
}));
vi.mock('@/services/signups', () => ({
  getSignupForOrganizer: (...args: unknown[]) => getSignupForOrganizer(...args),
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
  committedBySlot: { slot_a: 1, slot_b: 1 },
};

type ViewProps = { slots: { id: string; committed: number }[] };

describe('organizer preview page', () => {
  beforeEach(() => {
    getSignupForOrganizer.mockReset();
    getSignupForOrganizer.mockResolvedValue(ok(signup));
  });

  it('asks for the sign-up counts and shows them, as the public page does', async () => {
    const page = (await SignupPreviewPage({
      params: Promise.resolve({ id: 'sig_1' }),
    })) as ReactElement<{ children: ReactElement<ViewProps> }>;

    expect(getSignupForOrganizer).toHaveBeenCalledWith({}, expect.anything(), 'sig_1', {
      includeFilled: true,
    });
    const committed = page.props.children.props.slots.map((s) => [s.id, s.committed]);
    expect(committed).toEqual([
      ['slot_a', 1],
      ['slot_b', 1],
    ]);
  });
});
