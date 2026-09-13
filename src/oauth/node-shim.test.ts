import { describe, expect, it } from 'vitest';
import { invokeNodeHandler, toNodeRequest, withNodePair } from './node-shim';

const ORIGIN = 'https://signup.example.org';

describe('toNodeRequest', () => {
  it('re-anchors host and proto to the canonical origin and ignores what the wire says', () => {
    const request = new Request('http://internal.fly.dev:8080/api/oauth/token?x=1', {
      method: 'POST',
      headers: {
        host: 'internal.fly.dev:8080',
        'x-forwarded-host': 'evil.example',
        'x-forwarded-proto': 'http',
        'x-forwarded-for': '10.0.0.9',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'a=b',
    });
    const req = toNodeRequest(request, Buffer.from('a=b'), { origin: ORIGIN, clientIp: '203.0.113.7' });
    expect(req.headers.host).toBe('signup.example.org');
    expect(req.headers['x-forwarded-host']).toBe('signup.example.org');
    expect(req.headers['x-forwarded-proto']).toBe('https');
    expect(req.headers['x-forwarded-for']).toBe('203.0.113.7');
    expect(req.headers['content-length']).toBe('3');
    expect(req.url).toBe('/api/oauth/token?x=1');
    expect((req as unknown as { originalUrl: string }).originalUrl).toBe('/api/oauth/token?x=1');
    expect(req.method).toBe('POST');
    expect((req.socket as unknown as { encrypted: boolean }).encrypted).toBe(true);
    expect((req.socket as unknown as { writable: boolean }).writable).toBe(true);
  });

  it('drops an unknown client ip rather than trusting the incoming header', () => {
    const request = new Request('https://x.test/a', { headers: { 'x-forwarded-for': '1.2.3.4' } });
    const req = toNodeRequest(request, Buffer.alloc(0), { origin: ORIGIN, clientIp: null });
    expect(req.headers['x-forwarded-for']).toBeUndefined();
    expect(req.headers['content-length']).toBeUndefined();
  });

  it('lets the provider path be overridden independently of the public URL', () => {
    const request = new Request('https://x.test/.well-known/openid-configuration');
    const req = toNodeRequest(request, Buffer.alloc(0), {
      origin: ORIGIN,
      clientIp: null,
      path: '/.well-known/oauth-authorization-server',
    });
    expect(req.url).toBe('/.well-known/oauth-authorization-server');
  });
});

describe('invokeNodeHandler', () => {
  it('collects status, headers (multi Set-Cookie) and body from a Node handler', async () => {
    const response = await invokeNodeHandler(
      (req, res) => {
        res.statusCode = 303;
        res.setHeader('Location', '/next');
        res.setHeader('Set-Cookie', ['a=1; Path=/', 'b=2; Path=/']);
        res.end(`method=${req.method}`);
      },
      new Request('https://x.test/go'),
      { origin: ORIGIN, clientIp: null },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/next');
    expect(response.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/']);
    expect(await response.text()).toBe('method=GET');
  });

  it('streams the request body to the handler', async () => {
    const response = await invokeNodeHandler(
      async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(Buffer.from(c));
        res.end(Buffer.concat(chunks).toString());
      },
      new Request('https://x.test/echo', { method: 'POST', body: 'hello' }),
      { origin: ORIGIN, clientIp: null },
    );
    expect(await response.text()).toBe('hello');
  });

  it('waits for an asynchronous end', async () => {
    const response = await invokeNodeHandler(
      (_req, res) => {
        setTimeout(() => res.end('late'), 10);
      },
      new Request('https://x.test/late'),
      { origin: ORIGIN, clientIp: null },
    );
    expect(await response.text()).toBe('late');
  });

  it('returns no body for 204', async () => {
    const response = await invokeNodeHandler(
      (_req, res) => {
        res.statusCode = 204;
        res.end();
      },
      new Request('https://x.test/nc'),
      { origin: ORIGIN, clientIp: null },
    );
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });
});

describe('withNodePair', () => {
  it('returns the function value and whether the response was ended', async () => {
    const out = await withNodePair(new Request('https://x.test/p'), { origin: ORIGIN, clientIp: null }, async (_req, res) => {
      res.setHeader('x-test', '1');
      return 42;
    });
    expect(out.value).toBe(42);
    expect(out.ended).toBe(false);
    expect(out.response.headers.get('x-test')).toBe('1');
  });
});
