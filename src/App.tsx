import React, { useState, useEffect, useRef } from 'react';
import { Trip, ItineraryItem } from './types/itinerary';
import { PRESET_TRIPS } from './data/presetTrips';
import {
  getStoredTrips,
  saveTrips,
  getCurrentTripId,
  setCurrentTripId,
} from './utils/storage';
import { formatDateSlash } from './utils/date';
import { Language, TRANSLATIONS, getStoredLanguage, setStoredLanguage } from './utils/i18n';
import { useDarkMode } from './hooks/useDarkMode';
import { TimelineTab } from './components/Tabs/TimelineTab';
import { LiveCompanionTab } from './components/Tabs/LiveCompanionTab';
import { ExpensesTab } from './components/Tabs/ExpensesTab';
import { PackingTab } from './components/Tabs/PackingTab';
import { MemoTab } from './components/Tabs/MemoTab';
import { TripMemoriesView } from './components/Memories/TripMemoriesView';
import { TripEditModal } from './components/Modals/TripEditModal';
import { ItemEditModal } from './components/Modals/ItemEditModal';
import { ImportExportModal } from './components/Modals/ImportExportModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { PDFExportModal } from './components/Modals/PDFExportModal';
import { ShareTripModal } from './components/Modals/ShareTripModal';
import { CollaborateModal } from './components/Modals/CollaborateModal';
import { DeleteConfirmModal } from './components/Modals/DeleteConfirmModal';
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
} from './utils/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { PWAInstallButton } from './components/PWA/PWAInstallButton';
import { OfflineIndicator } from './components/PWA/OfflineIndicator';
import {
  Compass,
  Calendar,
  MapPin,
  Plus,
  Upload,
  Edit,
  DollarSign,
  CheckCircle,
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
} from 'lucide-react';

