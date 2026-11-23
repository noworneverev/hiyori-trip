import React, { useMemo, useState, useEffect } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RotateCcw } from 'lucide-react';
import { DayPlan, ExpenseItem, Trip } from '../../types/itinerary';
import { convertAmount, CURRENCY_MAP, formatCurrencyAmount } from '../../utils/currency';
import { Language } from '../../utils/i18n';

interface ExpenseCalendarBarProps {
  trip: Trip;
  baseCurrency: string;
  selectedDateFilter: string;
  onSelectDateFilter: (filter: string) => void;
  todayStr: string;
  lang: Language;
  hasPreTripExpenses: boolean;
  ratesVersion?: number;
}

const WEEKDAY_HEADERS = ['日', '一', '二', '三', '四', '五', '六'];

function parseYearMonth(dateStr: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})/.exec(dateStr || '');
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]) - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatShortCalendarTotal(amount: number, currency: string): string {
  const sym = CURRENCY_MAP[currency]?.symbol || '';
  const rounded = Math.round(amount);
  if (rounded >= 100000) {
    return `${sym}${(rounded / 10000).toFixed(1)}萬`;
  }
  if (rounded >= 10000) {
    return `${sym}${(rounded / 1000).toFixed(1)}k`;
  }
  return `${sym}${rounded.toLocaleString()}`;
}

