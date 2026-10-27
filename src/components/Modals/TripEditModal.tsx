import React, { useState, useEffect } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { Trip } from '../../types/itinerary';
import { PRESET_TRIPS } from '../../data/presetTrips';
import { generateAiTrip, universalParseItinerary } from '../../utils/aiClient';
import { HiyoriLogo } from '../UI/HiyoriLogo';
import { resolveDestinationTimezone } from '../../utils/timezone';
import {
  X,
  Calendar,
  MapPin,
  Sparkles,
  Copy,
  Loader2,
  ClipboardPaste,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  User,
  ExternalLink,
} from 'lucide-react';

interface TripEditModalProps {
  trip?: Trip | null;
  onSave: (tripData: Partial<Trip> | Trip) => void;
  onClose: () => void;
}

const GRADIENTS = [
  { label: '翡翠森綠', class: 'from-emerald-600 via-teal-600 to-cyan-700' },
  { label: '琉璃蔚藍', class: 'from-blue-600 via-indigo-600 to-violet-700' },
  { label: '古都暖橙', class: 'from-amber-700 via-orange-600 to-rose-700' },
  { label: '緋紅櫻粉', class: 'from-rose-600 via-pink-600 to-purple-700' },
  { label: '深邃夜幕', class: 'from-slate-800 via-zinc-800 to-stone-900' },
];

const CURRENCIES = [
  { value: 'JPY', label: '日圓 (JPY ¥)' },
  { value: 'TWD', label: '新台幣 (TWD NT$)' },
  { value: 'USD', label: '美元 (USD $)' },
  { value: 'EUR', label: '歐元 (EUR €)' },
  { value: 'KRW', label: '韓元 (KRW ₩)' },
  { value: 'THB', label: '泰銖 (THB ฿)' },
];

