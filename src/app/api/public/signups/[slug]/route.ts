import type { NextRequest } from 'next/server';
import { toPublicSignup } from '@/app/s/[slug]/public-signup';
import { getDb } from '@/db/client';
import { handle, respond } from '@/lib/api-response';
import { link } from '@/lib/links';
import { ok } from '@/lib/result';
import { getPublicSignup } from '@/services/signups';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  return handle(async () => {
    const { slug } = await ctx.params;
    const result = await getPublicSignup(getDb(), slug);
    return respond(result.ok ? ok(toPublicSignup(result.value)) : result, {
      self: link(`/api/public/signups/${slug}`),
    });
  });
}
