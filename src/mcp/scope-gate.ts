import type { Scope } from '@/oauth/scopes';

/**
 * Which scopes a JSON-RPC body needs before the SDK sees it. Only
 * `tools/call` needs anything beyond a valid token; the scope comes from
 * the tool registry. Both protocol eras keep `method` and `params.name` at
 * the top level (the 2026 envelope lives under `params._meta`), so one
 * peek serves both. Unknown tools need nothing: the SDK answers
 * "tool not found" itself.
 */
export function requiredScopesFor(body: unknown, lookup: (name: string) => Scope | null): Scope[] {
  const messages = Array.isArray(body) ? body : [body];
  const out: Scope[] = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const { method, params } = m as { method?: unknown; params?: unknown };
    if (method !== 'tools/call' || !params || typeof params !== 'object') continue;
    const name = (params as { name?: unknown }).name;
    if (typeof name !== 'string') continue;
    const scope = lookup(name);
    if (scope && !out.includes(scope)) out.push(scope);
  }
  return out;
}
