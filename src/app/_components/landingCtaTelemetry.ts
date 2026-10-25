import type { LandingCta } from '@/lib/landing-cta';
import { sendTelemetryBeacon } from '@/lib/telemetry-beacon';

const TELEMETRY_PATH = '/api/telemetry/landing-cta-clicked';

export function emitLandingCtaClicked(cta: LandingCta): void {
  sendTelemetryBeacon(`${TELEMETRY_PATH}?cta=${cta}`);
}
