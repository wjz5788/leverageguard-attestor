import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ToastItem } from '../types.ts';
import { generateId } from '../utils.ts';

interface ToastContextType {
  push: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextType>({ push: () => {} });

export const useToast = () => useContext(ToastContext);

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = generateId();
    setToasts(current => [...current, { id, ...toast }]);
    
    // 自动移除Toast
    setTimeout(() => {
      setToasts(current => current.filter(t => t.id !== id));
    }, 2800);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      {/* Toast容器 */}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] mx-auto flex w-full max-w-md flex-col gap-2 px-4">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-lg border border-stone-200 bg-white p-3 shadow-sm animate-in fade-in-0 slide-in-from-top-2 duration-300`}
          >
            <div className="text-sm font-medium text-stone-900">{toast.title}</div>
            {toast.desc && (
              <div className="text-xs text-stone-600 mt-1">{toast.desc}</div>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};