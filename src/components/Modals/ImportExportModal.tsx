import React, { useState, useEffect } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
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
  X,
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
  Clock,
  Loader2,
  Printer,
  Calendar,
  Table,
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
  useBodyScrollLock(true);
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

  // Handle local file read
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
          // Plain text / Markdown
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

  // Universal Smart Parse (uses server proxy when available, seamless local rule fallback offline or on static hosts)
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

  // Local Offline Rule Parser (Zero external call, 100% offline)
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#111827] shadow-2xl border border-[#E5E2DC] dark:border-slate-800 text-slate-800 dark:text-slate-100 my-auto animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-700 text-white flex items-center justify-center font-bold">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">行程檔案解析與匯出中心</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-[#EFECE5] dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
            aria-label="關閉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switching */}
        <div className="flex border-b border-[#E5E2DC] dark:border-slate-800 px-5 pt-1 bg-[#FAF9F6] dark:bg-slate-900/40 text-xs font-semibold gap-4 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => { setActiveTab('import'); setParsedPreviewTrip(null); setParseSource(null); }}
            className={`min-h-[44px] pb-2 pt-2 border-b-2 flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'import' ? 'border-teal-700 text-teal-700 dark:text-teal-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>上傳與智慧解析</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('presets'); setParsedPreviewTrip(null); setParseSource(null); }}
            className={`min-h-[44px] pb-2 pt-2 border-b-2 flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'presets' ? 'border-teal-700 text-teal-700 dark:text-teal-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>載入示範經典行程</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('export'); setParsedPreviewTrip(null); setParseSource(null); }}
            className={`min-h-[44px] pb-2 pt-2 border-b-2 flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'export' ? 'border-teal-700 text-teal-700 dark:text-teal-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>離線備份與匯出</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* TAB 1: IMPORT & PARSE */}
          {activeTab === 'import' && (
            <>
              {/* File Dropzone */}
              <div className="relative border-2 border-dashed border-teal-500/40 bg-teal-50/30 dark:bg-teal-950/20 hover:bg-teal-50/60 dark:hover:bg-teal-950/40 rounded-2xl p-5 text-center transition cursor-pointer group">
                <input
                  type="file"
                  accept=".json,.csv,.txt,.md"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm">點擊上傳或拖放旅遊行程檔案</p>
                <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                  支援 <strong>.JSON</strong>、<strong>.CSV</strong>、或旅行社旅遊通知 <strong>.TXT / .MD</strong>
                </p>
              </div>

              {/* Paste Text & Configuration */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-teal-600" />
                    貼上行程文字或筆記
                  </label>
                  {pastedText && (
                    <button
                      type="button"
                      onClick={() => setPastedText('')}
                      className="text-[11px] text-slate-400 hover:text-rose-500"
                    >
                      清空
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={tripTitleInput}
                    onChange={(e) => setTripTitleInput(e.target.value)}
                    placeholder="行程名稱（選填，例如：東京自由行 5 日）"
                    className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs outline-none focus:border-teal-500"
                  />
                  <input
                    type="text"
                    value={destinationHint}
                    onChange={(e) => setDestinationHint(e.target.value)}
                    placeholder="目的地城市提示（選填，例如：日本京都、法國巴黎）"
                    className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs outline-none focus:border-teal-500"
                  />
                </div>

                <textarea
                  rows={5}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Day 1: 淺草寺、晴空塔..."
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 focus:border-teal-500 outline-none font-mono text-[11px] leading-relaxed bg-slate-50/50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                />

                {/* Parsing Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
                  {/* AI Parse Button */}
                  <button
                    type="button"
                    onClick={handleAiParse}
                    disabled={!pastedText.trim() || isAiLoading}
                    className="flex-1 min-h-[44px] sm:min-h-[40px] px-4 py-2.5 bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-98 cursor-pointer"
                  >
                    {isAiLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-teal-200" />
                        <span>{aiStatusStep || '智慧解析中...'}</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-4 h-4 text-teal-100" />
                        <span>智慧行程解析</span>
                      </>
                    )}
                  </button>

                  {/* Local Offline Parser Button */}
                  <button
                    type="button"
                    onClick={handleLocalRuleParse}
                    disabled={!pastedText.trim() || isAiLoading}
                    className="min-h-[44px] sm:min-h-[40px] px-4 py-2.5 bg-[#FAF9F6] dark:bg-slate-800 hover:bg-[#EFECE5] dark:hover:bg-slate-700 border border-[#E5E2DC] dark:border-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    title="無須連網，純本地規則解析"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span>本地離線快速解析</span>
                  </button>
                </div>
              </div>

              {/* Parsed Preview Result */}
              {parsedPreviewTrip && (
                <div className="mt-4 p-4 rounded-2xl bg-teal-50/90 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800/80 text-teal-950 dark:text-teal-100 animate-in fade-in zoom-in-95 duration-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-teal-200/80 dark:border-teal-800/80">
                    <div>
                      <span className="text-teal-700 dark:text-teal-300 font-bold text-[11px]">
                        {parseSource === 'server_ai'
                          ? 'AI 雲端智慧解析完成'
                          : parseSource === 'local_fallback'
                          ? '本機離線規則解析完成'
                          : '行程檔案解析完成'}
                      </span>
                      <h4 className="font-black text-sm text-teal-950 dark:text-teal-100 mt-0.5">
                        {parsedPreviewTrip.title}
                      </h4>
                      <p className="text-[11px] text-teal-700 dark:text-teal-300 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-teal-600" />
                          <span>{parsedPreviewTrip.destination}</span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="flex items-center gap-1 font-mono tabular-nums">
                          <Calendar className="w-3 h-3 text-teal-600" />
                          <span>{parsedPreviewTrip.startDate} ~ {parsedPreviewTrip.endDate}</span>
                        </span>
                      </p>
                    </div>

                    <div className="text-xs font-mono tabular-nums font-bold text-teal-800 dark:text-teal-200 shrink-0">
                      共 {parsedPreviewTrip.days.length} 天 · {parsedPreviewTrip.days.reduce((acc, d) => acc + d.items.length, 0)} 個景點
                    </div>
                  </div>

                  {/* Day breakdown preview */}
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {parsedPreviewTrip.days.map((day) => {
                      const geoCount = day.items.filter((i) => typeof i.lat === 'number').length;
                      return (
                        <div key={day.id} className="bg-white/90 dark:bg-slate-800/80 p-2.5 rounded-xl border border-teal-100/90 dark:border-teal-900/60">
                          <div className="flex items-center justify-between font-bold text-xs text-teal-950 dark:text-teal-200">
                            <span>第 {day.dayNumber} 天 ({day.date}): {day.theme || '主要行程'}</span>
                            <span className="text-[10px] text-teal-700 dark:text-teal-400 font-normal">
                              {day.items.length} 景點 ({geoCount} 處含地圖座標)
                            </span>
                          </div>

                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {day.items.map((it) => (
                              <span
                                key={it.id}
                                className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-[10px] font-medium flex items-center gap-1"
                              >
                                <span className="font-mono text-teal-700 dark:text-teal-300 font-bold">{it.startTime}</span>
                                <span className="truncate max-w-[120px]">{it.title}</span>
                                {typeof it.lat === 'number' && <MapPin className="w-2.5 h-2.5 text-teal-600 inline shrink-0" />}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Confirm import button */}
                  <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-teal-200/80 dark:border-teal-800/80">
                    <button
                      type="button"
                      onClick={() => setParsedPreviewTrip(null)}
                      className="px-3.5 py-2 border border-teal-300 dark:border-teal-700 rounded-xl text-teal-800 dark:text-teal-300 font-semibold text-xs hover:bg-teal-100/50 dark:hover:bg-teal-900/40"
                    >
                      重新調整
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmImport}
                      className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs shadow-md transition active:scale-95 flex items-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      立即套用並切換至此行程
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 2: PRESET TRIPS (Templates) */}
          {activeTab === 'presets' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3">
                {TRIP_TEMPLATES.map((preset) => (
                  <div
                    key={preset.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-teal-500 dark:hover:border-teal-500 bg-white dark:bg-slate-800/80 hover:shadow-md transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800">
                          {preset.days.length} 天 {preset.days.length - 1} 夜
                        </span>
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm">{preset.title}</h4>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-teal-600 shrink-0" />
                        <span>{preset.destination} | 預算約 {preset.currency} {preset.budgetTotal.toLocaleString()}</span>
                      </p>
                      <p className="text-slate-600 dark:text-slate-300 text-[11px] mt-0.5 line-clamp-1">{preset.notes}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleLoadPreset(preset)}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl text-xs shrink-0 shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      載入為新行程
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: EXPORT */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80">
                <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-teal-600" />
                  目前行程：{currentTrip.title}
                </h4>
                <p className="text-slate-500 dark:text-slate-400 text-xs">
                  共 {currentTrip.days.length} 天行程、{currentTrip.days.reduce((acc, d) => acc + d.items.length, 0)} 個景點安排、{currentTrip.expenses.length} 筆花費記錄
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4">
                  {onOpenExportPDF && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenExportPDF();
                      }}
                      className="p-3 bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/80 hover:border-teal-500 rounded-xl text-left transition shadow-xs group cursor-pointer"
                    >
                      <div className="flex items-center gap-2 font-bold text-teal-950 dark:text-teal-200 text-xs">
                        <Printer className="w-4 h-4 text-teal-700 group-hover:scale-110 transition-transform" />
                        匯出紙本 PDF 手冊
                      </div>
                      <p className="text-[11px] text-teal-800 dark:text-teal-300 mt-1">A4 排版離線手冊，含日程、交通指引與打包清單。</p>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={handleExportSingleJSON}
                    className="p-3 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-teal-500 hover:bg-teal-50/30 dark:hover:bg-teal-950/30 rounded-xl text-left transition shadow-xs group disabled:opacity-60 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 font-bold text-teal-900 dark:text-teal-200 text-xs">
                      {isExporting ? (
                        <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                      ) : (
                        <Download className="w-4 h-4 text-teal-600 group-hover:translate-y-0.5 transition-transform" />
                      )}
                      匯出單一旅程 JSON
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">完整還原包（含照片、座標與記帳），可在任何裝置匯入。</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => exportTripToCSV(currentTrip)}
                    className="p-3 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-teal-500 hover:bg-teal-50/30 dark:hover:bg-teal-950/30 rounded-xl text-left transition shadow-xs group cursor-pointer"
                  >
                    <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 text-xs">
                      <Table className="w-4 h-4 text-emerald-600 group-hover:translate-y-0.5 transition-transform" />
                      匯出 Excel / CSV 表格
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">標準 UTF-8 BOM 格式，支援 Excel 與 Google 試算表直接開啟。</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => exportTripToMarkdown(currentTrip)}
                    className="p-3 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-teal-500 hover:bg-teal-50/30 dark:hover:bg-teal-950/30 rounded-xl text-left transition shadow-xs group cursor-pointer"
                  >
                    <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 text-xs">
                      <FileText className="w-4 h-4 text-slate-600 group-hover:translate-y-0.5 transition-transform" />
                      匯出 Markdown 完整筆記
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">含日程、待辦、行李、花費與緊急聯絡，適合貼至 Notion。</p>
                  </button>
                </div>
              </div>

              {/* Full database export */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h5 className="font-bold text-slate-800 dark:text-slate-100 text-xs">整庫完整備份 (所有旅程)</h5>
                    <p className="text-slate-500 dark:text-slate-400 text-[11px]">包含本地儲存的全部 {allTrips.length} 個旅程與相片總資料庫。</p>
                  </div>
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={handleExportAllJSON}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shrink-0 cursor-pointer"
                  >
                    {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    <span>完整備份下載</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-900/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] sm:min-h-[38px] px-5 py-2 rounded-xl bg-[#EFECE5] dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold text-xs transition cursor-pointer"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};
