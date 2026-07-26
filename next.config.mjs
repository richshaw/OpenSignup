/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Inline package.json version into the client bundle. `npm_package_version`
  // is only set when the process is started via pnpm/npm scripts, so reading
  // it at runtime from `node server.js` (as the Docker image does) returns
  // undefined. Wiring it through `env` resolves it at build time instead.
  // Fall back to '0.0.0' so a bare `next build` invocation doesn't inline the
  // literal string 'undefined' (which Next.js does for undefined env values).
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? '0.0.0',
  },
  experimental: {
    typedRoutes: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  serverExternalPackages: ['pg-boss', 'postgres', 'nodemailer', 'pino', 'pino-pretty'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
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
    ];
  },
};

export default nextConfig;
