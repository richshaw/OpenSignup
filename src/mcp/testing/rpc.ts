/**
 * Pull the JSON-RPC message out of a response. The stateless legacy leg
 * answers with server-sent events and the modern leg with JSON, so tests
 * that drive the real endpoint have to cope with both. An empty body comes
 * back as `undefined` rather than throwing, so an assertion names the
 * missing message instead of a parse error inside this helper.
 */
export async function readRpc<T = { result?: Record<string, unknown>; error?: unknown }>(
  res: Response,
): Promise<T | undefined> {
  const text = await res.text();
  if (res.headers.get('content-type')?.includes('text/event-stream')) {
    const line = text.split('\n').find((l) => l.startsWith('data:'));
    return line ? (JSON.parse(line.slice(5)) as T) : undefined;
  }
  return text ? (JSON.parse(text) as T) : undefined;
}