export const TripEditModal: React.FC<TripEditModalProps> = ({ trip, onSave, onClose }) => {
  useBodyScrollLock(true);
  const isEditing = Boolean(trip);
  const today = new Date().toISOString().slice(0, 10);
  const defaultEnd = new Date(Date.now() + 86400000 * 4).toISOString().slice(0, 10);

  // 1. Core Minimal Fields (Apple / Notion Single-Page)
  const [title, setTitle] = useState(trip?.title || '');
  const [destination, setDestination] = useState(trip?.destination || '');
  const [startDate, setStartDate] = useState(trip?.startDate || today);
  const [endDate, setEndDate] = useState(trip?.endDate || defaultEnd);
  const [isPhotoMemoryOnly, setIsPhotoMemoryOnly] = useState(false);
  const [isSoloTrip, setIsSoloTrip] = useState<boolean>(trip?.isSoloTrip ?? false);
  const [currency, setCurrency] = useState(trip?.currency || 'JPY');
  const [coverGradient, setCoverGradient] = useState(trip?.coverGradient || GRADIENTS[0].class);
  const [googlePhotosAlbumUrl, setGooglePhotosAlbumUrl] = useState(trip?.googlePhotosAlbumUrl || '');

  // 2. Folded Advanced Options (AI / Paste / Preset)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedSubTab, setAdvancedSubTab] = useState<'ai' | 'paste' | 'preset'>('ai');

  // AI Generation State
  const [aiStyle, setAiStyle] = useState('classic');
  const [aiPreferences, setAiPreferences] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiGenError, setAiGenError] = useState<string | null>(null);

  // Paste Text State
  const [pastedText, setPastedText] = useState('');
  const [isParsingPaste, setIsParsingPaste] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);

  // Calculate day count
  const calculateDays = (s: string, e: string) => {
    try {
      const d1 = new Date(s);
      const d2 = new Date(e);
      const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 3600 * 24)) + 1;
      return diff > 0 ? diff : 1;
    } catch {
      return 1;
    }
  };
  const daysCount = isPhotoMemoryOnly ? 1 : calculateDays(startDate, endDate);

  // Auto-detect currency when destination changes
  const handleDestinationChange = (val: string) => {
    setDestination(val);
    const info = resolveDestinationTimezone(val);
    if (info.currencyCode && CURRENCIES.some((c) => c.value === info.currencyCode)) {
      setCurrency(info.currencyCode);
    }
  };

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Submit standard minimal trip
  const handleMinimalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = title.trim() || (destination ? `${destination} 之旅` : '我的全新旅程');

    if (isEditing && trip) {
      onSave({
        ...trip,
        title: finalTitle,
        destination: destination.trim() || '自由行',
        startDate,
        endDate: isPhotoMemoryOnly ? startDate : endDate,
        currency,
        coverGradient,
        isSoloTrip,
        isSplitEnabled: isSoloTrip ? false : trip.isSplitEnabled,
        googlePhotosAlbumUrl: googlePhotosAlbumUrl.trim() || undefined,
        updatedAt: Date.now(),
      });
      onClose();
      return;
    }

    // Creating new trip
    const dayList = [];
    const actualDays = isPhotoMemoryOnly ? 1 : daysCount;
    for (let i = 1; i <= actualDays; i++) {
      const dayDate = new Date(new Date(startDate).getTime() + 86400000 * (i - 1))
        .toISOString()
        .slice(0, 10);
      dayList.push({
        id: `day-${i}-${Date.now()}`,
        dayNumber: i,
        date: dayDate,
        theme: isPhotoMemoryOnly ? '回憶相簿與隨筆' : `Day ${i} 行程`,
        items: [],
      });
    }

    const newTrip: Trip = {
      id: `trip-${Date.now()}`,
      title: finalTitle,
      destination: destination.trim() || '旅行目的地',
      startDate,
      endDate: isPhotoMemoryOnly ? startDate : endDate,
      currency,
      budgetTotal: 50000,
      coverGradient,
      isSoloTrip,
      isSplitEnabled: !isSoloTrip,
      googlePhotosAlbumUrl: googlePhotosAlbumUrl.trim() || undefined,
      notes: '',
      days: dayList,
      todos: [],
      packingList: [],
      expenses: [],
      emergencyContacts: [],
      memories: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    onSave(newTrip);
    onClose();
  };

  // Advanced: AI Generate
  const handleAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetDest = destination.trim() || title.trim();
    if (!targetDest) {
      setAiGenError('請先在上方輸入旅程標題或目的地');
      return;
    }

    setIsAiGenerating(true);
    setAiGenError(null);

    try {
      const generatedTrip = await generateAiTrip({
        destination: targetDest,
        daysCount,
        style: aiStyle,
        preferences: aiPreferences.trim() || undefined,
        currency,
        startDate,
      });

      generatedTrip.title = title.trim() || generatedTrip.title;
      generatedTrip.startDate = startDate;
      generatedTrip.endDate = endDate;
      generatedTrip.coverGradient = coverGradient;
      generatedTrip.isSoloTrip = isSoloTrip;
      generatedTrip.isSplitEnabled = !isSoloTrip;

      onSave(generatedTrip);
      onClose();
    } catch (err: any) {
      console.error('AI Generation Failed:', err);
      setAiGenError(err.message || '生成失敗，請稍後重試。');
    } finally {
      setIsAiGenerating(false);
    }
  };

  // Advanced: Paste Parse
  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedText.trim()) return;

    setIsParsingPaste(true);
    setPasteError(null);

    try {
      const result = await universalParseItinerary(
        pastedText.trim(),
        destination.trim() || undefined,
        currency,
        startDate,
        endDate
      );

      const parsedTrip = result.trip;
      parsedTrip.title = title.trim() || parsedTrip.title;
      parsedTrip.startDate = startDate;
      parsedTrip.endDate = endDate;
      parsedTrip.coverGradient = coverGradient;
      parsedTrip.isSoloTrip = isSoloTrip;
      parsedTrip.isSplitEnabled = !isSoloTrip;

      onSave(parsedTrip);
      onClose();
    } catch (err: any) {
      console.error('Parse paste error:', err);
      setPasteError(err.message || '文字解析失敗，請確認內容或稍後重試。');
    } finally {
      setIsParsingPaste(false);
    }
  };

  // Advanced: Apply Preset
  const handleApplyPreset = (preset: Trip) => {
    const clonedTrip: Trip = {
      ...preset,
      id: `trip-preset-${Date.now()}`,
      title: title.trim() || preset.title,
      startDate,
      endDate: new Date(new Date(startDate).getTime() + 86400000 * (preset.days.length - 1))
        .toISOString()
        .slice(0, 10),
      isSoloTrip,
      isSplitEnabled: !isSoloTrip,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    onSave(clonedTrip);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#1C1C1E] shadow-2xl border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-100 my-auto animate-in fade-in zoom-in-95 duration-150 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-zinc-800 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <HiyoriLogo className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {isEditing ? '編輯旅程資訊' : '新增旅遊行程'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {isEditing ? '調整名稱、目的地或日期' : '輸入名稱即可建立，隨時上傳照片與排程'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-200/50 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
          {/* Main Minimal Form */}
          <form id="minimal-trip-form" onSubmit={handleMinimalSubmit} className="space-y-4">
            {/* Title (Primary Input) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-200 mb-1.5">
                旅程名稱 <span className="text-teal-600 dark:text-teal-400">*</span>
              </label>
              <input
                type="text"
                autoFocus
                required
                placeholder="例如：2024 東京秋季賞楓、京都老街回憶"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-3 rounded-2xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-400 dark:placeholder:text-zinc-500 transition"
              />
            </div>

            {/* Destination (Optional) */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1.5 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>目的地 (選填)</span>
              </label>
              <input
                type="text"
                placeholder="例如：日本東京、京都、台北"
                value={destination}
                onChange={(e) => handleDestinationChange(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-400 dark:placeholder:text-zinc-500 transition"
              />
            </div>

            {/* Date Selection Mode */}
            <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>旅行日期</span>
                </span>
                {!isPhotoMemoryOnly && (
                  <span className="text-xs font-bold text-teal-600 dark:text-teal-400 font-mono">
                    共 {daysCount} 天日程
                  </span>
                )}
              </div>

              {/* Memory / Flexible checkbox */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPhotoMemoryOnly}
                  onChange={(e) => setIsPhotoMemoryOnly(e.target.checked)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 w-4 h-4"
                />
                <span className="text-xs text-slate-600 dark:text-zinc-300 flex items-center gap-1">
                  <ImageIcon className="w-3.5 h-3.5 text-amber-500" />
                  <span>歷史遊記相簿 / 暫無固定日程 (僅記錄與上傳照片)</span>
                </span>
              </label>

              {!isPhotoMemoryOnly && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[11px] text-slate-400 dark:text-zinc-400 mb-1">
                      出發日
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        if (e.target.value > endDate) setEndDate(e.target.value);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 dark:text-zinc-400 mb-1">
                      結束日
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Solo Travel Switch (獨旅模式) */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                    isSoloTrip
                      ? 'bg-amber-500/15 text-amber-500'
                      : 'bg-slate-200/60 dark:bg-zinc-700/60 text-slate-500 dark:text-zinc-400'
                  }`}
                >
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>獨旅模式 (一人旅行)</span>
                    {isSoloTrip && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        開啟
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    完全隱藏朋友分帳、代墊與成員分擔設定
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isSoloTrip}
                onClick={() => setIsSoloTrip(!isSoloTrip)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isSoloTrip ? 'bg-teal-600' : 'bg-slate-300 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    isSoloTrip ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Google Photos Album Link */}
            <div className="p-3.5 rounded-2xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-800/40 space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
                  Google 相簿整趟旅程連結 (選填)
                </span>
                {googlePhotosAlbumUrl.trim() && (
                  <a
                    href={googlePhotosAlbumUrl.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-0.5"
                  >
                    <span>測試開啟</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </label>
              <input
                type="url"
                placeholder="例如：https://photos.app.goo.gl/... 整趟共用相簿"
                value={googlePhotosAlbumUrl}
                onChange={(e) => setGooglePhotosAlbumUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-400 dark:placeholder:text-zinc-500"
              />
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                貼上 Google 相簿分享連結，隨行夥伴皆可一鍵檢視 4K / 原畫質雲端相簿。
              </p>
            </div>

            {/* Gradient Theme Picker */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-2">
                主題封面色調
              </label>
              <div className="flex items-center gap-2.5">
                {GRADIENTS.map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    onClick={() => setCoverGradient(g.class)}
                    title={g.label}
                    className={`w-8 h-8 rounded-full bg-gradient-to-r ${g.class} transition-all cursor-pointer ${
                      coverGradient === g.class
                        ? 'ring-2 ring-offset-2 ring-teal-500 dark:ring-offset-zinc-900 scale-110'
                        : 'opacity-70 hover:opacity-100 hover:scale-105'
                    }`}
                  />
                ))}
              </div>
            </div>
          </form>

          {/* Collapsible Advanced Section for AI / Paste / Presets */}
          {!isEditing && (
            <div className="pt-2 border-t border-slate-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full py-2 px-3 rounded-2xl bg-slate-50/70 dark:bg-zinc-800/60 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-semibold text-slate-600 dark:text-zinc-300 flex items-center justify-between transition cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>展開進階選項 (AI 規劃 / 貼上筆記 / 套用範本)</span>
                </div>
                {showAdvanced ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {showAdvanced && (
                <div className="mt-3 p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 space-y-3.5 animate-in fade-in duration-150">
                  {/* Clean Segmented Switcher for Advanced Tools */}
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/80 dark:bg-zinc-800 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setAdvancedSubTab('ai')}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition ${
                        advancedSubTab === 'ai'
                          ? 'bg-white dark:bg-zinc-900 text-teal-700 dark:text-teal-300 shadow-xs'
                          : 'text-slate-600 dark:text-zinc-400'
                      }`}
                    >
                      AI 智慧生成
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdvancedSubTab('paste')}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition ${
                        advancedSubTab === 'paste'
                          ? 'bg-white dark:bg-zinc-900 text-teal-700 dark:text-teal-300 shadow-xs'
                          : 'text-slate-600 dark:text-zinc-400'
                      }`}
                    >
                      貼上筆記解析
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdvancedSubTab('preset')}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition ${
                        advancedSubTab === 'preset'
                          ? 'bg-white dark:bg-zinc-900 text-teal-700 dark:text-teal-300 shadow-xs'
                          : 'text-slate-600 dark:text-zinc-400'
                      }`}
                    >
                      精選範本
                    </button>
                  </div>

                  {/* 1. AI Tool Form */}
                  {advancedSubTab === 'ai' && (
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 dark:text-zinc-400 mb-1">
                            旅行偏好風格
                          </label>
                          <select
                            value={aiStyle}
                            onChange={(e) => setAiStyle(e.target.value)}
                            className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none"
                          >
                            <option value="classic">經典熱門景點</option>
                            <option value="foodie">在地必吃美食</option>
                            <option value="relax">悠閒放鬆漫步</option>
                            <option value="shopping">潮流逛街購物</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 dark:text-zinc-400 mb-1">
                            特別備註或喜好
                          </label>
                          <input
                            type="text"
                            placeholder="如：想去神社、咖啡廳"
                            value={aiPreferences}
                            onChange={(e) => setAiPreferences(e.target.value)}
                            className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none"
                          />
                        </div>
                      </div>

                      {aiGenError && (
                        <p className="text-xs text-rose-500 dark:text-rose-400 font-medium">
                          {aiGenError}
                        </p>
                      )}

                      <button
                        type="button"
                        disabled={isAiGenerating}
                        onClick={handleAiSubmit}
                        className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-xs"
                      >
                        {isAiGenerating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>AI 正在規劃日程...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>使用 AI 規劃產生完整行程</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* 2. Paste Tool Form */}
                  {advancedSubTab === 'paste' && (
                    <div className="space-y-3 pt-1">
                      <textarea
                        rows={3}
                        placeholder="在此貼上 LINE 訊息、小紅書、部落格或文字筆記..."
                        value={pastedText}
                        onChange={(e) => setPastedText(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none"
                      />
                      {pasteError && (
                        <p className="text-xs text-rose-500 dark:text-rose-400 font-medium">
                          {pasteError}
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={isParsingPaste || !pastedText.trim()}
                        onClick={handlePasteSubmit}
                        className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-xs"
                      >
                        {isParsingPaste ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>解析筆記中...</span>
                          </>
                        ) : (
                          <>
                            <ClipboardPaste className="w-4 h-4" />
                            <span>一鍵解析並建立行程</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* 3. Preset Templates */}
                  {advancedSubTab === 'preset' && (
                    <div className="space-y-2 pt-1 max-h-48 overflow-y-auto">
                      {PRESET_TRIPS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleApplyPreset(preset)}
                          className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-teal-500 text-left flex items-center justify-between transition cursor-pointer group"
                        >
                          <div>
                            <div className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400">
                              {preset.title}
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-zinc-400">
                              {preset.destination} · {preset.days.length} 天日程
                            </div>
                          </div>
                          <span className="text-[11px] font-semibold text-teal-600 dark:text-teal-400">
                            套用
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            取消
          </button>
          <button
            type="submit"
            form="minimal-trip-form"
            className="px-6 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition active:scale-95 cursor-pointer shadow-xs"
          >
            {isEditing ? '儲存旅程資訊' : '立即建立旅程'}
          </button>
        </div>
      </div>
    </div>
  );
};
