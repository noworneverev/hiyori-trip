import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { Trip, TripMemoryItem, DayPlan } from '../../types/itinerary';
import { PRESET_TRIPS } from '../../data/presetTrips';
import { generateAiTrip, universalParseItinerary } from '../../utils/aiClient';
import { HiyoriLogo } from '../UI/HiyoriLogo';
import { MediaImage } from '../UI/MediaImage';
import { resolveDestinationTimezone } from '../../utils/timezone';
import { getTodayLocal, addDaysLocal, formatMonthDaySlash } from '../../utils/date';
import { processPhotoWithExif, ProcessedBatchPhoto } from '../../utils/exif';
import { searchLocationOSM } from '../../utils/geo';
import { connectGoogleDrive, getDriveAccessToken, hasDriveAccessToken } from '../../utils/firebase';
import { DriveAuthExpiredError, uploadOriginalPhotoToDrive } from '../../utils/googleDrive';
import { sanitizeExternalUrl } from '../../utils/url';
import { extractMediaId, isMediaRef } from '../../utils/image';
import { idbDeleteMedia } from '../../utils/indexedDb';
import {
  X,
  Calendar,
  MapPin,
  Sparkles,
  Loader2,
  ClipboardPaste,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  User,
  ExternalLink,
  Camera,
  Search,
  Check,
  Navigation,
  HardDrive,
} from 'lucide-react';

