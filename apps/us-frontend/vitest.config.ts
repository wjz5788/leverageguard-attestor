import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

const srcPath = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': srcPath
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/unit/setup.ts'],
    include: [
      'tests/unit/**/*.test.{ts,tsx}',
      'src/**/*.spec.{ts,tsx}'
    ],
    exclude: [
      'tests/e2e/**',
      'node_modules',
      'dist'
    ]
  }
});
