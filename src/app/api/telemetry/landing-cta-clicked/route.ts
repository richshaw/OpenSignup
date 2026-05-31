import { headers } from 'next/headers';
import { z } from 'zod';
import { handle } from '@/lib/api-response';
import { readRequestSignals, recordLandingCtaClicked } from '@/lib/view-tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ctaSchema = z.enum(['start_signup', 'demo_video']).default('start_signup');

export async function POST(request: Request) {
  return handle(async () => {
    const url = new URL(request.url);
    const cta = ctaSchema.parse(url.searchParams.get('cta') ?? undefined);
    const signals = readRequestSignals(await headers());
    await recordLandingCtaClicked({ cta, signals });
    return new Response(null, { status: 204 });
  });
}
