/**
 * Read a request body into memory with a hard byte cap. The declared
 * `content-length` is checked first (free), then the stream is read chunk
 * by chunk and abandoned the moment it passes the limit, so a chunked or
 * lying request can never make the process buffer more than `limit` bytes.
 * Shared by the OAuth shim and the MCP endpoint, which both have to
 * materialise a body before an unauthenticated caller has proven anything.
 */
export class BodyTooLarge extends Error {
  constructor() {
    super('request body too large');
    this.name = 'BodyTooLarge';
  }
}

export async function readRequestBody(request: Request, limit: number): Promise<Buffer> {
  if (request.method === 'GET' || request.method === 'HEAD') return Buffer.alloc(0);
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw new BodyTooLarge();
  if (!request.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = request.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new BodyTooLarge();
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
