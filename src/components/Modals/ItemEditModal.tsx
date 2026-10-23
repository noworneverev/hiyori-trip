import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ItineraryItem, CategoryType } from '../../types/itinerary';
import { searchLocationOSM } from '../../utils/geo';
import { compressImageFile } from '../../utils/image';
import { canUploadImages } from '../../utils/userPermissions';
import { findInsertionPosition } from '../../utils/date';
import {
  X,
  MapPin,
  Search,
  Clock,
  DollarSign,
  Bookmark,
  Bus,
  FileText,
  Check,
  Navigation,
  Landmark,
  Utensils,
  Train,
  Hotel,
  ShoppingBag,
  Sparkles,
  Pin,
  Camera,
  Trash2,
  Plus,
  ArrowUpDown,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Map,
  Sparkle,
  Footprints,
} from 'lucide-react';

interface ItemEditModalProps {
  item?: ItineraryItem | null;
  dayNumber: number;
  currency: string;
  onSave: (itemData: Omit<ItineraryItem, 'id'>, existingId?: string) => void;
  onClose: () => void;
  onStartMapPick?: () => void;
  pickedCoords?: { lat: number; lng: number } | null;
  existingDayItems?: ItineraryItem[];
  defaultStartTime?: string;
}

const CATEGORIES: {
  type: CategoryType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  activeBg: string;
}[] = [
  { type: 'spot', label: '景點觀光', icon: Landmark, color: 'text-teal-700 dark:text-teal-300', activeBg: 'bg-teal-600 text-white shadow-xs' },
  { type: 'food', label: '美食品嚐', icon: Utensils, color: 'text-amber-700 dark:text-amber-300', activeBg: 'bg-amber-600 text-white shadow-xs' },
  { type: 'transport', label: '交通移動', icon: Train, color: 'text-sky-700 dark:text-sky-300', activeBg: 'bg-sky-600 text-white shadow-xs' },
  { type: 'hotel', label: '住宿飯店', icon: Hotel, color: 'text-violet-700 dark:text-violet-300', activeBg: 'bg-violet-600 text-white shadow-xs' },
  { type: 'shopping', label: '購物採買', icon: ShoppingBag, color: 'text-pink-700 dark:text-pink-300', activeBg: 'bg-pink-600 text-white shadow-xs' },
  { type: 'activity', label: '特色體驗', icon: Sparkles, color: 'text-rose-700 dark:text-rose-300', activeBg: 'bg-rose-600 text-white shadow-xs' },
  { type: 'other', label: '其他行程', icon: Pin, color: 'text-slate-700 dark:text-slate-300', activeBg: 'bg-slate-700 text-white shadow-xs' },
];

