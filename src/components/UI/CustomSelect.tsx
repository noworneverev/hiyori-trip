import React, { useId } from 'react';
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
  id,
  ...props
}) => {
  const autoId = useId();
  const selectId = id || autoId;

  return (
    <div className="space-y-1.5 w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
        >
          {icon}
          <span>{label}</span>
        </label>
      )}
      <div className="relative flex items-center">
        <select
          id={selectId}
          {...props}
          className={`w-full min-h-[44px] appearance-none rounded-2xl border border-[#E5E2DC] dark:border-slate-700/80 bg-[#FAF9F6] dark:bg-[#111827] hover:bg-white dark:hover:bg-slate-800/80 text-sm sm:text-xs font-semibold text-slate-900 dark:text-slate-100 pr-9 pl-3.5 py-2.5 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-teal-500/25 focus:border-teal-500 transition cursor-pointer ${className}`}
        >
          {options.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              className="bg-white dark:bg-[#111827] text-slate-900 dark:text-slate-100 py-1"
            >
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none transition" />
      </div>
    </div>
  );
};
