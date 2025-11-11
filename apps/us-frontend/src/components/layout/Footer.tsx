import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-stone-200 bg-[#FFF7ED]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex items-center justify-between text-sm text-stone-500">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-amber-600" />
            <span className="font-semibold text-stone-900">LiqPass</span>
          </div>
          
          <div className="flex gap-4">
            <Link 
              to="/docs" 
              className="hover:text-stone-900 transition-colors"
            >
              Docs
            </Link>
            <Link 
              to="/legal" 
              className="hover:text-stone-900 transition-colors"
            >
              Legal
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};