export const ItemEditModal: React.FC<ItemEditModalProps> = ({
  item,
  dayNumber,
  currency,
  onSave,
  onClose,
  onStartMapPick,
  pickedCoords,
  existingDayItems = [],
  defaultStartTime,
}) => {
  const [title, setTitle] = useState(item?.title || '');
  const [category, setCategory] = useState<CategoryType>(item?.category || 'spot');
  const [startTime, setStartTime] = useState(item?.startTime || defaultStartTime || '09:00');
  const [endTime, setEndTime] = useState(item?.endTime || '');
  const [showEndTimeInput, setShowEndTimeInput] = useState(Boolean(item?.endTime));

  // Progressive Disclosure: "更多選填資訊"
  const hasExistingExtraDetails = Boolean(
    item?.locationName ||
    item?.address ||
    item?.lat ||
    item?.transportNote ||
    item?.notes ||
    item?.bookingCode ||
    item?.cost ||
    (item?.memoryPhotos && item.memoryPhotos.length > 0)
  );
  const [showMoreDetails, setShowMoreDetails] = useState(hasExistingExtraDetails);

  // Detail fields
  const [locationName, setLocationName] = useState(item?.locationName || '');
  const [address, setAddress] = useState(item?.address || '');
  const [lat, setLat] = useState<number | undefined>(pickedCoords ? pickedCoords.lat : item?.lat);
  const [lng, setLng] = useState<number | undefined>(pickedCoords ? pickedCoords.lng : item?.lng);
  const [showRawCoords, setShowRawCoords] = useState(false);

  const [transportNote, setTransportNote] = useState(item?.transportNote || '');
  const [notes, setNotes] = useState(item?.notes || '');
  const [bookingCode, setBookingCode] = useState(item?.bookingCode || '');
  const [cost, setCost] = useState<string>(item?.cost ? String(item.cost) : '');
  const [costPaid, setCostPaid] = useState(item?.costPaid || false);
  const [memoryPhotos, setMemoryPhotos] = useState<string[]>(item?.memoryPhotos || []);
  const [memoryMood, setMemoryMood] = useState<string>(item?.memoryMood || '✨');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Search OSM
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ name: string; address: string; lat: number; lng: number }>>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Sync pickedCoords if updated externally
  useEffect(() => {
    if (pickedCoords) {
      setLat(pickedCoords.lat);
      setLng(pickedCoords.lng);
      setShowMoreDetails(true);
    }
  }, [pickedCoords]);

  const handlePhotoFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploadingPhoto(true);
    try {
      const compressed: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const url = await compressImageFile(files[i], 1200, 0.8);
        compressed.push(url);
      }
      setMemoryPhotos((prev) => [...prev, ...compressed]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (idx: number) => {
    setMemoryPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSearchOSM = async (queryText?: string) => {
    const q = queryText ?? searchQuery;
    if (!q.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchLocationOSM(q);
      setSearchResults(results);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (res: { name: string; address: string; lat: number; lng: number }) => {
    if (!title) setTitle(res.name);
    setLocationName(res.name);
    setAddress(res.address);
    setLat(res.lat);
    setLng(res.lng);
    setSearchResults([]);
    setSearchQuery('');
  };

  // Quick Time Adjustments
  const adjustStartTime = (minutesToAdd: number) => {
    const [hStr, mStr] = startTime.split(':');
    let total = (parseInt(hStr, 10) || 9) * 60 + (parseInt(mStr, 10) || 0) + minutesToAdd;
    if (total >= 24 * 60) total %= 24 * 60;
    if (total < 0) total += 24 * 60;
    const h = Math.floor(total / 60);
    const m = total % 60;
    setStartTime(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };

  const setSpecificTime = (tStr: string) => {
    setStartTime(tStr);
  };

  // Quick transit snippet inserter
  const appendTransitChip = (chip: string) => {
    setTransportNote((prev) => (prev ? `${prev} · ${chip}` : chip));
  };

  // Chronological placement calculation
  const othersInDay = useMemo(() => {
    return existingDayItems.filter((it) => it.id !== item?.id);
  }, [existingDayItems, item?.id]);

  const insertionPreview = useMemo(() => {
    return findInsertionPosition(othersInDay, startTime);
  }, [othersInDay, startTime]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSave(
      {
        title: title.trim(),
        category,
        startTime,
        endTime: endTime || undefined,
        locationName: locationName.trim() || undefined,
        address: address.trim() || undefined,
        lat,
        lng,
        transportNote: transportNote.trim() || undefined,
        notes: notes.trim() || undefined,
        bookingCode: bookingCode.trim() || undefined,
        cost: cost ? parseFloat(cost) : undefined,
        costPaid,
        memoryPhotos: memoryPhotos.length > 0 ? memoryPhotos : undefined,
        memoryMood: memoryMood || '✨',
        completed: item?.completed || false,
      },
      item?.id
    );
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-t-[28px] sm:rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-100 flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* iOS Drag Handle on Mobile */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Clean Apple-style Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
            <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight">
              {item ? '編輯行程景點' : `新增第 ${dayNumber} 天行程`}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
          {/* 1. Spot Name with instant search preview */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
              景點或店家名稱 <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                autoFocus={!item}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="輸入景點或餐廳，例如：兼六園、一蘭拉麵、金澤城..."
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition"
              />
              {title.trim().length >= 2 && !address && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery(title);
                    handleSearchOSM(title);
                    setShowMoreDetails(true);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900 text-teal-700 dark:text-teal-300 rounded-xl text-[11px] font-semibold flex items-center gap-1 transition"
                >
                  <Search className="w-3 h-3" />
                  <span>找地標</span>
                </button>
              )}
            </div>
          </div>

          {/* 2. Tactile Category Pills */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">類別</label>
              <span className="text-[11px] text-slate-400">點選切換卡片顏色與圖標</span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {CATEGORIES.map((cat) => {
                const isActive = category === cat.type;
                const Icon = cat.icon;
                return (
                  <button
                    type="button"
                    key={cat.type}
                    onClick={() => setCategory(cat.type)}
                    className={`py-2 px-1.5 rounded-xl text-[11px] font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                      isActive
                        ? cat.activeBg
                        : 'bg-slate-100/80 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="truncate">{cat.label.slice(0, 2)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Time Schedule & Quick Jump Controls */}
          <div className="bg-slate-50/90 dark:bg-slate-800/50 p-3.5 rounded-2xl border border-slate-200/70 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>安排時間</span>
              </label>

              {/* Chronological order hint (calm, 1-line) */}
              <span className="text-[11px] font-medium text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded-lg border border-teal-200/50 dark:border-teal-800/40">
                自動排於第 {insertionPreview.targetIndex + 1} 站
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1">
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold text-sm focus:border-teal-500 outline-none"
                />
              </div>

              {showEndTimeInput ? (
                <div className="flex-1 flex items-center gap-1">
                  <span className="text-slate-400 font-bold">-</span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold text-sm focus:border-teal-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEndTime('');
                      setShowEndTimeInput(false);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600"
                    title="移除結束時間"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowEndTimeInput(true)}
                  className="px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 text-slate-500 dark:text-slate-400 hover:text-teal-600 text-xs font-medium transition"
                >
                  + 加結束時間
                </button>
              )}
            </div>

            {/* Quick Time Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-[11px]">
              <span className="text-slate-400 shrink-0">快捷：</span>
              <button
                type="button"
                onClick={() => adjustStartTime(30)}
                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-teal-500 text-slate-700 dark:text-slate-300 font-semibold transition active:scale-95 shrink-0"
              >
                +30分
              </button>
              <button
                type="button"
                onClick={() => adjustStartTime(60)}
                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-teal-500 text-slate-700 dark:text-slate-300 font-semibold transition active:scale-95 shrink-0"
              >
                +1小時
              </button>
              <button
                type="button"
                onClick={() => setSpecificTime('09:00')}
                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-teal-500 text-slate-700 dark:text-slate-300 font-semibold transition active:scale-95 shrink-0"
              >
                上午 09:00
              </button>
              <button
                type="button"
                onClick={() => setSpecificTime('12:00')}
                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-teal-500 text-slate-700 dark:text-slate-300 font-semibold transition active:scale-95 shrink-0"
              >
                午餐 12:00
              </button>
              <button
                type="button"
                onClick={() => setSpecificTime('15:00')}
                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-teal-500 text-slate-700 dark:text-slate-300 font-semibold transition active:scale-95 shrink-0"
              >
                下午 15:00
              </button>
              <button
                type="button"
                onClick={() => setSpecificTime('18:00')}
                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-teal-500 text-slate-700 dark:text-slate-300 font-semibold transition active:scale-95 shrink-0"
              >
                晚餐 18:00
              </button>
            </div>
          </div>

          {/* 4. Progressive Disclosure Accordion: 更多詳細資訊 (地點、交通、預約、花費、照片) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowMoreDetails(!showMoreDetails)}
              className="w-full py-2.5 px-3 rounded-2xl bg-slate-100/70 dark:bg-slate-800/60 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 transition"
            >
              <div className="flex items-center gap-2">
                <span>更多詳細資訊 (地點、交通、預約、花費、相片)</span>
                {(locationName || transportNote || bookingCode || cost) && (
                  <span className="w-2 h-2 rounded-full bg-teal-500" />
                )}
              </div>
              {showMoreDetails ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {showMoreDetails && (
              <div className="mt-3 space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-150">
                {/* 4a. Location & Address */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                      <MapPin className="w-3.5 h-3.5 text-teal-600" />
                      地點與地圖導航
                    </span>
                    <div className="flex items-center gap-1.5">
                      {onStartMapPick && (
                        <button
                          type="button"
                          onClick={onStartMapPick}
                          className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 transition active:scale-95 shadow-2xs"
                        >
                          <Map className="w-3 h-3" />
                          地圖選點
                        </button>
                      )}
                    </div>
                  </div>

                  {/* OSM Quick Search bar */}
                  <div className="relative">
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜尋地名以自動填入地址 (如：清水寺、金澤鼓門)"
                        className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSearchOSM();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleSearchOSM()}
                        disabled={isSearching || !searchQuery.trim()}
                        className="px-3 py-1.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 disabled:opacity-50 text-white rounded-xl font-medium text-xs flex items-center gap-1 transition"
                      >
                        <Search className="w-3 h-3" />
                        <span>{isSearching ? '搜尋中...' : '搜尋'}</span>
                      </button>
                    </div>

                    {searchResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 max-h-44 overflow-y-auto z-30 p-1 divide-y divide-slate-100 dark:divide-slate-700">
                        {searchResults.map((res, i) => (
                          <button
                            type="button"
                            key={i}
                            onClick={() => handleSelectSearchResult(res)}
                            className="w-full text-left p-2 hover:bg-teal-50 dark:hover:bg-slate-700/60 rounded-xl transition text-[11px]"
                          >
                            <p className="font-bold text-slate-800 dark:text-slate-100">{res.name}</p>
                            <p className="text-slate-500 dark:text-slate-400 truncate text-[10px]">{res.address}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">標記地標名</label>
                      <input
                        type="text"
                        value={locationName}
                        onChange={(e) => setLocationName(e.target.value)}
                        placeholder="例如：名古屋城天守閣"
                        className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 text-xs outline-none focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">詳細地址</label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="詳細地址 (選填)"
                        className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 text-xs outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>

                  {/* Coords summary badge & optional raw inputs */}
                  <div className="pt-1 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      {lat && lng ? (
                        <span className="text-teal-700 dark:text-teal-300 font-medium flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 text-teal-600" />
                          已就緒導航座標 ({lat.toFixed(4)}, {lng.toFixed(4)})
                        </span>
                      ) : (
                        <span>尚未設定座標（亦可在地圖點擊快速標定）</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowRawCoords(!showRawCoords)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
                    >
                      {showRawCoords ? '隱藏經緯度' : '手動輸入座標'}
                    </button>
                  </div>

                  {showRawCoords && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="text-[10px] text-slate-400 block">緯度 (Latitude)</label>
                        <input
                          type="number"
                          step="any"
                          value={lat ?? ''}
                          onChange={(e) => setLat(e.target.value ? parseFloat(e.target.value) : undefined)}
                          placeholder="35.1856"
                          className="w-full px-2 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block">經度 (Longitude)</label>
                        <input
                          type="number"
                          step="any"
                          value={lng ?? ''}
                          onChange={(e) => setLng(e.target.value ? parseFloat(e.target.value) : undefined)}
                          placeholder="136.8991"
                          className="w-full px-2 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 4b. Transit guidance with instant chips */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Bus className="w-3.5 h-3.5 text-teal-600" />
                      <span>交通提醒與搭乘方式</span>
                    </label>
                    <div className="flex items-center gap-1">
                      {['步行 5 分', '搭乘地鐵', '搭公車', 'JR/新幹線', '搭計程車'].map((chip) => (
                        <button
                          type="button"
                          key={chip}
                          onClick={() => appendTransitChip(chip)}
                          className="px-1.5 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[10px] text-slate-600 dark:text-slate-400 font-medium transition"
                        >
                          +{chip}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={transportNote}
                    onChange={(e) => setTransportNote(e.target.value)}
                    placeholder="例如：地鐵 7 號出口直達、步行 3 分鐘..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:border-teal-500 outline-none"
                  />
                </div>

                {/* 4c. Booking code & estimated budget */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                      <Bookmark className="w-3.5 h-3.5 text-teal-600" />
                      <span>預約代碼 / 憑證號碼</span>
                    </label>
                    <input
                      type="text"
                      value={bookingCode}
                      onChange={(e) => setBookingCode(e.target.value)}
                      placeholder="例如：#BK-88219 或 預訂姓名"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono focus:border-teal-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-teal-600" />
                      <span>預估花費 ({currency})</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={cost}
                        onChange={(e) => setCost(e.target.value)}
                        placeholder="0"
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono focus:border-teal-500 outline-none"
                      />
                      <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 cursor-pointer text-xs select-none">
                        <input
                          type="checkbox"
                          checked={costPaid}
                          onChange={(e) => setCostPaid(e.target.checked)}
                          className="w-4 h-4 rounded accent-teal-600 cursor-pointer"
                        />
                        <span>已付款</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* 4d. Notes */}
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-teal-600" />
                    <span>備忘與景點筆記</span>
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="例如：門票折扣須出示護照、必點招牌甜點、最後入場時間 16:30..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:border-teal-500 outline-none leading-relaxed"
                  />
                </div>

                {/* 4e. Photos & Mood */}
                <div className="p-3.5 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5 text-xs">
                      <Camera className="w-3.5 h-3.5 text-rose-600" />
                      <span>相片打卡與回憶</span>
                    </span>
                    <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">
                      已選 {memoryPhotos.length} 張
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    <span className="text-[11px] text-slate-500 shrink-0">打卡心情：</span>
                    {['✨', '☀️', '🍜', '⛩️', '🌸', '🍁', '☕', '🏯', '🛍️'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setMemoryMood(emoji)}
                        className={`w-7 h-7 rounded-xl text-xs flex items-center justify-center transition shrink-0 ${
                          memoryMood === emoji
                            ? 'bg-rose-600 text-white shadow-2xs scale-105'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  {canUploadImages() && (
                    <>
                      <input
                        type="file"
                        ref={photoInputRef}
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handlePhotoFiles}
                      />
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={isUploadingPhoto}
                        className="w-full py-2 px-3 border border-dashed border-rose-300 dark:border-rose-800 hover:border-rose-500 bg-white dark:bg-slate-800/80 rounded-xl flex items-center justify-center gap-2 text-rose-700 dark:text-rose-300 text-xs font-semibold transition active:scale-98"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-rose-600" />
                        <span>{isUploadingPhoto ? '照片壓縮中...' : '選取相片 (自動排入旅程相簿與拍立得)'}</span>
                      </button>
                    </>
                  )}

                  {memoryPhotos.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 pt-1">
                      {memoryPhotos.map((photo, idx) => (
                        <div key={idx} className="relative group rounded-xl overflow-hidden border border-rose-200 dark:border-rose-900/60 aspect-square">
                          <img src={photo} alt={`Memory ${idx}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(idx)}
                            className="absolute top-1 right-1 p-1 bg-black/75 hover:bg-rose-600 text-white rounded-full transition"
                            title="移除此相片"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sticky Bottom Controls */}
          <div className="pt-3 pb-1 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs transition"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md transition active:scale-95 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{item ? '儲存變更' : '加入行程'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
