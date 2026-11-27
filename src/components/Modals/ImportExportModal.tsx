import React, { useState, useEffect } from 'react';
import { Trip } from '../../types/itinerary';
import {
  parseTextItinerary,
  parseCSVItinerary,
  exportTripToJSON,
  exportAllTripsToJSON,
  exportTripToMarkdown,
  exportTripToCSV,
} from '../../utils/storage';
import { universalParseItinerary, checkAiAvailability, AiBackendMode } from '../../utils/aiClient';
import { extractInlineImagesToMediaRefs, rebindTripMediaIds } from '../../utils/image';
import { getTodayLocal } from '../../utils/date';
import { TRIP_TEMPLATES } from '../../data/presetTrips';
import {
  IosModalSheet,
  IosNavBar,
  IosInsetGroup,
  IosRow,
  IosDisclosureRow,
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
  const [parsedMultiTrips, setParsedMultiTrips] = useState<Trip[] | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isConfirmingImport, setIsConfirmingImport] = useState(false);
  const [parseSource, setParseSource] = useState<'server_ai' | 'local_fallback' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiStatusStep, setAiStatusStep] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [aiMode, setAiMode] = useState<AiBackendMode>('local_only');
  const [showAdvancedExportFormats, setShowAdvancedExportFormats] = useState(false);
  const previewSectionRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (parsedPreviewTrip || (parsedMultiTrips && parsedMultiTrips.length > 0)) {
      const timer = window.setTimeout(() => {
        previewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return () => window.clearTimeout(timer);
    }
  }, [parsedPreviewTrip, parsedMultiTrips]);

  useEffect(() => {
    let active = true;
    checkAiAvailability().then((mode) => {
      if (active) setAiMode(mode);
    });
    return () => {
      active = false;
    };
  }, []);

  const normalizeImportedTrip = (candidate: any, idx = 0): Trip => {
    const today = getTodayLocal();
    const days = Array.isArray(candidate.days) ? candidate.days.slice(0, 60) : [];
    const safeTitle = String(candidate.title || '匯入旅程').trim().slice(0, 180) || '匯入旅程';
    const safeDestination =
      String(candidate.destination || '自訂目的地').trim().slice(0, 120) || '自訂目的地';
    const startDate =
      typeof candidate.startDate === 'string' && candidate.startDate.trim()
        ? candidate.startDate
        : days[0]?.date || today;
    const endDate =
      typeof candidate.endDate === 'string' && candidate.endDate.trim()
        ? candidate.endDate
        : days[days.length - 1]?.date || startDate;

    return {
      ...candidate,
      id: `imported-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      title: safeTitle,
      destination: safeDestination,
      startDate,
      endDate,
      currency: typeof candidate.currency === 'string' && candidate.currency ? candidate.currency : 'JPY',
      budgetTotal:
        typeof candidate.budgetTotal === 'number' && Number.isFinite(candidate.budgetTotal) && candidate.budgetTotal >= 0
          ? candidate.budgetTotal
          : 50000,
      notes: typeof candidate.notes === 'string' ? candidate.notes.slice(0, 19000) : '',
      days,
      todos: Array.isArray(candidate.todos) ? candidate.todos : [],
      packingList: Array.isArray(candidate.packingList) ? candidate.packingList : [],
      expenses: Array.isArray(candidate.expenses) ? candidate.expenses : [],
      bookings: Array.isArray(candidate.bookings) ? candidate.bookings : [],
      memories: Array.isArray(candidate.memories) ? candidate.memories : [],
      emergencyContacts: Array.isArray(candidate.emergencyContacts) ? candidate.emergencyContacts : [],
      shareId: undefined,
      collabId: undefined,
      isCollaborative: false,
      collaborators: undefined,
      editorEmails: undefined,
      viewerEmails: undefined,
      generalAccess: undefined,
      ownerId: undefined,
      ownerEmail: undefined,
      lastSyncedAt: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  };

  const processUploadedFile = (file: File) => {
    setErrorMessage(null);
    setParsedMultiTrips(null);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.json')) {
          const rawParsed = JSON.parse(content);
          if (Array.isArray(rawParsed)) {
            const validList = rawParsed.filter(
              (item) => item && typeof item.title === 'string' && Array.isArray(item.days)
            );
            if (validList.length === 0) {
              throw new Error('JSON 陣列中找不到有效的行程結構');
            }
            if (validList.length === 1) {
              setParseSource(null);
              setParsedPreviewTrip(normalizeImportedTrip(validList[0], 0));
            } else {
              // Full multi-trip database backup round-trip support!
              setParseSource(null);
              setParsedPreviewTrip(null);
              setParsedMultiTrips(validList.map((item, idx) => normalizeImportedTrip(item, idx)));
            }
          } else if (rawParsed && typeof rawParsed.title === 'string' && Array.isArray(rawParsed.days)) {
            // Defer IDB media extraction until user actually clicks Confirm Import (prevents IDB media leaks on cancel)
            setParseSource(null);
            setParsedPreviewTrip(normalizeImportedTrip(rawParsed, 0));
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input value immediately so user can re-select the same file after editing
    e.target.value = '';
    if (!file) return;
    processUploadedFile(file);
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

  const handleConfirmImport = async () => {
    if (isConfirmingImport) return;
    if (parsedMultiTrips && parsedMultiTrips.length > 0) {
      setIsConfirmingImport(true);
      try {
        for (const tItem of parsedMultiTrips) {
          const { trip: offloaded } = await extractInlineImagesToMediaRefs(tItem);
          const rebound = await rebindTripMediaIds(offloaded, tItem.id);
          await onImportTrip(rebound);
        }
        onClose();
      } catch (err: any) {
        setErrorMessage(`批次還原失敗: ${err?.message || '未知錯誤'}`);
      } finally {
        setIsConfirmingImport(false);
      }
      return;
    }
    if (parsedPreviewTrip) {
      setIsConfirmingImport(true);
      try {
        const { trip: offloaded } = await extractInlineImagesToMediaRefs(parsedPreviewTrip);
        const rebound = await rebindTripMediaIds(offloaded, parsedPreviewTrip.id);
        await onImportTrip(rebound);
        onClose();
      } catch (err: any) {
        setErrorMessage(`匯入失敗: ${err?.message || '未知錯誤'}`);
      } finally {
        setIsConfirmingImport(false);
      }
    }
  };

  const handleLoadPreset = (preset: Trip) => {
    const cloned: Trip = JSON.parse(JSON.stringify(preset));
    const now = Date.now();
    const uid = `${now}-${Math.random().toString(36).slice(2, 6)}`;
    const spotIdMap = new Map<string, string>();
    cloned.id = `preset-copy-${uid}`;
    cloned.title = `${preset.title} (新副本)`;
    cloned.days = (cloned.days || []).map((d, dIdx) => ({
      ...d,
      id: `day-${uid}-${dIdx + 1}`,
      items: (d.items || []).map((it, iIdx) => {
        const newSpotId = `item-${uid}-${dIdx + 1}-${iIdx + 1}`;
        spotIdMap.set(it.id, newSpotId);
        return { ...it, id: newSpotId };
      }),
    }));
    cloned.todos = (cloned.todos || []).map((td, idx) => ({ ...td, id: `todo-${uid}-${idx}` }));
    cloned.packingList = (cloned.packingList || []).map((pk, idx) => ({ ...pk, id: `pack-${uid}-${idx}` }));
    cloned.expenses = (cloned.expenses || []).map((ex, idx) => ({ ...ex, id: `exp-${uid}-${idx}` }));
    cloned.bookings = (cloned.bookings || []).map((bk, idx) => ({ ...bk, id: `bk-${uid}-${idx}` }));
    cloned.memories = (cloned.memories || []).map((m, idx) => ({
      ...m,
      id: `mem-${uid}-${idx}`,
      ...(m.spotId && spotIdMap.has(m.spotId) ? { spotId: spotIdMap.get(m.spotId) } : {}),
    }));
    cloned.emergencyContacts = (cloned.emergencyContacts || []).map((ec, idx) => ({ ...ec, id: `ec-${uid}-${idx}` }));
    cloned.settlements = [];
    cloned.settledTransfers = {};
    delete cloned.collabId;
    cloned.isCollaborative = false;
    delete cloned.collaborators;
    delete cloned.editorEmails;
    delete cloned.viewerEmails;
    delete cloned.generalAccess;
    delete cloned.ownerId;
    delete cloned.ownerEmail;
    delete cloned.lastSyncedAt;
    cloned.createdAt = now;
    cloned.updatedAt = now;
    onImportTrip(cloned);
    onClose();
  };

  const switchTab = (tab: 'import' | 'presets' | 'export') => {
    setActiveTab(tab);
    setParsedPreviewTrip(null);
    setParsedMultiTrips(null);
    setParseSource(null);
    setErrorMessage(null);
  };

  const hasPendingImport = Boolean(parsedPreviewTrip || (parsedMultiTrips && parsedMultiTrips.length > 0));

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
        rightLabel={activeTab === 'import' && hasPendingImport ? '套用匯入' : '完成'}
        rightLoading={isConfirmingImport}
        onRightClick={activeTab === 'import' && hasPendingImport ? handleConfirmImport : onClose}
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
              footer="支援單一或多筆 .JSON 整庫備份包、.CSV 試算表或旅行社行程 .TXT / .MD。"
            >
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) processUploadedFile(dropped);
                }}
                className={`relative flex items-center gap-3.5 px-4 py-3.5 min-h-[64px] cursor-pointer transition group ${
                  isDraggingFile
                    ? 'bg-teal-50/80 dark:bg-teal-950/50 ring-2 ring-inset ring-teal-500'
                    : 'hover:bg-[#FAF9F6] dark:hover:bg-slate-800/45'
                }`}
              >
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
                  placeholder="選填（如：山陽 7 日）"
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
                  placeholder="選填（如：日本岡山）"
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
                  {aiMode !== 'local_only' ? (
                    <>
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
                            <span>{aiMode === 'byok' ? 'AI 行程解析（自訂 Key）' : 'AI 智慧行程解析'}</span>
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
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleLocalRuleParse}
                      disabled={!pastedText.trim() || isAiLoading}
                      className="flex-1 min-h-[44px] px-4 py-2.5 bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-45 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition active:scale-[0.99] cursor-pointer"
                      title="離線或靜態部署自動採用免 Key 本機解析；如需進階 AI 解析可至設定填寫 Gemini API Key"
                    >
                      <Zap className="w-4 h-4 text-amber-300" />
                      <span>智慧規則解析（免 Key 離線可用）</span>
                    </button>
                  )}
                </div>
                {aiMode === 'local_only' && (
                  <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                    目前為純前端環境，已自動隱藏雲端 AI 伺服器入口；如需使用 Gemini AI 解析，可於「系統設定 → 自訂 Gemini API Key」填入個人金鑰。
                  </p>
                )}
              </div>
            </IosInsetGroup>

            {/* Anchor for auto-scrolling parsed previews into mobile viewport */}
            <div ref={previewSectionRef} />

            {/* Multi-Trip Backup Preview */}
            {parsedMultiTrips && parsedMultiTrips.length > 0 && (
              <IosInsetGroup
                header="整庫 JSON 備份還原預覽"
                headerRight={
                  <span className="text-[11px] font-mono tabular-nums font-bold text-teal-700 dark:text-teal-400">
                    共 {parsedMultiTrips.length} 趟旅程
                  </span>
                }
              >
                <div className="max-h-56 overflow-y-auto divide-y divide-[#E5E2DC]/65 dark:divide-slate-800/80">
                  {parsedMultiTrips.map((tr) => (
                    <div key={tr.id} className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white truncate">{tr.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                          {tr.destination} · {tr.startDate} ~ {tr.endDate}
                        </p>
                      </div>
                      <span className="text-[11px] font-mono text-teal-700 dark:text-teal-400 shrink-0">
                        {tr.days.length} 天
                      </span>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 flex items-center justify-end gap-2 bg-[#FAF9F6]/70 dark:bg-slate-900/40">
                  <button
                    type="button"
                    onClick={() => setParsedMultiTrips(null)}
                    className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl border border-[#E5E2DC] dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-xs hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={isConfirmingImport}
                    onClick={handleConfirmImport}
                    className="min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {isConfirmingImport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>全部匯入 ({parsedMultiTrips.length})</span>
                  </button>
                </div>
              </IosInsetGroup>
            )}

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
                    disabled={isConfirmingImport}
                    onClick={handleConfirmImport}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {isConfirmingImport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>{isConfirmingImport ? '匯入中...' : '立即套用並切換'}</span>
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

            <IosInsetGroup
              header="常用匯出與備份"
              footer="建議定期下載完整 JSON 備份，確保所有照片與跨旅程資料雙重保障。"
            >
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
                  label="匯出精美 A4 PDF 手冊"
                  subtitle="含日程總表、交通指引與聯絡資訊，適合列印或隨身離線查閱"
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
                label="備份目前旅程 (.JSON)"
                subtitle="含所有照片、座標與記帳紀錄，可於任何裝置完整還原"
                trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
              />

              <IosRow
                onClick={handleExportAllJSON}
                disabled={isExporting}
                icon={
                  <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center">
                    {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
                  </div>
                }
                label="一鍵備份全部旅程 (.JSON)"
                subtitle={`一次打包本機全部 ${allTrips.length} 趟旅程與相片資料庫`}
                trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
              />
            </IosInsetGroup>

            <IosInsetGroup header="進階格式（選用）">
              <IosDisclosureRow
                icon={<FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
                label="CSV 表格與 Markdown 筆記"
                value="2 種格式"
                expanded={showAdvancedExportFormats}
                onToggle={() => setShowAdvancedExportFormats((v) => !v)}
              >
                <div className="divide-y divide-[#E5E2DC]/70 dark:divide-slate-800/80">
                  <IosRow
                    onClick={() => exportTripToCSV(currentTrip)}
                    icon={
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                        <Table className="w-4 h-4" />
                      </div>
                    }
                    label="匯出 Excel / CSV 表格"
                    subtitle="標準 UTF-8 格式，適合 Excel 與 Google 試算表開啟"
                    trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
                  />
                  <IosRow
                    onClick={() => exportTripToMarkdown(currentTrip)}
                    icon={
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
                        <FileText className="w-4 h-4" />
                      </div>
                    }
                    label="匯出 Markdown 筆記"
                    subtitle="適合貼至 Notion、Obsidian 或純文字歸檔"
                    trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
                  />
                </div>
              </IosDisclosureRow>
            </IosInsetGroup>
          </>
        )}
      </div>
    </IosModalSheet>
  );
};
