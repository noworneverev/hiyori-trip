import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ItineraryItem, CategoryType } from '../../types/itinerary';
import { searchLocationOSM } from '../../utils/geo';
import { compressImageFile, storeImageAsMediaRef, extractMediaId, isMediaRef } from '../../utils/image';
import { idbDeleteMedia } from '../../utils/indexedDb';
import { sanitizeExternalUrl } from '../../utils/url';
import { canUploadImages } from '../../utils/userPermissions';
import { findInsertionPosition, checkItemTimeOverlap } from '../../utils/date';
import { MediaImage } from '../UI/MediaImage';
import {
  IosModalSheet,
  IosNavBar,
  IosInsetGroup,
  IosDisclosureRow,
  IosCheckmarkRow,
  IosToggleRow,
} from '../UI/IosPrimitives';
import {
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
  Image as ImageIcon,
  Map,
  ExternalLink,
  AlertTriangle,
  X,
  Tag,
} from 'lucide-react';

interface ItemEditModalProps {
  item?: ItineraryItem | null;
  dayNumber: number;
  currency: string;
  tripId?: string;
  ownerId?: string;
  collabId?: string;
  canEdit?: boolean;
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
}[] = [
  { type: 'spot', label: '景點觀光', icon: Landmark, color: 'text-teal-700 dark:text-teal-300' },
  { type: 'food', label: '美食品嚐', icon: Utensils, color: 'text-amber-700 dark:text-amber-300' },
  { type: 'transport', label: '交通移動', icon: Train, color: 'text-sky-700 dark:text-sky-300' },
  { type: 'hotel', label: '住宿飯店', icon: Hotel, color: 'text-violet-700 dark:text-violet-300' },
  { type: 'shopping', label: '購物採買', icon: ShoppingBag, color: 'text-pink-700 dark:text-pink-300' },
  { type: 'activity', label: '特色體驗', icon: Sparkles, color: 'text-rose-700 dark:text-rose-300' },
  { type: 'other', label: '其他行程', icon: Pin, color: 'text-slate-700 dark:text-slate-300' },
];

