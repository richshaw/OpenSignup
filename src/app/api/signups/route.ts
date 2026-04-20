import type { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { requireActor } from '@/auth/session';
import { getOrganizerSession } from '@/auth/session';
import { handle, respond } from '@/lib/api-response';
import { serviceError } from '@/lib/errors';
import { fail } from '@/lib/api-response';
import { link, publicSignupUrl } from '@/lib/links';
import { createSignup, listSignupsForWorkspace } from '@/services/signups';
import { SIGNUP_STATUSES } from '@/schemas/signups';

export async function POST(req: NextRequest) {
  return handle(async () => {
    const actor = await requireActor();
    if (actor.kind !== 'organizer') return fail(serviceError('unauthorized', 'sign in to create signups'));

    const body = await req.json().catch(() => ({}));
    const session = await getOrganizerSession();
    const workspaceId =
      (body && typeof body === 'object' && 'workspaceId' in body ? (body as { workspaceId: string }).workspaceId : null) ??
      session?.defaultWorkspaceId ??
      null;
    if (!workspaceId) return fail(serviceError('invalid_input', 'workspaceId required', { field: 'workspaceId' }));

    const result = await createSignup(getDb(), actor, workspaceId, body);
    if (!result.ok) return fail(result.error);
    return respond(result, {
      self: link(`/api/signups/${result.value.id}`),
      publish: link(`/api/signups/${result.value.id}/publish`, 'POST'),
      public: link(publicSignupUrl(result.value.slug)),
    });
  });
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const actor = await requireActor();
    if (actor.kind !== 'organizer') return fail(serviceError('unauthorized', 'sign in to list signups'));

    const url = new URL(req.url);
    const session = await getOrganizerSession();
    const workspaceId = url.searchParams.get('workspaceId') ?? session?.defaultWorkspaceId;
    if (!workspaceId) return fail(serviceError('invalid_input', 'workspaceId required', { field: 'workspaceId' }));

    const statusParam = url.searchParams.get('status');
    const filter: { status?: (typeof SIGNUP_STATUSES)[number] } = {};
    if (statusParam && (SIGNUP_STATUSES as readonly string[]).includes(statusParam)) {
      filter.status = statusParam as (typeof SIGNUP_STATUSES)[number];
    }

    const result = await listSignupsForWorkspace(getDb(), actor, workspaceId, filter);
    return respond(result);
  });
}
