import React, { useState, useEffect } from 'react';
import { Trip } from '../../types/itinerary';
import {
  parseTextItinerary,
  parseCSVItinerary,
  exportTripToJSON,
  exportAllTripsToJSON,
  exportTripToMarkdown,
} from '../../utils/storage';
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
  Compass,
  Loader2,
  Printer,
  Calendar,
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiStatusStep, setAiStatusStep] = useState<string>('');

  // Handle local file read
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.json')) {
          const parsed = JSON.parse(content);
          if (parsed && parsed.title && Array.isArray(parsed.days)) {
            // Standard Trip object
            parsed.id = `imported-${Date.now()}`;
            setParsedPreviewTrip(parsed);
          } else {
            throw new Error('JSON 格式不符合行程結構');
          }
        } else if (fileName.endsWith('.csv')) {
          const trip = parseCSVItinerary(content);
          trip.title = file.name.replace(/\.[^/.]+$/, '');
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

  // AI Intelligent Parse via backend Gemini API
  const handleAiParse = async () => {
    if (!pastedText.trim()) return;
    setErrorMessage(null);
    setIsAiLoading(true);
    setAiStatusStep('AI 正在閱讀行程與辨識景點...');

    try {
      const stepTimer1 = setTimeout(() => {
        setAiStatusStep('正在查詢真實經緯度座標與地理位置...');
      }, 1500);

      const stepTimer2 = setTimeout(() => {
        setAiStatusStep('正在優化每日路線順序與交通指引...');
      }, 3500);

      const res = await fetch('/api/parse-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: pastedText,
          destinationHint: destinationHint.trim() || undefined,
          preferredCurrency: currentTrip.currency,
        }),
      });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `伺服器回應異常 (${res.status})`);
      }

      const trip: Trip = await res.json();
      if (tripTitleInput.trim()) {
        trip.title = tripTitleInput.trim();
      }
      setParsedPreviewTrip(trip);
    } catch (err: any) {
      console.warn('AI parse failed, fallback option available:', err);
      setErrorMessage(`AI 解析未完成: ${err.message}。您可改用下方「純本地離線規則解析」立即完成匯入。`);
    } finally {
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
        className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-100 text-slate-800 my-auto animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">行程檔案解析與匯出中心</h3>
              <p className="text-xs text-slate-500">支援 AI 智慧識別、跨裝置雲端備份與多格式匯出</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switching */}
        <div className="flex border-b border-slate-200 px-5 pt-2 bg-slate-50/40 text-xs font-semibold gap-4">
          <button
            onClick={() => { setActiveTab('import'); setParsedPreviewTrip(null); }}
            className={`pb-2.5 border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'import' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Upload className="w-4 h-4" />
            上傳與智慧解析
          </button>
          <button
            onClick={() => { setActiveTab('presets'); setParsedPreviewTrip(null); }}
            className={`pb-2.5 border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'presets' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            載入示範經典行程
          </button>
          <button
            onClick={() => { setActiveTab('export'); setParsedPreviewTrip(null); }}
            className={`pb-2.5 border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'export' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Download className="w-4 h-4" />
            離線備份與匯出
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
              <div className="relative border-2 border-dashed border-teal-500/40 bg-teal-50/30 hover:bg-teal-50/60 rounded-2xl p-5 text-center transition cursor-pointer group">
                <input
                  type="file"
                  accept=".json,.csv,.txt,.md"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="font-bold text-slate-800 text-xs sm:text-sm">點擊上傳或拖放旅遊行程檔案</p>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  支援 <strong>.JSON</strong>、<strong>.CSV</strong>、或旅行社旅遊通知 <strong>.TXT / .MD</strong>
                </p>
              </div>

              {/* Paste Text & Configuration */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-teal-600" />
                    行程文字內容（或直接貼上旅行社行程、網誌攻略、自由行筆記）
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
                    className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs outline-none focus:border-teal-500"
                  />
                  <input
                    type="text"
                    value={destinationHint}
                    onChange={(e) => setDestinationHint(e.target.value)}
                    placeholder="目的地城市提示（選填，例如：日本京都、法國巴黎）"
                    className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs outline-none focus:border-teal-500"
                  />
                </div>

                <textarea
                  rows={5}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`請貼上任意旅遊文字，例如：\nDay 1: 成田機場到上野放行李，下午淺草寺雷門拍照，傍晚晴空塔看夜景\nDay 2: 早上明治神宮，中午原宿竹下通吃可麗餅，下午涉谷十字路口與 SHIBUYA SKY 看夕陽\nDay 3: 新宿御苑漫步，下午去下北澤古著選品，晚上六本木之丘森美術館看東京鐵塔`}
                  className="w-full p-3 rounded-xl border border-slate-300 focus:border-teal-500 outline-none font-mono text-[11px] leading-relaxed bg-slate-50/50"
                />

                {/* Parsing Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
                  {/* AI Parse Button */}
                  <button
                    type="button"
                    onClick={handleAiParse}
                    disabled={!pastedText.trim() || isAiLoading}
                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-teal-600 via-teal-700 to-cyan-800 hover:opacity-95 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition active:scale-98"
                  >
                    {isAiLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-teal-200" />
                        <span>{aiStatusStep || 'AI 智慧解析中...'}</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-4 h-4 text-cyan-200" />
                        <span>AI 智慧解析 (自動生成每日行程、精確座標與路線圖)</span>
                      </>
                    )}
                  </button>

                  {/* Local Offline Parser Button */}
                  <button
                    type="button"
                    onClick={handleLocalRuleParse}
                    disabled={!pastedText.trim() || isAiLoading}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
                    title="無須連網，純本地規則解析"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span>本地離線快速解析</span>
                  </button>
                </div>
              </div>

              {/* Parsed Preview Result */}
              {parsedPreviewTrip && (
                <div className="mt-4 p-4 rounded-2xl bg-teal-50/90 border border-teal-200 text-teal-950 animate-in fade-in zoom-in-95 duration-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-teal-200/80">
                    <div>
                      <span className="px-2 py-0.5 rounded bg-teal-700 text-white font-bold text-[10px] uppercase">
                        解析完成預覽
                      </span>
                      <h4 className="font-black text-sm text-teal-950 mt-1">
                        {parsedPreviewTrip.title}
                      </h4>
                      <p className="text-[11px] text-teal-700 mt-0.5 flex items-center gap-2">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-teal-600" />
                          <span>{parsedPreviewTrip.destination}</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-teal-600" />
                          <span>{parsedPreviewTrip.startDate} ~ {parsedPreviewTrip.endDate}</span>
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 bg-white border border-teal-200 text-teal-800 rounded-lg text-xs font-bold shadow-2xs">
                        共 {parsedPreviewTrip.days.length} 天行程
                      </span>
                      <span className="px-2.5 py-1 bg-teal-600 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-teal-200" />
                        {parsedPreviewTrip.days.reduce((acc, d) => acc + d.items.length, 0)} 個景點
                      </span>
                    </div>
                  </div>

                  {/* Day breakdown preview */}
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {parsedPreviewTrip.days.map((day) => {
                      const geoCount = day.items.filter((i) => typeof i.lat === 'number').length;
                      return (
                        <div key={day.id} className="bg-white/90 p-2.5 rounded-xl border border-teal-100/90">
                          <div className="flex items-center justify-between font-bold text-xs text-teal-950">
                            <span>第 {day.dayNumber} 天 ({day.date}): {day.theme || '主要行程'}</span>
                            <span className="text-[10px] text-teal-700 font-normal">
                              {day.items.length} 景點 ({geoCount} 處含地圖座標)
                            </span>
                          </div>

                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {day.items.map((it, idx) => (
                              <span
                                key={it.id}
                                className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[10px] font-medium flex items-center gap-1"
                              >
                                <span className="font-mono text-teal-700 font-bold">{it.startTime}</span>
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
                  <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-teal-200/80">
                    <button
                      type="button"
                      onClick={() => setParsedPreviewTrip(null)}
                      className="px-3.5 py-2 border border-teal-300 rounded-xl text-teal-800 font-semibold text-xs hover:bg-teal-100/50"
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
              <p className="text-slate-600 text-xs">
                精選行程範本庫（點選「載入為新行程」即可將範例存入您的個人行程庫中自由調整）：
              </p>
              <div className="grid grid-cols-1 gap-3">
                {TRIP_TEMPLATES.map((preset) => (
                  <div
                    key={preset.id}
                    className="p-4 rounded-xl border border-slate-200 hover:border-teal-500 bg-white hover:shadow-md transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800">
                          {preset.days.length} 天 {preset.days.length - 1} 夜
                        </span>
                        <h4 className="font-bold text-slate-900 text-sm">{preset.title}</h4>
                      </div>
                      <p className="text-slate-500 text-[11px] mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-teal-600 shrink-0" />
                        <span>{preset.destination} | 預算約 {preset.currency} {preset.budgetTotal.toLocaleString()}</span>
                      </p>
                      <p className="text-slate-600 text-[11px] mt-0.5 line-clamp-1">{preset.notes}</p>
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
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <h4 className="font-bold text-slate-800 text-sm mb-1 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-teal-600" />
                  目前行程：{currentTrip.title}
                </h4>
                <p className="text-slate-500 text-xs">
                  共 {currentTrip.days.length} 天行程、{currentTrip.days.reduce((acc, d) => acc + d.items.length, 0)} 個景點安排、{currentTrip.expenses.length} 筆花費記錄
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-4">
                  {onOpenExportPDF && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenExportPDF();
                      }}
                      className="p-3 bg-teal-50/80 border border-teal-200 hover:border-teal-500 rounded-xl text-left transition shadow-xs group"
                    >
                      <div className="flex items-center gap-2 font-bold text-teal-950 text-xs">
                        <Printer className="w-4 h-4 text-teal-700 group-hover:scale-110 transition-transform" />
                        匯出紙本 PDF 手冊
                      </div>
                      <p className="text-[11px] text-teal-800 mt-1">A4 排版離線手冊，含日程、交通指引與打包清單。</p>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => exportTripToJSON(currentTrip)}
                    className="p-3 bg-white border border-slate-200 hover:border-teal-500 hover:bg-teal-50/30 rounded-xl text-left transition shadow-xs group"
                  >
                    <div className="flex items-center gap-2 font-bold text-teal-900 text-xs">
                      <Download className="w-4 h-4 text-teal-600 group-hover:translate-y-0.5 transition-transform" />
                      匯出單一旅程 JSON
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">包含所有景點、經緯度座標與花費，可在任何設備重新匯入。</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => exportTripToMarkdown(currentTrip)}
                    className="p-3 bg-white border border-slate-200 hover:border-teal-500 hover:bg-teal-50/30 rounded-xl text-left transition shadow-xs group"
                  >
                    <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                      <FileText className="w-4 h-4 text-slate-600 group-hover:translate-y-0.5 transition-transform" />
                      匯出 Markdown / 備忘
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">純文字格式，適合複製到 Notion 或 Apple 備忘錄。</p>
                  </button>
                </div>
              </div>

              {/* Full database export */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-slate-800 text-xs">整庫完整備份 (所有旅程)</h5>
                    <p className="text-slate-500 text-[11px]">包含本地儲存的全部 {allTrips.length} 個旅程總資料庫。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => exportAllTripsToJSON(allTrips)}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    完整備份下載
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};
