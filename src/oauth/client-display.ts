/**
 * How a client is named on the consent screen and the connected-apps page.
 *
 * Under CIMD the client is unregistered by construction: its `client_id` is
 * the HTTPS URL its metadata was fetched from, and the `client_name` inside
 * that document is whatever the document says. The domain is the only part
 * an attacker cannot forge, so it is always shown, always first, and never
 * replaced by the self-reported name. A page that says "Claude wants
 * access" while the metadata came from somewhere else entirely is the whole
 * attack.
 */
export interface ClientDisplay {
  /** Hostname the client id was served from, or the raw id for static clients. */
  domain: string;
  /** Self-reported name, if any. Untrusted; shown as a secondary label. */
  name: string | null;
  /** True when the id is a URL (a CIMD client). */
  isUrl: boolean;
}

export function describeClient(clientId: string, clientName: string | null | undefined): ClientDisplay {
  const name = clientName?.trim() ? clientName.trim().slice(0, 100) : null;
  try {
    const url = new URL(clientId);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return { domain: url.hostname, name, isUrl: true };
    }
  } catch {
    // not a URL: a statically registered client id
  }
  return { domain: clientId.slice(0, 100), name, isUrl: false };
}
