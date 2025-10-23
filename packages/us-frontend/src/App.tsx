import React, { useMemo } from 'react';
import { Route, normalizePath } from './router';
import { HomePage } from './pages/Home';
import { HelpPage } from './pages/Help';
import { VerifyPage } from './pages/Verify';
import { OrderVerificationPage } from './pages/OrderVerification';
import { ClaimPage } from './pages/Claim';
import { OrderHistoryPage } from './pages/OrderHistory';
import { ProductsPage } from './pages/Products';
import { ProductDetailPage } from './pages/ProductDetail';
import QuoteDemo from './pages/QuoteDemo';
import { PLFlow } from './components/PLFlow';
import Settings from './pages/Settings';
import { WalletConnectNav } from './components/WalletConnectNav';
import { WalletProvider } from './contexts/WalletContext';

const routes: RouteConfig[] = [
  Route({ path: '/', element: { id: 'home', label: { zh: 'Home', en: 'Home' }, component: HomePage } }),
  Route({ path: '/quote-demo', element: { id: 'quote-demo', label: { zh: 'Quote Demo', en: 'Quote Demo' }, component: QuoteDemo } }),
  Route({ path: '/products', element: { id: 'products', label: { zh: 'Products', en: 'Products' }, component: ProductsPage } }),
  Route({ path: '/product/:id', element: { id: 'product-detail', label: { zh: 'Product Detail', en: 'Product Detail' }, component: ProductDetailPage } }),
  Route({ path: '/verify', element: { id: 'verify', label: { zh: 'Verify', en: 'Verify' }, component: VerifyPage } }),
  Route({ path: '/order-verification', element: { id: 'order-verification', label: { zh: 'Order Verification', en: 'Order Verification' }, component: OrderVerificationPage } }),
  Route({ path: '/claim', element: { id: 'claim', label: { zh: 'Claim', en: 'Claim' }, component: ClaimPage } }),
  Route({ path: '/history', element: { id: 'history', label: { zh: 'Order History', en: 'Order History' }, component: OrderHistoryPage } }),
  Route({ path: '/help', element: { id: 'help', label: { zh: 'Help', en: 'Help' }, component: HelpPage } }),
  Route({ path: '/pl-flow', element: { id: 'pl-flow', label: { zh: 'PL Flow', en: 'PL Flow' }, component: PLFlow } }),
  Route({ path: '/settings', element: { id: 'settings', label: { zh: 'Settings', en: 'Settings' }, component: Settings } }),
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
    <WalletProvider>
      <div className="min-h-screen flex flex-col">
        <header className="bg-slate-900 border-b border-slate-800">
          <div className="container mx-auto px-4 py-4">
            <nav className="flex items-center justify-between">
              <div className="flex space-x-6">
                {routes.filter(r => r.id !== 'settings').map((r) => (
                  <a
                    key={r.id}
                    href={r.path}
                    className={`text-sm font-medium transition-colors hover:text-white ${
                      path === r.path ? 'text-white' : 'text-slate-400'
                    }`}
                  >
                    {r.label.en}
                  </a>
                ))}
                <a
                  href="/settings"
                  className={`text-sm font-medium transition-colors hover:text-white ${
                    path === '/settings' ? 'text-white' : 'text-slate-400'
                  }`}
                >
                  Settings
                </a>
              </div>
              <WalletConnectNav />
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
    </WalletProvider>
  );
}
