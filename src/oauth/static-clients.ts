import { z } from 'zod';

/**
 * Pre-registered clients, for the cases CIMD does not cover: an MCP client
 * that still needs a fixed `client_id`, or a developer pointing the MCP
 * Inspector at a local instance. Public clients only — there is no secret,
 * PKCE is mandatory, and redirect URIs are matched exactly (loopback ports
 * excepted, per RFC 8252).
 */
export const StaticClientSchema = z.object({
  client_id: z.string().min(1).max(200),
  client_name: z.string().min(1).max(100),
  redirect_uris: z.array(z.string().url()).min(1).max(20),
});

export type StaticClient = z.infer<typeof StaticClientSchema>;

const ListSchema = z.array(StaticClientSchema).max(50);

/** Parse the `OAUTH_STATIC_CLIENTS` env value. Throws on malformed input. */
export function parseStaticClients(raw: string | undefined): StaticClient[] {
  if (!raw || raw.trim() === '') return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('OAUTH_STATIC_CLIENTS must be a JSON array');
  }
  const parsed = ListSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(
      `OAUTH_STATIC_CLIENTS is invalid at ${first?.path.join('.') || '(root)'}: ${first?.message}`,
    );
  }
  const ids = new Set<string>();
  for (const c of parsed.data) {
    if (ids.has(c.client_id)) throw new Error(`OAUTH_STATIC_CLIENTS: duplicate client_id ${c.client_id}`);
    ids.add(c.client_id);
  }
  return parsed.data;
}
