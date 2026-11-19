import React, { useState } from 'react';
import { Trip } from '../../types/itinerary';
import {
  parseTextItinerary,
  parseCSVItinerary,
  exportTripToJSON,
  exportAllTripsToJSON,
  exportTripToMarkdown,
  exportTripToCSV,
} from '../../utils/storage';
import { universalParseItinerary } from '../../utils/aiClient';
import { extractInlineImagesToMediaRefs, rebindTripMediaIds } from '../../utils/image';
import { TRIP_TEMPLATES } from '../../data/presetTrips';
import {
  IosModalSheet,
  IosNavBar,
  IosInsetGroup,
  IosRow,
} from '../UI/IosPrimitives';
import {
  Upload,
  Download,
  FileText,
  Sparkles,
  Check,
  AlertCircle,
  HardDrive,
  Bot,
  Zap,
  MapPin,
  Loader2,
  Printer,
  Calendar,
  Table,
  ChevronRight,
} from 'lucide-react';

interface ImportExportModalProps {
  currentTrip: Trip;
  allTrips: Trip[];
  onImportTrip: (trip: Trip) => void;
  onOpenExportPDF?: () => void;
  onClose: () => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  currentTrip,
  allTrips,
  onImportTrip,
  onOpenExportPDF,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'export' | 'presets'>('import');

