import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
        verify: resolve(__dirname, 'verify/index.html'),
        claim: resolve(__dirname, 'claim/index.html'),
        products: resolve(__dirname, 'products/index.html'),
        product: resolve(__dirname, 'product/index.html'),
      },
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
    proxy: {
      '/catalog': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/orders': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/claim': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/healthz': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
