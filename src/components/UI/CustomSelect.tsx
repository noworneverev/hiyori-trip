import React from 'react';
import { ChevronDown } from 'lucide-react';

interface Option {
  value: string | number;
  label: string;
}

interface CustomSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: Option[];
  label?: string;
  icon?: React.ReactNode;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  options,
  label,
  icon,
  className = '',
  ...props
}) => {
  return (
    <div className="space-y-1 w-full">
      {label && (
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          {icon}
          <span>{label}</span>
        </label>
      )}
      <div className="relative flex items-center">
        <select
          {...props}
          className={`w-full appearance-none rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/70 hover:bg-white dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 pr-9 pl-3.5 py-2.5 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-teal-500/25 focus:border-teal-500 transition cursor-pointer ${className}`}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 py-1">
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none transition" />
      </div>
    </div>
  );
};
