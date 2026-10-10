import React, { useState, useEffect } from 'react';
import { Trip, DayPlan } from '../../types/itinerary';
import { PRESET_TRIPS } from '../../data/presetTrips';
import { generateAiTrip, universalParseItinerary } from '../../utils/aiClient';
import { CustomSelect } from '../UI/CustomSelect';
import {
  X,
  Calendar,
  MapPin,
  DollarSign,
  Palette,
  Check,
  Sparkles,
  Copy,
  Edit3,
  Loader2,
  Compass,
  ArrowRight,
  ClipboardPaste,
  FileText,
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
} from 'lucide-react';

interface TripEditModalProps {
  trip?: Trip | null;
  onSave: (tripData: Partial<Trip> | Trip) => void;
  onClose: () => void;
}

const GRADIENTS = [
  { label: '翡翠森綠 (預設)', class: 'from-emerald-600 via-teal-600 to-cyan-700' },
  { label: '琉璃蔚藍', class: 'from-blue-600 via-indigo-600 to-violet-700' },
  { label: '古都暖橙', class: 'from-amber-700 via-orange-600 to-rose-700' },
  { label: '緋紅櫻粉', class: 'from-rose-600 via-pink-600 to-purple-700' },
  { label: '深邃午夜', class: 'from-slate-800 via-zinc-800 to-stone-900' },
];

const CURRENCIES = [
  { value: 'JPY', label: '日圓 (JPY ¥)' },
  { value: 'TWD', label: '新台幣 (TWD NT$)' },
  { value: 'USD', label: '美元 (USD $)' },
  { value: 'EUR', label: '歐元 (EUR €)' },
  { value: 'KRW', label: '韓元 (KRW ₩)' },
  { value: 'HKD', label: '港幣 (HKD HK$)' },
  { value: 'THB', label: '泰銖 (THB ฿)' },
];

const STYLES = [
  { id: 'classic', label: '經典熱門' },
  { id: 'foodie', label: '美食巡禮' },
  { id: 'relax', label: '悠閒漫活' },
  { id: 'family', label: '親子旅遊' },
  { id: 'shopping', label: '購物逛街' },
  { id: 'culture', label: '歷史文化' },
];

// Quick adjust days: 5 to 9 days only!
const QUICK_DAYS = [5, 6, 7, 8, 9];

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      const weekdays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
      return `${parts[0]}/${parts[1]}/${parts[2]} (${weekdays[d.getDay()]})`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

