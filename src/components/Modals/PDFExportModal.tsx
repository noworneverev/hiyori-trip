import React, { useState, useRef, useEffect } from 'react';
import { Trip } from '../../types/itinerary';
import { Language, TRANSLATIONS } from '../../utils/i18n';
import { formatDateSlash, formatMonthDaySlash } from '../../utils/date';
import { triggerNativePrint } from '../../utils/pdfExport';
import { ItineraryOverviewTable } from '../Itinerary/ItineraryOverviewTable';
import {
  X,
  Printer,
  Calendar,
  MapPin,
  Compass,
  ListTodo,
  Luggage,
  Check,
  Phone,
  FileText,
  DollarSign,
} from 'lucide-react';

interface PDFExportModalProps {
  trip: Trip;
  lang: Language;
  onClose: () => void;
}

const CATEGORY_NAMES: Record<string, { zh: string; en: string; ja: string; ko: string; 'zh-CN': string }> = {
  spot: { zh: '景點', en: 'Spot', ja: '観光', ko: '명소', 'zh-CN': '景点' },
  food: { zh: '美食', en: 'Food', ja: 'グルメ', ko: '맛집', 'zh-CN': '美食' },
  transport: { zh: '交通', en: 'Transit', ja: '交通', ko: '교통', 'zh-CN': '交通' },
  hotel: { zh: '住宿', en: 'Hotel', ja: '宿泊', ko: '숙소', 'zh-CN': '住宿' },
  shopping: { zh: '購物', en: 'Shopping', ja: '買い物', ko: '쇼핑', 'zh-CN': '购物' },
  activity: { zh: '體驗', en: 'Activity', ja: '体験', ko: '체험', 'zh-CN': '体验' },
  other: { zh: '其他', en: 'Other', ja: 'その他', ko: '기타', 'zh-CN': '其他' },
};

