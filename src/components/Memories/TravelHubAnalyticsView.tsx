import React, { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CategoryType, Trip } from '../../types/itinerary';
import { formatDateSlash } from '../../utils/date';
import {
  convertAmount,
  formatCurrencyAmount,
  SUPPORTED_CURRENCIES,
} from '../../utils/currency';
import { MediaImage } from '../UI/MediaImage';
import {
  CATEGORY_HEX,
  CATEGORY_NAMES,
  computeTripExpenseInCurrency,
  FlattenedSpotMemory,
  GalleryPhotoItem,
} from './travelHubTypes';
import {
  ArrowRight,
  Award,
  BarChart3,
  Building2,
  Calendar as CalendarIcon,
  Check,
  Copy,
  Image as ImageIcon,
  Route,
  Wallet,
} from 'lucide-react';

interface TravelHubAnalyticsViewProps {
  uniqueTrips: Trip[];
  displaySpots: FlattenedSpotMemory[];
  availableYears: string[];
  reviewYear: string;
  setReviewYear: (year: string) => void;
  filterCompletedOnly: boolean;
  setFilterCompletedOnly: (val: boolean) => void;
  displayCurrency: string;
  setDisplayCurrency: (cur: string) => void;
  onSelectTrip: (tripId: string, targetSpotId?: string) => void;
  onOpenShareStudio: () => void;
  onOpenLightbox: (photos: GalleryPhotoItem[], index: number) => void;
  onCloseHub: () => void;
}