interface TripEditModalProps {
  trip?: Trip | null;
  initialMode?: 'planner' | 'memory';
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

export const TripEditModal: React.FC<TripEditModalProps> = ({
  trip,
  initialMode = 'planner',
  onSave,
  onClose,
}) => {
  useBodyScrollLock(true);
  const isEditing = Boolean(trip);
  const today = getTodayLocal();
  const defaultEnd = addDaysLocal(today, 4);

  // Stable draft ID so media:// IDs stored during creation belong cleanly to the new trip ID
  const [draftTripId] = useState(() => trip?.id || `trip-${Date.now()}`);
  const [tripMode, setTripMode] = useState<'planner' | 'memory'>(
    trip?.tripMode || (!isEditing ? initialMode : 'planner')
  );

  // 1. Core Minimal Fields (Apple / Notion Single-Page)
  const [title, setTitle] = useState(trip?.title || '');
  const [destination, setDestination] = useState(trip?.destination || '');
  const [destinationLat, setDestinationLat] = useState<number | undefined>(trip?.destinationLat);
  const [destinationLng, setDestinationLng] = useState<number | undefined>(trip?.destinationLng);
  const [startDate, setStartDate] = useState(trip?.startDate || today);
  const [endDate, setEndDate] = useState(trip?.endDate || defaultEnd);
  const [hasUserEditedDates, setHasUserEditedDates] = useState(Boolean(trip));
  const [isPhotoMemoryOnly, setIsPhotoMemoryOnly] = useState(trip?.tripMode === 'memory');
  const [isSoloTrip, setIsSoloTrip] = useState<boolean>(trip?.isSoloTrip ?? false);
  const [currency, setCurrency] = useState(trip?.currency || 'JPY');
  const [coverGradient, setCoverGradient] = useState(trip?.coverGradient || GRADIENTS[0].class);
  const [googlePhotosAlbumUrl, setGooglePhotosAlbumUrl] = useState(trip?.googlePhotosAlbumUrl || '');

  // Memory-Mode Batch Photo + EXIF State
  const memoryFileInputRef = useRef<HTMLInputElement>(null);
  const [batchPhotos, setBatchPhotos] = useState<ProcessedBatchPhoto[]>([]);
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false);
  const [photoProgress, setPhotoProgress] = useState<{ done: number; total: number } | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isDraggingPhotos, setIsDraggingPhotos] = useState(false);
  const [driveConnected, setDriveConnected] = useState<boolean>(() => hasDriveAccessToken());
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [driveUploadProgress, setDriveUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const batchPhotosRef = useRef<ProcessedBatchPhoto[]>([]);
  const didSaveRef = useRef(false);

  useEffect(() => {
    batchPhotosRef.current = batchPhotos;
  }, [batchPhotos]);

  useEffect(() => {
    const syncDrive = () => setDriveConnected(hasDriveAccessToken());
    window.addEventListener('hiyori_drive_auth_changed', syncDrive);
    return () => window.removeEventListener('hiyori_drive_auth_changed', syncDrive);
  }, []);

  const handleCloseAndCleanup = () => {
    if (!didSaveRef.current && batchPhotosRef.current.length > 0) {
      batchPhotosRef.current.forEach((p) => {
        if (isMediaRef(p.mediaRef)) {
          const mid = extractMediaId(p.mediaRef);
          if (mid) idbDeleteMedia(mid).catch(() => {});
        }
      });
    }
    onClose();
  };

  // Free OpenStreetMap Nominatim Geocoding fallback for Memory Mode
  const [isSearchingGeo, setIsSearchingGeo] = useState(false);
  const [geoResults, setGeoResults] = useState<Array<{ name: string; lat: number; lng: number; address: string }>>([]);
  const [geoSearchDone, setGeoSearchDone] = useState(false);

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

  // Auto-detect currency & reset geo search hint when destination changes
  const handleDestinationChange = (val: string) => {
    setDestination(val);
    setGeoSearchDone(false);
    const info = resolveDestinationTimezone(val);
    if (info.currencyCode && CURRENCIES.some((c) => c.value === info.currencyCode)) {
      setCurrency(info.currencyCode);
    }
  };

  // Summary of EXIF-extracted GPS & date range from uploaded photos
  const exifSummary = useMemo(() => {
    const gpsPhotos = batchPhotos.filter((p) => p.hasGps && typeof p.lat === 'number' && typeof p.lng === 'number');
    const exifDatedPhotos = batchPhotos.filter((p) => p.hasExifDate);
    const allDates = batchPhotos.map((p) => p.takenDate).filter(Boolean).sort();
    return {
      gpsCount: gpsPhotos.length,
      exifDateCount: exifDatedPhotos.length,
      minDate: allDates[0],
      maxDate: allDates[allDates.length - 1],
      centroidLat:
        gpsPhotos.length > 0
          ? Math.round((gpsPhotos.reduce((s, p) => s + (p.lat || 0), 0) / gpsPhotos.length) * 1000000) / 1000000
          : undefined,
      centroidLng:
        gpsPhotos.length > 0
          ? Math.round((gpsPhotos.reduce((s, p) => s + (p.lng || 0), 0) / gpsPhotos.length) * 1000000) / 1000000
          : undefined,
    };
  }, [batchPhotos]);

  const handleBatchPhotoFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(f.name));
    if (files.length === 0) return;

    const remaining = Math.max(0, 24 - batchPhotos.length);
    if (remaining <= 0) {
      setPhotoError('單次建立最多可選 24 張照片，建立後仍可在相簿內繼續新增更多照片。');
      return;
    }

    const targets = files.slice(0, remaining);
    if (files.length > remaining) {
      setPhotoError(`單次建立上限 24 張，已自動為您匯入前 ${remaining} 張，其餘可於相簿中補傳。`);
    } else {
      setPhotoError(null);
    }

    setIsProcessingPhotos(true);
    setPhotoProgress({ done: 0, total: targets.length });

    const processed: ProcessedBatchPhoto[] = [];
    let failedCount = 0;

    for (let i = 0; i < targets.length; i++) {
      try {
        const res = await processPhotoWithExif(targets[i], draftTripId);
        processed.push(res);
      } catch (err) {
        console.warn('Batch photo processing skipped file:', targets[i].name, err);
        failedCount++;
      }
      setPhotoProgress({ done: i + 1, total: targets.length });
    }

    if (failedCount > 0 && processed.length === 0) {
      setPhotoError('選取的照片無法在目前瀏覽器解碼，建議轉為 JPG / PNG 後重試。');
    } else if (failedCount > 0) {
      setPhotoError(`已匯入 ${processed.length} 張相片，另有 ${failedCount} 張格式不支援已略過。`);
    }

    if (processed.length > 0) {
      const nextPhotos = [...batchPhotos, ...processed];
      setBatchPhotos(nextPhotos);

      // Auto-populate date range from EXIF/photo dates if user hasn't manually overridden dates
      if (!hasUserEditedDates) {
        const sortedDates = nextPhotos.map((p) => p.takenDate).filter(Boolean).sort();
        if (sortedDates.length > 0) {
          setStartDate(sortedDates[0]);
          setEndDate(sortedDates[sortedDates.length - 1]);
        }
      }

      // Auto-populate destination coordinates from EXIF GPS if not already picked
      if (destinationLat === undefined || destinationLng === undefined) {
        const firstGps = nextPhotos.find((p) => p.hasGps && typeof p.lat === 'number' && typeof p.lng === 'number');
        if (firstGps) {
          setDestinationLat(firstGps.lat);
          setDestinationLng(firstGps.lng);
        }
      }
    }

    setIsProcessingPhotos(false);
    setPhotoProgress(null);
    if (memoryFileInputRef.current) memoryFileInputRef.current.value = '';
  };

  const handleSearchDestinationGeo = async () => {
    const q = destination.trim() || title.trim();
    if (!q) return;
    setIsSearchingGeo(true);
    setGeoSearchDone(false);
    try {
      const results = await searchLocationOSM(q);
      setGeoResults(results);
      setGeoSearchDone(true);
      if (results.length === 1) {
        setDestinationLat(results[0].lat);
        setDestinationLng(results[0].lng);
        if (!destination.trim()) setDestination(results[0].name);
      }
    } finally {
      setIsSearchingGeo(false);
    }
  };

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseAndCleanup();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Submit standard minimal trip or memory-archive trip
  const handleMinimalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (driveUploadProgress) return;
    const isMemoryMode = tripMode === 'memory';
    const finalDest = destination.trim() || (isMemoryMode ? '旅行足跡' : '自由行');
    const yearPrefix = startDate ? startDate.slice(0, 4) : '';
    const finalTitle =
      title.trim() ||
      (destination.trim()
        ? `${yearPrefix ? yearPrefix + ' ' : ''}${destination.trim()}回憶`
        : isMemoryMode
        ? `${yearPrefix || ''} 過往旅行回憶`.trim()
        : '我的全新旅程');

    const resolvedLat = destinationLat ?? exifSummary.centroidLat;
    const resolvedLng = destinationLng ?? exifSummary.centroidLng;

    if (isEditing && trip) {
      const safeAlbumUrl = sanitizeExternalUrl(googlePhotosAlbumUrl) || undefined;
      didSaveRef.current = true;
      onSave({
        ...trip,
        title: finalTitle,
        destination: finalDest,
        destinationLat: resolvedLat,
        destinationLng: resolvedLng,
        tripMode: isMemoryMode ? 'memory' : 'planner',
        startDate,
        endDate: isPhotoMemoryOnly && !isMemoryMode ? startDate : endDate,
        currency,
        coverGradient,
        isSoloTrip,
        isSplitEnabled: isSoloTrip ? false : trip.isSplitEnabled,
        googlePhotosAlbumUrl: safeAlbumUrl,
        updatedAt: Date.now(),
      });
      onClose();
      return;
    }

    if (isMemoryMode) {
      // Group uploaded photos cleanly into chronological days (preserving exact photo dates)
      const uniqueDates = Array.from(
        new Set([
          ...batchPhotos.map((p) => p.takenDate).filter(Boolean),
        ])
      ).sort();

      const effectiveStart = uniqueDates[0] || startDate || today;
      const effectiveEnd = uniqueDates[uniqueDates.length - 1] || endDate || effectiveStart;

      const dayList: DayPlan[] =
        uniqueDates.length > 0
          ? uniqueDates.slice(0, 60).map((dStr, idx) => ({
              id: `day-mem-${idx + 1}-${Date.now()}`,
              dayNumber: idx + 1,
              date: dStr,
              theme: `${formatMonthDaySlash(dStr)} 旅行足跡`,
              items: [],
            }))
          : [
              {
                id: `day-mem-1-${Date.now()}`,
                dayNumber: 1,
                date: effectiveStart,
                theme: '回憶相簿',
                items: [],
              },
            ];

      const dateToDayNum = new Map(dayList.map((d) => [d.date, d.dayNumber]));
      const now = Date.now();
      const driveToken = getDriveAccessToken();
      let resolvedTripFolderId: string | undefined;
      const driveResults = new Map<
        string,
        { driveFileId: string; driveFolderId: string; originalBytes: number; originalMimeType: string }
      >();

      const rawTargets = batchPhotos.filter((p) => Boolean(p.rawFile));
      if (driveToken && rawTargets.length > 0) {
        setDriveUploadProgress({ done: 0, total: rawTargets.length });
        for (let i = 0; i < rawTargets.length; i++) {
          const p = rawTargets[i];
          try {
            if (p.rawFile) {
              const uploaded = await uploadOriginalPhotoToDrive(p.rawFile, {
                token: driveToken,
                tripId: draftTripId,
                tripTitle: finalTitle,
                existingFolderId: resolvedTripFolderId,
                takenDate: p.takenDate || effectiveStart,
              });
              resolvedTripFolderId = uploaded.driveFolderId;
              driveResults.set(p.id, uploaded);
            }
          } catch (err) {
            console.warn('Google Drive original upload skipped:', p.fileName, err);
            if (err instanceof DriveAuthExpiredError) {
              break;
            }
          }
          setDriveUploadProgress({ done: i + 1, total: rawTargets.length });
        }
        setDriveUploadProgress(null);
      }

      const safeAlbumUrl = sanitizeExternalUrl(googlePhotosAlbumUrl) || undefined;
      const initialMemories: TripMemoryItem[] = batchPhotos.map((photo, idx) => {
        const driveInfo = driveResults.get(photo.id);
        return {
          id: `mem-${now}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
          imageUrl: photo.mediaRef,
          caption: finalTitle,
          spotTitle: finalDest,
          dayNumber: dateToDayNum.get(photo.takenDate) || 1,
          date: photo.takenDate || effectiveStart,
          location: finalDest,
          lat: photo.lat ?? resolvedLat,
          lng: photo.lng ?? resolvedLng,
          googlePhotosUrl: safeAlbumUrl,
          driveFileId: driveInfo?.driveFileId,
          driveFolderId: driveInfo?.driveFolderId || resolvedTripFolderId,
          originalBytes: driveInfo?.originalBytes ?? photo.originalBytes,
          originalWidth: photo.originalWidth,
          originalHeight: photo.originalHeight,
          originalMimeType: driveInfo?.originalMimeType ?? photo.originalMimeType,
          createdAt: now + idx * 20,
        };
      });

      const newMemoryTrip: Trip = {
        id: draftTripId,
        title: finalTitle,
        destination: finalDest,
        destinationLat: resolvedLat,
        destinationLng: resolvedLng,
        tripMode: 'memory',
        startDate: effectiveStart,
        endDate: effectiveEnd,
        currency,
        budgetTotal: 0,
        coverGradient,
        isSoloTrip: true,
        isSplitEnabled: false,
        googlePhotosAlbumUrl: safeAlbumUrl,
        driveFolderId: resolvedTripFolderId,
        notes: '',
        days: dayList,
        todos: [],
        packingList: [],
        expenses: [],
        emergencyContacts: [],
        memories: initialMemories,
        createdAt: now,
        updatedAt: now,
      };

      didSaveRef.current = true;
      onSave(newMemoryTrip);
      onClose();
      return;
    }

    // Creating standard planner trip
    const dayList = [];
    const actualDays = isPhotoMemoryOnly ? 1 : daysCount;
    for (let i = 1; i <= actualDays; i++) {
      const dayDate = addDaysLocal(startDate, i - 1);
      dayList.push({
        id: `day-${i}-${Date.now()}`,
        dayNumber: i,
        date: dayDate,
        theme: isPhotoMemoryOnly ? '回憶相簿與隨筆' : `Day ${i} 行程`,
        items: [],
      });
    }

    const newTrip: Trip = {
      id: draftTripId,
      title: finalTitle,
      destination: destination.trim() || '旅行目的地',
      tripMode: isPhotoMemoryOnly ? 'memory' : 'planner',
      destinationLat: resolvedLat,
      destinationLng: resolvedLng,
      startDate,
      endDate: isPhotoMemoryOnly ? startDate : endDate,
      currency,
      budgetTotal: 50000,
      coverGradient,
      isSoloTrip,
      isSplitEnabled: !isSoloTrip,
      googlePhotosAlbumUrl: sanitizeExternalUrl(googlePhotosAlbumUrl) || undefined,
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

    didSaveRef.current = true;
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
      const { trip: generatedTrip } = await generateAiTrip({
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

      didSaveRef.current = true;
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

      didSaveRef.current = true;
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
      endDate: addDaysLocal(startDate, Math.max(0, preset.days.length - 1)),
      isSoloTrip,
      isSplitEnabled: !isSoloTrip,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    didSaveRef.current = true;
    onSave(clonedTrip);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto overscroll-contain touch-manipulation"
      onClick={handleCloseAndCleanup}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
        }
      }}
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#111827] shadow-2xl border border-[#E5E2DC] dark:border-slate-800 text-slate-800 dark:text-slate-100 my-auto animate-in fade-in zoom-in-95 duration-150 overflow-hidden flex flex-col max-h-[92vh] overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E2DC]/60 dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-slate-800 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <HiyoriLogo className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {isEditing ? '編輯旅程' : '新增旅程'}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseAndCleanup}
            className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer"
            aria-label="關閉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
          {/* Creation Mode Switcher: Plan New Trip vs Quick Memory Archive */}
          {!isEditing && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-800">
              <button
                type="button"
                onClick={() => setTripMode('planner')}
                className={`min-h-[40px] py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  tripMode === 'planner'
                    ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>規劃新行程</span>
              </button>
              <button
                type="button"
                onClick={() => setTripMode('memory')}
                className={`min-h-[40px] py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  tripMode === 'memory'
                    ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Camera className="w-3.5 h-3.5 shrink-0" />
                <span>補登過往回憶</span>
              </button>
            </div>
          )}

          {/* Main Minimal Form */}
          <form id="minimal-trip-form" onSubmit={handleMinimalSubmit} className="space-y-4">
            {/* Batch Photo Uploader (Memory Mode Only when creating) */}
            {!isEditing && tripMode === 'memory' && (
              <div className="space-y-3">
                <input
                  ref={memoryFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => e.target.files && handleBatchPhotoFiles(e.target.files)}
                  className="hidden"
                />

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingPhotos(true);
                  }}
                  onDragLeave={() => setIsDraggingPhotos(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingPhotos(false);
                    if (e.dataTransfer.files?.length) {
                      handleBatchPhotoFiles(e.dataTransfer.files);
                    }
                  }}
                  onClick={() => !isProcessingPhotos && memoryFileInputRef.current?.click()}
                  className={`rounded-2xl border-2 border-dashed p-5 text-center transition cursor-pointer ${
                    isDraggingPhotos
                      ? 'border-teal-600 bg-teal-50/70 dark:bg-teal-950/40'
                      : 'border-[#E5E2DC] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-900/50 hover:border-teal-600/60'
                  }`}
                >
                  {isProcessingPhotos ? (
                    <div className="flex flex-col items-center gap-1.5 py-2">
                      <Loader2 className="w-6 h-6 text-teal-700 dark:text-teal-400 animate-spin" />
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100 font-mono tabular-nums">
                        正在讀取 EXIF 日期與 GPS ({photoProgress?.done || 0}/{photoProgress?.total || 0})
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center">
                        <Camera className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        {batchPhotos.length > 0 ? '點擊或拖曳繼續加入照片' : '批次選取過去的旅遊照片'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        自動讀取拍攝日期與 GPS 座標點亮足跡地圖 · 單次最多 24 張
                      </p>
                    </div>
                  )}
                </div>

                {photoError && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium px-1">
                    {photoError}
                  </p>
                )}

                {/* Clean unboxed Google Drive Original Photo Backup status */}
                <div className="flex items-center justify-between gap-2 px-1 py-0.5 text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 min-w-0">
                    <HardDrive className={`w-3.5 h-3.5 shrink-0 ${driveConnected ? 'text-teal-700 dark:text-teal-400' : 'text-slate-400'}`} />
                    <span className="truncate">
                      {driveConnected
                        ? 'Google Drive 已連線 · 同步保留未壓縮原圖至您的雲端空間'
                        : '僅本機／雲端 1440px 高清縮圖 · 連線 Drive 可同步保留原圖'}
                    </span>
                  </div>
                  {!driveConnected && (
                    <button
                      type="button"
                      disabled={isConnectingDrive}
                      onClick={async () => {
                        setIsConnectingDrive(true);
                        setPhotoError(null);
                        try {
                          const token = await connectGoogleDrive();
                          setDriveConnected(Boolean(token) || hasDriveAccessToken());
                          if (!token) {
                            setPhotoError('Google Drive 授權已取消或彈窗被封鎖，照片將先保留 1440px 高清縮圖。');
                          }
                        } finally {
                          setIsConnectingDrive(false);
                        }
                      }}
                      className="text-teal-700 dark:text-teal-400 font-bold hover:underline shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      {isConnectingDrive ? '授權中...' : '連線 Drive 原圖'}
                    </button>
                  )}
                </div>

                {batchPhotos.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums px-0.5">
                      <span>
                        已匯入 {batchPhotos.length} 張 ·{' '}
                        {exifSummary.gpsCount > 0 ? `${exifSummary.gpsCount} 張含 GPS` : '尚無內嵌 GPS'}
                        {exifSummary.minDate && ` · ${exifSummary.minDate.replace(/-/g, '/')}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          batchPhotos.forEach((p) => {
                            if (isMediaRef(p.mediaRef)) {
                              const mid = extractMediaId(p.mediaRef);
                              if (mid) idbDeleteMedia(mid).catch(() => {});
                            }
                          });
                          setBatchPhotos([]);
                        }}
                        className="font-sans text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                      >
                        清空
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto pr-0.5">
                      {batchPhotos.map((p) => (
                        <div
                          key={p.id}
                          className="relative aspect-square rounded-xl overflow-hidden border border-[#E5E2DC] dark:border-slate-700 group bg-slate-100 dark:bg-slate-800"
                        >
                          <MediaImage
                            tripId={draftTripId}
                            src={p.mediaRef}
                            alt={p.fileName}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              if (isMediaRef(p.mediaRef)) {
                                const mid = extractMediaId(p.mediaRef);
                                if (mid) idbDeleteMedia(mid).catch(() => {});
                              }
                              setBatchPhotos((prev) => prev.filter((item) => item.id !== p.id));
                            }}
                            className="absolute top-1 right-1 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-rose-600 transition cursor-pointer"
                            aria-label="移除照片"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <div className="absolute inset-x-0 bottom-0 px-1.5 py-0.5 bg-gradient-to-t from-black/80 to-transparent text-[9px] text-white font-mono tabular-nums flex items-center justify-between gap-1">
                            <span className="truncate">{p.takenDate.slice(2).replace(/-/g, '/')}</span>
                            {p.hasGps && <MapPin className="w-2.5 h-2.5 text-teal-300 shrink-0" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Title (Primary Input) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-200 mb-1.5">
                {tripMode === 'memory' && !isEditing ? '旅程標題 (選填，留白將依城市與年份命名)' : '旅程名稱'}{' '}
                {tripMode === 'planner' && <span className="text-teal-600 dark:text-teal-400">*</span>}
              </label>
              <input
                type="text"
                required={tripMode === 'planner'}
                placeholder={tripMode === 'memory' ? '例如：2023 京都秋楓自由行' : '例如：2026 東京賞櫻之旅'}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-3 rounded-2xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-400 dark:placeholder:text-zinc-500 transition"
              />
            </div>

            {/* Destination + Optional Free City Geocoding */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-600 dark:text-zinc-400 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>{tripMode === 'memory' ? '旅遊城市 / 國家（點亮足跡地圖）' : '目的地 (選填)'}</span>
                </label>
                {typeof destinationLat === 'number' && typeof destinationLng === 'number' && (
                  <span className="text-[10px] font-mono tabular-nums text-teal-700 dark:text-teal-400 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    <span>
                      {destinationLat.toFixed(2)}, {destinationLng.toFixed(2)}
                    </span>
                  </span>
                )}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="例如：日本京都、冰島雷克雅維克、巴黎"
                  value={destination}
                  onChange={(e) => handleDestinationChange(e.target.value)}
                  className="flex-1 min-w-0 px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-400 dark:placeholder:text-zinc-500 transition"
                />
                {tripMode === 'memory' && (
                  <button
                    type="button"
                    disabled={isSearchingGeo || !(destination.trim() || title.trim())}
                    onClick={handleSearchDestinationGeo}
                    className="min-h-[40px] px-3 rounded-2xl border border-[#E5E2DC] dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-teal-600 text-teal-700 dark:text-teal-400 text-xs font-semibold flex items-center gap-1 shrink-0 disabled:opacity-40 transition cursor-pointer"
                    title="使用免費 OpenStreetMap 搜尋城市座標，補全沒有 GPS 的照片定位"
                  >
                    {isSearchingGeo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    <span>定位</span>
                  </button>
                )}
              </div>

              {geoSearchDone && geoResults.length > 0 && (
                <div className="rounded-xl border border-[#E5E2DC] dark:border-zinc-700 bg-white dark:bg-zinc-900 divide-y divide-[#E5E2DC]/60 dark:divide-zinc-800 max-h-32 overflow-y-auto">
                  {geoResults.map((g, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setDestinationLat(g.lat);
                        setDestinationLng(g.lng);
                        if (!destination.trim()) setDestination(g.name);
                        setGeoResults([]);
                      }}
                      className="w-full px-3 py-2 text-left text-[11px] hover:bg-teal-50 dark:hover:bg-teal-950/40 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="truncate text-slate-700 dark:text-slate-200">{g.address}</span>
                      <Navigation className="w-3 h-3 text-teal-600 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              {geoSearchDone && geoResults.length === 0 && (
                <p className="text-[11px] text-slate-400">找不到精確座標，可改用英文或主要城市名稱再試一次。</p>
              )}
            </div>

            {/* Date Selection Mode */}
            <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>{tripMode === 'memory' ? '旅遊日期（可由照片 EXIF 自動帶入）' : '旅行日期'}</span>
                </span>
                {!isPhotoMemoryOnly && tripMode === 'planner' && (
                  <span className="text-xs font-bold text-teal-600 dark:text-teal-400 font-mono">
                    共 {daysCount} 天日程
                  </span>
                )}
              </div>

              {tripMode === 'planner' && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isPhotoMemoryOnly}
                    onChange={(e) => setIsPhotoMemoryOnly(e.target.checked)}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 w-4 h-4"
                  />
                  <span className="text-xs text-slate-600 dark:text-zinc-300 flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span>簡化為回憶相簿模式（預設直接開畫廊）</span>
                  </span>
                </label>
              )}

              {(!isPhotoMemoryOnly || tripMode === 'memory') && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[11px] text-slate-400 dark:text-zinc-400 mb-1">
                      開始日期
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setHasUserEditedDates(true);
                        setStartDate(e.target.value);
                        if (e.target.value > endDate) setEndDate(e.target.value);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 dark:text-zinc-400 mb-1">
                      結束日期
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate}
                      onChange={(e) => {
                        setHasUserEditedDates(true);
                        setEndDate(e.target.value);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono tabular-nums"
                    />
                  </div>
                </div>
              )}
            </div>

            {tripMode === 'planner' && (
              <>
                {/* Solo Travel Switch (獨旅模式) */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                        isSoloTrip
                          ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400'
                          : 'bg-slate-200/60 dark:bg-zinc-700/60 text-slate-500 dark:text-zinc-400'
                      }`}
                    >
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>獨旅模式 (一人旅行)</span>
                        {isSoloTrip && (
                          <span className="text-[10px] font-semibold text-teal-700 dark:text-teal-400">
                            · 開啟
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                        隱藏分帳與旅伴設定
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
                    <span>Google 相簿整趟旅程連結 (選填)</span>
                    {sanitizeExternalUrl(googlePhotosAlbumUrl) && (
                      <a
                        href={sanitizeExternalUrl(googlePhotosAlbumUrl)!}
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
                    placeholder="https://photos.app.goo.gl/..."
                    value={googlePhotosAlbumUrl}
                    onChange={(e) => setGooglePhotosAlbumUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-400 dark:placeholder:text-zinc-500"
                  />
                </div>
              </>
            )}

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

          {/* Collapsible Advanced Section for AI / Paste / Presets (Planner mode only) */}
          {!isEditing && tripMode === 'planner' && (
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
        <div className="px-5 py-3.5 border-t border-[#E5E2DC]/60 dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-900/60 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleCloseAndCleanup}
            className="min-h-[44px] sm:min-h-[38px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            取消
          </button>
          <button
            type="submit"
            form="minimal-trip-form"
            disabled={isProcessingPhotos || Boolean(driveUploadProgress)}
            className="px-6 py-2.5 rounded-2xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-bold transition active:scale-95 cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            {driveUploadProgress ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="font-mono tabular-nums">
                  正在備份原圖 ({driveUploadProgress.done}/{driveUploadProgress.total})
                </span>
              </>
            ) : isEditing ? (
              '儲存旅程資訊'
            ) : tripMode === 'memory' ? (
              batchPhotos.length > 0 ? (
                `建立回憶相簿 (${batchPhotos.length} 張)`
              ) : (
                '建立回憶相簿'
              )
            ) : (
              '立即建立旅程'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
