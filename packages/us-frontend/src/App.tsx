import React from 'react';
import { HomePage } from './pages/Home';
import { HelpPage } from './pages/Help';
import { VerifyPage } from './pages/Verify';

function getCurrentPath() {
  return window.location.pathname.replace(/\/+/g, '/') || '/';
}

export default function App() {
  const path = getCurrentPath();
  
  // 简单的路由映射
  const pageMap = {
    '/': HomePage,
    '/verify': VerifyPage,
    '/help': HelpPage,
  };
  
  // 获取当前页面组件
  const PageComponent = pageMap[path as keyof typeof pageMap] || HomePage;
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <PageComponent />
    </div>
  );
}
