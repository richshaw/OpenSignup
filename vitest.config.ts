import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/*.e2e.test.ts', 'src/**/*.db.test.ts', 'node_modules', '.next'],
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    // Deterministic placeholders so any test importing `@/lib/site-config`
    // doesn't blow up at module load on its fail-loud Zod check. Tests of the
    // schema itself call `parseSiteConfig` directly with their own inputs.
    env: {
      NEXT_PUBLIC_INSTANCE_NAME: 'OpenSignup (test)',
      NEXT_PUBLIC_SUPPORT_EMAIL: 'test@signup.local',
      NEXT_PUBLIC_SOURCE_URL: 'https://github.com/richshaw/OpenSignup',
      NEXT_PUBLIC_GOVERNING_LAW: 'the State of Washington, United States',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
