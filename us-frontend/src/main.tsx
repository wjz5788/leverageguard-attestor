import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import installAuthFetch from './lib/authFetch'

// 安装全局 Authorization 拦截器（未登录阻断 + 统一注入）
installAuthFetch()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