export const ExpenseCalendarBar: React.FC<ExpenseCalendarBarProps> = ({
  trip,
  baseCurrency,
  selectedDateFilter,
  onSelectDateFilter,
  todayStr,
  lang,
  hasPreTripExpenses,
  ratesVersion,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const initialAnchorDate = useMemo(() => {
    if (/^\d{4}-\d{2}-\d{2}/.test(selectedDateFilter)) {
      return selectedDateFilter.slice(0, 10);
    }
    if (selectedDateFilter === 'today') return todayStr;
    if (trip.startDate && /^\d{4}-\d{2}-\d{2}/.test(trip.startDate)) {
      return trip.startDate.slice(0, 10);
    }
    const firstDatedExpense = trip.expenses.find((e) => /^\d{4}-\d{2}-\d{2}/.test(e.date || ''));
    if (firstDatedExpense?.date) return firstDatedExpense.date.slice(0, 10);
    return todayStr;
  }, [trip.id, trip.startDate]);

  const [viewMonth, setViewMonth] = useState<{ year: number; month: number }>(() =>
    parseYearMonth(initialAnchorDate)
  );

  // Reset displayed month whenever switching trips
  useEffect(() => {
    setViewMonth(parseYearMonth(initialAnchorDate));
  }, [trip.id, initialAnchorDate]);

  // Sync viewed calendar month if user jumps to a specific date externally (e.g. from chart or filter drawer)
  useEffect(() => {
    if (/^\d{4}-\d{2}-\d{2}/.test(selectedDateFilter)) {
      setViewMonth(parseYearMonth(selectedDateFilter));
    } else if (selectedDateFilter === 'today') {
      setViewMonth(parseYearMonth(todayStr));
    }
  }, [selectedDateFilter, todayStr]);

  // Aggregate daily totals & counts across all expenses in baseCurrency
  const dailySummaryMap = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    (trip.expenses || []).forEach((item: ExpenseItem) => {
      const d = (item.date || '').slice(0, 10).replace(/\//g, '-');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      const converted = convertAmount(item.amount, item.currency, baseCurrency, trip.customExchangeRates);
      if (!map[d]) {
        map[d] = { total: 0, count: 0 };
      }
      map[d].total += converted;
      map[d].count += 1;
    });
    return map;
  }, [trip.expenses, baseCurrency, trip.customExchangeRates, ratesVersion]);

  // Map trip days by date for quick Day N badge lookup
  const tripDayByDate = useMemo(() => {
    const map: Record<string, DayPlan> = {};
    (trip.days || []).forEach((d) => {
      const key = (d.date || '').slice(0, 10);
      if (key) map[key] = d;
    });
    return map;
  }, [trip.days]);

  // Normalize currently selected YYYY-MM-DD if applicable
  const activeExactDate = useMemo(() => {
    if (selectedDateFilter === 'today') return todayStr;
    if (/^\d{4}-\d{2}-\d{2}/.test(selectedDateFilter)) return selectedDateFilter.slice(0, 10);
    return null;
  }, [selectedDateFilter, todayStr]);

  // Build calendar grid cells for viewMonth
  const calendarCells = useMemo(() => {
    const { year, month } = viewMonth;
    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{
      key: string;
      dateStr: string | null;
      dayNum: number | null;
    }> = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ key: `pad-start-${i}`, dateStr: null, dayNum: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      cells.push({ key: dateStr, dateStr, dayNum: d });
    }
    const rem = cells.length % 7;
    if (rem > 0) {
      for (let i = 0; i < 7 - rem; i++) {
        cells.push({ key: `pad-end-${i}`, dateStr: null, dayNum: null });
      }
    }
    return cells;
  }, [viewMonth]);

  const handlePrevMonth = () => {
    setViewMonth((prev) =>
      prev.month === 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: prev.month - 1 }
    );
  };

  const handleNextMonth = () => {
    setViewMonth((prev) =>
      prev.month === 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: prev.month + 1 }
    );
  };

  const handleStepDay = (delta: number) => {
    if (!activeExactDate) {
      // Stepping from "All Dates": jump cleanly to Trip Day 1 (or last day when stepping backward)
      const firstTripDate = (trip.startDate || '').slice(0, 10);
      const lastTripDate = (trip.endDate || '').slice(0, 10);
      const datedExpenses = (trip.expenses || [])
        .map((e) => (e.date || '').slice(0, 10).replace(/\//g, '-'))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort();
      const target =
        delta > 0
          ? firstTripDate || datedExpenses[0] || todayStr
          : lastTripDate || datedExpenses[datedExpenses.length - 1] || todayStr;
      onSelectDateFilter(target);
      return;
    }
    const parsed = new Date(`${activeExactDate}T00:00:00`);
    if (isNaN(parsed.getTime())) return;
    parsed.setDate(parsed.getDate() + delta);
    const nextStr = `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
    onSelectDateFilter(nextStr);
  };

  // Summary bar label & amount
  const activeSummaryInfo = useMemo(() => {
    if (selectedDateFilter === 'all') {
      return {
        label: lang === 'zh' ? '全部日期' : 'All Dates',
        subLabel: `${trip.expenses.length} 筆明細`,
        amount: null as number | null,
      };
    }
    if (selectedDateFilter === 'pre') {
      return {
        label: lang === 'zh' ? '行前準備' : 'Pre-trip',
        subLabel: '出發前支出',
        amount: null,
      };
    }
    if (selectedDateFilter === 'cash_only') {
      return {
        label: lang === 'zh' ? '僅看現金支付' : 'Cash Only',
        subLabel: '現金消費',
        amount: null,
      };
    }
    if (activeExactDate) {
      const dateObj = new Date(`${activeExactDate}T00:00:00`);
      const wd = !isNaN(dateObj.getTime()) ? WEEKDAY_HEADERS[dateObj.getDay()] : '';
      const matchedDay = tripDayByDate[activeExactDate];
      const dayTag = matchedDay ? `Day ${matchedDay.dayNumber}` : activeExactDate === todayStr ? '今天' : '';
      const stat = dailySummaryMap[activeExactDate];
      return {
        label: `${activeExactDate.replace(/-/g, '/')} (週${wd})`,
        subLabel: [dayTag, stat ? `${stat.count} 筆` : '尚無消費'].filter(Boolean).join(' · '),
        amount: stat ? stat.total : 0,
      };
    }
    return {
      label: selectedDateFilter,
      subLabel: '',
      amount: null,
    };
  }, [selectedDateFilter, activeExactDate, trip.expenses.length, tripDayByDate, dailySummaryMap, todayStr, lang]);

  const tripStart = (trip.startDate || '').slice(0, 10);
  const tripEnd = (trip.endDate || '').slice(0, 10);

  return (
    <div className="rounded-2xl bg-[#FAF9F6] dark:bg-slate-900/60 border border-[#E5E2DC] dark:border-slate-800 overflow-hidden">
      {/* Compact Collapsible Summary Bar */}
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700 hover:border-teal-600/60 text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-2xs"
            aria-expanded={isExpanded}
            title={isExpanded ? '收合月曆' : '展開月曆選擇日期'}
          >
            <Calendar className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
            <span>{isExpanded ? '收合月曆' : '日曆切換'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                {activeSummaryInfo.label}
              </span>
              {activeSummaryInfo.subLabel && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  · {activeSummaryInfo.subLabel}
                </span>
              )}
              {activeSummaryInfo.amount !== null && (
                <span className="text-[11px] font-bold font-mono tabular-nums text-teal-700 dark:text-teal-300">
                  · {formatCurrencyAmount(activeSummaryInfo.amount, baseCurrency)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Controls: Prev/Next Day + View All */}
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <button
            type="button"
            onClick={() => handleStepDay(-1)}
            className="min-w-[36px] min-h-[36px] rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition cursor-pointer"
            title="前一天"
            aria-label="前一天"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleStepDay(1)}
            className="min-w-[36px] min-h-[36px] rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition cursor-pointer"
            title="後一天"
            aria-label="後一天"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {selectedDateFilter !== 'all' && (
            <button
              type="button"
              onClick={() => onSelectDateFilter('all')}
              className="min-h-[36px] px-2.5 py-1 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1 transition cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>看全部</span>
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Month Calendar Grid */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-2 border-t border-[#E5E2DC]/80 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-2.5 animate-in fade-in duration-150">
          {/* Month Header Controls */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="min-w-[36px] min-h-[36px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center transition cursor-pointer"
                aria-label="上個月"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold text-sm text-slate-900 dark:text-white font-mono tabular-nums px-1">
                {viewMonth.year} 年 {viewMonth.month + 1} 月
              </span>
              <button
                type="button"
                onClick={handleNextMonth}
                className="min-w-[36px] min-h-[36px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center transition cursor-pointer"
                aria-label="下個月"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[11px]">
              {tripStart && (
                <button
                  type="button"
                  onClick={() => setViewMonth(parseYearMonth(tripStart))}
                  className="px-2 py-1 rounded-lg border border-[#E5E2DC] dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-[#FAF9F6] dark:hover:bg-slate-800 font-semibold transition cursor-pointer"
                >
                  行程月份
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setViewMonth(parseYearMonth(todayStr));
                  onSelectDateFilter(todayStr);
                }}
                className="px-2 py-1 rounded-lg border border-[#E5E2DC] dark:border-slate-700 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/50 font-semibold transition cursor-pointer"
              >
                今天
              </button>
              {hasPreTripExpenses && (
                <button
                  type="button"
                  onClick={() => onSelectDateFilter(selectedDateFilter === 'pre' ? 'all' : 'pre')}
                  className={`px-2 py-1 rounded-lg border font-semibold transition cursor-pointer ${
                    selectedDateFilter === 'pre'
                      ? 'bg-teal-700 border-teal-700 text-white'
                      : 'border-[#E5E2DC] dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-[#FAF9F6] dark:hover:bg-slate-800'
                  }`}
                >
                  行前
                </button>
              )}
            </div>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400 dark:text-slate-500">
            {WEEKDAY_HEADERS.map((wd) => (
              <div key={wd} className="py-1">
                {wd}
              </div>
            ))}
          </div>

          {/* 7-Column Month Cells */}
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell) => {
              if (!cell.dateStr || cell.dayNum === null) {
                return <div key={cell.key} className="min-h-[46px]" />;
              }

              const dateStr = cell.dateStr;
              const stat = dailySummaryMap[dateStr];
              const isSelected = activeExactDate === dateStr;
              const isToday = dateStr === todayStr;
              const isInTrip = Boolean(tripStart && tripEnd && dateStr >= tripStart && dateStr <= tripEnd);
              const matchedDay = tripDayByDate[dateStr];

              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => onSelectDateFilter(isSelected ? 'all' : dateStr)}
                  title={
                    stat
                      ? `${dateStr} · ${stat.count} 筆 · ${formatCurrencyAmount(stat.total, baseCurrency)}`
                      : dateStr
                  }
                  className={`min-h-[48px] sm:min-h-[54px] px-0.5 py-1 rounded-xl flex flex-col items-center justify-between transition cursor-pointer select-none border ${
                    isSelected
                      ? 'bg-teal-700 dark:bg-teal-600 border-teal-700 dark:border-teal-500 text-white shadow-xs'
                      : isInTrip
                      ? 'bg-teal-50/55 dark:bg-teal-950/25 border-teal-200/60 dark:border-teal-900/40 text-slate-900 dark:text-slate-100 hover:border-teal-500'
                      : 'bg-transparent border-transparent hover:bg-[#FAF9F6] dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-0.5">
                    <span
                      className={`text-xs font-mono tabular-nums leading-none ${
                        isSelected
                          ? 'font-bold text-white'
                          : isToday
                          ? 'font-black text-teal-700 dark:text-teal-300 underline underline-offset-2'
                          : 'font-semibold'
                      }`}
                    >
                      {cell.dayNum}
                    </span>
                    {matchedDay && (
                      <span
                        className={`hidden sm:inline text-[9px] font-mono leading-none ${
                          isSelected ? 'text-teal-100' : 'text-teal-600 dark:text-teal-400'
                        }`}
                      >
                        D{matchedDay.dayNumber}
                      </span>
                    )}
                  </div>

                  {stat ? (
                    <span
                      className={`text-[9px] sm:text-[10px] font-mono tabular-nums font-bold leading-tight truncate max-w-full px-0.5 ${
                        isSelected
                          ? 'text-teal-50'
                          : 'text-teal-700 dark:text-teal-300'
                      }`}
                    >
                      {formatShortCalendarTotal(stat.total, baseCurrency)}
                    </span>
                  ) : (
                    <span className="text-[9px] leading-tight opacity-0">-</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
