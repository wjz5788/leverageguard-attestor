import React from 'react';

interface SelectProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  className?: string;
}

export const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  children,
  className = ""
}) => {
  return (
    <select
      value={value}
      onChange={onChange}
      className={`w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent ${className}`}
    >
      {children}
    </select>
  );
};