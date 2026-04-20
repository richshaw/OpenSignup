import type { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { handle, respond } from '@/lib/api-response';
import { link } from '@/lib/links';
import { getPublicSignup } from '@/services/signups';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  return handle(async () => {
    const { slug } = await ctx.params;
    const result = await getPublicSignup(getDb(), slug);
    if (!result.ok) return respond(result);
    return respond(result, {
      self: link(`/api/public/signups/${slug}`),
    });
  });
}
