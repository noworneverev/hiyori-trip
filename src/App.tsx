import React, { useState, useEffect, useRef } from 'react';
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
import { formatDateSlash, getTodayLocal, sortItineraryItemsByTime, findInsertionPosition } from './utils/date';
import { Language, TRANSLATIONS, getStoredLanguage, setStoredLanguage } from './utils/i18n';
import { useDarkMode } from './hooks/useDarkMode';
import { useScrollDirection } from './hooks/useScrollDirection';
import { useIsMobileViewport } from './hooks/useIsMobileViewport';
import { IosModalSheet, IosNavBar, IosInsetGroup } from './components/UI/IosPrimitives';
import { TimelineTab } from './components/Tabs/TimelineTab';
import { LiveCompanionTab } from './components/Tabs/LiveCompanionTab';
import { ExpensesTab } from './components/Tabs/ExpensesTab';
import { NotesAndPrepTab } from './components/Tabs/NotesAndPrepTab';
import { TripMemoriesView } from './components/Memories/TripMemoriesView';
import { GlobalTravelHubModal } from './components/Memories/GlobalTravelHubModal';
import { TripEditModal } from './components/Modals/TripEditModal';
import { ItemEditModal } from './components/Modals/ItemEditModal';
import { ImportExportModal } from './components/Modals/ImportExportModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { PDFExportModal } from './components/Modals/PDFExportModal';
import { ShareTripModal } from './components/Modals/ShareTripModal';
import { CollaborateModal } from './components/Modals/CollaborateModal';
import { DeleteConfirmModal } from './components/Modals/DeleteConfirmModal';
import { ConflictResolutionModal } from './components/Modals/ConflictResolutionModal';
import { AuthPromptModal } from './components/Modals/AuthPromptModal';
import { TravelQuickActionModal } from './components/UI/TravelQuickActionModal';
import { AuthButton } from './components/Auth/AuthButton';
import { AppMenu } from './components/Navigation/AppMenu';
import {
  auth,
  resolveAuthRedirect,
  subscribeUserTrips,
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
  summarizeTripForConflict,
  hasTripContentDifference,
} from './utils/syncManager';
import { onAuthStateChanged, User } from 'firebase/auth';
import { OfflineIndicator } from './components/PWA/OfflineIndicator';
import { HiyoriLogo } from './components/UI/HiyoriLogo';
import { initAccessibilityScale } from './utils/accessibility';
import { UpdateNotificationBanner } from './components/UI/UpdateNotificationBanner';
import {
  Route,
  Calendar,
  MapPin,
  Plus,
  Upload,
  Edit,
  DollarSign,
  Wallet,
  CheckCircle,
  CheckSquare,
  FileText,
  Camera,
  Sparkles,
  Plane,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Trash2,
  Settings,
  Sun,
  Moon,
  Languages,
  Github,
  Printer,
  Share2,
  Users,
  Check,
  X,
  Radio,
  ShieldCheck,
  Eye,
  AlertTriangle,
  Compass,
} from 'lucide-react';

type TabType = 'timeline' | 'live' | 'expenses' | 'prep' | 'memories';

