import { execFileSync } from 'node:child_process';

/**
 * The commit this build is made from, for the site footer and the MCP
 * server's version. A `GIT_COMMIT_SHA` env var or Docker build arg wins,
 * since the Docker build has no `.git`; otherwise ask git, quietly, so a
 * build from a downloaded zip still succeeds. Empty when neither knows.
 * `src/lib/build-info.ts` checks it looks like a hash before showing it.
 */
function commitSha() {
  if (process.env.GIT_COMMIT_SHA) return process.env.GIT_COMMIT_SHA.trim();
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Whether this build serves production traffic.
 *
 * `next build` runs with NODE_ENV=production and `next dev` with development,
 * and Next serialises `headers()` into the build output, so this is decided
 * once per build rather than per request.
 */
const isProduction = process.env.NODE_ENV === 'production';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Don't announce the framework in an `X-Powered-By` header on every page.
  poweredByHeader: false,
  // Inline the build's commit. The home page is prerendered, so this has to
  // be decided at build time, not read from the server's env per request.
  env: {
    NEXT_PUBLIC_COMMIT_SHA: commitSha(),
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Turn off the image optimizer. With it on, `/_next/image` is a public
  // endpoint that decodes and resizes images with sharp (libvips) for anyone
  // who asks, and nothing here uses it: the help screenshots are already
  // sized and pass `unoptimized`. Off, Next answers that path with a 404
  // before sharp loads, so a libvips decoder bug has no way in.
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['pg-boss', 'postgres', 'nodemailer', 'pino', 'pino-pretty', 'oidc-provider'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // HSTS, and only from a production build.
          //
          // Sent over plain http — which is exactly what `next dev` serves —
          // it tells the browser to force https on that host for the next two
          // years. A dev server has no TLS to answer with, so the site becomes
          // unreachable in a way reloading never fixes and nothing in the
          // server log explains; clearing it means a trip to
          // chrome://net-internals/#hsts. Chrome exempts `localhost`, which is
          // why this went unnoticed, but any other local hostname — a .local
          // name, a LAN IP, a tunnel — is not exempt.
          //
          // A production build served over plain http still sends it. That
          // combination is an operator's deliberate choice, not a default
          // anyone falls into.
          ...(isProduction
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains',
                },
              ]
            : []),
          // Conservative additions only: object-src/base-uri/frame-ancestors don't
          // touch script or style loading, so this can't break Next.js's own
          // bundling or hydration. frame-ancestors is the modern, iframe-proof
          // successor to X-Frame-Options; object-src/base-uri close off legacy
          // plugin-embed and <base>-tag injection vectors. Not attempting a
          // script-src allowlist here — Next's inline hydration payloads would
          // need per-request nonces threaded through middleware to do that safely.
          {
            key: 'Content-Security-Policy',
            value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
          },
        ],
      },
      // Keep API answers out of every cache. Next gives dynamically rendered
      // pages `no-store` (static and ISR pages get `s-maxage`, so keep
      // participant data off those), but route handlers get no Cache-Control
      // at all, and some carry what no cache should keep:
      // `GET /api/commitments/[id]?token=…` returns a participant's name and
      // email with the edit token in the URL, and the CSV export lists every
      // participant. Without the header a browser's disk cache or a shared
      // proxy may store them.
      //
      // This replaces any Cache-Control a handler under /api sets itself, so
      // a response that should be cached (like the well-known metadata,
      // which sets `public, max-age=300`) has to live outside /api.
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default nextConfig;
