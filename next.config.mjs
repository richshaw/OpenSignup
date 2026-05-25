/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Inline package.json version into the client bundle. `npm_package_version`
  // is only set when the process is started via pnpm/npm scripts, so reading
  // it at runtime from `node server.js` (as the Docker image does) returns
  // undefined. Wiring it through `env` resolves it at build time instead.
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version,
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
        ],
      },
    ];
  },
};

export default nextConfig;
