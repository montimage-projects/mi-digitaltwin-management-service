import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'node_modules/', 'dist/'],
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 50,
        lines: 50,
      },
    },
  },
});