export const TripEditModal: React.FC<TripEditModalProps> = ({ trip, onSave, onClose }) => {
  const isEditing = Boolean(trip);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  // Default to 5 days (4 nights)
  const defaultEnd = new Date(Date.now() + 86400000 * 4).toISOString().slice(0, 10);

  // Tab mode for creating new trip
  const [creationMode, setCreationMode] = useState<'ai' | 'paste' | 'template' | 'manual'>('ai');

  // Shared Dates: Start Date and End Date
  const [startDate, setStartDate] = useState(trip?.startDate || today);
  const [endDate, setEndDate] = useState(trip?.endDate || defaultEnd);

  // Calculate day count automatically from Start Date and End Date
  const calculateDuration = (startStr: string, endStr: string) => {
    try {
      const s = new Date(startStr);
      const e = new Date(endStr);
      const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 3600 * 24)) + 1;
      return diff > 0 ? diff : 1;
    } catch {
      return 1;
    }
  };

  const daysCount = calculateDuration(startDate, endDate);

  // Helper to adjust date by delta days
  const adjustDateByDays = (dateStr: string, delta: number): string => {
    try {
      const parts = dateStr.split('-');
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      d.setDate(d.getDate() + delta);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return dateStr;
    }
  };

  // Helper to set duration directly to N days (5 to 9 days)
  const handleQuickDuration = (days: number) => {
    const newEnd = adjustDateByDays(startDate, days - 1);
    setEndDate(newEnd);
  };

  // Step Start Date
  const handleStepStartDate = (delta: number) => {
    const newStart = adjustDateByDays(startDate, delta);
    setStartDate(newStart);
    // Keep the same duration
    const newEnd = adjustDateByDays(newStart, daysCount - 1);
    setEndDate(newEnd);
  };

  // Step End Date
  const handleStepEndDate = (delta: number) => {
    const newEnd = adjustDateByDays(endDate, delta);
    // Don't allow end date to be before start date
    if (new Date(newEnd) < new Date(startDate)) return;
    setEndDate(newEnd);
  };

  // Preset start dates (Today, Next Week, Next Month)
  const handleSetPresetStart = (type: 'today' | 'nextWeek' | 'nextMonth') => {
    const base = new Date();
    if (type === 'nextWeek') {
      base.setDate(base.getDate() + 7);
    } else if (type === 'nextMonth') {
      base.setMonth(base.getMonth() + 1);
    }
    const year = base.getFullYear();
    const month = String(base.getMonth() + 1).padStart(2, '0');
    const day = String(base.getDate()).padStart(2, '0');
    const newStart = `${year}-${month}-${day}`;
    setStartDate(newStart);
    setEndDate(adjustDateByDays(newStart, daysCount - 1));
  };

  // 1. AI Generation States
  const [aiDestination, setAiDestination] = useState('');
  const [aiStyle, setAiStyle] = useState('經典熱門');
  const [aiPreferences, setAiPreferences] = useState('');
  const [aiCurrency, setAiCurrency] = useState('JPY');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiGenError, setAiGenError] = useState<string | null>(null);

  // 2. Paste & Copy Itinerary States
  const [pastedText, setPastedText] = useState('');
  const [pasteDestinationHint, setPasteDestinationHint] = useState('');
  const [pasteCurrency, setPasteCurrency] = useState('JPY');
  const [isParsingPaste, setIsParsingPaste] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);

  // 3. Manual Form States
  const [title, setTitle] = useState(trip?.title || '');
  const [destination, setDestination] = useState(trip?.destination || '');
  const [currency, setCurrency] = useState(trip?.currency || 'JPY');
  const [budgetTotal, setBudgetTotal] = useState<string>(trip ? String(trip.budgetTotal) : '50000');
  const [coverGradient, setCoverGradient] = useState(trip?.coverGradient || GRADIENTS[0].class);
  const [notes, setNotes] = useState(trip?.notes || '');

  // Keep manual title updated with destination if empty
  useEffect(() => {
    if (!isEditing && aiDestination && !title) {
      setTitle(`${aiDestination} ${daysCount} 天自由行`);
    }
  }, [aiDestination, daysCount, isEditing, title]);

  // Handle AI Full Trip Generation
  const handleAiGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiDestination.trim()) return;

    setIsAiGenerating(true);
    setAiGenError(null);

    try {
      const generatedTrip = await generateAiTrip({
        destination: aiDestination.trim(),
        daysCount,
        style: aiStyle,
        preferences: aiPreferences.trim() || undefined,
        currency: aiCurrency,
        startDate,
      });

      // Ensure end date matches user-selected range
      generatedTrip.startDate = startDate;
      generatedTrip.endDate = endDate;

      onSave(generatedTrip);
      onClose();
    } catch (err: any) {
      console.error('AI Generation Failed:', err);
      setAiGenError(err.message || '生成失敗，請稍後重試。');
    } finally {
      setIsAiGenerating(false);
    }
  };

  // Handle Paste Text & AI Parse
  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedText.trim()) return;

    setIsParsingPaste(true);
    setPasteError(null);

    try {
      const result = await universalParseItinerary(
        pastedText.trim(),
        pasteDestinationHint.trim() || undefined,
        pasteCurrency,
        startDate,
        endDate
      );

      const parsedTrip = result.trip;
      parsedTrip.startDate = startDate;
      parsedTrip.endDate = endDate;
      onSave(parsedTrip);
      onClose();
    } catch (err: any) {
      console.error('Parse paste error:', err);
      setPasteError(err.message || '文字解析失敗，請確認內容或稍後重試。');
    } finally {
      setIsParsingPaste(false);
    }
  };

  // Handle Apply Preset Template
  const handleApplyPreset = (preset: Trip) => {
    const clonedTrip: Trip = {
      ...preset,
      id: `trip-${Date.now()}`,
      title: `${preset.title} (我的副本)`,
      startDate,
      endDate: adjustDateByDays(startDate, preset.days.length - 1),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    onSave(clonedTrip);
    onClose();
  };

  // Handle Manual Form Submit
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !destination.trim()) return;

    let days: DayPlan[] = trip?.days || [];
    if (!trip || days.length === 0) {
      days = [];
      const start = new Date(startDate);
      for (let i = 0; i < daysCount; i++) {
        const currentDate = new Date(start);
        currentDate.setDate(currentDate.getDate() + i);
        days.push({
          id: `day-${Date.now()}-${i + 1}`,
          dayNumber: i + 1,
          date: currentDate.toISOString().slice(0, 10),
          theme: `第 ${i + 1} 天行程規劃`,
          items: [],
        });
      }
    }

    onSave({
      title: title.trim(),
      destination: destination.trim(),
      startDate,
      endDate,
      currency,
      budgetTotal: parseFloat(budgetTotal) || 0,
      coverGradient,
      notes: notes.trim() || undefined,
      days,
    });
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
        className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 my-auto animate-in fade-in zoom-in-95 duration-150 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-teal-600" />
              <span>{isEditing ? '編輯旅程資訊' : '規劃全新旅遊行程'}</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isEditing
                ? '調整出發日期、結束日期、天數與主題色'
                : '支援 AI 智慧生成、直接貼入筆記或套用熱門精選範本'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher Tabs (Only shown when creating new trip) */}
        {!isEditing && (
          <div className="px-5 pt-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => setCreationMode('ai')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition shrink-0 ${
                creationMode === 'ai'
                  ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                  : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              <span>AI 智慧生成行程</span>
            </button>

            <button
              type="button"
              onClick={() => setCreationMode('paste')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition shrink-0 ${
                creationMode === 'paste'
                  ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                  : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-teal-600" />
              <span>貼上筆記建立</span>
            </button>

            <button
              type="button"
              onClick={() => setCreationMode('template')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition shrink-0 ${
                creationMode === 'template'
                  ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                  : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <Copy className="w-3.5 h-3.5 text-teal-600" />
              <span>熱門精選範本</span>
            </button>

            <button
              type="button"
              onClick={() => setCreationMode('manual')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition shrink-0 ${
                creationMode === 'manual'
                  ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                  : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5 text-slate-500" />
              <span>手動空白建立</span>
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
          {/* Universal Rock-Solid Date Range & Quick Day Selector */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/90 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-teal-600" />
                <span>行程日期選擇：</span>
              </label>

              <span className="px-3 py-1 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 text-xs font-bold border border-teal-200 dark:border-teal-800">
                共 {daysCount} 天 {Math.max(0, daysCount - 1)} 夜
              </span>
            </div>

            {/* Quick Start Date Presets */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-400 font-medium">快速起算：</span>
              <button
                type="button"
                onClick={() => handleSetPresetStart('today')}
                className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-600 dark:text-slate-300 transition"
              >
                今天出發
              </button>
              <button
                type="button"
                onClick={() => handleSetPresetStart('nextWeek')}
                className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-600 dark:text-slate-300 transition"
              >
                下週出發 (+7天)
              </button>
              <button
                type="button"
                onClick={() => handleSetPresetStart('nextMonth')}
                className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-600 dark:text-slate-300 transition"
              >
                下月出發 (+30天)
              </button>
            </div>

            {/* Two Interactive Date Pickers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Start Date Card */}
              <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1.5 shadow-2xs">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                  <span>出發日期 (Start)</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleStepStartDate(-1)}
                      className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition"
                      title="提前一天"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStepStartDate(1)}
                      className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition"
                      title="往後一天"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="relative flex items-center">
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => {
                      if (e.target.value) {
                        setStartDate(e.target.value);
                        // Shift end date keeping same duration
                        setEndDate(adjustDateByDays(e.target.value, daysCount - 1));
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                  />
                </div>
                <div className="text-[10px] text-teal-700 dark:text-teal-400 font-medium">
                  {formatDisplayDate(startDate)}
                </div>
              </div>

              {/* End Date Card */}
              <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1.5 shadow-2xs">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                  <span>結束日期 (End)</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleStepEndDate(-1)}
                      className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition"
                      title="減少一天"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStepEndDate(1)}
                      className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition"
                      title="增加一天"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="relative flex items-center">
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => {
                      if (e.target.value) {
                        setEndDate(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                  />
                </div>
                <div className="text-[10px] text-teal-700 dark:text-teal-400 font-medium">
                  {formatDisplayDate(endDate)}
                </div>
              </div>
            </div>

            {/* Quick Duration Pills (5 to 9 Days Only!) */}
            <div className="pt-1.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                  快速調整天數（5~9 天）：
                </span>
                <span className="text-[10px] text-slate-400">點擊即自動計算結束日</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {QUICK_DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleQuickDuration(d)}
                    className={`py-1.5 sm:py-2 px-1 rounded-xl text-[11px] sm:text-xs font-bold border transition text-center active:scale-95 ${
                      daysCount === d
                        ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>{d}天</span>
                    <span className="hidden xs:inline text-[10px] opacity-80"> {d - 1}夜</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 1. AI Smart Generation Mode */}
          {!isEditing && creationMode === 'ai' && (
            <form onSubmit={handleAiGenerateSubmit} className="space-y-4 animate-in fade-in duration-150">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-teal-600" />
                  <span>旅遊目的地（必填）：</span>
                </label>
                <input
                  type="text"
                  required
                  value={aiDestination}
                  onChange={(e) => setAiDestination(e.target.value)}
                  placeholder="例如：日本東京、關西京都大阪、北海道、韓國首爾、泰國清邁..."
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                />
              </div>

              {/* Currency Custom Select */}
              <CustomSelect
                label="計價幣別"
                icon={<DollarSign className="w-3.5 h-3.5 text-teal-600" />}
                options={CURRENCIES}
                value={aiCurrency}
                onChange={(e) => setAiCurrency(e.target.value)}
              />

              {/* Style Chips (Clean, moderate) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  旅行風格偏好：
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setAiStyle(s.label)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition active:scale-95 ${
                        aiStyle === s.label
                          ? 'bg-teal-600 text-white border-teal-600 shadow-2xs'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Specific Wishes */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  指定景點或願望（選填）：
                </label>
                <input
                  type="text"
                  value={aiPreferences}
                  onChange={(e) => setAiPreferences(e.target.value)}
                  placeholder="例如：想去清水寺、吃一蘭拉麵、和服體驗、泡溫泉..."
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                />
              </div>

              {aiGenError && (
                <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs border border-rose-200 dark:border-rose-900">
                  {aiGenError}
                </div>
              )}

              {/* Action Button */}
              <button
                type="submit"
                disabled={isAiGenerating || !aiDestination.trim()}
                className="w-full py-3 px-5 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 disabled:opacity-50 text-white font-bold text-sm shadow-md transition active:scale-95 flex items-center justify-center gap-2"
              >
                {isAiGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>AI 正在規劃專屬路線與景點 (約 3~5 秒)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>AI 規劃行程 ({daysCount} 天)</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* 2. Direct Paste Text / Itinerary Mode */}
          {!isEditing && creationMode === 'paste' && (
            <form onSubmit={handlePasteSubmit} className="space-y-4 animate-in fade-in duration-150">
              <div className="p-3.5 rounded-2xl bg-teal-50/70 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-900/60 text-xs text-teal-950 dark:text-teal-200 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <ClipboardPaste className="w-4 h-4 text-teal-600" />
                  <span>貼上筆記文字，AI 自動解析：</span>
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  將朋友在 LINE 傳的旅遊規劃、旅行社行程或網路遊記貼在下方，AI 會自動辨識天數、景點時間、交通與真實經緯度。
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  貼上旅遊文字或行程草稿：
                </label>
                <textarea
                  rows={6}
                  required
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`例如直接貼上：\nDay 1: 抵達機場前往飯店 Check-in，下午前往淺草寺雷門，傍晚晴空塔夜景。\nDay 2: 早上明治神宮，中午原宿竹下通，下午澀谷十字路口與展望台...`}
                  className="w-full p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    目的地提示（選填）：
                  </label>
                  <input
                    type="text"
                    value={pasteDestinationHint}
                    onChange={(e) => setPasteDestinationHint(e.target.value)}
                    placeholder="例如：日本東京"
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-hidden"
                  />
                </div>

                <CustomSelect
                  label="計價幣別"
                  icon={<DollarSign className="w-3.5 h-3.5 text-teal-600" />}
                  options={CURRENCIES}
                  value={pasteCurrency}
                  onChange={(e) => setPasteCurrency(e.target.value)}
                />
              </div>

              {pasteError && (
                <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs border border-rose-200 dark:border-rose-900">
                  {pasteError}
                </div>
              )}

              <button
                type="submit"
                disabled={isParsingPaste || !pastedText.trim()}
                className="w-full py-3 px-5 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 disabled:opacity-50 text-white font-bold text-sm shadow-md transition active:scale-95 flex items-center justify-center gap-2"
              >
                {isParsingPaste ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>AI 正在剖析文字並定位景點中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>AI 解析建立新行程</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* 3. Popular Preset Templates Mode (5~7 days) */}
          {!isEditing && creationMode === 'template' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                點擊任一精選範本，即可直接一鍵套用為您的新行程，並在此基礎上自由增刪微調！
              </p>

              <div className="space-y-2.5">
                {PRESET_TRIPS.map((preset) => (
                  <div
                    key={preset.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:border-teal-500 dark:hover:border-teal-500 transition group flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
                          {preset.days.length} 天 {preset.days.length - 1} 夜
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-teal-600" />
                          {preset.destination}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition">
                        {preset.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                        包含 {preset.days.reduce((acc, d) => acc + d.items.length, 0)} 個熱門景點、真實經緯度與交通指引
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition active:scale-95 shrink-0 flex items-center justify-center gap-1.5"
                    >
                      <span>套用此範本</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Manual Form Mode (Or Editing Mode) */}
          {(isEditing || creationMode === 'manual') && (
            <form onSubmit={handleManualSubmit} className="space-y-4 animate-in fade-in duration-150">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  行程名稱（必填）：
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：東京 5 天 4 夜自由行"
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-teal-600" />
                  <span>目的地國家與城市：</span>
                </label>
                <input
                  type="text"
                  required
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="例如：日本 東京 (Tokyo, Japan)"
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <CustomSelect
                  label="計價幣別"
                  icon={<DollarSign className="w-3.5 h-3.5 text-teal-600" />}
                  options={CURRENCIES}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                />

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    預算總額 ({currency})：
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={budgetTotal}
                    onChange={(e) => setBudgetTotal(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-hidden font-mono"
                  />
                </div>
              </div>

              {/* Cover Gradient */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Palette className="w-3.5 h-3.5 text-teal-600" />
                  <span>封面卡片主題色：</span>
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {GRADIENTS.map((g) => (
                    <button
                      key={g.class}
                      type="button"
                      onClick={() => setCoverGradient(g.class)}
                      className={`h-9 rounded-xl bg-gradient-to-r ${g.class} flex items-center justify-center text-white transition active:scale-95 relative border-2 ${
                        coverGradient === g.class ? 'border-teal-500 scale-105 shadow-md' : 'border-transparent'
                      }`}
                      title={g.label}
                    >
                      {coverGradient === g.class && <Check className="w-4 h-4 drop-shadow-sm" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* General Notes */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  隨身提醒與叮嚀（選填）：
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="例如：需先預訂 WiFi 機、Suica 卡加值、攜帶日本插頭轉接器..."
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-hidden"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition active:scale-95"
              >
                {isEditing ? '儲存變更' : '建立空白行程'}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Wayfarer 智慧旅程規劃
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold text-xs transition"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};