  // File Upload & Paste States
  const [pastedText, setPastedText] = useState('');
  const [destinationHint, setDestinationHint] = useState('');
  const [tripTitleInput, setTripTitleInput] = useState('');
  const [parsedPreviewTrip, setParsedPreviewTrip] = useState<Trip | null>(null);
  const [parseSource, setParseSource] = useState<'server_ai' | 'local_fallback' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiStatusStep, setAiStatusStep] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  const handleExportSingleJSON = async () => {
    setErrorMessage(null);
    setIsExporting(true);
    try {
      await exportTripToJSON(currentTrip);
    } catch (err: any) {
      setErrorMessage(`匯出 JSON 失敗: ${err?.message || '未知錯誤'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAllJSON = async () => {
    setErrorMessage(null);
    setIsExporting(true);
    try {
      await exportAllTripsToJSON(allTrips);
    } catch (err: any) {
      setErrorMessage(`整庫備份失敗: ${err?.message || '未知錯誤'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.json')) {
          const rawParsed = JSON.parse(content);
          let candidate: any = rawParsed;
          if (Array.isArray(rawParsed)) {
            if (rawParsed.length === 1 && rawParsed[0]?.title && Array.isArray(rawParsed[0]?.days)) {
              candidate = rawParsed[0];
            } else {
              throw new Error('此 JSON 包含多筆旅程，請上傳單一行程 JSON 檔案');
            }
          }
          if (candidate && typeof candidate.title === 'string' && Array.isArray(candidate.days)) {
            const newId = `imported-${Date.now()}`;
            const sanitized: Trip = {
              ...candidate,
              id: newId,
              shareId: undefined,
              collabId: undefined,
              isCollaborative: false,
              ownerId: undefined,
              ownerEmail: undefined,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            const { trip: offloaded } = await extractInlineImagesToMediaRefs(sanitized);
            const rebound = await rebindTripMediaIds(offloaded, newId);
            setParseSource(null);
            setParsedPreviewTrip(rebound);
          } else {
            throw new Error('JSON 格式不符合行程結構');
          }
        } else if (fileName.endsWith('.csv')) {
          const trip = parseCSVItinerary(content);
          trip.title = file.name.replace(/\.[^/.]+$/, '');
          setParseSource('local_fallback');
          setParsedPreviewTrip(trip);
        } else {
          setPastedText(content);
          if (!tripTitleInput) {
            setTripTitleInput(file.name.replace(/\.[^/.]+$/, ''));
          }
        }
      } catch (err: any) {
        setErrorMessage(`檔案解析失敗: ${err.message || '格式不符'}`);
      }
    };

    reader.readAsText(file);
  };

  const handleAiParse = async () => {
    if (!pastedText.trim()) return;
    setErrorMessage(null);
    setIsAiLoading(true);
    setAiStatusStep('正在閱讀行程與辨識景點...');

    const stepTimer1 = setTimeout(() => {
      setAiStatusStep('正在查詢經緯度座標與地理位置...');
    }, 1500);

    const stepTimer2 = setTimeout(() => {
      setAiStatusStep('正在優化每日路線與交通指引...');
    }, 3500);

    try {
      const { trip, source } = await universalParseItinerary(
        pastedText,
        destinationHint.trim() || undefined,
        currentTrip.currency
      );

      if (tripTitleInput.trim()) {
        trip.title = tripTitleInput.trim();
      }
      setParseSource(source);
      setParsedPreviewTrip(trip);
    } catch (err: any) {
      console.warn('Universal parse failed:', err);
      setErrorMessage(`行程解析未完成: ${err?.message || '格式無法辨識'}。請檢查文字格式或改用純本地規則解析。`);
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setIsAiLoading(false);
      setAiStatusStep('');
    }
  };

  const handleLocalRuleParse = () => {
    if (!pastedText.trim()) return;
    setErrorMessage(null);
    try {
      const trip = parseTextItinerary(pastedText, tripTitleInput || '本地解析新行程');
      if (destinationHint.trim()) {
        trip.destination = destinationHint.trim();
      }
      setParseSource('local_fallback');
      setParsedPreviewTrip(trip);
    } catch (err: any) {
      setErrorMessage(`解析文字失敗: ${err.message}`);
    }
  };

  const handleConfirmImport = () => {
    if (parsedPreviewTrip) {
      onImportTrip(parsedPreviewTrip);
      onClose();
    }
  };

  const handleLoadPreset = (preset: Trip) => {
    const cloned: Trip = JSON.parse(JSON.stringify(preset));
    cloned.id = `preset-copy-${Date.now()}`;
    cloned.title = `${preset.title} (新副本)`;
    cloned.collabId = undefined;
    cloned.isCollaborative = false;
    cloned.collaborators = undefined;
    cloned.editorEmails = undefined;
    cloned.viewerEmails = undefined;
    cloned.generalAccess = undefined;
    cloned.ownerId = undefined;
    cloned.ownerEmail = undefined;
    cloned.createdAt = Date.now();
    cloned.updatedAt = Date.now();
    onImportTrip(cloned);
    onClose();
  };

  const switchTab = (tab: 'import' | 'presets' | 'export') => {
    setActiveTab(tab);
    setParsedPreviewTrip(null);
    setParseSource(null);
    setErrorMessage(null);
  };

  return (
    <IosModalSheet
      onClose={onClose}
      maxWidthClass="sm:max-w-2xl"
      variant="grouped"
      fullHeightOnMobile
      ariaLabel="匯入與匯出中心"
    >
      <IosNavBar
        title="匯入與匯出"
        leftLabel="關閉"
        onLeftClick={onClose}
        rightLabel={activeTab === 'import' && parsedPreviewTrip ? '套用匯入' : '完成'}
        onRightClick={activeTab === 'import' && parsedPreviewTrip ? handleConfirmImport : onClose}
      />

      {/* iOS Segmented Control */}
      <div className="px-4 py-2.5 border-b border-[#E5E2DC]/80 dark:border-slate-800 bg-[#FAF9F6] dark:bg-[#0B1120] shrink-0">
        <div className="grid grid-cols-3 p-1 rounded-xl bg-[#EFECE5] dark:bg-slate-800/90 gap-1">
          <button
            type="button"
            onClick={() => switchTab('import')}
            className={`min-h-[38px] sm:min-h-[34px] px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'import'
                ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5 shrink-0" />
            <span>上傳解析</span>
          </button>
          <button
            type="button"
            onClick={() => switchTab('presets')}
            className={`min-h-[38px] sm:min-h-[34px] px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'presets'
                ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>示範範本</span>
          </button>
          <button
            type="button"
            onClick={() => switchTab('export')}
            className={`min-h-[38px] sm:min-h-[34px] px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'export'
                ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>備份匯出</span>
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 sm:p-5 space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {/* TAB 1: IMPORT & PARSE */}
        {activeTab === 'import' && (
          <>
            <IosInsetGroup
              header="從檔案匯入"
              footer="支援 .JSON 完整還原包、.CSV 試算表或旅行社行程 .TXT / .MD。"
            >
              <label className="relative flex items-center gap-3.5 px-4 py-3.5 min-h-[60px] cursor-pointer hover:bg-[#FAF9F6] dark:hover:bg-slate-800/45 transition group">
                <input
                  type="file"
                  accept=".json,.csv,.txt,.md"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
                <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm sm:text-xs font-bold text-slate-900 dark:text-slate-100">
                    選擇或拖放行程檔案
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    點擊開啟檔案選擇器（.JSON / .CSV / .TXT / .MD）
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </label>
            </IosInsetGroup>

            <IosInsetGroup
              header="貼上行程文字智慧解析"
              headerRight={
                pastedText ? (
                  <button
                    type="button"
                    onClick={() => setPastedText('')}
                    className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                  >
                    清空內容
                  </button>
                ) : undefined
              }
            >
              <div className="px-4 py-2.5 flex items-center justify-between gap-3 min-h-[48px]">
                <label className="text-sm sm:text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0 w-24">
                  行程名稱
                </label>
                <input
                  type="text"
                  value={tripTitleInput}
                  onChange={(e) => setTripTitleInput(e.target.value)}
                  placeholder="選填（例：東京 5 日自由行）"
                  className="min-w-0 flex-1 bg-transparent text-right text-[16px] sm:text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none"
                />
              </div>
              <div className="px-4 py-2.5 flex items-center justify-between gap-3 min-h-[48px]">
                <label className="text-sm sm:text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0 w-24">
                  目的地提示
                </label>
                <input
                  type="text"
                  value={destinationHint}
                  onChange={(e) => setDestinationHint(e.target.value)}
                  placeholder="選填（例：日本京都、法國巴黎）"
                  className="min-w-0 flex-1 bg-transparent text-right text-[16px] sm:text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none"
                />
              </div>
              <div className="p-3.5">
                <textarea
                  rows={5}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="貼上每日行程文字或筆記，例如：&#10;Day 1: 淺草寺、晴空塔、隅田川散步..."
                  className="w-full p-3 rounded-xl border border-[#E5E2DC] dark:border-slate-700 focus:border-teal-600 outline-none font-mono text-[16px] sm:text-xs leading-relaxed bg-[#FAF9F6] dark:bg-slate-900/70 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                />
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={handleAiParse}
                    disabled={!pastedText.trim() || isAiLoading}
                    className="flex-1 min-h-[44px] px-4 py-2.5 bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-45 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition active:scale-[0.99] cursor-pointer"
                  >
                    {isAiLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-teal-100" />
                        <span>{aiStatusStep || '智慧解析中...'}</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-4 h-4 text-teal-100" />
                        <span>智慧行程解析</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleLocalRuleParse}
                    disabled={!pastedText.trim() || isAiLoading}
                    className="min-h-[44px] px-4 py-2.5 bg-[#FAF9F6] dark:bg-slate-800 hover:bg-[#EFECE5] dark:hover:bg-slate-700 border border-[#E5E2DC] dark:border-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    title="無須連網，純本地規則解析"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span>本機快速解析</span>
                  </button>
                </div>
              </div>
            </IosInsetGroup>

            {/* Parsed Preview Result */}
            {parsedPreviewTrip && (
              <IosInsetGroup
                header={
                  parseSource === 'server_ai'
                    ? 'AI 雲端智慧解析結果'
                    : parseSource === 'local_fallback'
                    ? '本機離線規則解析結果'
                    : '檔案解析預覽'
                }
                headerRight={
                  <span className="text-[11px] font-mono tabular-nums font-bold text-teal-700 dark:text-teal-400">
                    {parsedPreviewTrip.days.length} 天 · {parsedPreviewTrip.days.reduce((acc, d) => acc + d.items.length, 0)} 景點
                  </span>
                }
              >
                <div className="px-4 py-3 space-y-1">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    {parsedPreviewTrip.title}
                  </h4>
                  <div className="flex items-center gap-2.5 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-teal-600" />
                      <span>{parsedPreviewTrip.destination}</span>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="flex items-center gap-1 font-mono tabular-nums">
                      <Calendar className="w-3 h-3 text-teal-600" />
                      <span>{parsedPreviewTrip.startDate} ~ {parsedPreviewTrip.endDate}</span>
                    </span>
                  </div>
                </div>

                <div className="max-h-52 overflow-y-auto divide-y divide-[#E5E2DC]/65 dark:divide-slate-800/80">
                  {parsedPreviewTrip.days.map((day) => {
                    const geoCount = day.items.filter((i) => typeof i.lat === 'number').length;
                    return (
                      <div key={day.id} className="px-4 py-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                          <span>Day {day.dayNumber} ({day.date}) {day.theme ? `· ${day.theme}` : ''}</span>
                          <span className="text-[11px] font-mono tabular-nums font-normal text-slate-500">
                            {day.items.length} 站 ({geoCount} 座標)
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                          {day.items.map((it, idx) => (
                            <span key={it.id}>
                              <span className="font-mono tabular-nums text-teal-700 dark:text-teal-400 font-semibold">{it.startTime}</span>{' '}
                              {it.title}
                              {idx < day.items.length - 1 ? ' → ' : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="px-4 py-3 flex items-center justify-end gap-2 bg-[#FAF9F6]/70 dark:bg-slate-900/40">
                  <button
                    type="button"
                    onClick={() => setParsedPreviewTrip(null)}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[#E5E2DC] dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-xs hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    重新調整
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>立即套用並切換</span>
                  </button>
                </div>
              </IosInsetGroup>
            )}
          </>
        )}

        {/* TAB 2: PRESET TRIPS */}
        {activeTab === 'presets' && (
          <IosInsetGroup
            header="經典行程範本"
            footer="點選任一範本即可建立獨立新副本並切換進入編輯，不會影響現有行程。"
          >
            {TRIP_TEMPLATES.map((preset) => (
              <IosRow
                key={preset.id}
                onClick={() => handleLoadPreset(preset)}
                icon={
                  <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                }
                label={preset.title}
                subtitle={
                  <span>
                    {preset.days.length} 天 {preset.days.length - 1} 夜 · {preset.destination} · 預算約 {preset.currency}{' '}
                    <span className="font-mono tabular-nums">{preset.budgetTotal.toLocaleString()}</span>
                  </span>
                }
                trailing={
                  <span className="text-xs font-bold text-teal-700 dark:text-teal-400 flex items-center gap-1">
                    <span>載入</span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </span>
                }
              />
            ))}
          </IosInsetGroup>
        )}

        {/* TAB 3: EXPORT */}
        {activeTab === 'export' && (
          <>
            <IosInsetGroup header="目前旅程摘要">
              <IosRow
                icon={
                  <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 flex items-center justify-center">
                    <HardDrive className="w-4 h-4" />
                  </div>
                }
                label={currentTrip.title}
                subtitle={
                  <span className="font-mono tabular-nums">
                    {currentTrip.days.length} 天行程 · {currentTrip.days.reduce((acc, d) => acc + d.items.length, 0)} 個景點 · {currentTrip.expenses.length} 筆支出
                  </span>
                }
              />
            </IosInsetGroup>

            <IosInsetGroup header="單一旅程匯出格式">
              {onOpenExportPDF && (
                <IosRow
                  onClick={() => {
                    onClose();
                    onOpenExportPDF();
                  }}
                  icon={
                    <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 flex items-center justify-center">
                      <Printer className="w-4 h-4" />
                    </div>
                  }
                  label="匯出紙本 A4 PDF 手冊"
                  subtitle="含日程總表、交通指引與打包清單，適合列印或隨身離線查閱"
                  trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
                />
              )}

              <IosRow
                onClick={handleExportSingleJSON}
                disabled={isExporting}
                icon={
                  <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 flex items-center justify-center">
                    {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </div>
                }
                label="匯出完整 JSON 還原包"
                subtitle="含所有照片、座標與記帳紀錄，可於任何裝置完整還原"
                trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
              />

              <IosRow
                onClick={() => exportTripToCSV(currentTrip)}
                icon={
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                    <Table className="w-4 h-4" />
                  </div>
                }
                label="匯出 Excel / CSV 表格"
                subtitle="標準 UTF-8 BOM 格式，支援 Excel 與 Google 試算表開啟"
                trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
              />

              <IosRow
                onClick={() => exportTripToMarkdown(currentTrip)}
                icon={
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                }
                label="匯出 Markdown 完整筆記"
                subtitle="含日程、待辦、行李與緊急聯絡，適合貼至 Notion 或 Obsidian"
                trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
              />
            </IosInsetGroup>

            <IosInsetGroup
              header="整庫完整備份"
              footer="建議定期下載整庫 JSON 備份，確保所有照片與跨旅程資料雙重保障。"
            >
              <IosRow
                onClick={handleExportAllJSON}
                disabled={isExporting}
                icon={
                  <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center">
                    {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </div>
                }
                label="下載全部旅程總資料庫 (.JSON)"
                subtitle={`包含本地儲存的全部 ${allTrips.length} 個旅程與相片總資料庫`}
                trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
              />
            </IosInsetGroup>
          </>
        )}
      </div>
    </IosModalSheet>
  );
};
