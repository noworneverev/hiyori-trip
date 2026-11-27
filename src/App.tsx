import React, { Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Trip, ItineraryItem } from './types/itinerary';
import { PRESET_TRIPS } from './data/presetTrips';
import {
  getStoredTrips,
  saveTrips,
  getCurrentTripId,
  setCurrentTripId,
  getDeletedTripIds,
  recordDeletedTripId,
  hydrateStorageFromIndexedDB,
  resetAllLocalData,
} from './utils/storage';
import { rebindTripMediaIds, garbageCollectOrphanedMedia } from './utils/image';
import { idbDeleteMediaByTrip } from './utils/indexedDb';
import { formatDateSlash, getTodayLocal, findInsertionPosition } from './utils/date';
import { Language, TRANSLATIONS, getStoredLanguage, setStoredLanguage } from './utils/i18n';
import { useDarkMode } from './hooks/useDarkMode';
import { useScrollDirection } from './hooks/useScrollDirection';
import { useIsMobileViewport } from './hooks/useIsMobileViewport';
import { resetSavedScrollPosition } from './hooks/useBodyScrollLock';
import { IosModalSheet, IosNavBar, IosInsetGroup } from './components/UI/IosPrimitives';
import { TripPhaseBanner } from './components/UI/TripPhaseBanner';
import { TimelineTab } from './components/Tabs/TimelineTab';
import { AuthButton } from './components/Auth/AuthButton';
import { AppMenu } from './components/Navigation/AppMenu';
import {
  auth,
  resolveAuthRedirect,
  subscribeUserTrips,
  fetchUserTripsFromServer,
  saveTripToCloud,
  deleteTripFromCloud,
  fetchSharedTrip,
  subscribeCollaborativeTrip,
  syncCollaborativeTrip,
  fetchCollaborativeTrip,
  checkUserTripPermission,
  mergeSingleTrip,
  fetchUserTombstones,
  subscribeUserTombstones,
  SnapshotMeta,
} from './utils/firebase';
import {
  mergeTrips,
  enqueueTripSave,
  enqueueTripDelete,
  enqueueCollabSync,
  flushPendingSyncQueue,
  removePendingTripSave,
  getPendingQueueAsync,
  TripConflict,
  hasTripContentDifference,
  stableContentSignature,
} from './utils/syncManager';
import { onAuthStateChanged, User } from 'firebase/auth';
import { OfflineIndicator } from './components/PWA/OfflineIndicator';
import { HiyoriLogo } from './components/UI/HiyoriLogo';
import { initAccessibilityScale } from './utils/accessibility';
import { UpdateNotificationBanner } from './components/UI/UpdateNotificationBanner';
import {
  Route,
  Plus,
  Edit,
  Wallet,
  CheckCircle,
  Camera,
  Sparkles,
  Plane,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Trash2,
  Github,
  Printer,
  Share2,
  Users,
  Check,
  X,
  Radio,
  ShieldCheck,
  Eye,
  Compass,
  Loader2,
} from 'lucide-react';

