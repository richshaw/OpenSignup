import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

export default defineConfig({
  // The unit config gets the automatic JSX runtime from @vitejs/plugin-react;
  // this one has no plugins, so without this any test that reaches an email
  // template fails with `React is not defined` — tsconfig.json sets
  // `jsx: "preserve"` for Next.js, under which esbuild emits classic
  // React.createElement calls. Same root cause as tsconfig.worker.json.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['src/**/*.db.test.ts'],
    exclude: ['node_modules', '.next'],
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    // Bundled rather than loaded by Node, which cannot resolve its bare
    // `next/server` import, and so that a test's vi.mock('next/headers')
    // reaches it. Lets query-budget.db.test.ts count a real session read.
    server: { deps: { inline: ['next-auth'] } },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
