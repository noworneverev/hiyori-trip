import React, { useEffect } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { X, Calendar, Filter, Receipt, RotateCcw, Check, Tag, Coins } from 'lucide-react';
import { Language } from '../../utils/i18n';

interface ExpenseFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDateFilter: string;
  onSelectDateFilter: (filter: string) => void;
  selectedCategoryFilter: string;
  onSelectCategoryFilter: (filter: string) => void;
  defaultCategories: Record<string, { label: string; Icon: React.ComponentType<{ className?: string }>; color?: string; bg?: string }>;
  customCategories: string[];
  customCategoryLabels?: Record<string, string>;
  tripDays: Array<{ id: string; dayNumber: number; date: string }>;
  todayStr: string;
  hasPreTripExpenses: boolean;
  filteredCount: number;
  onResetAll: () => void;
  lang: Language;
}

export const ExpenseFilterDrawer: React.FC<ExpenseFilterDrawerProps> = ({
  isOpen,
  onClose,
  selectedDateFilter,
  onSelectDateFilter,
  selectedCategoryFilter,
  onSelectCategoryFilter,
  defaultCategories,
  customCategories,
  customCategoryLabels = {},
  tripDays,
  todayStr,
  hasPreTripExpenses,
  filteredCount,
  onResetAll,
  lang,
}) => {
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isFiltered = selectedDateFilter !== 'all' || selectedCategoryFilter !== 'all';

  return (
    <div
      className="fixed inset-0 z-60 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-t-[2rem] sm:rounded-3xl shadow-2xl border-t sm:border border-slate-200/90 dark:border-slate-800/90 overflow-hidden flex flex-col max-h-[88vh] sm:max-h-[82vh] animate-in slide-in-from-bottom duration-300 ease-out"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Pull Handle Bar */}
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 shrink-0 sm:hidden" />

        {/* Drawer Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 flex items-center justify-center">
              <Filter className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                {lang === 'zh' ? '篩選記帳明細' : 'Filter Expenses'}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isFiltered && (
              <button
                type="button"
                onClick={onResetAll}
                className="px-2.5 py-1.5 text-xs font-bold text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/60 rounded-lg transition flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{lang === 'zh' ? '重設' : 'Reset'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              aria-label="關閉"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Filter Sections */}
        <div className="p-5 overflow-y-auto space-y-5 scrollbar-thin">
          {/* Section 1: 日期與時段 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>{lang === 'zh' ? '日期與時段' : 'Date / Period'}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {/* 全部日期 */}
              <button
                type="button"
                onClick={() => onSelectDateFilter('all')}
                className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition flex items-center justify-between active:scale-98 ${
                  selectedDateFilter === 'all'
                    ? 'border-teal-500/80 bg-teal-50/90 dark:bg-teal-950/70 text-teal-900 dark:text-teal-300 shadow-2xs font-bold ring-1 ring-teal-500/30'
                    : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200'
                }`}
              >
                <span>{lang === 'zh' ? '全部日期' : 'All Dates'}</span>
                {selectedDateFilter === 'all' && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
              </button>

              {/* 今日 */}
              <button
                type="button"
                onClick={() => onSelectDateFilter('today')}
                className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition flex items-center justify-between active:scale-98 ${
                  selectedDateFilter === 'today'
                    ? 'border-teal-500/80 bg-teal-50/90 dark:bg-teal-950/70 text-teal-900 dark:text-teal-300 shadow-2xs font-bold ring-1 ring-teal-500/30'
                    : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200'
                }`}
              >
                <div className="min-w-0">
                  <span className="block truncate">{lang === 'zh' ? '今日' : 'Today'}</span>
                  <span className="text-[10px] text-slate-400 font-mono block truncate">{todayStr.slice(5).replace('-', '/')}</span>
                </div>
                {selectedDateFilter === 'today' && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
              </button>

              {/* 行前準備 (if exists) */}
              {hasPreTripExpenses && (
                <button
                  type="button"
                  onClick={() => onSelectDateFilter('pre')}
                  className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition flex items-center justify-between active:scale-98 ${
                    selectedDateFilter === 'pre'
                      ? 'border-teal-500/80 bg-teal-50/90 dark:bg-teal-950/70 text-teal-900 dark:text-teal-300 shadow-2xs font-bold ring-1 ring-teal-500/30'
                      : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span>{lang === 'zh' ? '行前準備' : 'Pre-trip'}</span>
                  {selectedDateFilter === 'pre' && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
                </button>
              )}

              {/* 各行程天數 */}
              {tripDays.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onSelectDateFilter(d.date)}
                  className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition flex items-center justify-between active:scale-98 ${
                    selectedDateFilter === d.date
                      ? 'border-teal-500/80 bg-teal-50/90 dark:bg-teal-950/70 text-teal-900 dark:text-teal-300 shadow-2xs font-bold ring-1 ring-teal-500/30'
                      : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div className="min-w-0">
                    <span className="block truncate">Day {d.dayNumber}</span>
                    <span className="text-[10px] text-slate-400 font-mono block truncate">{d.date.slice(5).replace('-', '/')}</span>
                  </div>
                  {selectedDateFilter === d.date && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
                </button>
              ))}

              {/* 僅看現金 */}
              <button
                type="button"
                onClick={() => onSelectDateFilter('cash_only')}
                className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition flex items-center justify-between active:scale-98 ${
                  selectedDateFilter === 'cash_only'
                    ? 'border-teal-500/80 bg-teal-50/90 dark:bg-teal-950/70 text-teal-900 dark:text-teal-300 shadow-2xs font-bold ring-1 ring-teal-500/30'
                    : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Coins className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="truncate">{lang === 'zh' ? '僅看現金' : 'Cash Only'}</span>
                </div>
                {selectedDateFilter === 'cash_only' && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
              </button>
            </div>
          </div>

          {/* Section 2: 支出類別 */}
          <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
              <Tag className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>{lang === 'zh' ? '支出類別' : 'Category'}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {/* 全部分類 */}
              <button
                type="button"
                onClick={() => onSelectCategoryFilter('all')}
                className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition flex items-center justify-between active:scale-98 ${
                  selectedCategoryFilter === 'all'
                    ? 'border-teal-500/80 bg-teal-50/90 dark:bg-teal-950/70 text-teal-900 dark:text-teal-300 shadow-2xs font-bold ring-1 ring-teal-500/30'
                    : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200'
                }`}
              >
                <span>{lang === 'zh' ? '全部分類' : 'All Categories'}</span>
                {selectedCategoryFilter === 'all' && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
              </button>

              {/* 附發票 */}
              <button
                type="button"
                onClick={() => onSelectCategoryFilter('with_receipt')}
                className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition flex items-center justify-between active:scale-98 ${
                  selectedCategoryFilter === 'with_receipt'
                    ? 'border-teal-500/80 bg-teal-50/90 dark:bg-teal-950/70 text-teal-900 dark:text-teal-300 shadow-2xs font-bold ring-1 ring-teal-500/30'
                    : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Receipt className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span className="truncate">{lang === 'zh' ? '附發票憑證' : 'With Receipts'}</span>
                </div>
                {selectedCategoryFilter === 'with_receipt' && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
              </button>

              {/* 預設分類 */}
              {Object.entries(defaultCategories).map(([catKey, meta]) => (
                <button
                  key={catKey}
                  type="button"
                  onClick={() => onSelectCategoryFilter(catKey)}
                  className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition flex items-center justify-between active:scale-98 ${
                    selectedCategoryFilter === catKey
                      ? 'border-teal-500/80 bg-teal-50/90 dark:bg-teal-950/70 text-teal-900 dark:text-teal-300 shadow-2xs font-bold ring-1 ring-teal-500/30'
                      : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <meta.Icon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">{meta.label}</span>
                  </div>
                  {selectedCategoryFilter === catKey && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
                </button>
              ))}

              {/* 自訂分類 */}
              {customCategories.map((catKey) => {
                const label = customCategoryLabels[catKey] || catKey;
                return (
                  <button
                    key={catKey}
                    type="button"
                    onClick={() => onSelectCategoryFilter(catKey)}
                    className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition flex items-center justify-between active:scale-98 ${
                      selectedCategoryFilter === catKey
                        ? 'border-teal-500/80 bg-teal-50/90 dark:bg-teal-950/70 text-teal-900 dark:text-teal-300 shadow-2xs font-bold ring-1 ring-teal-500/30'
                        : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/90 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Tag className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span className="truncate">{label}</span>
                    </div>
                    {selectedCategoryFilter === catKey && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Action Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-teal-600/20 transition"
          >
            <Check className="w-4 h-4" />
            <span>{lang === 'zh' ? `套用篩選 (查看 ${filteredCount} 筆)` : `Apply Filter (${filteredCount} Results)`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
