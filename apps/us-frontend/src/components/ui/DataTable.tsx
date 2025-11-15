import React from 'react';
import { Column } from '../../types';
import { Card } from './Card';

interface DataTableProps<T extends { id: string }> {
  rows: T[];
  columns: Column<T>[];
  actions?: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  actions,
  className = ""
}: DataTableProps<T>) {
  return (
    <Card className={className}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-stone-500">
            <tr>
              {columns.map(col => (
                <th 
                  key={String(col.key)} 
                  style={{ width: col.width }}
                  className="p-2 text-left font-medium"
                >
                  {col.label}
                </th>
              ))}
              {actions && <th className="p-2 text-left font-medium">操作</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-t border-stone-200 hover:bg-stone-50">
                {columns.map(col => (
                  <td key={String(col.key)} className="p-2">
                    {col.render ? col.render(row) : (row as any)[col.key]}
                  </td>
                ))}
                {actions && (
                  <td className="p-2">
                    {actions(row)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}