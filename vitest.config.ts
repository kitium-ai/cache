import baseConfig from '@kitiumai/config/vitest.config.base.js';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', 'dist/**', 'node_modules/**', '**/index.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
