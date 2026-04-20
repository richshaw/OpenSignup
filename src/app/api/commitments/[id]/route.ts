import type { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { fail, handle, respond } from '@/lib/api-response';
import { serviceError } from '@/lib/errors';
import {
  cancelOwnCommitment,
  getOwnCommitment,
  updateOwnCommitment,
} from '@/services/commitments';

function readToken(req: NextRequest): string | null {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get('token');
  if (fromQuery) return fromQuery;
  const header = req.headers.get('x-edit-token');
  return header ?? null;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const token = readToken(req);
    if (!token) return fail(serviceError('forbidden', 'edit token required', { field: 'token' }));
    const result = await getOwnCommitment(getDb(), id, token);
    return respond(result);
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const token = readToken(req);
    if (!token) return fail(serviceError('forbidden', 'edit token required', { field: 'token' }));
    const body = await req.json().catch(() => ({}));
    const result = await updateOwnCommitment(getDb(), id, token, body);
    return respond(result);
  });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const token = readToken(req);
    if (!token) return fail(serviceError('forbidden', 'edit token required', { field: 'token' }));
    const result = await cancelOwnCommitment(getDb(), id, token);
    return respond(result);
  });
}