export default function App() {
  const [trips, setTrips] = useState<Trip[]>(() => {
    const loaded = getStoredTrips();
    return loaded && loaded.length > 0 ? loaded : PRESET_TRIPS;
  });
  const [currentTripId, setCurrentTripIdState] = useState<string>(() => {
    const active = getCurrentTripId();
    return active || (PRESET_TRIPS[0]?.id || '');
  });
  const [activeTab, setActiveTab] = useState<TabType>('timeline');
  const [memoriesSpotId, setMemoriesSpotId] = useState<string | undefined>(undefined);
  const [requestedTimelineDay, setRequestedTimelineDay] = useState<{ dayNumber: number; nonce: number } | null>(null);

  // i18n & Theme
  const [lang, setLang] = useState<Language>(getStoredLanguage);
  const { isDark, toggleDarkMode } = useDarkMode();
  const t = TRANSLATIONS[lang];

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
  const [showFabNote, setShowFabNote] = useState(false);
  const fabLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [sharedBannerTrip, setSharedBannerTrip] = useState<Trip | null>(null);
  const [collabBannerTrip, setCollabBannerTrip] = useState<Trip | null>(null);
  const [isHeroExpanded, setIsHeroExpanded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingConflicts, setPendingConflicts] = useState<TripConflict[]>([]);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isMobile = useIsMobileViewport();
  const [showTripSwitcher, setShowTripSwitcher] = useState(false);
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
  const [isAuthMenuOpen, setIsAuthMenuOpen] = useState(false);
  const tripSwitcherRef = useRef<HTMLDivElement>(null);

  const isAnyOverlayOpen =
    showTripSwitcher ||
    isAppMenuOpen ||
    isAuthMenuOpen ||
    showSettingsModal ||
    showDeleteTripModal ||
    showTripModal ||
    showGlobalHubModal ||
    showQuickActionModal;

  // Mobile scroll-to-hide dynamic chrome (paused whenever header menus/modals are open)
  const { isNavHidden, resetNavVisibility } = useScrollDirection({ paused: isAnyOverlayOpen });

  // Reset navigation visibility whenever switching tabs or opening menus/modals
  useEffect(() => {
    resetNavVisibility();
  }, [activeTab, isAnyOverlayOpen, resetNavVisibility]);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 3500);
  };

  // Map Pick Coordinate Mode
  const [isPickMode, setIsPickMode] = useState(false);
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!showTripSwitcher || isMobile) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const inTrigger = tripSwitcherRef.current?.contains(target);
      if (!inTrigger) {
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


  // Load from local storage on mount
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const currentUserRef = useRef<User | null>(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const hydrationPromiseRef = useRef<Promise<Trip[]> | null>(null);
  const hasCloudReconciledRef = useRef<boolean>(false);
  const inFlightCloudSavesRef = useRef<Set<string>>(new Set());

  // Global unmount timer cleanup & accessibility initialization
  useEffect(() => {
    initAccessibilityScale();
    const handleSyncWarning = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.sizeKb) {
        showToast(lang === 'zh' ? `行程容量 (${detail.sizeKb} KB) 接近雲端上限 1MB，建議照片改用相簿連結` : `Trip size (${detail.sizeKb} KB) is close to 1MB cloud limit`);
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
      const retained = detail?.retainedTrips || [];
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
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (fabLongPressTimerRef.current) clearTimeout(fabLongPressTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('share');
    const collabId = urlParams.get('collab');

    const hydrationPromise = hydrateStorageFromIndexedDB();
    hydrationPromiseRef.current = hydrationPromise;

    hydrationPromise.then((hydrated) => {
      if (!isMounted || hasCloudReconciledRef.current) return;
      const deletedSet = new Set(getDeletedTripIds());
      const loadedTrips = (hydrated.length > 0 ? hydrated : getStoredTrips()).filter(
        (tr) => !deletedSet.has(tr.id)
      );
      setTrips(loadedTrips);
      if (!shareId && !collabId) {
        const activeId = getCurrentTripId();
        const found = loadedTrips.find((t) => t.id === activeId);
        setCurrentTripIdState(found ? found.id : (loadedTrips[0]?.id || ''));
      }
    });

    // Check for shared trip in URL
    if (shareId) {
      fetchSharedTrip(shareId)
        .then((shared) => {
          if (!isMounted) return;
          if (!shared) {
            showToast(lang === 'zh' ? '找不到該分享行程或連結已失效' : 'Shared trip not found');
            return;
          }
          setSharedBannerTrip(shared);
          setTrips((prev) => {
            const exists = prev.some((t) => t.id === shared.id);
            const nextTrips = exists ? prev : [shared, ...prev];
            saveTrips(nextTrips);
            return nextTrips;
          });
          setCurrentTripIdState(shared.id);
          setCurrentTripId(shared.id);
        })
        .catch(() => {
          if (isMounted) {
            showToast(lang === 'zh' ? '無法載入分享行程，請確認網路連線' : 'Failed to load shared trip');
          }
        });
    }

    // Check for collaborative trip in URL
    if (collabId) {
      fetchCollaborativeTrip(collabId)
        .then((collabTrip) => {
          if (!isMounted) return;
          if (!collabTrip) {
            showToast(lang === 'zh' ? '找不到該共編行程或連結已失效' : 'Collaborative trip not found');
            return;
          }
          setCollabBannerTrip(collabTrip);
          setTrips((prev) => {
            const idx = prev.findIndex((t) => t.id === collabTrip.id || t.collabId === collabId);
            const next =
              idx >= 0
                ? prev.map((t, i) => (i === idx ? collabTrip : t))
                : [collabTrip, ...prev];
            saveTrips(next);
            return next;
          });
          setCurrentTripIdState(collabTrip.id);
          setCurrentTripId(collabTrip.id);
        })
        .catch(() => {
          if (isMounted) {
            showToast(lang === 'zh' ? '無法載入共編行程，請確認網路連線' : 'Failed to load collaborative trip');
          }
        });
    }

    return () => {
      isMounted = false;
    };
  }, []);

  // Trips reference to avoid triggering subscription re-runs on local state updates
  const tripsRef = useRef<Trip[]>(trips);
  useEffect(() => {
    tripsRef.current = trips;
  }, [trips]);

  const activeTrip = trips.find((t) => t.id === currentTripId) || trips[0];
  const activeCollabId = (activeTrip?.isCollaborative && activeTrip?.collabId) ? activeTrip.collabId : undefined;
  const activeId = activeTrip?.id;

  // Real-time listener for current collaborative trip
  useEffect(() => {
    if (!activeCollabId || !activeId) return;

    const unsubscribe = subscribeCollaborativeTrip(
      activeCollabId,
      (liveTrip, meta: SnapshotMeta) => {
        if (meta.hasPendingWrites) return;

        const currentLocal = tripsRef.current.find(
          (t) => (activeCollabId && t.collabId === activeCollabId) || t.id === activeId
        ) || getStoredTrips().find(
          (t) => (activeCollabId && t.collabId === activeCollabId) || t.id === activeId
        );
        if (!currentLocal) return;

        // Skip re-render if content is identical
        if (!hasTripContentDifference(currentLocal, liveTrip)) {
          return;
        }

        const localUpdated = currentLocal.updatedAt || 0;
        const cloudUpdated = liveTrip.updatedAt || 0;

        // Automatic sync: If cloud is newer or equal, adopt live trip directly
        if (cloudUpdated >= localUpdated) {
          setTrips((prev) => {
            const idx = prev.findIndex((t) => t.collabId === activeCollabId || t.id === activeId);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = liveTrip;
              saveTrips(next);
              return next;
            }
            return prev;
          });
          return;
        }

        // Silent background smart merge: If local has newer un-synced changes, merge them and push to cloud
        if (localUpdated > cloudUpdated) {
          const merged = mergeSingleTrip(currentLocal, liveTrip);
          setTrips((prev) => {
            const idx = prev.findIndex((t) => t.collabId === activeCollabId || t.id === activeId);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = merged;
              saveTrips(next);
              return next;
            }
            return prev;
          });
          syncCollaborativeTrip(
            activeCollabId,
            merged,
            currentUserRef.current?.displayName || currentUserRef.current?.email || '我'
          ).catch(() => {
            enqueueCollabSync(
              activeCollabId,
              merged,
              currentUserRef.current?.displayName || currentUserRef.current?.email || '我'
            );
          });
        }
      }
    );

    return () => unsubscribe();
  }, [activeCollabId, activeId]);

  const [authReady, setAuthReady] = useState<boolean>(() => Boolean(auth.currentUser));
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalReason, setAuthModalReason] = useState<string>('');
  const pendingActionRef = useRef<(() => void) | null>(null);

  // Strict check-only guard for child components: returns true when authenticated without executing retryAction.
  const requireAuth = (retryAction: () => void, reason?: string): boolean => {
    if (currentUserRef.current) {
      return true;
    }
    pendingActionRef.current = retryAction;
    setAuthModalReason(reason || (lang === 'zh' ? '編輯與儲存行程' : 'Edit and save trip'));
    setShowAuthModal(true);
    return false;
  };

  // Callback runner for App-level handlers: runs action immediately if signed in, or queues it pending login.
  const runWithAuth = (action: () => void, reason?: string): void => {
    if (currentUserRef.current) {
      action();
      return;
    }
    pendingActionRef.current = action;
    setAuthModalReason(reason || (lang === 'zh' ? '編輯與儲存行程' : 'Edit and save trip'));
    setShowAuthModal(true);
  };

  const markTripsSyncedLocally = (syncedAtByTripId: Record<string, number>) => {
    if (!syncedAtByTripId || Object.keys(syncedAtByTripId).length === 0) return;
    setTrips((prev) => {
      let changed = false;
      const next = prev.map((tr) => {
        const syncedAt = syncedAtByTripId[tr.id];
        if (syncedAt && (tr.lastSyncedAt || 0) < syncedAt) {
          changed = true;
          return { ...tr, lastSyncedAt: syncedAt };
        }
        return tr;
      });
      if (changed) {
        saveTrips(next);
        return next;
      }
      return prev;
    });
  };

  // Listen to Auth State and subscribe to cloud trips & live tombstones
  useEffect(() => {
    let unsubscribeFirestore: (() => void) | null = null;
    let unsubscribeTombstones: (() => void) | null = null;
    let isEffectMounted = true;

    // Resolve any pending mobile/PWA redirect sign-in result on app startup
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
      setAuthReady(true);

      // Clean up previous Firestore listeners if user switched or logged out
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
        unsubscribeFirestore = null;
      }
      if (unsubscribeTombstones) {
        unsubscribeTombstones();
        unsubscribeTombstones = null;
      }

      // Automatically execute pending action upon successful sign in
      if (user && pendingActionRef.current) {
        const action = pendingActionRef.current;
        pendingActionRef.current = null;
        setTimeout(() => {
          try {
            action();
          } catch (e) {
            console.warn('Pending auth action failed:', e);
          }
        }, 150);
      }

      if (!user) {
        hasCloudReconciledRef.current = false;
        return;
      }

      // 1. Wait for startup IndexedDB hydration so local store doesn't overwrite reconciled cloud state later
      if (hydrationPromiseRef.current) {
        try {
          await hydrationPromiseRef.current;
        } catch {
          // Ignore hydration fallback error
        }
      }
      if (!isEffectMounted || currentUserRef.current?.uid !== user.uid) return;

      // 2. Fetch authoritative server tombstone state FIRST so offline queue & merge honor mobile deletions
      let cloudTombstones: Record<string, number> = {};
      let tombstonesFromServerReady = false;
      let latestCloudTrips: Trip[] | null = null;
      let tripsFromServerReady = false;
      let reconcileQueue: Promise<void> = Promise.resolve();

      try {
        cloudTombstones = await fetchUserTombstones(user.uid);
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
          tombstonesFromServerReady = true;
        }
      } catch {
        cloudTombstones = {};
      }
      if (!isEffectMounted || currentUserRef.current?.uid !== user.uid) return;

      // 3. Flush offline queue sequentially BEFORE initial merge (dropping any tombstoned queued saves)
      try {
        const { successCount } = await flushPendingSyncQueue(user.uid, cloudTombstones);
        if (successCount > 0 && isEffectMounted) {
          showToast(lang === 'zh' ? `已同步 ${successCount} 筆離線變更` : `Synced ${successCount} offline changes`);
        }
      } catch {
        // Offline queue flush will retry on next online event
      }
      if (!isEffectMounted || currentUserRef.current?.uid !== user.uid) return;

      const cancelPendingWriteForTrip = (tripId: string, collabId?: string) => {
        const userKey = `user:${user.uid}:${tripId}`;
        const existingUserTimer = cloudSaveTimersRef.current.get(userKey);
        if (existingUserTimer) {
          clearTimeout(existingUserTimer);
          cloudSaveTimersRef.current.delete(userKey);
        }
        pendingCloudWritesRef.current.delete(userKey);

        if (collabId) {
          const collabKey = `collab:${collabId}`;
          const existingCollabTimer = cloudSaveTimersRef.current.get(collabKey);
          if (existingCollabTimer) {
            clearTimeout(existingCollabTimer);
            cloudSaveTimersRef.current.delete(collabKey);
          }
          pendingCloudWritesRef.current.delete(collabKey);
        }
      };

      const reconcileNow = async () => {
        if (!isEffectMounted || currentUserRef.current?.uid !== user.uid) return;
        if (latestCloudTrips === null) return;

        const hasTombstones = Object.keys(cloudTombstones).length > 0;
        if (!tripsFromServerReady && latestCloudTrips.length === 0 && !hasTombstones) {
          return;
        }

        const currentLocal = getStoredTrips();
        const deletedIds = new Set(getDeletedTripIds());

        // Cancel any pending debounced saves for deleted or tombstoned trips
        for (const lTrip of currentLocal) {
          if (deletedIds.has(lTrip.id) || typeof cloudTombstones[lTrip.id] === 'number') {
            cancelPendingWriteForTrip(lTrip.id, lTrip.collabId);
          }
        }

        const pendingSaveIds = new Set<string>(inFlightCloudSavesRef.current);
        pendingCloudWritesRef.current.forEach((task) => {
          if (task.type === 'user' && task.uid === user.uid && task.trip?.id) {
            pendingSaveIds.add(task.trip.id);
          }
        });
        try {
          const queued = await getPendingQueueAsync();
          queued.forEach((q) => {
            if (q.type === 'save_trip' && q.userId === user.uid && q.trip?.id) {
              pendingSaveIds.add(q.trip.id);
            }
          });
        } catch {
          // Ignore queue read error
        }

        const filteredCloud = latestCloudTrips.filter((c) => !deletedIds.has(c.id));
        const isServerAuthoritative =
          tripsFromServerReady && (tombstonesFromServerReady || hasTombstones || filteredCloud.length > 0);
        const hasAccountBoundLocal = currentLocal.some(
          (l) => Boolean(l.lastSyncedAt) || Boolean(l.ownerId && l.ownerId === user.uid && !pendingSaveIds.has(l.id))
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
            const target = currentLocal.find((t) => t.id === id);
            cancelPendingWriteForTrip(id, target?.collabId);
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
          const uploadIds = new Set(tripsToUpload.map((t) => t.id));
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
            setTrips(normalizedMerged);
            saveTrips(normalizedMerged);
            if (deletedLocalTripIds.length > 0) {
              garbageCollectOrphanedMedia(normalizedMerged).catch(() => {});
            }
          }
          if (isServerAuthoritative) {
            hasCloudReconciledRef.current = true;
          }

          if (tripsToUpload.length > 0) {
            const refreshedDeletedIds = new Set(getDeletedTripIds());
            const syncedMap: Record<string, number> = {};
            for (const tr of tripsToUpload) {
              const isRemoteTombstoned =
                typeof cloudTombstones[tr.id] === 'number' &&
                cloudTombstones[tr.id] + 15 * 60 * 1000 >= (tr.updatedAt || 0);
              if (!refreshedDeletedIds.has(tr.id) && !isRemoteTombstoned) {
                inFlightCloudSavesRef.current.add(tr.id);
                try {
                  await saveTripToCloud(user.uid, tr);
                  syncedMap[tr.id] = Math.max(Date.now(), tr.updatedAt || 0);
                } catch {
                  enqueueTripSave(user.uid, tr);
                } finally {
                  inFlightCloudSavesRef.current.delete(tr.id);
                }
              }
            }
            if (Object.keys(syncedMap).length > 0) {
              markTripsSyncedLocally(syncedMap);
              showToast(lang === 'zh' ? '已將本機行程與相片同步至雲端' : 'Local trips & photos synced to cloud');
            }
          }

          const activeId = getCurrentTripId();
          const exists = normalizedMerged.find((t) => t.id === activeId);
          if (!exists) {
            const fallbackId = normalizedMerged[0]?.id || '';
            setCurrentTripIdState(fallbackId);
            setCurrentTripId(fallbackId);
          }
        } else if (tripsFromServerReady) {
          hasCloudReconciledRef.current = true;
          // True first login with authoritative empty cloud & no tombstones
          const toSync = (currentLocal || []).filter(
            (tr) => !deletedIds.has(tr.id) && typeof cloudTombstones[tr.id] !== 'number'
          );
          if (toSync.length > 0) {
            const syncedMap: Record<string, number> = {};
            for (const tr of toSync) {
              inFlightCloudSavesRef.current.add(tr.id);
              try {
                await saveTripToCloud(user.uid, tr);
                syncedMap[tr.id] = Math.max(Date.now(), tr.updatedAt || 0);
              } catch {
                enqueueTripSave(user.uid, tr);
              } finally {
                inFlightCloudSavesRef.current.delete(tr.id);
              }
            }
            markTripsSyncedLocally(syncedMap);
            showToast(lang === 'zh' ? '已將本機既有行程同步至雲端' : 'Local trips synced to cloud');
          }
        }
      };

      const scheduleReconcile = () => {
        reconcileQueue = reconcileQueue.then(reconcileNow).catch((err) => {
          console.warn('[CloudSync] reconcile warning:', err);
        });
      };

      // Subscribe live to cloud tombstones so deletes on mobile purge desktop immediately
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
        () => {
          // Non-fatal; fallback relies on fetched tombstones
        }
      );

      // 4. Subscribe to user cloud trips with echo suppression & tombstone awareness
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
          showToast(lang === 'zh' ? '雲端連線不穩，資料已安全保留於本機' : 'Cloud sync unavailable, saved locally');
        }
      );
    });

    return () => {
      isEffectMounted = false;
      window.removeEventListener('hiyori_auth_error', handleGlobalAuthError);
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
        unsubscribeFirestore = null;
      }
      if (unsubscribeTombstones) {
        unsubscribeTombstones();
        unsubscribeTombstones = null;
      }
      unsubscribeAuth();
    };
  }, []);

  // Listen to network reconnection and flush pending offline sync queue
  useEffect(() => {
    const handleOnline = async () => {
      try {
        const { successCount } = await flushPendingSyncQueue(currentUserRef.current?.uid);
        if (successCount > 0) {
          showToast(lang === 'zh' ? `網路已連線，已同步 ${successCount} 筆變更` : `Online: synced ${successCount} changes`);
        }
      } catch (e) {
        console.warn('Online sync flush error:', e);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // Debounced cloud write scheduler + beforeunload/visibilitychange flush
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

  const flushPendingDebouncedSaves = (enqueueOnly = false) => {
    cloudSaveTimersRef.current.forEach((timer) => clearTimeout(timer));
    cloudSaveTimersRef.current.clear();

    const entries = Array.from(pendingCloudWritesRef.current.entries());
    pendingCloudWritesRef.current.clear();

    for (const [, task] of entries) {
      if (task.type === 'collab' && task.collabId) {
        if (enqueueOnly || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          enqueueCollabSync(task.collabId, task.trip, task.editorName);
        } else {
          syncCollaborativeTrip(task.collabId, task.trip, task.editorName).catch(() => {
            enqueueCollabSync(task.collabId!, task.trip, task.editorName);
          });
        }
      } else if (task.type === 'user' && task.uid) {
        if (enqueueOnly || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          enqueueTripSave(task.uid, task.trip);
        } else {
          inFlightCloudSavesRef.current.add(task.trip.id);
          saveTripToCloud(task.uid, task.trip)
            .then(() => {
              markTripsSyncedLocally({ [task.trip.id]: Math.max(Date.now(), task.trip.updatedAt || 0) });
            })
            .catch(() => {
              enqueueTripSave(task.uid!, task.trip);
            })
            .finally(() => {
              inFlightCloudSavesRef.current.delete(task.trip.id);
            });
        }
      }
    }
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      flushPendingDebouncedSaves(true);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingDebouncedSaves(false);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cloudSaveTimersRef.current.forEach((timer) => clearTimeout(timer));
      cloudSaveTimersRef.current.clear();
    };
  }, []);

  const scheduleCloudWrite = (
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
              markTripsSyncedLocally({ [pending.trip.id]: Math.max(Date.now(), pending.trip.updatedAt || 0) });
            })
            .catch((err) => {
              console.warn('Cloud save failed, enqueuing for offline reconnect:', err);
              enqueueTripSave(pending.uid!, pending.trip);
              showToast(lang === 'zh' ? '雲端同步稍有延遲，資料已安全保留於本機' : 'Cloud save delayed, safely queued offline');
            })
            .finally(() => {
              inFlightCloudSavesRef.current.delete(pending.trip.id);
            });
        }
      }
    }, 400);

    cloudSaveTimersRef.current.set(key, timer);
  };

  const handleToggleLang = () => {
    const nextLang: Language = lang === 'zh' ? 'en' : 'zh';
    setLang(nextLang);
    setStoredLanguage(nextLang);
  };

  const applyUpdateTrip = (updatedTrip: Trip) => {
    // 1. Immediately update React state & local persistence (IndexedDB + localStorage)
    setTrips((prevTrips) => {
      const idx = prevTrips.findIndex((t) => t.id === updatedTrip.id);
      const nextTrips = idx >= 0
        ? prevTrips.map((t) => (t.id === updatedTrip.id ? updatedTrip : t))
        : [updatedTrip, ...prevTrips];
      saveTrips(nextTrips);
      return nextTrips;
    });

    const user = currentUserRef.current;

    // 2. Debounced collab sync with offline fallback queue
    if (updatedTrip.collabId && updatedTrip.isCollaborative) {
      scheduleCloudWrite(`collab:${updatedTrip.collabId}`, {
        type: 'collab',
        collabId: updatedTrip.collabId,
        trip: updatedTrip,
        editorName: user?.displayName || user?.email || undefined,
      });
    }

    // 3. Debounced user cloud sync with offline fallback queue
    if (user) {
      scheduleCloudWrite(`user:${user.uid}:${updatedTrip.id}`, {
        type: 'user',
        uid: user.uid,
        trip: updatedTrip,
      });
    }
  };

  const handleUpdateTrip = (updatedTrip: Trip) => {
    const user = currentUserRef.current;
    if (!user) {
      runWithAuth(() => {
        const perm = checkUserTripPermission(updatedTrip, currentUserRef.current);
        if (updatedTrip.isCollaborative && !perm.canEdit) {
          showToast(lang === 'zh' ? '僅檢視權限，無法編輯' : 'View-only permission');
          return;
        }
        applyUpdateTrip(updatedTrip);
      }, lang === 'zh' ? '編輯行程並同步至雲端' : 'Edit trip and sync to cloud');
      return;
    }
    const perm = checkUserTripPermission(updatedTrip, user);
    if (updatedTrip.isCollaborative && !perm.canEdit) {
      showToast(lang === 'zh' ? '僅檢視權限，無法編輯' : 'View-only permission');
      return;
    }
    applyUpdateTrip(updatedTrip);
  };

  const handleSelectTrip = (id: string) => {
    setCurrentTripIdState(id);
    setCurrentTripId(id);
    setShowTripSwitcher(false);
    setMemoriesSpotId(undefined);
    const found = trips.find((t) => t.id === id);
    if (found?.tripMode === 'memory') {
      setActiveTab('memories');
    } else if (found && activeTab === 'memories') {
      setActiveTab('timeline');
    }
  };

  const currentTrip = trips.find((t) => t.id === currentTripId) || trips[0] || PRESET_TRIPS[0];
  const permission = checkUserTripPermission(currentTrip, currentUser);

  // Sync browser document.title with current active trip name & app branding
  useEffect(() => {
    if (currentTrip?.title) {
      document.title = `${currentTrip.title} - ${t.appName}`;
    } else {
      document.title = `${t.appName} - ${t.appSubtitle}`;
    }
  }, [currentTrip?.title, t.appName, t.appSubtitle]);

  const handleSaveTripModal = (data: Partial<Trip> | Trip) => {
    const user = currentUserRef.current;
    if (!user) {
      runWithAuth(() => handleSaveTripModal(data), lang === 'zh' ? '建立與儲存旅程' : 'Save trip');
      return;
    }
    if (tripModalData) {
      const perm = checkUserTripPermission(tripModalData, user);
      if (tripModalData.isCollaborative && !perm.canEdit) {
        showToast(lang === 'zh' ? '僅檢視權限，無法編輯' : 'View-only permission');
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
      if ('days' in data && Array.isArray(data.days) && data.days.length > 0 && 'id' in data && data.id) {
        newTrip = data as Trip;
      } else {
        newTrip = {
          id: `trip-${Date.now()}`,
          ownerId: user.uid,
          ownerEmail: user.email || undefined,
          title: data.title || (lang === 'zh' ? '新旅遊行程' : 'New Trip'),
          destination: data.destination || (lang === 'zh' ? '旅遊目的地' : 'Destination'),
          startDate: data.startDate || getTodayLocal(),
          endDate: data.endDate || getTodayLocal(),
          currency: data.currency || 'JPY',
          budgetTotal: data.budgetTotal || 50000,
          coverGradient: data.coverGradient || 'from-emerald-600 via-teal-600 to-cyan-700',
          notes: data.notes || '',
          days: data.days || [],
          todos: [
            { id: `td-1-${Date.now()}`, title: lang === 'zh' ? '確認護照效期大於 6 個月' : 'Check passport validity (6+ months)', category: 'preparation', completed: false, essential: true },
            { id: `td-2-${Date.now()}`, title: lang === 'zh' ? '投保海外旅遊平安險' : 'Travel insurance coverage', category: 'preparation', completed: false, essential: true },
            { id: `td-3-${Date.now()}`, title: lang === 'zh' ? '開通海外上網 eSIM / SIM 卡' : 'Set up travel eSIM / SIM', category: 'preparation', completed: false, essential: true },
            { id: `td-4-${Date.now()}`, title: lang === 'zh' ? '確認信用卡海外交易功能' : 'Enable credit card overseas transactions', category: 'preparation', completed: false, essential: true },
          ],
          packingList: [
            { id: 'p1', name: lang === 'zh' ? '護照正本' : 'Passport', category: 'documents', packed: false, essential: true },
            { id: 'p2', name: lang === 'zh' ? '機票與住宿憑證' : 'Tickets & Vouchers', category: 'documents', packed: false, essential: true },
            { id: 'p3', name: lang === 'zh' ? '行動電源與充電線' : 'Power bank & Cable', category: 'electronics', packed: false, essential: true },
          ],
          expenses: [],
          emergencyContacts: [
            { id: 'e1', name: lang === 'zh' ? '當地報警電話' : 'Police', type: 'police', phone: '110' },
            { id: 'e2', name: lang === 'zh' ? '救護車/急救' : 'Ambulance', type: 'ambulance', phone: '119' },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      }
      const exists = trips.some((t) => t.id === newTrip.id);
      const newTrips = exists
        ? trips.map((t) => (t.id === newTrip.id ? newTrip : t))
        : [newTrip, ...trips];
      setTrips(newTrips);
      saveTrips(newTrips);
      setCurrentTripIdState(newTrip.id);
      setCurrentTripId(newTrip.id);

      if (newTrip.tripMode === 'memory') {
        setMemoriesSpotId(undefined);
        setActiveTab('memories');
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueTripSave(user.uid, newTrip);
      } else {
        inFlightCloudSavesRef.current.add(newTrip.id);
        saveTripToCloud(user.uid, newTrip)
          .then(() => {
            markTripsSyncedLocally({ [newTrip.id]: Math.max(Date.now(), newTrip.updatedAt || 0) });
          })
          .catch((err) => {
            console.warn('Cloud save failed, enqueuing for offline reconnect:', err);
            enqueueTripSave(user.uid, newTrip);
          })
          .finally(() => {
            inFlightCloudSavesRef.current.delete(newTrip.id);
          });
      }
    }
    setShowTripModal(false);
    setTripModalData(null);
    setTripModalInitialMode('planner');
  };

  const tripPendingDelete =
    (deleteTargetTripId ? trips.find((t) => t.id === deleteTargetTripId) : null) || currentTrip;

  const handleDeleteCurrentTrip = () => {
    setDeleteTargetTripId(currentTrip.id);
    setShowDeleteTripModal(true);
  };

  const handleRequestDeleteTrip = (trip: Trip) => {
    const targetPerm = checkUserTripPermission(trip, currentUserRef.current);
    if (trip.isCollaborative && !targetPerm.isOwner) {
      showToast(lang === 'zh' ? '僅擁有者可刪除共編旅程' : 'Only owner can delete this trip');
      return;
    }
    setShowTripSwitcher(false);
    setDeleteTargetTripId(trip.id);
    setShowDeleteTripModal(true);
  };

  const handleConfirmDeleteTrip = () => {
    if (trips.length <= 1) return;
    const targetTrip = tripPendingDelete;
    if (!targetTrip) return;

    const user = currentUserRef.current;
    if (!user) {
      runWithAuth(() => handleConfirmDeleteTrip(), lang === 'zh' ? '刪除旅程' : 'Delete trip');
      return;
    }
    const targetPerm = checkUserTripPermission(targetTrip, user);
    if (targetTrip.isCollaborative && !targetPerm.isOwner) {
      showToast(lang === 'zh' ? '僅擁有者可刪除共編旅程' : 'Only owner can delete this trip');
      return;
    }

    const tripToDeleteId = targetTrip.id;

    // Cancel any queued debounced cloud saves for this trip before deleting
    const userWriteKey = `user:${user.uid}:${tripToDeleteId}`;
    const userTimer = cloudSaveTimersRef.current.get(userWriteKey);
    if (userTimer) {
      clearTimeout(userTimer);
      cloudSaveTimersRef.current.delete(userWriteKey);
    }
    pendingCloudWritesRef.current.delete(userWriteKey);

    if (targetTrip.collabId) {
      const collabKey = `collab:${targetTrip.collabId}`;
      const collabTimer = cloudSaveTimersRef.current.get(collabKey);
      if (collabTimer) {
        clearTimeout(collabTimer);
        cloudSaveTimersRef.current.delete(collabKey);
      }
      pendingCloudWritesRef.current.delete(collabKey);
    }

    // Keep local deleted ledger permanently bounded & purge any queued save tasks
    recordDeletedTripId(tripToDeleteId);
    removePendingTripSave(user.uid, tripToDeleteId).catch(() => {});

    const remaining = trips.filter((t) => t.id !== tripToDeleteId);
    setTrips(remaining);
    saveTrips(remaining);
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

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueueTripDelete(user.uid, tripToDeleteId);
    } else {
      deleteTripFromCloud(user.uid, tripToDeleteId).catch((err) => {
        console.warn('Cloud delete failed, enqueuing for offline reconnect:', err);
        enqueueTripDelete(user.uid, tripToDeleteId);
      });
    }
    showToast(lang === 'zh' ? '已成功刪除旅程' : 'Trip deleted');
  };

  const handleSaveItem = (itemData: Omit<ItineraryItem, 'id'>, existingId?: string) => {
    if (!currentTrip || !editingItemData) return;
    const user = currentUserRef.current;
    if (!user) {
      runWithAuth(() => handleSaveItem(itemData, existingId), lang === 'zh' ? '儲存景點資訊' : 'Save spot');
      return;
    }
    if (currentTrip.isCollaborative && !permission.canEdit) {
      showToast(lang === 'zh' ? '僅檢視權限，無法編輯' : 'View-only permission');
      return;
    }
    const { dayNumber } = editingItemData;

    // Enforce 3 photos max per spot
    const rawPhotos = itemData.memoryPhotos || [];
    const sanitizedPhotos = rawPhotos.slice(0, 3);
    const sanitizedItemData: Omit<ItineraryItem, 'id'> = {
      ...itemData,
      memoryPhotos: sanitizedPhotos.length > 0 ? sanitizedPhotos : undefined,
    };

    let targetItemId = existingId || '';
    const updatedDays = currentTrip.days.map((day) => {
      if (day.dayNumber !== dayNumber) return day;

      let nextItems: ItineraryItem[];
      if (existingId) {
        // If editing an existing item, remove it and re-insert into the right chronological position
        const remaining = day.items.filter((it) => it.id !== existingId);
        const updatedItem: ItineraryItem = { ...sanitizedItemData, id: existingId };
        const { targetIndex } = findInsertionPosition(remaining, updatedItem.startTime);
        nextItems = [
          ...remaining.slice(0, targetIndex),
          updatedItem,
          ...remaining.slice(targetIndex),
        ];
      } else {
        const generatedId = `item-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        targetItemId = generatedId;
        const newItem: ItineraryItem = {
          ...sanitizedItemData,
          id: generatedId,
        };
        // Chronologically determine insertion position based on start time
        const { targetIndex } = findInsertionPosition(day.items, newItem.startTime);
        nextItems = [
          ...day.items.slice(0, targetIndex),
          newItem,
          ...day.items.slice(targetIndex),
        ];
      }

      return {
        ...day,
        items: nextItems,
      };
    });

    // Bidirectional synchronization with trip.memories
    const targetDate = currentTrip.days.find((d) => d.dayNumber === dayNumber)?.date || currentTrip.startDate;
    const existingMemories = currentTrip.memories || [];

    // 1. Filter out memories that belong to this spot but whose photo is no longer in sanitizedPhotos
    const photoSet = new Set(sanitizedPhotos);
    const retainedMemories = existingMemories.filter((m) => {
      if (m.spotId === targetItemId) {
        if (sanitizedPhotos.length > 0) {
          return photoSet.has(m.imageUrl);
        }
        // If no local photos, retain if this memory represents the spot's googlePhotosUrl
        return Boolean(sanitizedItemData.googlePhotosUrl);
      }
      return true;
    });

    // 2. Add or update memories for each photo in sanitizedPhotos or pure googlePhotosUrl
    const updatedMemories = [...retainedMemories];
    if (sanitizedPhotos.length > 0) {
      sanitizedPhotos.forEach((photoUrl, pIdx) => {
        const existingMemIndex = updatedMemories.findIndex(
          (m) => m.imageUrl === photoUrl || (m.spotId === targetItemId && m.imageUrl === photoUrl)
        );

        if (existingMemIndex >= 0) {
          updatedMemories[existingMemIndex] = {
            ...updatedMemories[existingMemIndex],
            spotId: targetItemId,
            spotTitle: sanitizedItemData.title,
            dayNumber: dayNumber,
            date: targetDate,
            mood: sanitizedItemData.memoryMood || updatedMemories[existingMemIndex].mood || '✨',
            location: sanitizedItemData.locationName || sanitizedItemData.title,
            caption: sanitizedItemData.notes || sanitizedItemData.title,
            googlePhotosUrl: sanitizedItemData.googlePhotosUrl || undefined,
          };
        } else {
          updatedMemories.push({
            id: `mem-${targetItemId}-${Date.now()}-${pIdx}`,
            imageUrl: photoUrl,
            caption: sanitizedItemData.notes || sanitizedItemData.title,
            spotId: targetItemId,
            spotTitle: sanitizedItemData.title,
            dayNumber: dayNumber,
            date: targetDate,
            mood: sanitizedItemData.memoryMood || '✨',
            location: sanitizedItemData.locationName || sanitizedItemData.title,
            googlePhotosUrl: sanitizedItemData.googlePhotosUrl || undefined,
            createdAt: Date.now() + pIdx * 10,
          });
        }
      });
    } else if (sanitizedItemData.googlePhotosUrl) {
      // Spot has googlePhotosUrl without local photos
      const existingGoogleMemIndex = updatedMemories.findIndex((m) => m.spotId === targetItemId);
      if (existingGoogleMemIndex >= 0) {
        updatedMemories[existingGoogleMemIndex] = {
          ...updatedMemories[existingGoogleMemIndex],
          spotId: targetItemId,
          spotTitle: sanitizedItemData.title,
          dayNumber: dayNumber,
          date: targetDate,
          mood: sanitizedItemData.memoryMood || '✨',
          location: sanitizedItemData.locationName || sanitizedItemData.title,
          caption: sanitizedItemData.notes || sanitizedItemData.title,
          imageUrl: sanitizedItemData.googlePhotosUrl,
          googlePhotosUrl: sanitizedItemData.googlePhotosUrl,
        };
      } else {
        updatedMemories.push({
          id: `mem-${targetItemId}-${Date.now()}`,
          imageUrl: sanitizedItemData.googlePhotosUrl,
          caption: sanitizedItemData.notes || sanitizedItemData.title,
          spotId: targetItemId,
          spotTitle: sanitizedItemData.title,
          dayNumber: dayNumber,
          date: targetDate,
          mood: sanitizedItemData.memoryMood || '✨',
          location: sanitizedItemData.locationName || sanitizedItemData.title,
          googlePhotosUrl: sanitizedItemData.googlePhotosUrl,
          createdAt: Date.now(),
        });
      }
    }

    handleUpdateTrip({
      ...currentTrip,
      days: updatedDays,
      memories: updatedMemories,
      updatedAt: Date.now(),
    });

    setShowItemModal(false);
    setEditingItemData(null);
    setIsPickMode(false);
    setPickedCoords(null);

    if (sanitizedPhotos.length > 0 || sanitizedItemData.googlePhotosUrl) {
      if (currentUser) {
        showToast(lang === 'zh' ? '已儲存並同步' : 'Saved and synced');
      } else {
        showToast(lang === 'zh' ? '已儲存於本機' : 'Saved locally');
      }
    } else {
      showToast(lang === 'zh' ? '已儲存' : 'Saved');
    }
  };

  const handleStartMapPick = () => {
    setIsPickMode(true);
  };

  const handlePickLocation = (lat: number, lng: number) => {
    setPickedCoords({ lat, lng });
    setIsPickMode(false);
    setShowItemModal(true);
  };

  const handleImportTrip = (imported: Trip) => {
    runWithAuth(async () => {
      const exists = tripsRef.current.some((t) => t.id === imported.id);
      let baseTrip = imported;
      if (exists) {
        const newId = `trip-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        baseTrip = await rebindTripMediaIds(imported, newId);
      }
      const sanitized: Trip = {
        ...baseTrip,
        collabId: undefined,
        isCollaborative: false,
        collaborators: undefined,
        editorEmails: undefined,
        viewerEmails: undefined,
        generalAccess: undefined,
        ownerId: currentUserRef.current?.uid || baseTrip.ownerId,
        updatedAt: Date.now(),
      };
      applyUpdateTrip(sanitized);
      setCurrentTripIdState(sanitized.id);
      setCurrentTripId(sanitized.id);
    }, lang === 'zh' ? '匯入與儲存旅程' : 'Import and save trip');
  };

  if (!currentTrip) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#FAF9F6] dark:bg-[#090D16] text-slate-700 dark:text-slate-300 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
        <p>日和手帳載入中...</p>
      </div>
    );
  }

  const dayCount = currentTrip.days.length;
  const nightCount = Math.max(dayCount - 1, 0);

  return (
    <div className="min-h-dvh flex flex-col bg-[#FAF9F6] dark:bg-[#090D16] text-slate-900 dark:text-slate-100 transition-colors overflow-x-hidden">
      {/* Top Navbar (Clean 3-zone contract) */}
      <header className={`sticky top-0 z-40 bg-white/90 dark:bg-[#111827]/90 backdrop-blur-xl border-b border-[#E5E2DC] dark:border-slate-800 pt-[env(safe-area-inset-top,0px)] max-sm:transition-transform max-sm:duration-300 max-sm:ease-in-out ${
        isNavHidden ? 'max-sm:-translate-y-full' : 'max-sm:translate-y-0'
      }`}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-6">
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-2 shrink-0">
            <HiyoriLogo className="w-7 h-7 sm:w-8 sm:h-8 shrink-0" />
            <h1 className="font-bold text-sm sm:text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
              {t.appName}
            </h1>
          </div>

          {/* Zone 2 & 3: Trip Workspace & Account Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            {/* Trip Switcher */}
            <div className="relative shrink min-w-0" ref={tripSwitcherRef}>
              <button
                onClick={() => setShowTripSwitcher(!showTripSwitcher)}
                className="flex items-center gap-1.5 h-10 sm:h-9 px-2.5 sm:px-3 rounded-xl border border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-900 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 transition max-w-[148px] xs:max-w-[188px] sm:max-w-[240px] cursor-pointer"
                title="切換旅程"
              >
                <Plane className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
                <span className="truncate">{currentTrip.title}</span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0 ml-0.5" />
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
                          <p className={`text-sm sm:text-xs truncate ${isActive ? 'font-bold' : 'font-semibold'}`}>
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
                              runWithAuth(() => {
                                setTripModalData(tr);
                                setShowTripModal(true);
                              }, lang === 'zh' ? '編輯旅程設定' : 'Edit trip settings');
                            }}
                            className="min-w-[44px] min-h-[44px] sm:min-w-[34px] sm:min-h-[34px] flex items-center justify-center rounded-xl text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-white/80 dark:hover:bg-slate-700/70 transition cursor-pointer"
                            title={lang === 'zh' ? '編輯旅程' : 'Edit trip'}
                            aria-label={lang === 'zh' ? `編輯 ${tr.title}` : `Edit ${tr.title}`}
                          >
                            <Edit className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                          </button>
                        )}

                        {canDeleteRow && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRequestDeleteTrip(tr);
                            }}
                            className={`min-w-[44px] min-h-[44px] sm:min-w-[34px] sm:min-h-[34px] flex items-center justify-center rounded-xl transition cursor-pointer ${
                              trips.length <= 1
                                ? 'text-slate-300 dark:text-slate-600'
                                : 'text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50'
                            }`}
                            title={lang === 'zh' ? '刪除旅程' : 'Delete trip'}
                            aria-label={lang === 'zh' ? `刪除 ${tr.title}` : `Delete ${tr.title}`}
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
                      ariaLabel={lang === 'zh' ? '切換旅程' : 'Switch trip'}
                    >
                      <IosNavBar
                        title={lang === 'zh' ? '切換旅程' : 'Switch Trip'}
                        subtitle={`${trips.length} ${lang === 'zh' ? '趟旅程' : 'trips'}`}
                        leftLabel={t.newTrip}
                        leftIcon={<Plus className="w-4 h-4" />}
                        onLeftClick={() => {
                          setShowTripSwitcher(false);
                          runWithAuth(() => {
                            setShowTripModal(true);
                            setTripModalData(null);
                          }, lang === 'zh' ? '建立新旅程' : 'Create new trip');
                        }}
                        rightLabel={lang === 'zh' ? '完成' : 'Done'}
                        onRightClick={() => setShowTripSwitcher(false)}
                      />

                      <div
                        className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 space-y-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
                      >
                        <IosInsetGroup header={lang === 'zh' ? '我的旅程' : 'My Trips'}>
                          {tripRows}
                        </IosInsetGroup>

                        <IosInsetGroup divided={false}>
                          <button
                            type="button"
                            onClick={() => {
                              setShowTripSwitcher(false);
                              setShowGlobalHubModal(true);
                            }}
                            className="w-full min-h-[48px] px-4 py-2.5 flex items-center justify-between text-left hover:bg-[#FAF9F6] dark:hover:bg-slate-800/50 transition cursor-pointer"
                          >
                            <span className="flex items-center gap-2.5 text-sm font-bold text-teal-700 dark:text-teal-300">
                              <Compass className="w-4 h-4 shrink-0" />
                              <span>足跡時光庫</span>
                            </span>
                            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                          </button>
                        </IosInsetGroup>
                      </div>
                    </IosModalSheet>
                  );
                }

                return (
                  <div className="absolute left-0 top-full mt-1.5 w-[348px] max-h-[80dvh] flex flex-col bg-[#FAF9F6] dark:bg-[#0B1120] rounded-2xl shadow-2xl border border-[#E5E2DC] dark:border-slate-800 p-2.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-2 pb-2 flex justify-between items-center text-[11px] font-bold text-slate-500 dark:text-slate-400 font-mono tabular-nums shrink-0">
                      <span>{lang === 'zh' ? '所有旅程' : 'All Trips'} ({trips.length})</span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowTripSwitcher(false);
                          runWithAuth(() => {
                            setShowTripModal(true);
                            setTripModalData(null);
                          }, lang === 'zh' ? '建立新旅程' : 'Create new trip');
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
                        <span>足跡時光庫</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Global Travel Memory & Footprint Hub Trigger in Header (Desktop / Tablet) */}
            <button
              onClick={() => setShowGlobalHubModal(true)}
              className="hidden sm:flex h-9 items-center justify-center gap-1.5 px-3 rounded-xl border border-[#E5E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition active:scale-95 text-xs font-semibold shrink-0 whitespace-nowrap cursor-pointer"
              title="搜尋所有過往旅程與月曆足跡"
              aria-label="足跡時光庫"
            >
              <Compass className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
              <span>足跡時光庫</span>
            </button>

            {/* Primary Action: New Trip (Desktop / Tablet) */}
            <button
              onClick={() => {
                runWithAuth(() => {
                  setShowTripModal(true);
                  setTripModalData(null);
                }, lang === 'zh' ? '建立新旅程' : 'Create new trip');
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
              onOpenChange={setIsAuthMenuOpen}
            />

            {/* Unified App Menu */}
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
              onOpenChange={setIsAppMenuOpen}
              onResetData={async () => {
                await resetAllLocalData();
                window.location.reload();
              }}
            />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3.5 sm:px-6 py-4 sm:py-5 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] sm:pb-20 space-y-4">
        {/* Collaborative Trip Connected Alert */}
        {collabBannerTrip && (
          <div className="bg-emerald-950/90 text-white px-3.5 py-2.5 rounded-2xl shadow-sm flex items-center justify-between gap-2.5 border border-emerald-800/80 animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5 min-w-0">
              <Radio className="w-4 h-4 text-emerald-400 shrink-0" />
              <p className="text-xs font-semibold text-white truncate">
                共編中：{collabBannerTrip.title}
              </p>
            </div>
            <button
              onClick={() => {
                setCollabBannerTrip(null);
                window.history.replaceState({}, '', window.location.pathname);
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition active:scale-95 shrink-0"
            >
              確定
            </button>
          </div>
        )}

        {/* Shared Trip Banner Alert */}
        {sharedBannerTrip && (
          <div className="bg-slate-900 text-white px-3.5 py-2.5 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-2.5 border border-slate-800 animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5 min-w-0">
              <Users className="w-4 h-4 text-teal-300 shrink-0" />
              <p className="font-semibold text-xs text-white truncate">
                親友分享：{sharedBannerTrip.title}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <button
                onClick={() => {
                  runWithAuth(async () => {
                    const newId = `trip-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
                    const rebound = await rebindTripMediaIds(sharedBannerTrip, newId);
                    const copyTrip: Trip = {
                      ...rebound,
                      id: newId,
                      title: `${sharedBannerTrip.title} (副本)`,
                      collabId: undefined,
                      isCollaborative: false,
                      collaborators: undefined,
                      editorEmails: undefined,
                      viewerEmails: undefined,
                      generalAccess: undefined,
                      ownerId: currentUserRef.current?.uid || sharedBannerTrip.ownerId,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    };
                    applyUpdateTrip(copyTrip);
                    setCurrentTripIdState(copyTrip.id);
                    setCurrentTripId(copyTrip.id);
                    setSharedBannerTrip(null);
                    window.history.replaceState({}, '', window.location.pathname);
                    showToast(lang === 'zh' ? '已儲存至我的行程' : 'Saved to my trips');
                  }, lang === 'zh' ? '儲存分享行程' : 'Save shared trip');
                }}
                className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition active:scale-95 flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>儲存到我的行程</span>
              </button>
              <button
                onClick={() => {
                  setSharedBannerTrip(null);
                  window.history.replaceState({}, '', window.location.pathname);
                }}
                className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                aria-label="關閉"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Editorial Trip Masthead (Default: clean zero-pill hairline bar) */}
        {!isHeroExpanded ? (
          <div className="rounded-2xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 px-3.5 py-2.5 sm:px-5 sm:py-3 flex items-center justify-between gap-3 animate-in fade-in duration-150">
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                <span className="font-sans font-semibold text-teal-700 dark:text-teal-400 truncate max-w-[130px] sm:max-w-none">
                  {currentTrip.destination}
                </span>
                <span aria-hidden="true">·</span>
                <span className="shrink-0">{formatDateSlash(currentTrip.startDate)} ~ {formatDateSlash(currentTrip.endDate)}</span>
                <span aria-hidden="true" className="hidden xs:inline">·</span>
                <span className="hidden xs:inline shrink-0">{dayCount}天{nightCount}夜</span>
              </div>
              <h2 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base tracking-tight truncate">
                {currentTrip.title}
              </h2>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <button
                onClick={() => setShowShareModal(true)}
                className="min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] rounded-xl border border-[#E5E2DC] dark:border-slate-800 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center transition cursor-pointer"
                title="分享行程"
                aria-label="分享行程"
              >
                <Share2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              </button>
              {permission.canEdit && (
                <button
                  onClick={() => {
                    runWithAuth(() => {
                      setTripModalData(currentTrip);
                      setShowTripModal(true);
                    }, lang === 'zh' ? '編輯行程資訊' : 'Edit trip details');
                  }}
                  className="min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] rounded-xl border border-[#E5E2DC] dark:border-slate-800 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center transition cursor-pointer"
                  title="編輯行程"
                  aria-label="編輯行程"
                >
                  <Edit className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setIsHeroExpanded(true)}
                className="min-h-[44px] sm:min-h-[40px] px-3 rounded-xl text-xs font-semibold text-teal-700 dark:text-teal-300 bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-800 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition"
                title="展開封面"
                aria-label="展開封面"
              >
                <span className="hidden sm:inline">詳情</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* Expanded Editorial Trip Header */
          <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-4 sm:p-6 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <span className="font-sans font-bold text-teal-700 dark:text-teal-400">
                    {currentTrip.destination}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDateSlash(currentTrip.startDate)} ~ {formatDateSlash(currentTrip.endDate)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t.daysCount.replace('{d}', String(dayCount)).replace('{n}', String(nightCount))}</span>
                  {currentTrip.isCollaborative && (
                    <>
                      <span aria-hidden="true">·</span>
                      <button
                        onClick={() => setShowCollabModal(true)}
                        className="font-sans text-teal-700 dark:text-teal-300 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                        title="管理成員與權限"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>
                          {permission.isOwner
                            ? '擁有者 · 多人共編'
                            : permission.role === 'editor'
                            ? '協作編輯中'
                            : '僅檢視模式'}
                        </span>
                      </button>
                    </>
                  )}
                </div>

                <h2 className="font-extrabold text-xl sm:text-2xl tracking-tight text-slate-900 dark:text-white break-words">
                  {currentTrip.title}
                </h2>

                {currentTrip.notes && (
                  <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm max-w-2xl leading-relaxed line-clamp-2">
                    {currentTrip.notes}
                  </p>
                )}
              </div>

              {/* Clean Single-Row Action Cluster */}
              <div className="w-full md:w-auto flex items-center gap-1.5 flex-wrap justify-start sm:justify-end pt-3 md:pt-0 border-t border-[#E5E2DC] dark:border-slate-800 md:border-0 shrink-0">
                <button
                  onClick={() => setShowCollabModal(true)}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-900 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer"
                  title={lang === 'zh' ? '成員與協作權限管理' : 'Manage Collaborators & Permissions'}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                  <span>{currentTrip.isCollaborative ? '成員與權限' : '加人共編'}</span>
                </button>

                <button
                  onClick={() => setShowShareModal(true)}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-900 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer"
                  title={lang === 'zh' ? '分享行程給家人好友' : 'Share Trip with Friends'}
                >
                  <Share2 className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                  <span>{lang === 'zh' ? '分享行程' : 'Share'}</span>
                </button>

                <button
                  onClick={() => setShowPDFExportModal(true)}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-900 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer"
                  title={t.exportPDF}
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span className="hidden sm:inline">{t.exportPDF}</span>
                </button>

                {permission.canEdit && (
                  <button
                    onClick={() => {
                      runWithAuth(() => {
                        setTripModalData(currentTrip);
                        setShowTripModal(true);
                      }, lang === 'zh' ? '編輯行程資訊' : 'Edit trip details');
                    }}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-semibold text-xs flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>{t.editTrip}</span>
                  </button>
                )}

                {permission.isOwner && (
                  <button
                    onClick={() => {
                      runWithAuth(handleDeleteCurrentTrip, lang === 'zh' ? '刪除旅程' : 'Delete trip');
                    }}
                    className="min-w-[40px] min-h-[40px] rounded-xl border border-[#E5E2DC] dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-500 hover:text-rose-700 dark:text-slate-400 dark:hover:text-rose-300 flex items-center justify-center transition cursor-pointer"
                    title={t.deleteTrip}
                    aria-label={t.deleteTrip}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={() => setIsHeroExpanded(false)}
                  className="min-h-[40px] px-2.5 py-1.5 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-xs font-medium transition flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  title="收合"
                >
                  <span>收合</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Unauthenticated Read-Only Preview Notice Banner (Theme-paired hairline surface) */}
        {authReady && !currentUser && (
          <div className="bg-white dark:bg-[#111827] text-slate-800 dark:text-slate-100 px-3.5 py-2 rounded-2xl border border-[#E5E2DC] dark:border-slate-800 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 min-w-0">
              <Eye className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
              <span className="font-medium text-slate-600 dark:text-slate-300 truncate">
                {lang === 'zh' ? '唯讀預覽 · 登入可編輯並同步' : 'Read-only · Sign in to edit & sync'}
              </span>
            </div>
            <button
              onClick={() => runWithAuth(() => {}, lang === 'zh' ? '編輯並同步' : 'Edit & sync')}
              className="min-h-[36px] px-3 py-1 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-[11px] shrink-0 transition active:scale-95 whitespace-nowrap cursor-pointer"
            >
              {lang === 'zh' ? 'Google 登入' : 'Sign In'}
            </button>
          </div>
        )}

        {/* Read-Only Viewer Notice Banner */}
        {!permission.canEdit && currentTrip.isCollaborative && (
          <div className="bg-white dark:bg-[#111827] text-slate-800 dark:text-slate-100 px-4 py-2.5 rounded-2xl border border-[#E5E2DC] dark:border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5">
              <Eye className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
              <p className="text-slate-600 dark:text-slate-300 text-xs">
                目前為<strong className="text-slate-900 dark:text-white font-semibold">僅檢視權限</strong>。如需編輯請向擁有者申請權限。
              </p>
            </div>
            <button
              onClick={() => setShowCollabModal(true)}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-semibold text-xs shrink-0 self-end sm:self-auto transition cursor-pointer"
            >
              權限清單
            </button>
          </div>
        )}

        {/* Desktop Tab Navigation Bar (Unified single-accent segmented control) */}
        <div className="hidden sm:flex items-center gap-1 p-1.5 bg-white dark:bg-[#111827] rounded-2xl border border-[#E5E2DC] dark:border-slate-800 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 min-w-[110px] min-h-[40px] py-2 px-3 rounded-xl font-bold text-xs transition-all duration-150 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'timeline'
                ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-[#F3F1EC] dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Route className="w-4 h-4 shrink-0" />
            <span>{t.timeline}</span>
          </button>

          <button
            onClick={() => setActiveTab('live')}
            className={`flex-1 min-w-[100px] min-h-[40px] py-2 px-3 rounded-xl font-bold text-xs transition-all duration-150 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'live'
                ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-[#F3F1EC] dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>{t.live}</span>
          </button>

          <button
            onClick={() => setActiveTab('expenses')}
            className={`flex-1 min-w-[90px] min-h-[40px] py-2 px-3 rounded-xl font-bold text-xs transition-all duration-150 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'expenses'
                ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-[#F3F1EC] dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Wallet className="w-4 h-4 shrink-0" />
            <span>{t.expenses}</span>
          </button>

          <button
            onClick={() => setActiveTab('prep')}
            className={`flex-1 min-w-[95px] min-h-[40px] py-2 px-3 rounded-xl font-bold text-xs transition-all duration-150 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'prep'
                ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-[#F3F1EC] dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{lang === 'zh' ? '待辦清單' : 'Checklists'}</span>
          </button>

          <button
            onClick={() => setActiveTab('memories')}
            className={`flex-1 min-w-[90px] min-h-[40px] py-2 px-3 rounded-xl font-bold text-xs transition-all duration-150 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'memories'
                ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-[#F3F1EC] dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Camera className="w-4 h-4 shrink-0" />
            <span>{t.memories}</span>
          </button>
        </div>

        {/* Tab Content */}
        <div>
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
                  showToast(lang === 'zh' ? '目前為僅檢視權限' : 'View-only mode');
                  return;
                }
                runWithAuth(() => {
                  setEditingItemData({ dayNumber, initialStartTime: suggestedStartTime });
                  setShowItemModal(true);
                }, lang === 'zh' ? '新增行程景點' : 'Add itinerary spot');
              }}
              onOpenEditItem={(item, dayNumber) => {
                if (currentTrip.isCollaborative && !permission.canEdit) {
                  showToast(lang === 'zh' ? '目前為僅檢視權限' : 'View-only mode');
                  return;
                }
                runWithAuth(() => {
                  setEditingItemData({ item, dayNumber });
                  setShowItemModal(true);
                }, lang === 'zh' ? '編輯景點資訊' : 'Edit spot details');
              }}
              isPickMode={isPickMode}
              onStartMapPick={handleStartMapPick}
              pickedCoords={pickedCoords}
              onPickLocation={handlePickLocation}
              onOpenMemories={(spotId) => {
                setMemoriesSpotId(spotId);
                setActiveTab('memories');
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
                  showToast(lang === 'zh' ? '目前為僅檢視權限' : 'View-only mode');
                  return;
                }
                runWithAuth(() => {
                  setEditingItemData({ item, dayNumber });
                  setShowItemModal(true);
                }, lang === 'zh' ? '編輯景點資訊' : 'Edit spot details');
              }}
              onOpenAddItem={(dayNumber, suggestedStartTime) => {
                if (currentTrip.isCollaborative && !permission.canEdit) {
                  showToast(lang === 'zh' ? '目前為僅檢視權限' : 'View-only mode');
                  return;
                }
                runWithAuth(() => {
                  setEditingItemData({ dayNumber, initialStartTime: suggestedStartTime });
                  setShowItemModal(true);
                }, lang === 'zh' ? '新增行程景點' : 'Add itinerary spot');
              }}
              onNavigateToTimelineDay={(dayNum) => {
                setRequestedTimelineDay({ dayNumber: dayNum, nonce: Date.now() });
                setActiveTab('timeline');
              }}
              onOpenQuickAction={(tab) => {
                if (currentTrip.isCollaborative && !permission.canEdit) {
                  showToast(lang === 'zh' ? '目前為僅檢視權限' : 'View-only mode');
                  return;
                }
                runWithAuth(() => {
                  setQuickActionTab(tab);
                  setShowQuickActionModal(true);
                }, lang === 'zh' ? '快速記帳與筆記' : 'Quick action');
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
              onJumpToDay={(dayNumber) => {
                setRequestedTimelineDay({ dayNumber, nonce: Date.now() });
                setActiveTab('timeline');
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
        </div>
      </main>

      {/* Footer - Desktop Only */}
      <footer className="hidden sm:block mt-auto py-5 border-t border-[#E5E2DC] dark:border-slate-800 bg-white dark:bg-[#111827] text-center text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>日和手帳 Hiyori © 2026 · {t.localPrivacy}</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowImportExportModal(true)} className="text-teal-700 dark:text-teal-400 hover:underline cursor-pointer">
              {t.importBackup}
            </button>
            <span aria-hidden="true">·</span>
            <button onClick={() => setShowSettingsModal(true)} className="text-teal-700 dark:text-teal-400 hover:underline cursor-pointer">
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

      {/* Mobile Bottom Thumb Navigation Bar (Unified single-accent Teal focus, permanently anchored) */}
      <nav
        aria-label="主要分頁導覽"
        style={{ position: 'fixed', zIndex: 45 }}
        className="sm:hidden fixed bottom-0 inset-x-0 bg-white/90 dark:bg-[#111827]/90 backdrop-blur-xl border-t border-[#E5E2DC] dark:border-slate-800 grid grid-cols-5 items-stretch h-[calc(3.5rem+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)] px-1 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)] select-none"
      >
        <button
          onClick={() => setActiveTab('timeline')}
          className={`flex flex-col items-center justify-center min-h-[44px] py-1 transition-all duration-150 active:scale-95 ${
            activeTab === 'timeline'
              ? 'text-teal-700 dark:text-teal-400'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Route className={`w-5 h-5 transition-transform ${activeTab === 'timeline' ? 'scale-105 stroke-[2.3]' : 'stroke-[1.8]'}`} />
          <span className={`text-[10px] mt-0.5 tracking-tight ${activeTab === 'timeline' ? 'font-bold' : 'font-medium'}`}>
            {lang === 'zh' ? '行程' : 'Plan'}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('live')}
          className={`flex flex-col items-center justify-center min-h-[44px] py-1 transition-all duration-150 active:scale-95 ${
            activeTab === 'live'
              ? 'text-teal-700 dark:text-teal-400'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Sparkles className={`w-5 h-5 transition-transform ${activeTab === 'live' ? 'scale-105 stroke-[2.3]' : 'stroke-[1.8]'}`} />
          <span className={`text-[10px] mt-0.5 tracking-tight ${activeTab === 'live' ? 'font-bold' : 'font-medium'}`}>
            {lang === 'zh' ? '隨行' : 'Live'}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex flex-col items-center justify-center min-h-[44px] py-1 transition-all duration-150 active:scale-95 ${
            activeTab === 'expenses'
              ? 'text-teal-700 dark:text-teal-400'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Wallet className={`w-5 h-5 transition-transform ${activeTab === 'expenses' ? 'scale-105 stroke-[2.3]' : 'stroke-[1.8]'}`} />
          <span className={`text-[10px] mt-0.5 tracking-tight ${activeTab === 'expenses' ? 'font-bold' : 'font-medium'}`}>
            {lang === 'zh' ? '記帳' : 'Spend'}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('prep')}
          className={`flex flex-col items-center justify-center min-h-[44px] py-1 transition-all duration-150 active:scale-95 ${
            activeTab === 'prep'
              ? 'text-teal-700 dark:text-teal-400'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <CheckCircle className={`w-5 h-5 transition-transform ${activeTab === 'prep' ? 'scale-105 stroke-[2.3]' : 'stroke-[1.8]'}`} />
          <span className={`text-[10px] mt-0.5 tracking-tight ${activeTab === 'prep' ? 'font-bold' : 'font-medium'}`}>
            {lang === 'zh' ? '待辦' : 'Prep'}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('memories')}
          className={`flex flex-col items-center justify-center min-h-[44px] py-1 transition-all duration-150 active:scale-95 ${
            activeTab === 'memories'
              ? 'text-teal-700 dark:text-teal-400'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Camera className={`w-5 h-5 transition-transform ${activeTab === 'memories' ? 'scale-105 stroke-[2.3]' : 'stroke-[1.8]'}`} />
          <span className={`text-[10px] mt-0.5 tracking-tight ${activeTab === 'memories' ? 'font-bold' : 'font-medium'}`}>
            {lang === 'zh' ? '相簿' : 'Photo'}
          </span>
        </button>
      </nav>

      {/* Modals */}
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
          item={editingItemData.item}
          dayNumber={editingItemData.dayNumber}
          currency={currentTrip.currency}
          tripId={currentTrip.id}
          ownerId={currentTrip.ownerId}
          collabId={currentTrip.collabId}
          canEdit={permission.canEdit}
          existingDayItems={currentTrip.days.find((d) => d.dayNumber === editingItemData.dayNumber)?.items || []}
          defaultStartTime={editingItemData.initialStartTime}
          onSave={handleSaveItem}
          onClose={() => {
            setShowItemModal(false);
            setEditingItemData(null);
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
          onSimulateConflict={() => {
            setShowSettingsModal(false);
            const active = currentTrip;
            const lSummary = summarizeTripForConflict(active);
            const mockCloudTrip: Trip = {
              ...active,
              title: `${active.title} (雲端備份)`,
              days: active.days.slice(0, Math.max(1, active.days.length - 1)),
              todos: (active.todos || []).filter((_, i) => i % 2 === 0),
              updatedAt: (active.updatedAt || Date.now()) - 1000 * 60 * 45,
            };
            const cSummary = summarizeTripForConflict(mockCloudTrip);
            const testConflict: TripConflict = {
              tripId: active.id,
              tripTitle: active.title,
              destination: active.destination,
              localTrip: active,
              cloudTrip: mockCloudTrip,
              localSummary: lSummary,
              cloudSummary: cSummary,
              detectedAt: Date.now(),
              newerVersion: 'local',
              timeDiffMinutes: 45,
            };
            setPendingConflicts([testConflict]);
            setShowConflictModal(true);
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
          onRequireAuth={() => runWithAuth(() => {}, lang === 'zh' ? '建立分享連結' : 'Create share link')}
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
          onRequireAuth={() => runWithAuth(() => {}, lang === 'zh' ? '建立共編連結' : 'Create collaboration link')}
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

      {/* Visual Conflict Resolution Modal (Offline-Online transition strategy) */}
      {showConflictModal && pendingConflicts.length > 0 && (
        <ConflictResolutionModal
          conflicts={pendingConflicts}
          userId={currentUser?.uid}
          lang={lang}
          onResolved={(resolvedTrip) => {
            const baseline = Math.max(Date.now(), resolvedTrip.updatedAt || 0);
            const trackedTrip: Trip = { ...resolvedTrip, lastSyncedAt: baseline };
            setTrips((prev) => {
              const updated = prev.map((t) => (t.id === trackedTrip.id ? trackedTrip : t));
              saveTrips(updated);
              return updated;
            });
            setPendingConflicts((prev) => prev.filter((c) => c.tripId !== trackedTrip.id));
            showToast(`【${trackedTrip.title}】版本衝突已順利解決並同步！`);
          }}
          onClose={() => setShowConflictModal(false)}
        />
      )}


      {/* Travel Quick Action Hub Modal */}
      {showQuickActionModal && (
        <TravelQuickActionModal
          trip={currentTrip}
          lang={lang}
          canEdit={permission.canEdit}
          initialTab={quickActionTab}
          onUpdateTrip={handleUpdateTrip}
          onClose={() => setShowQuickActionModal(false)}
          onShowToast={showToast}
        />
      )}

      {/* Global Travel Memory & Footprint Hub Modal */}
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
            runWithAuth(() => {
              setTripModalData(null);
              setTripModalInitialMode('memory');
              setShowTripModal(true);
            }, lang === 'zh' ? '補登過往回憶旅程' : 'Archive past trip');
          }}
          onSelectTrip={(selectedId, targetSpotId) => {
            const found = trips.find((t) => t.id === selectedId);
            handleSelectTrip(selectedId);
            if (targetSpotId && !targetSpotId.startsWith('mem-cluster-')) {
              setMemoriesSpotId(targetSpotId);
              setActiveTab('memories');
            } else if (targetSpotId || found?.tripMode === 'memory') {
              setMemoriesSpotId(undefined);
              setActiveTab('memories');
            } else {
              setMemoriesSpotId(undefined);
              setActiveTab('timeline');
            }
            setShowGlobalHubModal(false);
            if (found) {
              showToast(lang === 'zh' ? `已切換至旅程：【${found.title}】` : `Switched to ${found.title}`);
            }
          }}
          onClose={() => setShowGlobalHubModal(false)}
        />
      )}

      {/* Auth Prompt Modal for unauthenticated edit interception */}
      <AuthPromptModal
        isOpen={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          pendingActionRef.current = null;
        }}
        reason={authModalReason}
        onLoginSuccess={() => {
          if (pendingActionRef.current) {
            const action = pendingActionRef.current;
            pendingActionRef.current = null;
            setTimeout(() => {
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

      {/* Floating Travel Quick Action Button (Single Clean FAB, anchored above bottom nav) */}
      {(!currentTrip.isCollaborative || permission.canEdit) && (
        <div
          style={{ position: 'fixed', zIndex: 40 }}
          className="fixed right-4 max-sm:bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-8 sm:right-8 flex flex-col items-end gap-2 animate-in fade-in select-none"
        >
          {/* Optional Secondary Todos Pill if expanded */}
          {showFabNote && (
            <button
              onClick={() => {
                runWithAuth(() => {
                  setShowFabNote(false);
                  setQuickActionTab('todos');
                  setShowQuickActionModal(true);
                }, lang === 'zh' ? '行程待辦事項' : 'Trip todos');
              }}
              className="px-3.5 py-1.5 rounded-full bg-slate-900/95 dark:bg-slate-800/95 text-teal-300 font-bold text-xs shadow-lg border border-teal-500/30 flex items-center gap-1.5 transition active:scale-95 animate-in slide-in-from-bottom-2 duration-150 backdrop-blur-md"
            >
              <CheckSquare className="w-3.5 h-3.5 text-teal-400" />
              <span>行程待辦</span>
            </button>
          )}

          {/* Primary Circular Expense FAB */}
          <button
            onClick={() => {
              runWithAuth(() => {
                setQuickActionTab('expense');
                setShowQuickActionModal(true);
              }, lang === 'zh' ? '快速記帳' : 'Quick expense');
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setShowFabNote((prev) => !prev);
            }}
            onTouchStart={() => {
              fabLongPressTimerRef.current = setTimeout(() => {
                setShowFabNote((prev) => !prev);
                if ('vibrate' in navigator) navigator.vibrate?.(40);
              }, 450);
            }}
            onTouchEnd={() => {
              if (fabLongPressTimerRef.current) {
                clearTimeout(fabLongPressTimerRef.current);
                fabLongPressTimerRef.current = null;
              }
            }}
            onTouchCancel={() => {
              if (fabLongPressTimerRef.current) {
                clearTimeout(fabLongPressTimerRef.current);
                fabLongPressTimerRef.current = null;
              }
            }}
            className="w-13 h-13 rounded-full bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 active:scale-90 text-white shadow-lg flex items-center justify-center transition-all duration-200 border border-white/25 dark:border-slate-700 group cursor-pointer"
            title="旅途快速記帳 (長按或右鍵切換便籤)"
            aria-label="快速記帳"
          >
            <div className="relative flex items-center justify-center">
              <DollarSign className="w-5 h-5 stroke-[2.5] group-hover:scale-110 transition-transform" />
              <span className="absolute -top-1 -right-1.5 text-[10px] font-black text-teal-100 leading-none">+</span>
            </div>
          </button>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed top-[max(1rem,env(safe-area-inset-top,0px))] sm:top-16 left-1/2 -translate-x-1/2 z-[70] max-w-[calc(100vw-2rem)] px-4 py-2.5 rounded-2xl bg-slate-900/95 dark:bg-[#111827]/95 text-white text-xs font-bold shadow-2xl border border-slate-700/80 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150 backdrop-blur-md">
          <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <span className="truncate">{toastMessage}</span>
        </div>
      )}

      {/* Floating Offline Indicator */}
      <OfflineIndicator />

      {/* Proactive PWA Update Notification Banner */}
      <UpdateNotificationBanner lang={lang} />
    </div>
  );
}
