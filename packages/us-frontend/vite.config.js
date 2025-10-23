import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/catalog': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/orders': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/claim': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      '/healthz': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
