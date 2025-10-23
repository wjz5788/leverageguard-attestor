import React, { useMemo } from 'react';
import { Route, normalizePath } from './router';
import { HomePage } from './pages/Home';
import { HelpPage } from './pages/Help';
import { VerifyPage } from './pages/Verify';
import { ClaimPage } from './pages/Claim';
import { ProductsPage } from './pages/Products';
import { ProductDetailPage } from './pages/ProductDetail';
import QuoteDemo from './pages/QuoteDemo';

const routes = [
  Route({ path: '/', element: { id: 'home', label: { zh: '首页', en: 'Home' }, component: HomePage } }),
  Route({ path: '/quote-demo', element: { id: 'quote-demo', label: { zh: '报价演示', en: 'Quote Demo' }, component: QuoteDemo } }),
  Route({ path: '/products', element: { id: 'products', label: { zh: '产品', en: 'Products' }, component: ProductsPage } }),
  Route({ path: '/product/:id', element: { id: 'product-detail', label: { zh: '产品详情', en: 'Product Detail' }, component: ProductDetailPage } }),
  Route({ path: '/verify', element: { id: 'verify', label: { zh: '验证', en: 'Verify' }, component: VerifyPage } }),
  Route({ path: '/claim', element: { id: 'claim', label: { zh: '理赔', en: 'Claim' }, component: ClaimPage } }),
  Route({ path: '/help', element: { id: 'help', label: { zh: '帮助', en: 'Help' }, component: HelpPage } }),
];

function getCurrentPath(): string {
  return normalizePath(window.location.pathname);
}

export default function App() {
  const path = getCurrentPath();
  const route = useMemo(() => {
    return routes.find(r => r.path === path) || routes[0];
  }, [path]);
  
  const Page = route.component;
  
  React.useEffect(() => {
    if (route.init) route.init();
  }, [route]);
  
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-900 border-b border-slate-800">
        <div className="container mx-auto px-4 py-4">
          <nav className="flex space-x-6">
            {routes.map((r) => (
              <a
                key={r.id}
                href={r.path}
                className={`text-sm font-medium transition-colors hover:text-white ${
                  path === r.path ? 'text-white' : 'text-slate-400'
                }`}
              >
                {r.label.zh}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8">
        <Page />
      </main>
      <footer className="bg-slate-900 border-t border-slate-800 py-4">
        <div className="container mx-auto px-4 text-center text-slate-400 text-sm">
          © 2024 LiqPass. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
