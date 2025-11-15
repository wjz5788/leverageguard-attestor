import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useWallet } from '../../contexts/WalletContext';
import { MAIN_NAV } from '../../constants';
import { WalletMenu } from '../WalletMenu';

interface HeaderProps {
  lang: "zh" | "en";
  setLang: (lang: "zh" | "en") => void;
}

 

export const Header: React.FC<HeaderProps> = ({ lang, setLang }) => {
  const { address, busy, connectWallet, switchToBase, disconnectWallet } = useWallet();

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-[#FFF7ED]/70 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link 
            to="/" 
            aria-label="返回首页" 
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="h-6 w-6 rounded bg-amber-600" />
            <span className="text-lg font-semibold text-stone-900">LiqPass</span>
          </Link>

          {/* 主导航 */}
          <nav className="hidden items-center gap-2 text-sm md:flex">
            {MAIN_NAV.map(item => (
              item.to === '/verify' ? (
                <button
                  key={item.to}
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="px-3 py-1 rounded-xl border border-stone-300 transition-colors text-stone-400 cursor-not-allowed opacity-60"
                >
                  {item.label}
                </button>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `px-3 py-1 rounded-xl border border-stone-300 transition-colors ${
                      isActive 
                        ? 'bg-white text-stone-900 shadow-sm' 
                        : 'text-stone-600 hover:text-stone-900 hover:bg-white/60'
                    }`
                  }
                  end
                >
                  {item.label}
                </NavLink>
              )
            ))}
          </nav>

          {/* 右侧操作区 */}
          <div className="flex items-center gap-2">
            {/* 语言切换 */}
            <button
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-700 hover:bg-stone-50 transition-colors"
              aria-label="切换语言"
            >
              {lang === 'zh' ? 'EN' : '中文'}
            </button>

            {/* 钱包连接/网络切换 */}
            <button
              onClick={address ? () => switchToBase(false) : connectWallet}
              disabled={busy}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                address 
                  ? "bg-white border border-stone-300 text-stone-900 hover:bg-stone-50" 
                  : "bg-amber-600 text-white hover:bg-amber-500"
              } ${busy ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {address ? "切到 Base" : "连接钱包"}
            </button>

            <WalletMenu address={address} onLogout={() => disconnectWallet?.()} />
          </div>
        </div>
      </div>
    </header>
  );
};
