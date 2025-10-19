import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@runtime': resolve(__dirname, 'src/runtime'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        help: resolve(__dirname, 'help/index.html'),
      },
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
});
