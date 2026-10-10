import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Trip, TripMemoryItem, ItineraryItem } from '../../types/itinerary';
import { formatDateSlash, formatMonthDaySlash, getDayOfWeek } from '../../utils/date';
import { Language } from '../../utils/i18n';
import { compressImageFile } from '../../utils/image';
import {
  Camera,
  Upload,
  Printer,
  Sparkles,
  Trash2,
  X,
  Plus,
  MapPin,
  Calendar,
  Image as ImageIcon,
  Heart,
  ChevronRight,
  ZoomIn,
  Download,
  Share2,
  Check,
  Compass,
} from 'lucide-react';

interface TripMemoriesViewProps {
  trip: Trip;
  lang: Language;
  onUpdateTrip: (updatedTrip: Trip) => void;
  initialSpotId?: string;
}

const PRESET_MOODS = [
  { icon: '✨', label: '感動難忘' },
  { icon: '❄️', label: '冬日雪景' },
  { icon: '☀️', label: '陽光明媚' },
  { icon: '🍜', label: '絕品美食' },
  { icon: '🌸', label: '春日櫻景' },
  { icon: '🍁', label: '秋葉紅楓' },
  { icon: '☕', label: '悠閒午後' },
  { icon: '🏯', label: '歷史古蹟' },
  { icon: '🛍️', label: '滿載而歸' },
  { icon: '✈️', label: '隨行啟程' },
];

