import type { LandingCta } from '@/lib/landing-cta';

const TELEMETRY_PATH = '/api/telemetry/landing-cta-clicked';

export function emitLandingCtaClicked(cta: LandingCta): void {
  const url = `${TELEMETRY_PATH}?cta=${cta}`;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const ok = navigator.sendBeacon(url, new Blob([], { type: 'text/plain' }));
      if (ok) return;
    }
    void fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
  } catch {
    // Telemetry must never break the click.
  }
}