export const PDFExportModal: React.FC<PDFExportModalProps> = ({ trip, lang, onClose }) => {
  const t = TRANSLATIONS[lang];
  const printRef = useRef<HTMLDivElement>(null);

  // Export options
  const [includeOverviewTable, setIncludeOverviewTable] = useState(true);
  const [includeDailyDetails, setIncludeDailyDetails] = useState(true);
  const [includeTodos, setIncludeTodos] = useState(false);
  const [includePacking, setIncludePacking] = useState(true);
  const [includeEmergency, setIncludeEmergency] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeExpenses, setIncludeExpenses] = useState(false);

  const totalSpots = trip.days.reduce((sum, d) => sum + d.items.length, 0);
  const totalSpent = trip.expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;

  const handlePrint = () => {
    if (printRef.current) {
      triggerNativePrint(printRef.current, trip.title);
    } else {
      triggerNativePrint();
    }
  };

  // Quick 1-tap presets
  const applyPresetCompact = () => {
    setIncludeOverviewTable(true);
    setIncludeDailyDetails(false);
    setIncludeTodos(false);
    setIncludePacking(true);
    setIncludeEmergency(true);
    setIncludeNotes(false);
    setIncludeExpenses(false);
  };

  const applyPresetDailyOnly = () => {
    setIncludeOverviewTable(false);
    setIncludeDailyDetails(true);
    setIncludeTodos(true);
    setIncludePacking(true);
    setIncludeEmergency(true);
    setIncludeNotes(false);
    setIncludeExpenses(false);
  };

  const applyPresetFull = () => {
    setIncludeOverviewTable(true);
    setIncludeDailyDetails(true);
    setIncludeTodos(true);
    setIncludePacking(true);
    setIncludeEmergency(true);
    setIncludeNotes(false);
    setIncludeExpenses(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-xs p-2 sm:p-4"
      onClick={onClose}
    >
      {/* Print-specific style for native browser printing */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 10mm 12mm;
        }
        @media print {
          html, body {
            background: #ffffff !important;
            color: #0f172a !important;
            font-size: 11pt !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: 100% !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .page-break-before {
            page-break-before: always !important;
            break-before: page !important;
          }
          .break-inside-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div
        className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 flex flex-col h-[92vh] max-h-[92vh] min-h-0 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Control Header */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <span>{t.exportPDF}</span>
              <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-300 bg-teal-100 dark:bg-teal-950 px-2 py-0.5 rounded-full">
                A4 隨身手冊
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.exportPDFSubtitle}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Primary Export / Print Button */}
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs flex items-center gap-2 shadow-sm transition active:scale-95 cursor-pointer"
              title="開啟列印視窗，請將「目的地」選為「另存為 PDF」（文字 100% 向量可選取複製）或傳送至印表機"
            >
              <Printer className="w-4 h-4 text-white shrink-0" />
              <span>{lang === 'zh' ? '另存為 PDF / 列印' : 'Save as PDF / Print'}</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 rounded-full text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              title="關閉"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Options Bar & Quick Presets */}
        <div className="px-4 sm:px-5 py-2.5 bg-slate-100/90 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300 flex-wrap shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
            <span className="font-semibold text-slate-800 dark:text-slate-200 shrink-0">
              {lang === 'zh' ? '手冊內容包含：' : 'Include:'}
            </span>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-teal-600">
              <input
                type="checkbox"
                checked={includeOverviewTable}
                onChange={(e) => setIncludeOverviewTable(e.target.checked)}
                className="accent-teal-600 rounded"
              />
              <span className="font-bold text-teal-800 dark:text-teal-300">
                {lang === 'zh' ? '行程總覽大表' : 'Master Overview'}
              </span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-teal-600">
              <input
                type="checkbox"
                checked={includeDailyDetails}
                onChange={(e) => setIncludeDailyDetails(e.target.checked)}
                className="accent-teal-600 rounded"
              />
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {lang === 'zh' ? '每日詳細日程' : 'Daily Schedule'}
              </span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-teal-600">
              <input
                type="checkbox"
                checked={includeTodos}
                onChange={(e) => setIncludeTodos(e.target.checked)}
                className="accent-teal-600 rounded"
              />
              <span>{lang === 'zh' ? '票券與行前待辦' : 'Tickets & To-Do'}</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-teal-600">
              <input
                type="checkbox"
                checked={includePacking}
                onChange={(e) => setIncludePacking(e.target.checked)}
                className="accent-teal-600 rounded"
              />
              <span>{t.includePacking}</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-teal-600">
              <input
                type="checkbox"
                checked={includeEmergency}
                onChange={(e) => setIncludeEmergency(e.target.checked)}
                className="accent-teal-600 rounded"
              />
              <span>{t.includeEmergency}</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-teal-600">
              <input
                type="checkbox"
                checked={includeNotes}
                onChange={(e) => setIncludeNotes(e.target.checked)}
                className="accent-teal-600 rounded"
              />
              <span>{lang === 'zh' ? '附錄備忘' : t.includeNotes}</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-teal-600">
              <input
                type="checkbox"
                checked={includeExpenses}
                onChange={(e) => setIncludeExpenses(e.target.checked)}
                className="accent-teal-600 rounded"
              />
              <span>{lang === 'zh' ? '消費記帳摘要' : 'Expense Summary'}</span>
            </label>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
            <span className="text-slate-400 hidden xl:inline">快速模式：</span>
            <button
              type="button"
              onClick={applyPresetCompact}
              className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 dark:bg-teal-950/70 dark:text-teal-300 font-semibold border border-teal-200/80 dark:border-teal-850 transition active:scale-95"
              title="僅包含總覽大表、行李清單與緊急電話，適合印成 1~2 頁隨身隨行摺疊卡"
            >
              ⚡ {lang === 'zh' ? '一頁精簡版' : '1-Page Summary'}
            </button>
            <button
              type="button"
              onClick={applyPresetDailyOnly}
              className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700 transition active:scale-95"
              title="僅顯示每日詳細景點與清單，不含大表"
            >
              🗺️ {lang === 'zh' ? '僅每日日程' : 'Daily Only'}
            </button>
            <button
              type="button"
              onClick={applyPresetFull}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 font-semibold border border-slate-300 dark:border-slate-700 transition active:scale-95"
              title="包含大表、每日景點細節、待辦票券與行李清單，適合深度旅遊"
            >
              📖 {lang === 'zh' ? '完整手冊版' : 'Full Guide'}
            </button>
          </div>
        </div>

        {/* Document Preview Scroll Area (Seamless clean canvas, no weird floating box) */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-slate-900 p-4 sm:p-8 overscroll-contain">
          {/* Printable Document Paper Sheet Container */}
          <div
            id="printable-itinerary-booklet"
            ref={printRef}
            className="w-full max-w-4xl mx-auto space-y-7 text-xs leading-relaxed text-slate-900 dark:text-slate-100 transition-all overflow-visible print:bg-white print:text-black print:p-0"
            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
          >
            {/* Cover / Header Section */}
            <div className="border-b-2 border-slate-900 dark:border-slate-700 pb-5 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-mono">
                <span>Hiyori Travel Guidebook (日和手帳)</span>
                <span>Offline Edition</span>
              </div>

              <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-950 dark:text-white tracking-tight break-words">
                {trip.title}
              </h1>

              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
                  <span>{trip.destination}</span>
                </span>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="flex items-center gap-1.5 font-mono">
                  <Calendar className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
                  <span>{formatDateSlash(trip.startDate)} ~ {formatDateSlash(trip.endDate)}</span>
                </span>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded font-mono text-[11px]">
                  {trip.days.length} Days / {Math.max(1, trip.days.length - 1)} Nights · {totalSpots} Spots
                </span>
              </div>
            </div>

            {/* Section 1: Trip Master Overview Table (行程總覽大表 - flow naturally on Page 1 without empty gap) */}
            {includeOverviewTable && (
              <div className="space-y-3">
                <ItineraryOverviewTable trip={trip} lang={lang} isPrintMode={true} />
              </div>
            )}

            {/* Section: To-Do & Tickets Checklist (行前待辦與票券提醒) */}
            {includeTodos && trip.todos && trip.todos.length > 0 && (
              <div className="space-y-3 border-t-2 border-slate-200 dark:border-slate-800 pt-5">
                <h2 className="text-base font-black text-slate-950 dark:text-white uppercase tracking-wider flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2 break-inside-avoid" style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}>
                  <div className="flex items-center gap-2">
                    <ListTodo className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                    <span>重要行前待辦與票券提醒 (Tickets & To-Do Checklist)</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 font-normal">
                    {trip.todos.filter((t) => t.completed).length}/{trip.todos.length} 已備妥
                  </span>
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {trip.todos.map((todo) => (
                    <div
                      key={todo.id}
                      className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-start gap-2.5 break-inside-avoid"
                    >
                      <div
                        className={`w-4 h-4 rounded-md shrink-0 flex items-center justify-center border mt-0.5 ${
                          todo.completed
                            ? 'bg-teal-600 border-teal-600 text-white shadow-2xs'
                            : 'border-slate-300 dark:border-slate-700 bg-transparent'
                        }`}
                      >
                        {todo.completed && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`font-bold text-xs ${
                              todo.completed ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {todo.title}
                          </span>
                          {todo.dueDate && (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                              ({formatDateSlash(todo.dueDate)})
                            </span>
                          )}
                        </div>
                        {todo.notes && (
                          <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                            {todo.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section 2: Day-by-Day Section */}
            {includeDailyDetails && (
              <div className="space-y-6">
                <h2 className="text-base font-black text-slate-950 dark:text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 break-inside-avoid" style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}>
                  <Compass className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                  <span>每日詳細行程 (Daily Itinerary Schedule)</span>
                </h2>

                {trip.days.map((day) => (
                  <div key={day.id} className="space-y-3">
                    {/* Day Banner */}
                    <div className="bg-slate-900 dark:bg-slate-800 text-white px-4 py-2 rounded-xl flex items-center justify-between break-inside-avoid" style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}>
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono text-sm">
                          Day {day.dayNumber}
                        </span>
                        <span>·</span>
                        <span className="font-medium text-slate-300 font-mono">
                          {formatDateSlash(day.date)}
                        </span>
                        {day.theme && (
                          <>
                            <span>·</span>
                            <span className="font-bold text-white">{day.theme}</span>
                          </>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-slate-300">
                        {day.items.length} 個景點
                      </span>
                    </div>

                    {day.notes && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 italic px-2">
                        {day.notes}
                      </p>
                    )}

                    {/* Day Spots List */}
                    {day.items.length === 0 ? (
                      <p className="text-slate-400 italic text-[11px] px-2">當日尚無行程安排。</p>
                    ) : (
                      <div className="space-y-2">
                        {day.items.map((item, itemIdx) => {
                          const cat = CATEGORY_NAMES[item.category] || CATEGORY_NAMES.other;
                          const catLabel = cat[lang] || cat.en;

                          return (
                            <div
                              key={item.id}
                              className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/70 space-y-1.5 break-inside-avoid"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-0.5 flex-1">
                                  <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                    <span className="font-bold text-slate-900 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.2 rounded">
                                      #{itemIdx + 1}
                                    </span>
                                    <span className="font-semibold text-teal-800 dark:text-teal-300">
                                      {item.startTime}{item.endTime ? ` - ${item.endTime}` : ''}
                                    </span>
                                    <span>·</span>
                                    <span className="text-slate-600 dark:text-slate-400">{catLabel}</span>
                                    {item.bookingCode && (
                                      <>
                                        <span>·</span>
                                        <span className="text-amber-800 dark:text-amber-400 font-bold">預約代碼 #{item.bookingCode}</span>
                                      </>
                                    )}
                                  </div>

                                  <h3 className="font-bold text-slate-950 dark:text-white text-sm">
                                    {item.title}
                                  </h3>

                                  {(item.locationName || item.address) && (
                                    <p className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1">
                                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span>{item.locationName || item.address}</span>
                                    </p>
                                  )}
                                </div>

                                {/* Price / Cost */}
                                {typeof item.cost === 'number' && item.cost > 0 && (
                                  <div className="text-right shrink-0 font-mono text-[11px]">
                                    <span className="font-bold text-slate-900 dark:text-slate-100">
                                      {trip.currency || 'JPY'} {item.cost.toLocaleString()}
                                    </span>
                                    <span className="block text-[10px] text-slate-400">
                                      {item.costPaid ? '已付款' : '現場支付'}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Transport / Walk Note */}
                              {item.transportNote && (
                                <p className="text-[11px] text-teal-900 dark:text-teal-200 bg-teal-50/70 dark:bg-teal-950/40 p-2 rounded-lg border border-teal-100 dark:border-teal-900/50">
                                  <span className="font-semibold text-teal-800 dark:text-teal-300">[交通方式]</span> {item.transportNote}
                                </p>
                              )}

                              {/* Item Notes */}
                              {item.notes && (
                                <p className="text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                                  <span className="font-semibold text-slate-700 dark:text-slate-300">[備忘提醒]</span> {item.notes}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Essential Packing Checklist Section */}
            {includePacking && trip.packingList && trip.packingList.length > 0 && (
              <div className="space-y-3 border-t-2 border-slate-200 dark:border-slate-800 pt-5">
                <h2 className="text-base font-black text-slate-950 dark:text-white uppercase tracking-wider flex items-center gap-2 break-inside-avoid" style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}>
                  <Luggage className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                  <span>行李打包準備清單 (Packing Checklist)</span>
                </h2>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {trip.packingList.map((item) => (
                    <div
                      key={item.id}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-slate-50/50 dark:bg-slate-800/40 break-inside-avoid"
                    >
                      <div
                        className={`w-4 h-4 rounded-md border shrink-0 flex items-center justify-center ${
                          item.packed
                            ? 'bg-teal-600 border-teal-600 text-white shadow-2xs'
                            : 'border-slate-300 dark:border-slate-700 bg-transparent'
                        }`}
                      >
                        {item.packed && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                      </div>
                      <span className="truncate text-[11px] font-medium text-slate-800 dark:text-slate-200">
                        {item.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Emergency Contacts Section */}
            {includeEmergency && trip.emergencyContacts && trip.emergencyContacts.length > 0 && (
              <div className="space-y-3 border-t-2 border-slate-200 dark:border-slate-800 pt-5">
                <h2 className="text-base font-black text-slate-950 dark:text-white uppercase tracking-wider flex items-center gap-2 break-inside-avoid" style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}>
                  <Phone className="w-4 h-4 text-rose-600" />
                  <span>緊急聯絡電話與救助資訊 (Emergency Contacts)</span>
                </h2>

                <div className="grid grid-cols-2 gap-2">
                  {trip.emergencyContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-rose-50/20 dark:bg-rose-950/20 flex items-center justify-between break-inside-avoid"
                    >
                      <div>
                        <span className="font-bold text-slate-900 dark:text-slate-100 block text-xs">{contact.name}</span>
                        {contact.address && (
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">{contact.address}</span>
                        )}
                      </div>
                      <span className="font-mono font-bold text-sm text-rose-700 dark:text-rose-400 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900/60">
                        {contact.phone}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Expense Breakdown Summary (消費支出摘要 - if selected) */}
            {includeExpenses && trip.expenses && trip.expenses.length > 0 && (
              <div className="space-y-3 break-inside-avoid border-t-2 border-slate-200 dark:border-slate-800 pt-5">
                <h2 className="text-base font-black text-slate-950 dark:text-white uppercase tracking-wider flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                    <span>旅程消費記帳摘要 (Expense Summary)</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                    總記帳支出: {trip.currency || 'JPY'} {totalSpent.toLocaleString()}
                  </span>
                </h2>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries(
                    trip.expenses.reduce((acc, exp) => {
                      const cat = exp.category || 'other';
                      acc[cat] = (acc[cat] || 0) + exp.amount;
                      return acc;
                    }, {} as Record<string, number>)
                  ).map(([catKey, sum]) => {
                    const catInfo = CATEGORY_NAMES[catKey] || CATEGORY_NAMES.other;
                    const label = catInfo[lang] || catInfo.en;
                    return (
                      <div key={catKey} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase font-medium">{label}</span>
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100 font-mono mt-0.5 block">
                          {trip.currency || 'JPY'} {sum.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Trip Notes & Booking Memo Appendix (附錄：隨行備忘筆記) */}
            {includeNotes && trip.notes && (
              <div className="space-y-3 break-inside-avoid border-t-2 border-slate-200 dark:border-slate-800 pt-5">
                <h2 className="text-base font-black text-slate-950 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                  <span>附錄：隨行備忘筆記與票券指引 (Trip Notes & Booking Guidelines)</span>
                </h2>
                <div className="p-4 bg-slate-50/80 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 text-xs leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-line font-mono">
                  {trip.notes}
                </div>
              </div>
            )}

            {/* Document Footer */}
            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono">
              <span>日和手帳 Hiyori · 隨行手帖 · Offline Printable Guidebook</span>
              <span>Generated on {new Date().toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