export const TripMemoriesView: React.FC<TripMemoriesViewProps> = ({
  trip,
  lang,
  onUpdateTrip,
  initialSpotId,
}) => {
  const [viewMode, setViewMode] = useState<'itinerary' | 'gallery' | 'polaroid'>('itinerary');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | 'all'>('all');
  const [lightboxMemory, setLightboxMemory] = useState<TripMemoryItem | null>(null);

  // Form State for uploading new memory photo
  const [uploadSpotId, setUploadSpotId] = useState<string>(initialSpotId || '');
  const [isCustomSpot, setIsCustomSpot] = useState<boolean>(!initialSpotId);
  const [customLocationName, setCustomLocationName] = useState<string>('');
  const [customDayNumber, setCustomDayNumber] = useState<number | 'all'>('all');
  const [customDate, setCustomDate] = useState<string>('');
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadMood, setUploadMood] = useState('✨');
  const [uploadImagePreview, setUploadImagePreview] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // When navigated to with a specific spot ID, auto-open the upload modal for this spot
  useEffect(() => {
    if (initialSpotId) {
      setUploadSpotId(initialSpotId);
      setIsCustomSpot(false);
      setShowUploadModal(true);
      setViewMode('itinerary');
    }
  }, [initialSpotId]);

  // Collect all spots from the trip for the dropdown
  const allSpots = useMemo(() => {
    const list: { spot: ItineraryItem; dayNumber: number; date: string }[] = [];
    (trip.days || []).forEach((day) => {
      (day.items || []).forEach((item) => {
        list.push({ spot: item, dayNumber: day.dayNumber, date: day.date });
      });
    });
    return list;
  }, [trip.days]);

  // Aggregate memories: check both trip.memories and any spot.memoryPhotos
  const allMemories = useMemo(() => {
    const items: TripMemoryItem[] = [...(trip.memories || [])];

    // Also pull from spot items if any exist
    (trip.days || []).forEach((day) => {
      (day.items || []).forEach((item) => {
        if (item.memoryPhotos && item.memoryPhotos.length > 0) {
          item.memoryPhotos.forEach((photoUrl, pIdx) => {
            // Avoid duplicate if already in trip.memories
            const exists = items.some((m) => m.imageUrl === photoUrl);
            if (!exists) {
              items.push({
                id: `spot-mem-${item.id}-${pIdx}`,
                imageUrl: photoUrl,
                caption: item.memoryNotes || item.title,
                spotId: item.id,
                spotTitle: item.title,
                dayNumber: day.dayNumber,
                date: day.date,
                mood: item.memoryMood || '✨',
                location: item.locationName || item.title,
                createdAt: trip.createdAt + pIdx * 1000,
              });
            }
          });
        }
      });
    });

    // Sort chronologically by dayNumber or createdAt
    return items.sort((a, b) => {
      const dayA = a.dayNumber || 0;
      const dayB = b.dayNumber || 0;
      if (dayA !== dayB) return dayA - dayB;
      return a.createdAt - b.createdAt;
    });
  }, [trip.memories, trip.days, trip.createdAt]);

  // Count of spots that have at least one photo
  const checkedSpotsCount = useMemo(() => {
    const set = new Set(allMemories.map((m) => m.spotId).filter(Boolean));
    return set.size;
  }, [allMemories]);

  // Filter memories
  const filteredMemories = useMemo(() => {
    if (selectedDayFilter === 'all') return allMemories;
    return allMemories.filter((m) => m.dayNumber === selectedDayFilter);
  }, [allMemories, selectedDayFilter]);

  // Handle Photo File selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingImage(true);
      const compressed = await compressImageFile(file, 1200, 0.82);
      setUploadImagePreview(compressed);
    } catch (err) {
      console.error('Failed to compress photo:', err);
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Submit and save new memory
  const handleSaveMemory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadImagePreview) return;

    const isCustom = isCustomSpot || !uploadSpotId;
    const matchedSpotObj = !isCustom ? allSpots.find((s) => s.spot.id === uploadSpotId) : null;

    const chosenDayNum = !isCustom
      ? matchedSpotObj?.dayNumber
      : (customDayNumber !== 'all' ? Number(customDayNumber) : undefined);

    const chosenDate = !isCustom
      ? matchedSpotObj?.date
      : (customDate || (chosenDayNum ? trip.days.find((d) => d.dayNumber === chosenDayNum)?.date : undefined));

    const finalTitle = isCustom
      ? (customLocationName.trim() || '自由隨拍打卡')
      : (matchedSpotObj?.spot.title || '行程景點');

    const finalLocation = isCustom
      ? (customLocationName.trim() || trip.destination)
      : (matchedSpotObj?.spot.locationName || matchedSpotObj?.spot.title || trip.destination);

    const newMemory: TripMemoryItem = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      imageUrl: uploadImagePreview,
      caption: uploadCaption.trim() || finalTitle,
      spotId: !isCustom ? uploadSpotId : undefined,
      spotTitle: finalTitle,
      dayNumber: chosenDayNum,
      date: chosenDate,
      mood: uploadMood,
      location: finalLocation,
      createdAt: Date.now(),
    };

    const updatedMemories = [newMemory, ...(trip.memories || [])];

    // Also update spot's memoryPhotos if spot is selected
    let updatedDays = trip.days;
    if (!isCustom && uploadSpotId) {
      updatedDays = trip.days.map((d) => ({
        ...d,
        items: d.items.map((item) => {
          if (item.id === uploadSpotId) {
            return {
              ...item,
              memoryPhotos: [...(item.memoryPhotos || []), uploadImagePreview],
              memoryNotes: uploadCaption.trim() || item.memoryNotes,
              memoryMood: uploadMood,
            };
          }
          return item;
        }),
      }));
    }

    onUpdateTrip({
      ...trip,
      days: updatedDays,
      memories: updatedMemories,
      updatedAt: Date.now(),
    });

    // Reset and close
    setUploadImagePreview(null);
    setUploadCaption('');
    setUploadSpotId('');
    setIsCustomSpot(false);
    setCustomLocationName('');
    setShowUploadModal(false);
  };

  // Delete memory
  const handleDeleteMemory = (memId: string) => {
    if (!confirm(lang === 'zh' ? '確定要刪除這張回憶照片嗎？' : 'Delete this memory photo?')) {
      return;
    }

    const targetMem = allMemories.find((m) => m.id === memId);
    const updatedMemories = (trip.memories || []).filter((m) => m.id !== memId);

    // Also cleanup spot reference if present
    let updatedDays = trip.days;
    if (targetMem?.spotId && targetMem?.imageUrl) {
      updatedDays = trip.days.map((d) => ({
        ...d,
        items: d.items.map((item) => {
          if (item.id === targetMem.spotId && item.memoryPhotos) {
            return {
              ...item,
              memoryPhotos: item.memoryPhotos.filter((p) => p !== targetMem.imageUrl),
            };
          }
          return item;
        }),
      }));
    }

    onUpdateTrip({
      ...trip,
      days: updatedDays,
      memories: updatedMemories,
      updatedAt: Date.now(),
    });
  };

  // Native Print Trigger for Photo Paper
  const handlePrintPolaroids = () => {
    window.print();
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Print Stylesheet for Photo Studio Polaroid Output */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #polaroid-print-area, #polaroid-print-area * {
            visibility: visible;
          }
          #polaroid-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 10mm;
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
          .polaroid-card {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            margin-bottom: 20px;
            box-shadow: none !important;
            border: 1px solid #d1d5db !important;
          }
        }
      `}</style>

      {/* 1. Header Banner & Stats */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-2xs no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg flex items-center gap-2">
                  <span>{lang === 'zh' ? '旅程回憶相簿與拍立得' : 'Trip Memories & Polaroid Album'}</span>
                  <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/60 px-2 py-0.5 rounded-full">
                    事後回憶 · 沖印就緒
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'zh'
                    ? '留存每一站打卡照片、心情隨筆，一鍵產出專屬相簿與照相館拍立得沖印排版'
                    : 'Curate your journey photos and memories with authentic Polaroid print formats'}
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('itinerary')}
                className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
                  viewMode === 'itinerary'
                    ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 font-bold shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>{lang === 'zh' ? '行程景點對照' : 'Itinerary'}</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('gallery')}
                className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
                  viewMode === 'gallery'
                    ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 font-bold shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>{lang === 'zh' ? '精美畫廊' : 'Gallery'}</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('polaroid')}
                className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
                  viewMode === 'polaroid'
                    ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 font-bold shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-rose-500" />
                <span>{lang === 'zh' ? '拍立得沖印' : 'Polaroid Print'}</span>
              </button>
            </div>

            {/* Print Button (Available in Polaroid Mode) */}
            {viewMode === 'polaroid' && (
              <button
                type="button"
                onClick={handlePrintPolaroids}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95"
                title="以 A4 或相片紙沖印拍立得卡片"
              >
                <Printer className="w-3.5 h-3.5 text-rose-300" />
                <span>{lang === 'zh' ? '沖印 / 列印相簿' : 'Print Album'}</span>
              </button>
            )}

            {/* Upload Memory Photo Button */}
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>{lang === 'zh' ? '上傳回憶照' : 'Add Photo'}</span>
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-400 block font-medium">
              {lang === 'zh' ? '已記錄照片' : 'Photos'}
            </span>
            <div className="font-mono font-bold text-lg text-slate-800 dark:text-slate-100 mt-0.5">
              {allMemories.length} <span className="text-xs font-normal text-slate-400">張</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-400 block font-medium">
              {lang === 'zh' ? '打卡景點數' : 'Spots'}
            </span>
            <div className="font-mono font-bold text-lg text-slate-800 dark:text-slate-100 mt-0.5">
              {new Set(allMemories.map((m) => m.spotId).filter(Boolean)).size} <span className="text-xs font-normal text-slate-400">處</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-400 block font-medium">
              {lang === 'zh' ? '旅程總天數' : 'Days'}
            </span>
            <div className="font-mono font-bold text-lg text-slate-800 dark:text-slate-100 mt-0.5">
              {trip.days.length} <span className="text-xs font-normal text-slate-400">天</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40">
            <span className="text-[11px] text-rose-600 dark:text-rose-400 block font-medium">
              {lang === 'zh' ? '沖印規格' : 'Print Size'}
            </span>
            <div className="font-bold text-xs text-rose-900 dark:text-rose-200 mt-1 flex items-center gap-1">
              <span>🎞️ 經典拍立得</span>
              <span className="text-[10px] text-rose-500 font-mono">(A4 / 4×6)</span>
            </div>
          </div>
        </div>

        {/* Firebase Cloud Sync & Free Quota Explanation Banner */}
        <div className="mt-4 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-sky-50 via-teal-50 to-indigo-50 dark:from-sky-950/40 dark:via-teal-950/40 dark:to-indigo-950/40 border border-teal-200/80 dark:border-teal-800/60 text-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <span className="text-xl shrink-0 mt-0.5">☁️</span>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900 dark:text-white">
                    相片雲端同步與 Firebase 免費額度說明
                  </span>
                  <span className="text-[10px] bg-teal-100 dark:bg-teal-900/80 text-teal-800 dark:text-teal-200 px-2 py-0.5 rounded-full font-mono font-bold">
                    Spark 免費方案永久可用
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
                  <strong>1. 免費空間上限：</strong>Firebase 免費版（Spark）提供 <strong>1 GB 雲端資料庫容量</strong>、<strong>50,000 次/日免費讀取</strong> 與 <strong>10 GB/月網路流量</strong>，無需綁定信用卡。<br />
                  <strong>2. 智慧壓縮防爆量：</strong>App 在上傳相片時自動在瀏覽器端進行高畫質縮圖壓縮（長邊 1200px / 82% 品質，單張僅約 60~120 KB），1 GB 免費空間可輕鬆容納 <strong>超過 10,000 張</strong> 旅遊回憶相片！<br />
                  <strong>3. 離線無縫瀏覽：</strong>即使出國在飛機上或無網路環境，相簿會優先讀取設備本機快取，零網路延遲隨時欣賞旅途點滴。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Day Filter Chips */}
        {trip.days.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-4 scrollbar-none">
            <span className="text-xs font-bold text-slate-400 shrink-0 pr-1">日程篩選:</span>
            <button
              type="button"
              onClick={() => setSelectedDayFilter('all')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition shrink-0 ${
                selectedDayFilter === 'all'
                  ? 'bg-teal-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              全部 ({allMemories.length})
            </button>
            {trip.days.map((day) => {
              const countInDay = allMemories.filter((m) => m.dayNumber === day.dayNumber).length;
              return (
                <button
                  key={day.dayNumber}
                  type="button"
                  onClick={() => setSelectedDayFilter(day.dayNumber)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition shrink-0 ${
                    selectedDayFilter === day.dayNumber
                      ? 'bg-teal-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  Day {day.dayNumber} ({countInDay})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Main Content Views */}
      {viewMode === 'itinerary' ? (
        /* ================= 2A. ITINERARY SPOTS CHECK-IN & RETROSPECTIVE VIEW ================= */
        <div className="space-y-6">
          {/* Progress / Completion Rate Card */}
          <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-teal-600" />
                <span>行程景點相簿打卡進度</span>
              </span>
              <span className="font-mono font-bold text-teal-700 dark:text-teal-400">
                {checkedSpotsCount} / {allSpots.length} 個景點 ({allSpots.length > 0 ? Math.round((checkedSpotsCount / allSpots.length) * 100) : 0}%)
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-teal-500 to-emerald-500 h-full rounded-full transition-all duration-500"
                style={{
                  width: `${allSpots.length > 0 ? Math.round((checkedSpotsCount / allSpots.length) * 100) : 0}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>{checkedSpotsCount === allSpots.length && allSpots.length > 0 ? '🎉 太棒了！全行程景點均已打卡留念！' : '點擊下方尚未打卡的景點卡片即可快速拍照上傳'}</span>
              <button
                type="button"
                onClick={() => {
                  setUploadSpotId('');
                  setIsCustomSpot(true);
                  setShowUploadModal(true);
                }}
                className="text-teal-600 dark:text-teal-400 font-bold hover:underline"
              >
                ＋ 新增行程外自由隨拍
              </button>
            </div>
          </div>

          {/* Days Loop */}
          {trip.days.map((day) => {
            const daySpots = day.items || [];
            const dayMemories = allMemories.filter((m) => m.dayNumber === day.dayNumber);
            const customDayMemories = dayMemories.filter((m) => !daySpots.some((s) => s.id === m.spotId));

            return (
              <div key={day.dayNumber} className="space-y-3">
                {/* Day Header */}
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-xl bg-teal-600 text-white font-bold text-xs shadow-2xs">
                      Day {day.dayNumber}
                    </span>
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                      {formatDateSlash(day.date)} ({getDayOfWeek(day.date, lang)})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadSpotId('');
                      setIsCustomSpot(true);
                      setCustomDayNumber(day.dayNumber);
                      setCustomDate(day.date);
                      setShowUploadModal(true);
                    }}
                    className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新增 Day {day.dayNumber} 自由隨拍</span>
                  </button>
                </div>

                {/* Day Spots Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {daySpots.map((spot) => {
                    const spotMems = allMemories.filter((m) => m.spotId === spot.id);
                    const hasPhotos = spotMems.length > 0;

                    if (hasPhotos) {
                      const firstPhoto = spotMems[0];
                      return (
                        <div
                          key={spot.id}
                          className="group rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-2xs hover:shadow-md transition flex flex-col"
                        >
                          <div
                            className="relative aspect-16/10 bg-slate-100 dark:bg-slate-800 overflow-hidden cursor-pointer"
                            onClick={() => setLightboxMemory(firstPhoto)}
                          >
                            <img
                              src={firstPhoto.imageUrl}
                              alt={spot.title}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-lg bg-teal-900/80 backdrop-blur-md text-teal-100 text-[10px] font-bold">
                                ✓ 已打卡
                              </span>
                              {spotMems.length > 1 && (
                                <span className="px-2 py-0.5 rounded-lg bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-bold font-mono">
                                  {spotMems.length} 張照片
                                </span>
                              )}
                            </div>
                            <div className="absolute bottom-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition p-1.5 rounded-xl bg-slate-900/70 text-white">
                              <ZoomIn className="w-3.5 h-3.5" />
                            </div>
                          </div>
                          <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                            <div>
                              <h5 className="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5 truncate">
                                <MapPin className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                                <span className="truncate">{spot.title}</span>
                              </h5>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 italic mt-1 line-clamp-2">
                                「{firstPhoto.caption}」
                              </p>
                            </div>
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                              <button
                                type="button"
                                onClick={() => {
                                  setUploadSpotId(spot.id);
                                  setIsCustomSpot(false);
                                  setShowUploadModal(true);
                                }}
                                className="text-teal-600 font-bold hover:underline flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" />
                                <span>追加相片</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMemory(firstPhoto.id)}
                                className="text-slate-400 hover:text-rose-600 transition"
                                title="刪除照片"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={spot.id}
                        onClick={() => {
                          setUploadSpotId(spot.id);
                          setIsCustomSpot(false);
                          setShowUploadModal(true);
                        }}
                        className="rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-teal-500 hover:bg-teal-50/20 dark:hover:bg-teal-950/20 p-4 transition cursor-pointer flex flex-col justify-between min-h-[140px] group bg-white/50 dark:bg-slate-900/50"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span className="font-mono text-[10px]">{spot.startTime || '行程安排'}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">未打卡</span>
                          </div>
                          <h5 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 group-hover:text-teal-600 transition">
                            {spot.title}
                          </h5>
                          {spot.locationName && (
                            <p className="text-[11px] text-slate-400 truncate">
                              📍 {spot.locationName}
                            </p>
                          )}
                        </div>
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-teal-600 font-bold">
                          <span className="flex items-center gap-1 text-[11px]">
                            <Camera className="w-3.5 h-3.5" />
                            <span>點擊上傳此景點相片</span>
                          </span>
                          <span className="text-base group-hover:translate-x-0.5 transition">→</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Custom Day Memories */}
                {customDayMemories.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[11px] font-bold text-slate-400 block mb-2">
                      ✨ Day {day.dayNumber} 自由隨拍與突發景點：
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {customDayMemories.map((m) => (
                        <div
                          key={m.id}
                          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center gap-3 shadow-2xs group"
                        >
                          <img
                            src={m.imageUrl}
                            alt={m.caption}
                            className="w-16 h-16 rounded-xl object-cover shrink-0 cursor-pointer"
                            onClick={() => setLightboxMemory(m)}
                          />
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                                {m.spotTitle || m.location}
                              </span>
                              <span className="text-xs">{m.mood}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 italic truncate">
                              {m.caption}
                            </p>
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span>自由隨拍</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteMemory(m.id)}
                                className="text-slate-400 hover:text-rose-600"
                              >
                                刪除
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : filteredMemories.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-rose-50 dark:bg-rose-950/60 text-rose-500 flex items-center justify-center mx-auto shadow-inner">
            <Camera className="w-8 h-8" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h4 className="font-bold text-base text-slate-800 dark:text-slate-200">
              {lang === 'zh' ? '這趟旅程還沒有上傳回憶照片' : 'No memory photos added yet'}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {lang === 'zh'
                ? '點選上方「上傳回憶照」，挑選沿途隨手拍攝的景點照片、寫下當時的心得感受，即可自動排版成如雜誌般典雅的旅程相簿與實體沖印拍立得卡片！'
                : 'Upload travel photos and captions to create a beautiful memory album and printable Polaroid cards.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="px-5 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md transition active:scale-95"
          >
            📸 立即上傳第一張照片
          </button>
        </div>
      ) : viewMode === 'gallery' ? (
        /* ================= 2A. EXQUISITE STORY GALLERY VIEW ================= */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMemories.map((mem) => (
            <div
              key={mem.id}
              className="group rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-2xs hover:shadow-lg transition flex flex-col"
            >
              {/* Image Container with Hover Zoom */}
              <div
                className="relative aspect-4/3 bg-slate-100 dark:bg-slate-800 overflow-hidden cursor-pointer"
                onClick={() => setLightboxMemory(mem)}
              >
                <img
                  src={mem.imageUrl}
                  alt={mem.caption}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />

                {/* Day Badge & Mood Overlay */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5">
                  {mem.dayNumber && (
                    <span className="px-2.5 py-1 rounded-xl bg-slate-900/80 backdrop-blur-md text-white font-bold text-[11px] shadow-sm">
                      Day {mem.dayNumber}
                    </span>
                  )}
                  {mem.mood && (
                    <span className="w-7 h-7 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md flex items-center justify-center text-sm shadow-sm">
                      {mem.mood}
                    </span>
                  )}
                </div>

                {/* Quick Expand Icon */}
                <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition p-2 rounded-xl bg-slate-900/70 text-white backdrop-blur-md">
                  <ZoomIn className="w-4 h-4" />
                </div>
              </div>

              {/* Caption & Location Details */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-teal-700 dark:text-teal-400 flex items-center gap-1 truncate">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{mem.location || mem.spotTitle || trip.destination}</span>
                    </span>
                    {mem.date && (
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        {formatMonthDaySlash(mem.date)}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed italic border-l-2 border-teal-500/60 pl-2.5 py-0.5">
                    「{mem.caption}」
                  </p>
                </div>

                {/* Card Action footer */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span className="text-[10px]">日和手帳回憶記錄</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteMemory(mem.id)}
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                    title="刪除此照片"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ================= 2B. AUTHENTIC POLAROID STUDIO PRINT MODE ================= */
        <div id="polaroid-print-area">
          {/* Print Notice (Screen only) */}
          <div className="no-print p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎞️</span>
              <div>
                <p className="font-bold">照相館拍立得沖印排版已就緒</p>
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  採用經典拍立得厚白邊框、手寫體景點標記與復古膠卷質感。點選上方「沖印 / 列印相簿」即可直接送印（支援 A4、4×6 相片紙裁切）。
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handlePrintPolaroids}
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 shadow-xs"
            >
              立即列印
            </button>
          </div>

          {/* Polaroid Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 sm:gap-8 justify-items-center">
            {filteredMemories.map((mem, index) => (
              <div
                key={mem.id}
                className="polaroid-card w-full max-w-[290px] bg-[#fbfaf5] dark:bg-[#1c212a] p-3.5 pb-8 rounded-xs shadow-xl border border-[#e5e0d4] dark:border-slate-800 transition-transform duration-300 hover:scale-[1.02] flex flex-col relative group"
                style={{
                  transform: `rotate(${(index % 3 - 1) * 0.8}deg)`,
                }}
              >
                {/* Washi Tape / Retro Clip effect at top */}
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-16 h-5 bg-amber-100/80 dark:bg-slate-700/80 border border-amber-200/60 backdrop-blur-xs rounded-xs shadow-2xs rotate-[-1deg] no-print" />

                {/* Photo Window (Square with film border effect) */}
                <div className="relative aspect-square w-full bg-slate-900 overflow-hidden rounded-xs border border-slate-300/40 dark:border-slate-800 shadow-inner">
                  <img
                    src={mem.imageUrl}
                    alt={mem.caption}
                    className="w-full h-full object-cover filter contrast-[1.04] saturate-[1.05]"
                  />

                  {/* Retro Mood Stamp */}
                  {mem.mood && (
                    <div className="absolute top-2 right-2 text-base bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs w-7 h-7 rounded-full flex items-center justify-center shadow-xs">
                      {mem.mood}
                    </div>
                  )}
                </div>

                {/* Polaroid Signature Bottom Margin with Authentic Handwritten Layout */}
                <div className="mt-4 px-1 space-y-1.5 text-center flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    {/* Spot Title in stylized title style */}
                    <h4 className="font-black text-sm text-slate-800 dark:text-slate-100 tracking-tight leading-snug">
                      {mem.spotTitle || mem.location || trip.destination}
                    </h4>

                    {/* Handwritten Style Caption */}
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-serif italic leading-relaxed px-1">
                      "{mem.caption}"
                    </p>
                  </div>

                  {/* Bottom Meta & Watermark */}
                  <div className="pt-2 border-t border-[#ebe6da] dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>
                      {mem.dayNumber ? `Day ${mem.dayNumber}` : 'Trip'} · {mem.date ? formatMonthDaySlash(mem.date) : ''}
                    </span>
                    <span className="font-bold tracking-widest text-[9px] text-teal-800 dark:text-teal-400">
                      HIYORI ARCHIVE
                    </span>
                  </div>
                </div>

                {/* Floating delete button (screen only) */}
                <button
                  type="button"
                  onClick={() => handleDeleteMemory(mem.id)}
                  className="no-print absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-full bg-slate-900/70 text-white hover:bg-rose-600 transition shadow-md"
                  title="刪除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= 3. UPLOAD MEMORY PHOTO MODAL ================= */}
      {showUploadModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowUploadModal(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/70 dark:bg-slate-800/40">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
                  📸
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                    {lang === 'zh' ? '新增打卡回憶照片' : 'Add Journey Memory Photo'}
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    {lang === 'zh' ? '關聯旅程景點、寫下心得隨筆，支援拍立得自動排版' : 'Link to itinerary spot & add personal reflections'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="p-1.5 rounded-full text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveMemory} className="p-5 space-y-4 overflow-y-auto text-xs">
              {/* Photo Upload Area */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  選擇照片 *
                </label>

                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />

                {uploadImagePreview ? (
                  <div className="relative aspect-4/3 rounded-2xl overflow-hidden border-2 border-teal-500 shadow-sm group">
                    <img
                      src={uploadImagePreview}
                      alt="預覽"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-xl bg-white text-slate-800 font-bold text-xs shadow-md"
                      >
                        更換照片
                      </button>
                      <button
                        type="button"
                        onClick={() => setUploadImagePreview(null)}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-bold text-xs shadow-md"
                      >
                        清除
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-4/3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 bg-slate-50 dark:bg-slate-800/40 flex flex-col items-center justify-center p-6 text-center cursor-pointer transition hover:bg-teal-50/20"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-teal-100 dark:bg-teal-950 text-teal-600 flex items-center justify-center mb-2">
                      <Camera className="w-6 h-6" />
                    </div>
                    <p className="font-bold text-slate-800 dark:text-slate-200">
                      {isProcessingImage ? '照片壓縮處理中...' : '點擊選擇相片或拍照上傳'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      自動進行高畫質智慧壓縮，手機離線亦能高速瀏覽
                    </p>
                  </div>
                )}
              </div>

              {/* Association Mode: Itinerary Spot vs Custom Snap */}
              <div className="space-y-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300">
                  相片關聯類型
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCustomSpot(false)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      !isCustomSpot
                        ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>🗺️ 行程既定景點</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomSpot(true);
                      setUploadSpotId('');
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      isCustomSpot
                        ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>✨ 自訂隨拍打卡</span>
                  </button>
                </div>

                {!isCustomSpot ? (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      選擇對應行程景點：
                    </label>
                    <select
                      value={uploadSpotId}
                      onChange={(e) => setUploadSpotId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="">全行程通用打卡回憶</option>
                      {allSpots.map((item) => (
                        <option key={item.spot.id} value={item.spot.id}>
                          Day {item.dayNumber} · {item.spot.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        自訂打卡名稱 / 地標景點 *
                      </label>
                      <input
                        type="text"
                        value={customLocationName}
                        onChange={(e) => setCustomLocationName(e.target.value)}
                        placeholder="例：街角私房咖啡店、新幹線窗外雪景、道地拉麵攤..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          歸屬日程天數
                        </label>
                        <select
                          value={customDayNumber}
                          onChange={(e) => setCustomDayNumber(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none"
                        >
                          <option value="all">全行程通則</option>
                          {trip.days.map((d) => (
                            <option key={d.dayNumber} value={d.dayNumber}>
                              Day {d.dayNumber} ({formatMonthDaySlash(d.date)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          拍攝日期
                        </label>
                        <input
                          type="date"
                          value={customDate}
                          onChange={(e) => setCustomDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Mood Emoji Picker */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  打卡心情與天氣氛圍
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {PRESET_MOODS.map((m) => (
                    <button
                      key={m.label}
                      type="button"
                      onClick={() => setUploadMood(m.icon)}
                      className={`p-1.5 rounded-xl text-center border transition ${
                        uploadMood === m.icon
                          ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/60 font-bold text-rose-800 dark:text-rose-200'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <div className="text-base">{m.icon}</div>
                      <div className="text-[9px] truncate">{m.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Caption / Note */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  回憶隨筆與打卡心得 (將印製於拍立得下方)
                </label>
                <textarea
                  rows={2}
                  value={uploadCaption}
                  onChange={(e) => setUploadCaption(e.target.value)}
                  placeholder="寫下當時的悸動、趣事或美味回憶..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!uploadImagePreview || isProcessingImage}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold shadow-xs transition active:scale-95 flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>儲存至旅程相簿</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= 4. FULLSCREEN LIGHTBOX PREVIEW ================= */}
      {lightboxMemory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => setLightboxMemory(null)}
        >
          <div
            className="max-w-3xl w-full bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[300px]">
              <img
                src={lightboxMemory.imageUrl}
                alt={lightboxMemory.caption}
                className="max-h-[70vh] w-auto max-w-full object-contain"
              />
              <button
                type="button"
                onClick={() => setLightboxMemory(null)}
                className="absolute top-3 right-3 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base">{lightboxMemory.mood}</span>
                  <h4 className="font-bold text-sm sm:text-base text-white">
                    {lightboxMemory.spotTitle || lightboxMemory.location || trip.destination}
                  </h4>
                  {lightboxMemory.dayNumber && (
                    <span className="text-[10px] font-mono bg-teal-900/80 text-teal-200 px-2 py-0.5 rounded-full">
                      Day {lightboxMemory.dayNumber}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 italic">
                  「{lightboxMemory.caption}」
                </p>
              </div>

              <button
                type="button"
                onClick={() => setLightboxMemory(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold shrink-0"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