export const ItemEditModal: React.FC<ItemEditModalProps> = ({
  item,
  dayNumber,
  currency,
  tripId,
  ownerId,
  collabId,
  canEdit = true,
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

  // Inline iOS Disclosures
  const [categoryExpanded, setCategoryExpanded] = useState(false);
  const [timeExpanded, setTimeExpanded] = useState(false);
  const [locationExpanded, setLocationExpanded] = useState(
    Boolean(item?.locationName || item?.address || typeof item?.lat === 'number' || pickedCoords)
  );
  const [transitExpanded, setTransitExpanded] = useState(Boolean(item?.transportNote));
  const [memoriesExpanded, setMemoriesExpanded] = useState(
    Boolean(item?.googlePhotosUrl || (item?.memoryPhotos && item.memoryPhotos.length > 0))
  );

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
  const [googlePhotosUrl, setGooglePhotosUrl] = useState<string>(item?.googlePhotosUrl || '');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const initialPhotosRef = useRef<string[]>(item?.memoryPhotos || []);
  const memoryPhotosRef = useRef<string[]>(memoryPhotos);
  const didSaveRef = useRef(false);

  useEffect(() => {
    memoryPhotosRef.current = memoryPhotos;
  }, [memoryPhotos]);

  // Search OSM
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ name: string; address: string; lat: number; lng: number }>>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (pickedCoords) {
      setLat(pickedCoords.lat);
      setLng(pickedCoords.lng);
      setLocationExpanded(true);
    }
  }, [pickedCoords]);

  useEffect(() => {
    if (item) {
      initialPhotosRef.current = item.memoryPhotos || [];
      setTitle(item.title || '');
      setCategory(item.category || 'spot');
      setStartTime(item.startTime || defaultStartTime || '09:00');
      setEndTime(item.endTime || '');
      setShowEndTimeInput(Boolean(item.endTime));
      setLocationName(item.locationName || '');
      setAddress(item.address || '');
      setLat(item.lat);
      setLng(item.lng);
      setTransportNote(item.transportNote || '');
      setNotes(item.notes || '');
      setBookingCode(item.bookingCode || '');
      setCost(item.cost ? String(item.cost) : '');
      setCostPaid(item.costPaid || false);
      setMemoryPhotos(item.memoryPhotos || []);
      setMemoryMood(item.memoryMood || '✨');
      setGooglePhotosUrl(item.googlePhotosUrl || '');
    }
  }, [item, defaultStartTime]);

  const handleClose = () => {
    if (!didSaveRef.current) {
      memoryPhotosRef.current.forEach((ref) => {
        if (isMediaRef(ref) && !initialPhotosRef.current.includes(ref)) {
          const mid = extractMediaId(ref);
          if (mid) idbDeleteMedia(mid).catch(() => {});
        }
      });
    }
    onClose();
  };

  const handlePhotoFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !canEdit) return;
    setIsUploadingPhoto(true);
    setPhotoError(null);
    try {
      const remainingSlots = Math.max(0, 3 - memoryPhotos.length);
      if (remainingSlots <= 0) return;

      const compressedRefs: string[] = [];
      const countToProcess = Math.min(files.length, remainingSlots);
      for (let i = 0; i < countToProcess; i++) {
        const url = await compressImageFile(files[i]);
        const mediaRef = await storeImageAsMediaRef(tripId || 'local', url);
        compressedRefs.push(mediaRef);
      }
      setMemoryPhotos((prev) => [...prev, ...compressedRefs].slice(0, 3));
    } catch (err) {
      console.error('Failed to compress photo:', err);
      setPhotoError(err instanceof Error ? err.message : '照片上傳或壓縮失敗，請更換檔案重試');
    } finally {
      setIsUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (idx: number) => {
    if (!canEdit) return;
    const removed = memoryPhotos[idx];
    if (removed && isMediaRef(removed) && !initialPhotosRef.current.includes(removed)) {
      const mid = extractMediaId(removed);
      if (mid) idbDeleteMedia(mid).catch(() => {});
    }
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

  const adjustStartTime = (minutesToAdd: number) => {
    const [hStr, mStr] = startTime.split(':');
    let total = (parseInt(hStr, 10) || 9) * 60 + (parseInt(mStr, 10) || 0) + minutesToAdd;
    if (total >= 24 * 60) total %= 24 * 60;
    if (total < 0) total += 24 * 60;
    const h = Math.floor(total / 60);
    const m = total % 60;
    setStartTime(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };

  const appendTransitChip = (chip: string) => {
    setTransportNote((prev) => (prev ? `${prev} · ${chip}` : chip));
  };

  const othersInDay = useMemo(() => {
    return existingDayItems.filter((it) => it.id !== item?.id);
  }, [existingDayItems, item?.id]);

  const insertionPreview = useMemo(() => {
    return findInsertionPosition(othersInDay, startTime);
  }, [othersInDay, startTime]);

  const timeWarnings = useMemo(() => {
    return checkItemTimeOverlap(
      { id: item?.id, title: title || '此行程', startTime, endTime: showEndTimeInput ? endTime : undefined },
      othersInDay,
      'zh'
    );
  }, [item?.id, title, startTime, endTime, showEndTimeInput, othersInDay]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !title.trim()) return;

    didSaveRef.current = true;
    onSave(
      {
        title: title.trim(),
        category,
        startTime,
        endTime: showEndTimeInput && endTime ? endTime : undefined,
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
        googlePhotosUrl: sanitizeExternalUrl(googlePhotosUrl) || undefined,
        completed: item?.completed || false,
      },
      item?.id
    );
  };

  const activeCategoryObj = CATEGORIES.find((c) => c.type === category) || CATEGORIES[0];
  const ActiveCategoryIcon = activeCategoryObj.icon;
  const hasCoords = typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);

  return (
    <IosModalSheet
      onClose={handleClose}
      maxWidthClass="sm:max-w-xl"
      variant="grouped"
      ariaLabel={item ? '編輯景點' : `新增第 ${dayNumber} 天行程`}
    >
      <IosNavBar
        title={item ? '編輯行程景點' : `新增第 ${dayNumber} 天`}
        subtitle={`自動排於第 ${insertionPreview.targetIndex + 1} 站`}
        leftLabel="取消"
        onLeftClick={handleClose}
        rightLabel={item ? '儲存' : '加入'}
        rightType="submit"
        rightFormId="item-edit-form"
        rightDisabled={!canEdit || !title.trim()}
      />

      <form
        id="item-edit-form"
        onSubmit={handleSubmit}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 sm:p-5 space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
      >
        {/* Group 1: Core Info */}
        <IosInsetGroup header="基本資訊">
          {/* Spot Name Row */}
          <div className="px-4 py-2.5 min-h-[50px] flex items-center justify-between gap-2">
            <label className="text-sm sm:text-xs font-semibold text-slate-800 dark:text-slate-200 shrink-0 w-20">
              景點名稱<span className="text-rose-500 ml-0.5">*</span>
            </label>
            <div className="flex-1 min-w-0 flex items-center justify-end gap-1.5">
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="輸入景點或餐廳名稱..."
                className="min-w-0 flex-1 bg-transparent text-right text-[16px] sm:text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
              />
              {title.trim().length >= 2 && !address && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery(title);
                    handleSearchOSM(title);
                    setLocationExpanded(true);
                  }}
                  className="min-h-[34px] px-2.5 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900 text-teal-700 dark:text-teal-300 rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 transition cursor-pointer"
                >
                  <Search className="w-3 h-3" />
                  <span>找地標</span>
                </button>
              )}
            </div>
          </div>

          {/* Inline Category Disclosure Row */}
          <IosDisclosureRow
            icon={<Tag className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label="行程類別"
            value={
              <span className="inline-flex items-center gap-1.5">
                <ActiveCategoryIcon className={`w-3.5 h-3.5 ${activeCategoryObj.color}`} />
                <span>{activeCategoryObj.label}</span>
              </span>
            }
            expanded={categoryExpanded}
            onToggle={() => setCategoryExpanded((v) => !v)}
          >
            <div className="divide-y divide-[#E5E2DC]/70 dark:divide-slate-800/80">
              {CATEGORIES.map((cat) => {
                const CatIcon = cat.icon;
                return (
                  <IosCheckmarkRow
                    key={cat.type}
                    inset
                    icon={<CatIcon className={`w-4 h-4 ${cat.color}`} />}
                    label={cat.label}
                    selected={category === cat.type}
                    onSelect={() => {
                      setCategory(cat.type);
                      setCategoryExpanded(false);
                    }}
                  />
                );
              })}
            </div>
          </IosDisclosureRow>

          {/* Inline Schedule Time Disclosure Row */}
          <IosDisclosureRow
            icon={<Clock className={`w-4 h-4 ${timeWarnings.length > 0 ? 'text-amber-600' : 'text-teal-700 dark:text-teal-400'}`} />}
            label="安排時間"
            subtitle={timeWarnings.length > 0 ? timeWarnings[0] : undefined}
            value={
              <span className="font-mono tabular-nums">
                {startTime}
                {showEndTimeInput && endTime ? ` – ${endTime}` : ''}
              </span>
            }
            valueAccent
            expanded={timeExpanded}
            onToggle={() => setTimeExpanded((v) => !v)}
          >
            <div className="p-3.5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    開始時間
                  </label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-1.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono tabular-nums font-bold text-[16px] sm:text-xs outline-none focus:border-teal-600"
                  />
                </div>

                {showEndTimeInput ? (
                  <div className="flex-1">
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      結束時間
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full min-h-[42px] px-3 py-1.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono tabular-nums font-bold text-[16px] sm:text-xs outline-none focus:border-teal-600"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEndTime('');
                          setShowEndTimeInput(false);
                        }}
                        className="min-w-[38px] min-h-[38px] flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
                        title="移除結束時間"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pt-5">
                    <button
                      type="button"
                      onClick={() => setShowEndTimeInput(true)}
                      className="min-h-[42px] px-3 py-2 rounded-xl border border-dashed border-[#E5E2DC] dark:border-slate-700 hover:border-teal-600 text-slate-600 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
                    >
                      + 結束時間
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Time Jump Bar */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-[11px]">
                {[
                  { label: '+30分', onClick: () => adjustStartTime(30) },
                  { label: '+1小時', onClick: () => adjustStartTime(60) },
                  { label: '09:00', onClick: () => setStartTime('09:00') },
                  { label: '12:00', onClick: () => setStartTime('12:00') },
                  { label: '15:00', onClick: () => setStartTime('15:00') },
                  { label: '18:00', onClick: () => setStartTime('18:00') },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    onClick={btn.onClick}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700 hover:border-teal-600 text-slate-700 dark:text-slate-200 font-mono tabular-nums font-semibold shrink-0 cursor-pointer"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>

              {timeWarnings.length > 0 && (
                <div className="p-2.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-[11px] space-y-1">
                  {timeWarnings.map((warn, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                      <span className="font-mono tabular-nums">{warn}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </IosDisclosureRow>
        </IosInsetGroup>

        {/* Group 2: Location & Map Navigation */}
        <IosInsetGroup header="地點與地圖導航">
          <IosDisclosureRow
            icon={<MapPin className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label="地點座標與地址"
            value={
              locationName
                ? locationName
                : hasCoords
                ? `${lat!.toFixed(3)}, ${lng!.toFixed(3)}`
                : '選填'
            }
            expanded={locationExpanded}
            onToggle={() => setLocationExpanded((v) => !v)}
          >
            <div className="p-3.5 space-y-3">
              {/* OSM Search & Map Pick */}
              <div className="relative space-y-2">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜尋地名自動填入地址與座標..."
                    className="min-w-0 flex-1 min-h-[40px] px-3 py-1.5 text-[16px] sm:text-xs bg-white dark:bg-slate-900 rounded-xl border border-[#E5E2DC] dark:border-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:border-teal-600"
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
                    className="min-h-[40px] px-3 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 disabled:opacity-45 text-white rounded-xl font-semibold text-xs flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{isSearching ? '...' : '搜尋'}</span>
                  </button>
                  {onStartMapPick && (
                    <button
                      type="button"
                      onClick={onStartMapPick}
                      className="min-h-[40px] px-3 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Map className="w-3.5 h-3.5" />
                      <span>選點</span>
                    </button>
                  )}
                </div>

                {searchResults.length > 0 && (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#E5E2DC] dark:border-slate-700 max-h-44 overflow-y-auto divide-y divide-[#E5E2DC]/60 dark:divide-slate-800">
                    {searchResults.map((res, i) => (
                      <button
                        type="button"
                        key={i}
                        onClick={() => handleSelectSearchResult(res)}
                        className="w-full text-left px-3 py-2.5 hover:bg-teal-50 dark:hover:bg-slate-800 transition text-xs flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{res.name}</p>
                          <p className="text-slate-500 dark:text-slate-400 truncate text-[11px]">{res.address}</p>
                        </div>
                        <Navigation className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 divide-y divide-[#E5E2DC]/75 dark:divide-slate-800">
                <div className="px-3.5 py-2 flex items-center justify-between gap-3 min-h-[44px]">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 shrink-0">
                    地標名稱
                  </label>
                  <input
                    type="text"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="例如：名古屋城天守閣"
                    className="min-w-0 flex-1 bg-transparent text-right text-[16px] sm:text-xs text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div className="px-3.5 py-2 flex items-center justify-between gap-3 min-h-[44px]">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 shrink-0">
                    詳細地址
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="選填"
                    className="min-w-0 flex-1 bg-transparent text-right text-[16px] sm:text-xs text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <div className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {hasCoords ? (
                    <span className="text-teal-700 dark:text-teal-400 font-semibold inline-flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      {lat!.toFixed(4)}, {lng!.toFixed(4)}
                    </span>
                  ) : (
                    <span>尚未設定導航座標</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowRawCoords(!showRawCoords)}
                  className="text-teal-700 dark:text-teal-400 font-semibold hover:underline cursor-pointer"
                >
                  {showRawCoords ? '隱藏座標' : '手動輸入座標'}
                </button>
              </div>

              {showRawCoords && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="any"
                    value={lat ?? ''}
                    onChange={(e) => setLat(e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="緯度 35.1856"
                    className="w-full min-h-[38px] px-2.5 bg-white dark:bg-slate-900 rounded-xl border border-[#E5E2DC] dark:border-slate-700 font-mono text-[16px] sm:text-xs outline-none"
                  />
                  <input
                    type="number"
                    step="any"
                    value={lng ?? ''}
                    onChange={(e) => setLng(e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="經度 136.8991"
                    className="w-full min-h-[38px] px-2.5 bg-white dark:bg-slate-900 rounded-xl border border-[#E5E2DC] dark:border-slate-700 font-mono text-[16px] sm:text-xs outline-none"
                  />
                </div>
              )}
            </div>
          </IosDisclosureRow>
        </IosInsetGroup>

        {/* Group 3: Transit, Booking, Budget & Notes */}
        <IosInsetGroup header="交通・預約・預算">
          <IosDisclosureRow
            icon={<Bus className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label="交通提醒"
            value={transportNote.trim() || '選填'}
            expanded={transitExpanded}
            onToggle={() => setTransitExpanded((v) => !v)}
          >
            <div className="p-3.5 space-y-2.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                {['步行 5 分', '搭乘地鐵', '搭公車', 'JR/新幹線', '搭計程車'].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => appendTransitChip(chip)}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700 hover:border-teal-600 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    +{chip}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={transportNote}
                onChange={(e) => setTransportNote(e.target.value)}
                placeholder="例如：地鐵 7 號出口直達、步行 3 分鐘..."
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-white dark:bg-slate-900 text-[16px] sm:text-xs outline-none focus:border-teal-600"
              />
            </div>
          </IosDisclosureRow>

          {/* Booking Code Row */}
          <div className="px-4 py-2.5 min-h-[48px] flex items-center justify-between gap-3">
            <label className="text-sm sm:text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 shrink-0">
              <Bookmark className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>預約代碼</span>
            </label>
            <input
              type="text"
              value={bookingCode}
              onChange={(e) => setBookingCode(e.target.value)}
              placeholder="#BK-88219"
              className="min-w-0 flex-1 bg-transparent text-right text-[16px] sm:text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
            />
          </div>

          {/* Cost Row */}
          <div className="px-4 py-2.5 min-h-[48px] flex items-center justify-between gap-3">
            <label className="text-sm sm:text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 shrink-0">
              <DollarSign className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>預估花費 ({currency})</span>
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0"
              className="min-w-0 flex-1 bg-transparent text-right text-[16px] sm:text-xs font-mono tabular-nums font-bold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
            />
          </div>

          {/* Paid Switch */}
          <IosToggleRow
            label="費用已預先付款"
            checked={costPaid}
            onChange={setCostPaid}
          />

          {/* Notes Area */}
          <div className="p-3.5 space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
              <span>備忘與景點筆記</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例如：門票須出示護照、必點招牌餐點、最後入場時間..."
              className="w-full p-3 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-900/70 text-[16px] sm:text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-teal-600 leading-relaxed"
            />
          </div>
        </IosInsetGroup>

        {/* Group 4: Photos & Memories */}
        <IosInsetGroup header="相片打卡與回憶">
          <IosDisclosureRow
            icon={<Camera className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label="打卡相片與心情"
            value={
              memoryPhotos.length > 0
                ? `${memoryMood} ${memoryPhotos.length} 張相片`
                : memoryMood
            }
            expanded={memoriesExpanded}
            onToggle={() => setMemoriesExpanded((v) => !v)}
          >
            <div className="p-3.5 space-y-3">
              {/* Mood Strip */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                <span className="text-[11px] text-slate-500 shrink-0">心情：</span>
                {['✨', '☀️', '🍜', '⛩️', '🌸', '🍁', '☕', '🏯', '🛍️'].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setMemoryMood(emoji)}
                    className={`w-8 h-8 rounded-xl text-sm flex items-center justify-center transition shrink-0 cursor-pointer ${
                      memoryMood === emoji
                        ? 'bg-teal-700 text-white shadow-2xs scale-105'
                        : 'bg-white dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {canUploadImages({ canEdit }) && (
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
                    disabled={isUploadingPhoto || memoryPhotos.length >= 3}
                    className="w-full min-h-[42px] px-3 border border-dashed border-[#E5E2DC] dark:border-slate-700 hover:border-teal-600 disabled:opacity-50 bg-white dark:bg-slate-800/80 rounded-xl flex items-center justify-center gap-2 text-teal-700 dark:text-teal-300 text-xs font-semibold transition cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>
                      {isUploadingPhoto
                        ? '照片處理中...'
                        : memoryPhotos.length >= 3
                        ? '已達上限 3 張'
                        : '選取景點相片（最多 3 張）'}
                    </span>
                  </button>
                  {photoError && (
                    <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                      {photoError}
                    </p>
                  )}
                </>
              )}

              {memoryPhotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {memoryPhotos.map((photo, idx) => (
                    <div
                      key={idx}
                      className="relative rounded-xl overflow-hidden border border-[#E5E2DC] dark:border-slate-700 aspect-square"
                    >
                      <MediaImage
                        src={photo}
                        tripId={tripId}
                        ownerId={ownerId}
                        collabId={collabId}
                        alt={`Memory ${idx}`}
                        className="w-full h-full object-cover"
                      />
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(idx)}
                          className="absolute top-1 right-1 w-7 h-7 flex items-center justify-center bg-black/75 hover:bg-rose-600 text-white rounded-full transition cursor-pointer"
                          title="移除此相片"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Google Photos Original Link */}
              <div className="pt-2 border-t border-[#E5E2DC]/75 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                    <ExternalLink className="w-3 h-3 text-teal-700 dark:text-teal-400" />
                    <span>Google 相簿連結（選填）</span>
                  </span>
                  {sanitizeExternalUrl(googlePhotosUrl) && (
                    <a
                      href={sanitizeExternalUrl(googlePhotosUrl)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal-700 dark:text-teal-400 font-semibold hover:underline"
                    >
                      開啟測試
                    </a>
                  )}
                </div>
                <input
                  type="url"
                  value={googlePhotosUrl}
                  onChange={(e) => setGooglePhotosUrl(e.target.value)}
                  placeholder="https://photos.app.goo.gl/..."
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-[16px] sm:text-xs outline-none focus:border-teal-600"
                />
              </div>
            </div>
          </IosDisclosureRow>
        </IosInsetGroup>
      </form>
    </IosModalSheet>
  );
};
