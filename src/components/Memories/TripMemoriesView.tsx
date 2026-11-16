import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { Trip, TripMemoryItem, ItineraryItem } from '../../types/itinerary';
import { formatDateSlash, formatMonthDaySlash, getDayOfWeek } from '../../utils/date';
import { Language } from '../../utils/i18n';
import { processPhotoWithExif } from '../../utils/exif';
import { searchLocationOSM } from '../../utils/geo';
import { canUploadImages } from '../../utils/userPermissions';
import { sanitizeExternalUrl } from '../../utils/url';
import { extractMediaId, garbageCollectOrphanedMedia, isMediaRef } from '../../utils/image';
import { idbDeleteMedia } from '../../utils/indexedDb';
import { getStoredTrips } from '../../utils/storage';
import {
  auth,
  connectGoogleDrive,
  getDriveAccessToken,
  hasDriveAccessToken,
  loginWithGoogle,
  saveTripToCloud,
} from '../../utils/firebase';
import {
  deleteDriveFile,
  downloadDriveOriginalFile,
  DriveAuthExpiredError,
  fetchDriveOriginalObjectUrl,
  formatBytesLabel,
  getCachedDriveOriginalObjectUrl,
  uploadOriginalPhotoToDrive,
} from '../../utils/googleDrive';
import { onAuthStateChanged, User } from 'firebase/auth';
import { MediaImage } from '../UI/MediaImage';
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
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Download,
  Share2,
  Check,
  Route,
  AlertCircle,
  AlertTriangle,
  Cloud,
  CloudCheck,
  CloudUpload,
  RefreshCw,
  Loader2,
  ExternalLink,
  Edit2,
  Compass,
  CheckCircle2,
  Circle,
  HardDrive,
} from 'lucide-react';

