import { headers } from 'next/headers';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { extractClientIp } from '@/auth/request-context';
import { handle } from '@/lib/api-response';
import { LANDING_CTAS } from '@/lib/landing-cta';
import { consumeRateLimit, RateLimits } from '@/lib/rate-limit';
import { readRequestSignals, recordLandingCtaClicked } from '@/lib/view-tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ctaSchema = z.enum(LANDING_CTAS).default('start_signup');

export async function POST(request: Request) {
  return handle(async () => {
    // Unauthenticated write into the activity log — meter it per IP so a
    // script can't bloat the append-only table.
    const clientIp = extractClientIp(new Headers(request.headers));
    await consumeRateLimit(getDb(), RateLimits.telemetryPerIp, clientIp ?? 'unknown');
    const url = new URL(request.url);
    const cta = ctaSchema.parse(url.searchParams.get('cta') ?? undefined);
    const signals = readRequestSignals(await headers());
    await recordLandingCtaClicked({ cta, signals });
    return new Response(null, { status: 204 });
  });
}
