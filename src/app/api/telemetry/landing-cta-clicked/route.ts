import { headers } from 'next/headers';
import { handle } from '@/lib/api-response';
import { readRequestSignals, recordLandingCtaClicked } from '@/lib/view-tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  return handle(async () => {
    const signals = readRequestSignals(await headers());
    await recordLandingCtaClicked({ signals });
    return new Response(null, { status: 204 });
  });
}
