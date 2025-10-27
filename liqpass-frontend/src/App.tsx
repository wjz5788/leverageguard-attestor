import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { WalletProvider } from './contexts/WalletContext';
import { ToastProvider } from './contexts/ToastContext';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { Landing } from './pages/Landing';
import { CreateLink } from './pages/CreateLink';
import { Links } from './pages/Links';
import { Payment } from './pages/Payment';
import { Success } from './pages/Success';
import { ProfilePage } from './pages/ProfilePage';
import { ApiSettings } from './pages/ApiSettings';
import { OrdersPage } from './pages/OrdersPage';
import { ProductDemo } from './pages/ProductDemo';
import { Products } from './pages/Products';
import TransparencyPage from './pages/TransparencyPage';
import { Help } from './pages/Help';
import { ClaimsPage } from './pages/ClaimsPage';
import { zh } from './i18n/zh';

function App() {
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  
  const handleDisconnect = () => {
    // 断开连接逻辑，这里可以添加实际的断开连接处理
    console.log('Disconnect requested');
  };

  return (
    <Router>
      <WalletProvider>
        <ToastProvider>
          <div className="min-h-screen bg-[#FFF7ED] flex flex-col">
            <Header lang={lang} setLang={setLang} onDisconnect={handleDisconnect} />
            
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<Landing t={zh} />} />
                <Route path="/links" element={<Links t={zh} />} />
                <Route path="/links/create" element={<CreateLink t={zh} />} />
                <Route path="/pay/:id" element={<Payment t={zh} />} />
                <Route path="/success" element={<Success t={zh} />} />
                <Route path="/profile" element={<ProfilePage t={zh} />} />
                <Route path="/settings/api" element={<ApiSettings t={zh} />} />
                <Route path="/account/orders" element={<OrdersPage t={zh} />} />
        <Route path="/account/claims" element={<ClaimsPage t={zh} />} />
        <Route path="/account/claims/new" element={<ClaimsPage t={zh} />} />
        <Route path="/product/demo" element={<ProductDemo t={zh} />} />
        <Route path="/products" element={<Products t={zh} />} />
        <Route path="/transparency" element={<TransparencyPage />} />
        <Route path="/help" element={<Help t={zh} />} />
              </Routes>
            </main>
            
            <Footer />
          </div>
        </ToastProvider>
      </WalletProvider>
    </Router>
  );
}

export default App;