interface TripMemoriesViewProps {
  trip: Trip;
  allTrips?: Trip[];
  lang: Language;
  canEdit?: boolean;
  onUpdateTrip: (updatedTrip: Trip) => void;
  onSelectTrip?: (tripId: string) => void;
  onOpenGlobalHub?: () => void;
  initialSpotId?: string;
  requireAuth?: (action: () => void, reason?: string) => boolean;
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

export interface PendingMemoryUpload {
  mediaRef: string;
  takenDate: string;
  hasExifDate: boolean;
  lat?: number;
  lng?: number;
  hasGps: boolean;
  rawFile?: File;
  originalBytes?: number;
  originalWidth?: number;
  originalHeight?: number;
  originalMimeType?: string;
}

export const TripMemoriesView: React.FC<TripMemoriesViewProps> = ({
  trip,
  allTrips,
  lang,
  canEdit = true,
  onUpdateTrip,
  onSelectTrip,
  onOpenGlobalHub,
  initialSpotId,
  requireAuth,
}) => {
  const [viewMode, setViewMode] = useState<'itinerary' | 'gallery' | 'polaroid'>(() =>
    trip.tripMode === 'memory' && !initialSpotId ? 'gallery' : 'itinerary'
  );
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | 'all' | 'custom'>('all');
  const [lightboxMemory, setLightboxMemory] = useState<TripMemoryItem | null>(null);
  const [saveSuccessToast, setSaveSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('📸 回憶照片已成功同步至雲端資料庫！');
  const [isSavingMemory, setIsSavingMemory] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [isGlobalSyncing, setIsGlobalSyncing] = useState<boolean>(false);
  const [syncingMemIds, setSyncingMemIds] = useState<Set<string>>(new Set());
  const [confirmDeleteMemId, setConfirmDeleteMemId] = useState<string | null>(null);
  const [confirmDeleteSpotPhoto, setConfirmDeleteSpotPhoto] = useState<{ spotId: string; photoUrl: string } | null>(null);
  const [isLocatingCity, setIsLocatingCity] = useState(false);
  const [driveConnected, setDriveConnected] = useState<boolean>(() => hasDriveAccessToken());
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [driveUploadProgress, setDriveUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [pendingDriveDeleteMem, setPendingDriveDeleteMem] = useState<TripMemoryItem | null>(null);
  const [isDeletingDriveFile, setIsDeletingDriveFile] = useState(false);
  const [driveDeleteError, setDriveDeleteError] = useState<string | null>(null);

  // Sync default tab when switching between planner trips and memory-only trips
  useEffect(() => {
    if (initialSpotId) {
      setViewMode('itinerary');
    } else if (trip.tripMode === 'memory') {
      setViewMode('gallery');
    } else {
      setViewMode('itinerary');
    }
    setSelectedDayFilter('all');
  }, [trip.id, trip.tripMode, initialSpotId]);

  // Monitor Firebase Auth State & Drive token changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setDriveConnected(hasDriveAccessToken());
    });
    const syncDrive = () => setDriveConnected(hasDriveAccessToken());
    window.addEventListener('hiyori_drive_auth_changed', syncDrive);
    return () => {
      unsubscribe();
      window.removeEventListener('hiyori_drive_auth_changed', syncDrive);
    };
  }, []);

  // Listen to Global Cloud Sync Events
  useEffect(() => {
    const handleSyncEvent = (e: any) => {
      const status = e.detail?.status;
      if (status === 'syncing') {
        setIsGlobalSyncing(true);
      } else {
        setIsGlobalSyncing(false);
      }
    };
    window.addEventListener('cloud_sync_status', handleSyncEvent);
    return () => window.removeEventListener('cloud_sync_status', handleSyncEvent);
  }, []);

  const performForceSyncMemory = async (mem: TripMemoryItem) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setToastMessage(
        lang === 'zh'
          ? '📴 目前處於離線狀態，照片已安全保留於本機，連網後將自動同步'
          : 'Offline: photo safely stored locally and queued for sync'
      );
      setSaveSuccessToast(true);
      setTimeout(() => setSaveSuccessToast(false), 3200);
      return;
    }

    if (!auth.currentUser) {
      if (requireAuth) {
        requireAuth(() => performForceSyncMemory(mem), lang === 'zh' ? '同步照片至雲端資料庫' : 'Sync photo to cloud');
      } else {
        await loginWithGoogle();
      }
      return;
    }

    setSyncingMemIds((prev) => new Set(prev).add(mem.id));
    setToastMessage(lang === 'zh' ? '正在強制同步至雲端資料庫...' : 'Force syncing to cloud...');
    setSaveSuccessToast(true);

    try {
      await saveTripToCloud(auth.currentUser.uid, {
        ...trip,
        updatedAt: Date.now(),
      });
      setToastMessage(
        lang === 'zh'
          ? `✅ 已成功同步【${mem.spotTitle || mem.caption || '回憶照片'}】至雲端資料庫！`
          : 'Successfully synced photo to cloud!'
      );
      setSaveSuccessToast(true);
      setTimeout(() => setSaveSuccessToast(false), 3000);
    } catch (err) {
      console.error('Failed to force sync memory:', err);
      setToastMessage(
        lang === 'zh'
          ? '⚠️ 雲端同步失敗，已加入離線待傳佇列'
          : 'Sync failed, enqueued for retry'
      );
      setSaveSuccessToast(true);
      setTimeout(() => setSaveSuccessToast(false), 3500);
    } finally {
      setSyncingMemIds((prev) => {
        const next = new Set(prev);
        next.delete(mem.id);
        return next;
      });
    }
  };

  // Manual forced sync handler for a specific memory / entire trip
  const handleForceSyncMemory = async (mem: TripMemoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    await performForceSyncMemory(mem);
  };

  // Render Google Photos style sync status badge for each photo card corner (Color-Blind Friendly)
  const renderSyncBadge = (mem: TripMemoryItem, className = '') => {
    const isThisSyncing = syncingMemIds.has(mem.id) || isGlobalSyncing;
    const isCloudSynced = Boolean(currentUser) && !isThisSyncing;

    // Status attributes designed for color-blind accessibility (Shape + Icon + Motion + Label)
    let IconComponent = CloudUpload;
    let iconClass = 'text-white/95 stroke-[2.2]';
    let label = lang === 'zh' ? '上傳備份' : 'Backup';
    let statusTitle = lang === 'zh' ? '僅存於本機 (點擊立即備份至雲端資料庫)' : 'Stored locally (tap to backup)';
    let badgeBorder = 'border-white/30 bg-slate-900/80 hover:bg-slate-900 text-white';

    if (isThisSyncing) {
      IconComponent = RefreshCw;
      iconClass = 'text-amber-300 animate-spin stroke-[2.2]';
      label = lang === 'zh' ? '備份中...' : 'Syncing...';
      statusTitle = lang === 'zh' ? '正在備份同步至雲端資料庫...' : 'Syncing to cloud...';
      badgeBorder = 'border-amber-400/50 bg-slate-900/90 text-amber-200';
    } else if (isCloudSynced) {
      IconComponent = CloudCheck;
      iconClass = 'text-emerald-300 stroke-[2.2]';
      label = lang === 'zh' ? '已備份' : 'Backed up';
      statusTitle = lang === 'zh' ? '已備份至雲端 (點擊手動重新整理)' : 'Backed up to cloud (tap to re-sync)';
      badgeBorder = 'border-emerald-500/40 bg-slate-900/80 hover:bg-slate-900 text-emerald-200';
    }

    return (
      <button
        type="button"
        onClick={(e) => handleForceSyncMemory(mem, e)}
        title={statusTitle}
        aria-label={statusTitle}
        className={`px-2 py-1 rounded-full backdrop-blur-md border shadow-xs transition-all flex items-center gap-1 cursor-pointer active:scale-95 group/sync ${badgeBorder} ${className}`}
      >
        <IconComponent className={`w-3.5 h-3.5 shrink-0 ${iconClass}`} />
        <span className="text-[10px] font-bold tracking-tight whitespace-nowrap">
          {label}
        </span>
      </button>
    );
  };

  // Lock background scroll when modal, lightbox, or delete dialog is open
  useBodyScrollLock(showUploadModal || Boolean(lightboxMemory) || Boolean(pendingDriveDeleteMem));

  // Escape key handler for Dialogs, Lightbox, and Upload Modal
  useEffect(() => {
    if (!showUploadModal && !lightboxMemory && !pendingDriveDeleteMem) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingDriveDeleteMem && !isDeletingDriveFile) {
          setPendingDriveDeleteMem(null);
          setDriveDeleteError(null);
        } else if (lightboxMemory) {
          setLightboxMemory(null);
          setConfirmDeleteMemId(null);
        } else if (showUploadModal) {
          closeUploadModalAndCleanup();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showUploadModal, lightboxMemory, pendingDriveDeleteMem, isDeletingDriveFile]);

  // Form State for uploading new memory photo
  const [uploadSpotId, setUploadSpotId] = useState<string>(initialSpotId || '');
  const [isCustomSpot, setIsCustomSpot] = useState<boolean>(!initialSpotId);
  const [customLocationName, setCustomLocationName] = useState<string>('');
  const [customDayNumber, setCustomDayNumber] = useState<number | 'all'>(() => trip.days[0]?.dayNumber || 1);
  const [customDate, setCustomDate] = useState<string>('');
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadMood, setUploadMood] = useState('✨');
  const [uploadGooglePhotosUrl, setUploadGooglePhotosUrl] = useState('');
  const [uploadImagePreviews, setUploadImagePreviews] = useState<PendingMemoryUpload[]>([]);
  const [uploadBatchProgress, setUploadBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadLimitWarning, setUploadLimitWarning] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const closeUploadModalAndCleanup = (skipMediaDelete = false) => {
    if (!skipMediaDelete) {
      setUploadImagePreviews((prev) => {
        prev.forEach((p) => {
          if (p.mediaRef && isMediaRef(p.mediaRef)) {
            idbDeleteMedia(extractMediaId(p.mediaRef)).catch(() => {});
          }
        });
        return [];
      });
    } else {
      setUploadImagePreviews([]);
    }
    setUploadBatchProgress(null);
    setUploadLimitWarning(null);
    setUploadCaption('');
    setUploadSpotId('');
    setUploadGooglePhotosUrl('');
    setIsCustomSpot(false);
    setCustomLocationName('');
    setConfirmDeleteSpotPhoto(null);
    setShowUploadModal(false);
  };

  // When navigated to with a specific spot ID, auto-open the upload modal for this spot
  useEffect(() => {
    if (initialSpotId) {
      setUploadSpotId(initialSpotId);
      setIsCustomSpot(false);
      const matched = trip.days.flatMap((d) => d.items).find((it) => it.id === initialSpotId);
      if (matched?.googlePhotosUrl) {
        setUploadGooglePhotosUrl(matched.googlePhotosUrl);
      }
      setShowUploadModal(true);
      setViewMode('itinerary');
    }
  }, [initialSpotId, trip.days]);

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
    const spotMap = new Map<string, ItineraryItem>();
    (trip.days || []).forEach((day) => {
      (day.items || []).forEach((item) => {
        spotMap.set(item.id, item);
      });
    });

    const items: TripMemoryItem[] = (trip.memories || []).map((m) => {
      if (!m.googlePhotosUrl && m.spotId && spotMap.has(m.spotId)) {
        return {
          ...m,
          googlePhotosUrl: spotMap.get(m.spotId)?.googlePhotosUrl,
        };
      }
      return m;
    });

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
                googlePhotosUrl: item.googlePhotosUrl,
                createdAt: trip.createdAt + pIdx * 1000,
              });
            }
          });
        } else if (item.googlePhotosUrl) {
          // Spot has googlePhotosUrl without local photos
          const exists = items.some((m) => m.spotId === item.id);
          if (!exists) {
            items.push({
              id: `spot-mem-gphoto-${item.id}`,
              imageUrl: item.googlePhotosUrl,
              caption: item.memoryNotes || item.title,
              spotId: item.id,
              spotTitle: item.title,
              dayNumber: day.dayNumber,
              date: day.date,
              mood: item.memoryMood || '✨',
              location: item.locationName || item.title,
              googlePhotosUrl: item.googlePhotosUrl,
              createdAt: trip.createdAt + 1000,
            });
          }
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

  const [isAuthorizedUploader, setIsAuthorizedUploader] = useState(() => canUploadImages({ canEdit }));

  useEffect(() => {
    const handleAuth = () => {
      setIsAuthorizedUploader(canUploadImages({ canEdit }));
    };
    handleAuth();
    window.addEventListener('auth_state_change', handleAuth);
    return () => window.removeEventListener('auth_state_change', handleAuth);
  }, [canEdit]);

  const canShowUploadAction = isAuthorizedUploader && canEdit;

  const handleTriggerUpload = (spotId?: string, isCustom = false) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => {
      setUploadSpotId(spotId || '');
      setIsCustomSpot(isCustom);
      setShowUploadModal(true);
    }, lang === 'zh' ? '上傳打卡相片' : 'Upload photo')) {
      return;
    }
    setUploadSpotId(spotId || '');
    setIsCustomSpot(isCustom);
    setShowUploadModal(true);
  };

  // Visited-only filter state for itinerary retrospection
  const [filterVisitedOnly, setFilterVisitedOnly] = useState(true);

  // Count of spots that are completed OR have at least one photo / googlePhotosUrl
  const visitedSpotsCount = useMemo(() => {
    const photoSpotIds = new Set(allMemories.map((m) => m.spotId).filter(Boolean));
    let count = 0;
    (trip.days || []).forEach((d) => {
      (d.items || []).forEach((it) => {
        if (it.completed || photoSpotIds.has(it.id) || (it.memoryPhotos && it.memoryPhotos.length > 0) || it.googlePhotosUrl) {
          count++;
        }
      });
    });
    return count;
  }, [allMemories, trip.days]);

  // Direct check-in toggle from photo memory view
  const performToggleSpotCompleted = (spotId: string) => {
    const updatedDays = trip.days.map((d) => ({
      ...d,
      items: d.items.map((it) => (it.id === spotId ? { ...it, completed: !it.completed } : it)),
    }));
    onUpdateTrip({
      ...trip,
      days: updatedDays,
      updatedAt: Date.now(),
    });
  };

  const handleToggleSpotCompleted = (spotId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!canEdit) return;
    if (
      requireAuth &&
      !requireAuth(
        () => performToggleSpotCompleted(spotId),
        lang === 'zh' ? '標記景點造訪狀態' : 'Update visited status'
      )
    ) {
      return;
    }
    performToggleSpotCompleted(spotId);
  };

  // Unassigned / general trip snapshots (not bound to a specific day spot or with custom dayNumber not matching days)
  const unassignedMemories = useMemo(() => {
    return allMemories.filter(
      (m) => !m.dayNumber || !trip.days.some((d) => d.dayNumber === m.dayNumber)
    );
  }, [allMemories, trip.days]);

  // Filter memories
  const filteredMemories = useMemo(() => {
    if (selectedDayFilter === 'all') return allMemories;
    if (selectedDayFilter === 'custom') return unassignedMemories;
    return allMemories.filter((m) => m.dayNumber === selectedDayFilter);
  }, [allMemories, selectedDayFilter, unassignedMemories]);

  // Lightbox carousel playlist & navigation
  const lightboxPlaylist = useMemo(() => {
    if (!lightboxMemory) return [];
    if (lightboxMemory.spotId) {
      const spotMems = allMemories.filter((m) => m.spotId === lightboxMemory.spotId);
      if (spotMems.length > 1) return spotMems;
    }
    return filteredMemories.length > 0 ? filteredMemories : allMemories;
  }, [lightboxMemory, allMemories, filteredMemories]);

  const currentLightboxIndex = useMemo(() => {
    if (!lightboxMemory || lightboxPlaylist.length === 0) return -1;
    return lightboxPlaylist.findIndex((m) => m.id === lightboxMemory.id);
  }, [lightboxMemory, lightboxPlaylist]);

  const handlePrevLightbox = () => {
    if (currentLightboxIndex > 0) {
      setLightboxMemory(lightboxPlaylist[currentLightboxIndex - 1]);
    } else if (lightboxPlaylist.length > 1) {
      setLightboxMemory(lightboxPlaylist[lightboxPlaylist.length - 1]);
    }
  };

  const handleNextLightbox = () => {
    if (currentLightboxIndex >= 0 && currentLightboxIndex < lightboxPlaylist.length - 1) {
      setLightboxMemory(lightboxPlaylist[currentLightboxIndex + 1]);
    } else if (lightboxPlaylist.length > 1) {
      setLightboxMemory(lightboxPlaylist[0]);
    }
  };

  // Lightbox inline edit states & high-res Drive streaming
  const [isEditingLightboxUrl, setIsEditingLightboxUrl] = useState(false);
  const [lightboxEditUrl, setLightboxEditUrl] = useState('');
  const [lightboxHighResFailed, setLightboxHighResFailed] = useState(false);
  const [driveOriginalUrl, setDriveOriginalUrl] = useState<string | null>(null);
  const [isLoadingDriveOriginal, setIsLoadingDriveOriginal] = useState(false);
  const [isDownloadingDriveOriginal, setIsDownloadingDriveOriginal] = useState(false);
  const [driveOriginalError, setDriveOriginalError] = useState<string | null>(null);

  useEffect(() => {
    setIsEditingLightboxUrl(false);
    setLightboxEditUrl(lightboxMemory?.googlePhotosUrl || '');
    setLightboxHighResFailed(false);
    setDriveOriginalError(null);

    const fileId = lightboxMemory?.driveFileId;
    if (!fileId) {
      setDriveOriginalUrl(null);
      setIsLoadingDriveOriginal(false);
      return;
    }

    const cached = getCachedDriveOriginalObjectUrl(fileId);
    if (cached) {
      setDriveOriginalUrl(cached);
      setIsLoadingDriveOriginal(false);
      return;
    }

    setDriveOriginalUrl(null);
    const token = getDriveAccessToken();
    if (!token) {
      setIsLoadingDriveOriginal(false);
      return;
    }

    let cancelled = false;
    setIsLoadingDriveOriginal(true);
    fetchDriveOriginalObjectUrl(fileId, token)
      .then((url) => {
        if (!cancelled) {
          setDriveOriginalUrl(url);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof DriveAuthExpiredError) {
            setDriveConnected(false);
          } else {
            setDriveOriginalError(err instanceof Error ? err.message : '原圖載入失敗');
          }
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingDriveOriginal(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [lightboxMemory?.id, lightboxMemory?.driveFileId, driveConnected]);

  const handleSaveLightboxGoogleUrl = () => {
    if (!canEdit || !lightboxMemory) return;
    if (
      requireAuth &&
      !requireAuth(
        () => handleSaveLightboxGoogleUrl(),
        lang === 'zh' ? '修改原圖連結' : 'Edit original photo link'
      )
    ) {
      return;
    }
    const finalUrl = sanitizeExternalUrl(lightboxEditUrl) || '';

    // 1. Update current lightboxMemory in-memory
    const updatedMem = {
      ...lightboxMemory,
      googlePhotosUrl: finalUrl || undefined,
    };
    setLightboxMemory(updatedMem);

    // 2. Update trip.memories
    const updatedMemories = (trip.memories || []).map((m) =>
      m.id === lightboxMemory.id || (lightboxMemory.spotId && m.spotId === lightboxMemory.spotId)
        ? { ...m, googlePhotosUrl: finalUrl || undefined }
        : m
    );

    // 3. Update spot in trip.days if spotId is present
    let updatedDays = trip.days;
    if (lightboxMemory.spotId) {
      updatedDays = trip.days.map((d) => ({
        ...d,
        items: d.items.map((item) => {
          if (item.id === lightboxMemory.spotId) {
            return {
              ...item,
              googlePhotosUrl: finalUrl || undefined,
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

    setIsEditingLightboxUrl(false);
    setSaveSuccessToast(true);
    setTimeout(() => setSaveSuccessToast(false), 2500);
  };

  // Touch swipe within Lightbox
  const lightboxTouchStartX = useRef<number | null>(null);
  const handleLightboxTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    lightboxTouchStartX.current = e.touches[0].clientX;
  };
  const handleLightboxTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (lightboxTouchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - lightboxTouchStartX.current;
    lightboxTouchStartX.current = null;
    if (Math.abs(deltaX) > 40) {
      if (deltaX < 0) {
        handleNextLightbox();
      } else {
        handlePrevLightbox();
      }
    }
  };

  // Handle Photo File selection (up to 3 per itinerary spot, or 24 per custom/memory batch with EXIF extraction)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const matchedSpotObj = !isCustomSpot && uploadSpotId ? allSpots.find((s) => s.spot.id === uploadSpotId) : null;
    const existingCount = matchedSpotObj?.spot.memoryPhotos?.length || 0;
    const currentNewCount = uploadImagePreviews.length;
    const batchMax = isCustomSpot ? 24 : 3;
    const maxAllowed = isCustomSpot ? 24 : Math.max(0, 3 - existingCount);
    const availableSlots = Math.max(0, maxAllowed - currentNewCount);

    if (availableSlots <= 0) {
      setUploadLimitWarning(
        isCustomSpot
          ? '單次批次上傳上限為 24 張！請先儲存這批相片後再繼續加入。'
          : '此景點照片已達上限 3 張！請先移除現有或已選照片後再加入。'
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsProcessingImage(true);
    setUploadLimitWarning(null);

    try {
      const filesToProcess = files.slice(0, availableSlots);
      if (files.length > availableSlots) {
        setUploadLimitWarning(
          `${isCustomSpot ? '單次批次上限' : '景點照片上限'}為 ${batchMax} 張，已為您自動選取前 ${availableSlots} 張。`
        );
      }

      setUploadBatchProgress({ done: 0, total: filesToProcess.length });
      const processedList: PendingMemoryUpload[] = [];
      for (let i = 0; i < filesToProcess.length; i++) {
        const processed = await processPhotoWithExif(filesToProcess[i], trip.id);
        processedList.push({
          mediaRef: processed.mediaRef,
          takenDate: processed.takenDate,
          hasExifDate: processed.hasExifDate,
          lat: processed.lat,
          lng: processed.lng,
          hasGps: processed.hasGps,
          rawFile: processed.rawFile,
          originalBytes: processed.originalBytes,
          originalWidth: processed.originalWidth,
          originalHeight: processed.originalHeight,
          originalMimeType: processed.originalMimeType,
        });
        setUploadBatchProgress({ done: i + 1, total: filesToProcess.length });
      }

      // Auto-fill customDate from earliest EXIF date if empty
      if (isCustomSpot && !customDate) {
        const exifDates = processedList
          .filter((p) => p.hasExifDate && p.takenDate)
          .map((p) => p.takenDate)
          .sort();
        if (exifDates.length > 0) {
          setCustomDate(exifDates[0]);
        }
      }

      setUploadImagePreviews((prev) => [...prev, ...processedList].slice(0, maxAllowed));
    } catch (err) {
      console.error('Failed to process photo:', err);
      setUploadLimitWarning(err instanceof Error ? err.message : '照片處理失敗，請確認格式或檔案大小（25MB 以內）後重試');
    } finally {
      setIsProcessingImage(false);
      setUploadBatchProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePreview = (index: number) => {
    setUploadImagePreviews((prev) => {
      const target = prev[index];
      if (target?.mediaRef && isMediaRef(target.mediaRef)) {
        idbDeleteMedia(extractMediaId(target.mediaRef)).catch(() => {});
      }
      return prev.filter((_, idx) => idx !== index);
    });
    setUploadLimitWarning(null);
  };

  // Quick city coordinate lookup for memory-mode trips missing GPS
  const handleQuickLocateCity = async () => {
    const query = (trip.destination || trip.title || '').trim();
    if (!query || !canEdit || isLocatingCity) return;
    setIsLocatingCity(true);
    try {
      const results = await searchLocationOSM(query);
      if (results.length > 0) {
        const best = results[0];
        await onUpdateTrip({
          ...trip,
          destinationLat: best.lat,
          destinationLng: best.lng,
          updatedAt: Date.now(),
        });
        setToastMessage(`📍 已為【${trip.destination || trip.title}】標記城市座標，世界足跡地圖已點亮！`);
      } else {
        setToastMessage('⚠️ 找不到對應城市座標，可至「編輯旅程」手動搜尋較完整的城市英文或中文名稱');
      }
      setSaveSuccessToast(true);
      setTimeout(() => setSaveSuccessToast(false), 3500);
    } catch {
      setToastMessage('⚠️ 城市座標查詢失敗，請稍後再試');
      setSaveSuccessToast(true);
      setTimeout(() => setSaveSuccessToast(false), 3000);
    } finally {
      setIsLocatingCity(false);
    }
  };

  // Delete an existing photo from a spot directly (after inline confirm)
  const handleDeleteExistingSpotPhoto = (spotId: string, photoUrl: string) => {
    if (!canEdit) return;
    if (
      requireAuth &&
      !requireAuth(
        () => handleDeleteExistingSpotPhoto(spotId, photoUrl),
        lang === 'zh' ? '移除景點照片' : 'Remove spot photo'
      )
    ) {
      return;
    }

    const matchingDriveMem = (trip.memories || []).find(
      (m) => m.imageUrl === photoUrl && Boolean(m.driveFileId)
    );
    if (matchingDriveMem) {
      setConfirmDeleteSpotPhoto(null);
      setDriveDeleteError(null);
      setPendingDriveDeleteMem(matchingDriveMem);
      return;
    }

    const now = Date.now();
    const removedMemIds = (trip.memories || []).filter((m) => m.imageUrl === photoUrl).map((m) => m.id);
    const deletedItemIds: Record<string, number> = { ...(trip.deletedItemIds || {}) };
    removedMemIds.forEach((id) => {
      deletedItemIds[id] = now;
    });

    const updatedDays = trip.days.map((d) => ({
      ...d,
      items: d.items.map((item) => {
        if (item.id === spotId && item.memoryPhotos) {
          return {
            ...item,
            memoryPhotos: item.memoryPhotos.filter((p) => p !== photoUrl),
          };
        }
        return item;
      }),
    }));

    const updatedMemories = (trip.memories || []).filter((m) => m.imageUrl !== photoUrl);

    setConfirmDeleteSpotPhoto(null);
    const updatedTrip: Trip = {
      ...trip,
      days: updatedDays,
      memories: updatedMemories,
      deletedItemIds,
      updatedAt: now,
    };
    onUpdateTrip(updatedTrip);
    garbageCollectOrphanedMedia(
      (allTrips || getStoredTrips()).map((t) => (t.id === updatedTrip.id ? updatedTrip : t))
    ).catch(() => {});
  };

  // Submit and save new memories or update Google Photos link
  const handleSaveMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const hasNewPhotos = uploadImagePreviews.length > 0;
    const safeGoogleUrl = sanitizeExternalUrl(uploadGooglePhotosUrl);
    const hasGoogleUrl = Boolean(safeGoogleUrl);
    if (!hasNewPhotos && !hasGoogleUrl && !uploadCaption.trim()) return;

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

    const now = Date.now();
    let updatedMemories = [...(trip.memories || [])];
    let nextDriveFolderId = trip.driveFolderId;

    let didSave = false;
    setIsSavingMemory(true);
    try {
      if (hasNewPhotos) {
        const driveToken = getDriveAccessToken();
        const driveUploads = new Map<
          number,
          { driveFileId: string; driveFolderId: string; originalBytes: number; originalMimeType: string }
        >();

        const rawIndexes = uploadImagePreviews
          .map((p, idx) => (p.rawFile ? idx : -1))
          .filter((idx) => idx >= 0);

        if (driveToken && rawIndexes.length > 0) {
          setDriveUploadProgress({ done: 0, total: rawIndexes.length });
          for (let step = 0; step < rawIndexes.length; step++) {
            const idx = rawIndexes[step];
            const preview = uploadImagePreviews[idx];
            if (preview.rawFile) {
              try {
                const uploaded = await uploadOriginalPhotoToDrive(preview.rawFile, {
                  token: driveToken,
                  tripId: trip.id,
                  tripTitle: trip.title,
                  existingFolderId: nextDriveFolderId,
                  takenDate: isCustom
                    ? customDate || preview.takenDate || chosenDate
                    : chosenDate || preview.takenDate,
                });
                nextDriveFolderId = uploaded.driveFolderId;
                driveUploads.set(idx, uploaded);
              } catch (err) {
                console.warn('Google Drive original photo upload skipped:', err);
                if (err instanceof DriveAuthExpiredError) {
                  setDriveConnected(false);
                  break;
                }
              }
            }
            setDriveUploadProgress({ done: step + 1, total: rawIndexes.length });
          }
          setDriveUploadProgress(null);
        }

        const newMemories: TripMemoryItem[] = uploadImagePreviews.map((preview, idx) => {
          const photoDate = isCustom
            ? (customDate || preview.takenDate || chosenDate)
            : chosenDate;
          const matchedDayByDate =
            !isCustom
              ? chosenDayNum
              : chosenDayNum ?? (photoDate ? trip.days.find((d) => d.date === photoDate)?.dayNumber : undefined);
          const driveInfo = driveUploads.get(idx);

          return {
            id: `mem-${now}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
            imageUrl: preview.mediaRef,
            caption: uploadCaption.trim() || finalTitle,
            spotId: !isCustom ? uploadSpotId : undefined,
            spotTitle: finalTitle,
            dayNumber: matchedDayByDate,
            date: photoDate,
            lat: preview.lat,
            lng: preview.lng,
            mood: uploadMood,
            location: finalLocation,
            googlePhotosUrl: safeGoogleUrl || undefined,
            driveFileId: driveInfo?.driveFileId,
            driveFolderId: driveInfo?.driveFolderId || nextDriveFolderId,
            originalBytes: driveInfo?.originalBytes ?? preview.originalBytes,
            originalWidth: preview.originalWidth,
            originalHeight: preview.originalHeight,
            originalMimeType: driveInfo?.originalMimeType ?? preview.originalMimeType,
            createdAt: now + idx * 50,
          };
        });
        updatedMemories = [...newMemories, ...updatedMemories];
    } else if (hasGoogleUrl && safeGoogleUrl) {
      // User only updated/added googlePhotosUrl without uploading files
      if (!isCustom && uploadSpotId) {
        // Check if memories already exist for this spot
        const spotMems = updatedMemories.filter((m) => m.spotId === uploadSpotId);
        if (spotMems.length > 0) {
          updatedMemories = updatedMemories.map((m) =>
            m.spotId === uploadSpotId
              ? {
                  ...m,
                  googlePhotosUrl: safeGoogleUrl || undefined,
                  caption: uploadCaption.trim() || m.caption,
                  mood: uploadMood || m.mood,
                }
              : m
          );
        } else {
          updatedMemories.unshift({
            id: `mem-gphoto-${now}`,
            imageUrl: safeGoogleUrl,
            caption: uploadCaption.trim() || finalTitle,
            spotId: uploadSpotId,
            spotTitle: finalTitle,
            dayNumber: chosenDayNum,
            date: chosenDate,
            mood: uploadMood,
            location: finalLocation,
            googlePhotosUrl: safeGoogleUrl,
            createdAt: now,
          });
        }
      } else {
        // Custom snap with Google Photos URL
        updatedMemories.unshift({
          id: `mem-custom-gphoto-${now}`,
          imageUrl: safeGoogleUrl,
          caption: uploadCaption.trim() || finalTitle,
          dayNumber: chosenDayNum,
          date: chosenDate,
          mood: uploadMood,
          location: finalLocation,
          googlePhotosUrl: safeGoogleUrl,
          createdAt: now,
        });
      }
    }

    // Also update spot in trip.days if not custom
    let updatedDays = trip.days;
    if (!isCustom && uploadSpotId) {
      updatedDays = trip.days.map((d) => ({
        ...d,
        items: d.items.map((item) => {
          if (item.id === uploadSpotId) {
            const existing = item.memoryPhotos || [];
            const newMediaRefs = uploadImagePreviews.map((p) => p.mediaRef);
            const merged = hasNewPhotos
              ? [...existing, ...newMediaRefs].slice(0, 3)
              : existing;
            return {
              ...item,
              completed: true,
              memoryPhotos: merged.length > 0 ? merged : undefined,
              memoryNotes: uploadCaption.trim() || item.memoryNotes,
              memoryMood: uploadMood,
              googlePhotosUrl: safeGoogleUrl || item.googlePhotosUrl || undefined,
            };
          }
          return item;
        }),
      }));
    }

    // Backfill centroid destinationLat / destinationLng if missing and uploaded photos have GPS
    let nextDestLat = trip.destinationLat;
    let nextDestLng = trip.destinationLng;
    if ((typeof nextDestLat !== 'number' || typeof nextDestLng !== 'number') && hasNewPhotos) {
      const gpsList = uploadImagePreviews.filter(
        (p) => typeof p.lat === 'number' && typeof p.lng === 'number'
      );
      if (gpsList.length > 0) {
        nextDestLat =
          Math.round((gpsList.reduce((acc, p) => acc + (p.lat || 0), 0) / gpsList.length) * 1000000) /
          1000000;
        nextDestLng =
          Math.round((gpsList.reduce((acc, p) => acc + (p.lng || 0), 0) / gpsList.length) * 1000000) /
          1000000;
      }
    }

      await onUpdateTrip({
        ...trip,
        days: updatedDays,
        memories: updatedMemories,
        destinationLat: nextDestLat,
        destinationLng: nextDestLng,
        driveFolderId: nextDriveFolderId,
        updatedAt: Date.now(),
      });
      didSave = true;

      if (auth.currentUser) {
        setToastMessage(
          nextDriveFolderId && uploadImagePreviews.some((p) => p.rawFile) && hasDriveAccessToken()
            ? '📸 回憶照片與 Google Drive 原圖皆已備份完成！'
            : '📸 回憶照片已成功同步至雲端資料庫！'
        );
      } else {
        setToastMessage('💾 照片已儲存至本機！建議登入 Google 帳號以啟用雲端同步');
      }
      setSaveSuccessToast(true);
      setTimeout(() => setSaveSuccessToast(false), 3500);
    } catch (err) {
      console.error('Failed to save memory:', err);
      setToastMessage('⚠️ 雲端連線異常，照片已安全暫存本機並加入離線佇列');
      setSaveSuccessToast(true);
      setTimeout(() => setSaveSuccessToast(false), 3500);
    } finally {
      setIsSavingMemory(false);
      setDriveUploadProgress(null);
      closeUploadModalAndCleanup(didSave);
    }
  };

  const performDeleteMemory = (memId: string) => {
    const now = Date.now();
    const targetMem = allMemories.find((m) => m.id === memId);
    const updatedMemories = (trip.memories || []).filter((m) => m.id !== memId);
    const deletedItemIds: Record<string, number> = {
      ...(trip.deletedItemIds || {}),
    };
    if (!memId.startsWith('spot-mem-')) {
      deletedItemIds[memId] = now;
    }

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

    setConfirmDeleteMemId(null);
    if (lightboxMemory?.id === memId) {
      setLightboxMemory(null);
    }

    const updatedTrip: Trip = {
      ...trip,
      days: updatedDays,
      memories: updatedMemories,
      deletedItemIds,
      updatedAt: now,
    };
    onUpdateTrip(updatedTrip);
    garbageCollectOrphanedMedia(
      (allTrips || getStoredTrips()).map((t) => (t.id === updatedTrip.id ? updatedTrip : t))
    ).catch(() => {});
  };

  // Delete memory (explicit confirmation dialog if backed up to Google Drive)
  const handleDeleteMemory = (memId: string) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleDeleteMemory(memId), lang === 'zh' ? '刪除回憶相片' : 'Delete photo')) {
      return;
    }

    const targetMem = allMemories.find((m) => m.id === memId);
    if (targetMem?.driveFileId) {
      setConfirmDeleteMemId(null);
      setDriveDeleteError(null);
      setPendingDriveDeleteMem(targetMem);
      return;
    }

    performDeleteMemory(memId);
  };

  const handleConfirmDriveDelete = async (alsoDeleteFromDrive: boolean) => {
    if (!pendingDriveDeleteMem) return;
    if (alsoDeleteFromDrive && pendingDriveDeleteMem.driveFileId) {
      setIsDeletingDriveFile(true);
      setDriveDeleteError(null);
      try {
        let token = getDriveAccessToken();
        if (!token) {
          token = await connectGoogleDrive();
          setDriveConnected(hasDriveAccessToken());
        }
        if (!token) {
          setDriveDeleteError('需要 Google Drive 授權才能刪除 Drive 原圖，或選擇「僅從相簿移除」。');
          setIsDeletingDriveFile(false);
          return;
        }
        await deleteDriveFile(pendingDriveDeleteMem.driveFileId, token);
      } catch (err) {
        setDriveDeleteError(
          err instanceof Error ? err.message : '刪除 Google Drive 原圖失敗，請重試或選擇僅從相簿移除。'
        );
        setIsDeletingDriveFile(false);
        return;
      } finally {
        setIsDeletingDriveFile(false);
      }
    }

    const memId = pendingDriveDeleteMem.id;
    setPendingDriveDeleteMem(null);
    setDriveDeleteError(null);
    performDeleteMemory(memId);
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

      {/* 1. Compact Header Banner with Inline Stats */}
      <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-4 sm:p-5 shadow-2xs no-print space-y-3.5">
        {/* Top Row: Title, Inline Clean Stats, and Quick Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg whitespace-nowrap">
                  {lang === 'zh' ? '旅程回憶相簿' : 'Trip Memories'}
                </h3>
                {/* Clean Unboxed Inline Stats (Zero-Pill) */}
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium flex-wrap">
                  <span className="hidden sm:inline" aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200">
                    {allMemories.length}
                  </span>
                  <span>張相片</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200">
                    {new Set(allMemories.map((m) => m.spotId).filter(Boolean)).size}
                  </span>
                  <span>處打卡</span>
                  {allMemories.some((m) => !m.spotId) && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums font-bold text-teal-700 dark:text-teal-400">
                        {allMemories.filter((m) => !m.spotId).length}
                      </span>
                      <span>隨拍</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  {currentUser ? (
                    <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-400">
                      雲端已連線
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400" title="登入後同步至雲端">
                      本機模式
                    </span>
                  )}
                  <span aria-hidden="true">·</span>
                  {driveConnected ? (
                    <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 inline-flex items-center gap-1">
                      <HardDrive className="w-3 h-3" />
                      <span>Drive 原圖已連線</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isConnectingDrive}
                      onClick={async () => {
                        setIsConnectingDrive(true);
                        try {
                          const token = await connectGoogleDrive();
                          const ok = Boolean(token) || hasDriveAccessToken();
                          setDriveConnected(ok);
                          if (!ok) {
                            setToastMessage('⚠️ Google Drive 授權未完成或被瀏覽器阻擋，請允許彈出視窗後重試');
                            setSaveSuccessToast(true);
                            setTimeout(() => setSaveSuccessToast(false), 3500);
                          }
                        } finally {
                          setIsConnectingDrive(false);
                        }
                      }}
                      className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <HardDrive className="w-3 h-3" />
                      <span>{isConnectingDrive ? '授權中...' : '連線 Drive 原圖'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            {onOpenGlobalHub && (
              <button
                type="button"
                onClick={onOpenGlobalHub}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/80 text-teal-700 dark:text-teal-300 border border-teal-200/80 dark:border-teal-800/80 text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs active:scale-95 cursor-pointer"
                title="探索跨旅程回憶與月曆足跡"
              >
                <Compass className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                <span className="whitespace-nowrap">足跡時光庫</span>
              </button>
            )}

            {sanitizeExternalUrl(trip.googlePhotosAlbumUrl) && (
              <a
                href={sanitizeExternalUrl(trip.googlePhotosAlbumUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#FAF9F6] dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-[#E5E2DC] dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95"
                title={lang === 'zh' ? '開啟此行程之 Google 相簿完整相簿（原始高畫質）' : 'Open Google Photos full album'}
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span className="whitespace-nowrap">Google 相簿</span>
              </a>
            )}

            {viewMode === 'polaroid' && (
              <button
                type="button"
                onClick={handlePrintPolaroids}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
                title="以 A4 或相片紙沖印拍立得卡片"
              >
                <Printer className="w-3.5 h-3.5" />
                <span className="whitespace-nowrap">列印拍立得</span>
              </button>
            )}

            {canShowUploadAction && (
              <button
                type="button"
                onClick={() => handleTriggerUpload('', true)}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="whitespace-nowrap">{lang === 'zh' ? '上傳相片' : 'Add Photo'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Optional World Footprint Coordinate Hint for Memory Trips missing GPS */}
        {trip.tripMode === 'memory' &&
          typeof trip.destinationLat !== 'number' &&
          !allMemories.some((m) => typeof m.lat === 'number' && typeof m.lng === 'number') && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <MapPin className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
                <span>
                  {lang === 'zh'
                    ? '這趟回憶旅程尚未紀錄 GPS 座標，補上城市位置即可點亮足跡地圖。'
                    : 'Add city coordinates to light up this trip on the World Footprint Map.'}
                </span>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={handleQuickLocateCity}
                  disabled={isLocatingCity}
                  className="min-h-[34px] px-3 py-1 rounded-xl bg-white dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700 hover:border-teal-600 text-teal-700 dark:text-teal-300 font-bold text-[11px] flex items-center gap-1.5 shrink-0 self-start sm:self-auto transition cursor-pointer disabled:opacity-50"
                >
                  {isLocatingCity ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <MapPin className="w-3.5 h-3.5" />
                  )}
                  <span>{isLocatingCity ? '定位中...' : `一鍵定位「${trip.destination || trip.title}」`}</span>
                </button>
              )}
            </div>
          )}

        {/* Middle Row: View Mode Switcher */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-800 rounded-2xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => setViewMode('itinerary')}
            className={`min-h-[38px] py-2 px-1.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer min-w-0 ${
              viewMode === 'itinerary'
                ? 'bg-white dark:bg-[#111827] text-teal-700 dark:text-teal-300 font-bold shadow-2xs border border-[#E5E2DC]/80 dark:border-slate-700'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Route className="w-3.5 h-3.5 shrink-0" />
            <span className="whitespace-nowrap truncate">
              {lang === 'zh'
                ? trip.tripMode === 'memory' && allSpots.length === 0
                  ? '按日整理'
                  : '景點打卡'
                : 'Itinerary'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('gallery')}
            className={`min-h-[38px] py-2 px-1.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer min-w-0 ${
              viewMode === 'gallery'
                ? 'bg-white dark:bg-[#111827] text-teal-700 dark:text-teal-300 font-bold shadow-2xs border border-[#E5E2DC]/80 dark:border-slate-700'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="whitespace-nowrap truncate">{lang === 'zh' ? '相片畫廊' : 'Gallery'}</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('polaroid')}
            className={`min-h-[38px] py-2 px-1.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer min-w-0 ${
              viewMode === 'polaroid'
                ? 'bg-white dark:bg-[#111827] text-teal-700 dark:text-teal-300 font-bold shadow-2xs border border-[#E5E2DC]/80 dark:border-slate-700'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0 text-teal-700 dark:text-teal-400" />
            <span className="whitespace-nowrap truncate">{lang === 'zh' ? '拍立得' : 'Polaroid'}</span>
          </button>
        </div>

        {/* Bottom Row: Day Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 no-scrollbar scroll-smooth">
          <span className="text-[11px] font-bold text-slate-400 shrink-0 pr-1">天數</span>
          <button
            type="button"
            onClick={() => setSelectedDayFilter('all')}
            className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-bold font-mono tabular-nums transition shrink-0 cursor-pointer ${
              selectedDayFilter === 'all'
                ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-2xs'
                : 'bg-[#FAF9F6] dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-[#E5E2DC] dark:border-slate-700 hover:bg-slate-100'
            }`}
          >
            全部 ({allMemories.length})
          </button>
          {unassignedMemories.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedDayFilter('custom')}
              className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-bold font-mono tabular-nums transition shrink-0 cursor-pointer ${
                selectedDayFilter === 'custom'
                  ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-2xs'
                  : 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200/70 dark:border-teal-800/60 hover:bg-teal-100'
              }`}
            >
              ✨ 漫遊隨拍 ({unassignedMemories.length})
            </button>
          )}
          {trip.days.map((day) => {
            const countInDay = allMemories.filter((m) => m.dayNumber === day.dayNumber).length;
            return (
              <button
                key={day.dayNumber}
                type="button"
                onClick={() => setSelectedDayFilter(day.dayNumber)}
                className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-bold font-mono tabular-nums transition shrink-0 cursor-pointer ${
                  selectedDayFilter === day.dayNumber
                    ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-2xs'
                    : 'bg-[#FAF9F6] dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-[#E5E2DC] dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                Day {day.dayNumber} ({countInDay})
              </button>
            );
          })}
        </div>
      </div>

      {/* Global Cloud/Local Save Toast */}
      {saveSuccessToast && (
        <div className="p-3 rounded-2xl bg-teal-700 text-white font-bold text-xs flex items-center justify-between gap-2 shadow-lg animate-in fade-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveSuccessToast(false)}
            className="text-teal-200 hover:text-white p-1 rounded-lg"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Main Content Views */}
      {viewMode === 'itinerary' ? (
        /* ================= 2A. ITINERARY SPOTS CHECK-IN & RETROSPECTIVE VIEW ================= */
        <div className="space-y-6">

      {/* Compact Spots Check-in Progress & Filter Bar */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Route className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                <span>景點記錄進度</span>
              </span>
              <span className="font-mono tabular-nums text-xs text-teal-700 dark:text-teal-400 font-bold">
                {visitedSpotsCount} / {allSpots.length} 景點 ({allSpots.length > 0 ? Math.round((visitedSpotsCount / allSpots.length) * 100) : 0}%)
              </span>
            </div>
            <div className="w-full bg-[#FAF9F6] dark:bg-slate-800 border border-[#E5E2DC]/60 dark:border-slate-700/50 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-teal-700 dark:bg-teal-500 h-full rounded-full transition-all duration-500"
                style={{
                  width: `${allSpots.length > 0 ? Math.round((visitedSpotsCount / allSpots.length) * 100) : 0}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <div className="flex items-center p-0.5 bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-800 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setFilterVisitedOnly(true)}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 text-[11px] font-mono tabular-nums ${
                    filterVisitedOnly
                      ? 'bg-white dark:bg-[#111827] text-teal-700 dark:text-teal-300 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="僅呈現有照片或已造訪景點"
                >
                  <Check className="w-3 h-3 stroke-[2.5]" />
                  <span>已打卡 ({visitedSpotsCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterVisitedOnly(false)}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 text-[11px] font-mono tabular-nums ${
                    !filterVisitedOnly
                      ? 'bg-white dark:bg-[#111827] text-teal-700 dark:text-teal-300 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="顯示全部景點"
                >
                  <span>全部 ({allSpots.length})</span>
                </button>
              </div>

              {canShowUploadAction && (
                <button
                  type="button"
                  onClick={() => handleTriggerUpload('', true)}
                  className="text-teal-700 dark:text-teal-400 font-bold hover:underline text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>新增隨拍</span>
                </button>
              )}
            </div>
          </div>

          {/* Unassigned / All-trip Custom Snapshots (自由漫遊隨拍) */}
          {unassignedMemories.length > 0 && (
            <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#E5E2DC] dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center font-bold text-sm">
                    ✨
                  </span>
                  <div>
                    <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>漫遊隨拍</span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
                      <span className="text-xs font-mono tabular-nums text-teal-700 dark:text-teal-400 font-bold">
                        {unassignedMemories.length} 張
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      自由探索剪影與隨手記錄
                    </p>
                  </div>
                </div>
                {canShowUploadAction && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomDayNumber('all');
                      handleTriggerUpload('', true);
                    }}
                    className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新增隨拍</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {unassignedMemories.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-3 shadow-2xs group"
                  >
                    <div className="relative shrink-0">
                      <MediaImage
                        tripId={trip.id}
                        ownerId={trip.ownerId}
                        collabId={trip.collabId}
                        src={m.imageUrl}
                        alt={m.caption}
                        className="w-16 h-16 rounded-xl object-cover cursor-pointer transition-transform group-hover:scale-105"
                        onClick={() => setLightboxMemory(m)}
                      />
                      <div className="absolute top-1 right-1 z-10 scale-75 origin-top-right">
                        {renderSyncBadge(m)}
                      </div>
                    </div>
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
                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                        <span>漫遊隨拍</span>
                        {canShowUploadAction && (confirmDeleteMemId === m.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDeleteMemory(m.id)}
                              className="px-2 py-1 rounded-lg bg-rose-600 text-white font-bold text-[10px] cursor-pointer"
                            >
                              確認刪除
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteMemId(null)}
                              className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] cursor-pointer"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteMemId(m.id)}
                            className="px-2 py-1 rounded-lg text-slate-400 hover:text-rose-600 transition cursor-pointer"
                          >
                            刪除
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                  {canShowUploadAction && (
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
                  )}
                </div>

                {/* Day Spots Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {daySpots.map((spot) => {
                    const spotMems = allMemories.filter((m) => m.spotId === spot.id);
                    const hasPhotos = spotMems.length > 0;
                    const isVisited = spot.completed || hasPhotos || !!spot.googlePhotosUrl;

                    if (filterVisitedOnly && !isVisited) {
                      return null;
                    }

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
                            <MediaImage
                              tripId={trip.id}
                              ownerId={trip.ownerId}
                              collabId={trip.collabId}
                              src={firstPhoto.imageUrl}
                              alt={spot.title}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleSpotCompleted(spot.id, e);
                                  }}
                                  className={`p-1.5 rounded-full backdrop-blur-md transition cursor-pointer ${
                                    spot.completed
                                      ? 'bg-emerald-600/90 text-white'
                                      : 'bg-black/50 text-white/80 hover:bg-black/70'
                                  }`}
                                  title={spot.completed ? '已造訪' : '標記造訪'}
                                >
                                  <Check className="w-3 h-3 stroke-[3]" />
                                </button>
                              )}
                            </div>
                            {/* Sync Status Badge (Click to force sync) */}
                            <div className="absolute top-2.5 right-2.5 z-10">
                              {renderSyncBadge(firstPhoto)}
                            </div>
                            <div className="absolute bottom-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition p-1.5 rounded-xl bg-slate-900/70 text-white">
                              <ZoomIn className="w-3.5 h-3.5" />
                            </div>
                          </div>

                          {/* Multiple photos thumbnail strip */}
                          {spotMems.length > 1 && (
                            <div className="px-3.5 pt-2.5 space-y-2">
                              <div className="flex items-center gap-2">
                                {spotMems.slice(0, 3).map((pm) => (
                                  <div
                                    key={pm.id}
                                    className="relative w-12 h-12 rounded-xl overflow-hidden border-2 border-slate-200 dark:border-slate-700 hover:border-teal-500 cursor-pointer group/thumb shrink-0 transition"
                                    onClick={() => setLightboxMemory(pm)}
                                    title="放大相片"
                                  >
                                    <MediaImage
                                      tripId={trip.id}
                                      ownerId={trip.ownerId}
                                      collabId={trip.collabId}
                                      src={pm.imageUrl}
                                      alt=""
                                      className="w-full h-full object-cover group-hover/thumb:scale-110 transition"
                                    />
                                    <div className="absolute top-0.5 left-0.5 z-10 scale-75 origin-top-left">
                                      {renderSyncBadge(pm)}
                                    </div>
                                    {canShowUploadAction && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setConfirmDeleteMemId(pm.id);
                                        }}
                                        className="absolute top-0.5 right-0.5 w-8 h-8 sm:w-6 sm:h-6 rounded bg-black/70 hover:bg-rose-600 text-white flex items-center justify-center transition opacity-90 sm:opacity-0 sm:group-hover/thumb:opacity-100 z-10 cursor-pointer"
                                        title="刪除"
                                      >
                                        <Trash2 className="w-3 h-3 text-rose-300 hover:text-white" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                                {spotMems.length > 3 && (
                                  <button
                                    type="button"
                                    onClick={() => setLightboxMemory(spotMems[3])}
                                    className="w-12 h-12 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-800 hover:border-teal-500 text-teal-700 dark:text-teal-300 font-mono font-bold text-xs flex items-center justify-center shrink-0 transition cursor-pointer"
                                    title={`查看全部 ${spotMems.length} 張相片`}
                                  >
                                    +{spotMems.length - 3}
                                  </button>
                                )}
                              </div>
                              {spotMems.some((pm) => pm.id === confirmDeleteMemId) && (
                                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 text-[11px]">
                                  <span className="font-semibold text-rose-700 dark:text-rose-300">刪除此相片？</span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => confirmDeleteMemId && handleDeleteMemory(confirmDeleteMemId)}
                                      className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold cursor-pointer"
                                    >
                                      確認刪除
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteMemId(null)}
                                      className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer"
                                    >
                                      取消
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

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
                              <div className="flex items-center gap-2">
                                {canShowUploadAction ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setUploadSpotId(spot.id);
                                      setIsCustomSpot(false);
                                      setUploadGooglePhotosUrl(spot.googlePhotosUrl || firstPhoto.googlePhotosUrl || '');
                                      setShowUploadModal(true);
                                    }}
                                    className="text-teal-600 dark:text-teal-400 font-bold hover:underline flex items-center gap-1"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>管理相片</span>
                                  </button>
                                ) : (
                                  <span className="text-slate-400 text-[10px]">相簿</span>
                                )}
                                {sanitizeExternalUrl(spot.googlePhotosUrl || firstPhoto.googlePhotosUrl) && (
                                  <a
                                    href={sanitizeExternalUrl(spot.googlePhotosUrl || firstPhoto.googlePhotosUrl)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-teal-600 dark:text-teal-400 hover:text-teal-700 font-bold hover:underline flex items-center gap-1 text-[10px] bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded-md border border-teal-200/50 dark:border-teal-800/50"
                                    title="開啟 Google 相簿原圖"
                                  >
                                    <ExternalLink className="w-2.5 h-2.5" />
                                    <span>原圖</span>
                                  </a>
                                )}
                              </div>
                              {canShowUploadAction && (
                                confirmDeleteMemId === firstPhoto.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteMemory(firstPhoto.id)}
                                      className="px-2 py-1 rounded-lg bg-rose-600 text-white font-bold text-[10px] cursor-pointer"
                                    >
                                      確認刪除
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteMemId(null)}
                                      className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] cursor-pointer"
                                    >
                                      取消
                                    </button>
                                  </div>
                                ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteMemId(firstPhoto.id)}
                                      className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                                      title="刪除主照"
                                    >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Spot with NO photos yet
                    if (spot.completed) {
                      // Visited spot without photos
                      return (
                        <div
                          key={spot.id}
                          onClick={() => {
                            if (canShowUploadAction) {
                              setUploadSpotId(spot.id);
                              setIsCustomSpot(false);
                              setUploadGooglePhotosUrl(spot.googlePhotosUrl || '');
                              setShowUploadModal(true);
                            }
                          }}
                          className={`rounded-3xl border border-emerald-300/80 dark:border-emerald-800/70 p-4 transition flex flex-col justify-between min-h-[130px] group bg-emerald-50/25 dark:bg-emerald-950/20 shadow-2xs ${
                            canShowUploadAction ? 'hover:border-emerald-500 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/30 cursor-pointer' : ''
                          }`}
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">{spot.startTime || '行程安排'}</span>
                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={(e) => handleToggleSpotCompleted(spot.id, e)}
                                  className="p-1 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition cursor-pointer"
                                  title="已造訪（點擊切換）"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                              ) : (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                              )}
                            </div>
                            <h5 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
                              {spot.title}
                            </h5>
                            {spot.locationName && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                📍 {spot.locationName}
                              </p>
                            )}
                          </div>
                          {canShowUploadAction && (
                            <div className="pt-3 border-t border-emerald-100 dark:border-emerald-900/60 flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400 font-bold">
                              <span className="flex items-center gap-1 text-[11px]">
                                <Camera className="w-3.5 h-3.5" />
                                <span>補登照片</span>
                              </span>
                              <span className="text-base group-hover:translate-x-0.5 transition">＋</span>
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Uncompleted spot (only shown when filterVisitedOnly is false)
                    return (
                      <div
                        key={spot.id}
                        className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-4 transition flex flex-col justify-between min-h-[130px] group bg-white/40 dark:bg-slate-900/40 opacity-75 hover:opacity-100"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span className="font-mono text-[10px]">{spot.startTime || '行程安排'}</span>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={(e) => handleToggleSpotCompleted(spot.id, e)}
                                className="p-1 rounded-lg text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                title="標記造訪"
                              >
                                <Circle className="w-4 h-4 stroke-[1.5]" />
                              </button>
                            )}
                          </div>
                          <h5 className="font-bold text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                            {spot.title}
                          </h5>
                          {spot.locationName && (
                            <p className="text-[11px] text-slate-400 truncate">
                              📍 {spot.locationName}
                            </p>
                          )}
                        </div>
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={(e) => handleToggleSpotCompleted(spot.id, e)}
                              className="text-xs font-semibold text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1 transition"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>造訪</span>
                            </button>
                          )}
                          {canShowUploadAction && (
                            <button
                              type="button"
                              onClick={() => {
                                setUploadSpotId(spot.id);
                                setIsCustomSpot(false);
                                setUploadGooglePhotosUrl(spot.googlePhotosUrl || '');
                                setShowUploadModal(true);
                              }}
                              className="text-teal-600 dark:text-teal-400 hover:text-teal-700 font-bold flex items-center gap-1 text-[11px]"
                            >
                              <Camera className="w-3 h-3" />
                              <span>拍照上傳</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {filterVisitedOnly &&
                    daySpots.filter((s) => s.completed || allMemories.some((m) => m.spotId === s.id) || !!s.googlePhotosUrl).length === 0 &&
                    customDayMemories.length === 0 && (
                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-center col-span-full">
                        <p className="text-xs text-slate-400">
                          尚無已造訪景點
                        </p>
                      </div>
                    )}
                </div>

                {/* Custom Day Memories */}
                {customDayMemories.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[11px] font-bold text-slate-400 block mb-2">
                      ✨ Day {day.dayNumber} 自由隨拍：
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {customDayMemories.map((m) => (
                        <div
                          key={m.id}
                          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center gap-3 shadow-2xs group"
                        >
                          <MediaImage
                            tripId={trip.id}
                            ownerId={trip.ownerId}
                            collabId={trip.collabId}
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
                              {canShowUploadAction && (confirmDeleteMemId === m.id ? (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMemory(m.id)}
                                    className="px-2 py-1 rounded-lg bg-rose-600 text-white font-bold text-[10px] cursor-pointer"
                                  >
                                    確認刪除
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteMemId(null)}
                                    className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] cursor-pointer"
                                  >
                                    取消
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteMemId(m.id)}
                                  className="px-2 py-1 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                                >
                                  刪除
                                </button>
                              ))}
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
        <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center mx-auto">
            <Camera className="w-8 h-8" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h4 className="font-bold text-base text-slate-800 dark:text-slate-200">
              {lang === 'zh' ? '尚未新增照片' : 'No photos added yet'}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {lang === 'zh'
                ? '上傳景點隨拍與心得，自動排版為相簿或拍立得。'
                : 'Upload travel photos and captions to create a beautiful memory album and printable Polaroid cards.'}
            </p>
          </div>
          {canShowUploadAction && (
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-sm transition active:scale-95 cursor-pointer"
            >
              📸 上傳照片
            </button>
          )}
        </div>
      ) : viewMode === 'gallery' ? (
        /* ================= 2A. EXQUISITE STORY GALLERY VIEW ================= */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMemories.map((mem) => (
            <div
              key={mem.id}
              className="group rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 overflow-hidden shadow-2xs hover:shadow-lg transition flex flex-col"
            >
              {/* Image Container with Hover Zoom */}
              <div
                className="relative aspect-4/3 bg-slate-100 dark:bg-slate-800 overflow-hidden cursor-pointer"
                onClick={() => setLightboxMemory(mem)}
              >
                <MediaImage
                  tripId={trip.id}
                  ownerId={trip.ownerId}
                  collabId={trip.collabId}
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

                {/* Sync Status Badge (Click to force sync) */}
                <div className="absolute top-3 right-3 z-10">
                  {renderSyncBadge(mem)}
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

                  <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed italic py-0.5">
                    「{mem.caption}」
                  </p>
                </div>

                {/* Card Action footer */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span className="text-[10px]">回憶相簿</span>
                  {canShowUploadAction && (confirmDeleteMemId === mem.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDeleteMemory(mem.id)}
                        className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold text-[11px] cursor-pointer"
                      >
                        確認刪除
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteMemId(null)}
                        className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] cursor-pointer"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteMemId(mem.id)}
                      className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                      title="刪除此照片"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ================= 2B. AUTHENTIC POLAROID STUDIO PRINT MODE ================= */
        <div id="polaroid-print-area">
          {/* Print Notice (Screen only) */}
          <div className="no-print p-4 rounded-2xl bg-[#FAF9F6] dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-2.5">
              <Printer className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
              <div>
                <p className="font-bold">拍立得沖印模式</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  支援 A4、4×6 相片紙直接列印。
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handlePrintPolaroids}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shrink-0 shadow-xs cursor-pointer"
            >
              列印
            </button>
          </div>

          {/* Polaroid Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 sm:gap-8 justify-items-center">
            {filteredMemories.map((mem, index) => (
              <div
                key={mem.id}
                className="polaroid-card w-full max-w-[290px] bg-[#fbfaf5] dark:bg-[#111827] p-3.5 pb-8 rounded-xs shadow-xl border border-[#E5E2DC] dark:border-slate-800 transition-transform duration-300 hover:scale-[1.02] flex flex-col relative group"
                style={{
                  transform: `rotate(${(index % 3 - 1) * 0.8}deg)`,
                }}
              >
                {/* Washi Tape / Retro Clip effect at top */}
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-16 h-5 bg-[#EAE6DC]/90 dark:bg-slate-700/80 border border-[#D8D3C6] dark:border-slate-600 backdrop-blur-xs rounded-xs shadow-2xs rotate-[-1deg] no-print" />

                {/* Photo Window (Square with film border effect) */}
                <div className="relative aspect-square w-full bg-slate-900 overflow-hidden rounded-xs border border-slate-300/40 dark:border-slate-800 shadow-inner">
                  <MediaImage
                    tripId={trip.id}
                    ownerId={trip.ownerId}
                    collabId={trip.collabId}
                    src={mem.imageUrl}
                    alt={mem.caption}
                    className="w-full h-full object-cover filter contrast-[1.04] saturate-[1.05]"
                  />

                  {/* Sync Status Badge (Click to force sync) */}
                  <div className="absolute top-2 left-2 z-10">
                    {renderSyncBadge(mem)}
                  </div>

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

                {/* Floating delete button / inline confirm (screen only) */}
                {canShowUploadAction && (confirmDeleteMemId === mem.id ? (
                  <div className="no-print absolute inset-x-3 bottom-2 z-20 flex items-center justify-center gap-2 p-2 rounded-xl bg-slate-900/95 text-white shadow-lg">
                    <span className="text-[11px] font-bold">刪除此拍立得？</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteMemory(mem.id)}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] cursor-pointer"
                    >
                      刪除
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteMemId(null)}
                      className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-[11px] cursor-pointer"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteMemId(mem.id)}
                    className="no-print absolute top-2 right-2 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center rounded-full bg-slate-900/70 text-white hover:bg-rose-600 transition shadow-md cursor-pointer"
                    title="刪除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= 3. UPLOAD MEMORY PHOTO MODAL ================= */}
      {showUploadModal && canShowUploadAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-3 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => closeUploadModalAndCleanup()}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-[#111827] rounded-3xl shadow-2xl border border-[#E5E2DC] dark:border-slate-800 overflow-hidden flex flex-col max-h-full sm:max-h-[92dvh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[#E5E2DC] dark:border-slate-800 flex items-center justify-between shrink-0 bg-[#FAF9F6] dark:bg-slate-900/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                    {lang === 'zh' ? '新增回憶照片' : 'Add Memory Photo'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'zh' ? '關聯行程景點與心得隨筆' : 'Link to itinerary spot & add notes'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => closeUploadModalAndCleanup()}
                className="w-11 h-11 sm:w-10 sm:h-10 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveMemory} className="p-5 space-y-4 overflow-y-auto text-xs">
              {/* Cloud Connection & Auth Status Banner */}
              {!currentUser ? (
                <div className="px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-slate-900/60 border border-[#E5E2DC] dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300 flex items-center justify-between gap-2">
                  <span className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
                    <span>本機模式 · 登入以啟用雲端備份</span>
                  </span>
                  <button
                    type="button"
                    onClick={loginWithGoogle}
                    className="min-h-[32px] px-3 py-1 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-[11px] shrink-0 transition cursor-pointer active:scale-95"
                  >
                    登入 Google
                  </button>
                </div>
              ) : (
                <div className="px-3 py-2 rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/60 dark:border-teal-800/60 text-[11px] text-teal-800 dark:text-teal-300 font-semibold flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 truncate">
                    <Cloud className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
                    <span className="truncate">已連線雲端同步 ({currentUser.email || '已登入'})</span>
                  </span>
                </div>
              )}

              {/* Google Drive Original Resolution Storage Status */}
              <div className="flex items-center justify-between gap-2 px-1 text-[11px]">
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 min-w-0">
                  <HardDrive className={`w-3.5 h-3.5 shrink-0 ${driveConnected ? 'text-teal-700 dark:text-teal-400' : 'text-slate-400'}`} />
                  <span className="truncate">
                    {driveConnected
                      ? 'Drive 原圖已連線 · 上傳將保留未壓縮原始畫質'
                      : '授權 Google Drive 可免費儲存 400GB 空間原始畫質照片'}
                  </span>
                </div>
                {!driveConnected && (
                  <button
                    type="button"
                    disabled={isConnectingDrive}
                    onClick={async () => {
                      setIsConnectingDrive(true);
                      try {
                        const token = await connectGoogleDrive();
                        const ok = Boolean(token) || hasDriveAccessToken();
                        setDriveConnected(ok);
                        if (!ok) {
                          setUploadLimitWarning('Google Drive 授權未完成或被瀏覽器阻擋，若跳過授權仍可先以 1440px 高清縮圖儲存在本機與雲端。');
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

              {/* Photo Upload Area */}
              <div>
                {/* Existing Spot Photos Management (if spot already has photos) */}
                {!isCustomSpot && uploadSpotId && (() => {
                  const currentSpot = allSpots.find((s) => s.spot.id === uploadSpotId)?.spot;
                  const existingPhotos = currentSpot?.memoryPhotos || [];
                  if (existingPhotos.length === 0) return null;
                  return (
                    <div className="mb-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          已儲存照片 ({existingPhotos.length})
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {existingPhotos.map((photoUrl, pIdx) => {
                          const isConfirming =
                            confirmDeleteSpotPhoto?.spotId === uploadSpotId &&
                            confirmDeleteSpotPhoto?.photoUrl === photoUrl;
                          return (
                            <div key={pIdx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 group">
                              <MediaImage tripId={trip.id} ownerId={trip.ownerId} collabId={trip.collabId} src={photoUrl} alt="" className="w-full h-full object-cover" />
                              {isConfirming ? (
                                <div className="absolute inset-0 bg-slate-900/85 flex flex-col items-center justify-center gap-1.5 p-1.5 z-20">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteExistingSpotPhoto(uploadSpotId, photoUrl)}
                                    className="w-full py-1 rounded-lg bg-rose-600 text-white font-bold text-[10px] cursor-pointer"
                                  >
                                    確認移除
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteSpotPhoto(null)}
                                    className="w-full py-1 rounded-lg bg-slate-700 text-slate-200 text-[10px] cursor-pointer"
                                  >
                                    取消
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteSpotPhoto({ spotId: uploadSpotId, photoUrl })}
                                  className="absolute top-1 right-1 w-8 h-8 rounded-lg bg-black/70 hover:bg-rose-600 text-white flex items-center justify-center transition z-10 cursor-pointer"
                                  title="移除此照片"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-300 hover:text-white" />
                                </button>
                              )}
                              <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/70 text-[9px] text-white font-mono">
                                #{pIdx + 1}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    選擇欲上傳的照片
                  </label>
                </div>

                <input
                  type="file"
                  accept="image/*"
                  multiple
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />

                {/* Limit Warning Alert */}
                {uploadLimitWarning && (
                  <div className="mb-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200 text-[11px] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{uploadLimitWarning}</span>
                  </div>
                )}

                {/* Previews Grid or Upload Dropzone */}
                {uploadImagePreviews.length > 0 ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-0.5">
                      {uploadImagePreviews.map((preview, idx) => (
                        <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border-2 border-teal-500 shadow-xs group">
                          <MediaImage
                            tripId={trip.id}
                            ownerId={trip.ownerId}
                            collabId={trip.collabId}
                            src={preview.mediaRef}
                            alt={`預覽 ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-teal-700/90 text-[9px] text-white font-bold font-mono tabular-nums">
                            #{idx + 1}
                          </span>
                          {(preview.hasGps || preview.hasExifDate) && (
                            <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md bg-slate-900/75 text-[9px] text-white font-mono tabular-nums flex items-center gap-1 backdrop-blur-xs">
                              {preview.hasGps && <MapPin className="w-2.5 h-2.5 text-teal-300 shrink-0" />}
                              <span>{preview.takenDate.slice(5)}</span>
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemovePreview(idx)}
                            className="absolute top-1 right-1 w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-slate-900/80 text-white hover:bg-rose-600 transition shadow-sm cursor-pointer"
                            title="移除此張"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}

                      {/* Add more button if under limit (24 for custom/memory, 3 for specific spot) */}
                      {(() => {
                        const curSpot = !isCustomSpot && uploadSpotId ? allSpots.find((s) => s.spot.id === uploadSpotId)?.spot : null;
                        const existingCount = curSpot?.memoryPhotos?.length || 0;
                        const cap = isCustomSpot ? 24 : 3;
                        const total = (isCustomSpot ? 0 : existingCount) + uploadImagePreviews.length;
                        if (total < cap) {
                          return (
                            <div
                              onClick={() => !isProcessingImage && fileInputRef.current?.click()}
                              className="aspect-square rounded-2xl border-2 border-dashed border-teal-300 dark:border-teal-700 hover:border-teal-500 bg-teal-50/50 dark:bg-teal-950/30 flex flex-col items-center justify-center p-2 text-center cursor-pointer transition hover:bg-teal-50"
                            >
                              {isProcessingImage && uploadBatchProgress ? (
                                <>
                                  <Loader2 className="w-5 h-5 text-teal-600 animate-spin mb-1" />
                                  <span className="text-[10px] font-bold font-mono tabular-nums text-teal-700 dark:text-teal-300">
                                    {uploadBatchProgress.done}/{uploadBatchProgress.total}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-5 h-5 text-teal-600 mb-1" />
                                  <span className="text-[10px] font-bold text-teal-700 dark:text-teal-300">
                                    ＋加照片
                                  </span>
                                </>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={(() => {
                          if (isProcessingImage) return true;
                          const curSpot = !isCustomSpot && uploadSpotId ? allSpots.find((s) => s.spot.id === uploadSpotId)?.spot : null;
                          const existingCount = curSpot?.memoryPhotos?.length || 0;
                          const cap = isCustomSpot ? 24 : 3;
                          return (isCustomSpot ? 0 : existingCount) + uploadImagePreviews.length >= cap;
                        })()}
                        className="text-teal-700 dark:text-teal-400 font-bold hover:underline disabled:opacity-40 disabled:hover:no-underline cursor-pointer"
                      >
                        {isProcessingImage && uploadBatchProgress
                          ? `正在讀取拍攝日期與 GPS (${uploadBatchProgress.done}/${uploadBatchProgress.total})...`
                          : `＋ 挑選更多照片 (${uploadImagePreviews.length}/${isCustomSpot ? 24 : 3})`}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadImagePreviews((prev) => {
                            prev.forEach((p) => {
                              if (p.mediaRef && isMediaRef(p.mediaRef)) {
                                idbDeleteMedia(extractMediaId(p.mediaRef)).catch(() => {});
                              }
                            });
                            return [];
                          });
                          setUploadLimitWarning(null);
                        }}
                        className="text-rose-600 hover:underline cursor-pointer"
                      >
                        清空已選
                      </button>
                    </div>
                  </div>
                ) : (
                  (() => {
                    const curSpot = !isCustomSpot && uploadSpotId ? allSpots.find((s) => s.spot.id === uploadSpotId)?.spot : null;
                    const existingCount = curSpot?.memoryPhotos?.length || 0;
                    if (!isCustomSpot && uploadSpotId && existingCount >= 3) {
                      return (
                        <div className="p-4 rounded-2xl border-2 border-dashed border-teal-300 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/20 text-center space-y-1">
                          <p className="font-bold text-teal-800 dark:text-teal-200 text-xs flex items-center justify-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-teal-600" />
                            <span>景點照片已達 3 張上限</span>
                          </p>
                          <p className="text-[11px] text-slate-500">
                            您仍可在下方更新隨筆心得，或貼上 Google 相簿 4K 原圖連結並直接儲存！
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div
                        onClick={() => !isProcessingImage && fileInputRef.current?.click()}
                        className="aspect-16/9 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 bg-slate-50 dark:bg-slate-800/40 flex flex-col items-center justify-center p-5 text-center cursor-pointer transition hover:bg-teal-50/20"
                      >
                        <div className="w-10 h-10 rounded-2xl bg-teal-100 dark:bg-teal-950 text-teal-600 flex items-center justify-center mb-1.5">
                          {isProcessingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                        </div>
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          {isProcessingImage && uploadBatchProgress
                            ? `正在處理與讀取 EXIF (${uploadBatchProgress.done}/${uploadBatchProgress.total})...`
                            : isProcessingImage
                            ? '照片處理中...'
                            : isCustomSpot
                            ? '點擊批次選擇相片（一次最多 24 張，自動讀日期與 GPS）'
                            : '點擊選擇相片（支援多選）'}
                        </p>
                      </div>
                    );
                  })()
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
                    <Route className="w-3.5 h-3.5" />
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
                      className={`p-1.5 rounded-xl text-center border transition cursor-pointer ${
                        uploadMood === m.icon
                          ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/60 font-bold text-teal-800 dark:text-teal-200'
                          : 'border-[#E5E2DC] dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
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
                  心得隨筆
                </label>
                <textarea
                  rows={2}
                  value={uploadCaption}
                  onChange={(e) => setUploadCaption(e.target.value)}
                  placeholder="寫下當時心情或紀錄..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>

              {/* Google Photos Original Resolution Link */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700 dark:text-slate-300">
                    Google 相簿連結（選填）
                  </label>
                  {sanitizeExternalUrl(uploadGooglePhotosUrl) && (
                    <a
                      href={sanitizeExternalUrl(uploadGooglePhotosUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <span>開啟測試</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
                <input
                  type="url"
                  value={uploadGooglePhotosUrl}
                  onChange={(e) => setUploadGooglePhotosUrl(e.target.value)}
                  placeholder="https://photos.app.goo.gl/..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-400"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => closeUploadModalAndCleanup()}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={
                    (uploadImagePreviews.length === 0 && !sanitizeExternalUrl(uploadGooglePhotosUrl) && !uploadCaption.trim()) ||
                    isProcessingImage ||
                    isSavingMemory
                  }
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold shadow-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  {isSavingMemory ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span className="font-mono tabular-nums">
                        {driveUploadProgress
                          ? `備份原圖至 Drive (${driveUploadProgress.done}/${driveUploadProgress.total})...`
                          : '儲存中...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>
                        {uploadImagePreviews.length > 0 ? '儲存相片' : '儲存連結'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= 4. FULLSCREEN LIGHTBOX PREVIEW ================= */}
      {lightboxMemory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-2 sm:p-6 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] bg-black/95 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => setLightboxMemory(null)}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <div
            className="max-w-4xl w-full bg-[#111827] rounded-3xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col max-h-full sm:max-h-[95dvh] relative"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleLightboxTouchStart}
            onTouchEnd={handleLightboxTouchEnd}
          >
            {/* Top Close Button & Action Bar */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
              {renderSyncBadge(lightboxMemory)}

              {canShowUploadAction && (
                <button
                  type="button"
                  onClick={() => setIsEditingLightboxUrl(!isEditingLightboxUrl)}
                  className="min-h-[40px] px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/90 text-teal-300 hover:text-white text-xs font-semibold transition flex items-center gap-1.5 border border-white/20 shadow-sm cursor-pointer"
                  title="編輯此照片的 Google 相簿連結"
                >
                  <Edit2 className="w-3 h-3" />
                  <span className="hidden sm:inline">{isEditingLightboxUrl ? '收合編輯' : '修改原圖連結'}</span>
                </button>
              )}
              {sanitizeExternalUrl(lightboxMemory.googlePhotosUrl || trip.googlePhotosAlbumUrl) && (
                <a
                  href={sanitizeExternalUrl(lightboxMemory.googlePhotosUrl || trip.googlePhotosAlbumUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] px-3 py-1.5 rounded-full bg-black/75 hover:bg-teal-700 text-white text-xs font-bold transition flex items-center gap-1.5 border border-white/20 shadow-md backdrop-blur-md active:scale-95"
                  title="開啟 Google 相簿檢視 4K / 原始超高畫質相片"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-teal-300" />
                  <span className="hidden sm:inline">開啟 Google 相簿原圖</span>
                  <span className="sm:hidden">原圖</span>
                </a>
              )}
              {canShowUploadAction && (
                confirmDeleteMemId === lightboxMemory.id ? (
                  <div className="flex items-center gap-1.5 bg-black/80 px-2 py-1 rounded-full border border-rose-500/40">
                    <button
                      type="button"
                      onClick={() => handleDeleteMemory(lightboxMemory.id)}
                      className="min-h-[32px] px-2.5 py-1 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
                    >
                      確認刪除
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteMemId(null)}
                      className="min-h-[32px] px-2.5 py-1 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs cursor-pointer"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteMemId(lightboxMemory.id)}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-black/60 text-rose-300 hover:bg-rose-600 hover:text-white transition shadow-sm cursor-pointer"
                    title="刪除此相片"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => {
                  setLightboxMemory(null);
                  setConfirmDeleteMemId(null);
                }}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/90 transition shadow-sm cursor-pointer"
                title="關閉"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Inline Edit Bar for Google Photos URL */}
            {isEditingLightboxUrl && (
              <div className="p-3 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 z-20 mt-14">
                <input
                  type="url"
                  value={lightboxEditUrl}
                  onChange={(e) => setLightboxEditUrl(e.target.value)}
                  placeholder="貼上 Google 相簿分享或原始照片連結 (如 https://photos.app.goo.gl/...)"
                  className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-500"
                />
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleSaveLightboxGoogleUrl}
                    className="min-h-[40px] px-4 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-600 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>儲存連結</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingLightboxUrl(false)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* Main Image Area with Prev/Next Controls */}
            <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[300px] select-none">
              {/* Prev Button */}
              {lightboxPlaylist.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrevLightbox();
                  }}
                  className="absolute left-2 sm:left-4 z-10 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition active:scale-90 border border-white/10"
                  title="上一張"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              {/* Display Drive Original -> Google Photos URL -> 1440px HD Thumbnail */}
              {driveOriginalUrl ? (
                <div className="relative flex items-center justify-center max-h-[65vh]">
                  <MediaImage
                    tripId={trip.id}
                    ownerId={trip.ownerId}
                    collabId={trip.collabId}
                    src={driveOriginalUrl}
                    alt={lightboxMemory.caption}
                    className="max-h-[65vh] w-auto max-w-full object-contain pointer-events-none"
                  />
                </div>
              ) : sanitizeExternalUrl(lightboxMemory.googlePhotosUrl) && !lightboxHighResFailed ? (
                <div className="relative flex items-center justify-center max-h-[65vh]">
                  <MediaImage
                    tripId={trip.id}
                    ownerId={trip.ownerId}
                    collabId={trip.collabId}
                    src={sanitizeExternalUrl(lightboxMemory.googlePhotosUrl)!}
                    alt={lightboxMemory.caption}
                    onError={() => setLightboxHighResFailed(true)}
                    className="max-h-[65vh] w-auto max-w-full object-contain pointer-events-none"
                  />
                </div>
              ) : (
                <div className="relative flex items-center justify-center max-h-[65vh]">
                  <MediaImage
                    tripId={trip.id}
                    ownerId={trip.ownerId}
                    collabId={trip.collabId}
                    src={lightboxMemory.imageUrl}
                    alt={lightboxMemory.caption}
                    className="max-h-[65vh] w-auto max-w-full object-contain pointer-events-none"
                  />
                </div>
              )}

              {/* Next Button */}
              {lightboxPlaylist.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNextLightbox();
                  }}
                  className="absolute right-2 sm:right-4 z-10 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition active:scale-90 border border-white/10"
                  title="下一張"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </div>

            {/* Thumbnail Strip for Multi-Photo Switching */}
            {lightboxPlaylist.length > 1 && (
              <div className="px-4 py-2 bg-slate-950/80 border-t border-slate-800 flex items-center justify-center gap-2 overflow-x-auto">
                {lightboxPlaylist.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxMemory(m);
                    }}
                    className={`relative w-12 h-12 rounded-xl overflow-hidden shrink-0 transition border-2 ${
                      m.id === lightboxMemory.id
                        ? 'border-teal-400 scale-105 shadow-md'
                        : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <MediaImage tripId={trip.id} ownerId={trip.ownerId} collabId={trip.collabId} src={m.imageUrl} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Caption & Info Bar */}
            <div className="p-3.5 sm:p-4 bg-[#111827] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-800">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base">{lightboxMemory.mood}</span>
                  <h4 className="font-bold text-sm text-white truncate">
                    {lightboxMemory.spotTitle || lightboxMemory.location || trip.destination}
                  </h4>
                  {lightboxMemory.dayNumber && (
                    <>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="text-xs font-mono tabular-nums text-teal-400 shrink-0">
                        Day {lightboxMemory.dayNumber}
                      </span>
                    </>
                  )}
                </div>
                {lightboxMemory.caption && (
                  <p className="text-xs text-slate-300 italic whitespace-pre-wrap break-words leading-relaxed">
                    「{lightboxMemory.caption}」
                  </p>
                )}
                {lightboxMemory.driveFileId && (
                  <div className="text-[11px] font-mono tabular-nums text-slate-300 flex items-center gap-1.5 flex-wrap pt-0.5">
                    <HardDrive className="w-3 h-3 text-teal-400 shrink-0" />
                    {lightboxMemory.originalWidth && lightboxMemory.originalHeight && (
                      <span>
                        {lightboxMemory.originalWidth} × {lightboxMemory.originalHeight}
                      </span>
                    )}
                    {lightboxMemory.originalBytes && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{formatBytesLabel(lightboxMemory.originalBytes)}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    {isLoadingDriveOriginal ? (
                      <span className="font-sans text-teal-300 inline-flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>載入 Drive 原圖中...</span>
                      </span>
                    ) : driveOriginalUrl ? (
                      <span className="font-sans text-teal-300">Drive 原圖畫質</span>
                    ) : driveOriginalError ? (
                      <span className="font-sans text-amber-300">{driveOriginalError}</span>
                    ) : (
                      <span className="font-sans text-slate-400">1440px 高清預覽</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {lightboxMemory.driveFileId && !driveOriginalUrl && !isLoadingDriveOriginal && !driveConnected && (
                  <button
                    type="button"
                    disabled={isConnectingDrive}
                    onClick={async () => {
                      setIsConnectingDrive(true);
                      try {
                        const token = await connectGoogleDrive();
                        const ok = Boolean(token) || hasDriveAccessToken();
                        setDriveConnected(ok);
                        if (!ok) {
                          setDriveOriginalError('Google Drive 授權未完成或被瀏覽器阻擋');
                        }
                      } finally {
                        setIsConnectingDrive(false);
                      }
                    }}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>{isConnectingDrive ? '授權中...' : '載入 Drive 原圖'}</span>
                  </button>
                )}

                {lightboxMemory.driveFileId && (
                  <button
                    type="button"
                    disabled={isDownloadingDriveOriginal}
                    onClick={async () => {
                      let token = getDriveAccessToken();
                      if (!token) {
                        token = await connectGoogleDrive();
                        setDriveConnected(Boolean(token) || hasDriveAccessToken());
                      }
                      if (!token) {
                        setDriveOriginalError('需要 Google Drive 授權才能下載未壓縮原圖');
                        return;
                      }
                      if (!lightboxMemory.driveFileId) return;
                      setIsDownloadingDriveOriginal(true);
                      try {
                        const ext =
                          lightboxMemory.originalMimeType === 'image/png'
                            ? 'png'
                            : lightboxMemory.originalMimeType === 'image/webp'
                            ? 'webp'
                            : 'jpg';
                        const safeName = `${lightboxMemory.date || 'hiyori'}_${lightboxMemory.spotTitle || 'photo'}.${ext}`.replace(
                          /[\\/:*?"<>|]/g,
                          '_'
                        );
                        await downloadDriveOriginalFile(lightboxMemory.driveFileId, safeName, token);
                      } catch (err) {
                        setDriveOriginalError(err instanceof Error ? err.message : '下載原圖失敗');
                      } finally {
                        setIsDownloadingDriveOriginal(false);
                      }
                    }}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-600 text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
                    title="下載未壓縮原始畫質照片"
                  >
                    {isDownloadingDriveOriginal ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>下載原圖</span>
                  </button>
                )}

                {sanitizeExternalUrl(lightboxMemory.googlePhotosUrl || trip.googlePhotosAlbumUrl) && (
                  <a
                    href={sanitizeExternalUrl(lightboxMemory.googlePhotosUrl || trip.googlePhotosAlbumUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
                    title="開啟 Google 相簿檢視原始高畫質相片"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Google 相簿</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setLightboxMemory(null)}
                  className="min-h-[40px] px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold shrink-0 transition cursor-pointer"
                >
                  關閉
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= 5. EXPLICIT GOOGLE DRIVE DELETE CONFIRMATION ================= */}
      {pendingDriveDeleteMem && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center px-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => {
            if (!isDeletingDriveFile) {
              setPendingDriveDeleteMem(null);
              setDriveDeleteError(null);
            }
          }}
        >
          <div
            className="w-full max-w-md max-h-full overflow-y-auto rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-5 sm:p-6 shadow-2xl space-y-4 text-slate-800 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-base text-slate-900 dark:text-white">
                  刪除此回憶照片
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  這張照片在您的 Google Drive 同時存有未壓縮原圖。請確認是否一併刪除雲端原圖檔案：
                </p>
              </div>
            </div>

            {driveDeleteError && (
              <p className="text-xs text-rose-600 dark:text-rose-400 font-medium bg-rose-50 dark:bg-rose-950/40 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900">
                {driveDeleteError}
              </p>
            )}

            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={isDeletingDriveFile}
                onClick={() => handleConfirmDriveDelete(true)}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {isDeletingDriveFile ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>正在刪除相簿與 Drive 原圖...</span>
                  </>
                ) : (
                  <span>刪除相簿照片，並永久移除 Google Drive 原圖</span>
                )}
              </button>

              <button
                type="button"
                disabled={isDeletingDriveFile}
                onClick={() => handleConfirmDriveDelete(false)}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-[#E5E2DC] dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
              >
                僅從日和相簿移除（保留 Google Drive 原圖）
              </button>

              <button
                type="button"
                disabled={isDeletingDriveFile}
                onClick={() => {
                  setPendingDriveDeleteMem(null);
                  setDriveDeleteError(null);
                }}
                className="w-full min-h-[40px] px-4 py-2 rounded-2xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition cursor-pointer"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
