import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Actor } from '@/lib/policy';
import { ok } from '@/lib/result';

const session = vi.hoisted(() => ({
  actor: undefined as unknown as Actor,
  defaultWorkspaceId: null as string | null,
}));
vi.mock('@/auth/session', () => ({
  requireActor: async () => session.actor,
  getOrganizerSession: async () => ({ defaultWorkspaceId: session.defaultWorkspaceId }),
}));
vi.mock('@/db/client', () => ({ getDb: () => ({}) as unknown }));
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ NEXT_PUBLIC_APP_URL: 'https://signup.example.org' }),
}));

const consume = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, consumeRateLimit: (...a: unknown[]) => consume(...a) };
});

const create = vi.fn(async (..._args: unknown[]) => ok({ id: 'sig_1', slug: 'snack-rota' }));
vi.mock('@/services/signups', () => ({
  createSignup: (...a: unknown[]) => create(...a),
  listSignupsForWorkspace: vi.fn(),
}));

const { POST } = await import('./route');

const owner: Actor = {
  kind: 'organizer',
  id: 'org_1',
  email: 'pat@example.com',
  workspaceIds: ['ws_1'],
  workspaceRoles: { ws_1: 'owner' },
};
const viewer: Actor = { ...owner, workspaceRoles: { ws_1: 'viewer' } };

function request(body: Record<string, unknown> = { title: 'Snack rota' }) {
  return new NextRequest('http://localhost/api/signups', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function post(body?: Record<string, unknown>) {
  return POST(request(body), { params: Promise.resolve({}) });
}

beforeEach(() => {
  consume.mockClear();
  create.mockClear();
  session.actor = owner;
  session.defaultWorkspaceId = 'ws_1';
});

describe('POST /api/signups', () => {
  it('refuses a viewer without spending create quota', async () => {
    session.actor = viewer;
    const res = await post({ title: 'Snack rota', workspaceId: 'ws_1' });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('forbidden');
    expect(consume).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ['an unjoined workspace', 'ws_other'],
    ['a workspace that does not exist', 'ws_missing'],
  ])('refuses %s without spending create quota', async (_case, workspaceId) => {
    const res = await post({ title: 'Snack rota', workspaceId });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('forbidden');
    expect(consume).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('charges one unit and creates the signup for a legitimate request', async () => {
    const res = await post({ title: 'Snack rota', workspaceId: 'ws_1' });
    expect(res.status).toBe(200);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls[0]?.[1]).toMatchObject({ bucket: 'signup.create' });
    expect(consume.mock.calls[0]?.[2]).toBe('org_1');
    expect(create).toHaveBeenCalledTimes(1);
    expect((await res.json()).data).toEqual({ id: 'sig_1', slug: 'snack-rota' });
  });
});
