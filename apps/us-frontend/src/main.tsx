import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import installAuthFetch from './lib/authFetch'

// 安装全局 Authorization 拦截器（未登录阻断 + 统一注入）
installAuthFetch()

// 可选：通过 ?force01 开启 0.01 USDC 强制支付调试拦截
try {
  const qs = new URLSearchParams(location.search);
  if (qs.has('force01')) {
    // 动态引入，避免默认影响生产
    await import('./debug/fetchForcePremium');
    console.warn('[debug] fetchForcePremium enabled: premium forced to 0.01 USDC');
  }
} catch {}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
