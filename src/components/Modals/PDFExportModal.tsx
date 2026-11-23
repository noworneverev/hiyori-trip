import React, { useState, useRef } from 'react';
import { Trip } from '../../types/itinerary';
import { Language, TRANSLATIONS } from '../../utils/i18n';
import { formatDateSlash } from '../../utils/date';
import { triggerNativePrint, exportElementToPDF } from '../../utils/pdfExport';
import { convertAmount } from '../../utils/currency';
import { ItineraryOverviewTable } from '../Itinerary/ItineraryOverviewTable';
import {
  IosModalSheet,
  IosNavBar,
  IosInsetGroup,
  IosDisclosureRow,
  IosToggleRow,
} from '../UI/IosPrimitives';
import {
  Printer,
  Download,
  Loader2,
  Calendar,
  MapPin,
  Route,
  ListTodo,
  Luggage,
  Check,
  Phone,
  FileText,
  DollarSign,
  SlidersHorizontal,
  Ticket,
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
  const isZh = lang === 'zh' || lang === 'zh-CN';
  const printRef = useRef<HTMLDivElement>(null);

  const [includeOverviewTable, setIncludeOverviewTable] = useState(true);
  const [includeBookings, setIncludeBookings] = useState(Boolean(trip.bookings && trip.bookings.length > 0));
  const [includeDailyDetails, setIncludeDailyDetails] = useState(true);
  const [includeTodos, setIncludeTodos] = useState(false);
  const [includePacking, setIncludePacking] = useState(true);
  const [includeEmergency, setIncludeEmergency] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeExpenses, setIncludeExpenses] = useState(false);
  const [showOptionsPanel, setShowOptionsPanel] = useState(false);

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const baseCurrency = trip.currency || 'JPY';
  const totalSpots = trip.days.reduce((sum, d) => sum + d.items.length, 0);
  const nightsCount = Math.max(0, trip.days.length - 1);
  const totalSpent =
    trip.expenses?.reduce(
      (sum, e) =>
        sum + convertAmount(e.amount, e.currency || baseCurrency, baseCurrency, trip.customExchangeRates),
      0
    ) || 0;

  const enabledSectionsCount = [
    includeOverviewTable,
    includeBookings,
    includeDailyDetails,
    includeTodos,
    includePacking,
    includeEmergency,
    includeNotes,
    includeExpenses,
  ].filter(Boolean).length;

  const handlePrint = () => {
    setPdfError(null);
    if (printRef.current) {
      triggerNativePrint(printRef.current, trip.title);
    } else {
      triggerNativePrint();
    }
  };

  const handleDownloadPDF = async () => {
    if (!printRef.current || isExportingPdf) return;
    setPdfError(null);
    setIsExportingPdf(true);
    try {
      const safeTitle = (trip.title || 'hiyori-itinerary').replace(/[\\/:*?"<>|]/g, '_');
      await exportElementToPDF(printRef.current, `${safeTitle}.pdf`);
    } catch (err: any) {
      setPdfError(err?.message || (isZh ? 'PDF 匯出失敗，請改用列印另存 PDF' : 'PDF export failed, try Print instead.'));
    } finally {
      setIsExportingPdf(false);
    }
  };

  const applyPresetCompact = () => {
    setIncludeOverviewTable(true);
    setIncludeBookings(Boolean(trip.bookings && trip.bookings.length > 0));
    setIncludeDailyDetails(false);
    setIncludeTodos(false);
    setIncludePacking(true);
    setIncludeEmergency(true);
    setIncludeNotes(false);
    setIncludeExpenses(false);
  };

  const applyPresetDailyOnly = () => {
    setIncludeOverviewTable(false);
    setIncludeBookings(Boolean(trip.bookings && trip.bookings.length > 0));
    setIncludeDailyDetails(true);
    setIncludeTodos(true);
    setIncludePacking(true);
    setIncludeEmergency(true);
    setIncludeNotes(false);
    setIncludeExpenses(false);
  };

  const applyPresetFull = () => {
    setIncludeOverviewTable(true);
    setIncludeBookings(true);
    setIncludeDailyDetails(true);
    setIncludeTodos(true);
    setIncludePacking(true);
    setIncludeEmergency(true);
    setIncludeNotes(true);
    setIncludeExpenses(true);
  };

  const activePreset =
    includeOverviewTable && !includeDailyDetails && !includeTodos && includePacking && includeEmergency && !includeNotes && !includeExpenses
      ? 'compact'
      : !includeOverviewTable && includeDailyDetails && includeTodos && includePacking && includeEmergency && !includeNotes && !includeExpenses
        ? 'daily'
        : includeOverviewTable && includeBookings && includeDailyDetails && includeTodos && includePacking && includeEmergency && includeNotes && includeExpenses
          ? 'full'
          : 'custom';

  return (
    <IosModalSheet
      onClose={onClose}
      maxWidthClass="sm:max-w-4xl"
      variant="grouped"
      fullHeightOnMobile
      ariaLabel={t.exportPDF}
    >
      <style>{`
        @page { size: A4 portrait; margin: 10mm 12mm; }
        @media print {
          html, body {
            background: #ffffff !important;
            color: #0f172a !important;
            font-family: "Noto Sans TC", "PingFang TC", system-ui, sans-serif !important;
            font-size: 11pt !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .break-inside-avoid { break-inside: avoid !important; page-break-inside: avoid !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <IosNavBar
        title={t.exportPDF}
        subtitle="A4 隨行手冊預覽"
        leftLabel="關閉"
        onLeftClick={onClose}
        rightSlot={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrint}
              disabled={isExportingPdf}
              className="min-h-[40px] px-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
              title="列印或透過系統另存為向量 PDF"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{isZh ? '列印' : 'Print'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isExportingPdf}
              className="min-h-[40px] px-3 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="直接產生並下載 A4 PDF 檔案"
            >
              {isExportingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Download className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>
                {isExportingPdf
                  ? isZh ? '產生中...' : 'Generating...'
                  : isZh ? '下載 PDF' : 'PDF'}
              </span>
            </button>
          </div>
        }
      />

      {pdfError && (
        <div className="px-4 py-2 bg-rose-50 dark:bg-rose-950/60 border-b border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-medium shrink-0">
          {pdfError}
        </div>
      )}

      {/* Control Strip */}
      <div className="px-3 sm:px-5 py-2.5 border-b border-[#E5E2DC]/80 dark:border-slate-800 bg-[#FAF9F6] dark:bg-[#0B1120] space-y-2 shrink-0 no-print">
        <div className="grid grid-cols-3 p-1 rounded-xl bg-[#EFECE5] dark:bg-slate-800/90 gap-1">
          <button
            type="button"
            onClick={applyPresetCompact}
            className={`min-h-[36px] sm:min-h-[32px] px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activePreset === 'compact'
                ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {isZh ? '一頁精簡' : 'Compact'}
          </button>
          <button
            type="button"
            onClick={applyPresetDailyOnly}
            className={`min-h-[36px] sm:min-h-[32px] px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activePreset === 'daily'
                ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {isZh ? '僅每日日程' : 'Daily Only'}
          </button>
          <button
            type="button"
            onClick={applyPresetFull}
            className={`min-h-[36px] sm:min-h-[32px] px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activePreset === 'full'
                ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {isZh ? '完整手冊' : 'Full Guide'}
          </button>
        </div>

        <IosInsetGroup>
          <IosDisclosureRow
            icon={<SlidersHorizontal className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={isZh ? '自訂手冊收錄章節' : 'Included Sections'}
            value={`已選 ${enabledSectionsCount} 項`}
            expanded={showOptionsPanel}
            onToggle={() => setShowOptionsPanel((v) => !v)}
          >
            <div className="divide-y divide-[#E5E2DC]/70 dark:divide-slate-800/80 max-h-56 overflow-y-auto">
              <IosToggleRow label={isZh ? '行程總覽大表' : 'Master Overview'} checked={includeOverviewTable} onChange={setIncludeOverviewTable} />
              <IosToggleRow label={isZh ? '訂位憑證編號' : 'Booking Vouchers'} checked={includeBookings} onChange={setIncludeBookings} />
              <IosToggleRow label={isZh ? '每日詳細日程' : 'Daily Schedule'} checked={includeDailyDetails} onChange={setIncludeDailyDetails} />
              <IosToggleRow label={isZh ? '票券與行前待辦' : 'Tickets & To-Do'} checked={includeTodos} onChange={setIncludeTodos} />
              <IosToggleRow label={t.includePacking} checked={includePacking} onChange={setIncludePacking} />
              <IosToggleRow label={t.includeEmergency} checked={includeEmergency} onChange={setIncludeEmergency} />
              <IosToggleRow label={isZh ? '附錄備忘' : t.includeNotes} checked={includeNotes} onChange={setIncludeNotes} />
              <IosToggleRow label={isZh ? '消費記帳摘要' : 'Expense Summary'} checked={includeExpenses} onChange={setIncludeExpenses} />
            </div>
          </IosDisclosureRow>
        </IosInsetGroup>
      </div>

      {/* Document Preview Scroll Area */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-[#EFECE5] dark:bg-slate-950 p-3 sm:p-6 overscroll-contain touch-pan-y pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
        <div
          id="printable-itinerary-booklet"
          ref={printRef}
          className="w-full max-w-4xl mx-auto space-y-6 text-xs leading-relaxed bg-white text-slate-900 p-5 sm:p-8 rounded-2xl shadow-sm overflow-visible print:shadow-none print:rounded-none print:bg-white print:text-black print:p-0"
          style={{ fontFamily: '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif' }}
        >
          {/* Cover / Header Block */}
          <div data-pdf-block="true" className="border-b-2 border-slate-900 pb-5 space-y-2.5 bg-white">
            <div className="flex items-center justify-between text-[11px] text-slate-500 uppercase tracking-widest font-mono">
              <span>Hiyori Travel Guidebook (日和手帳)</span>
              <span>Offline Edition</span>
            </div>

            <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-950 tracking-tight break-words">
              {trip.title}
            </h1>

            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                <span>{trip.destination}</span>
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1.5 font-mono">
                <Calendar className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                <span>{formatDateSlash(trip.startDate)} ~ {formatDateSlash(trip.endDate)}</span>
              </span>
              <span className="text-slate-300">•</span>
              <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded font-mono text-[11px]">
                {nightsCount > 0 ? `${trip.days.length} Days / ${nightsCount} Nights` : `${trip.days.length} Day`} · {totalSpots} Spots
              </span>
            </div>
          </div>

          {/* Section 1: Trip Master Overview Table */}
          {includeOverviewTable && (
            <div data-pdf-block="true" className="space-y-3 bg-white">
              <ItineraryOverviewTable trip={trip} lang={lang} isPrintMode={true} />
            </div>
          )}

          {/* Section: Booking Vault Codes */}
          {includeBookings && trip.bookings && trip.bookings.length > 0 && (
            <div data-pdf-block="true" className="space-y-3 border-t-2 border-slate-200 pt-5 bg-white">
              <h2 className="text-base font-black text-slate-950 uppercase tracking-wider flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <Ticket className="w-4 h-4 text-teal-700" />
                  <span>訂位憑證與確認代號 (Booking Vault)</span>
                </div>
                <span className="text-[10px] font-mono text-slate-500 font-normal">
                  {trip.bookings.length} 筆憑證
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {trip.bookings.map((b) => (
                  <div key={b.id} className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/80 space-y-1 break-inside-avoid">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-slate-900 truncate">{b.title}</span>
                      {b.provider && <span className="text-[10px] text-slate-500 shrink-0">{b.provider}</span>}
                    </div>
                    <div className="font-mono font-bold text-xs text-teal-800 tracking-wider">
                      {b.bookingCode}{b.secondaryCode ? ` · ${b.secondaryCode}` : ''}
                    </div>
                    {(b.startDate || b.timeLabel || b.location) && (
                      <div className="text-[10px] text-slate-600 truncate">
                        {[b.startDate, b.timeLabel, b.location].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: To-Do & Tickets Checklist */}
          {includeTodos && trip.todos && trip.todos.length > 0 && (
            <div data-pdf-block="true" className="space-y-3 border-t-2 border-slate-200 pt-5 bg-white">
              <h2 className="text-base font-black text-slate-950 uppercase tracking-wider flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <ListTodo className="w-4 h-4 text-teal-700" />
                  <span>行前待辦清單 (To-Do Checklist)</span>
                </div>
                <span className="text-[10px] font-mono text-slate-500 font-normal">
                  {trip.todos.filter((todo) => todo.completed).length}/{trip.todos.length} 已完成
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {trip.todos.map((todo) => (
                  <div key={todo.id} className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-start gap-2.5 break-inside-avoid">
                    <div className={`w-4 h-4 rounded-md shrink-0 flex items-center justify-center border mt-0.5 ${todo.completed ? 'bg-teal-600 border-teal-600 text-white' : 'border-slate-300 bg-white'}`}>
                      {todo.completed && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className={`font-bold text-xs ${todo.completed ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                        {todo.title}
                      </span>
                      {todo.notes && <p className="text-[10px] text-slate-600 mt-0.5">{todo.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 2: Day-by-Day Schedule (Each Day Banner + Each Spot Card is an atomic PDF block!) */}
          {includeDailyDetails && (
            <div className="space-y-4">
              <div data-pdf-block="true" className="border-b border-slate-200 pb-2 bg-white">
                <h2 className="text-base font-black text-slate-950 uppercase tracking-wider flex items-center gap-2">
                  <Route className="w-4 h-4 text-teal-700" />
                  <span>每日詳細行程 (Daily Itinerary Schedule)</span>
                </h2>
              </div>

              {trip.days.map((day) => (
                <React.Fragment key={day.id}>
                  <div data-pdf-block="true" className="space-y-1.5 pt-2 bg-white">
                    <div className="bg-slate-900 text-white px-4 py-2 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono text-sm">Day {day.dayNumber}</span>
                        <span>·</span>
                        <span className="font-medium text-slate-300 font-mono">{formatDateSlash(day.date)}</span>
                        {day.theme && (
                          <>
                            <span>·</span>
                            <span className="font-bold text-white">{day.theme}</span>
                          </>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-slate-300">{day.items.length} 個景點</span>
                    </div>
                    {day.notes && <p className="text-[11px] text-slate-600 italic px-2">{day.notes}</p>}
                    {day.items.length === 0 && (
                      <p className="text-slate-400 italic text-[11px] px-2">當日尚無行程安排。</p>
                    )}
                  </div>

                  {day.items.map((item, itemIdx) => {
                    const cat = CATEGORY_NAMES[item.category] || CATEGORY_NAMES.other;
                    const catLabel = cat[lang] || cat.en;

                    return (
                      <div
                        key={item.id}
                        data-pdf-block="true"
                        className="p-3 rounded-xl border border-slate-200 bg-white space-y-1.5 break-inside-avoid"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5 flex-1">
                            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500 flex-wrap">
                              <span className="font-bold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded">
                                #{itemIdx + 1}
                              </span>
                              <span className="font-semibold text-teal-800">
                                {item.startTime}{item.endTime ? ` - ${item.endTime}` : ''}
                              </span>
                              <span>·</span>
                              <span className="text-slate-600">{catLabel}</span>
                              {item.bookingCode && (
                                <>
                                  <span>·</span>
                                  <span className="text-amber-800 font-bold">預約代碼 #{item.bookingCode}</span>
                                </>
                              )}
                            </div>

                            <h3 className="font-bold text-slate-950 text-sm">{item.title}</h3>

                            {(item.locationName || item.address) && (
                              <p className="text-[11px] text-slate-600 flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{item.locationName || item.address}</span>
                              </p>
                            )}
                          </div>

                          {typeof item.cost === 'number' && item.cost > 0 && (
                            <div className="text-right shrink-0 font-mono text-[11px]">
                              <span className="font-bold text-slate-900">
                                {trip.currency || 'JPY'} {item.cost.toLocaleString()}
                              </span>
                              <span className="block text-[10px] text-slate-400">
                                {item.costPaid ? '已付款' : '現場支付'}
                              </span>
                            </div>
                          )}
                        </div>

                        {item.transportNote && (
                          <p className="text-[11px] text-teal-900 bg-teal-50/70 p-2 rounded-lg border border-teal-100">
                            <span className="font-semibold text-teal-800">[交通方式]</span> {item.transportNote}
                          </p>
                        )}

                        {item.notes && (
                          <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <span className="font-semibold text-slate-700">[備忘提醒]</span> {item.notes}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Packing Checklist Section */}
          {includePacking && trip.packingList && trip.packingList.length > 0 && (
            <div data-pdf-block="true" className="space-y-3 border-t-2 border-slate-200 pt-5 bg-white">
              <h2 className="text-base font-black text-slate-950 uppercase tracking-wider flex items-center gap-2">
                <Luggage className="w-4 h-4 text-teal-700" />
                <span>行李打包準備清單 (Packing Checklist)</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {trip.packingList.map((item) => (
                  <div key={item.id} className="p-2 rounded-lg border border-slate-200 flex items-center gap-2 bg-slate-50/60 break-inside-avoid">
                    <div className={`w-4 h-4 rounded-md border shrink-0 flex items-center justify-center ${item.packed ? 'bg-teal-600 border-teal-600 text-white' : 'border-slate-300 bg-white'}`}>
                      {item.packed && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                    </div>
                    <span className="truncate text-[11px] font-medium text-slate-800">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Emergency Contacts Section */}
          {includeEmergency && trip.emergencyContacts && trip.emergencyContacts.length > 0 && (
            <div data-pdf-block="true" className="space-y-3 border-t-2 border-slate-200 pt-5 bg-white">
              <h2 className="text-base font-black text-slate-950 uppercase tracking-wider flex items-center gap-2">
                <Phone className="w-4 h-4 text-rose-600" />
                <span>緊急聯絡電話與救助資訊 (Emergency Contacts)</span>
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {trip.emergencyContacts.map((contact) => (
                  <div key={contact.id} className="p-2.5 rounded-xl border border-slate-200 bg-rose-50/30 flex items-center justify-between break-inside-avoid">
                    <div className="min-w-0 pr-2">
                      <span className="font-bold text-slate-900 block text-xs truncate">{contact.name}</span>
                      {contact.address && <span className="text-[10px] text-slate-500 block truncate">{contact.address}</span>}
                    </div>
                    <span className="font-mono font-bold text-xs text-rose-700 bg-white px-2 py-0.5 rounded border border-rose-200 shrink-0">
                      {contact.phone}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expense Breakdown Summary */}
          {includeExpenses && trip.expenses && trip.expenses.length > 0 && (
            <div data-pdf-block="true" className="space-y-3 border-t-2 border-slate-200 pt-5 bg-white">
              <h2 className="text-base font-black text-slate-950 uppercase tracking-wider flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-teal-700" />
                  <span>旅程消費記帳摘要 (Expense Summary)</span>
                </div>
                <span className="text-xs font-mono font-bold text-slate-900">
                  總支出: {baseCurrency} {Math.round(totalSpent).toLocaleString()}
                </span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(
                  trip.expenses.reduce((acc, exp) => {
                    const cat = exp.category || 'other';
                    const converted = convertAmount(exp.amount, exp.currency || baseCurrency, baseCurrency, trip.customExchangeRates);
                    acc[cat] = (acc[cat] || 0) + converted;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([catKey, sum]) => {
                  const catInfo = CATEGORY_NAMES[catKey];
                  const label = trip.customCategoryLabels?.[catKey] || (catInfo ? catInfo[lang] || catInfo.en : catKey);
                  return (
                    <div key={catKey} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 block uppercase font-medium">{label}</span>
                      <span className="font-bold text-xs text-slate-900 font-mono mt-0.5 block">
                        {baseCurrency} {Math.round(sum).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Trip Notes Appendix */}
          {includeNotes && trip.notes && (
            <div data-pdf-block="true" className="space-y-3 border-t-2 border-slate-200 pt-5 bg-white">
              <h2 className="text-base font-black text-slate-950 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-700" />
                <span>附錄：隨行備忘筆記 (Trip Notes)</span>
              </h2>
              <div className="p-4 bg-slate-50/90 rounded-xl border border-slate-200 text-xs leading-relaxed text-slate-800 whitespace-pre-line font-mono">
                {trip.notes}
              </div>
            </div>
          )}

          {/* Footer */}
          <div data-pdf-block="true" className="border-t border-slate-200 pt-4 flex items-center justify-between text-[10px] text-slate-400 font-mono bg-white">
            <span>日和手帳 Hiyori · Offline Printable Guidebook</span>
            <span>Generated on {new Date().toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    </IosModalSheet>
  );
};
