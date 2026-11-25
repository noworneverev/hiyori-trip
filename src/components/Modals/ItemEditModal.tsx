import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ItineraryItem, CategoryType } from '../../types/itinerary';
import {
  searchLocationOSM,
  isValidCoordinate,
  looksLikeGoogleMapsUrl,
  resolveGoogleMapsLink,
} from '../../utils/geo';
import { compressImageFile, storeImageAsMediaRef, extractMediaId, isMediaRef } from '../../utils/image';
import { idbDeleteMedia } from '../../utils/indexedDb';
import { sanitizeExternalUrl } from '../../utils/url';
import { canUploadImages } from '../../utils/userPermissions';
import { findInsertionPosition, checkItemTimeOverlap } from '../../utils/date';
import { Language } from '../../utils/i18n';
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
  Link2,
} from 'lucide-react';

interface ItemEditModalProps {
  item?: ItineraryItem | null;
  dayNumber: number;
  currency: string;
  lang?: Language;
  tripId?: string;
  ownerId?: string;
  collabId?: string;
  canEdit?: boolean;
  onSave: (itemData: Omit<ItineraryItem, 'id'>, existingId?: string) => void;
  onClose: () => void;
  onStartMapPick?: (currentDraft?: Partial<ItineraryItem>) => void;
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
  lang = 'zh',
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
  const [startTime, setStartTime] = useState(item ? (item.startTime ?? '') : (defaultStartTime ?? '09:00'));
  const [endTime, setEndTime] = useState(item?.endTime || '');
  const [showEndTimeInput, setShowEndTimeInput] = useState(Boolean(item?.endTime));

  // Inline iOS Disclosures
  const [categoryExpanded, setCategoryExpanded] = useState(false);
  const [timeExpanded, setTimeExpanded] = useState(false);
  const [locationExpanded, setLocationExpanded] = useState(
    Boolean(item?.locationName || item?.address || isValidCoordinate(item?.lat, item?.lng) || pickedCoords)
  );
  const [transitExpanded, setTransitExpanded] = useState(Boolean(item?.transportNote));
  const [memoriesExpanded, setMemoriesExpanded] = useState(
    Boolean(item?.googlePhotosUrl || (item?.memoryPhotos && item.memoryPhotos.length > 0))
  );

  // Detail fields (string states for lat/lng allow smooth typing of negative coordinates like -33.8688)
  const initialLat = pickedCoords ? pickedCoords.lat : item?.lat;
  const initialLng = pickedCoords ? pickedCoords.lng : item?.lng;
  const [locationName, setLocationName] = useState(item?.locationName || '');
  const [address, setAddress] = useState(item?.address || '');
  const [latText, setLatText] = useState<string>(
    typeof initialLat === 'number' && Number.isFinite(initialLat) ? String(initialLat) : ''
  );
  const [lngText, setLngText] = useState<string>(
    typeof initialLng === 'number' && Number.isFinite(initialLng) ? String(initialLng) : ''
  );
  const [showRawCoords, setShowRawCoords] = useState(false);

  const [transportNote, setTransportNote] = useState(item?.transportNote || '');
  const [notes, setNotes] = useState(item?.notes || '');
  const [bookingCode, setBookingCode] = useState(item?.bookingCode || '');
  const [cost, setCost] = useState<string>(
    typeof item?.cost === 'number' && Number.isFinite(item.cost) ? String(item.cost) : ''
  );
  const [costPaid, setCostPaid] = useState(item?.costPaid || false);
  const [memoryPhotos, setMemoryPhotos] = useState<string[]>(item?.memoryPhotos || []);
  const [memoryMood, setMemoryMood] = useState<string>(item?.memoryMood || '✨');
  const [googlePhotosUrl, setGooglePhotosUrl] = useState<string>(item?.googlePhotosUrl || '');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const initialPhotosRef = useRef<string[]>(item?.memoryPhotos || []);
  const trackedItemIdRef = useRef<string | undefined>(item?.id);
  const memoryPhotosRef = useRef<string[]>(memoryPhotos);
  const didSaveRef = useRef(false);
  const isPickingMapRef = useRef(false);