type TabType = 'timeline' | 'live' | 'expenses' | 'packing' | 'memories' | 'memo';

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
  const [editingItemData, setEditingItemData] = useState<{ item?: ItineraryItem; dayNumber: number } | null>(null);

  const [showImportExportModal, setShowImportExportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showPDFExportModal, setShowPDFExportModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCollabModal, setShowCollabModal] = useState(false);
  const [showDeleteTripModal, setShowDeleteTripModal] = useState(false);
  const [showQuickActionModal, setShowQuickActionModal] = useState(false);
  const [quickActionTab, setQuickActionTab] = useState<'expense' | 'scratchpad' | 'calc'>('expense');
  const [sharedBannerTrip, setSharedBannerTrip] = useState<Trip | null>(null);
  const [collabBannerTrip, setCollabBannerTrip] = useState<Trip | null>(null);
  const [isHeroExpanded, setIsHeroExpanded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Map Pick Coordinate Mode
  const [isPickMode, setIsPickMode] = useState(false);
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Dropdown for switching trips
  const [showTripSwitcher, setShowTripSwitcher] = useState(false);
  const tripSwitcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tripSwitcherRef.current && !tripSwitcherRef.current.contains(e.target as Node)) {
        setShowTripSwitcher(false);
      }
    };
    if (showTripSwitcher) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTripSwitcher]);

  // Load from local storage on mount
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const loadedTrips = getStoredTrips();
    setTrips(loadedTrips);
    const activeId = getCurrentTripId();
    const found = loadedTrips.find((t) => t.id === activeId);
    setCurrentTripIdState(found ? found.id : (loadedTrips[0]?.id || ''));

    const urlParams = new URLSearchParams(window.location.search);

    // Check for shared trip in URL
    const shareId = urlParams.get('share');
    if (shareId) {
      fetchSharedTrip(shareId).then((shared) => {
        if (shared) {
          setSharedBannerTrip(shared);
          setTrips((prev) => {
            const exists = prev.some((t) => t.id === shared.id);
            const nextTrips = exists ? prev : [shared, ...prev];
            saveTrips(nextTrips);
            return nextTrips;
          });
          setCurrentTripIdState(shared.id);
          setCurrentTripId(shared.id);
        }
      });
    }

    // Check for collaborative trip in URL
    const collabId = urlParams.get('collab');
    if (collabId) {
      fetchCollaborativeTrip(collabId).then((collabTrip) => {
        if (collabTrip) {
          setCollabBannerTrip(collabTrip);
          setTrips((prev) => {
            const idx = prev.findIndex((t) => t.id === collabTrip.id || t.collabId === collabId);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = collabTrip;
              return updated;
            }
            return [collabTrip, ...prev];
          });
          setCurrentTripIdState(collabTrip.id);
        }
      });
    }
  }, []);

  // Real-time listener for current collaborative trip
  useEffect(() => {
    const activeTrip = trips.find((t) => t.id === currentTripId) || trips[0];
    if (!activeTrip?.collabId || !activeTrip?.isCollaborative) return;
    const activeCollabId = activeTrip.collabId;
    const activeId = activeTrip.id;

    const unsubscribe = subscribeCollaborativeTrip(
      activeCollabId,
      (liveTrip) => {
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
      }
    );

    return () => unsubscribe();
  }, [currentTripId, trips]);

  // Listen to Auth State and subscribe to cloud trips
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Subscribe to user cloud trips
        const unsubscribeFirestore = subscribeUserTrips(user.uid, async (cloudTrips) => {
          if (cloudTrips && cloudTrips.length > 0) {
            setTrips(cloudTrips);
            saveTrips(cloudTrips);
            const activeId = getCurrentTripId();
            const exists = cloudTrips.find((t) => t.id === activeId);
            if (!exists) {
              setCurrentTripIdState(cloudTrips[0].id);
              setCurrentTripId(cloudTrips[0].id);
            }
          } else {
            // First login with empty cloud: auto-sync existing local trips to user's Firestore!
            const currentLocal = getStoredTrips();
            if (currentLocal && currentLocal.length > 0) {
              for (const tr of currentLocal) {
                await saveTripToCloud(user.uid, tr);
              }
            }
          }
        });
        return () => unsubscribeFirestore();
      }
    });
    return () => unsubscribeAuth();
  }, []);

  const handleToggleLang = () => {
    const nextLang: Language = lang === 'zh' ? 'en' : 'zh';
    setLang(nextLang);
    setStoredLanguage(nextLang);
  };

  const handleUpdateTrip = (updatedTrip: Trip) => {
    setTrips((prevTrips) => {
      const idx = prevTrips.findIndex((t) => t.id === updatedTrip.id);
      const nextTrips = idx >= 0
        ? prevTrips.map((t) => (t.id === updatedTrip.id ? updatedTrip : t))
        : [updatedTrip, ...prevTrips];
      saveTrips(nextTrips);
      return nextTrips;
    });

    // Sync to Collaborative Room if collaborative
    if (updatedTrip.collabId && updatedTrip.isCollaborative) {
      syncCollaborativeTrip(updatedTrip.collabId, updatedTrip, currentUser?.displayName || undefined).catch((err) =>
        console.error('Collab sync failed:', err)
      );
    }

    // Sync to Cloud if authenticated
    if (currentUser) {
      saveTripToCloud(currentUser.uid, updatedTrip).catch((err) =>
        console.error('Cloud save failed:', err)
      );
    }
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
    if (tripModalData) {
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
          title: data.title || (lang === 'zh' ? '新旅遊行程' : 'New Trip'),
          destination: data.destination || (lang === 'zh' ? '旅遊目的地' : 'Destination'),
          startDate: data.startDate || new Date().toISOString().slice(0, 10),
          endDate: data.endDate || new Date().toISOString().slice(0, 10),
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
      const newTrips = [newTrip, ...trips];
      setTrips(newTrips);
      saveTrips(newTrips);
      setCurrentTripIdState(newTrip.id);
      setCurrentTripId(newTrip.id);

      if (currentUser) {
        saveTripToCloud(currentUser.uid, newTrip).catch((err) =>
          console.error('Cloud save failed:', err)
        );
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

    const tripToDeleteId = currentTrip.id;
    const remaining = trips.filter((t) => t.id !== tripToDeleteId);
    setTrips(remaining);
    saveTrips(remaining);
    setCurrentTripIdState(remaining[0].id);
    setCurrentTripId(remaining[0].id);

    if (currentUser) {
      deleteTripFromCloud(currentUser.uid, tripToDeleteId).catch((err) =>
        console.error('Cloud delete failed:', err)
      );
    }
  };

  const handleSaveItem = (itemData: Omit<ItineraryItem, 'id'>, existingId?: string) => {
    if (!currentTrip || !editingItemData) return;
    const { dayNumber } = editingItemData;

    const updatedDays = currentTrip.days.map((day) => {
      if (day.dayNumber !== dayNumber) return day;

      if (existingId) {
        return {
          ...day,
          items: day.items.map((it) => (it.id === existingId ? { ...itemData, id: existingId } : it)),
        };
      } else {
        const newItem: ItineraryItem = {
          ...itemData,
          id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        };
        return {
          ...day,
          items: [...day.items, newItem],
        };
      }
    });

    handleUpdateTrip({
      ...currentTrip,
      days: updatedDays,
      updatedAt: Date.now(),
    });

    setShowItemModal(false);
    setEditingItemData(null);
    setIsPickMode(false);
    setPickedCoords(null);
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
    const updated = [imported, ...trips];
    setTrips(updated);
    saveTrips(updated);
    setCurrentTripIdState(imported.id);
    setCurrentTripId(imported.id);
  };

  if (!currentTrip) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300">
        <p>Loading Wayfarer...</p>
      </div>
    );
  }

  const dayCount = currentTrip.days.length;
  const nightCount = Math.max(dayCount - 1, 0);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 shadow-2xs pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-1.5 sm:gap-3">
          {/* Brand */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-teal-800 dark:bg-teal-900 border border-teal-700/60 flex items-center justify-center text-teal-100 shadow-xs shrink-0">
              <Compass className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-bold text-sm sm:text-base tracking-tight text-slate-900 dark:text-white">
                {t.appName}
              </h1>
              <span className="hidden sm:inline-block text-[10px] font-medium text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 px-1.5 py-0.5 rounded-md border border-teal-200 dark:border-teal-800">
                隨行手帖
              </span>
            </div>
          </div>

          {/* Quick Actions (Trip Switcher & Control Buttons) */}
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            {/* Trip Switcher */}
            <div className="relative shrink min-w-0" ref={tripSwitcherRef}>
              <button
                onClick={() => setShowTripSwitcher(!showTripSwitcher)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 transition shadow-2xs max-w-[95px] xs:max-w-[130px] sm:max-w-[190px]"
                title="切換旅程"
              >
                <Plane className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
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
                  <div className="fixed inset-x-3 top-14 sm:absolute sm:inset-x-auto sm:left-0 sm:right-auto sm:top-full mt-1.5 w-auto sm:w-80 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-800 p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-2.5 py-1 text-[11px] font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                      <span>{lang === 'zh' ? '所有旅程' : 'All Trips'} ({trips.length})</span>
                      <button
                        onClick={() => {
                          setShowTripSwitcher(false);
                          setShowTripModal(true);
                          setTripModalData(null);
                        }}
                        className="text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-0.5"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{t.newTrip}</span>
                      </button>
                    </div>

                    <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 my-1">
                      {trips.map((tr) => (
                        <div
                          key={tr.id}
                          onClick={() => {
                            handleSelectTrip(tr.id);
                            setShowTripSwitcher(false);
                          }}
                          className={`p-2 rounded-xl cursor-pointer transition text-xs flex items-center justify-between ${
                            tr.id === currentTrip.id
                              ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-200 font-bold'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <p className="truncate font-semibold">{tr.title}</p>
                            <p className="text-[10px] text-slate-400">{tr.destination}</p>
                          </div>
                          {tr.id === currentTrip.id && <span className="text-teal-600 font-bold shrink-0">✓</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Primary Action: New Trip (Icon-only on mobile, full text on sm+) */}
            <button
              onClick={() => {
                setShowTripModal(true);
                setTripModalData(null);
              }}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition active:scale-95 shrink-0"
              title={t.newTrip}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{t.newTrip}</span>
            </button>

            {/* Google Cloud Auth & Sync */}
            <AuthButton lang={lang} localTrips={trips} />

            {/* GitHub Repository Link */}
            <a
              href="https://github.com/noworneverev/hiyori-trip"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 items-center justify-center transition shadow-2xs active:scale-95 shrink-0"
              title="GitHub Repository"
              aria-label="GitHub Repository"
            >
              <Github className="w-4 h-4" />
            </a>

            {/* Unified App Menu (Dark mode, Language, Import/Export, PDF, Share, PWA, Settings) */}
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
              onOpenSettings={() => setShowSettingsModal(true)}
            />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-4 pb-20 sm:pb-8 space-y-4">
        {/* Collaborative Trip Connected Alert */}
        {collabBannerTrip && (
          <div className="bg-emerald-950/90 text-white px-4 py-3.5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-emerald-800/80 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-400/30">
                <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              </div>
              <div className="text-xs">
                <p className="font-bold text-sm text-white">已加入多人即時共編行程：【{collabBannerTrip.title}】</p>
                <p className="text-emerald-200 text-[11px] mt-0.5">任何修改（景點、時間、花費）將即時同步給所有同行成員！</p>
              </div>
            </div>
            <button
              onClick={() => {
                setCollabBannerTrip(null);
                window.history.replaceState({}, '', window.location.pathname);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition active:scale-95 shrink-0 self-end sm:self-auto"
            >
              我知道了
            </button>
          </div>
        )}

        {/* Shared Trip Banner Alert */}
        {sharedBannerTrip && (
          <div className="bg-slate-900 text-white px-4 py-3.5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-slate-800 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0 border border-teal-400/30">
                <Users className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <p className="font-bold text-sm text-white">正在查閱親友分享的旅程：【{sharedBannerTrip.title}】</p>
                <p className="text-teal-200 text-[11px] mt-0.5">免登入直接檢視景點與地圖！您也可以將此行程存入您自己的行程庫中。</p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <button
                onClick={() => {
                  const copyTrip: Trip = {
                    ...sharedBannerTrip,
                    id: `trip-${Date.now()}`,
                    title: `${sharedBannerTrip.title} (親友副本)`,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  };
                  handleImportTrip(copyTrip);
                  setSharedBannerTrip(null);
                  window.history.replaceState({}, '', window.location.pathname);
                  showToast(lang === 'zh' ? '已成功儲存至您的行程庫中！' : 'Saved to your trips library!');
                }}
                className="px-3.5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md transition active:scale-95 flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>儲存到我的行程</span>
              </button>
              <button
                onClick={() => {
                  setSharedBannerTrip(null);
                  window.history.replaceState({}, '', window.location.pathname);
                }}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs transition"
                title="關閉提示"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Compact Trip Header (Default across all tabs to save screen space) */}
        {!isHeroExpanded ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-2 sm:p-2.5 px-3 sm:px-4 shadow-2xs flex items-center justify-between gap-2 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-xl bg-gradient-to-r ${currentTrip.coverGradient || 'from-emerald-600 to-teal-600'} text-white text-[10px] sm:text-[11px] font-bold shrink-0 shadow-2xs max-w-[80px] xs:max-w-[110px] sm:max-w-[150px] truncate`}
                title={currentTrip.destination}
              >
                {currentTrip.destination}
              </span>
              <div className="min-w-0 flex-1 truncate">
                <h2 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm truncate">
                  {currentTrip.title}
                </h2>
                <p className="text-[10px] text-slate-400 font-mono truncate">
                  {formatDateSlash(currentTrip.startDate)} ~ {formatDateSlash(currentTrip.endDate)} · {dayCount}天{nightCount}夜
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
              <button
                onClick={() => setShowCollabModal(true)}
                className="hidden sm:flex p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs transition"
                title="成員與權限"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
              </button>
              <button
                onClick={() => setShowShareModal(true)}
                className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs transition"
                title="分享行程"
              >
                <Share2 className="w-3.5 h-3.5 text-teal-600" />
              </button>
              <button
                onClick={() => setShowPDFExportModal(true)}
                className="hidden sm:flex p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs transition"
                title={t.exportPDF}
              >
                <Printer className="w-3.5 h-3.5 text-teal-600" />
              </button>
              {permission.canEdit && (
                <button
                  onClick={() => {
                    setTripModalData(currentTrip);
                    setShowTripModal(true);
                  }}
                  className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs transition"
                  title="編輯行程"
                >
                  <Edit className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setIsHeroExpanded(true)}
                className="px-2 py-1.5 sm:px-2.5 rounded-xl text-[10px] sm:text-[11px] font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 transition flex items-center gap-0.5 sm:gap-1"
                title="展開完整封面"
              >
                <span className="hidden sm:inline">展開封面</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* Full Sleek Trip Hero Card */
          <div
            className={`rounded-3xl bg-gradient-to-r ${currentTrip.coverGradient || 'from-emerald-600 via-teal-600 to-cyan-700'} text-white p-4 sm:p-6 shadow-md relative overflow-hidden`}
          >
            <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] sm:text-[11px] font-bold">
                    {t.daysCount.replace('{d}', String(dayCount)).replace('{n}', String(nightCount))}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] sm:text-xs text-teal-100 font-medium">
                    <MapPin className="w-3 h-3 text-teal-200 shrink-0" />
                    <span className="truncate max-w-[150px] sm:max-w-none">{currentTrip.destination}</span>
                  </span>
                  <span className="flex items-center gap-1 text-[11px] sm:text-xs text-teal-100 font-mono">
                    <Calendar className="w-3 h-3 text-teal-200 shrink-0" />
                    <span>{formatDateSlash(currentTrip.startDate)} ~ {formatDateSlash(currentTrip.endDate)}</span>
                  </span>
                  {currentTrip.isCollaborative && (
                    <button
                      onClick={() => setShowCollabModal(true)}
                      className="px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-300/30 text-[10px] font-bold flex items-center gap-1 transition hover:bg-emerald-400/30"
                      title="點擊管理成員與權限"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>
                        {permission.isOwner
                          ? '擁有者 · 多人共編'
                          : permission.role === 'editor'
                          ? '協作編輯中'
                          : '僅檢視模式'}
                      </span>
                    </button>
                  )}
                </div>

                <h2 className="font-black text-lg sm:text-2xl tracking-tight break-words">
                  {currentTrip.title}
                </h2>

                {currentTrip.notes && (
                  <p className="text-teal-100 text-xs mt-1.5 max-w-2xl opacity-90 line-clamp-2">
                    {currentTrip.notes}
                  </p>
                )}
              </div>

              {/* Quick Actions Bar */}
              <div className="w-full md:w-auto flex items-center gap-1.5 flex-wrap justify-start sm:justify-end mt-2 md:mt-0 pt-2.5 md:pt-0 border-t border-white/15 md:border-0 shrink-0">
                {/* Collaborators & Permissions Button */}
                <button
                  onClick={() => setShowCollabModal(true)}
                  className={`px-3 py-1.5 rounded-xl font-semibold text-xs flex items-center gap-1.5 border transition active:scale-95 shadow-xs ${
                    currentTrip.isCollaborative
                      ? 'bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-100 border-emerald-400/40'
                      : 'bg-white/20 hover:bg-white/30 backdrop-blur-md text-white border-white/20'
                  }`}
                  title={lang === 'zh' ? '成員與協作權限管理' : 'Manage Collaborators & Permissions'}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-200" />
                  <span>{currentTrip.isCollaborative ? '成員與權限' : '加人共編'}</span>
                </button>

                {/* Share Trip Button */}
                <button
                  onClick={() => setShowShareModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-semibold text-xs flex items-center gap-1.5 border border-white/20 transition active:scale-95 shadow-xs"
                  title={lang === 'zh' ? '分享行程給家人好友' : 'Share Trip with Friends'}
                >
                  <Share2 className="w-3.5 h-3.5 text-teal-100" />
                  <span>{lang === 'zh' ? '分享行程' : 'Share'}</span>
                </button>

                {/* Export Printable PDF Button */}
                <button
                  onClick={() => setShowPDFExportModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-semibold text-xs flex items-center gap-1.5 border border-white/20 transition active:scale-95 shadow-xs"
                  title={t.exportPDF}
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.exportPDF}</span>
                </button>

                {/* Edit Trip Details (Only if user has edit permission) */}
                {permission.canEdit && (
                  <button
                    onClick={() => {
                      setTripModalData(currentTrip);
                      setShowTripModal(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-semibold text-xs flex items-center gap-1.5 border border-white/20 transition active:scale-95 shadow-xs"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>{t.editTrip}</span>
                  </button>
                )}

                {/* Delete Trip (Only owner has permission to delete) */}
                {permission.isOwner && (
                  <button
                    onClick={handleDeleteCurrentTrip}
                    className="p-1.5 rounded-xl bg-white/15 hover:bg-rose-500/80 backdrop-blur-md text-white text-xs border border-white/20 transition shadow-xs"
                    title={t.deleteTrip}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Collapse button when expanded */}
                <button
                  onClick={() => setIsHeroExpanded(false)}
                  className="px-2.5 py-1.5 rounded-xl bg-black/20 hover:bg-black/30 backdrop-blur-md text-white text-xs border border-white/20 transition flex items-center gap-1"
                  title="收合封面"
                >
                  <span>收合</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Read-Only Viewer Notice Banner */}
        {!permission.canEdit && currentTrip.isCollaborative && (
          <div className="bg-slate-900/90 text-white px-4 py-3 rounded-2xl border border-slate-700 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-lg animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
                <Eye className="w-4 h-4" />
              </div>
              <p className="text-slate-300 text-xs">
                您目前在此行程具有<strong>【僅檢視權限 (Viewer)】</strong>，可自由查閱景點路線與天氣。如需新增或修改行程，請向擁有者申請編輯權限。
              </p>
            </div>
            <button
              onClick={() => setShowCollabModal(true)}
              className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs shrink-0 self-end sm:self-auto transition"
            >
              查看權限清單
            </button>
          </div>
        )}

        {/* Desktop Tab Navigation Bar */}
        <div className="hidden sm:flex items-center gap-1.5 p-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 min-w-[110px] py-2 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 ${
              activeTab === 'timeline'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>{t.timeline}</span>
          </button>

          <button
            onClick={() => setActiveTab('live')}
            className={`flex-1 min-w-[100px] py-2 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 ${
              activeTab === 'live'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>{t.live}</span>
          </button>

          <button
            onClick={() => setActiveTab('expenses')}
            className={`flex-1 min-w-[85px] py-2 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 ${
              activeTab === 'expenses'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>{t.expenses}</span>
          </button>

          <button
            onClick={() => setActiveTab('packing')}
            className={`flex-1 min-w-[85px] py-2 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 ${
              activeTab === 'packing'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            <span>{t.packing}</span>
          </button>

          <button
            onClick={() => setActiveTab('memories')}
            className={`flex-1 min-w-[85px] py-2 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 ${
              activeTab === 'memories'
                ? 'bg-rose-700 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>{t.memories}</span>
          </button>

          <button
            onClick={() => setActiveTab('memo')}
            className={`flex-1 min-w-[85px] py-2 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 ${
              activeTab === 'memo'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>{t.memo}</span>
          </button>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'timeline' && (
            <TimelineTab
              trip={currentTrip}
              lang={lang}
              onUpdateTrip={handleUpdateTrip}
              onOpenAddItem={(dayNumber) => {
                setEditingItemData({ dayNumber });
                setShowItemModal(true);
              }}
              onOpenEditItem={(item, dayNumber) => {
                setEditingItemData({ item, dayNumber });
                setShowItemModal(true);
              }}
              isPickMode={isPickMode}
              onStartMapPick={handleStartMapPick}
              pickedCoords={pickedCoords}
              onPickLocation={handlePickLocation}
              onOpenMemories={(spotId) => {
                setMemoriesSpotId(spotId);
                setActiveTab('memories');
              }}
            />
          )}

          {activeTab === 'live' && (
            <LiveCompanionTab
              trip={currentTrip}
              lang={lang}
              onUpdateTrip={handleUpdateTrip}
              onNavigateToTimelineDay={() => setActiveTab('timeline')}
              onOpenQuickAction={(tab) => {
                setQuickActionTab(tab);
                setShowQuickActionModal(true);
              }}
            />
          )}

          {activeTab === 'expenses' && (
            <ExpensesTab trip={currentTrip} lang={lang} onUpdateTrip={handleUpdateTrip} />
          )}

          {activeTab === 'packing' && (
            <PackingTab trip={currentTrip} lang={lang} onUpdateTrip={handleUpdateTrip} />
          )}

          {activeTab === 'memories' && (
            <TripMemoriesView
              trip={currentTrip}
              lang={lang}
              onUpdateTrip={handleUpdateTrip}
              initialSpotId={memoriesSpotId}
            />
          )}

          {activeTab === 'memo' && (
            <MemoTab trip={currentTrip} lang={lang} onUpdateTrip={handleUpdateTrip} />
          )}
        </div>
      </main>

      {/* Footer - Desktop Only (Hidden on Mobile/PWA to avoid duplicate navigation and safe area clutter) */}
      <footer className="hidden sm:block mt-auto py-5 border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>日和手帳 Hiyori © 2026 • {t.localPrivacy}</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowImportExportModal(true)} className="text-teal-600 dark:text-teal-400 hover:underline">
              {t.importBackup}
            </button>
            <span>•</span>
            <button onClick={() => setShowSettingsModal(true)} className="text-teal-600 dark:text-teal-400 hover:underline">
              {t.settings}
            </button>
            <span>•</span>
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

      {/* Mobile Bottom Thumb Navigation Bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/90 dark:border-slate-800 grid grid-cols-6 items-center h-14 px-1 shadow-lg pb-safe">
        <button
          onClick={() => setActiveTab('timeline')}
          className={`flex flex-col items-center justify-center py-1 transition ${
            activeTab === 'timeline' ? 'text-teal-600 dark:text-teal-400 font-bold' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <Compass className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">{lang === 'zh' ? '行程' : 'Plan'}</span>
        </button>
        <button
          onClick={() => setActiveTab('live')}
          className={`flex flex-col items-center justify-center py-1 transition ${
            activeTab === 'live' ? 'text-teal-600 dark:text-teal-400 font-bold' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">{lang === 'zh' ? '隨行' : 'Live'}</span>
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex flex-col items-center justify-center py-1 transition ${
            activeTab === 'expenses' ? 'text-teal-600 dark:text-teal-400 font-bold' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">{lang === 'zh' ? '記帳' : 'Spend'}</span>
        </button>
        <button
          onClick={() => setActiveTab('memories')}
          className={`flex flex-col items-center justify-center py-1 transition ${
            activeTab === 'memories' ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <Camera className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">{lang === 'zh' ? '相簿' : 'Photo'}</span>
        </button>
        <button
          onClick={() => setActiveTab('packing')}
          className={`flex flex-col items-center justify-center py-1 transition ${
            activeTab === 'packing' ? 'text-teal-600 dark:text-teal-400 font-bold' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">{lang === 'zh' ? '清單' : 'List'}</span>
        </button>
        <button
          onClick={() => setActiveTab('memo')}
          className={`flex flex-col items-center justify-center py-1 transition ${
            activeTab === 'memo' ? 'text-teal-600 dark:text-teal-400 font-bold' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">{lang === 'zh' ? '便籤' : 'Memo'}</span>
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
          onResetData={() => {
            localStorage.clear();
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
          lang={lang}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {showCollabModal && (
        <CollaborateModal
          trip={currentTrip}
          currentUser={currentUser}
          lang={lang}
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

      {/* Travel Quick Action Hub Modal */}
      {showQuickActionModal && (
        <TravelQuickActionModal
          trip={currentTrip}
          lang={lang}
          initialTab={quickActionTab}
          onUpdateTrip={handleUpdateTrip}
          onClose={() => setShowQuickActionModal(false)}
          onShowToast={showToast}
        />
      )}

      {/* Floating Travel Quick Action Bar (Bottom Right - 快速記帳 & 隨手便簽) */}
      <div className="fixed bottom-16 right-3 sm:bottom-6 sm:right-6 z-40 flex items-center bg-slate-900/90 dark:bg-slate-950/90 backdrop-blur-md rounded-2xl p-1 shadow-2xl border border-slate-700/70 ring-1 ring-white/10 gap-1 animate-in fade-in">
        {/* Fast Expense Button */}
        <button
          onClick={() => {
            setQuickActionTab('expense');
            setShowQuickActionModal(true);
          }}
          className="px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-xs group"
          title="旅途快速記帳 (支援拍照與上傳發票)"
        >
          <DollarSign className="w-3.5 h-3.5 text-emerald-200 group-hover:scale-110 transition-transform" />
          <span>記帳</span>
        </button>

        {/* Scratchpad Note Button */}
        <button
          onClick={() => {
            setQuickActionTab('scratchpad');
            setShowQuickActionModal(true);
          }}
          className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 group border border-amber-500/30"
          title="隨手便簽 (免標題快速備忘)"
        >
          <FileText className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
          <span>便簽</span>
        </button>
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-slate-900/95 text-white text-xs font-bold shadow-2xl border border-slate-700/80 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150 backdrop-blur-md">
          <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Floating Offline Indicator */}
      <OfflineIndicator />
    </div>
  );
}