export const TravelHubAnalyticsView: React.FC<TravelHubAnalyticsViewProps> = ({
  uniqueTrips,
  displaySpots,
  availableYears,
  reviewYear,
  setReviewYear,
  filterCompletedOnly,
  setFilterCompletedOnly,
  displayCurrency,
  setDisplayCurrency,
  onSelectTrip,
  onOpenShareStudio,
  onOpenLightbox,
  onCloseHub,
}) => {
  const [selectedMonthDrill, setSelectedMonthDrill] = useState<number | null>(null);
  const [copiedReport, setCopiedReport] = useState(false);

  const analytics = useMemo(() => {
    const matchedTrips = uniqueTrips.filter((t) => {
      if (reviewYear === 'all') return true;
      const startY = t.startDate?.slice(0, 4);
      const endY = t.endDate?.slice(0, 4);
      const hasMatchingDay = (t.days || []).some((d) => d.date?.startsWith(reviewYear));
      return startY === reviewYear || endY === reviewYear || hasMatchingDay;
    });

    const tripMap = new Map<string, Trip>(matchedTrips.map((t) => [t.id, t]));
    const matchedSpots: FlattenedSpotMemory[] = [];
    const tripSpotIndex = new Map<string, { spots: number; photos: number }>();
    matchedTrips.forEach((t) => tripSpotIndex.set(t.id, { spots: 0, photos: 0 }));

    displaySpots.forEach((s) => {
      const match =
        reviewYear === 'all'
          ? true
          : (s.date && s.date.startsWith(reviewYear)) ||
            (s.tripStartDate && s.tripStartDate.startsWith(reviewYear));
      if (!match) return;
      matchedSpots.push(s);
      const rec = tripSpotIndex.get(s.tripId);
      if (rec) {
        rec.spots += 1;
        rec.photos += s.photos.length;
      }
    });

    const months = Array.from({ length: 12 }, (_, idx) => ({
      month: idx + 1,
      name: `${idx + 1}月`,
      uniqueDates: new Set<string>(),
      spotsCount: 0,
      expenseTotal: 0,
      spots: [] as FlattenedSpotMemory[],
    }));

    const uniqueDates = new Set<string>();

    if (filterCompletedOnly) {
      matchedSpots.forEach((s) => {
        if (!s.date) return;
        const [y, m] = s.date.split('-');
        if (reviewYear !== 'all' && y !== reviewYear) return;
        uniqueDates.add(s.date);
        const mIdx = parseInt(m, 10) - 1;
        if (mIdx >= 0 && mIdx < 12) months[mIdx].uniqueDates.add(s.date);
      });
    } else {
      matchedTrips.forEach((tr) => {
        (tr.days || []).forEach((d) => {
          if (!d.date) return;
          const [y, m] = d.date.split('-');
          if (reviewYear !== 'all' && y !== reviewYear) return;
          uniqueDates.add(d.date);
          const mIdx = parseInt(m, 10) - 1;
          if (mIdx >= 0 && mIdx < 12) months[mIdx].uniqueDates.add(d.date);
        });
      });
    }

    // Aggregate expenses per month and per trip in selected displayCurrency
    let totalConvertedExpense = 0;
    const tripExpenseMap = new Map<string, number>();

    matchedTrips.forEach((tr) => {
      const tripTotal = computeTripExpenseInCurrency(tr, displayCurrency);
      tripExpenseMap.set(tr.id, tripTotal);

      const fallbackCur = tr.currency || 'JPY';
      (tr.expenses || []).forEach((exp) => {
        const amt = Number(exp.amount) || 0;
        if (amt <= 0) return;
        const expDate = exp.date || tr.startDate || '';
        const [y, m] = expDate.split('-');
        if (reviewYear !== 'all' && y && y !== reviewYear) return;

        const converted = convertAmount(
          amt,
          exp.currency || fallbackCur,
          displayCurrency,
          tr.customExchangeRates
        );
        totalConvertedExpense += converted;
        const mIdx = parseInt(m, 10) - 1;
        if (mIdx >= 0 && mIdx < 12) {
          months[mIdx].expenseTotal += converted;
        }
      });
    });

    // Category & City aggregators
    const categoryCounts: Record<CategoryType, number> = {
      spot: 0,
      food: 0,
      transport: 0,
      hotel: 0,
      shopping: 0,
      activity: 0,
      other: 0,
    };

    const cityMap = new Map<
      string,
      {
        city: string;
        spotsCount: number;
        trips: Set<string>;
        photos: GalleryPhotoItem[];
      }
    >();

    matchedSpots.forEach((s) => {
      const cat = s.category || 'spot';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

      const city = s.tripDestination?.trim() || '自由行';
      let cRec = cityMap.get(city);
      if (!cRec) {
        cRec = { city, spotsCount: 0, trips: new Set([s.tripTitle]), photos: [] };
        cityMap.set(city, cRec);
      } else {
        cRec.trips.add(s.tripTitle);
      }
      cRec.spotsCount += 1;

      if (s.photos.length > 0 && cRec.photos.length < 4) {
        for (const url of s.photos) {
          if (cRec.photos.length >= 4) break;
          cRec.photos.push({
            id: `${s.tripId}-${s.spotId}-${cRec.photos.length}`,
            url,
            tripId: s.tripId,
            tripTitle: s.tripTitle,
            tripDestination: s.tripDestination,
            ownerId: s.ownerId,
            collabId: s.collabId,
            spotId: s.spotId,
            spotTitle: s.spotTitle,
            dayNumber: s.dayNumber,
            date: s.date,
            category: s.category,
            mood: s.mood,
            caption: s.notes,
            googlePhotosUrl: s.googlePhotosUrl,
            isFeaturedSpot: true,
          });
        }
      }

      if (s.date) {
        const [y, m] = s.date.split('-');
        if (reviewYear === 'all' || y === reviewYear) {
          const mIdx = parseInt(m, 10) - 1;
          if (mIdx >= 0 && mIdx < 12) {
            months[mIdx].spotsCount += 1;
            months[mIdx].spots.push(s);
          }
        }
      }
    });

    const totalSpots = matchedSpots.length;
    const citiesSummary = Array.from(cityMap.values())
      .sort((a, b) => b.spotsCount - a.spotsCount)
      .map((item) => ({
        ...item,
        sharePercent: totalSpots > 0 ? Math.round((item.spotsCount / totalSpots) * 100) : 0,
      }));

    const monthlySeries = months.map((m) => ({
      month: m.month,
      name: m.name,
      days: m.uniqueDates.size,
      spotsCount: m.spotsCount,
      expense: Math.round(m.expenseTotal),
      spots: m.spots,
    }));

    const peakMonth =
      [...monthlySeries]
        .filter((m) => m.days > 0 || m.spotsCount > 0)
        .sort((a, b) => (b.days !== a.days ? b.days - a.days : b.spotsCount - a.spotsCount))[0] ||
      null;

    const categoryPie = (Object.keys(categoryCounts) as CategoryType[])
      .map((cat) => ({
        key: cat,
        name: CATEGORY_NAMES[cat],
        value: categoryCounts[cat],
        color: CATEGORY_HEX[cat],
        percent: totalSpots > 0 ? Math.round((categoryCounts[cat] / totalSpots) * 100) : 0,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);

    const standalonePhotoCount = matchedTrips.reduce((acc, tr) => {
      const spotPhotoSet = new Set<string>();
      (tr.days || []).forEach((d) =>
        (d.items || []).forEach((it) => (it.memoryPhotos || []).forEach((p) => spotPhotoSet.add(p)))
      );
      const extra = (tr.memories || []).filter((m) => !spotPhotoSet.has(m.imageUrl)).length;
      return acc + extra;
    }, 0);

    const totalPhotosCount =
      matchedSpots.reduce((acc, s) => acc + s.photos.length, 0) + standalonePhotoCount;

    const totalDaysCount = uniqueDates.size;
    const avgDailyExpense =
      totalDaysCount > 0 ? Math.round(totalConvertedExpense / totalDaysCount) : 0;

    return {
      matchedTrips,
      tripMap,
      matchedSpots,
      tripSpotIndex,
      tripExpenseMap,
      citiesSummary,
      monthlySeries,
      peakMonth,
      categoryPie,
      totalDaysCount,
      totalPhotosCount,
      totalConvertedExpense: Math.round(totalConvertedExpense),
      avgDailyExpense,
    };
  }, [uniqueTrips, displaySpots, reviewYear, filterCompletedOnly, displayCurrency]);

  const drillMonthSpots = useMemo(() => {
    if (selectedMonthDrill === null) return [];
    const found = analytics.monthlySeries.find((m) => m.month === selectedMonthDrill);
    return found?.spots || [];
  }, [selectedMonthDrill, analytics.monthlySeries]);

  const handleCopyReport = () => {
    const yearLabel = reviewYear === 'all' ? '歷年總覽' : `${reviewYear} 年度`;
    const citiesText =
      analytics.citiesSummary
        .slice(0, 6)
        .map((c) => `${c.city}(${c.spotsCount})`)
        .join('、') || '探索中';

    const text =
      `【日和手帳 · ${yearLabel}旅路年鑑】\n` +
      `· 旅程累積：${analytics.matchedTrips.length} 趟 / ${analytics.totalDaysCount} 天\n` +
      `· 造訪城市：${analytics.citiesSummary.length} 座（${citiesText}）\n` +
      `· 足跡打卡：${analytics.matchedSpots.length} 處 · ${analytics.totalPhotosCount} 張照片\n` +
      `· 總旅費統計：${formatCurrencyAmount(analytics.totalConvertedExpense, displayCurrency)}（日均 ${formatCurrencyAmount(analytics.avgDailyExpense, displayCurrency)}）\n` +
      `— 日和手帳 Hiyori`;

    navigator.clipboard?.writeText(text);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2400);
  };

  return (
    <div className="space-y-6">
      {/* Editorial Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            onClick={() => {
              setReviewYear('all');
              setSelectedMonthDrill(null);
            }}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
              reviewYear === 'all'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            歷年總覽
          </button>
          {availableYears.map((yr) => (
            <button
              key={yr}
              type="button"
              onClick={() => {
                setReviewYear(yr);
                setSelectedMonthDrill(null);
              }}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold font-mono tabular-nums whitespace-nowrap shrink-0 transition cursor-pointer ${
                reviewYear === yr
                  ? 'bg-teal-600 text-white'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {yr}年
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setFilterCompletedOnly(true)}
              className={`min-h-[34px] px-2.5 py-1 rounded-lg transition cursor-pointer whitespace-nowrap ${
                filterCompletedOnly
                  ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              已造訪
            </button>
            <button
              type="button"
              onClick={() => setFilterCompletedOnly(false)}
              className={`min-h-[34px] px-2.5 py-1 rounded-lg transition cursor-pointer whitespace-nowrap ${
                !filterCompletedOnly
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              全部規劃
            </button>
          </div>

          <select
            value={displayCurrency}
            onChange={(e) => setDisplayCurrency(e.target.value)}
            aria-label="統計基準幣別"
            className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                幣別：{c.code} ({c.symbol})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleCopyReport}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-teal-500 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
          >
            {copiedReport ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedReport ? '已複製戰報' : '複製戰報'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenShareStudio}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
          >
            <Award className="w-3.5 h-3.5" />
            <span>製作分享圖卡</span>
          </button>
        </div>
      </div>

      {/* 4 Editorial KPI Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 space-y-1.5">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">造訪城市版圖</span>
          <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white tracking-tight">
            {analytics.citiesSummary.length}
            <span className="text-xs font-sans font-semibold text-slate-400 ml-1.5">座城市</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {analytics.citiesSummary.slice(0, 3).map((c) => c.city).join(' · ') || '尚未紀錄城市'}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 space-y-1.5">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">漫遊旅途時間</span>
          <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white tracking-tight">
            {analytics.totalDaysCount}
            <span className="text-xs font-sans font-semibold text-slate-400 ml-1.5">天</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
            {analytics.matchedTrips.length} 趟旅程 · 峰值 {analytics.peakMonth ? analytics.peakMonth.name : '—'}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 space-y-1.5">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">足跡與攝影記憶</span>
          <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white tracking-tight">
            {analytics.matchedSpots.length}
            <span className="text-xs font-sans font-semibold text-slate-400 ml-1.5">處足跡</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
            收錄 {analytics.totalPhotosCount} 張回憶照片
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 space-y-1.5">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            總旅費換算 ({displayCurrency})
          </span>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-teal-700 dark:text-teal-400 tracking-tight truncate">
            {formatCurrencyAmount(analytics.totalConvertedExpense, displayCurrency)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
            日均 {formatCurrencyAmount(analytics.avgDailyExpense, displayCurrency)}
          </p>
        </div>
      </div>

      {/* Charts Grid: Monthly Dual Trend + Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Monthly Travel Days & Spending Composed Chart */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>月度出遊天數與花費趨勢</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                點擊任一月份長條，下方將展開該月走訪景點清單
              </p>
            </div>
            {analytics.peakMonth && (
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 font-mono tabular-nums">
                最高峰 · {analytics.peakMonth.name} ({analytics.peakMonth.days} 天)
              </span>
            )}
          </div>

          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={analytics.monthlySeries}
                margin={{ top: 10, right: 8, left: -16, bottom: 0 }}
                onClick={(state) => {
                  if (state && typeof state.activeTooltipIndex === 'number') {
                    const m = analytics.monthlySeries[state.activeTooltipIndex];
                    if (m && (m.days > 0 || m.spotsCount > 0)) {
                      setSelectedMonthDrill((prev) => (prev === m.month ? null : m.month));
                    }
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  hide
                />
                <Tooltip
                  cursor={{ fill: 'rgba(13,148,136,0.08)' }}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid rgba(148,163,184,0.25)',
                    backgroundColor: '#0f172a',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                  formatter={(value, name) => {
                    if (name === 'expense') {
                      return [formatCurrencyAmount(Number(value) || 0, displayCurrency), '月度花費'];
                    }
                    return [`${value ?? 0} 天`, '出遊天數'];
                  }}
                />
                <Bar
                  yAxisId="left"
                  dataKey="days"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={28}
                  className="cursor-pointer"
                >
                  {analytics.monthlySeries.map((entry) => (
                    <Cell
                      key={entry.month}
                      fill={
                        selectedMonthDrill === entry.month
                          ? '#d97706'
                          : entry.days > 0
                          ? '#0d9488'
                          : 'rgba(148,163,184,0.22)'
                      }
                    />
                  ))}
                </Bar>
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="expense"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#f59e0b' }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {selectedMonthDrill !== null && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-100 font-mono tabular-nums">
                  {selectedMonthDrill} 月走訪明細 · 共 {drillMonthSpots.length} 處
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedMonthDrill(null)}
                  className="text-teal-600 dark:text-teal-400 font-semibold hover:underline cursor-pointer"
                >
                  清除篩選
                </button>
              </div>
              {drillMonthSpots.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                  {drillMonthSpots.map((s) => (
                    <button
                      key={`${s.tripId}-${s.spotId}`}
                      type="button"
                      onClick={() => {
                        onSelectTrip(s.tripId, s.spotId);
                        onCloseHub();
                      }}
                      className="text-left p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-teal-50/70 dark:hover:bg-teal-950/40 border border-slate-200/70 dark:border-slate-700/70 transition cursor-pointer"
                    >
                      <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                        {formatDateSlash(s.date)} · {s.tripDestination}
                      </div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                        {s.spotTitle}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Category Distribution Donut */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 space-y-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              行程足跡結構分佈
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
              總計 {analytics.matchedSpots.length} 處紀錄點
            </p>
          </div>

          {analytics.categoryPie.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-xs text-slate-400">
              該年度尚無類別紀錄
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div className="h-[190px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.categoryPie}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={76}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {analytics.categoryPie.map((entry) => (
                        <Cell key={entry.key} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: '10px',
                        border: 'none',
                        backgroundColor: '#0f172a',
                        color: '#f8fafc',
                        fontSize: '12px',
                      }}
                      formatter={(val: any) => [`${val} 處`, '數量']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2.5">
                {analytics.categoryPie.map((cat) => (
                  <div
                    key={cat.key}
                    className="flex items-center justify-between text-xs border-b border-slate-100 dark:border-slate-800/70 pb-1.5 last:border-b-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                        {cat.name}
                      </span>
                    </div>
                    <div className="font-mono tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                      <strong className="text-slate-900 dark:text-white">{cat.value}</strong>
                      <span className="text-slate-400 ml-1.5">{cat.percent}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* City Leaderboard */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>造訪城市足跡排行 ({analytics.citiesSummary.length})</span>
          </h3>
          <span className="text-xs text-slate-400">依走訪次數排序</span>
        </div>

        {analytics.citiesSummary.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">該區間尚無城市足跡紀錄</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {analytics.citiesSummary.map((item, idx) => (
              <div
                key={item.city}
                className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono tabular-nums font-bold text-teal-700 dark:text-teal-400">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      {item.city}
                    </h4>
                  </div>
                  <span className="text-xs font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                    {item.spotsCount} 處 · {item.sharePercent}%
                  </span>
                </div>

                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-teal-600 dark:bg-teal-400 rounded-full"
                    style={{ width: `${Math.max(8, item.sharePercent)}%` }}
                  />
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {Array.from(item.trips).join(' · ')}
                </p>

                {item.photos.length > 0 && (
                  <div className="flex items-center gap-1.5 pt-1">
                    {item.photos.map((photo, pIdx) => (
                      <MediaImage
                        key={photo.id}
                        src={photo.url}
                        tripId={photo.tripId}
                        ownerId={photo.ownerId}
                        collabId={photo.collabId}
                        alt={item.city}
                        onClick={() => onOpenLightbox(item.photos, pIdx)}
                        className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700 cursor-pointer hover:opacity-90 transition shrink-0"
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trip Comparison Table / List */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Route className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>旅程對比一覽 ({analytics.matchedTrips.length} 趟)</span>
          </h3>
          <span className="text-xs font-mono text-slate-400">{displayCurrency} 計價</span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {analytics.matchedTrips.map((tr) => {
            const spotStats = analytics.tripSpotIndex.get(tr.id);
            const totalSpent = Math.round(analytics.tripExpenseMap.get(tr.id) || 0);
            const dayLen = Math.max(1, tr.days?.length || 1);
            const dailySpent = Math.round(totalSpent / dayLen);

            return (
              <div
                key={tr.id}
                className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      {tr.title}
                    </h4>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <CalendarIcon className="w-3 h-3" />
                      {formatDateSlash(tr.startDate)} – {formatDateSlash(tr.endDate)}
                    </span>
                    <span>·</span>
                    <span className="font-sans">{tr.destination}</span>
                    <span>·</span>
                    <span>{dayLen} 天</span>
                    <span>·</span>
                    <span>{spotStats?.spots || 0} 處</span>
                    {(spotStats?.photos || 0) > 0 && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <ImageIcon className="w-3 h-3" />
                          {spotStats?.photos}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                  <div className="text-left sm:text-right font-mono tabular-nums">
                    <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center sm:justify-end gap-1">
                      <Wallet className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 sm:hidden" />
                      <span>{formatCurrencyAmount(totalSpent, displayCurrency)}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      日均 {formatCurrencyAmount(dailySpent, displayCurrency)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectTrip(tr.id);
                      onCloseHub();
                    }}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-teal-500 hover:text-teal-700 dark:hover:text-teal-300 text-xs font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                  >
                    <span>開啟</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
