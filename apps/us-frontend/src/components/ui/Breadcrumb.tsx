import React from 'react';
import { Link } from 'react-router-dom';
import { BreadcrumbItem } from '../../types';

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items }) => {
  return (
    <nav className="mx-auto max-w-7xl px-4 pt-6 text-xs text-stone-600" aria-label="Breadcrumb">
      <ol className="flex gap-2">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-2">
            {item.to ? (
              <Link 
                to={item.to} 
                className="hover:underline transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span>{item.label}</span>
            )}
            {index < items.length - 1 && <span>/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
};