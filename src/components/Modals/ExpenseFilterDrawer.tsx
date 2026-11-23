import React from 'react';
import { Calendar, Receipt, Tag, Coins } from 'lucide-react';
import { Language } from '../../utils/i18n';
import {
  IosModalSheet,
  IosNavBar,
  IosInsetGroup,
  IosCheckmarkRow,
  IosToggleRow,
} from '../UI/IosPrimitives';

interface ExpenseFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDateFilter: string;
  onSelectDateFilter: (filter: string) => void;
  selectedCategoryFilter: string;
  onSelectCategoryFilter: (filter: string) => void;
  cashOnly?: boolean;
  onToggleCashOnly?: (next: boolean) => void;
  withReceipt?: boolean;
  onToggleWithReceipt?: (next: boolean) => void;
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
  cashOnly = false,
  onToggleCashOnly,
  withReceipt = false,
  onToggleWithReceipt,
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
  if (!isOpen) return null;

  const isFiltered =
    selectedDateFilter !== 'all' ||
    selectedCategoryFilter !== 'all' ||
    cashOnly ||
    withReceipt;

  return (
    <IosModalSheet
      onClose={onClose}
      maxWidthClass="sm:max-w-lg"
      zIndexClass="z-[75]"
      variant="grouped"
      ariaLabel={lang === 'zh' ? '篩選記帳明細' : 'Filter Expenses'}
    >
      <IosNavBar
        title={lang === 'zh' ? '篩選明細' : 'Filter Expenses'}
        subtitle={lang === 'zh' ? `目前符合 ${filteredCount} 筆` : `${filteredCount} results`}
        leftLabel={isFiltered ? (lang === 'zh' ? '重設' : 'Reset') : (lang === 'zh' ? '關閉' : 'Close')}
        onLeftClick={isFiltered ? onResetAll : onClose}
        rightLabel={lang === 'zh' ? '套用' : 'Done'}
        onRightClick={onClose}
      />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 sm:p-5 space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
        {/* Section 0: Composable Toggle Filters */}
        {(onToggleCashOnly || onToggleWithReceipt) && (
          <IosInsetGroup
            header={lang === 'zh' ? '附加條件（可與日期與類別同時套用）' : 'Additional Conditions'}
          >
            {onToggleCashOnly && (
              <IosToggleRow
                icon={<Coins className="w-4 h-4 text-amber-500" />}
                label={lang === 'zh' ? '僅看現金支付' : 'Cash Only'}
                checked={cashOnly}
                onChange={onToggleCashOnly}
              />
            )}
            {onToggleWithReceipt && (
              <IosToggleRow
                icon={<Receipt className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
                label={lang === 'zh' ? '僅看附發票憑證' : 'With Receipts'}
                checked={withReceipt}
                onChange={onToggleWithReceipt}
              />
            )}
          </IosInsetGroup>
        )}

        {/* Section 1: Date & Period */}
        <IosInsetGroup header={lang === 'zh' ? '日期區間' : 'Date & Period'}>
          <IosCheckmarkRow
            icon={<Calendar className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={lang === 'zh' ? '全部日期' : 'All Dates'}
            selected={selectedDateFilter === 'all'}
            onSelect={() => onSelectDateFilter('all')}
          />
          <IosCheckmarkRow
            icon={<Calendar className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={lang === 'zh' ? '今日花費' : 'Today'}
            trailingMeta={
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                {todayStr.slice(5).replace('-', '/')}
              </span>
            }
            selected={selectedDateFilter === 'today'}
            onSelect={() => onSelectDateFilter('today')}
          />
          {hasPreTripExpenses && (
            <IosCheckmarkRow
              icon={<Calendar className="w-4 h-4 text-slate-500" />}
              label={lang === 'zh' ? '行前準備花費' : 'Pre-trip'}
              selected={selectedDateFilter === 'pre'}
              onSelect={() => onSelectDateFilter('pre')}
            />
          )}
          {!onToggleCashOnly && (
            <IosCheckmarkRow
              icon={<Coins className="w-4 h-4 text-amber-500" />}
              label={lang === 'zh' ? '僅看現金支付' : 'Cash Only'}
              selected={selectedDateFilter === 'cash_only'}
              onSelect={() => onSelectDateFilter('cash_only')}
            />
          )}
          {tripDays.map((d) => (
            <IosCheckmarkRow
              key={d.id}
              label={`Day ${d.dayNumber}`}
              trailingMeta={
                <span className="text-[11px] font-mono tabular-nums text-slate-400">
                  {d.date.slice(5).replace('-', '/')}
                </span>
              }
              selected={selectedDateFilter === d.date}
              onSelect={() => onSelectDateFilter(d.date)}
            />
          ))}
        </IosInsetGroup>

        {/* Section 2: Categories */}
        <IosInsetGroup header={lang === 'zh' ? '支出類別' : 'Category'}>
          <IosCheckmarkRow
            icon={<Tag className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={lang === 'zh' ? '全部分類' : 'All Categories'}
            selected={selectedCategoryFilter === 'all'}
            onSelect={() => onSelectCategoryFilter('all')}
          />
          {!onToggleWithReceipt && (
            <IosCheckmarkRow
              icon={<Receipt className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
              label={lang === 'zh' ? '僅看附發票憑證' : 'With Receipts'}
              selected={selectedCategoryFilter === 'with_receipt'}
              onSelect={() => onSelectCategoryFilter('with_receipt')}
            />
          )}
          {Object.entries(defaultCategories).map(([catKey, meta]) => (
            <IosCheckmarkRow
              key={catKey}
              icon={<meta.Icon className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
              label={meta.label}
              selected={selectedCategoryFilter === catKey}
              onSelect={() => onSelectCategoryFilter(catKey)}
            />
          ))}
          {customCategories.map((catKey) => {
            const label = customCategoryLabels[catKey] || catKey;
            return (
              <IosCheckmarkRow
                key={catKey}
                icon={<Tag className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
                label={label}
                selected={selectedCategoryFilter === catKey}
                onSelect={() => onSelectCategoryFilter(catKey)}
              />
            );
          })}
        </IosInsetGroup>
      </div>
    </IosModalSheet>
  );
};
