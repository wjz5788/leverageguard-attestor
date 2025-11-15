import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface WalletMenuProps {
  address?: string;
  onLogout?: () => void;
}

const shortenAddress = (addr?: string) => {
  if (!addr) return '未连接钱包';
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

export const WalletMenu: React.FC<WalletMenuProps> = ({ address, onLogout }) => {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const navigate = useNavigate();

  const badgeText = useMemo(() => shortenAddress(address), [address]);

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next && typeof window !== 'undefined' && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setMenuPos({
          top: rect.bottom + 8, // 下移一点
          right: window.innerWidth - rect.right, // 右对齐钱包按钮
        });
      }
      return next;
    });
  };

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const logout = () => {
    setOpen(false);
    onLogout?.();
  };

  const itemBase: React.CSSProperties = {
    width: '100%',
    padding: '8px 14px',
    fontSize: 14,
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: '#111827',
  };

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {/* 钱包 chip 按钮 */}
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderRadius: 999,
          border: '1px solid #e5e7eb',
          background: '#fff7ed',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '999px',
            background: '#fb923c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 600,
            color: '#fff',
          }}
        >
          {address ? (address.slice(2, 4) + address.slice(4, 5)).toUpperCase() : '??'}
        </div>
        <span style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>
          {badgeText}
        </span>
        <span style={{ fontSize: 10, color: '#6b7280' }}>▾</span>
      </button>

      {/* 下拉菜单：用 fixed 悬浮在整个页面之上，不再受下面那条“刷新”横条影响 */}
      {open && menuPos && (
        <div
          style={{
            position: 'fixed',
            top: menuPos.top,
            right: menuPos.right,
            minWidth: 180,
            padding: '6px 0',
            borderRadius: 16,
            background: '#ffffff',
            boxShadow: '0 18px 45px rgba(15,23,42,0.18)',
            border: '1px solid #f3f4f6',
            zIndex: 999999, // 顶层
          }}
        >
          <button
            type="button"
            style={itemBase}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => go('/orders')}
          >
            订单管理
          </button>
          <button
            type="button"
            style={itemBase}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => go('/claims')}
          >
            赔付管理
          </button>
          <button
            type="button"
            style={itemBase}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => go('/api-settings')}
          >
            API 设置
          </button>

          <div
            style={{
              height: 1,
              margin: '6px 0',
              background: '#f3f4f6',
            }}
          />

          <button
            type="button"
            style={{ ...itemBase, color: '#b91c1c' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#fef2f2')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={logout}
          >
            退出
          </button>
        </div>
      )}
    </div>
  );
};

