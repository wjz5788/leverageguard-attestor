import React, { useState, useRef, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useWallet } from '../../contexts/WalletContext';
import { MAIN_NAV, ACCOUNT_MENU_ITEMS } from '../../constants';
import { truncateAddress } from '../../utils';

interface HeaderProps {
  lang: "zh" | "en";
  setLang: (lang: "zh" | "en") => void;
  onDisconnect: () => void;
}

// 点击外部关闭菜单的Hook
function useOnClickOutside(ref: React.RefObject<HTMLElement>, handler: () => void) {
  useEffect(() => {
    function listener(event: MouseEvent) {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler();
    }
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, handler]);
}

// 账户菜单组件
function AccountMenu({ address, onDisconnect }: { address: string; onDisconnect: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useOnClickOutside(ref, () => setIsOpen(false));

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const displayText = address ? truncateAddress(address) : "个人";

  return (
    <div ref={ref} className="relative">
      <button
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs hover:bg-stone-50 transition-colors"
      >
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-600 text-white text-[10px] font-medium">
          {address ? address.slice(2, 4).toUpperCase() : 'ME'}
        </span>
        <span className="text-stone-800">{displayText}</span>
        <svg width="10" height="10" viewBox="0 0 20 20" aria-hidden className="opacity-60">
          <path d="M5 7l5 6 5-6H5z" fill="currentColor" />
        </svg>
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 z-50">
          {/* 上方小三角 */}
          <div aria-hidden className="absolute right-6 -top-2 h-0 w-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-stone-200"></div>
          <div aria-hidden className="absolute right-6 -top-[7px] h-0 w-0 border-l-7 border-r-7 border-b-7 border-transparent border-b-white"></div>
          
          {/* 菜单面板 */}
          <div className="relative rounded-xl border border-stone-200 bg-white p-1 shadow-lg">
            {ACCOUNT_MENU_ITEMS.map(item => (
              <Link
                key={item.label}
                to={item.to}
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-800 hover:bg-stone-50 transition-colors"
              >
                <span>•</span>
                <span>{item.label}</span>
              </Link>
            ))}
            <button
              onClick={() => { onDisconnect(); setIsOpen(false); }}
              className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50 transition-colors"
            >
              退出
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const Header: React.FC<HeaderProps> = ({ lang, setLang, onDisconnect }) => {
  const { address, busy, connectWallet, switchToBase } = useWallet();

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

            {/* 账户菜单 */}
            <AccountMenu address={address} onDisconnect={onDisconnect} />
          </div>
        </div>
      </div>
    </header>
  );
};