import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(<App />);
  } else {
    console.error('Failed to find the root element');
  }
});