// Code-split heavy tabs & modals to dramatically speed up mobile/iOS PWA cold start
const LiveCompanionTab = React.lazy(() =>
  import('./components/Tabs/LiveCompanionTab').then((m) => ({ default: m.LiveCompanionTab }))
);
const ExpensesTab = React.lazy(() =>
  import('./components/Tabs/ExpensesTab').then((m) => ({ default: m.ExpensesTab }))
);
const NotesAndPrepTab = React.lazy(() =>
  import('./components/Tabs/NotesAndPrepTab').then((m) => ({ default: m.NotesAndPrepTab }))
);
const TripMemoriesView = React.lazy(() =>
  import('./components/Memories/TripMemoriesView').then((m) => ({ default: m.TripMemoriesView }))
);
const GlobalTravelHubModal = React.lazy(() =>
  import('./components/Memories/GlobalTravelHubModal').then((m) => ({
    default: m.GlobalTravelHubModal,
  }))
);
const TripEditModal = React.lazy(() =>
  import('./components/Modals/TripEditModal').then((m) => ({ default: m.TripEditModal }))
);
const ItemEditModal = React.lazy(() =>
  import('./components/Modals/ItemEditModal').then((m) => ({ default: m.ItemEditModal }))
);
const ImportExportModal = React.lazy(() =>
  import('./components/Modals/ImportExportModal').then((m) => ({ default: m.ImportExportModal }))
);
const SettingsModal = React.lazy(() =>
  import('./components/Modals/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const PDFExportModal = React.lazy(() =>
  import('./components/Modals/PDFExportModal').then((m) => ({ default: m.PDFExportModal }))
);
const ShareTripModal = React.lazy(() =>
  import('./components/Modals/ShareTripModal').then((m) => ({ default: m.ShareTripModal }))
);
const CollaborateModal = React.lazy(() =>
  import('./components/Modals/CollaborateModal').then((m) => ({ default: m.CollaborateModal }))
);
const DeleteConfirmModal = React.lazy(() =>
  import('./components/Modals/DeleteConfirmModal').then((m) => ({ default: m.DeleteConfirmModal }))
);
const ConflictResolutionModal = React.lazy(() =>
  import('./components/Modals/ConflictResolutionModal').then((m) => ({
    default: m.ConflictResolutionModal,
  }))
);
const AuthPromptModal = React.lazy(() =>
  import('./components/Modals/AuthPromptModal').then((m) => ({ default: m.AuthPromptModal }))
);
const TravelQuickActionModal = React.lazy(() =>
  import('./components/UI/TravelQuickActionModal').then((m) => ({
    default: m.TravelQuickActionModal,
  }))
);

type TabType = 'timeline' | 'live' | 'expenses' | 'prep' | 'memories';

const HTML_LANG_MAP: Record<Language, string> = {
  zh: 'zh-TW',
  'zh-CN': 'zh-CN',
  en: 'en',
  ja: 'ja',
  ko: 'ko',
};

const TAB_MOBILE_LABELS: Record<Language, Record<TabType, string>> = {
  zh: { timeline: '行程', live: '隨行', expenses: '記帳', prep: '待辦', memories: '回憶' },
  'zh-CN': { timeline: '行程', live: '随行', expenses: '记账', prep: '待办', memories: '回忆' },
  en: { timeline: 'Plan', live: 'Live', expenses: 'Spend', prep: 'To-Do', memories: 'Album' },
  ja: { timeline: '旅程', live: 'ガイド', expenses: '家計', prep: 'タスク', memories: '思い出' },
  ko: { timeline: '일정', live: '동행', expenses: '가계부', prep: '할 일', memories: '추억' },
};

const TAB_DESKTOP_PREP_LABELS: Record<Language, string> = {
  zh: '待辦',
  'zh-CN': '待办',
  en: 'To-Do',
  ja: 'タスク',
  ko: '할 일',
};

const TabLoadingFallback: React.FC = () => (
  <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
    <Loader2 className="w-6 h-6 animate-spin text-teal-600 dark:text-teal-400" />
  </div>
);

export default function App() {
  const [trips, setTrips] = useState<Trip[]>(() => {
    const loaded = getStoredTrips();
    return loaded && loaded.length > 0 ? loaded : PRESET_TRIPS;
  });
  const [currentTripId, setCurrentTripIdState] = useState<string>(() => {
    const active = getCurrentTripId();
    return active || PRESET_TRIPS[0]?.id || '';
  });
  const [activeTab, setActiveTab] = useState<TabType>('timeline');
  const [dismissedPhaseTripIds, setDismissedPhaseTripIds] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('hiyori_dismissed_phase_banners_v1');
      return raw ? JSON.parse(raw) || {} : {};
    } catch {
      return {};
    }
  });
  const [memoriesSpotId, setMemoriesSpotId] = useState<string | undefined>(undefined);
  const [requestedTimelineDay, setRequestedTimelineDay] = useState<{
    dayNumber: number;
    nonce: number;
  } | null>(null);
  const [requestedPrepSubTab, setRequestedPrepSubTab] = useState<{
    tab: 'checklist' | 'bookings';
    nonce: number;
  } | null>(null);

  // i18n & Theme
  const [lang, setLang] = useState<Language>(getStoredLanguage);
  const langRef = useRef<Language>(lang);
  useEffect(() => {
    langRef.current = lang;
    if (typeof document !== 'undefined') {
      document.documentElement.lang = HTML_LANG_MAP[lang] || 'zh-TW';
    }
  }, [lang]);

  const { isDark, toggleDarkMode } = useDarkMode();
  const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;
  const isZh = lang === 'zh' || lang === 'zh-CN';

  // Modals
  const [showTripModal, setShowTripModal] = useState(false);
  const [tripModalData, setTripModalData] = useState<Trip | null>(null);
  const [tripModalInitialMode, setTripModalInitialMode] = useState<'planner' | 'memory'>('planner');

  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItemData, setEditingItemData] = useState<{
    item?: ItineraryItem;
    dayNumber: number;
    initialStartTime?: string;
  } | null>(null);

  const [showImportExportModal, setShowImportExportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showPDFExportModal, setShowPDFExportModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCollabModal, setShowCollabModal] = useState(false);
  const [showDeleteTripModal, setShowDeleteTripModal] = useState(false);
  const [deleteTargetTripId, setDeleteTargetTripId] = useState<string | null>(null);
  const [showGlobalHubModal, setShowGlobalHubModal] = useState(false);
  const [showQuickActionModal, setShowQuickActionModal] = useState(false);
  const [quickActionTab, setQuickActionTab] = useState<'expense' | 'todos'>('expense');
  const [quickActionDate, setQuickActionDate] = useState<string | undefined>(undefined);
  const [sharedBannerTrip, setSharedBannerTrip] = useState<Trip | null>(null);
  const [collabBannerTrip, setCollabBannerTrip] = useState<Trip | null>(null);
  const [isHeroExpanded, setIsHeroExpanded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingConflicts, setPendingConflicts] = useState<TripConflict[]>([]);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const toastTimeoutRef = useRef<number | null>(null);

  const isMobile = useIsMobileViewport();
  const [showTripSwitcher, setShowTripSwitcher] = useState(false);
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
  const [isAuthMenuOpen, setIsAuthMenuOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalReason, setAuthModalReason] = useState<string>('');
  const pendingActionRef = useRef<(() => void) | null>(null);
  const tripSwitcherRef = useRef<HTMLDivElement>(null);

  const isAnyOverlayOpen =
    showTripSwitcher ||
    isAppMenuOpen ||
    isAuthMenuOpen ||
    showSettingsModal ||
    showDeleteTripModal ||
    showTripModal ||
    showItemModal ||
    showImportExportModal ||
    showPDFExportModal ||
    showShareModal ||
    showCollabModal ||
    showConflictModal ||
    showAuthModal ||
    showGlobalHubModal ||
    showQuickActionModal;

  const { isNavHidden, resetNavVisibility } = useScrollDirection({ paused: isAnyOverlayOpen });

  useEffect(() => {
    resetNavVisibility();
  }, [activeTab, isAnyOverlayOpen, resetNavVisibility]);

  const dismissToast = useCallback(() => {
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setToastMessage(null);
  }, []);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 3400);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
    };
  }, []);

  // Map Pick Coordinate Mode (properly hides ItemEditModal while picking on map, then restores it)
  const [isPickMode, setIsPickMode] = useState(false);
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [itemDraftBackup, setItemDraftBackup] = useState<Partial<ItineraryItem> | null>(null);

  // Desktop Trip Switcher click-outside & Escape
  useEffect(() => {
    if (!showTripSwitcher || isMobile) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (!tripSwitcherRef.current?.contains(target)) {
        setShowTripSwitcher(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowTripSwitcher(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showTripSwitcher, isMobile]);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const currentUserRef = useRef<User | null>(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const tripsRef = useRef<Trip[]>(trips);
  useEffect(() => {
    tripsRef.current = trips;
  }, [trips]);

  const hydrationPromiseRef = useRef<Promise<Trip[]> | null>(null);
  const hasCloudReconciledRef = useRef<boolean>(false);
  const inFlightCloudSavesRef = useRef<Set<string>>(new Set());
  const recentlyUploadedAtRef = useRef<Map<string, number>>(new Map());
  const recentlyUploadedSigRef = useRef<Map<string, { sig: string; at: number }>>(new Map());
  const lastServerPullAtRef = useRef<number>(0);
  const pullCloudFromServerRef = useRef<
    ((options?: { force?: boolean; pushLocalFirst?: boolean }) => Promise<{ totalTrips: number; failed: number }>) | null
  >(null);
  const flushPendingDebouncedSavesRef = useRef<(enqueueOnly?: boolean) => void>(() => {});
  const urlLoadedTripIdsRef = useRef<Set<string>>(new Set());

  const persistTripsState = useCallback((updater: (prev: Trip[]) => Trip[]) => {
    const next = updater(tripsRef.current);
    tripsRef.current = next;
    setTrips(next);
    saveTrips(next);
    return next;
  }, []);

  // Global accessibility init & event listeners (reading langRef to avoid stale closures)
  useEffect(() => {
    initAccessibilityScale();
    const handleSyncWarning = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.sizeKb) {
        const curZh = langRef.current === 'zh' || langRef.current === 'zh-CN';
        showToast(
          curZh
            ? `行程容量 (${detail.sizeKb} KB) 接近雲端上限 1MB，建議大量原圖改用 Drive 備份`
            : `Trip size (${detail.sizeKb} KB) is close to 1MB cloud limit`
        );
      }
    };
    const handleSyncStatus = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.status === 'error' && detail?.error) {
        showToast(detail.error);
      }
    };
    const handleAccountCacheCleared = (e: Event) => {
      const detail = (e as CustomEvent<{ retainedTrips?: Trip[] }>).detail;
      hasCloudReconciledRef.current = false;
      const retained = detail?.retainedTrips && detail.retainedTrips.length > 0 ? detail.retainedTrips : PRESET_TRIPS;
      tripsRef.current = retained;
      setTrips(retained);
      setCurrentTripIdState(retained[0]?.id || '');
    };
    window.addEventListener('cloud_sync_warning', handleSyncWarning);
    window.addEventListener('cloud_sync_status', handleSyncStatus);
    window.addEventListener('hiyori_account_cache_cleared', handleAccountCacheCleared);
    return () => {
      window.removeEventListener('cloud_sync_warning', handleSyncWarning);
      window.removeEventListener('cloud_sync_status', handleSyncStatus);
      window.removeEventListener('hiyori_account_cache_cleared', handleAccountCacheCleared);
      if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
    };
  }, [showToast]);

  // Startup IndexedDB hydration + ?share= / ?collab= loading (race-safe merge)
  useEffect(() => {
    let isMounted = true;
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('share');
    const collabId = urlParams.get('collab');

    const cleanUrlQueryParam = (param: string) => {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has(param)) {
          url.searchParams.delete(param);
          window.history.replaceState(window.history.state, '', url.toString());
        }
      } catch {}
    };

    const hydrationPromise = hydrateStorageFromIndexedDB();
    hydrationPromiseRef.current = hydrationPromise;

    hydrationPromise.then((hydrated) => {
      if (!isMounted || hasCloudReconciledRef.current) return;
      const deletedSet = new Set(getDeletedTripIds());
      const baseLoaded = (hydrated.length > 0 ? hydrated : getStoredTrips()).filter(
        (tr) => !deletedSet.has(tr.id)
      );

      // Preserve any ?share= or ?collab= trip that resolved before IDB finished hydrating
      const loadedIds = new Set(baseLoaded.map((tr) => tr.id));
      const urlLoadedTrips = tripsRef.current.filter(
        (tr) => urlLoadedTripIdsRef.current.has(tr.id) && !loadedIds.has(tr.id)
      );
      const mergedLoaded = [...urlLoadedTrips, ...baseLoaded];
      const finalTrips = mergedLoaded.length > 0 ? mergedLoaded : PRESET_TRIPS;

      tripsRef.current = finalTrips;
      setTrips(finalTrips);
      if (!shareId && !collabId) {
        const activeId = getCurrentTripId();
        const found = finalTrips.find((tr) => tr.id === activeId);
        setCurrentTripIdState(found ? found.id : finalTrips[0]?.id || '');
      }
    });

    if (shareId) {
      fetchSharedTrip(shareId)
        .then((shared) => {
          if (!isMounted) return;
          cleanUrlQueryParam('share');
          const curZh = langRef.current === 'zh' || langRef.current === 'zh-CN';
          if (!shared) {
            showToast(curZh ? '找不到該分享行程或連結已失效' : 'Shared trip not found');
            return;
          }
          urlLoadedTripIdsRef.current.add(shared.id);
          setSharedBannerTrip(shared);
          persistTripsState((prev) => {
            const exists = prev.some((tr) => tr.id === shared.id);
            return exists ? prev.map((tr) => (tr.id === shared.id ? shared : tr)) : [shared, ...prev];
          });
          setCurrentTripIdState(shared.id);
          setCurrentTripId(shared.id);
        })
        .catch(() => {
          if (isMounted) {
            const curZh = langRef.current === 'zh' || langRef.current === 'zh-CN';
            showToast(curZh ? '無法載入分享行程，請確認網路連線' : 'Failed to load shared trip');
          }
        });
    }

    if (collabId) {
      fetchCollaborativeTrip(collabId)
        .then((collabTrip) => {
          if (!isMounted) return;
          cleanUrlQueryParam('collab');
          const curZh = langRef.current === 'zh' || langRef.current === 'zh-CN';
          if (!collabTrip) {
            showToast(curZh ? '找不到該共編行程或連結已失效' : 'Collaborative trip not found');
            return;
          }
          urlLoadedTripIdsRef.current.add(collabTrip.id);
          setCollabBannerTrip(collabTrip);
          persistTripsState((prev) => {
            const idx = prev.findIndex((tr) => tr.id === collabTrip.id || tr.collabId === collabId);
            return idx >= 0
              ? prev.map((tr, i) => (i === idx ? collabTrip : tr))
              : [collabTrip, ...prev];
          });
          setCurrentTripIdState(collabTrip.id);
          setCurrentTripId(collabTrip.id);
        })
        .catch(() => {
          if (isMounted) {
            const curZh = langRef.current === 'zh' || langRef.current === 'zh-CN';
            showToast(curZh ? '無法載入共編行程，請確認網路連線' : 'Failed to load collaborative trip');
          }
        });
    }

    return () => {
      isMounted = false;
    };
  }, [persistTripsState, showToast]);

  const activeTrip = trips.find((tr) => tr.id === currentTripId) || trips[0];
  const activeCollabId =
    activeTrip?.isCollaborative && activeTrip?.collabId ? activeTrip.collabId : undefined;
  const activeId = activeTrip?.id;

  // Real-time listener for current collaborative trip (protects offline local edits & checks permissions)
  useEffect(() => {
    if (!activeCollabId || !activeId) return;

    const unsubscribe = subscribeCollaborativeTrip(
      activeCollabId,
      (liveTrip, meta: SnapshotMeta) => {
        if (meta.hasPendingWrites) return;

        const currentLocal = tripsRef.current.find(
          (tr) => (activeCollabId && tr.collabId === activeCollabId) || tr.id === activeId
        );
        if (!currentLocal) return;

        if (!hasTripContentDifference(currentLocal, liveTrip)) {
          return;
        }

        const localUpdated = currentLocal.updatedAt || 0;
        const cloudUpdated = liveTrip.updatedAt || 0;
        const lastSynced = currentLocal.lastSyncedAt || 0;
        const hasUnsyncedLocalEdits = localUpdated > lastSynced + 1000 && lastSynced > 0;
        const perm = checkUserTripPermission(liveTrip, currentUserRef.current);

        if (cloudUpdated >= localUpdated && !hasUnsyncedLocalEdits) {
          const syncedLive: Trip = {
            ...liveTrip,
            lastSyncedAt: Math.max(Date.now(), cloudUpdated),
          };
          persistTripsState((prev) => {
            const idx = prev.findIndex(
              (tr) => tr.collabId === activeCollabId || tr.id === activeId
            );
            if (idx < 0) return prev;
            const next = [...prev];
            next[idx] = syncedLive;
            return next;
          });
          return;
        }

        // Both diverged or local is newer: merge safely, and only push back if user actually has edit permission
        const merged =
          localUpdated >= cloudUpdated
            ? mergeSingleTrip(currentLocal, liveTrip)
            : mergeSingleTrip(liveTrip, currentLocal);
        persistTripsState((prev) => {
          const idx = prev.findIndex((tr) => tr.collabId === activeCollabId || tr.id === activeId);
          if (idx < 0) return prev;
          const next = [...prev];
          next[idx] = merged;
          return next;
        });

        if (perm.canEdit) {
          const editorName =
            currentUserRef.current?.displayName || currentUserRef.current?.email || '我';
          syncCollaborativeTrip(activeCollabId, merged, editorName).catch(() => {
            enqueueCollabSync(activeCollabId, merged, editorName);
          });
        }
      }
    );

    return () => unsubscribe();
  }, [activeCollabId, activeId, persistTripsState]);

  // Offline-first editing: local edits work freely without login!
  // Only cloud-only operations (Share Link, Collaboration, Cloud Sync) invoke promptCloudAuth.
  const promptCloudAuth = useCallback((action: () => void, reason?: string) => {
    if (currentUserRef.current) {
      action();
      return;
    }
    pendingActionRef.current = action;
    const curZh = langRef.current === 'zh' || langRef.current === 'zh-CN';
    setAuthModalReason(reason || (curZh ? '啟用雲端同步與分享協作' : 'Enable cloud sync & sharing'));
    setShowAuthModal(true);
  }, []);

  // Passed to child components: local editing is always allowed offline without login!
  const requireAuth = useCallback((_retryAction: () => void, _reason?: string): boolean => {
    return true;
  }, []);

  const markTripsSyncedLocally = useCallback(
    (syncedAtByTripId: Record<string, number>) => {
      if (!syncedAtByTripId || Object.keys(syncedAtByTripId).length === 0) return;
      const now = Date.now();
      Object.keys(syncedAtByTripId).forEach((tripId) => {
        recentlyUploadedAtRef.current.set(tripId, now);
      });
      let changed = false;
      const next = tripsRef.current.map((tr) => {
        const syncedAt = syncedAtByTripId[tr.id];
        if (syncedAt && (tr.lastSyncedAt || 0) < syncedAt) {
          changed = true;
          return { ...tr, lastSyncedAt: syncedAt };
        }
        return tr;
      });
      if (changed) {
        tripsRef.current = next;
        setTrips(next);
        saveTrips(next);
      }
    },
    []
  );

  // Debounced cloud write scheduler + safe background flush for iOS PWA
  const cloudSaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingCloudWritesRef = useRef<
    Map<
      string,
      {
        type: 'user' | 'collab';
        uid?: string;
        collabId?: string;
        trip: Trip;
        editorName?: string;
      }
    >
  >(new Map());

  const cancelPendingWriteForTrip = useCallback((uid: string | undefined, tripId: string, collabId?: string) => {
    if (uid) {
      const userKey = `user:${uid}:${tripId}`;
      const existingUserTimer = cloudSaveTimersRef.current.get(userKey);
      if (existingUserTimer) {
        clearTimeout(existingUserTimer);
        cloudSaveTimersRef.current.delete(userKey);
      }
      pendingCloudWritesRef.current.delete(userKey);
    }
    if (collabId) {
      const collabKey = `collab:${collabId}`;
      const existingCollabTimer = cloudSaveTimersRef.current.get(collabKey);
      if (existingCollabTimer) {
        clearTimeout(existingCollabTimer);
        cloudSaveTimersRef.current.delete(collabKey);
      }
      pendingCloudWritesRef.current.delete(collabKey);
    }
  }, []);

  // Listen to Auth State and subscribe to cloud trips & live tombstones
  useEffect(() => {
    let unsubscribeFirestore: (() => void) | null = null;
    let unsubscribeTombstones: (() => void) | null = null;
    let isEffectMounted = true;

    resolveAuthRedirect()
      .then((res) => {
        if (!isEffectMounted) return;
        if (res.errorMessage) {
          showToast(res.errorMessage);
        }
      })
      .catch(() => {});

    const handleGlobalAuthError = (evt: Event) => {
      const detail = (evt as CustomEvent<{ message?: string }>).detail;
      if (detail?.message) {
        showToast(detail.message);
      }
    };
    window.addEventListener('hiyori_auth_error', handleGlobalAuthError);

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      currentUserRef.current = user;
      window.dispatchEvent(new CustomEvent('hiyori_auth_ready', { detail: { uid: user?.uid || null } }));

      if (unsubscribeFirestore) {
        unsubscribeFirestore();
        unsubscribeFirestore = null;
      }
      if (unsubscribeTombstones) {
        unsubscribeTombstones();
        unsubscribeTombstones = null;
      }

      if (user) {
        setShowAuthModal(false);
        if (pendingActionRef.current) {
          const action = pendingActionRef.current;
          pendingActionRef.current = null;
          window.setTimeout(() => {
            try {
              action();
            } catch (e) {
              console.warn('Pending auth action failed:', e);
            }
          }, 150);
        }
      } else {
        hasCloudReconciledRef.current = false;
        pullCloudFromServerRef.current = null;
        return;
      }

      if (hydrationPromiseRef.current) {
        try {
          await hydrationPromiseRef.current;
        } catch {}
      }
      if (!isEffectMounted || currentUserRef.current?.uid !== user.uid) return;

      let cloudTombstones: Record<string, number> = {};
      let tombstonesFromServerReady = false;
      let latestCloudTrips: Trip[] | null = null;
      let tripsFromServerReady = false;
      let reconcileQueue: Promise<void> = Promise.resolve();

      try {
        const fetched = await fetchUserTombstones(user.uid);
        if (fetched !== null) {
          cloudTombstones = fetched;
          if (typeof navigator === 'undefined' || navigator.onLine !== false) {
            tombstonesFromServerReady = true;
          }
        }
      } catch {
        cloudTombstones = {};
      }
      if (!isEffectMounted || currentUserRef.current?.uid !== user.uid) return;

      try {
        const { successCount } = await flushPendingSyncQueue(user.uid, cloudTombstones);
        if (successCount > 0 && isEffectMounted) {
          window.dispatchEvent(
            new CustomEvent('hiyori_sync_completed', { detail: { count: successCount } })
          );
        }
      } catch {}
      if (!isEffectMounted || currentUserRef.current?.uid !== user.uid) return;

      const reconcileNow = async () => {
        if (!isEffectMounted || currentUserRef.current?.uid !== user.uid) return;
        if (latestCloudTrips === null) return;

        const hasTombstones = Object.keys(cloudTombstones).length > 0;
        if (!tripsFromServerReady && latestCloudTrips.length === 0 && !hasTombstones) {
          return;
        }

        const nowMs = Date.now();
        const pendingSaveIds = new Set<string>(inFlightCloudSavesRef.current);
        pendingCloudWritesRef.current.forEach((task) => {
          if (task.type === 'user' && task.uid === user.uid && task.trip?.id) {
            pendingSaveIds.add(task.trip.id);
          }
        });
        // Protect freshly uploaded trips for 15s so a stale pre-write snapshot never treats them as remotely deleted
        const cloudIdSet = new Set(latestCloudTrips.map((c) => c.id));
        for (const [tripId, uploadedAt] of recentlyUploadedAtRef.current.entries()) {
          if (cloudIdSet.has(tripId) || nowMs - uploadedAt > 15000) {
            recentlyUploadedAtRef.current.delete(tripId);
          } else {
            pendingSaveIds.add(tripId);
          }
        }
        try {
          const queued = await getPendingQueueAsync();
          queued.forEach((q) => {
            if (q.type === 'save_trip' && q.userId === user.uid && q.trip?.id) {
              pendingSaveIds.add(q.trip.id);
            }
          });
        } catch {}

        if (!isEffectMounted || currentUserRef.current?.uid !== user.uid) return;

        // Read live authoritative tripsRef AFTER async await to avoid TOCTOU dropping local edits
        const currentLocal = tripsRef.current;
        const prevLocalIds = new Set(currentLocal.map((tr) => tr.id));
        const wasAlreadyReconciled = hasCloudReconciledRef.current;
        const deletedIds = new Set(getDeletedTripIds());

        for (const lTrip of currentLocal) {
          if (deletedIds.has(lTrip.id) || typeof cloudTombstones[lTrip.id] === 'number') {
            cancelPendingWriteForTrip(user.uid, lTrip.id, lTrip.collabId);
          }
        }

        const filteredCloud = latestCloudTrips.filter((c) => !deletedIds.has(c.id));
        const isServerAuthoritative =
          tripsFromServerReady &&
          (tombstonesFromServerReady || hasTombstones || filteredCloud.length > 0);
        const hasAccountBoundLocal = currentLocal.some(
          (l) =>
            !l.id.startsWith('imported-share_') &&
            !(l.isCollaborative && l.ownerId && l.ownerId !== user.uid) &&
            (Boolean(l.lastSyncedAt) ||
              Boolean(l.ownerId && l.ownerId === user.uid && !pendingSaveIds.has(l.id)))
        );

        if (filteredCloud.length > 0 || hasTombstones || (tripsFromServerReady && hasAccountBoundLocal)) {
          const { merged, tripsToUpload, deletedLocalTripIds, conflicts } = mergeTrips(
            currentLocal,
            filteredCloud,
            cloudTombstones,
            isServerAuthoritative,
            user.uid,
            pendingSaveIds
          );

          for (const id of deletedLocalTripIds) {
            recordDeletedTripId(id);
            const target = currentLocal.find((tr) => tr.id === id);
            cancelPendingWriteForTrip(user.uid, id, target?.collabId);
            idbDeleteMediaByTrip(id).catch(() => {});
          }

          if (conflicts.length > 0) {
            setPendingConflicts((prev) => {
              const map = new Map(prev.map((c) => [c.tripId, c]));
              conflicts.forEach((c) => map.set(c.tripId, c));
              return Array.from(map.values());
            });
            setShowConflictModal(true);
          }

          const conflictIds = new Set(conflicts.map((c) => c.tripId));
          const uploadIds = new Set(tripsToUpload.map((tr) => tr.id));
          const normalizedMerged = merged.map((m) => {
            if (!conflictIds.has(m.id) && !uploadIds.has(m.id)) {
              const baseline = Math.max(m.lastSyncedAt || 0, m.updatedAt || 0);
              if (baseline > (m.lastSyncedAt || 0)) {
                return { ...m, lastSyncedAt: baseline };
              }
            }
            return m;
          });

          const hasChange =
            normalizedMerged.length !== currentLocal.length ||
            normalizedMerged.some((m) => {
              const l = currentLocal.find((x) => x.id === m.id);
              return !l || hasTripContentDifference(m, l) || (m.lastSyncedAt || 0) > (l.lastSyncedAt || 0);
            }) ||
            currentLocal.some((l) => {
              const m = normalizedMerged.find((x) => x.id === l.id);
              return !m || hasTripContentDifference(m, l);
            });

          if (hasChange || deletedLocalTripIds.length > 0) {
            // Cancel any pending debounced timer for trips whose cloud version won
            for (const m of normalizedMerged) {
              const l = currentLocal.find((x) => x.id === m.id);
              if (l && (m.updatedAt || 0) > (l.updatedAt || 0) && !uploadIds.has(m.id)) {
                cancelPendingWriteForTrip(user.uid, m.id, m.collabId);
              }
            }
            tripsRef.current = normalizedMerged;
            setTrips(normalizedMerged);
            saveTrips(normalizedMerged);
            if (deletedLocalTripIds.length > 0) {
              garbageCollectOrphanedMedia(normalizedMerged).catch(() => {});
            }

            // One-time subtle notification ONLY when genuinely new trip(s) arrive from another device
            if (wasAlreadyReconciled) {
              const addedRemoteTrips = normalizedMerged.filter(
                (m) => !prevLocalIds.has(m.id) && !uploadIds.has(m.id)
              );
              if (addedRemoteTrips.length === 1) {
                const curZh = langRef.current === 'zh' || langRef.current === 'zh-CN';
                showToast(
                  curZh
                    ? `已從雲端收到新旅程「${addedRemoteTrips[0].title}」`
                    : `Synced new trip "${addedRemoteTrips[0].title}" from cloud`
                );
              } else if (addedRemoteTrips.length > 1) {
                const curZh = langRef.current === 'zh' || langRef.current === 'zh-CN';
                showToast(
                  curZh
                    ? `已從雲端收到 ${addedRemoteTrips.length} 筆新旅程`
                    : `Synced ${addedRemoteTrips.length} new trips from cloud`
                );
              }
            }
          }
          if (isServerAuthoritative) {
            hasCloudReconciledRef.current = true;
          }

          if (tripsToUpload.length > 0) {
            const refreshedDeletedIds = new Set(getDeletedTripIds());
            const syncedMap: Record<string, number> = {};
            const uploadNow = Date.now();
            for (const tr of tripsToUpload) {
              if (tr.id.startsWith('imported-share_')) continue;
              if (tr.isCollaborative && tr.ownerId && tr.ownerId !== user.uid) continue;
              const isRemoteTombstoned =
                typeof cloudTombstones[tr.id] === 'number' &&
                cloudTombstones[tr.id] + 15 * 60 * 1000 >= (tr.updatedAt || 0);
              if (refreshedDeletedIds.has(tr.id) || isRemoteTombstoned) continue;

              // Defense-in-depth loop breaker: never re-upload the exact same content signature within 60s
              const sig = stableContentSignature(tr);
              const prevUploaded = recentlyUploadedSigRef.current.get(tr.id);
              if (prevUploaded && prevUploaded.sig === sig && uploadNow - prevUploaded.at < 60000) {
                continue;
              }
              recentlyUploadedSigRef.current.set(tr.id, { sig, at: uploadNow });

              inFlightCloudSavesRef.current.add(tr.id);
              try {
                await saveTripToCloud(user.uid, tr);
                syncedMap[tr.id] = Math.max(Date.now(), tr.updatedAt || 0);
              } catch {
                recentlyUploadedSigRef.current.delete(tr.id);
                enqueueTripSave(user.uid, tr);
              } finally {
                inFlightCloudSavesRef.current.delete(tr.id);
              }
            }
            if (Object.keys(syncedMap).length > 0) {
              // Silent background sync: update local timestamps without spamming toast banners
              markTripsSyncedLocally(syncedMap);
            }
          }

          const activeStoredId = getCurrentTripId();
          const exists = normalizedMerged.find((tr) => tr.id === activeStoredId);
          if (!exists) {
            const fallbackId = normalizedMerged[0]?.id || '';
            setCurrentTripIdState(fallbackId);
            setCurrentTripId(fallbackId);
          }
        } else if (tripsFromServerReady) {
          hasCloudReconciledRef.current = true;
          const toSync = (currentLocal || []).filter(
            (tr) =>
              !deletedIds.has(tr.id) &&
              !tr.id.startsWith('imported-share_') &&
              !(tr.isCollaborative && tr.ownerId && tr.ownerId !== user.uid) &&
              typeof cloudTombstones[tr.id] !== 'number'
          );
          if (toSync.length > 0) {
            const syncedMap: Record<string, number> = {};
            const uploadNow = Date.now();
            for (const tr of toSync) {
              const sig = stableContentSignature(tr);
              const prevUploaded = recentlyUploadedSigRef.current.get(tr.id);
              if (prevUploaded && prevUploaded.sig === sig && uploadNow - prevUploaded.at < 60000) {
                continue;
              }
              recentlyUploadedSigRef.current.set(tr.id, { sig, at: uploadNow });
              inFlightCloudSavesRef.current.add(tr.id);
              try {
                await saveTripToCloud(user.uid, tr);
                syncedMap[tr.id] = Math.max(Date.now(), tr.updatedAt || 0);
              } catch {
                recentlyUploadedSigRef.current.delete(tr.id);
                enqueueTripSave(user.uid, tr);
              } finally {
                inFlightCloudSavesRef.current.delete(tr.id);
              }
            }
            if (Object.keys(syncedMap).length > 0) {
              // Silent background initial migration
              markTripsSyncedLocally(syncedMap);
            }
          }
        }
      };

      const scheduleReconcile = () => {
        reconcileQueue = reconcileQueue.then(reconcileNow).catch((err) => {
          console.warn('[CloudSync] reconcile warning:', err);
        });
        return reconcileQueue;
      };

      // Active server pull for iOS/Mobile PWA foreground resume & manual bi-directional sync
      pullCloudFromServerRef.current = async (options?: { force?: boolean; pushLocalFirst?: boolean }) => {
        if (!isEffectMounted || currentUserRef.current?.uid !== user.uid) {
          return { totalTrips: tripsRef.current.length, failed: 0 };
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          return { totalTrips: tripsRef.current.length, failed: 0 };
        }
        const now = Date.now();
        if (!options?.force && now - lastServerPullAtRef.current < 6000) {
          return { totalTrips: tripsRef.current.length, failed: 0 };
        }
        lastServerPullAtRef.current = now;

        let failedCount = 0;
        if (options?.pushLocalFirst) {
          flushPendingDebouncedSavesRef.current(true);
          try {
            const flushed = await flushPendingSyncQueue(user.uid, cloudTombstones);
            failedCount += flushed.failedCount;
          } catch {
            failedCount += 1;
          }
        }

        const [tripsRes, tombstonesRes] = await Promise.all([
          fetchUserTripsFromServer(user.uid).catch(() => null),
          fetchUserTombstones(user.uid).catch(() => null),
        ]);

        if (!isEffectMounted || currentUserRef.current?.uid !== user.uid) {
          return { totalTrips: tripsRef.current.length, failed: failedCount };
        }

        if (tombstonesRes !== null) {
          cloudTombstones = tombstonesRes;
          tombstonesFromServerReady = true;
        }
        if (tripsRes !== null) {
          latestCloudTrips = tripsRes.trips;
          if (tripsRes.fromServer) {
            tripsFromServerReady = true;
          }
        }

        // If user clicked manual sync, also upload any owned local trip missing from cloud or locally edited
        if (options?.pushLocalFirst && tripsRes !== null) {
          const cloudMap = new Map(tripsRes.trips.map((c) => [c.id, c]));
          const localDeleted = new Set(getDeletedTripIds());
          const syncedMap: Record<string, number> = {};
          for (const tr of tripsRef.current) {
            if (localDeleted.has(tr.id)) continue;
            if (tr.id.startsWith('imported-share_')) continue;
            if (tr.isCollaborative && tr.ownerId && tr.ownerId !== user.uid) continue;
            const deletedAt = cloudTombstones[tr.id];
            if (typeof deletedAt === 'number' && deletedAt + 15 * 60 * 1000 >= (tr.updatedAt || 0)) {
              continue;
            }
            const remote = cloudMap.get(tr.id);
            const needsUpload =
              (!remote && !tr.lastSyncedAt) ||
              (remote && (tr.updatedAt || 0) > (remote.updatedAt || 0) && hasTripContentDifference(tr, remote));
            if (needsUpload) {
              const sig = stableContentSignature(tr);
              recentlyUploadedSigRef.current.set(tr.id, { sig, at: Date.now() });
              inFlightCloudSavesRef.current.add(tr.id);
              try {
                const saved = await saveTripToCloud(user.uid, tr);
                syncedMap[tr.id] = Math.max(Date.now(), saved.lastSyncedAt || tr.updatedAt || 0);
              } catch {
                recentlyUploadedSigRef.current.delete(tr.id);
                enqueueTripSave(user.uid, tr);
                failedCount += 1;
              } finally {
                inFlightCloudSavesRef.current.delete(tr.id);
              }
            }
          }
          if (Object.keys(syncedMap).length > 0) {
            markTripsSyncedLocally(syncedMap);
          }
        }

        await scheduleReconcile();
        return { totalTrips: tripsRef.current.length, failed: failedCount };
      };

      unsubscribeTombstones = subscribeUserTombstones(
        user.uid,
        (nextTombstones, meta: SnapshotMeta) => {
          if (meta.hasPendingWrites) return;
          cloudTombstones = nextTombstones;
          if (!meta.fromCache) {
            tombstonesFromServerReady = true;
          }
          scheduleReconcile();
        },
        () => {}
      );

      unsubscribeFirestore = subscribeUserTrips(
        user.uid,
        (cloudTrips, meta: SnapshotMeta) => {
          if (meta.hasPendingWrites) return;
          latestCloudTrips = cloudTrips || [];
          if (!meta.fromCache) {
            tripsFromServerReady = true;
          }
          scheduleReconcile();
        },
        () => {
          const curZh = langRef.current === 'zh' || langRef.current === 'zh-CN';
          showToast(curZh ? '雲端連線不穩，資料已安全保留於本機' : 'Cloud sync unavailable, saved locally');
        }
      );

      // Actively pull fresh server state on login/cold-start so iOS PWA doesn't stall on stale cache
      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        pullCloudFromServerRef.current?.({ force: true }).catch(() => {});
      }
    });

    return () => {
      isEffectMounted = false;
      pullCloudFromServerRef.current = null;
      window.removeEventListener('hiyori_auth_error', handleGlobalAuthError);
      if (unsubscribeFirestore) unsubscribeFirestore();
      if (unsubscribeTombstones) unsubscribeTombstones();
      unsubscribeAuth();
    };
  }, [cancelPendingWriteForTrip, markTripsSyncedLocally, showToast]);

  // Single authoritative network-reconnect sync flush + fresh server pull
  useEffect(() => {
    const handleOnline = async () => {
      const uid = currentUserRef.current?.uid;
      if (!uid) return;
      try {
        const { successCount } = await flushPendingSyncQueue(uid);
        if (successCount > 0) {
          window.dispatchEvent(
            new CustomEvent('hiyori_sync_completed', { detail: { count: successCount } })
          );
        }
        await pullCloudFromServerRef.current?.({ force: true });
      } catch (e) {
        console.warn('Online sync flush error:', e);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const flushPendingDebouncedSaves = useCallback(
    (enqueueOnly = false) => {
      cloudSaveTimersRef.current.forEach((timer) => clearTimeout(timer));
      cloudSaveTimersRef.current.clear();

      const entries = Array.from(pendingCloudWritesRef.current.entries());
      pendingCloudWritesRef.current.clear();

      for (const [, task] of entries) {
        if (task.type === 'collab' && task.collabId) {
          // Always persist to offline queue first when backgrounding on iOS so OS suspension never drops writes
          enqueueCollabSync(task.collabId, task.trip, task.editorName);
          if (!enqueueOnly && (typeof navigator === 'undefined' || navigator.onLine)) {
            syncCollaborativeTrip(task.collabId, task.trip, task.editorName).catch(() => {});
          }
        } else if (task.type === 'user' && task.uid) {
          enqueueTripSave(task.uid, task.trip);
          if (!enqueueOnly && (typeof navigator === 'undefined' || navigator.onLine)) {
            inFlightCloudSavesRef.current.add(task.trip.id);
            saveTripToCloud(task.uid, task.trip)
              .then(() => {
                removePendingTripSave(task.uid!, task.trip.id).catch(() => {});
                markTripsSyncedLocally({
                  [task.trip.id]: Math.max(Date.now(), task.trip.updatedAt || 0),
                });
              })
              .catch(() => {})
              .finally(() => {
                inFlightCloudSavesRef.current.delete(task.trip.id);
              });
          }
        }
      }
    },
    [markTripsSyncedLocally]
  );

  useEffect(() => {
    flushPendingDebouncedSavesRef.current = flushPendingDebouncedSaves;
  }, [flushPendingDebouncedSaves]);

  useEffect(() => {
    const handleBeforeUnload = () => flushPendingDebouncedSaves(true);
    const refreshOnResume = () => {
      const uid = currentUserRef.current?.uid;
      if (!uid) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      flushPendingSyncQueue(uid)
        .catch(() => {})
        .finally(() => {
          pullCloudFromServerRef.current?.({ force: false }).catch(() => {});
        });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingDebouncedSaves(false);
      } else if (document.visibilityState === 'visible') {
        refreshOnResume();
      }
    };
    const handlePageShow = () => refreshOnResume();
    const handleWindowFocus = () => refreshOnResume();

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleWindowFocus);
      flushPendingDebouncedSaves(true);
    };
  }, [flushPendingDebouncedSaves]);

  const handleManualBidirectionalSync = useCallback(async () => {
    const uid = currentUserRef.current?.uid;
    if (!uid) return { totalTrips: tripsRef.current.length, failed: 0 };
    const res = pullCloudFromServerRef.current
      ? await pullCloudFromServerRef.current({ force: true, pushLocalFirst: true })
      : { totalTrips: tripsRef.current.length, failed: 0 };
    if (res.failed === 0) {
      const curZh = langRef.current === 'zh' || langRef.current === 'zh-CN';
      showToast(
        curZh
          ? `已完成雲端雙向同步（共 ${res.totalTrips} 趟旅程）`
          : `Cloud sync complete (${res.totalTrips} trips)`
      );
    }
    return res;
  }, [showToast]);

  const scheduleCloudWrite = useCallback(
    (
      key: string,
      task: {
        type: 'user' | 'collab';
        uid?: string;
        collabId?: string;
        trip: Trip;
        editorName?: string;
      }
    ) => {
      const existingTimer = cloudSaveTimersRef.current.get(key);
      if (existingTimer) clearTimeout(existingTimer);
      pendingCloudWritesRef.current.set(key, task);

      const timer = setTimeout(() => {
        cloudSaveTimersRef.current.delete(key);
        const pending = pendingCloudWritesRef.current.get(key);
        if (!pending) return;
        pendingCloudWritesRef.current.delete(key);

        if (pending.type === 'collab' && pending.collabId) {
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            enqueueCollabSync(pending.collabId, pending.trip, pending.editorName);
          } else {
            syncCollaborativeTrip(pending.collabId, pending.trip, pending.editorName).catch((err) => {
              console.warn('Collab sync failed, enqueuing for offline reconnect:', err);
              enqueueCollabSync(pending.collabId!, pending.trip, pending.editorName);
            });
          }
        } else if (pending.type === 'user' && pending.uid) {
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            enqueueTripSave(pending.uid, pending.trip);
          } else {
            inFlightCloudSavesRef.current.add(pending.trip.id);
            saveTripToCloud(pending.uid, pending.trip)
              .then(() => {
                markTripsSyncedLocally({
                  [pending.trip.id]: Math.max(Date.now(), pending.trip.updatedAt || 0),
                });
              })
              .catch((err) => {
                console.warn('Cloud save failed, enqueuing for offline reconnect:', err);
                enqueueTripSave(pending.uid!, pending.trip);
                const curZh = langRef.current === 'zh' || langRef.current === 'zh-CN';
                showToast(
                  curZh ? '雲端同步稍有延遲，資料已安全保留於本機' : 'Cloud save delayed, queued offline'
                );
              })
              .finally(() => {
                inFlightCloudSavesRef.current.delete(pending.trip.id);
              });
          }
        }
      }, 400);

      cloudSaveTimersRef.current.set(key, timer);
    },
    [markTripsSyncedLocally, showToast]
  );

  const applyUpdateTrip = useCallback(
    (updatedTrip: Trip) => {
      persistTripsState((prevTrips) => {
        const idx = prevTrips.findIndex((tr) => tr.id === updatedTrip.id);
        return idx >= 0
          ? prevTrips.map((tr) => (tr.id === updatedTrip.id ? updatedTrip : tr))
          : [updatedTrip, ...prevTrips];
      });

      const user = currentUserRef.current;

      if (updatedTrip.collabId && updatedTrip.isCollaborative) {
        scheduleCloudWrite(`collab:${updatedTrip.collabId}`, {
          type: 'collab',
          collabId: updatedTrip.collabId,
          trip: updatedTrip,
          editorName: user?.displayName || user?.email || undefined,
        });
      }

      // Only sync to users/{uid}/trips if the trip belongs to this user (never hijack another owner's collab trip)
      const isOtherOwnersCollab =
        Boolean(updatedTrip.isCollaborative && updatedTrip.ownerId && user && updatedTrip.ownerId !== user.uid);
      if (user && !updatedTrip.id.startsWith('imported-share_') && !isOtherOwnersCollab) {
        scheduleCloudWrite(`user:${user.uid}:${updatedTrip.id}`, {
          type: 'user',
          uid: user.uid,
          trip: updatedTrip,
        });
      }
    },
    [persistTripsState, scheduleCloudWrite]
  );

  const handleUpdateTrip = useCallback(
    (updatedTrip: Trip) => {
      const user = currentUserRef.current;
      const perm = checkUserTripPermission(updatedTrip, user);
      if (updatedTrip.isCollaborative && !perm.canEdit) {
        const curZh = langRef.current === 'zh' || langRef.current === 'zh-CN';
        showToast(curZh ? '目前為僅檢視權限，無法編輯' : 'View-only permission');
        return;
      }
      applyUpdateTrip(updatedTrip);
    },
    [applyUpdateTrip, showToast]
  );

  const switchTab = useCallback((nextTab: TabType) => {
    setActiveTab(nextTab);
    if (nextTab !== 'timeline') {
      setIsPickMode(false);
    }
    resetSavedScrollPosition(0);
    if (typeof window !== 'undefined' && window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, []);

  const handleSelectTrip = useCallback(
    (id: string) => {
      setCurrentTripIdState(id);
      setCurrentTripId(id);
      setShowTripSwitcher(false);
      setMemoriesSpotId(undefined);
      setIsPickMode(false);
      resetSavedScrollPosition(0);
      const found = tripsRef.current.find((tr) => tr.id === id);
      if (found?.tripMode === 'memory') {
        switchTab('memories');
      } else if (found && activeTab === 'memories') {
        switchTab('timeline');
      }
    },
    [activeTab, switchTab]
  );

  const currentTrip = trips.find((tr) => tr.id === currentTripId) || trips[0] || PRESET_TRIPS[0];
  const permission = checkUserTripPermission(currentTrip, currentUser);

  useEffect(() => {
    if (currentTrip?.title) {
      document.title = `${currentTrip.title} - ${t.appName}`;
    } else {
      document.title = `${t.appName} - ${t.appSubtitle}`;
    }
  }, [currentTrip?.id, currentTrip?.title, t.appName, t.appSubtitle]);

  const handleSaveTripModal = (data: Partial<Trip> | Trip) => {
    const user = currentUserRef.current;
    if (tripModalData) {
      const perm = checkUserTripPermission(tripModalData, user);
      if (tripModalData.isCollaborative && !perm.canEdit) {
        showToast(isZh ? '目前為僅檢視權限，無法編輯' : 'View-only permission');
        return;
      }
      const updated: Trip = {
        ...tripModalData,
        ...data,
        updatedAt: Date.now(),
      } as Trip;
      handleUpdateTrip(updated);
    } else {
      let newTrip: Trip;
      if ('days' in data && Array.isArray(data.days) && 'id' in data && data.id) {
        newTrip = {
          ...(data as Trip),
          ownerId: user?.uid || (data as Trip).ownerId,
          ownerEmail: user?.email || (data as Trip).ownerEmail,
        };
      } else {
        newTrip = {
          id: `trip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ownerId: user?.uid,
          ownerEmail: user?.email || undefined,
          title: data.title || (isZh ? '新旅遊行程' : 'New Trip'),
          destination: data.destination || (isZh ? '旅遊目的地' : 'Destination'),
          startDate: data.startDate || getTodayLocal(),
          endDate: data.endDate || getTodayLocal(),
          currency: data.currency || 'JPY',
          budgetTotal: data.budgetTotal || 50000,
          coverGradient: data.coverGradient || 'from-emerald-600 via-teal-600 to-cyan-700',
          notes: data.notes || '',
          days: data.days || [],
          todos: [
            {
              id: `td-1-${Date.now()}`,
              title: isZh ? '確認護照效期大於 6 個月' : 'Check passport validity (6+ months)',
              category: 'preparation',
              completed: false,
              essential: true,
            },
            {
              id: `td-2-${Date.now()}`,
              title: isZh ? '投保海外旅遊平安險' : 'Travel insurance coverage',
              category: 'preparation',
              completed: false,
              essential: true,
            },
            {
              id: `td-3-${Date.now()}`,
              title: isZh ? '開通海外上網 eSIM / SIM 卡' : 'Set up travel eSIM / SIM',
              category: 'preparation',
              completed: false,
              essential: true,
            },
            {
              id: `td-4-${Date.now()}`,
              title: isZh ? '確認信用卡海外交易功能' : 'Enable credit card overseas transactions',
              category: 'preparation',
              completed: false,
              essential: true,
            },
          ],
          packingList: [
            { id: 'p1', name: isZh ? '護照正本' : 'Passport', category: 'documents', packed: false, essential: true },
            {
              id: 'p2',
              name: isZh ? '機票與住宿憑證' : 'Tickets & Vouchers',
              category: 'documents',
              packed: false,
              essential: true,
            },
            {
              id: 'p3',
              name: isZh ? '行動電源與充電線' : 'Power bank & Cable',
              category: 'electronics',
              packed: false,
              essential: true,
            },
          ],
          expenses: [],
          emergencyContacts: [
            { id: 'e1', name: isZh ? '當地報警電話' : 'Police', type: 'police', phone: '110' },
            { id: 'e2', name: isZh ? '救護車/急救' : 'Ambulance', type: 'ambulance', phone: '119' },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      }

      persistTripsState((prev) => {
        const exists = prev.some((tr) => tr.id === newTrip.id);
        return exists ? prev.map((tr) => (tr.id === newTrip.id ? newTrip : tr)) : [newTrip, ...prev];
      });
      setCurrentTripIdState(newTrip.id);
      setCurrentTripId(newTrip.id);

      if (newTrip.tripMode === 'memory') {
        setMemoriesSpotId(undefined);
        switchTab('memories');
      }

      if (user) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueTripSave(user.uid, newTrip);
        } else {
          inFlightCloudSavesRef.current.add(newTrip.id);
          saveTripToCloud(user.uid, newTrip)
            .then(() => {
              markTripsSyncedLocally({
                [newTrip.id]: Math.max(Date.now(), newTrip.updatedAt || 0),
              });
            })
            .catch(() => {
              enqueueTripSave(user.uid, newTrip);
            })
            .finally(() => {
              inFlightCloudSavesRef.current.delete(newTrip.id);
            });
        }
      }
    }
    setShowTripModal(false);
    setTripModalData(null);
    setTripModalInitialMode('planner');
  };

  const tripPendingDelete =
    (deleteTargetTripId ? trips.find((tr) => tr.id === deleteTargetTripId) : null) || currentTrip;

  const handleDeleteCurrentTrip = () => {
    setDeleteTargetTripId(currentTrip.id);
    setShowDeleteTripModal(true);
  };

  const handleRequestDeleteTrip = (trip: Trip) => {
    const targetPerm = checkUserTripPermission(trip, currentUserRef.current);
    if (trip.isCollaborative && !targetPerm.isOwner) {
      showToast(isZh ? '僅擁有者可刪除共編旅程' : 'Only owner can delete this trip');
      return;
    }
    setShowTripSwitcher(false);
    setDeleteTargetTripId(trip.id);
    setShowDeleteTripModal(true);
  };

  const handleConfirmDeleteTrip = () => {
    const currentAll = tripsRef.current;
    if (currentAll.length <= 1) return;
    const targetTrip =
      (deleteTargetTripId ? currentAll.find((tr) => tr.id === deleteTargetTripId) : null) ||
      currentTrip;
    if (!targetTrip) return;

    const user = currentUserRef.current;
    const targetPerm = checkUserTripPermission(targetTrip, user);
    if (targetTrip.isCollaborative && !targetPerm.isOwner) {
      showToast(isZh ? '僅擁有者可刪除共編旅程' : 'Only owner can delete this trip');
      return;
    }

    const tripToDeleteId = targetTrip.id;
    cancelPendingWriteForTrip(user?.uid, tripToDeleteId, targetTrip.collabId);

    recordDeletedTripId(tripToDeleteId);
    if (user) {
      removePendingTripSave(user.uid, tripToDeleteId).catch(() => {});
    }

    const remaining = persistTripsState((prev) => prev.filter((tr) => tr.id !== tripToDeleteId));
    if (tripToDeleteId === currentTrip.id) {
      const nextActiveId = remaining[0]?.id || '';
      setCurrentTripIdState(nextActiveId);
      setCurrentTripId(nextActiveId);
    }
    setShowDeleteTripModal(false);
    setDeleteTargetTripId(null);

    idbDeleteMediaByTrip(tripToDeleteId)
      .then(() => garbageCollectOrphanedMedia(remaining))
      .catch(() => {});

    if (user) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueTripDelete(user.uid, tripToDeleteId);
      } else {
        deleteTripFromCloud(user.uid, tripToDeleteId).catch(() => {
          enqueueTripDelete(user.uid, tripToDeleteId);
        });
      }
    }
    showToast(isZh ? '已刪除旅程' : 'Trip deleted');
  };

  const handleSaveItem = (itemData: Omit<ItineraryItem, 'id'>, existingId?: string) => {
    const latestTrip = tripsRef.current.find((tr) => tr.id === currentTrip.id) || currentTrip;
    if (!latestTrip || !editingItemData) return;

    const user = currentUserRef.current;
    const perm = checkUserTripPermission(latestTrip, user);
    if (latestTrip.isCollaborative && !perm.canEdit) {
      showToast(isZh ? '目前為僅檢視權限，無法編輯' : 'View-only permission');
      return;
    }
    const { dayNumber } = editingItemData;

    const rawPhotos = itemData.memoryPhotos || [];
    const sanitizedPhotos = rawPhotos.slice(0, 3);
    const sanitizedItemData: Omit<ItineraryItem, 'id'> = {
      ...itemData,
      memoryPhotos: sanitizedPhotos.length > 0 ? sanitizedPhotos : undefined,
    };

    let targetItemId = existingId || '';
    const updatedDays = latestTrip.days.map((day) => {
      if (day.dayNumber !== dayNumber) return day;

      let nextItems: ItineraryItem[];
      if (existingId) {
        const remaining = day.items.filter((it) => it.id !== existingId);
        const updatedItem: ItineraryItem = { ...sanitizedItemData, id: existingId };
        const { targetIndex } = findInsertionPosition(remaining, updatedItem.startTime);
        nextItems = [
          ...remaining.slice(0, targetIndex),
          updatedItem,
          ...remaining.slice(targetIndex),
        ];
      } else {
        const generatedId = `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        targetItemId = generatedId;
        const newItem: ItineraryItem = {
          ...sanitizedItemData,
          id: generatedId,
        };
        const { targetIndex } = findInsertionPosition(day.items, newItem.startTime);
        nextItems = [
          ...day.items.slice(0, targetIndex),
          newItem,
          ...day.items.slice(targetIndex),
        ];
      }

      return { ...day, items: nextItems };
    });

    // Bidirectional synchronization with trip.memories (never steals another spot's photo or clobbers custom captions)
    const targetDate =
      latestTrip.days.find((d) => d.dayNumber === dayNumber)?.date || latestTrip.startDate;
    const existingMemories = latestTrip.memories || [];

    const photoSet = new Set(sanitizedPhotos);
    const removedMemories: string[] = [];
    const retainedMemories = existingMemories.filter((m) => {
      if (m.spotId === targetItemId) {
        const keep = sanitizedPhotos.length > 0 && photoSet.has(m.imageUrl);
        if (!keep && m.id) removedMemories.push(m.id);
        return keep;
      }
      return true;
    });

    const nowTs = Date.now();
    const nextDeletedItemIds =
      removedMemories.length > 0
        ? {
            ...(latestTrip.deletedItemIds || {}),
            ...Object.fromEntries(removedMemories.map((id) => [id, nowTs])),
          }
        : latestTrip.deletedItemIds;

    const updatedMemories = [...retainedMemories];
    if (sanitizedPhotos.length > 0) {
      sanitizedPhotos.forEach((photoUrl, pIdx) => {
        const existingMemIndex = updatedMemories.findIndex(
          (m) => m.spotId === targetItemId && m.imageUrl === photoUrl
        );

        if (existingMemIndex >= 0) {
          const existingMem = updatedMemories[existingMemIndex];
          updatedMemories[existingMemIndex] = {
            ...existingMem,
            spotTitle: sanitizedItemData.title,
            dayNumber,
            date: targetDate,
            mood: sanitizedItemData.memoryMood || existingMem.mood || '✨',
            location: sanitizedItemData.locationName || sanitizedItemData.title,
            caption: existingMem.caption || sanitizedItemData.notes || sanitizedItemData.title,
            googlePhotosUrl: sanitizedItemData.googlePhotosUrl || existingMem.googlePhotosUrl,
          };
        } else {
          updatedMemories.push({
            id: `mem-${targetItemId}-${Date.now()}-${pIdx}`,
            imageUrl: photoUrl,
            caption: sanitizedItemData.notes || sanitizedItemData.title,
            spotId: targetItemId,
            spotTitle: sanitizedItemData.title,
            dayNumber,
            date: targetDate,
            mood: sanitizedItemData.memoryMood || '✨',
            location: sanitizedItemData.locationName || sanitizedItemData.title,
            googlePhotosUrl: sanitizedItemData.googlePhotosUrl || undefined,
            createdAt: Date.now() + pIdx * 10,
          });
        }
      });
    }

    const updatedTripObj: Trip = {
      ...latestTrip,
      days: updatedDays,
      memories: updatedMemories,
      ...(nextDeletedItemIds ? { deletedItemIds: nextDeletedItemIds } : {}),
      updatedAt: nowTs,
    };
    handleUpdateTrip(updatedTripObj);
    if (removedMemories.length > 0) {
      garbageCollectOrphanedMedia(
        tripsRef.current.map((tr) => (tr.id === updatedTripObj.id ? updatedTripObj : tr))
      ).catch(() => {});
    }

    setShowItemModal(false);
    setEditingItemData(null);
    setItemDraftBackup(null);
    setIsPickMode(false);
    setPickedCoords(null);

    if (user) {
      showToast(isZh ? '已儲存並同步' : 'Saved & synced');
    } else {
      showToast(isZh ? '已儲存於本機' : 'Saved locally');
    }
  };

  // Properly close ItemEditModal, switch to Timeline, and enter map-pick mode (preserving unsaved form draft)
  const handleStartMapPick = (currentDraft?: Partial<ItineraryItem>) => {
    if (currentDraft) {
      setItemDraftBackup(currentDraft);
    }
    setShowItemModal(false);
    if (activeTab !== 'timeline') {
      setActiveTab('timeline');
    }
    setIsPickMode(true);
    showToast(isZh ? '請直接點擊地圖上的位置選點' : 'Tap anywhere on the map to pick coordinates');
  };

  const handlePickLocation = (lat: number, lng: number) => {
    setPickedCoords({ lat, lng });
    setIsPickMode(false);
    setShowItemModal(true);
  };

  const handleCancelMapPick = useCallback(() => {
    setIsPickMode(false);
    if (editingItemData) {
      setShowItemModal(true);
    }
  }, [editingItemData]);

  const mergedEditingItem = useMemo<ItineraryItem | undefined>(() => {
    if (!editingItemData) return undefined;
    if (!itemDraftBackup) return editingItemData.item;
    return { ...(editingItemData.item || {}), ...itemDraftBackup } as ItineraryItem;
  }, [editingItemData, itemDraftBackup]);

  const handleImportTrip = async (imported: Trip) => {
    const exists = tripsRef.current.some((tr) => tr.id === imported.id);
    let baseTrip = imported;
    if (exists) {
      const newId = `trip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      baseTrip = await rebindTripMediaIds(imported, newId);
    }
    const {
      collabId: _c,
      collaborators: _col,
      editorEmails: _ed,
      viewerEmails: _vw,
      generalAccess: _ga,
      ...cleanBase
    } = baseTrip;
    const user = currentUserRef.current;
    const sanitized: Trip = {
      ...cleanBase,
      isCollaborative: false,
      ...(user?.uid || baseTrip.ownerId ? { ownerId: user?.uid || baseTrip.ownerId } : {}),
      ...(user?.email && !baseTrip.ownerEmail ? { ownerEmail: user.email } : {}),
      updatedAt: Date.now(),
    };

    persistTripsState((prevTrips) => {
      const idx = prevTrips.findIndex((tr) => tr.id === sanitized.id);
      return idx >= 0
        ? prevTrips.map((tr) => (tr.id === sanitized.id ? sanitized : tr))
        : [sanitized, ...prevTrips];
    });
    setCurrentTripIdState(sanitized.id);
    setCurrentTripId(sanitized.id);

    if (user && !sanitized.id.startsWith('imported-share_')) {
      cancelPendingWriteForTrip(user.uid, sanitized.id);
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        enqueueTripSave(user.uid, sanitized);
        showToast(
          isZh
            ? `已匯入旅程「${sanitized.title}」（連線後自動同步）`
            : `Imported "${sanitized.title}" (will sync online)`
        );
      } else {
        const sig = stableContentSignature(sanitized);
        recentlyUploadedSigRef.current.set(sanitized.id, { sig, at: Date.now() });
        inFlightCloudSavesRef.current.add(sanitized.id);
        try {
          const saved = await saveTripToCloud(user.uid, sanitized);
          markTripsSyncedLocally({
            [sanitized.id]: Math.max(Date.now(), saved.lastSyncedAt || sanitized.updatedAt || 0),
          });
          showToast(
            isZh
              ? `已匯入「${sanitized.title}」並同步至雲端`
              : `Imported "${sanitized.title}" & synced to cloud`
          );
        } catch (err) {
          console.warn('Immediate import cloud sync failed, enqueuing offline:', err);
          recentlyUploadedSigRef.current.delete(sanitized.id);
          enqueueTripSave(user.uid, sanitized);
          showToast(
            isZh
              ? `已匯入「${sanitized.title}」（雲端稍後自動重試）`
              : `Imported "${sanitized.title}" (cloud retry queued)`
          );
        } finally {
          inFlightCloudSavesRef.current.delete(sanitized.id);
        }
      }
    } else {
      showToast(isZh ? `已匯入旅程「${sanitized.title}」` : `Imported "${sanitized.title}"`);
    }
  };

  const dayCount = currentTrip.days.length;
  const nightCount = Math.max(dayCount - 1, 0);
  const mobileTabLabels = TAB_MOBILE_LABELS[lang] || TAB_MOBILE_LABELS.zh;

  return (
    <div className="min-h-dvh flex flex-col bg-[#FAF9F6] dark:bg-[#090D16] text-slate-900 dark:text-slate-100 transition-colors overflow-x-clip">
      {/* Persistent iOS Safe-Area Status Bar Scrim (keeps Dynamic Island / clock crisp even when header hides) */}
      <div
        aria-hidden="true"
        className="sm:hidden fixed top-0 inset-x-0 h-[env(safe-area-inset-top,0px)] bg-[#FAF9F6]/90 dark:bg-[#090D16]/90 backdrop-blur-xl z-[46] pointer-events-none"
      />

      {/* Top Navigation Bar (Zero horizontal overflow on 360-390px mobile; spacious 3-zone bar on Desktop) */}
      <header
        className={`sticky top-0 z-40 bg-white/90 dark:bg-[#111827]/90 backdrop-blur-xl border-b border-[#E5E2DC]/90 dark:border-slate-800/90 pt-[env(safe-area-inset-top,0px)] max-sm:transition-transform max-sm:duration-300 max-sm:ease-[cubic-bezier(0.32,0.72,0,1)] ios-chrome ${
          isNavHidden ? 'max-sm:-translate-y-full' : 'max-sm:translate-y-0'
        }`}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Brand Logo + (Desktop Wordmark) */}
          <div className="flex items-center gap-2 shrink-0">
            <HiyoriLogo className="w-8 h-8 shrink-0" />
            <h1 className="hidden sm:block font-bold text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
              {t.appName}
            </h1>
          </div>

          {/* Center/Right: Trip Switcher (flex-1 on mobile so it NEVER overflows 390px!) + Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 flex-1 sm:flex-initial justify-end min-w-0">
            {/* Trip Switcher */}
            <div className="relative flex-1 sm:flex-initial min-w-0" ref={tripSwitcherRef}>
              <button
                type="button"
                onClick={() => setShowTripSwitcher(!showTripSwitcher)}
                aria-expanded={showTripSwitcher}
                aria-haspopup="listbox"
                className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-1.5 h-11 sm:h-10 px-3 rounded-xl border border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-900 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 transition sm:max-w-[280px] lg:max-w-[380px] cursor-pointer active:scale-[0.98]"
                title={isZh ? '切換旅程' : 'Switch Trip'}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Plane className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
                  <span className="min-w-0 text-left leading-tight">
                    <span className="block truncate font-bold text-xs text-slate-900 dark:text-white">
                      {currentTrip.title}
                    </span>
                    <span className="block truncate text-[10px] font-mono tabular-nums font-medium text-slate-500 dark:text-slate-400">
                      {currentTrip.destination} · {formatDateSlash(currentTrip.startDate).slice(5)}–{formatDateSlash(currentTrip.endDate).slice(5)}
                    </span>
                  </span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {(() => {
                if (!showTripSwitcher) return null;

                const tripRows = trips.map((tr) => {
                  const rowPerm = checkUserTripPermission(tr, currentUser);
                  const canEditRow = !tr.isCollaborative || rowPerm.canEdit;
                  const canDeleteRow = !tr.isCollaborative || rowPerm.isOwner;
                  const isActive = tr.id === currentTrip.id;

                  return (
                    <div
                      key={tr.id}
                      className={`px-3.5 py-2.5 min-h-[54px] sm:min-h-[48px] transition text-xs flex items-center justify-between gap-2 ${
                        isActive
                          ? 'bg-teal-50/75 dark:bg-teal-950/35 text-teal-900 dark:text-teal-100'
                          : 'hover:bg-[#FAF9F6] dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectTrip(tr.id);
                          setShowTripSwitcher(false);
                        }}
                        className="flex-1 min-w-0 text-left flex items-center gap-2.5 py-1 cursor-pointer"
                      >
                        <span className="w-4 h-4 flex items-center justify-center shrink-0">
                          {isActive && (
                            <Check className="w-4 h-4 text-teal-700 dark:text-teal-400 stroke-[2.5]" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm sm:text-xs truncate ${
                              isActive ? 'font-bold' : 'font-semibold'
                            }`}
                          >
                            {tr.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate mt-0.5">
                            {tr.destination} · {formatDateSlash(tr.startDate)}
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center gap-0.5 shrink-0">
                        {canEditRow && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowTripSwitcher(false);
                              setTripModalData(tr);
                              setShowTripModal(true);
                            }}
                            className="min-w-[44px] min-h-[44px] sm:min-w-[34px] sm:min-h-[34px] flex items-center justify-center rounded-xl text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-white/80 dark:hover:bg-slate-700/70 transition cursor-pointer"
                            title={isZh ? '編輯旅程' : 'Edit trip'}
                            aria-label={isZh ? `編輯 ${tr.title}` : `Edit ${tr.title}`}
                          >
                            <Edit className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                          </button>
                        )}

                        {canDeleteRow && (
                          <button
                            type="button"
                            disabled={trips.length <= 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRequestDeleteTrip(tr);
                            }}
                            className={`min-w-[44px] min-h-[44px] sm:min-w-[34px] sm:min-h-[34px] flex items-center justify-center rounded-xl transition ${
                              trips.length <= 1
                                ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                : 'text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer'
                            }`}
                            title={isZh ? '刪除旅程' : 'Delete trip'}
                            aria-label={isZh ? `刪除 ${tr.title}` : `Delete ${tr.title}`}
                          >
                            <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });

                if (isMobile) {
                  return (
                    <IosModalSheet
                      onClose={() => setShowTripSwitcher(false)}
                      variant="grouped"
                      zIndexClass="z-[80]"
                      ariaLabel={isZh ? '切換旅程' : 'Switch trip'}
                    >
                      <IosNavBar
                        title={isZh ? '切換旅程' : 'Switch Trip'}
                        subtitle={`${trips.length} ${isZh ? '趟旅程' : 'trips'}`}
                        leftLabel={t.newTrip}
                        leftIcon={<Plus className="w-4 h-4" />}
                        onLeftClick={() => {
                          setShowTripSwitcher(false);
                          setTripModalData(null);
                          setShowTripModal(true);
                        }}
                        rightLabel={isZh ? '完成' : 'Done'}
                        onRightClick={() => setShowTripSwitcher(false)}
                      />

                      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 space-y-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
                        <IosInsetGroup header={isZh ? '我的旅程' : 'My Trips'}>
                          {tripRows}
                        </IosInsetGroup>

                        <IosInsetGroup divided={false}>
                          <button
                            type="button"
                            onClick={() => {
                              setShowTripSwitcher(false);
                              setShowGlobalHubModal(true);
                            }}
                            className="w-full min-h-[50px] px-4 py-2.5 flex items-center justify-between text-left hover:bg-[#FAF9F6] dark:hover:bg-slate-800/50 transition cursor-pointer"
                          >
                            <span className="flex items-center gap-2.5 text-sm font-bold text-teal-700 dark:text-teal-300">
                              <Compass className="w-4 h-4 shrink-0" />
                              <span>{isZh ? '足跡時光庫' : 'Travel Footprint Hub'}</span>
                            </span>
                            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                          </button>
                        </IosInsetGroup>
                      </div>
                    </IosModalSheet>
                  );
                }

                return (
                  <div className="absolute right-0 top-full mt-1.5 w-[348px] max-h-[80dvh] flex flex-col bg-[#FAF9F6] dark:bg-[#090D16] rounded-2xl shadow-2xl border border-[#E5E2DC] dark:border-slate-800 p-2.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2 pb-2 flex justify-between items-center text-[11px] font-bold text-slate-500 dark:text-slate-400 font-mono tabular-nums shrink-0">
                      <span>
                        {isZh ? '所有旅程' : 'All Trips'} ({trips.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowTripSwitcher(false);
                          setTripModalData(null);
                          setShowTripModal(true);
                        }}
                        className="text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1 font-sans text-xs font-semibold cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t.newTrip}</span>
                      </button>
                    </div>

                    <div className="flex-1 max-h-72 overflow-y-auto overscroll-contain rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC]/85 dark:border-slate-800 divide-y divide-[#E5E2DC]/70 dark:divide-slate-800">
                      {tripRows}
                    </div>

                    <div className="pt-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setShowTripSwitcher(false);
                          setShowGlobalHubModal(true);
                        }}
                        className="w-full min-h-[40px] py-2 px-3 rounded-xl bg-white hover:bg-[#F3F1EC] dark:bg-[#111827] dark:hover:bg-slate-800 border border-[#E5E2DC] dark:border-slate-800 text-teal-700 dark:text-teal-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Compass className="w-3.5 h-3.5 shrink-0" />
                        <span>{isZh ? '足跡時光庫' : 'Travel Footprint Hub'}</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Global Travel Hub (Desktop/Tablet) */}
            <button
              type="button"
              onClick={() => setShowGlobalHubModal(true)}
              className="hidden sm:flex h-9 items-center justify-center gap-1.5 px-3 rounded-xl border border-[#E5E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition active:scale-95 text-xs font-semibold shrink-0 whitespace-nowrap cursor-pointer"
              title={isZh ? '搜尋所有過往旅程與月曆足跡' : 'Browse all trips & footprint map'}
              aria-label={isZh ? '足跡時光庫' : 'Travel Footprint Hub'}
            >
              <Compass className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
              <span>{isZh ? '足跡時光庫' : 'Hub'}</span>
            </button>

            {/* Primary Action: New Trip (Desktop/Tablet) */}
            <button
              type="button"
              onClick={() => {
                setTripModalData(null);
                setShowTripModal(true);
              }}
              className="hidden sm:flex h-9 items-center justify-center gap-1.5 px-3.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs font-bold transition active:scale-95 shrink-0 whitespace-nowrap cursor-pointer"
              title={t.newTrip}
              aria-label={t.newTrip}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>{t.newTrip}</span>
            </button>

            {/* Google Cloud Auth & Sync */}
            <AuthButton
              lang={lang}
              localTrips={trips}
              onManualBidirectionalSync={handleManualBidirectionalSync}
              onOpenChange={setIsAuthMenuOpen}
            />

            {/* Unified App Menu (includes Settings & Global Hub on mobile) */}
            <AppMenu
              lang={lang}
              onSelectLang={(selectedLang) => {
                setLang(selectedLang);
                setStoredLanguage(selectedLang);
              }}
              isDark={isDark}
              onToggleDarkMode={toggleDarkMode}
              onOpenImportExport={() => setShowImportExportModal(true)}
              onOpenExportPDF={() => setShowPDFExportModal(true)}
              onOpenShareTrip={() => setShowShareModal(true)}
              onOpenCollaborate={() => setShowCollabModal(true)}
              onOpenGlobalHub={() => setShowGlobalHubModal(true)}
              onOpenSettings={() => setShowSettingsModal(true)}
              onOpenChange={setIsAppMenuOpen}
              onResetData={async () => {
                await resetAllLocalData();
                window.location.reload();
              }}
            />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-3 sm:py-5 pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] sm:pb-16 space-y-3 sm:space-y-4">
        {/* Collaborative Trip Connected Alert */}
        {collabBannerTrip && (
          <div className="bg-emerald-950/90 text-white px-3.5 py-2.5 rounded-2xl shadow-sm flex items-center justify-between gap-2.5 border border-emerald-800/80 animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5 min-w-0">
              <Radio className="w-4 h-4 text-emerald-400 shrink-0" />
              <p className="text-xs font-semibold text-white truncate">
                {isZh ? `共編中：${collabBannerTrip.title}` : `Collaborating: ${collabBannerTrip.title}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCollabBannerTrip(null)}
              className="min-h-[40px] sm:min-h-[34px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition active:scale-95 shrink-0 cursor-pointer"
            >
              {isZh ? '確定' : 'OK'}
            </button>
          </div>
        )}

        {/* Shared Trip Banner Alert */}
        {sharedBannerTrip && (
          <div className="bg-slate-900 text-white px-3.5 py-2.5 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-2.5 border border-slate-800 animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5 min-w-0">
              <Users className="w-4 h-4 text-teal-300 shrink-0" />
              <p className="font-semibold text-xs text-white truncate">
                {isZh ? `親友分享：${sharedBannerTrip.title}` : `Shared: ${sharedBannerTrip.title}`}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <button
                type="button"
                onClick={async () => {
                  const newId = `trip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                  const rebound = await rebindTripMediaIds(sharedBannerTrip, newId);
                  const {
                    collabId: _c,
                    collaborators: _col,
                    editorEmails: _ed,
                    viewerEmails: _vw,
                    generalAccess: _ga,
                    ...cleanRebound
                  } = rebound;
                  const copyTrip: Trip = {
                    ...cleanRebound,
                    id: newId,
                    title: `${sharedBannerTrip.title} (${isZh ? '副本' : 'Copy'})`,
                    isCollaborative: false,
                    ...(currentUserRef.current?.uid || sharedBannerTrip.ownerId
                      ? { ownerId: currentUserRef.current?.uid || sharedBannerTrip.ownerId }
                      : {}),
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  };
                  applyUpdateTrip(copyTrip);
                  setCurrentTripIdState(copyTrip.id);
                  setCurrentTripId(copyTrip.id);
                  setSharedBannerTrip(null);
                  showToast(isZh ? '已複製儲存至我的行程' : 'Saved copy to my trips');
                }}
                className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition active:scale-95 flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isZh ? '存成我的副本' : 'Save Copy'}</span>
              </button>
              <button
                type="button"
                onClick={() => setSharedBannerTrip(null)}
                className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                aria-label={isZh ? '關閉' : 'Close'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Slim Editorial Trip Ribbon (Shown ONLY on Timeline tab so Live/Expenses/Todos/Memories start immediately above the fold!) */}
        {activeTab === 'timeline' && (!isHeroExpanded ? (
          <div className="rounded-2xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 px-3 py-2 sm:px-5 sm:py-3 flex items-center justify-between gap-2 animate-in fade-in duration-150">
            <button
              type="button"
              onClick={() => setIsHeroExpanded(true)}
              className="min-w-0 flex-1 text-left space-y-0.5 cursor-pointer group"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 font-mono tabular-nums min-w-0">
                <span className="font-sans font-semibold text-teal-700 dark:text-teal-400 truncate max-w-[115px] xs:max-w-[155px] sm:max-w-none">
                  {currentTrip.destination}
                </span>
                <span aria-hidden="true" className="shrink-0">
                  ·
                </span>
                <span className="shrink-0 whitespace-nowrap">
                  {formatDateSlash(currentTrip.startDate)} – {formatDateSlash(currentTrip.endDate).slice(5)}
                </span>
                <span aria-hidden="true" className="hidden xs:inline shrink-0">
                  ·
                </span>
                <span className="hidden xs:inline shrink-0 whitespace-nowrap">
                  {dayCount}天{nightCount}夜
                </span>
              </div>
              <h2 className="hidden sm:block font-bold text-slate-900 dark:text-white text-base tracking-tight truncate group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
                {currentTrip.title}
              </h2>
            </button>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl border border-[#E5E2DC] dark:border-slate-800 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center transition cursor-pointer active:scale-95"
                title={isZh ? '分享行程' : 'Share Trip'}
                aria-label={isZh ? '分享行程' : 'Share Trip'}
              >
                <Share2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              </button>
              {permission.canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setTripModalData(currentTrip);
                    setShowTripModal(true);
                  }}
                  className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl border border-[#E5E2DC] dark:border-slate-800 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center transition cursor-pointer active:scale-95"
                  title={isZh ? '編輯行程' : 'Edit Trip'}
                  aria-label={isZh ? '編輯行程' : 'Edit Trip'}
                >
                  <Edit className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsHeroExpanded(true)}
                className="min-w-[44px] h-11 sm:min-w-0 sm:h-9 sm:px-3 rounded-xl text-xs font-semibold text-teal-700 dark:text-teal-300 bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-800 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 flex items-center justify-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition active:scale-95"
                title={isZh ? '展開行程封面' : 'Expand Trip Details'}
                aria-label={isZh ? '展開行程封面' : 'Expand Trip Details'}
              >
                <span className="hidden sm:inline">{isZh ? '詳情' : 'Info'}</span>
                <ChevronDown className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* Expanded Editorial Trip Cover Card */
          <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-4 sm:p-6 shadow-xs animate-in fade-in duration-150">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <span className="font-sans font-bold text-teal-700 dark:text-teal-400">
                    {currentTrip.destination}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {formatDateSlash(currentTrip.startDate)} ~ {formatDateSlash(currentTrip.endDate)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {t.daysCount
                      .replace('{d}', String(dayCount))
                      .replace('{n}', String(nightCount))}
                  </span>
                  {currentTrip.isCollaborative && (
                    <>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={() => setShowCollabModal(true)}
                        className="font-sans text-teal-700 dark:text-teal-300 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer min-h-[32px]"
                        title={isZh ? '管理成員與權限' : 'Manage Members'}
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>
                          {permission.isOwner
                            ? isZh
                              ? '擁有者 · 多人共編'
                              : 'Owner · Collaborative'
                            : permission.role === 'editor'
                            ? isZh
                              ? '協作編輯中'
                              : 'Editor'
                            : isZh
                            ? '僅檢視模式'
                            : 'View Only'}
                        </span>
                      </button>
                    </>
                  )}
                </div>

                <h2 className="font-extrabold text-xl sm:text-2xl tracking-tight text-slate-900 dark:text-white break-words">
                  {currentTrip.title}
                </h2>

                {currentTrip.notes && (
                  <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm max-w-2xl leading-relaxed whitespace-pre-line">
                    {currentTrip.notes}
                  </p>
                )}
              </div>

              {/* Balanced Action Grid (44px+ touch targets, no orphaned second row) */}
              <div className="w-full md:w-auto grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 pt-3 md:pt-0 border-t border-[#E5E2DC] dark:border-slate-800 md:border-0 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCollabModal(true)}
                  className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-900 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition whitespace-nowrap cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                  <span>{currentTrip.isCollaborative ? (isZh ? '成員權限' : 'Members') : isZh ? '多人共編' : 'Collaborate'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowShareModal(true)}
                  className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-900 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition whitespace-nowrap cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                  <span>{isZh ? '分享行程' : 'Share'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPDFExportModal(true)}
                  className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-900 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition whitespace-nowrap cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span>{t.exportPDF}</span>
                </button>

                {permission.canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setTripModalData(currentTrip);
                      setShowTripModal(true);
                    }}
                    className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition whitespace-nowrap cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>{t.editTrip}</span>
                  </button>
                )}

                <div className="col-span-2 sm:col-span-1 flex items-center justify-between sm:justify-end gap-2">
                  {permission.isOwner && trips.length > 1 && (
                    <button
                      type="button"
                      onClick={handleDeleteCurrentTrip}
                      className="min-h-[44px] sm:min-h-[40px] px-3 rounded-xl border border-[#E5E2DC] dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-500 hover:text-rose-700 dark:text-slate-400 dark:hover:text-rose-300 flex items-center justify-center gap-1.5 text-xs font-semibold transition cursor-pointer"
                      title={t.deleteTrip}
                      aria-label={t.deleteTrip}
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="sm:hidden">{t.deleteTrip}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsHeroExpanded(false)}
                    className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-xs font-semibold transition flex items-center gap-1 whitespace-nowrap cursor-pointer ml-auto"
                    title={isZh ? '收合封面' : 'Collapse'}
                  >
                    <span>{isZh ? '收合封面' : 'Collapse'}</span>
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Read-Only Collaborator Viewer Notice Banner */}
        {!permission.canEdit && currentTrip.isCollaborative && (
          <div className="bg-white dark:bg-[#111827] text-slate-800 dark:text-slate-100 px-4 py-2.5 rounded-2xl border border-[#E5E2DC] dark:border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5">
              <Eye className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
              <p className="text-slate-600 dark:text-slate-300 text-xs">
                {isZh ? (
                  <>
                    目前為<strong className="text-slate-900 dark:text-white font-semibold">僅檢視權限</strong>
                    。如需編輯請向擁有者申請權限。
                  </>
                ) : (
                  'View-only access. Contact the trip owner to request editing permissions.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCollabModal(true)}
              className="min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-semibold text-xs shrink-0 self-end sm:self-auto transition cursor-pointer"
            >
              {isZh ? '權限清單' : 'Permissions'}
            </button>
          </div>
        )}

        {/* Desktop Tab Navigation Bar */}
        <div
          role="tablist"
          aria-label={isZh ? '旅程功能分頁' : 'Trip sections'}
          className="hidden sm:flex items-center gap-1 p-1.5 bg-white dark:bg-[#111827] rounded-2xl border border-[#E5E2DC] dark:border-slate-800 overflow-x-auto scrollbar-none ios-chrome"
        >
          {(
            [
              { id: 'timeline' as TabType, label: t.timeline, Icon: Route },
              { id: 'live' as TabType, label: t.live, Icon: Sparkles },
              { id: 'expenses' as TabType, label: t.expenses, Icon: Wallet },
              { id: 'prep' as TabType, label: TAB_DESKTOP_PREP_LABELS[lang] || '待辦', Icon: CheckCircle },
              { id: 'memories' as TabType, label: t.memories, Icon: Camera },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(id)}
                className={`flex-1 min-w-[96px] min-h-[40px] py-2 px-3 rounded-xl font-bold text-xs transition-all duration-150 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-[#F3F1EC] dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Smart 3-Phase Trip Context Strip (Shown on Timeline planner tab, persisted dismissal) */}
        {activeTab === 'timeline' &&
          currentTrip.tripMode !== 'memory' &&
          !dismissedPhaseTripIds[currentTrip.id] && (
            <TripPhaseBanner
              trip={currentTrip}
              lang={lang}
              activeTab={activeTab}
              onSwitchTab={switchTab}
              onJumpToDay={(dayNum) => {
                setRequestedTimelineDay({ dayNumber: dayNum, nonce: Date.now() });
                switchTab('timeline');
              }}
              onDismiss={() => {
                setDismissedPhaseTripIds((prev) => {
                  const next = { ...prev, [currentTrip.id]: true };
                  try {
                    localStorage.setItem('hiyori_dismissed_phase_banners_v1', JSON.stringify(next));
                  } catch {}
                  return next;
                });
              }}
            />
          )}

        {/* Active Tab Content */}
        <Suspense fallback={<TabLoadingFallback />}>
          {activeTab === 'timeline' && (
            <TimelineTab
              trip={currentTrip}
              lang={lang}
              canEdit={permission.canEdit}
              isNavHidden={isNavHidden}
              requestedDay={requestedTimelineDay}
              onUpdateTrip={handleUpdateTrip}
              onOpenAddItem={(dayNumber, suggestedStartTime) => {
                if (currentTrip.isCollaborative && !permission.canEdit) {
                  showToast(isZh ? '目前為僅檢視權限' : 'View-only mode');
                  return;
                }
                setPickedCoords(null);
                setItemDraftBackup(null);
                setEditingItemData({ dayNumber, initialStartTime: suggestedStartTime });
                setShowItemModal(true);
              }}
              onOpenEditItem={(item, dayNumber) => {
                if (currentTrip.isCollaborative && !permission.canEdit) {
                  showToast(isZh ? '目前為僅檢視權限' : 'View-only mode');
                  return;
                }
                setPickedCoords(null);
                setItemDraftBackup(null);
                setEditingItemData({ item, dayNumber });
                setShowItemModal(true);
              }}
              isPickMode={isPickMode}
              onStartMapPick={handleStartMapPick}
              onCancelMapPick={handleCancelMapPick}
              pickedCoords={pickedCoords}
              onPickLocation={handlePickLocation}
              onOpenMemories={(spotId) => {
                setMemoriesSpotId(spotId);
                switchTab('memories');
              }}
              requireAuth={requireAuth}
            />
          )}

          {activeTab === 'live' && (
            <LiveCompanionTab
              trip={currentTrip}
              lang={lang}
              canEdit={permission.canEdit}
              onUpdateTrip={handleUpdateTrip}
              requireAuth={requireAuth}
              onOpenEditItem={(item, dayNumber) => {
                if (currentTrip.isCollaborative && !permission.canEdit) {
                  showToast(isZh ? '目前為僅檢視權限' : 'View-only mode');
                  return;
                }
                setPickedCoords(null);
                setItemDraftBackup(null);
                setEditingItemData({ item, dayNumber });
                setShowItemModal(true);
              }}
              onOpenAddItem={(dayNumber, suggestedStartTime) => {
                if (currentTrip.isCollaborative && !permission.canEdit) {
                  showToast(isZh ? '目前為僅檢視權限' : 'View-only mode');
                  return;
                }
                setPickedCoords(null);
                setItemDraftBackup(null);
                setEditingItemData({ dayNumber, initialStartTime: suggestedStartTime });
                setShowItemModal(true);
              }}
              onNavigateToTimelineDay={(dayNum) => {
                setRequestedTimelineDay({ dayNumber: dayNum, nonce: Date.now() });
                switchTab('timeline');
              }}
              onNavigateToPrep={(subTab) => {
                setRequestedPrepSubTab({ tab: subTab, nonce: Date.now() });
                switchTab('prep');
              }}
            />
          )}

          {activeTab === 'expenses' && (
            <ExpensesTab
              trip={currentTrip}
              lang={lang}
              canEdit={permission.canEdit}
              onUpdateTrip={handleUpdateTrip}
              requireAuth={requireAuth}
            />
          )}

          {activeTab === 'prep' && (
            <NotesAndPrepTab
              trip={currentTrip}
              lang={lang}
              canEdit={permission.canEdit}
              onUpdateTrip={handleUpdateTrip}
              requireAuth={requireAuth}
              requestedSubTab={requestedPrepSubTab}
              onJumpToDay={(dayNumber) => {
                setRequestedTimelineDay({ dayNumber, nonce: Date.now() });
                switchTab('timeline');
              }}
            />
          )}

          {activeTab === 'memories' && (
            <TripMemoriesView
              trip={currentTrip}
              allTrips={trips}
              lang={lang}
              canEdit={permission.canEdit}
              onUpdateTrip={handleUpdateTrip}
              onSelectTrip={handleSelectTrip}
              onOpenGlobalHub={() => setShowGlobalHubModal(true)}
              initialSpotId={memoriesSpotId}
              requireAuth={requireAuth}
            />
          )}
        </Suspense>
      </main>

      {/* Footer - Desktop Only */}
      <footer className="hidden sm:block mt-auto py-5 border-t border-[#E5E2DC] dark:border-slate-800 bg-white dark:bg-[#111827] text-center text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>日和手帳 Hiyori © 2026 · {t.localPrivacy}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowImportExportModal(true)}
              className="text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
            >
              {t.importBackup}
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
            >
              {t.settings}
            </button>
            <span aria-hidden="true">·</span>
            <a
              href="https://github.com/noworneverev/hiyori-trip"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 hover:underline"
            >
              <Github className="w-3.5 h-3.5" />
              <span>GitHub</span>
            </a>
          </div>
        </div>
      </footer>

      {/* Native iOS-Style Bottom Tab Bar (5 journey phases, crisp frosted glass, safe-area inset) */}
      <nav
        aria-label={isZh ? '主要分頁導覽' : 'Primary navigation'}
        style={{ position: 'fixed', zIndex: 45 }}
        className="sm:hidden fixed bottom-0 inset-x-0 bg-white/92 dark:bg-[#111827]/92 backdrop-blur-2xl border-t border-[#E5E2DC]/90 dark:border-slate-800/90 grid grid-cols-5 items-stretch h-[calc(3.6rem+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)] px-1 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.4)] ios-chrome"
      >
        {(
          [
            { id: 'timeline' as TabType, Icon: Route },
            { id: 'live' as TabType, Icon: Sparkles },
            { id: 'expenses' as TabType, Icon: Wallet },
            { id: 'prep' as TabType, Icon: CheckCircle },
            { id: 'memories' as TabType, Icon: Camera },
          ] as const
        ).map(({ id, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => switchTab(id)}
              className={`relative flex flex-col items-center justify-center min-h-[48px] py-1 rounded-xl transition-all duration-150 active:scale-92 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60 focus-visible:ring-inset ${
                active
                  ? 'text-teal-700 dark:text-teal-400'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute top-0.5 w-6 h-[3px] rounded-full bg-teal-600 dark:bg-teal-400"
                />
              )}
              <Icon
                className={`w-[21px] h-[21px] transition-transform ${
                  active ? 'scale-105 stroke-[2.25]' : 'stroke-[1.75]'
                }`}
              />
              <span
                className={`text-[10px] mt-0.5 tracking-tight ${
                  active ? 'font-bold' : 'font-medium'
                }`}
              >
                {mobileTabLabels[id]}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Lazy-Loaded Modals */}
      <Suspense fallback={null}>
        {showTripModal && (
          <TripEditModal
            trip={tripModalData}
            initialMode={tripModalInitialMode}
            onSave={handleSaveTripModal}
            onClose={() => {
              setShowTripModal(false);
              setTripModalData(null);
              setTripModalInitialMode('planner');
            }}
          />
        )}

        {showItemModal && editingItemData && (
          <ItemEditModal
            item={mergedEditingItem}
            dayNumber={editingItemData.dayNumber}
            currency={currentTrip.currency}
            tripId={currentTrip.id}
            ownerId={currentTrip.ownerId}
            collabId={currentTrip.collabId}
            canEdit={permission.canEdit}
            existingDayItems={
              currentTrip.days.find((d) => d.dayNumber === editingItemData.dayNumber)?.items || []
            }
            defaultStartTime={editingItemData.initialStartTime}
            onSave={handleSaveItem}
            onClose={() => {
              setShowItemModal(false);
              setEditingItemData(null);
              setItemDraftBackup(null);
              setIsPickMode(false);
              setPickedCoords(null);
            }}
            onStartMapPick={handleStartMapPick}
            pickedCoords={pickedCoords}
          />
        )}

        {showImportExportModal && (
          <ImportExportModal
            currentTrip={currentTrip}
            allTrips={trips}
            onImportTrip={handleImportTrip}
            onOpenExportPDF={() => setShowPDFExportModal(true)}
            onClose={() => setShowImportExportModal(false)}
          />
        )}

        {showSettingsModal && (
          <SettingsModal
            trips={trips}
            lang={lang}
            onResetData={async () => {
              await resetAllLocalData();
              window.location.reload();
            }}
            onClose={() => setShowSettingsModal(false)}
          />
        )}

        {showPDFExportModal && (
          <PDFExportModal
            trip={currentTrip}
            lang={lang}
            onClose={() => setShowPDFExportModal(false)}
          />
        )}

        {showShareModal && (
          <ShareTripModal
            trip={currentTrip}
            userId={currentUser?.uid}
            currentUser={currentUser}
            onRequireAuth={() =>
              promptCloudAuth(() => {}, isZh ? '建立雲端分享連結' : 'Create cloud share link')
            }
            onUpdateTrip={handleUpdateTrip}
            lang={lang}
            onClose={() => setShowShareModal(false)}
          />
        )}

        {showCollabModal && (
          <CollaborateModal
            trip={currentTrip}
            currentUser={currentUser}
            lang={lang}
            onRequireAuth={() =>
              promptCloudAuth(() => {}, isZh ? '建立多人共編連結' : 'Create collaboration link')
            }
            onUpdateTrip={handleUpdateTrip}
            onClose={() => setShowCollabModal(false)}
          />
        )}

        {showDeleteTripModal && (
          <DeleteConfirmModal
            tripTitle={tripPendingDelete.title}
            isLastTrip={trips.length <= 1}
            onConfirm={handleConfirmDeleteTrip}
            onClose={() => {
              setShowDeleteTripModal(false);
              setDeleteTargetTripId(null);
            }}
          />
        )}

        {showConflictModal && pendingConflicts.length > 0 && (
          <ConflictResolutionModal
            conflicts={pendingConflicts}
            userId={currentUser?.uid}
            lang={lang}
            onResolved={(resolvedTrip) => {
              cancelPendingWriteForTrip(currentUserRef.current?.uid, resolvedTrip.id, resolvedTrip.collabId);
              const baseline = Math.max(Date.now(), resolvedTrip.updatedAt || 0);
              const trackedTrip: Trip = { ...resolvedTrip, lastSyncedAt: baseline };
              persistTripsState((prev) =>
                prev.map((tr) => (tr.id === trackedTrip.id ? trackedTrip : tr))
              );
              setPendingConflicts((prev) => {
                const rest = prev.filter((c) => c.tripId !== trackedTrip.id);
                if (rest.length === 0) setShowConflictModal(false);
                return rest;
              });
              showToast(
                isZh
                  ? `【${trackedTrip.title}】版本衝突已順利解決並同步`
                  : `"${trackedTrip.title}" conflict resolved`
              );
            }}
            onClose={() => setShowConflictModal(false)}
          />
        )}

        {showQuickActionModal && (
          <TravelQuickActionModal
            trip={currentTrip}
            lang={lang}
            canEdit={permission.canEdit}
            initialTab={quickActionTab}
            defaultDate={quickActionDate}
            onUpdateTrip={handleUpdateTrip}
            onClose={() => {
              setShowQuickActionModal(false);
              setQuickActionDate(undefined);
            }}
            onShowToast={showToast}
          />
        )}

        {showGlobalHubModal && (
          <GlobalTravelHubModal
            trips={trips}
            currentTripId={currentTrip.id}
            currentUser={currentUser}
            lang={lang}
            onUpdateTrip={handleUpdateTrip}
            requireAuth={requireAuth}
            onCreateMemoryTrip={() => {
              setShowGlobalHubModal(false);
              setTripModalData(null);
              setTripModalInitialMode('memory');
              setShowTripModal(true);
            }}
            onSelectTrip={(selectedId, targetSpotId) => {
              const found = tripsRef.current.find((tr) => tr.id === selectedId);
              handleSelectTrip(selectedId);
              if (found && targetSpotId && !targetSpotId.startsWith('mem-cluster-')) {
                const matchedDay = found.days.find((d) =>
                  d.items.some((it) => it.id === targetSpotId)
                );
                if (matchedDay) {
                  setMemoriesSpotId(undefined);
                  setRequestedTimelineDay({ dayNumber: matchedDay.dayNumber, nonce: Date.now() });
                  switchTab('timeline');
                } else {
                  setMemoriesSpotId(undefined);
                  switchTab('memories');
                }
              } else if (found?.tripMode === 'memory' || targetSpotId) {
                setMemoriesSpotId(undefined);
                switchTab('memories');
              } else {
                setMemoriesSpotId(undefined);
                switchTab('timeline');
              }
              setShowGlobalHubModal(false);
              if (found) {
                showToast(
                  isZh ? `已切換至旅程：【${found.title}】` : `Switched to "${found.title}"`
                );
              }
            }}
            onClose={() => setShowGlobalHubModal(false)}
          />
        )}

        {showAuthModal && (
          <AuthPromptModal
            isOpen={showAuthModal}
            onClose={() => {
              setShowAuthModal(false);
              pendingActionRef.current = null;
            }}
            reason={authModalReason}
            onLoginSuccess={() => {
              setShowAuthModal(false);
              if (pendingActionRef.current) {
                const action = pendingActionRef.current;
                pendingActionRef.current = null;
                window.setTimeout(() => {
                  try {
                    action();
                  } catch (e) {
                    console.warn('Pending auth action failed:', e);
                  }
                }, 150);
              }
            }}
            lang={lang}
          />
        )}
      </Suspense>

      {/* Global Toast Notification — Portaled to document.body at z-[120], always tap-to-dismiss */}
      {toastMessage &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            onClick={dismissToast}
            className="fixed top-[max(0.85rem,env(safe-area-inset-top,0px))] sm:top-16 left-1/2 -translate-x-1/2 z-[120] max-w-[calc(100vw-2rem)] pl-3.5 pr-2 py-2 rounded-2xl bg-slate-900/95 dark:bg-[#111827]/95 text-white text-xs font-bold shadow-2xl border border-slate-700/80 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200 backdrop-blur-xl pointer-events-auto cursor-pointer"
          >
            <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span className="truncate">{toastMessage}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismissToast();
              }}
              className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition shrink-0 cursor-pointer"
              aria-label={isZh ? '關閉提示' : 'Dismiss notification'}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>,
          document.body
        )}

      {/* Passive Connectivity Indicator */}
      <OfflineIndicator />

      {/* Prompt-Based PWA Update Banner */}
      <UpdateNotificationBanner lang={lang} />
    </div>
  );
}
