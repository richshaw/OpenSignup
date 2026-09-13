import { EventEmitter, once } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

/**
 * Bridge between the Web `Request`/`Response` an App Router route handler
 * speaks and the Node `IncomingMessage`/`ServerResponse` pair `oidc-provider`
 * (a Koa app) consumes.
 *
 * Nothing here is generic Node plumbing; it is the minimum Koa 3 and
 * oidc-provider 9 actually touch, found by running them:
 *
 * - `host` must be present or Koa builds `ctx.href` from an empty host and
 *   discovery advertises endpoints like `http://.well-known/...`.
 * - `content-length` must be present on POST bodies or `type-is` reports no
 *   body and the token endpoint rejects the request as having the wrong
 *   content type.
 * - `socket.writable` must be `true` or Koa's `respond()` silently skips
 *   `res.end()` and returns an empty 200.
 *
 * Every request is re-anchored to the canonical origin: `host` and the
 * forwarded-proto header are overwritten from `origin`, never trusted from
 * the wire, so a proxy's internal hostname can never leak into discovery or
 * redirect URLs.
 */

export interface ShimOptions {
  /** Canonical public origin, e.g. `https://opensignup.org`. */
  origin: string;
  /** Client IP for `X-Forwarded-For`, or null when unknown. */
  clientIp: string | null;
  /**
   * Override the path (and query) the provider sees, when the public URL is
   * not the one the provider's router should match.
   */
  path?: string;
}

type NodeHandler = (req: IncomingMessage, res: ServerResponse) => unknown;

interface FakeSocket extends EventEmitter {
  remoteAddress: string;
  encrypted: boolean;
  writable: boolean;
  destroyed: boolean;
  destroy(): void;
}

function fakeSocket(remoteAddress: string, encrypted: boolean): FakeSocket {
  const socket = new EventEmitter() as FakeSocket;
  socket.remoteAddress = remoteAddress;
  socket.encrypted = encrypted;
  socket.writable = true;
  socket.destroyed = false;
  socket.destroy = () => {
    socket.destroyed = true;
    socket.writable = false;
  };
  return socket;
}

export function toNodeRequest(request: Request, body: Buffer, opts: ShimOptions): IncomingMessage {
  const canonical = new URL(opts.origin);
  const url = new URL(request.url);
  const path = opts.path ?? `${url.pathname}${url.search}`;
  const encrypted = canonical.protocol === 'https:';

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  headers.host = canonical.host;
  headers['x-forwarded-host'] = canonical.host;
  headers['x-forwarded-proto'] = encrypted ? 'https' : 'http';
  if (opts.clientIp) headers['x-forwarded-for'] = opts.clientIp;
  else delete headers['x-forwarded-for'];
  delete headers['transfer-encoding'];
  if (body.length > 0 || request.method === 'POST' || request.method === 'PUT') {
    headers['content-length'] = String(body.length);
  } else {
    delete headers['content-length'];
  }

  const req = Readable.from(body.length > 0 ? [body] : []) as unknown as IncomingMessage & {
    originalUrl: string;
  };
  req.method = request.method;
  req.url = path;
  req.originalUrl = path;
  req.headers = headers;
  req.httpVersion = '1.1';
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;
  const socket = fakeSocket(opts.clientIp ?? '0.0.0.0', encrypted);
  Object.defineProperty(req, 'socket', { value: socket, enumerable: true });
  Object.defineProperty(req, 'connection', { value: socket, enumerable: true });
  return req;
}

/**
 * Just enough `ServerResponse` for Koa: status, a header map, `end()`, and
 * the `finish` event `on-finished` listens for.
 */
export class ShimResponse extends EventEmitter {
  statusCode = 200;
  statusMessage = '';
  headersSent = false;
  finished = false;
  writableEnded = false;
  writableFinished = false;
  readonly socket: FakeSocket;
  private readonly headers = new Map<string, string | string[]>();
  private readonly chunks: Buffer[] = [];

  constructor(req: IncomingMessage) {
    super();
    this.socket = req.socket as unknown as FakeSocket;
  }

