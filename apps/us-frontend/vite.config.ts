import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react({
    jsxRuntime: 'automatic',
    jsxImportSource: 'react'
  })],
  // 资源基址配置 - 支持通过环境变量配置，默认根路径
  base: process.env.BASE_URL || '/',
  server: {
    port: 3000,
    host: true,
    // 使用Vite默认HMR配置，不移除任何默认设置
    proxy: {
      '/api': {
        target: import.meta.env?.VITE_API_BASE || 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  // 只定义必要的环境变量，避免全局污染
  define: {
    // 仅提供NODE_ENV给需要的库，避免定义全局process.env
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  // 优化依赖预构建
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
})
