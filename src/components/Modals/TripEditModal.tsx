import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Trip, TripMemoryItem, DayPlan } from '../../types/itinerary';
import { PRESET_TRIPS } from '../../data/presetTrips';
import { generateAiTrip, universalParseItinerary, checkAiAvailability, AiBackendMode } from '../../utils/aiClient';
import { MediaImage } from '../UI/MediaImage';
import { resolveDestinationTimezone } from '../../utils/timezone';
import { getTodayLocal, addDaysLocal, formatMonthDaySlash, normalizeDateKey, sortItineraryItemsByTime } from '../../utils/date';
import { processPhotoWithExif, ProcessedBatchPhoto } from '../../utils/exif';
import { searchLocationOSM } from '../../utils/geo';
import { connectGoogleDrive, getDriveAccessToken, hasDriveAccessToken } from '../../utils/firebase';
import { DriveAuthExpiredError, uploadOriginalPhotoToDrive } from '../../utils/googleDrive';
import { sanitizeExternalUrl } from '../../utils/url';
import { extractMediaId, isMediaRef } from '../../utils/image';
import { idbDeleteMedia } from '../../utils/indexedDb';
import {
  IosModalSheet,
  IosNavBar,
  IosInsetGroup,
  IosRow,
  IosDisclosureRow,
  IosCheckmarkRow,
  IosToggleRow,
} from '../UI/IosPrimitives';
import {
  X,
  Calendar,
  MapPin,
  Sparkles,
  Loader2,
  ClipboardPaste,
  Image as ImageIcon,
  User,
  ExternalLink,
  Camera,
  Search,
  Check,
  Navigation,
  HardDrive,
  Coins,
  Wallet,
  Palette,
  ChevronRight,
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

const AI_STYLES = [
  { value: 'classic', label: '經典熱門景點' },
  { value: 'foodie', label: '在地必吃美食' },
  { value: 'relax', label: '悠閒放鬆漫步' },
  { value: 'shopping', label: '潮流逛街購物' },
];

export const TripEditModal: React.FC<TripEditModalProps> = ({
  trip,
  initialMode = 'planner',
  onSave,
  onClose,
}) => {
  const isEditing = Boolean(trip);
  const today = getTodayLocal();
  const defaultEnd = addDaysLocal(today, 4);

  const [draftTripId] = useState(() => trip?.id || `trip-${Date.now()}`);
  const [tripMode, setTripMode] = useState<'planner' | 'memory'>(
    trip?.tripMode || (!isEditing ? initialMode : 'planner')
  );

  // Core Fields
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
  const [budgetTotalInput, setBudgetTotalInput] = useState<string>(
    typeof trip?.budgetTotal === 'number' && Number.isFinite(trip.budgetTotal) && trip.budgetTotal > 0
      ? String(trip.budgetTotal)
      : ''
  );
  const [coverGradient, setCoverGradient] = useState(trip?.coverGradient || GRADIENTS[0].class);
  const [googlePhotosAlbumUrl, setGooglePhotosAlbumUrl] = useState(trip?.googlePhotosAlbumUrl || '');
  const [notes, setNotes] = useState(trip?.notes || '');

  // Inline Disclosure Sections
  const [datesExpanded, setDatesExpanded] = useState(false);
  const [currencyExpanded, setCurrencyExpanded] = useState(false);
  const [themeExpanded, setThemeExpanded] = useState(false);
  const [albumExpanded, setAlbumExpanded] = useState(Boolean(trip?.googlePhotosAlbumUrl));
  const [aiStyleExpanded, setAiStyleExpanded] = useState(false);

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
    if (driveUploadProgress) return;
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

  // Free OpenStreetMap Nominatim Geocoding fallback
  const [isSearchingGeo, setIsSearchingGeo] = useState(false);
  const [geoResults, setGeoResults] = useState<Array<{ name: string; lat: number; lng: number; address: string }>>([]);
  const [geoSearchDone, setGeoSearchDone] = useState(false);

  // Folded Advanced Options (AI / Paste / Preset)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [aiMode, setAiMode] = useState<AiBackendMode>('local_only');
  const [advancedSubTab, setAdvancedSubTab] = useState<'ai' | 'paste' | 'preset'>('paste');

  useEffect(() => {
    let active = true;
    checkAiAvailability().then((mode) => {
      if (!active) return;
      setAiMode(mode);
      if (mode !== 'local_only') {
        setAdvancedSubTab('ai');
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // AI Generation State
  const [aiStyle, setAiStyle] = useState('classic');
  const [aiPreferences, setAiPreferences] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiGenError, setAiGenError] = useState<string | null>(null);

  // Paste Text State
  const [pastedText, setPastedText] = useState('');
  const [isParsingPaste, setIsParsingPaste] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);

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

  const handleDestinationChange = (val: string) => {
    setDestination(val);
    setGeoSearchDone(false);
    const info = resolveDestinationTimezone(val);
    if (info.currencyCode && CURRENCIES.some((c) => c.value === info.currencyCode)) {
      setCurrency(info.currencyCode);
    }
  };

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

      if (!hasUserEditedDates) {
        const sortedDates = nextPhotos.map((p) => p.takenDate).filter(Boolean).sort();
        if (sortedDates.length > 0) {
          setStartDate(sortedDates[0]);
          setEndDate(sortedDates[sortedDates.length - 1]);
        }
      }

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

    const safeStart = startDate || today;
    const safeEnd = !endDate || endDate < safeStart ? safeStart : endDate;

    const parsedBudgetRaw = budgetTotalInput.trim() !== '' ? Number(budgetTotalInput.replace(/,/g, '')) : undefined;
    const resolvedBudget =
      typeof parsedBudgetRaw === 'number' && Number.isFinite(parsedBudgetRaw) && parsedBudgetRaw >= 0
        ? Math.round(parsedBudgetRaw)
        : undefined;

    if (isEditing && trip) {
      const safeAlbumUrl = sanitizeExternalUrl(googlePhotosAlbumUrl) || undefined;
      const effectiveMode: 'planner' | 'memory' = isMemoryMode || isPhotoMemoryOnly ? 'memory' : 'planner';
      const targetDaysCount = effectiveMode === 'memory' ? Math.max(1, (trip.days || []).length) : calculateDays(safeStart, safeEnd);

      // Compute calendar day shift when startDate changes so expenses, bookings & memories move cleanly
      const oldStartKey = normalizeDateKey(trip.startDate);
      const newStartKey = normalizeDateKey(safeStart);
      let startDayDelta = 0;
      if (oldStartKey && newStartKey && oldStartKey !== newStartKey) {
        const dOld = new Date(`${oldStartKey}T00:00:00Z`).getTime();
        const dNew = new Date(`${newStartKey}T00:00:00Z`).getTime();
        if (Number.isFinite(dOld) && Number.isFinite(dNew)) {
          startDayDelta = Math.round((dNew - dOld) / 86400000);
        }
      }
      const shiftDateIfChanged = (dateVal?: string): string | undefined => {
        if (!dateVal || startDayDelta === 0) return dateVal;
        const key = normalizeDateKey(dateVal);
        return key ? addDaysLocal(key, startDayDelta) : dateVal;
      };

      // Keep trip.days synchronized when user updates startDate / endDate on an existing planner trip
      let syncedDays = trip.days || [];
      let mergedTruncatedDays = false;
      if (effectiveMode === 'planner') {
        const existing = [...syncedDays];
        const nextDays: DayPlan[] = [];
        for (let i = 0; i < targetDaysCount; i++) {
          const dDate = addDaysLocal(safeStart, i);
          if (existing[i]) {
            nextDays.push({
              ...existing[i],
              dayNumber: i + 1,
              date: dDate,
            });
          } else {
            nextDays.push({
              id: `day-${i + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              dayNumber: i + 1,
              date: dDate,
              theme: `Day ${i + 1} 行程`,
              items: [],
            });
          }
        }
        // When user shortens endDate, preserve spots from truncated days by merging them into the final day
        if (existing.length > targetDaysCount && nextDays.length > 0) {
          const overflowItems = existing.slice(targetDaysCount).flatMap((d) => d.items || []);
          if (overflowItems.length > 0) {
            mergedTruncatedDays = true;
            const lastIdx = nextDays.length - 1;
            nextDays[lastIdx] = {
              ...nextDays[lastIdx],
              items: sortItineraryItemsByTime([...(nextDays[lastIdx].items || []), ...overflowItems]),
            };
          }
        }
        syncedDays = nextDays;
      }

      const finalSyncedEnd =
        effectiveMode === 'planner' && syncedDays.length > 0
          ? syncedDays[syncedDays.length - 1].date
          : safeEnd;

      const clampDayNum = (n?: number) =>
        typeof n === 'number' && effectiveMode === 'planner' && syncedDays.length > 0
          ? Math.min(n, syncedDays.length)
          : n;

      const updatedExpenses =
        startDayDelta !== 0 || mergedTruncatedDays
          ? (trip.expenses || []).map((ex) => ({
              ...ex,
              date: shiftDateIfChanged(ex.date) || ex.date,
              ...(ex.dayNumber !== undefined ? { dayNumber: clampDayNum(ex.dayNumber) } : {}),
            }))
          : trip.expenses;

      const updatedBookings =
        startDayDelta !== 0 || mergedTruncatedDays
          ? (trip.bookings || []).map((b) => ({
              ...b,
              ...(b.startDate ? { startDate: shiftDateIfChanged(b.startDate) } : {}),
              ...(b.endDate ? { endDate: shiftDateIfChanged(b.endDate) } : {}),
              ...(b.dayNumber !== undefined ? { dayNumber: clampDayNum(b.dayNumber) } : {}),
            }))
          : trip.bookings;

      const updatedMemories =
        startDayDelta !== 0 || mergedTruncatedDays
          ? (trip.memories || []).map((m) => ({
              ...m,
              ...(m.date ? { date: shiftDateIfChanged(m.date) } : {}),
              ...(m.dayNumber !== undefined ? { dayNumber: clampDayNum(m.dayNumber) } : {}),
            }))
          : trip.memories;

      didSaveRef.current = true;
      onSave({
        ...trip,
        title: finalTitle,
        destination: finalDest,
        destinationLat: resolvedLat,
        destinationLng: resolvedLng,
        tripMode: effectiveMode,
        startDate: safeStart,
        endDate: finalSyncedEnd,
        days: syncedDays,
        expenses: updatedExpenses,
        bookings: updatedBookings,
        memories: updatedMemories,
        currency,
        budgetTotal: resolvedBudget ?? (budgetTotalInput.trim() === '' ? 0 : trip.budgetTotal),
        coverGradient,
        isSoloTrip,
        isSplitEnabled: isSoloTrip ? false : trip.isSplitEnabled,
        googlePhotosAlbumUrl: safeAlbumUrl,
        notes: notes.trim(),
        updatedAt: Date.now(),
      });
      onClose();
      return;
    }

    if (isMemoryMode) {
      const uniqueDates = Array.from(
        new Set([...batchPhotos.map((p) => p.takenDate).filter(Boolean)])
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
        notes: notes.trim(),
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
      budgetTotal: resolvedBudget ?? 50000,
      coverGradient,
      isSoloTrip,
      isSplitEnabled: !isSoloTrip,
      googlePhotosAlbumUrl: sanitizeExternalUrl(googlePhotosAlbumUrl) || undefined,
      notes: notes.trim(),
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

  const handleAiSubmit = async () => {
    const targetDest = destination.trim() || title.trim();
    if (!targetDest) {
      setAiGenError('請先在上方輸入旅程名稱或目的地');
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

  const handlePasteSubmit = async () => {
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

      const safeBaseStart = startDate || today;
      const parsedTrip = result.trip;
      parsedTrip.title = title.trim() || parsedTrip.title;
      parsedTrip.startDate = safeBaseStart;
      parsedTrip.days = (parsedTrip.days || []).map((d, idx) => ({
        ...d,
        dayNumber: idx + 1,
        date: addDaysLocal(safeBaseStart, idx),
      }));
      parsedTrip.endDate =
        parsedTrip.days.length > 0
          ? parsedTrip.days[parsedTrip.days.length - 1].date
          : endDate || safeBaseStart;
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

  const handleApplyPreset = (preset: Trip) => {
    const now = Date.now();
    const safeStart = startDate || today;
    const shiftedDays: DayPlan[] = (preset.days || []).map((d, dIdx) => ({
      ...d,
      id: `day-preset-${now}-${dIdx + 1}`,
      dayNumber: dIdx + 1,
      date: addDaysLocal(safeStart, dIdx),
      items: (d.items || []).map((it, iIdx) => ({
        ...it,
        id: `item-preset-${now}-${dIdx + 1}-${iIdx + 1}`,
        completed: false,
      })),
    }));
    const clonedTrip: Trip = {
      ...preset,
      id: `trip-preset-${now}`,
      title: title.trim() || preset.title,
      startDate: safeStart,
      endDate: shiftedDays.length > 0 ? shiftedDays[shiftedDays.length - 1].date : safeStart,
      days: shiftedDays,
      todos: (preset.todos || []).map((td, idx) => ({ ...td, id: `todo-preset-${now}-${idx}` })),
      packingList: (preset.packingList || []).map((pk, idx) => ({ ...pk, id: `pack-preset-${now}-${idx}` })),
      expenses: [],
      bookings: (preset.bookings || []).map((bk, idx) => ({ ...bk, id: `bk-preset-${now}-${idx}` })),
      emergencyContacts: (preset.emergencyContacts || []).map((ec, idx) => ({ ...ec, id: `em-preset-${now}-${idx}` })),
      isSoloTrip,
      isSplitEnabled: !isSoloTrip,
      createdAt: now,
      updatedAt: now,
    };
    didSaveRef.current = true;
    onSave(clonedTrip);
    onClose();
  };

  const selectedCurrencyLabel =
    CURRENCIES.find((c) => c.value === currency)?.label || currency;
  const selectedGradientObj =
    GRADIENTS.find((g) => g.class === coverGradient) || GRADIENTS[0];
  const selectedAiStyleLabel =
    AI_STYLES.find((s) => s.value === aiStyle)?.label || AI_STYLES[0].label;

  const dateSummaryText =
    isPhotoMemoryOnly && tripMode === 'planner'
      ? '相簿模式'
      : `${startDate.slice(5).replace('-', '/')} ~ ${endDate.slice(5).replace('-', '/')} · ${daysCount} 天`;

  const navRightLabel = driveUploadProgress
    ? `${driveUploadProgress.done}/${driveUploadProgress.total}`
    : isEditing
    ? '儲存'
    : tripMode === 'memory' && batchPhotos.length > 0
    ? `建立 (${batchPhotos.length})`
    : '建立';

  return (
    <IosModalSheet
      onClose={handleCloseAndCleanup}
      maxWidthClass="sm:max-w-lg"
      variant="grouped"
      disableBackdropClose={Boolean(driveUploadProgress)}
      ariaLabel={isEditing ? '編輯旅程' : '新增旅程'}
    >
      <IosNavBar
        title={isEditing ? '編輯旅程' : '新增旅程'}
        subtitle={isEditing ? trip?.title : tripMode === 'memory' ? '過往回憶相簿' : '規劃新行程'}
        leftLabel="取消"
        onLeftClick={handleCloseAndCleanup}
        leftDisabled={Boolean(driveUploadProgress)}
        rightLabel={navRightLabel}
        rightType="submit"
        rightFormId="minimal-trip-form"
        rightDisabled={isProcessingPhotos || Boolean(driveUploadProgress)}
        rightLoading={Boolean(driveUploadProgress)}
      />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 sm:p-5 space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
        {/* Creation Mode Switcher: Plan New Trip vs Quick Memory Archive */}
        {!isEditing && (
          <div className="grid grid-cols-2 p-1 rounded-xl bg-[#EFECE5] dark:bg-slate-800/90 gap-1">
            <button
              type="button"
              onClick={() => setTripMode('planner')}
              className={`min-h-[38px] sm:min-h-[34px] px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                tripMode === 'planner'
                  ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
              <span>規劃新行程</span>
            </button>
            <button
              type="button"
              onClick={() => setTripMode('memory')}
              className={`min-h-[38px] sm:min-h-[34px] px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                tripMode === 'memory'
                  ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
              <span>補登過往回憶</span>
            </button>
          </div>
        )}

        <form id="minimal-trip-form" onSubmit={handleMinimalSubmit} className="space-y-5">
          {/* Batch Photo Uploader (Memory Mode Only when creating) */}
          {!isEditing && tripMode === 'memory' && (
            <IosInsetGroup
              header="旅遊相片匯入"
              footer="自動讀取拍攝日期與 GPS 座標點亮足跡地圖，單次最多 24 張。"
            >
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
                className={`p-4 text-center transition cursor-pointer ${
                  isDraggingPhotos
                    ? 'bg-teal-50/70 dark:bg-teal-950/40'
                    : 'hover:bg-[#FAF9F6] dark:hover:bg-slate-800/40'
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
                  <div className="flex items-center gap-3 text-left">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center shrink-0">
                      <Camera className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm sm:text-xs font-bold text-slate-900 dark:text-white">
                        {batchPhotos.length > 0 ? '點擊或拖曳繼續加入照片' : '批次選取旅遊照片'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        已匯入 {batchPhotos.length} 張 · 支援自動萃取拍攝日與地點
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </div>
                )}
              </div>

              {photoError && (
                <div className="px-4 py-2 text-[11px] text-amber-700 dark:text-amber-400 font-medium bg-amber-50/60 dark:bg-amber-950/20">
                  {photoError}
                </div>
              )}

              <IosRow
                icon={
                  <HardDrive
                    className={`w-4 h-4 ${driveConnected ? 'text-teal-700 dark:text-teal-400' : 'text-slate-400'}`}
                  />
                }
                label={driveConnected ? 'Google Drive 原圖備份已連線' : '未連線 Google Drive 原圖'}
                subtitle={
                  driveConnected
                    ? '建立時將同步保留未壓縮原圖至雲端空間'
                    : '目前使用 1440px 高清縮圖，連線後可保留原圖'
                }
                trailing={
                  !driveConnected ? (
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
                      className="min-h-[36px] px-3 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      {isConnectingDrive ? '授權中...' : '連線'}
                    </button>
                  ) : (
                    <Check className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                  )
                }
              />

              {batchPhotos.length > 0 && (
                <div className="p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    <span>
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
                      className="font-sans text-rose-600 dark:text-rose-400 font-semibold hover:underline cursor-pointer"
                    >
                      清空全部
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto">
                    {batchPhotos.map((p) => (
                      <div
                        key={p.id}
                        className="relative aspect-square rounded-xl overflow-hidden border border-[#E5E2DC] dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
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
                          className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-rose-600 transition cursor-pointer"
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
            </IosInsetGroup>
          )}

          {/* Core Info Inset Group */}
          <IosInsetGroup header="基本資訊">
            {/* Title Row */}
            <div className="px-4 py-2.5 min-h-[50px] flex items-center justify-between gap-3">
              <label className="text-sm sm:text-xs font-semibold text-slate-800 dark:text-slate-200 shrink-0 w-24">
                旅程名稱{tripMode === 'planner' && <span className="text-rose-500 ml-0.5">*</span>}
              </label>
              <input
                type="text"
                required={tripMode === 'planner'}
                placeholder={tripMode === 'memory' ? '2023 京都秋楓自由行（選填）' : '例如：2026 東京賞櫻之旅'}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-right text-[16px] sm:text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
              />
            </div>

            {/* Destination Row */}
            <div className="px-4 py-2.5 min-h-[50px] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm sm:text-xs font-semibold text-slate-800 dark:text-slate-200 shrink-0 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                  <span>目的地</span>
                </label>
                <div className="flex-1 min-w-0 flex items-center justify-end gap-1.5">
                  <input
                    type="text"
                    placeholder="京都、巴黎、冰島..."
                    value={destination}
                    onChange={(e) => handleDestinationChange(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-right text-[16px] sm:text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                  />
                  <button
                    type="button"
                    disabled={isSearchingGeo || !(destination.trim() || title.trim())}
                    onClick={handleSearchDestinationGeo}
                    className="min-h-[34px] px-2.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 text-xs font-bold flex items-center gap-1 shrink-0 disabled:opacity-40 cursor-pointer"
                    title="搜尋城市座標以啟用氣象與全球地圖足跡"
                  >
                    {isSearchingGeo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                    <span>定位</span>
                  </button>
                </div>
              </div>

              {typeof destinationLat === 'number' && typeof destinationLng === 'number' && (
                <div className="flex justify-end text-[11px] font-mono tabular-nums text-teal-700 dark:text-teal-400">
                  已設定座標：{destinationLat.toFixed(2)}, {destinationLng.toFixed(2)}
                </div>
              )}

              {geoSearchDone && geoResults.length > 0 && (
                <div className="rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-900 divide-y divide-[#E5E2DC]/60 dark:divide-slate-800 max-h-32 overflow-y-auto">
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
                <p className="text-[11px] text-slate-400 text-right">
                  找不到精確座標，可改用英文或主要城市名稱再試一次。
                </p>
              )}
            </div>

            {/* Inline Expandable Travel Dates */}
            <IosDisclosureRow
              icon={<Calendar className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
              label={tripMode === 'memory' ? '旅遊日期' : '旅行日期'}
              value={dateSummaryText}
              valueAccent
              expanded={datesExpanded}
              onToggle={() => setDatesExpanded((v) => !v)}
            >
              <div className="p-3.5 space-y-3">
                {tripMode === 'planner' && (
                  <IosToggleRow
                    icon={<ImageIcon className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
                    label="簡化為回憶相簿模式"
                    subtitle="建立後預設直接開啟相簿畫廊"
                    checked={isPhotoMemoryOnly}
                    onChange={setIsPhotoMemoryOnly}
                  />
                )}

                {(!isPhotoMemoryOnly || tripMode === 'memory') && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
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
                        className="w-full min-h-[42px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-[16px] sm:text-xs text-slate-900 dark:text-slate-100 font-mono tabular-nums outline-none focus:border-teal-600"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
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
                        className="w-full min-h-[42px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-[16px] sm:text-xs text-slate-900 dark:text-slate-100 font-mono tabular-nums outline-none focus:border-teal-600"
                      />
                    </div>
                  </div>
                )}
              </div>
            </IosDisclosureRow>

            {/* Trip Overview / Notes Field */}
            <div className="px-4 py-3 space-y-1.5">
              <label
                htmlFor="trip-edit-notes"
                className="block text-sm sm:text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                旅程簡介與備註（選填）
              </label>
              <textarea
                id="trip-edit-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="記錄這趟旅程的主題、交通票券重點或航班備註..."
                className="w-full px-3 py-2 rounded-xl bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-[16px] sm:text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-teal-600 leading-relaxed resize-y"
              />
            </div>
          </IosInsetGroup>

          {/* Options & Preferences Inset Group */}
          <IosInsetGroup header="偏好與外觀">
            {tripMode === 'planner' && (
              <IosToggleRow
                icon={<User className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
                label="獨旅模式 (一人旅行)"
                subtitle="隱藏分帳與多人協作結算畫面"
                checked={isSoloTrip}
                onChange={setIsSoloTrip}
              />
            )}

            {/* Inline Currency Picker */}
            <IosDisclosureRow
              icon={<Coins className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
              label="主要消費幣別"
              value={selectedCurrencyLabel}
              expanded={currencyExpanded}
              onToggle={() => setCurrencyExpanded((v) => !v)}
            >
              <div className="divide-y divide-[#E5E2DC]/70 dark:divide-slate-800/80">
                {CURRENCIES.map((cur) => (
                  <IosCheckmarkRow
                    key={cur.value}
                    inset
                    label={cur.label}
                    selected={currency === cur.value}
                    onSelect={() => {
                      setCurrency(cur.value);
                      setCurrencyExpanded(false);
                    }}
                  />
                ))}
              </div>
            </IosDisclosureRow>

            {/* Total Trip Budget Input */}
            {tripMode === 'planner' && (
              <div className="px-4 py-2.5 min-h-[50px] flex items-center justify-between gap-3">
                <label
                  htmlFor="trip-budget-input"
                  className="text-sm sm:text-xs font-semibold text-slate-800 dark:text-slate-200 shrink-0 flex items-center gap-2"
                >
                  <Wallet className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                  <span>總預算 ({currency})</span>
                </label>
                <input
                  id="trip-budget-input"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step="any"
                  placeholder="例如：50000（選填）"
                  value={budgetTotalInput}
                  onChange={(e) => setBudgetTotalInput(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-right font-mono tabular-nums text-[16px] sm:text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                />
              </div>
            )}

            {/* Inline Cover Gradient Picker */}
            <IosDisclosureRow
              icon={<Palette className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
              label="封面主題色調"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-full bg-gradient-to-r ${selectedGradientObj.class} inline-block`} />
                  <span>{selectedGradientObj.label}</span>
                </span>
              }
              expanded={themeExpanded}
              onToggle={() => setThemeExpanded((v) => !v)}
            >
              <div className="divide-y divide-[#E5E2DC]/70 dark:divide-slate-800/80">
                {GRADIENTS.map((g) => (
                  <IosCheckmarkRow
                    key={g.label}
                    inset
                    icon={
                      <span className={`w-5 h-5 rounded-full bg-gradient-to-r ${g.class} border border-black/10 shrink-0`} />
                    }
                    label={g.label}
                    selected={coverGradient === g.class}
                    onSelect={() => {
                      setCoverGradient(g.class);
                      setThemeExpanded(false);
                    }}
                  />
                ))}
              </div>
            </IosDisclosureRow>

            {/* Inline Google Photos Album URL */}
            {tripMode === 'planner' && (
              <IosDisclosureRow
                icon={<ExternalLink className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
                label="Google 相簿共享連結"
                value={googlePhotosAlbumUrl.trim() ? '已連結' : '選填'}
                expanded={albumExpanded}
                onToggle={() => setAlbumExpanded((v) => !v)}
              >
                <div className="p-3.5 space-y-2">
                  <input
                    type="text"
                    inputMode="url"
                    placeholder="https://photos.app.goo.gl/..."
                    value={googlePhotosAlbumUrl}
                    onChange={(e) => setGooglePhotosAlbumUrl(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-slate-900 dark:text-white text-[16px] sm:text-xs outline-none focus:border-teal-600"
                  />
                  {sanitizeExternalUrl(googlePhotosAlbumUrl) && (
                    <a
                      href={sanitizeExternalUrl(googlePhotosAlbumUrl)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-teal-700 dark:text-teal-400 font-semibold hover:underline inline-flex items-center gap-1"
                    >
                      <span>測試開啟連結</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </IosDisclosureRow>
            )}
          </IosInsetGroup>
        </form>

        {/* Collapsible Advanced Creation Tools (Planner create mode only) */}
        {!isEditing && tripMode === 'planner' && (
          <IosInsetGroup header="智慧建立助手">
            <IosDisclosureRow
              icon={<Sparkles className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
              label={aiMode !== 'local_only' ? 'AI 規劃 · 貼上筆記 · 經典範本' : '貼上筆記 · 經典範本'}
              value={showAdvanced ? '收合' : '展開'}
              expanded={showAdvanced}
              onToggle={() => setShowAdvanced((v) => !v)}
            >
              <div className="p-3.5 space-y-3.5">
                <div className={`grid ${aiMode !== 'local_only' ? 'grid-cols-3' : 'grid-cols-2'} gap-1 p-1 bg-[#EFECE5] dark:bg-slate-800 rounded-xl`}>
                  {aiMode !== 'local_only' && (
                    <button
                      type="button"
                      onClick={() => setAdvancedSubTab('ai')}
                      className={`min-h-[34px] text-xs font-semibold rounded-lg transition cursor-pointer ${
                        advancedSubTab === 'ai'
                          ? 'bg-white dark:bg-[#111827] text-teal-700 dark:text-teal-300 shadow-2xs font-bold'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      AI 規劃
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAdvancedSubTab('paste')}
                    className={`min-h-[34px] text-xs font-semibold rounded-lg transition cursor-pointer ${
                      advancedSubTab === 'paste'
                        ? 'bg-white dark:bg-[#111827] text-teal-700 dark:text-teal-300 shadow-2xs font-bold'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    貼上筆記
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvancedSubTab('preset')}
                    className={`min-h-[34px] text-xs font-semibold rounded-lg transition cursor-pointer ${
                      advancedSubTab === 'preset'
                        ? 'bg-white dark:bg-[#111827] text-teal-700 dark:text-teal-300 shadow-2xs font-bold'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    精選範本
                  </button>
                </div>

                {aiMode !== 'local_only' && advancedSubTab === 'ai' && (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 overflow-hidden divide-y divide-[#E5E2DC]/75 dark:divide-slate-800">
                      <IosDisclosureRow
                        label="偏好風格"
                        value={selectedAiStyleLabel}
                        expanded={aiStyleExpanded}
                        onToggle={() => setAiStyleExpanded((v) => !v)}
                      >
                        <div className="divide-y divide-[#E5E2DC]/70 dark:divide-slate-800">
                          {AI_STYLES.map((st) => (
                            <IosCheckmarkRow
                              key={st.value}
                              label={st.label}
                              selected={aiStyle === st.value}
                              onSelect={() => {
                                setAiStyle(st.value);
                                setAiStyleExpanded(false);
                              }}
                            />
                          ))}
                        </div>
                      </IosDisclosureRow>

                      <div className="px-4 py-2.5 flex items-center justify-between gap-2 min-h-[48px]">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                          特別喜好
                        </label>
                        <input
                          type="text"
                          placeholder="如：想去神社、特色咖啡廳"
                          value={aiPreferences}
                          onChange={(e) => setAiPreferences(e.target.value)}
                          className="min-w-0 flex-1 bg-transparent text-right text-[16px] sm:text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                        />
                      </div>
                    </div>

                    {aiGenError && (
                      <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{aiGenError}</p>
                    )}

                    <button
                      type="button"
                      disabled={isAiGenerating}
                      onClick={handleAiSubmit}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                    >
                      {isAiGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>AI 正在規劃日程...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>使用 AI 產生完整行程</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {advancedSubTab === 'paste' && (
                  <div className="space-y-3">
                    <textarea
                      rows={3}
                      placeholder="在此貼上 LINE 訊息、部落格或文字行程..."
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-700 text-[16px] sm:text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-teal-600"
                    />
                    {pasteError && (
                      <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{pasteError}</p>
                    )}
                    <button
                      type="button"
                      disabled={isParsingPaste || !pastedText.trim()}
                      onClick={handlePasteSubmit}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
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

                {advancedSubTab === 'preset' && (
                  <div className="rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 overflow-hidden divide-y divide-[#E5E2DC]/75 dark:divide-slate-800 max-h-56 overflow-y-auto">
                    {PRESET_TRIPS.map((preset) => (
                      <IosRow
                        key={preset.id}
                        onClick={() => handleApplyPreset(preset)}
                        label={preset.title}
                        subtitle={`${preset.destination} · ${preset.days.length} 天日程`}
                        trailing={
                          <span className="text-xs font-bold text-teal-700 dark:text-teal-400 flex items-center gap-0.5">
                            <span>套用</span>
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          </span>
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </IosDisclosureRow>
          </IosInsetGroup>
        )}
      </div>
    </IosModalSheet>
  );
};