  setHeader(name: string, value: number | string | readonly string[]): this {
    this.headers.set(
      name.toLowerCase(),
      Array.isArray(value) ? [...(value as readonly string[])] : String(value),
    );
    return this;
  }
  getHeader(name: string): string | string[] | undefined {
    return this.headers.get(name.toLowerCase());
  }
  getHeaders(): Record<string, string | string[]> {
    return Object.fromEntries(this.headers);
  }
  getHeaderNames(): string[] {
    return [...this.headers.keys()];
  }
  hasHeader(name: string): boolean {
    return this.headers.has(name.toLowerCase());
  }
  removeHeader(name: string): void {
    this.headers.delete(name.toLowerCase());
  }
  writeHead(
    status: number,
    reasonOrHeaders?: string | Record<string, string | string[]>,
    maybeHeaders?: Record<string, string | string[]>,
  ): this {
    this.statusCode = status;
    const headers = typeof reasonOrHeaders === 'string' ? maybeHeaders : reasonOrHeaders;
    if (typeof reasonOrHeaders === 'string') this.statusMessage = reasonOrHeaders;
    if (headers) for (const [k, v] of Object.entries(headers)) this.setHeader(k, v);
    this.headersSent = true;
    return this;
  }
  flushHeaders(): void {
    this.headersSent = true;
  }
  write(chunk: unknown, encodingOrCb?: unknown, cb?: unknown): boolean {
    this.headersSent = true;
    this.push(chunk, typeof encodingOrCb === 'string' ? encodingOrCb : undefined);
    const done = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
    if (typeof done === 'function') (done as () => void)();
    return true;
  }
  end(chunk?: unknown, encodingOrCb?: unknown, cb?: unknown): this {
    if (this.writableEnded) return this;
    if (chunk !== undefined && typeof chunk !== 'function') {
      this.push(chunk, typeof encodingOrCb === 'string' ? encodingOrCb : undefined);
    }
    this.headersSent = true;
    this.writableEnded = true;
    this.finished = true;
    this.writableFinished = true;
    const done = [chunk, encodingOrCb, cb].find((v) => typeof v === 'function');
    if (typeof done === 'function') (done as () => void)();
    this.emit('finish');
    return this;
  }
  destroy(): this {
    this.socket.destroy();
    this.emit('close');
    return this;
  }
  private push(chunk: unknown, encoding?: string): void {
    if (chunk === undefined || chunk === null) return;
    if (Buffer.isBuffer(chunk)) this.chunks.push(chunk);
    else if (chunk instanceof Uint8Array) this.chunks.push(Buffer.from(chunk));
    else this.chunks.push(Buffer.from(String(chunk), (encoding as BufferEncoding) ?? 'utf8'));
  }

  toResponse(): Response {
    const headers = new Headers();
    for (const [name, value] of this.headers) {
      if (Array.isArray(value)) for (const v of value) headers.append(name, v);
      else headers.set(name, value);
    }
    const body = Buffer.concat(this.chunks);
    const bodiless = this.statusCode === 204 || this.statusCode === 304 || body.length === 0;
    return new Response(bodiless ? null : new Uint8Array(body), {
      status: this.statusCode,
      statusText: this.statusMessage,
      headers,
    });
  }
}

export async function readRequestBody(request: Request): Promise<Buffer> {
  if (request.method === 'GET' || request.method === 'HEAD') return Buffer.alloc(0);
  return Buffer.from(await request.arrayBuffer());
}

/**
 * Run a Node-style handler against a Web `Request` and collect a `Response`.
 * Resolves once the handler has ended the response.
 */
export async function invokeNodeHandler(
  handler: NodeHandler,
  request: Request,
  opts: ShimOptions,
): Promise<Response> {
  const body = await readRequestBody(request);
  const req = toNodeRequest(request, body, opts);
  const res = new ShimResponse(req);
  const finished = once(res, 'finish');
  await handler(req, res as unknown as ServerResponse);
  if (!res.writableEnded) await finished;
  return res.toResponse();
}

/**
 * Same pairing, for provider methods that take `(req, res, ...)` and either
 * return a value or write a redirect into `res`.
 */
export async function withNodePair<T>(
  request: Request,
  opts: ShimOptions,
  fn: (req: IncomingMessage, res: ServerResponse) => Promise<T>,
): Promise<{ value: T; response: Response; ended: boolean }> {
  const body = await readRequestBody(request);
  const req = toNodeRequest(request, body, opts);
  const res = new ShimResponse(req);
  const value = await fn(req, res as unknown as ServerResponse);
  return { value, response: res.toResponse(), ended: res.writableEnded };
}
