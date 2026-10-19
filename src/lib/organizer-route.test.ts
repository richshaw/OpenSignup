import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Actor } from './policy';
import { serviceError } from './errors';
import { err, ok } from './result';

const session = vi.hoisted(() => ({ actor: { kind: 'anonymous' } as Actor }));
vi.mock('@/auth/session', () => ({ requireActor: async () => session.actor }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));

const { organizerRoute } = await import('./organizer-route');

const organizer: Actor = {
  kind: 'organizer',
  id: 'org_1',
  email: 'pat@example.com',
  workspaceIds: [],
  workspaceRoles: {},
};

function call(route: ReturnType<typeof organizerRoute<{ id: string }>>) {
  return route(new NextRequest('http://localhost/api/x'), { params: Promise.resolve({ id: 'sig_1' }) });
}

describe('organizerRoute()', () => {
  it('answers 401 without running the handler when nobody is signed in', async () => {
    session.actor = { kind: 'anonymous' } as Actor;
    const run = vi.fn();
    const res = await call(organizerRoute<{ id: string }>(run));
    expect(res.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it('hands the handler the organizer and params, and sends a Result through respond', async () => {
    session.actor = organizer;
    const res = await call(
      organizerRoute<{ id: string }>(async ({ actor, params }) => ok({ actor: actor.id, id: params.id })),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { actor: 'org_1', id: 'sig_1' } });
  });

  it('maps an error Result to its status', async () => {
    session.actor = organizer;
    const res = await call(organizerRoute<{ id: string }>(async () => err(serviceError('not_found', 'missing'))));
    expect(res.status).toBe(404);
  });

  it('passes a returned Response through untouched', async () => {
    session.actor = organizer;
    const res = await call(organizerRoute<{ id: string }>(async () => new Response('a,b', { status: 200 })));
    expect(await res.text()).toBe('a,b');
  });
});
