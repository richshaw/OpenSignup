/**
 * Posts an empty beacon to one of this app's telemetry routes, so a click can
 * be counted without waiting on it: `sendBeacon` survives the page unloading,
 * and a `keepalive` fetch stands in where it's missing or refused. The route
 * reads everything else it records from the request, so the URL is all that
 * travels. Never throws: telemetry must not break the click that sent it.
 */
export function sendTelemetryBeacon(url: string): void {
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
