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
  clearDeletedTripId,
  hydrateStorageFromIndexedDB,
  resetAllLocalData,
} from './utils/storage';
import { extractInlineImagesToMediaRefs } from './utils/image';
import { formatDateSlash, getTodayLocal, sortItineraryItemsByTime, findInsertionPosition } from './utils/date';
import { Language, TRANSLATIONS, getStoredLanguage, setStoredLanguage } from './utils/i18n';
import { useDarkMode } from './hooks/useDarkMode';
import { useScrollDirection } from './hooks/useScrollDirection';
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
  SnapshotMeta,
} from './utils/firebase';
import {
  mergeTrips,
  enqueueTripSave,
  enqueueTripDelete,
  enqueueCollabSync,
  flushPendingSyncQueue,
  TripConflict,
  summarizeTripForConflict,
  hasTripContentDifference,
} from './utils/syncManager';
import { onAuthStateChanged, User } from 'firebase/auth';
import { PWAInstallButton } from './components/PWA/PWAInstallButton';
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

  // i18n & Theme
  const [lang, setLang] = useState<Language>(getStoredLanguage);
  const { isDark, toggleDarkMode } = useDarkMode();
  const t = TRANSLATIONS[lang];

  // Modals
  const [showTripModal, setShowTripModal] = useState(false);
  const [tripModalData, setTripModalData] = useState<Trip | null>(null);

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

  // Mobile scroll-to-hide dynamic chrome
  const { isNavHidden, resetNavVisibility } = useScrollDirection();

  // Reset navigation visibility whenever switching tabs or opening modals
  useEffect(() => {
    resetNavVisibility();
  }, [activeTab, showQuickActionModal, showGlobalHubModal, resetNavVisibility]);

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

  // Dropdown for switching trips
  const [showTripSwitcher, setShowTripSwitcher] = useState(false);
  const tripSwitcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (tripSwitcherRef.current && !tripSwitcherRef.current.contains(e.target as Node)) {
        setShowTripSwitcher(false);
      }
    };
    if (showTripSwitcher) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showTripSwitcher]);


  // Load from local storage on mount
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const currentUserRef = useRef<User | null>(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

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
    window.addEventListener('cloud_sync_warning', handleSyncWarning);
    window.addEventListener('cloud_sync_status', handleSyncStatus);
    return () => {
      window.removeEventListener('cloud_sync_warning', handleSyncWarning);
      window.removeEventListener('cloud_sync_status', handleSyncStatus);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (fabLongPressTimerRef.current) clearTimeout(fabLongPressTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('share');
    const collabId = urlParams.get('collab');

    hydrateStorageFromIndexedDB().then((hydrated) => {
      if (!isMounted) return;
      const loadedTrips = hydrated.length > 0 ? hydrated : getStoredTrips();
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

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalReason, setAuthModalReason] = useState<string>('');
  const pendingActionRef = useRef<(() => void) | null>(null);

  const requireAuth = (action: () => void, reason?: string): boolean => {
    if (currentUserRef.current) {
      action();
      return true;
    }
    pendingActionRef.current = action;
    setAuthModalReason(reason || (lang === 'zh' ? '編輯與儲存行程' : 'Edit and save trip'));
    setShowAuthModal(true);
    return false;
  };

  // Listen to Auth State and subscribe to cloud trips
  useEffect(() => {
    let unsubscribeFirestore: (() => void) | null = null;
    let isEffectMounted = true;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      currentUserRef.current = user;

      // Clean up previous Firestore listener if user switched or logged out
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
        unsubscribeFirestore = null;
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

      if (!user) return;

      // 1. Flush any offline operations scoped to this user
      flushPendingSyncQueue(user.uid)
        .then(({ successCount }) => {
          if (successCount > 0) {
            showToast(lang === 'zh' ? `已同步 ${successCount} 筆離線變更` : `Synced ${successCount} offline changes`);
          }
        })
        .catch(() => {});

      // 2. Progressive background migration of any legacy inline Base64 trips -> media:// refs
      (async () => {
        try {
          const localTrips = getStoredTrips();
          const updatedLocal: Trip[] = [];
          let anyMigrated = false;
          for (const tr of localTrips) {
            const { trip: lightweight, extractedRecords } = await extractInlineImagesToMediaRefs(tr);
            if (extractedRecords.length > 0) {
              anyMigrated = true;
              updatedLocal.push(lightweight);
              saveTripToCloud(user.uid, lightweight).catch(() => enqueueTripSave(user.uid, lightweight));
            } else {
              updatedLocal.push(tr);
            }
          }
          if (anyMigrated && isEffectMounted) {
            setTrips(updatedLocal);
            saveTrips(updatedLocal);
          }
        } catch (err) {
          console.warn('Progressive media migration warning:', err);
        }
      })();

      // 3. Fetch cloud tombstones before subscribing to user trips
      let cloudTombstones: Record<string, number> = {};
      try {
        cloudTombstones = await fetchUserTombstones(user.uid);
      } catch {
        cloudTombstones = {};
      }
      if (!isEffectMounted || currentUserRef.current?.uid !== user.uid) return;

      // 4. Subscribe to user cloud trips with echo suppression & tombstone awareness
      unsubscribeFirestore = subscribeUserTrips(
        user.uid,
        async (cloudTrips, meta: SnapshotMeta) => {
          if (meta.hasPendingWrites) return;

          if ((cloudTrips && cloudTrips.length > 0) || Object.keys(cloudTombstones).length > 0) {
            const currentLocal = getStoredTrips();
            const deletedIds = new Set(getDeletedTripIds());
            const filteredCloud = (cloudTrips || []).filter((c) => !deletedIds.has(c.id));

            const { merged, tripsToUpload, deletedLocalTripIds } = mergeTrips(
              currentLocal,
              filteredCloud,
              cloudTombstones,
              !meta.fromCache
            );

            deletedLocalTripIds.forEach((id) => recordDeletedTripId(id));

            const hasChange =
              merged.length !== currentLocal.length ||
              merged.some((m) => {
                const l = currentLocal.find((x) => x.id === m.id);
                return !l || hasTripContentDifference(m, l);
              }) ||
              currentLocal.some((l) => {
                const m = merged.find((x) => x.id === l.id);
                return !m || hasTripContentDifference(m, l);
              });

            if (hasChange || deletedLocalTripIds.length > 0) {
              setTrips(merged);
              saveTrips(merged);
            }

            if (tripsToUpload.length > 0) {
              for (const tr of tripsToUpload) {
                if (!deletedIds.has(tr.id)) {
                  saveTripToCloud(user.uid, tr).catch(() => {
                    enqueueTripSave(user.uid, tr);
                  });
                }
              }
              showToast(lang === 'zh' ? '已將本機行程與相片同步至雲端' : 'Local trips & photos synced to cloud');
            }

            const activeId = getCurrentTripId();
            const exists = merged.find((t) => t.id === activeId);
            if (!exists) {
              const fallbackId = merged[0]?.id || '';
              setCurrentTripIdState(fallbackId);
              setCurrentTripId(fallbackId);
            }
          } else {
            // First login with empty cloud: auto-sync existing local trips to user's Firestore
            const currentLocal = getStoredTrips();
            const deletedIds = new Set(getDeletedTripIds());
            const toSync = (currentLocal || []).filter((tr) => !deletedIds.has(tr.id));
            if (toSync.length > 0) {
              for (const tr of toSync) {
                await saveTripToCloud(user.uid, tr).catch(() => enqueueTripSave(user.uid, tr));
              }
              showToast(lang === 'zh' ? '已將本機既有行程同步至雲端' : 'Local trips synced to cloud');
            }
          }
        },
        () => {
          showToast(lang === 'zh' ? '雲端連線不穩，資料已安全保留於本機' : 'Cloud sync unavailable, saved locally');
        }
      );
    });

    return () => {
      isEffectMounted = false;
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
        unsubscribeFirestore = null;
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
          saveTripToCloud(task.uid, task.trip).catch(() => {
            enqueueTripSave(task.uid!, task.trip);
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
          saveTripToCloud(pending.uid, pending.trip).catch((err) => {
            console.warn('Cloud save failed, enqueuing for offline reconnect:', err);
            enqueueTripSave(pending.uid!, pending.trip);
            showToast(lang === 'zh' ? '雲端同步稍有延遲，資料已安全保留於本機' : 'Cloud save delayed, safely queued offline');
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
      requireAuth(() => {
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
      requireAuth(() => handleSaveTripModal(data), lang === 'zh' ? '建立與儲存旅程' : 'Save trip');
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

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueTripSave(user.uid, newTrip);
      } else {
        saveTripToCloud(user.uid, newTrip).catch((err) => {
          console.warn('Cloud save failed, enqueuing for offline reconnect:', err);
          enqueueTripSave(user.uid, newTrip);
        });
      }
    }
    setShowTripModal(false);
    setTripModalData(null);
  };

  const handleDeleteCurrentTrip = () => {
    setShowDeleteTripModal(true);
  };

  const handleConfirmDeleteTrip = () => {
    if (trips.length <= 1) return;
    const user = currentUserRef.current;
    if (!user) {
      requireAuth(() => handleConfirmDeleteTrip(), lang === 'zh' ? '刪除旅程' : 'Delete trip');
      return;
    }
    if (currentTrip.isCollaborative && !permission.isOwner) {
      showToast(lang === 'zh' ? '僅擁有者可刪除共編旅程' : 'Only owner can delete this trip');
      return;
    }

    const tripToDeleteId = currentTrip.id;
    recordDeletedTripId(tripToDeleteId);

    const remaining = trips.filter((t) => t.id !== tripToDeleteId);
    setTrips(remaining);
    saveTrips(remaining);
    const nextActiveId = remaining[0]?.id || '';
    setCurrentTripIdState(nextActiveId);
    setCurrentTripId(nextActiveId);
    setShowDeleteTripModal(false);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueueTripDelete(user.uid, tripToDeleteId);
    } else {
      deleteTripFromCloud(user.uid, tripToDeleteId)
        .then(() => {
          clearDeletedTripId(tripToDeleteId);
        })
        .catch((err) => {
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
      requireAuth(() => handleSaveItem(itemData, existingId), lang === 'zh' ? '儲存景點資訊' : 'Save spot');
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
    requireAuth(() => {
      const exists = trips.some((t) => t.id === imported.id);
      const sanitized: Trip = exists
        ? {
            ...imported,
            id: `trip-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            ownerId: currentUserRef.current?.uid || imported.ownerId,
            updatedAt: Date.now(),
          }
        : {
            ...imported,
            ownerId: currentUserRef.current?.uid || imported.ownerId,
            updatedAt: Date.now(),
          };
      applyUpdateTrip(sanitized);
      setCurrentTripIdState(sanitized.id);
      setCurrentTripId(sanitized.id);
    }, lang === 'zh' ? '匯入與儲存旅程' : 'Import and save trip');
  };

  if (!currentTrip) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300">
        <p>日和手帳載入中...</p>
      </div>
    );
  }

  const dayCount = currentTrip.days.length;
  const nightCount = Math.max(dayCount - 1, 0);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] dark:bg-[#090D16] text-slate-900 dark:text-slate-100 transition-colors overflow-x-hidden">
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

              {showTripSwitcher && (
                <>
                  {/* Backdrop for closing dropdown */}
                  <div
                    className="fixed inset-0 z-40 bg-black/15 backdrop-blur-[0.5px] sm:hidden"
                    onClick={() => setShowTripSwitcher(false)}
                  />
                  <div className="fixed inset-x-3 top-14 sm:absolute sm:inset-x-auto sm:left-0 sm:right-auto sm:top-full mt-1.5 w-auto sm:w-80 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-[#111827] rounded-2xl shadow-2xl border border-[#E5E2DC] dark:border-slate-800 p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-2.5 py-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 border-b border-[#E5E2DC] dark:border-slate-800 flex justify-between items-center font-mono tabular-nums">
                      <span>{lang === 'zh' ? '所有旅程' : 'All Trips'} ({trips.length})</span>
                      <button
                        onClick={() => {
                          setShowTripSwitcher(false);
                          requireAuth(() => {
                            setShowTripModal(true);
                            setTripModalData(null);
                          }, lang === 'zh' ? '建立新旅程' : 'Create new trip');
                        }}
                        className="text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-0.5 font-sans cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{t.newTrip}</span>
                      </button>
                    </div>

                    <div className="max-h-60 overflow-y-auto divide-y divide-[#E5E2DC]/70 dark:divide-slate-800 my-1">
                      {trips.map((tr) => (
                        <div
                          key={tr.id}
                          onClick={() => {
                            handleSelectTrip(tr.id);
                            setShowTripSwitcher(false);
                          }}
                          className={`p-2.5 min-h-[44px] rounded-xl cursor-pointer transition text-xs flex items-center justify-between ${
                            tr.id === currentTrip.id
                              ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200 font-bold'
                              : 'hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <p className="truncate font-semibold">{tr.title}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{tr.destination}</p>
                          </div>
                          {tr.id === currentTrip.id && <Check className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />}
                        </div>
                      ))}
                    </div>

                    {/* Quick Access to Global Travel Memory Hub */}
                    <div className="pt-1.5 mt-1 border-t border-[#E5E2DC] dark:border-slate-800">
                      <button
                        onClick={() => {
                          setShowTripSwitcher(false);
                          setShowGlobalHubModal(true);
                        }}
                        className="w-full min-h-[40px] py-2 px-3 rounded-xl bg-[#FAF9F6] hover:bg-[#F3F1EC] dark:bg-slate-900 dark:hover:bg-slate-800 text-teal-700 dark:text-teal-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Compass className="w-3.5 h-3.5 shrink-0" />
                        <span>足跡時光庫</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
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
                requireAuth(() => {
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
            <AuthButton lang={lang} localTrips={trips} />

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
                  requireAuth(() => {
                    const copyTrip: Trip = {
                      ...sharedBannerTrip,
                      id: `trip-${Date.now()}`,
                      title: `${sharedBannerTrip.title} (副本)`,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    };
                    handleImportTrip(copyTrip);
                    setSharedBannerTrip(null);
                    window.history.replaceState({}, '', window.location.pathname);
                    showToast(lang === 'zh' ? '已儲存至我的行程' : 'Saved to my trips');
                  }, lang === 'zh' ? '儲存分享行程' : 'Save shared trip');
                }}
                className="px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition active:scale-95 flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                <span>儲存到我的行程</span>
              </button>
              <button
                onClick={() => {
                  setSharedBannerTrip(null);
                  window.history.replaceState({}, '', window.location.pathname);
                }}
                className="min-w-[36px] min-h-[36px] rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
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
                className="min-w-[40px] min-h-[40px] rounded-xl border border-[#E5E2DC] dark:border-slate-800 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center transition cursor-pointer"
                title="分享行程"
                aria-label="分享行程"
              >
                <Share2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              </button>
              {permission.canEdit && (
                <button
                  onClick={() => {
                    requireAuth(() => {
                      setTripModalData(currentTrip);
                      setShowTripModal(true);
                    }, lang === 'zh' ? '編輯行程資訊' : 'Edit trip details');
                  }}
                  className="min-w-[40px] min-h-[40px] rounded-xl border border-[#E5E2DC] dark:border-slate-800 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center transition cursor-pointer"
                  title="編輯行程"
                  aria-label="編輯行程"
                >
                  <Edit className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setIsHeroExpanded(true)}
                className="min-h-[40px] px-3 rounded-xl text-xs font-semibold text-teal-700 dark:text-teal-300 bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-800 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition"
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
                      requireAuth(() => {
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
                      requireAuth(handleDeleteCurrentTrip, lang === 'zh' ? '刪除旅程' : 'Delete trip');
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
        {!currentUser && (
          <div className="bg-white dark:bg-[#111827] text-slate-800 dark:text-slate-100 px-3.5 py-2 rounded-2xl border border-[#E5E2DC] dark:border-slate-800 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 min-w-0">
              <Eye className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
              <span className="font-medium text-slate-600 dark:text-slate-300 truncate">
                {lang === 'zh' ? '唯讀預覽 · 登入可編輯並同步' : 'Read-only · Sign in to edit & sync'}
              </span>
            </div>
            <button
              onClick={() => requireAuth(() => {}, lang === 'zh' ? '編輯並同步' : 'Edit & sync')}
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
              onUpdateTrip={handleUpdateTrip}
              onOpenAddItem={(dayNumber, suggestedStartTime) => {
                if (currentTrip.isCollaborative && !permission.canEdit) {
                  showToast(lang === 'zh' ? '目前為僅檢視權限' : 'View-only mode');
                  return;
                }
                requireAuth(() => {
                  setEditingItemData({ dayNumber, initialStartTime: suggestedStartTime });
                  setShowItemModal(true);
                }, lang === 'zh' ? '新增行程景點' : 'Add itinerary spot');
              }}
              onOpenEditItem={(item, dayNumber) => {
                if (currentTrip.isCollaborative && !permission.canEdit) {
                  showToast(lang === 'zh' ? '目前為僅檢視權限' : 'View-only mode');
                  return;
                }
                requireAuth(() => {
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
              onNavigateToTimelineDay={() => setActiveTab('timeline')}
              onOpenQuickAction={(tab) => {
                if (currentTrip.isCollaborative && !permission.canEdit) {
                  showToast(lang === 'zh' ? '目前為僅檢視權限' : 'View-only mode');
                  return;
                }
                requireAuth(() => {
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

      {/* Mobile Bottom Thumb Navigation Bar (Unified single-accent Teal focus) */}
      <nav
        aria-label="主要分頁導覽"
        style={{ position: 'fixed', zIndex: 45 }}
        className={`sm:hidden fixed bottom-0 inset-x-0 bg-white/90 dark:bg-[#111827]/90 backdrop-blur-xl border-t border-[#E5E2DC] dark:border-slate-800 grid grid-cols-5 items-stretch h-[calc(3.5rem+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)] px-1 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)] select-none max-sm:transition-transform max-sm:duration-300 max-sm:ease-in-out ${
          isNavHidden ? 'max-sm:translate-y-full' : 'max-sm:translate-y-0'
        }`}
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
          onSave={handleSaveTripModal}
          onClose={() => {
            setShowTripModal(false);
            setTripModalData(null);
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
          onRequireAuth={() => requireAuth(() => {}, lang === 'zh' ? '建立分享連結' : 'Create share link')}
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
          onRequireAuth={() => requireAuth(() => {}, lang === 'zh' ? '建立共編連結' : 'Create collaboration link')}
          onUpdateTrip={handleUpdateTrip}
          onClose={() => setShowCollabModal(false)}
        />
      )}

      {showDeleteTripModal && (
        <DeleteConfirmModal
          tripTitle={currentTrip.title}
          isLastTrip={trips.length <= 1}
          onConfirm={handleConfirmDeleteTrip}
          onClose={() => setShowDeleteTripModal(false)}
        />
      )}

      {/* Visual Conflict Resolution Modal (Offline-Online transition strategy) */}
      {showConflictModal && pendingConflicts.length > 0 && (
        <ConflictResolutionModal
          conflicts={pendingConflicts}
          userId={currentUser?.uid}
          lang={lang}
          onResolved={(resolvedTrip) => {
            setTrips((prev) => {
              const updated = prev.map((t) => (t.id === resolvedTrip.id ? resolvedTrip : t));
              saveTrips(updated);
              return updated;
            });
            setPendingConflicts((prev) => prev.filter((c) => c.tripId !== resolvedTrip.id));
            showToast(`【${resolvedTrip.title}】版本衝突已順利解決並同步！`);
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
          onSelectTrip={(selectedId, targetSpotId) => {
            handleSelectTrip(selectedId);
            if (targetSpotId) {
              setMemoriesSpotId(targetSpotId);
              setActiveTab('memories');
            } else {
              setActiveTab('timeline');
            }
            setShowGlobalHubModal(false);
            const found = trips.find((t) => t.id === selectedId);
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

      {/* Floating Travel Quick Action Button (Single Clean FAB, hidden for read-only collaborators) */}
      {(!currentTrip.isCollaborative || permission.canEdit) && (
        <div
          style={{ position: 'fixed', zIndex: 40 }}
          className={`fixed right-4 sm:bottom-8 sm:right-8 flex flex-col items-end gap-2 animate-in fade-in select-none max-sm:transition-all max-sm:duration-300 max-sm:ease-in-out ${
            isNavHidden
              ? 'max-sm:bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))]'
              : 'max-sm:bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))]'
          }`}
        >
          {/* Optional Secondary Todos Pill if expanded */}
          {showFabNote && (
            <button
              onClick={() => {
                requireAuth(() => {
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
              requireAuth(() => {
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
        <div className="fixed top-4 sm:top-16 left-1/2 -translate-x-1/2 z-[70] max-w-[calc(100vw-2rem)] px-4 py-2.5 rounded-2xl bg-slate-900/95 dark:bg-[#111827]/95 text-white text-xs font-bold shadow-2xl border border-slate-700/80 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150 backdrop-blur-md">
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