  useEffect(() => {
    memoryPhotosRef.current = memoryPhotos;
  }, [memoryPhotos]);

  const parsedLat = useMemo(() => {
    const trimmed = latText.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= -90 && n <= 90 ? n : undefined;
  }, [latText]);

  const parsedLng = useMemo(() => {
    const trimmed = lngText.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= -180 && n <= 180 ? n : undefined;
  }, [lngText]);

  const hasValidCoords = isValidCoordinate(parsedLat, parsedLng);

  // Search OSM & Google Maps Link Resolver
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ name: string; address: string; lat: number; lng: number }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [mapsLinkFeedback, setMapsLinkFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (pickedCoords && isValidCoordinate(pickedCoords.lat, pickedCoords.lng)) {
      setLatText(String(Number(pickedCoords.lat.toFixed(6))));
      setLngText(String(Number(pickedCoords.lng.toFixed(6))));
      setLocationExpanded(true);
    }
  }, [pickedCoords]);

  useEffect(() => {
    if (item) {
      // Only update initialPhotosRef when switching to a genuinely different persisted item,
      // NOT when remounting with an unsaved draft returned from Map Pick Mode.
      if (trackedItemIdRef.current !== item.id) {
        trackedItemIdRef.current = item.id;
        initialPhotosRef.current = item.memoryPhotos || [];
      }
      setTitle(item.title || '');
      setCategory(item.category || 'spot');
      setStartTime(item.startTime ?? '');
      setEndTime(item.endTime || '');
      setShowEndTimeInput(Boolean(item.endTime));
      setLocationName(item.locationName || '');
      setAddress(item.address || '');
      const nextLat = pickedCoords ? pickedCoords.lat : item.lat;
      const nextLng = pickedCoords ? pickedCoords.lng : item.lng;
      setLatText(typeof nextLat === 'number' && Number.isFinite(nextLat) ? String(nextLat) : '');
      setLngText(typeof nextLng === 'number' && Number.isFinite(nextLng) ? String(nextLng) : '');
      setTransportNote(item.transportNote || '');
      setNotes(item.notes || '');
      setBookingCode(item.bookingCode || '');
      setCost(typeof item.cost === 'number' && Number.isFinite(item.cost) ? String(item.cost) : '');
      setCostPaid(item.costPaid || false);
      setMemoryPhotos(item.memoryPhotos || []);
      setMemoryMood(item.memoryMood || '✨');
      setGooglePhotosUrl(item.googlePhotosUrl || '');
    }
  }, [item, defaultStartTime]);

  const handleClose = () => {
    if (!didSaveRef.current && !isPickingMapRef.current) {
      memoryPhotosRef.current.forEach((ref) => {
        if (isMediaRef(ref) && !initialPhotosRef.current.includes(ref)) {
          const mid = extractMediaId(ref);
          if (mid) idbDeleteMedia(mid).catch(() => {});
        }
      });
    }
    onClose();
  };

  // Preserve full unsaved draft when temporarily hiding modal to pick coordinates on map
  const handleTriggerMapPick = () => {
    if (!onStartMapPick) return;
    isPickingMapRef.current = true;
    const parsedCostNum = cost.trim() !== '' ? Number(cost) : undefined;
    const draft: Partial<ItineraryItem> = {
      id: item?.id,
      title,
      category,
      startTime,
      endTime: showEndTimeInput && endTime ? endTime : undefined,
      locationName: locationName || undefined,
      address: address || undefined,
      lat: parsedLat,
      lng: parsedLng,
      transportNote: transportNote || undefined,
      notes: notes || undefined,
      bookingCode: bookingCode || undefined,
      cost: typeof parsedCostNum === 'number' && Number.isFinite(parsedCostNum) && parsedCostNum >= 0 ? parsedCostNum : undefined,
      costPaid,
      memoryPhotos: memoryPhotos.length > 0 ? memoryPhotos : undefined,
      memoryMood,
      googlePhotosUrl: googlePhotosUrl || undefined,
      completed: item?.completed,
    };
    onStartMapPick(draft);
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

  const handleImportGoogleMapsUrl = async (rawUrl: string): Promise<boolean> => {
    const trimmed = (rawUrl || '').trim();
    if (!trimmed) return false;
    setIsSearching(true);
    setMapsLinkFeedback(null);
    setLocationExpanded(true);
    try {
      const { place, error } = await resolveGoogleMapsLink(trimmed);
      if (error || !place) {
        setMapsLinkFeedback({ type: 'err', text: error || '無法解析此 Google Maps 連結' });
        return false;
      }
      if (place.name) {
        setLocationName(place.name);
        setTitle((prev) => (!prev.trim() || looksLikeGoogleMapsUrl(prev) ? place.name! : prev));
      }
      if (isValidCoordinate(place.lat, place.lng)) {
        setLatText(String(Number(place.lat!.toFixed(6))));
        setLngText(String(Number(place.lng!.toFixed(6))));
      }
      setSearchResults([]);
      setSearchQuery('');
      setMapsLinkFeedback({
        type: 'ok',
        text: place.name
          ? `已從 Google Maps 帶入「${place.name}」與座標！`
          : '已從 Google Maps 帶入精準座標！',
      });
      return true;
    } finally {
      setIsSearching(false);
    }
  };

  const handlePasteMapsFromClipboard = async () => {
    setMapsLinkFeedback(null);
    try {
      if (navigator.clipboard?.readText) {
        const clipText = (await navigator.clipboard.readText()).trim();
        if (clipText) {
          setSearchQuery(clipText);
          if (looksLikeGoogleMapsUrl(clipText) || /^-?\d{1,2}\.\d{3,}\s*[,，\s]\s*-?\d{1,3}\.\d{3,}$/.test(clipText)) {
            await handleImportGoogleMapsUrl(clipText);
            return;
          }
          await handleSearchOSM(clipText);
          return;
        }
      }
      setMapsLinkFeedback({
        type: 'err',
        text: '請直接在上方輸入框貼上 Google Maps 分享連結。',
      });
    } catch {
      setMapsLinkFeedback({
        type: 'err',
        text: '瀏覽器未授權自動讀取剪貼簿，請直接長按貼上至上方搜尋欄。',
      });
    }
  };

  const handleSearchOSM = async (queryText?: string) => {
    const q = (queryText ?? searchQuery).trim();
    if (!q) return;
    if (looksLikeGoogleMapsUrl(q) || /^-?\d{1,2}\.\d{3,}\s*[,，\s]\s*-?\d{1,3}\.\d{3,}$/.test(q)) {
      await handleImportGoogleMapsUrl(q);
      return;
    }
    setIsSearching(true);
    setMapsLinkFeedback(null);
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
    setLatText(String(Number(res.lat.toFixed(6))));
    setLngText(String(Number(res.lng.toFixed(6))));
    setSearchResults([]);
    setSearchQuery('');
  };

  // Fixed midnight `00:xx` falsy-zero bug (uses Number.isNaN instead of `|| 9`)
  const adjustStartTime = (minutesToAdd: number) => {
    const [hStr, mStr] = (startTime || '09:00').split(':');
    const parsedH = parseInt(hStr, 10);
    const parsedM = parseInt(mStr, 10);
    const baseH = Number.isNaN(parsedH) ? 9 : parsedH;
    const baseM = Number.isNaN(parsedM) ? 0 : parsedM;
    let total = baseH * 60 + baseM + minutesToAdd;
    total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
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
      lang
    );
  }, [item?.id, title, startTime, endTime, showEndTimeInput, othersInDay, lang]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !title.trim()) return;

    const rawCost = cost.trim() !== '' ? Number(cost) : undefined;
    const validCost =
      typeof rawCost === 'number' && Number.isFinite(rawCost) && rawCost >= 0 ? rawCost : undefined;

    const finalLat = hasValidCoords ? parsedLat : undefined;
    const finalLng = hasValidCoords ? parsedLng : undefined;

    didSaveRef.current = true;
    onSave(
      {
        title: title.trim(),
        category,
        startTime: startTime.trim(),
        endTime: startTime.trim() && showEndTimeInput && endTime ? endTime : undefined,
        locationName: locationName.trim() || undefined,
        address: address.trim() || undefined,
        lat: finalLat,
        lng: finalLng,
        transportNote: transportNote.trim() || undefined,
        notes: notes.trim() || undefined,
        bookingCode: bookingCode.trim() || undefined,
        cost: validCost,
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

  return (
    <IosModalSheet
      onClose={handleClose}
      maxWidthClass="sm:max-w-xl"
      variant="grouped"
      ariaLabel={item?.id ? '編輯景點' : `新增第 ${dayNumber} 天行程`}
    >
      <IosNavBar
        title={item?.id ? '編輯行程景點' : `新增第 ${dayNumber} 天`}
        subtitle={`自動排於第 ${insertionPreview.targetIndex + 1} 站`}
        leftLabel="取消"
        onLeftClick={handleClose}
        rightLabel={item?.id ? '儲存' : '加入'}
        rightType="submit"
        rightFormId="item-edit-form"
        rightDisabled={!canEdit || !title.trim() || isUploadingPhoto}
      />

      <form
        id="item-edit-form"
        onSubmit={handleSubmit}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 sm:p-5 space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
      >
        {/* Group 1: Core Info */}
        <IosInsetGroup header="基本資訊">
          {/* Spot Name Row — left-aligned on mobile for comfortable iOS cursor placement */}
          <div className="px-4 py-2.5 space-y-1.5 sm:space-y-0 sm:min-h-[50px] sm:flex sm:items-center sm:justify-between sm:gap-2">
            <label className="text-[11px] sm:text-xs font-semibold text-slate-500 sm:text-slate-800 dark:text-slate-400 sm:dark:text-slate-200 shrink-0 sm:w-20 block">
              景點名稱<span className="text-rose-500 ml-0.5">*</span>
            </label>
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onPaste={(e) => {
                  const pasted = e.clipboardData?.getData('text') || '';
                  if (looksLikeGoogleMapsUrl(pasted)) {
                    e.preventDefault();
                    void handleImportGoogleMapsUrl(pasted);
                  }
                }}
                placeholder="輸入景點名稱，或直接貼上 Google Maps 連結..."
                className="min-w-0 flex-1 bg-transparent text-left sm:text-right text-[16px] sm:text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
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

          <IosDisclosureRow
            icon={<Clock className={`w-4 h-4 ${timeWarnings.length > 0 ? 'text-amber-600' : 'text-teal-700 dark:text-teal-400'}`} />}
            label="安排時間"
            subtitle={timeWarnings.length > 0 ? timeWarnings[0] : undefined}
            value={
              <span className="font-mono tabular-nums">
                {startTime ? (
                  <>
                    {startTime}
                    {showEndTimeInput && endTime ? ` – ${endTime}` : ''}
                  </>
                ) : (
                  '未定時間'
                )}
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

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-[11px]">
                {[
                  { label: '+30分', onClick: () => adjustStartTime(30) },
                  { label: '+1小時', onClick: () => adjustStartTime(60) },
                  { label: '09:00', onClick: () => setStartTime('09:00') },
                  { label: '12:00', onClick: () => setStartTime('12:00') },
                  { label: '15:00', onClick: () => setStartTime('15:00') },
                  { label: '18:00', onClick: () => setStartTime('18:00') },
                  {
                    label: '未定',
                    onClick: () => {
                      setStartTime('');
                      setEndTime('');
                      setShowEndTimeInput(false);
                    },
                  },
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
                : hasValidCoords
                  ? `${parsedLat!.toFixed(3)}, ${parsedLng!.toFixed(3)}`
                  : '選填'
            }
            expanded={locationExpanded}
            onToggle={() => setLocationExpanded((v) => !v)}
          >
            <div className="p-3.5 space-y-3">
              <div className="relative space-y-2">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onPaste={(e) => {
                      const pasted = e.clipboardData?.getData('text') || '';
                      if (looksLikeGoogleMapsUrl(pasted)) {
                        e.preventDefault();
                        setSearchQuery(pasted);
                        void handleImportGoogleMapsUrl(pasted);
                      }
                    }}
                    placeholder="搜尋地名，或貼上 Google Maps 連結..."
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
                      onClick={handleTriggerMapPick}
                      className="min-h-[40px] px-3 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Map className="w-3.5 h-3.5" />
                      <span>選點</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handlePasteMapsFromClipboard}
                    disabled={isSearching}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/70 border border-teal-200/80 dark:border-teal-800/70 text-teal-800 dark:text-teal-300 text-[11px] font-bold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    <Link2 className="w-3.5 h-3.5 shrink-0" />
                    <span>一鍵貼上 Google Maps 連結</span>
                  </button>
                  <span className="text-[10px] text-slate-400">支援 maps.app.goo.gl、完整網址或座標</span>
                </div>

                {mapsLinkFeedback && (
                  <div
                    className={`px-3 py-2 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 ${
                      mapsLinkFeedback.type === 'ok'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
                        : 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    {mapsLinkFeedback.type === 'ok' ? (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{mapsLinkFeedback.text}</span>
                  </div>
                )}

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
                <div className="px-3.5 py-2 space-y-1 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
                  <label className="text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0 block">
                    地標名稱
                  </label>
                  <input
                    type="text"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="例如：兼六園桂坂口"
                    className="w-full sm:flex-1 bg-transparent text-left sm:text-right text-[16px] sm:text-xs text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div className="px-3.5 py-2 space-y-1 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
                  <label className="text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0 block">
                    詳細地址
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="選填"
                    className="w-full sm:flex-1 bg-transparent text-left sm:text-right text-[16px] sm:text-xs text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <div className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {hasValidCoords ? (
                    <span className="text-teal-700 dark:text-teal-400 font-semibold inline-flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      {parsedLat!.toFixed(4)}, {parsedLng!.toFixed(4)}
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
                    type="text"
                    inputMode="decimal"
                    value={latText}
                    onChange={(e) => setLatText(e.target.value)}
                    placeholder="緯度 (-90 ~ 90)"
                    className="w-full min-h-[40px] px-2.5 bg-white dark:bg-slate-900 rounded-xl border border-[#E5E2DC] dark:border-slate-700 font-mono text-[16px] sm:text-xs outline-none focus:border-teal-600"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={lngText}
                    onChange={(e) => setLngText(e.target.value)}
                    placeholder="經度 (-180 ~ 180)"
                    className="w-full min-h-[40px] px-2.5 bg-white dark:bg-slate-900 rounded-xl border border-[#E5E2DC] dark:border-slate-700 font-mono text-[16px] sm:text-xs outline-none focus:border-teal-600"
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

          <div className="px-4 py-2.5 min-h-[48px] flex items-center justify-between gap-3">
            <label className="text-sm sm:text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 shrink-0">
              <DollarSign className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>預估花費 ({currency})</span>
            </label>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0"
              className="min-w-0 flex-1 bg-transparent text-right text-[16px] sm:text-xs font-mono tabular-nums font-bold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
            />
          </div>

          <IosToggleRow
            label="費用已預先付款"
            checked={costPaid}
            onChange={setCostPaid}
          />

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
                  type="text"
                  inputMode="url"
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
