import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.db.test.ts'],
    exclude: ['node_modules', '.next'],
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
