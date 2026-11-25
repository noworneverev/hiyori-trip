import React, { useState, useMemo, useEffect, useRef, Suspense, lazy } from 'react';
import { Trip, DayPlan, ItineraryItem } from '../../types/itinerary';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useModalLayer } from '../../hooks/useModalHistory';

// Heavy map / overview chunks are loaded on demand so Leaflet never blocks first paint.
const LeafletMap = lazy(() => import('../Map/LeafletMap').then((m) => ({ default: m.LeafletMap })));
const ItineraryOverviewTable = lazy(() =>
  import('../Itinerary/ItineraryOverviewTable').then((m) => ({ default: m.ItineraryOverviewTable }))
);

const CATEGORY_COLORS: Record<string, string> = {
  spot: '#0d9488',
  food: '#ea580c',
  transport: '#0284c7',
  hotel: '#7c3aed',
  shopping: '#db2777',
  activity: '#e11d48',
  other: '#475569',
};

const LazyPanelFallback: React.FC<{ height?: number }> = ({ height = 220 }) => (
  <div
    style={{ height }}
    className="w-full rounded-2xl bg-[#FAF9F6] dark:bg-slate-900/60 border border-[#E5E2DC] dark:border-slate-800 animate-pulse"
  />
);
import {
  calculateDistanceKm,
  formatDistance,
  estimateTravelTime,
  getGoogleMapsNavigationUrl,
  getGoogleMapsRouteUrl,
  isValidCoordinate,
} from '../../utils/geo';
import {
  formatDateSlash,
  formatMonthDaySlash,
  formatMinutesToHHMM,
  getDayOfWeek,
  isDateToday,
  addDaysLocal,
  normalizeDateKey,
  sortItineraryItemsByTime,
  getSuggestedNextStartTime,
  parseTimeToMinutes,
  isOvernightTimeRange,
  detectDayTimeConflicts,
  autoShiftDayConflicts,
  DayConflictReport,
} from '../../utils/date';
import { resolveDestinationTimezone } from '../../utils/timezone';
import {
  fetchTripWeatherByDay,
  DayWeatherStatus,
  getWeatherDescription,
} from '../../utils/weather';
import { Language, TRANSLATIONS } from '../../utils/i18n';
import { sanitizeExternalUrl } from '../../utils/url';
import { garbageCollectOrphanedMedia } from '../../utils/image';
import { getStoredTrips } from '../../utils/storage';
import { triggerHaptic } from '../../utils/pwaUpdater';
import { IosActionSheet } from '../UI/IosPrimitives';
import {
  Calendar,
  Clock,
  MapPin,
  Navigation,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Circle,
  Bus,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Map as MapIcon,
  Footprints,
  Landmark,
  Utensils,
  Train,
  Hotel,
  Camera,
  ShoppingBag,
  Sparkles,
  Pin,
  Search,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertTriangle,
  Umbrella,
  CloudSun,
  Wand2,
  MoreHorizontal,
  Copy,
  CalendarArrowUp,
  GripVertical,
  ArrowRight,
} from 'lucide-react';
import { MediaImage } from '../UI/MediaImage';

interface TimelineTabProps {
  trip: Trip;
  lang: Language;
  canEdit?: boolean;
  onUpdateTrip: (updatedTrip: Trip) => void;
  onOpenAddItem: (dayNumber: number, suggestedStartTime?: string) => void;
  onOpenEditItem: (item: ItineraryItem, dayNumber: number) => void;
  isPickMode: boolean;
  onStartMapPick: () => void;
  onCancelMapPick?: () => void;
  pickedCoords: { lat: number; lng: number } | null;
  onPickLocation: (lat: number, lng: number) => void;
  onOpenMemories?: (spotId?: string) => void;
  requireAuth?: (action: () => void, reason?: string) => boolean;
  isNavHidden?: boolean;
  requestedDay?: { dayNumber: number; nonce: number } | null;
}

const CATEGORY_MAP: Record<
  string,
  { labelKey: string; fallbackLabel: string; icon: React.ComponentType<{ className?: string }>; text: string }
> = {
  spot: { labelKey: 'cat_spot', fallbackLabel: '景點', icon: Landmark, text: 'text-teal-700 dark:text-teal-400' },
  food: { labelKey: 'cat_food', fallbackLabel: '美食', icon: Utensils, text: 'text-orange-600 dark:text-orange-400' },
  transport: { labelKey: 'cat_transport', fallbackLabel: '交通', icon: Train, text: 'text-sky-600 dark:text-sky-400' },
  hotel: { labelKey: 'cat_hotel', fallbackLabel: '住宿', icon: Hotel, text: 'text-violet-600 dark:text-violet-400' },
  shopping: { labelKey: 'cat_shopping', fallbackLabel: '購物', icon: ShoppingBag, text: 'text-pink-600 dark:text-pink-400' },
  activity: { labelKey: 'cat_activity', fallbackLabel: '活動', icon: Sparkles, text: 'text-rose-600 dark:text-rose-400' },
  other: { labelKey: 'cat_other', fallbackLabel: '其他', icon: Pin, text: 'text-slate-600 dark:text-slate-400' },
};

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delay);
  };
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}

/**
 * Detect whether a touch target sits inside a nested horizontally scrollable element
 * (such as thumbnail photo carousels) so day-swipe never fights horizontal scroll.
 */
function isInsideHorizontalScroller(target: EventTarget | null): boolean {
  let node = target instanceof HTMLElement ? target : null;
  while (node) {
    if (node.dataset?.noDaySwipe === 'true') return true;
    const style = window.getComputedStyle(node);
    const ox = style.overflowX;
    if ((ox === 'auto' || ox === 'scroll') && node.scrollWidth > node.clientWidth + 4) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export const TimelineTab: React.FC<TimelineTabProps> = ({
  trip,
  lang,
  canEdit = true,
  onUpdateTrip,
  onOpenAddItem,
  onOpenEditItem,
  isPickMode,
  onCancelMapPick,
  pickedCoords,
  onPickLocation,
  onOpenMemories,
  requireAuth,
  isNavHidden = false,
  requestedDay = null,
}) => {
  const t = TRANSLATIONS[lang];
  const isZh = lang === 'zh' || lang === 'zh-CN';

  // Resolve destination timezone for accurate Today highlighting & weather splitting
  const firstTripCoords = useMemo(() => {
    if (isValidCoordinate(trip.destinationLat, trip.destinationLng)) {
      return { lat: trip.destinationLat!, lng: trip.destinationLng! };
    }
    for (const d of trip.days || []) {
      const it = d.items.find((i) => isValidCoordinate(i.lat, i.lng));
      if (it) return { lat: it.lat!, lng: it.lng! };
    }
    return null;
  }, [trip.destinationLat, trip.destinationLng, trip.days]);

  const destTzInfo = useMemo(
    () => resolveDestinationTimezone(trip.destination, firstTripCoords),
    [trip.destination, firstTripCoords]
  );

  const [timelineViewMode, setTimelineViewMode] = useState<'daily' | 'overview'>('daily');
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(() => {
    const todayInTrip = (trip.days || []).find((d) => isDateToday(d.date, destTzInfo.tz));
    return todayInTrip ? todayInTrip.dayNumber : trip.days[0]?.dayNumber || 1;
  });

  // Pointer Drag-to-Reorder state (zero-dependency, iOS Safari PWA friendly)
  const [dragState, setDragState] = useState<{ fromIndex: number; overIndex: number } | null>(null);
  const dragStateRef = useRef<{ fromIndex: number; overIndex: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const handleReorderRef = useRef<(from: number, to: number) => void>(() => {});

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  // Always release global pointer listeners & timers on unmount
  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    };
  }, []);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [expandedNoteIds, setExpandedNoteIds] = useState<Record<string, boolean>>({});
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [spotSearchQuery, setSpotSearchQuery] = useState('');
  const [dayWeatherMap, setDayWeatherMap] = useState<Record<number, DayWeatherStatus>>({});
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);

  // Inline Day Theme & Notes Editor
  const [isEditingDayHeader, setIsEditingDayHeader] = useState(false);
  const [dayThemeDraft, setDayThemeDraft] = useState('');
  const [dayNotesDraft, setDayNotesDraft] = useState('');

  // Commercial Action Sheets: Spot More Menu, Move-to-Day Picker, Delete Spot Confirm, Delete Day Confirm
  const [actionMenuItem, setActionMenuItem] = useState<{ item: ItineraryItem; index: number } | null>(null);
  const [moveDayItem, setMoveDayItem] = useState<ItineraryItem | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<ItineraryItem | null>(null);
  const [confirmDeleteDay, setConfirmDeleteDay] = useState<DayPlan | null>(null);

  // Reset selectedDayNumber cleanly when switching trips
  const prevTripIdRef = useRef<string>(trip.id);
  useEffect(() => {
    if (prevTripIdRef.current !== trip.id) {
      prevTripIdRef.current = trip.id;
      const todayInTrip = (trip.days || []).find((d) => isDateToday(d.date, destTzInfo.tz));
      setSelectedDayNumber(todayInTrip ? todayInTrip.dayNumber : trip.days[0]?.dayNumber || 1);
      setSelectedItemId(null);
      setSpotSearchQuery('');
      setIsEditingDayHeader(false);
    }
  }, [trip.id, trip.days, destTzInfo.tz]);

  // Clamp selectedDayNumber if days array shrinks (e.g. after deleting a day or shortening trip)
  useEffect(() => {
    if (trip.days.length > 0 && !trip.days.some((d) => d.dayNumber === selectedDayNumber)) {
      setSelectedDayNumber(trip.days[trip.days.length - 1].dayNumber);
    }
  }, [trip.days, selectedDayNumber]);

  // P0 FIX: Auto-expand map and exit overview whenever Map Pick Mode is activated
  useEffect(() => {
    if (isPickMode) {
      setTimelineViewMode('daily');
      setIsMapExpanded(true);
      setTimeout(() => {
        document.getElementById('timeline-day-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 80);
    }
  }, [isPickMode]);

  // Jump cleanly when another tab requests a specific day
  useEffect(() => {
    if (requestedDay && requestedDay.dayNumber > 0) {
      setSelectedDayNumber(requestedDay.dayNumber);
      setTimelineViewMode('daily');
    }
  }, [requestedDay?.dayNumber, requestedDay?.nonce]);

  // Multi-day Open-Meteo Weather Forecast (Timezone-aware, cached locally)
  const weatherSignature = useMemo(() => {
    return (trip.days || [])
      .map((d) => {
        const firstGeo = (d.items || []).find((it) => isValidCoordinate(it.lat, it.lng));
        return `${d.dayNumber}:${d.date}:${firstGeo ? `${firstGeo.lat?.toFixed(2)},${firstGeo.lng?.toFixed(2)}` : 'none'}`;
      })
      .join('|');
  }, [trip.days]);

  useEffect(() => {
    const controller = new AbortController();
    if (!trip.days || trip.days.length === 0) return;
    setIsWeatherLoading(true);
    fetchTripWeatherByDay(
      trip.days.map((d) => ({ dayNumber: d.dayNumber, date: d.date, items: d.items || [] })),
      trip.destination,
      destTzInfo.tz,
      controller.signal
    )
      .then((res) => {
        if (!controller.signal.aborted) setDayWeatherMap(res);
      })
      .catch(() => {
        // Silent graceful degradation
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsWeatherLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [trip.id, trip.destination, destTzInfo.tz, weatherSignature]);

  // Per-day time conflict analysis
  const dayConflictReports = useMemo<Record<number, DayConflictReport>>(() => {
    const map: Record<number, DayConflictReport> = {};
    (trip.days || []).forEach((d) => {
      map[d.dayNumber] = detectDayTimeConflicts(d.items || [], isZh ? 'zh' : 'en');
    });
    return map;
  }, [trip.days, isZh]);

  const [dismissedConflictKeys, setDismissedConflictKeys] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('hiyori_dismissed_conflicts_v1');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const getConflictKey = (dayNumber: number, report?: DayConflictReport): string => {
    if (!report || report.conflicts.length === 0) return '';
    return `${trip.id}:d${dayNumber}:${report.conflicts.map((c) => c.id).join('|')}`;
  };

  const handleDismissDayConflict = (dayNumber: number, report?: DayConflictReport) => {
    const key = getConflictKey(dayNumber, report);
    if (!key) return;
    setDismissedConflictKeys((prev) => {
      const entries = Object.entries({ ...prev, [key]: true }).slice(-40);
      const next = Object.fromEntries(entries);
      try {
        localStorage.setItem('hiyori_dismissed_conflicts_v1', JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const handleAutoResolveDayConflicts = (dayNumber: number) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleAutoResolveDayConflicts(dayNumber), isZh ? '自動順延衝突時段' : 'Auto-resolve schedule conflicts')) {
      return;
    }
    const updatedDays = trip.days.map((d) => {
      if (d.dayNumber !== dayNumber) return d;
      return {
        ...d,
        items: autoShiftDayConflicts(d.items || [], 15),
      };
    });
    onUpdateTrip({ ...trip, days: updatedDays, updatedAt: Date.now() });
  };

  // Horizontal Day Strip scroll & compact header state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const lastScrollYRef = useRef(0);
  const isCompactRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    isCompactRef.current = isCompact;
  }, [isCompact]);

  useEffect(() => {
    const debouncedSetExpansion = debounce((shouldCompact: boolean) => {
      if (isCompactRef.current !== shouldCompact) {
        setIsCompact(shouldCompact);
      }
    }, 60);

    const handleWindowScroll = () => {
      // Body scroll-lock (open sheet) rewrites window scroll position — never treat that as user scroll.
      if (document.body.hasAttribute('data-scroll-locked') || document.body.style.position === 'fixed') return;
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;
        const diff = currentScrollY - lastScrollYRef.current;

        if (currentScrollY <= 70) {
          debouncedSetExpansion.cancel();
          if (isCompactRef.current) setIsCompact(false);
        } else if (currentScrollY > 160 && diff > 14) {
          debouncedSetExpansion(true);
        } else if (diff < -24) {
          debouncedSetExpansion(false);
        }

        lastScrollYRef.current = currentScrollY;
        rafIdRef.current = null;
      });
    };

    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleWindowScroll);
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      debouncedSetExpansion.cancel();
    };
  }, []);

  const scrollToCenterChip = (elementId: string) => {
    const activeBtn = document.getElementById(elementId);
    const container = scrollContainerRef.current;
    if (activeBtn && container) {
      const containerWidth = container.clientWidth;
      const btnLeft = activeBtn.offsetLeft;
      const btnWidth = activeBtn.offsetWidth;
      const targetScrollLeft = btnLeft - containerWidth / 2 + btnWidth / 2;
      container.scrollTo({ left: Math.max(0, targetScrollLeft), behavior: 'smooth' });
    }
  };

  const checkScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollContainerRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [trip.days.length]);

  useEffect(() => {
    const targetId =
      timelineViewMode === 'daily'
        ? `day-filter-chip-${selectedDayNumber}`
        : 'day-filter-chip-overview';
    scrollToCenterChip(targetId);
  }, [selectedDayNumber, timelineViewMode]);

  const handleScrollDays = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollBy({ left: direction === 'left' ? -240 : 240, behavior: 'smooth' });
  };

  // Identify Today in destination timezone
  const todayDay = useMemo(() => {
    return trip.days.find((d) => isDateToday(d.date, destTzInfo.tz));
  }, [trip.days, destTzInfo.tz]);

  const handleJumpToToday = () => {
    if (!todayDay) return;
    triggerHaptic(10);
    handleSelectDay(todayDay.dayNumber);
    setTimelineViewMode('daily');
    scrollToCenterChip(`day-filter-chip-${todayDay.dayNumber}`);
  };

  // High-Resolution Photo Overlay State
  const [overlaySpotPhoto, setOverlaySpotPhoto] = useState<{
    item: ItineraryItem;
    photoIndex: number;
  } | null>(null);
  const [overlayHighResFailed, setOverlayHighResFailed] = useState(false);
  const [isEditingOverlayGoogleUrl, setIsEditingOverlayGoogleUrl] = useState(false);
  const [overlayEditUrl, setOverlayEditUrl] = useState('');

  useBodyScrollLock(Boolean(overlaySpotPhoto));
  useModalLayer(Boolean(overlaySpotPhoto), () => setOverlaySpotPhoto(null));

  useEffect(() => {
    setOverlayHighResFailed(false);
    setIsEditingOverlayGoogleUrl(false);
    setOverlayEditUrl(overlaySpotPhoto?.item.googlePhotosUrl || '');
  }, [overlaySpotPhoto?.item.id, overlaySpotPhoto?.photoIndex]);

  const handleSaveOverlayGoogleUrl = () => {
    if (!canEdit || !overlaySpotPhoto) return;
    if (requireAuth && !requireAuth(handleSaveOverlayGoogleUrl, isZh ? '修改相片連結' : 'Edit photo link')) {
      return;
    }
    const finalUrl = sanitizeExternalUrl(overlayEditUrl) || '';
    const targetItemId = overlaySpotPhoto.item.id;

    const updatedDays = trip.days.map((d) => ({
      ...d,
      items: d.items.map((it) => (it.id === targetItemId ? { ...it, googlePhotosUrl: finalUrl || undefined } : it)),
    }));

    const updatedMemories = (trip.memories || []).map((m) =>
      m.spotId === targetItemId ? { ...m, googlePhotosUrl: finalUrl || undefined } : m
    );

    onUpdateTrip({
      ...trip,
      days: updatedDays,
      memories: updatedMemories,
      updatedAt: Date.now(),
    });

    setOverlaySpotPhoto({
      ...overlaySpotPhoto,
      item: { ...overlaySpotPhoto.item, googlePhotosUrl: finalUrl || undefined },
    });
    setIsEditingOverlayGoogleUrl(false);
  };

  // Global search matching across all days of the trip
  const matchingSpots = useMemo(() => {
    if (!spotSearchQuery.trim()) return [];
    const q = spotSearchQuery.toLowerCase().trim();
    const results: { dayNumber: number; date: string; item: ItineraryItem }[] = [];
    trip.days.forEach((day) => {
      day.items.forEach((item) => {
        const titleMatch = item.title?.toLowerCase().includes(q);
        const locMatch = (item.locationName || item.address)?.toLowerCase().includes(q);
        const notesMatch = item.notes?.toLowerCase().includes(q);
        const catMatch = item.category?.toLowerCase().includes(q);
        if (titleMatch || locMatch || notesMatch || catMatch) {
          results.push({ dayNumber: day.dayNumber, date: day.date, item });
        }
      });
    });
    return results;
  }, [trip.days, spotSearchQuery]);

  const handleJumpToSpot = (dayNumber: number, itemId: string) => {
    setSelectedDayNumber(dayNumber);
    setSelectedItemId(itemId);
    setTimelineViewMode('daily');
    setSpotSearchQuery('');
    setTimeout(() => {
      const el = document.getElementById(`spot-card-${itemId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-teal-500');
        setTimeout(() => el.classList.remove('ring-2', 'ring-teal-500'), 2000);
      }
    }, 120);
  };

  const activeDay = trip.days.find((d) => d.dayNumber === selectedDayNumber) || trip.days[0] || {
    id: 'empty',
    dayNumber: 1,
    date: trip.startDate,
    items: [],
  };

  const activeDayGeoCount = useMemo(
    () => (activeDay.items || []).filter((it) => isValidCoordinate(it.lat, it.lng)).length,
    [activeDay.items]
  );

  // Safe clamped insertion midpoint time (NEVER outputs 24:xx!)
  const getBetweenTime = (prevItem: ItineraryItem, nextItem?: ItineraryItem): string => {
    if (!nextItem) return getSuggestedNextStartTime([prevItem]);
    const prevEnd = parseTimeToMinutes(prevItem.endTime || prevItem.startTime);
    const nextStart = parseTimeToMinutes(nextItem.startTime);
    if (prevEnd !== 99999 && nextStart !== 99999 && nextStart > prevEnd) {
      const midMinutes = Math.floor((prevEnd + nextStart) / 2 / 15) * 15;
      return formatMinutesToHHMM(Math.min(23 * 60 + 55, midMinutes));
    }
    if (prevEnd !== 99999) {
      return formatMinutesToHHMM(Math.min(23 * 60 + 55, prevEnd + 30));
    }
    return '12:00';
  };

  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleSelectDay = (dayNum: number, dir?: 'left' | 'right') => {
    if (dayNum === selectedDayNumber) return;
    setSlideDirection(dir || (dayNum > selectedDayNumber ? 'left' : 'right'));
    setSelectedDayNumber(dayNum);
    setSelectedItemId(null);
    setIsEditingDayHeader(false);
  };

  const handlePrevDay = () => {
    if (selectedDayNumber > 1) {
      triggerHaptic(10);
      handleSelectDay(selectedDayNumber - 1, 'right');
    }
  };

  const handleNextDay = () => {
    if (selectedDayNumber < trip.days.length) {
      triggerHaptic(10);
      handleSelectDay(selectedDayNumber + 1, 'left');
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    if (isInsideHorizontalScroller(e.target)) {
      touchStartRef.current = null;
      return;
    }
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX >= 52 && absX > absY * 1.45 && (deltaTime < 700 || absX > 90)) {
      if (deltaX < 0) handleNextDay();
      else handlePrevDay();
    }
  };

  const handleToggleComplete = (itemId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleToggleComplete(itemId), isZh ? '標記景點完成狀態' : 'Mark spot completed')) {
      return;
    }
    triggerHaptic(8);
    const updatedDays = trip.days.map((day) => ({
      ...day,
      items: day.items.map((it) => (it.id === itemId ? { ...it, completed: !it.completed } : it)),
    }));
    onUpdateTrip({ ...trip, days: updatedDays, updatedAt: Date.now() });
  };

  const executeDeleteItem = (itemId: string) => {
    if (!canEdit) return;
    const now = Date.now();
    const removedMemIds = (trip.memories || []).filter((m) => m.spotId === itemId).map((m) => m.id);
    const deletedItemIds: Record<string, number> = {
      ...(trip.deletedItemIds || {}),
      [itemId]: now,
    };
    removedMemIds.forEach((id) => {
      deletedItemIds[id] = now;
    });
    const updatedDays = trip.days.map((day) => {
      if (day.dayNumber !== activeDay.dayNumber) return day;
      return {
        ...day,
        items: day.items.filter((it) => it.id !== itemId),
      };
    });
    const updatedMemories = (trip.memories || []).filter((m) => m.spotId !== itemId);
    const updatedTrip: Trip = {
      ...trip,
      days: updatedDays,
      memories: updatedMemories,
      deletedItemIds,
      updatedAt: now,
    };
    onUpdateTrip(updatedTrip);
    setConfirmDeleteItem(null);
    garbageCollectOrphanedMedia(
      getStoredTrips().map((stored) => (stored.id === updatedTrip.id ? updatedTrip : stored))
    ).catch(() => {});
  };

  /**
   * Smart duration-preserving reorder:
   * - If both items have different valid startTimes, swaps their startTimes while preserving EACH item's own duration.
   * - If only one or neither has a startTime (or same startTime), swaps their relative order cleanly.
   */
  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleMoveItem(index, direction), isZh ? '調整景點順序' : 'Reorder spots')) {
      return;
    }
    const items = [...activeDay.items];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= items.length) return;

    const cur = { ...items[index] };
    const target = { ...items[targetIdx] };

    const curStart = parseTimeToMinutes(cur.startTime);
    const targetStart = parseTimeToMinutes(target.startTime);

    const calcDuration = (it: ItineraryItem, sM: number): number | null => {
      const eM = parseTimeToMinutes(it.endTime);
      if (sM === 99999 || eM === 99999) return null;
      if (isOvernightTimeRange(sM, eM)) return 24 * 60 - sM + eM;
      return eM >= sM ? eM - sM : null;
    };

    if (curStart !== 99999 && targetStart !== 99999 && curStart !== targetStart) {
      const curDur = calcDuration(cur, curStart);
      const targetDur = calcDuration(target, targetStart);

      cur.startTime = formatMinutesToHHMM(targetStart);
      if (curDur !== null) {
        cur.endTime = formatMinutesToHHMM((targetStart + curDur) % (24 * 60));
      }

      target.startTime = formatMinutesToHHMM(curStart);
      if (targetDur !== null) {
        target.endTime = formatMinutesToHHMM((curStart + targetDur) % (24 * 60));
      }
    }

    items[index] = target;
    items[targetIdx] = cur;

    const sorted = sortItineraryItemsByTime(items);
    const updatedDays = trip.days.map((day) => {
      if (day.dayNumber !== activeDay.dayNumber) return day;
      return { ...day, items: sorted };
    });
    triggerHaptic(8);
    onUpdateTrip({ ...trip, days: updatedDays, updatedAt: Date.now() });
  };

  /**
   * Drag-and-drop arbitrary reorder: moves item from `fromIndex` to `toIndex`,
   * reassigning existing startTime slots across the affected slice while preserving each item's own duration.
   */
  const handleReorderItem = (fromIndex: number, toIndex: number) => {
    if (!canEdit || fromIndex === toIndex) return;
    if (requireAuth && !requireAuth(() => handleReorderItem(fromIndex, toIndex), isZh ? '拖曳調整景點順序' : 'Reorder spots')) {
      return;
    }
    const items = [...activeDay.items];
    if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return;

    const minIdx = Math.min(fromIndex, toIndex);
    const maxIdx = Math.max(fromIndex, toIndex);
    const originalStarts = items.slice(minIdx, maxIdx + 1).map((it) => parseTimeToMinutes(it.startTime));
    const allHaveValidTimes = originalStarts.every((m) => m !== 99999);

    const calcDuration = (it: ItineraryItem): number | null => {
      const sM = parseTimeToMinutes(it.startTime);
      const eM = parseTimeToMinutes(it.endTime);
      if (sM === 99999 || eM === 99999) return null;
      if (isOvernightTimeRange(sM, eM)) return 24 * 60 - sM + eM;
      return eM >= sM ? eM - sM : null;
    };

    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);

    if (allHaveValidTimes) {
      for (let i = minIdx; i <= maxIdx; i++) {
        const slotStart = originalStarts[i - minIdx];
        const dur = calcDuration(items[i]);
        items[i] = {
          ...items[i],
          startTime: formatMinutesToHHMM(slotStart),
          endTime: dur !== null ? formatMinutesToHHMM((slotStart + dur) % (24 * 60)) : items[i].endTime,
        };
      }
    }

    const updatedDays = trip.days.map((day) =>
      day.dayNumber === activeDay.dayNumber ? { ...day, items } : day
    );
    triggerHaptic(12);
    onUpdateTrip({ ...trip, days: updatedDays, updatedAt: Date.now() });
  };

  // Keep a ref to the latest reorder handler so pointer listeners never act on a stale `trip` closure
  handleReorderRef.current = handleReorderItem;

  // Pointer drag-to-reorder listener lifecycle (works seamlessly on Desktop mouse + iOS Safari touch)
  const beginDragReorder = (fromIndex: number) => {
    if (!canEdit || activeDay.items.length < 2) return;
    dragCleanupRef.current?.();
    triggerHaptic(14);
    const initial = { fromIndex, overIndex: fromIndex };
    dragStateRef.current = initial;
    setDragState(initial);
    suppressClickRef.current = true;

    let autoScrollRaf: number | null = null;
    let lastPointerY = -1;

    const runAutoScroll = () => {
      autoScrollRaf = null;
      if (!dragStateRef.current || lastPointerY < 0) return;
      const edge = 88;
      let delta = 0;
      if (lastPointerY < edge) delta = -Math.ceil((edge - lastPointerY) / 8) - 2;
      else if (lastPointerY > window.innerHeight - edge) delta = Math.ceil((lastPointerY - (window.innerHeight - edge)) / 8) + 2;
      if (delta !== 0) {
        window.scrollBy(0, delta);
        autoScrollRaf = window.requestAnimationFrame(runAutoScroll);
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      const current = dragStateRef.current;
      if (!current) return;
      lastPointerY = ev.clientY;
      if (autoScrollRaf === null) autoScrollRaf = window.requestAnimationFrame(runAutoScroll);

      // Directional hit-testing: crossing ~35% into a neighbour card swaps position (Reminders-style)
      const cards = document.querySelectorAll<HTMLElement>('[data-timeline-spot-index]');
      let nextOver = current.fromIndex;
      cards.forEach((el) => {
        const idx = Number(el.dataset.timelineSpotIndex);
        if (!Number.isFinite(idx) || idx === current.fromIndex) return;
        const rect = el.getBoundingClientRect();
        if (idx > current.fromIndex && ev.clientY > rect.top + rect.height * 0.35) {
          nextOver = Math.max(nextOver, idx);
        } else if (idx < current.fromIndex && ev.clientY < rect.bottom - rect.height * 0.35) {
          nextOver = nextOver === current.fromIndex ? idx : Math.min(nextOver, idx);
        }
      });
      if (nextOver !== current.overIndex) {
        triggerHaptic(6);
        const updated = { ...current, overIndex: nextOver };
        dragStateRef.current = updated;
        setDragState(updated);
      }
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerCancel);
      if (autoScrollRaf !== null) window.cancelAnimationFrame(autoScrollRaf);
      autoScrollRaf = null;
      dragCleanupRef.current = null;
    };

    const finish = (commit: boolean) => {
      cleanup();
      const finalState = dragStateRef.current;
      dragStateRef.current = null;
      setDragState(null);
      // Swallow the synthetic click fired right after pointerup so dropping never opens the map
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 80);
      if (commit && finalState && finalState.fromIndex !== finalState.overIndex) {
        handleReorderRef.current(finalState.fromIndex, finalState.overIndex);
      }
    };

    const onPointerEnd = () => finish(true);
    const onPointerCancel = () => finish(false);

    dragCleanupRef.current = cleanup;
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerCancel);
  };

  const clearLongPress = () => {
    longPressOriginRef.current = null;
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Commercial Workflow: Duplicate spot
  const handleDuplicateItem = (source: ItineraryItem) => {
    if (!canEdit) return;
    const sM = parseTimeToMinutes(source.startTime);
    const eM = parseTimeToMinutes(source.endTime);
    const shiftedStart = sM !== 99999 ? Math.min(23 * 60 + 45, sM + 30) : 99999;
    const newStartTime = shiftedStart !== 99999 ? formatMinutesToHHMM(shiftedStart) : source.startTime;
    let dur: number | null = null;
    if (sM !== 99999 && eM !== 99999) {
      dur = isOvernightTimeRange(sM, eM) ? 24 * 60 - sM + eM : eM >= sM ? eM - sM : null;
    }
    const newEndTime =
      dur !== null && shiftedStart !== 99999
        ? formatMinutesToHHMM((shiftedStart + dur) % (24 * 60))
        : source.endTime;

    const copyItem: ItineraryItem = {
      ...source,
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `${source.title} (${isZh ? '複本' : 'Copy'})`,
      startTime: newStartTime,
      endTime: newEndTime,
      completed: false,
      memoryPhotos: undefined,
      memoryNotes: undefined,
    };

    const updatedDays = trip.days.map((d) =>
      d.dayNumber === activeDay.dayNumber
        ? { ...d, items: sortItineraryItemsByTime([...d.items, copyItem]) }
        : d
    );
    triggerHaptic(10);
    onUpdateTrip({ ...trip, days: updatedDays, updatedAt: Date.now() });
  };

  // Commercial Workflow: Move spot to another Day
  const handleMoveItemToDay = (item: ItineraryItem, targetDayNumber: number) => {
    if (!canEdit || targetDayNumber === activeDay.dayNumber) {
      setMoveDayItem(null);
      return;
    }
    const updatedDays = trip.days.map((d) => {
      if (d.dayNumber === activeDay.dayNumber) {
        return { ...d, items: d.items.filter((it) => it.id !== item.id) };
      }
      if (d.dayNumber === targetDayNumber) {
        return { ...d, items: sortItineraryItemsByTime([...d.items, item]) };
      }
      return d;
    });
    const updatedMemories = (trip.memories || []).map((m) =>
      m.spotId === item.id ? { ...m, dayNumber: targetDayNumber } : m
    );
    triggerHaptic(12);
    onUpdateTrip({
      ...trip,
      days: updatedDays,
      memories: updatedMemories,
      updatedAt: Date.now(),
    });
    setMoveDayItem(null);
    setSelectedDayNumber(targetDayNumber);
  };

  const handleAddDay = () => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(handleAddDay, isZh ? '增加行程天數' : 'Add day')) {
      return;
    }
    const newDayNum = trip.days.length + 1;
    const lastDay = trip.days[trip.days.length - 1];
    let nextDate = trip.endDate || trip.startDate;
    if (lastDay) {
      nextDate = addDaysLocal(lastDay.date, 1);
    }

    const newDay: DayPlan = {
      id: `day-${Date.now()}-${newDayNum}`,
      dayNumber: newDayNum,
      date: nextDate,
      theme: isZh ? `第 ${newDayNum} 天行程` : `Day ${newDayNum} Schedule`,
      items: [],
    };

    onUpdateTrip({
      ...trip,
      days: [...trip.days, newDay],
      endDate: nextDate,
      updatedAt: Date.now(),
    });
    setSelectedDayNumber(newDayNum);
  };

  // Commercial Workflow: Delete Day (renumbers days & dates cleanly + tracks tombstones)
  const executeDeleteDay = (dayToDelete: DayPlan) => {
    if (!canEdit || trip.days.length <= 1) {
      setConfirmDeleteDay(null);
      return;
    }
    const now = Date.now();
    const deletedItemIds: Record<string, number> = { ...(trip.deletedItemIds || {}) };
    const removedSpotIds = new Set(dayToDelete.items.map((i) => i.id));
    removedSpotIds.forEach((id) => {
      deletedItemIds[id] = now;
    });
    (trip.memories || []).forEach((m) => {
      if (m.spotId && removedSpotIds.has(m.spotId)) {
        deletedItemIds[m.id] = now;
      }
    });

    const baseStart = normalizeDateKey(trip.startDate) || normalizeDateKey(trip.days[0]?.date);
    const remainingDays = trip.days
      .filter((d) => d.id !== dayToDelete.id)
      .map((d, idx) => ({
        ...d,
        dayNumber: idx + 1,
        date: baseStart ? addDaysLocal(baseStart, idx) : d.date,
      }));

    const deletedDayNum = dayToDelete.dayNumber;
    const updatedMemories = (trip.memories || [])
      .filter((m) => !(m.spotId && removedSpotIds.has(m.spotId)))
      .map((m) => {
        if (!m.dayNumber) return m;
        if (m.dayNumber === deletedDayNum) return { ...m, dayNumber: undefined };
        if (m.dayNumber > deletedDayNum) return { ...m, dayNumber: m.dayNumber - 1 };
        return m;
      });

    const newEndDate = remainingDays[remainingDays.length - 1]?.date || trip.endDate;

    // Keep expenses / bookings / memories attached to the same physical day after renumbering
    const dateRemap = new Map<string, string>();
    const dayNumRemap = new Map<number, number>();
    trip.days
      .filter((d) => d.id !== dayToDelete.id)
      .forEach((d, idx) => {
        const oldKey = normalizeDateKey(d.date);
        const newKey = normalizeDateKey(remainingDays[idx].date);
        if (oldKey && newKey && oldKey !== newKey) dateRemap.set(oldKey, newKey);
        dayNumRemap.set(d.dayNumber, idx + 1);
      });
    const deletedDateKey = normalizeDateKey(dayToDelete.date);
    const remapDate = (value?: string) => {
      if (!value) return value;
      const key = normalizeDateKey(value);
      if (key && key === deletedDateKey) return value;
      return (key && dateRemap.get(key)) || value;
    };
    const remapDayNum = (n?: number) => {
      if (!n) return n;
      if (n === deletedDayNum) return undefined;
      return dayNumRemap.get(n) ?? n;
    };

    const updatedExpenses = (trip.expenses || []).map((e) => {
      const nextDate = remapDate(e.date) || e.date;
      const nextDayNum = remapDayNum(e.dayNumber);
      if (nextDate === e.date && nextDayNum === e.dayNumber) return e;
      const copy = { ...e, date: nextDate };
      if (nextDayNum === undefined) delete copy.dayNumber;
      else copy.dayNumber = nextDayNum;
      return copy;
    });

    const updatedBookings = (trip.bookings || []).map((b) => {
      const nextStart = remapDate(b.startDate);
      const nextEnd = remapDate(b.endDate);
      const nextDayNum = remapDayNum(b.dayNumber);
      if (nextStart === b.startDate && nextEnd === b.endDate && nextDayNum === b.dayNumber) return b;
      const copy = { ...b };
      if (nextStart !== undefined) copy.startDate = nextStart;
      if (nextEnd !== undefined) copy.endDate = nextEnd;
      if (nextDayNum === undefined) delete copy.dayNumber;
      else copy.dayNumber = nextDayNum;
      return copy;
    });

    const updatedTrip: Trip = {
      ...trip,
      days: remainingDays,
      memories: updatedMemories,
      expenses: trip.expenses ? updatedExpenses : trip.expenses,
      bookings: trip.bookings ? updatedBookings : trip.bookings,
      endDate: newEndDate,
      deletedItemIds,
      updatedAt: now,
    };
    onUpdateTrip(updatedTrip);
    setConfirmDeleteDay(null);
    setSelectedDayNumber(Math.min(deletedDayNum, remainingDays.length));
    garbageCollectOrphanedMedia(
      getStoredTrips().map((stored) => (stored.id === updatedTrip.id ? updatedTrip : stored))
    ).catch(() => {});
  };

  // Inline Day Theme & Notes save
  const handleStartEditDayHeader = () => {
    if (!canEdit) return;
    setDayThemeDraft(activeDay.theme || '');
    setDayNotesDraft(activeDay.notes || '');
    setIsEditingDayHeader(true);
  };

  const handleSaveDayHeader = () => {
    if (!canEdit) return;
    const updatedDays = trip.days.map((d) =>
      d.dayNumber === activeDay.dayNumber
        ? {
            ...d,
            theme: dayThemeDraft.trim() || undefined,
            notes: dayNotesDraft.trim() || undefined,
          }
        : d
    );
    onUpdateTrip({ ...trip, days: updatedDays, updatedAt: Date.now() });
    setIsEditingDayHeader(false);
  };

  const isPureMemoryArchive =
    trip.tripMode === 'memory' &&
    (trip.days || []).every((d) => (d.items || []).length === 0);

  if (isPureMemoryArchive) {
    const memoriesCount = (trip.memories || []).length;
    const gpsPinCount = (trip.memories || []).filter((m) => isValidCoordinate(m.lat, m.lng)).length;
    const hasCityCoord = isValidCoordinate(trip.destinationLat, trip.destinationLng);

    return (
      <div className="py-6 sm:py-10 px-2">
        <div className="max-w-lg mx-auto rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-6 sm:p-8 shadow-2xs space-y-6">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Camera className="w-6 h-6" />
            </div>
            <div className="min-w-0 space-y-1">
              <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg">
                {isZh ? '回憶相簿模式' : 'Photo Memory Archive'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {isZh
                  ? '這趟過往旅程以保存相片與足跡為主，已為您省略繁瑣的逐日空白行程表。'
                  : 'This past trip focuses on photos and map footprints without an empty day-by-day schedule.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 p-3.5 rounded-2xl bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC]/80 dark:border-slate-800 text-center">
            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">收錄相片</div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                {memoriesCount}
              </div>
            </div>
            <div className="border-x border-[#E5E2DC] dark:border-slate-800 px-1">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">地圖座標</div>
              <div className="text-base font-bold font-mono tabular-nums text-teal-700 dark:text-teal-400 mt-0.5">
                {gpsPinCount > 0 ? `${gpsPinCount} 點` : hasCityCoord ? '已定位' : '未設定'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">回憶年份</div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                {trip.startDate ? trip.startDate.slice(0, 4) : '—'}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {onOpenMemories && (
              <button
                type="button"
                onClick={() => onOpenMemories()}
                className="flex-1 min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>{isZh ? '開啟回憶相簿' : 'Open Photo Gallery'}</span>
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  onUpdateTrip({
                    ...trip,
                    tripMode: 'planner',
                    updatedAt: Date.now(),
                  });
                }}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-teal-600 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Calendar className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <span>{isZh ? '切換為完整行程規劃' : 'Switch to Full Planner'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const activeDayWeather = dayWeatherMap[activeDay.dayNumber];

  return (
    <div className="space-y-2.5">
      {/* 1. Ultra-Clean Sticky Horizontal Day Pill Strip (Commercial Above-the-Fold Design) */}
      <div
        className={`sticky ${
          isNavHidden
            ? 'max-sm:top-[env(safe-area-inset-top,0px)] sm:top-14'
            : 'top-[calc(3.5rem+env(safe-area-inset-top,0px))] sm:top-14'
        } z-20 group/filter bg-white/95 dark:bg-[#111827]/95 backdrop-blur-md rounded-2xl border border-[#E5E2DC] dark:border-slate-800 transition-all duration-200 ${
          isCompact ? 'py-1 px-1.5 shadow-md' : 'p-1.5 shadow-2xs'
        }`}
        style={{ overflowAnchor: 'none' }}
      >
        <div className="relative flex items-center">
          {/* Desktop-only hover scroll arrows (never obstruct mobile pills!) */}
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => handleScrollDays('left')}
              className="hidden sm:flex absolute left-0.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/95 dark:bg-slate-800/95 shadow-md border border-[#E5E2DC] dark:border-slate-700 items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer opacity-0 group-hover/filter:opacity-100"
              aria-label="往左捲動天數"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}

          <div
            ref={scrollContainerRef}
            data-no-day-swipe="true"
            className="flex items-center gap-1.5 overflow-x-auto scrollbar-none snap-x snap-mandatory px-0.5 py-0.5 w-full"
          >
            {/* Overview pill */}
            <button
              type="button"
              id="day-filter-chip-overview"
              onClick={() => {
                triggerHaptic(8);
                setTimelineViewMode('overview');
                scrollToCenterChip('day-filter-chip-overview');
              }}
              className={`rounded-xl shrink-0 snap-center cursor-pointer select-none transition-all duration-150 ${
                isCompact
                  ? 'px-2.5 h-8 flex items-center gap-1 text-[11px] font-bold'
                  : 'px-3 h-[46px] flex flex-col justify-center items-start min-w-[66px]'
              } ${
                timelineViewMode === 'overview'
                  ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-2xs'
                  : 'bg-[#FAF9F6] dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-[#E5E2DC] dark:border-slate-700/80'
              }`}
            >
              {isCompact ? (
                <>
                  <Calendar className="w-3 h-3 shrink-0" />
                  <span>{isZh ? '總覽' : 'All'}</span>
                </>
              ) : (
                <>
                  <span className="text-[11px] font-bold flex items-center gap-1 leading-tight">
                    <Calendar className="w-3 h-3" />
                    <span>{isZh ? '總覽' : 'All'}</span>
                  </span>
                  <span className="text-[10px] opacity-75 font-mono tabular-nums mt-0.5 leading-tight">
                    {trip.days.length} 天
                  </span>
                </>
              )}
            </button>

            {/* Individual Day Chips */}
            {trip.days.map((day) => {
              const isCurrent = timelineViewMode === 'daily' && day.dayNumber === selectedDayNumber;
              const totalCount = day.items.length;
              const dateStr = formatMonthDaySlash(day.date);
              const isToday = isDateToday(day.date, destTzInfo.tz);
              const chipWeather = dayWeatherMap[day.dayNumber];
              const chipForecast = chipWeather?.status === 'ok' ? chipWeather.forecast : undefined;
              const chipWeatherIcon = chipForecast ? getWeatherDescription(chipForecast.weatherCode, lang).icon : null;

              return (
                <button
                  key={day.id}
                  id={`day-filter-chip-${day.dayNumber}`}
                  type="button"
                  onClick={() => {
                    triggerHaptic(8);
                    handleSelectDay(day.dayNumber);
                    setTimelineViewMode('daily');
                    scrollToCenterChip(`day-filter-chip-${day.dayNumber}`);
                  }}
                  className={`rounded-xl text-left shrink-0 snap-center cursor-pointer select-none transition-all duration-150 ${
                    isCompact
                      ? 'px-2.5 h-8 flex items-center gap-1.5'
                      : 'min-w-[90px] px-2.5 h-[46px] flex flex-col justify-center'
                  } ${
                    isCurrent
                      ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-2xs'
                      : isToday
                        ? 'bg-teal-50/80 dark:bg-teal-950/35 text-slate-900 dark:text-slate-100 border border-teal-500/70 dark:border-teal-500/60'
                        : 'bg-[#FAF9F6] dark:bg-slate-800/60 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 text-slate-700 dark:text-slate-300 border border-[#E5E2DC] dark:border-slate-700/80'
                  }`}
                >
                  {isCompact ? (
                    <>
                      <span className={`text-xs font-black font-mono tabular-nums ${isCurrent ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                        D{day.dayNumber}
                      </span>
                      <span className={`text-[10px] font-mono tabular-nums ${isCurrent ? 'text-teal-100' : 'text-slate-500 dark:text-slate-400'}`}>
                        {dateStr}
                      </span>
                      {isToday && (
                        <span className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-teal-200' : 'bg-teal-600 dark:bg-teal-400'}`} />
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-1.5 leading-tight">
                        <span className={`text-xs font-black font-mono tabular-nums ${isCurrent ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                          D{day.dayNumber}
                        </span>
                        <span className={`text-[10px] font-mono tabular-nums ${isCurrent ? 'text-teal-100' : 'text-slate-400 dark:text-slate-500'}`}>
                          {totalCount > 0 ? `${totalCount}站` : '空'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5 text-[10px] font-mono tabular-nums leading-tight opacity-90">
                        <span>{dateStr}</span>
                        {chipForecast ? (
                          <span className={`shrink-0 ${isCurrent ? 'text-teal-100' : 'text-slate-500 dark:text-slate-400'}`}>
                            {chipWeatherIcon}{chipForecast.maxTemp}°
                          </span>
                        ) : isToday ? (
                          <span className={`font-bold text-[9px] ${isCurrent ? 'text-teal-200' : 'text-teal-700 dark:text-teal-400'}`}>
                            今
                          </span>
                        ) : null}
                      </div>
                    </>
                  )}
                </button>
              );
            })}

            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(8);
                  handleAddDay();
                }}
                className={`rounded-xl border border-dashed border-teal-600/50 hover:border-teal-600 text-teal-700 dark:text-teal-400 hover:bg-teal-50/70 dark:hover:bg-teal-950/30 text-xs font-semibold flex items-center justify-center gap-1 shrink-0 snap-center transition cursor-pointer ${
                  isCompact ? 'h-8 px-2.5' : 'h-[46px] px-3'
                }`}
                title={isZh ? '增加一天' : 'Add Day'}
                aria-label="增加一天"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="text-[11px] whitespace-nowrap">{isZh ? '加天' : '+Day'}</span>
              </button>
            )}
          </div>

          {canScrollRight && (
            <button
              type="button"
              onClick={() => handleScrollDays('right')}
              className="hidden sm:flex absolute right-0.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/95 dark:bg-slate-800/95 shadow-md border border-[#E5E2DC] dark:border-slate-700 items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer opacity-0 group-hover/filter:opacity-100"
              aria-label="往右捲動天數"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Single Compact Utility Row: Search + Today Jump + Map Toggle */}
      <div className="relative flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-2 px-3 min-h-[40px] rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 shadow-2xs focus-within:ring-2 focus-within:ring-teal-500/35 focus-within:border-teal-600 transition">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            value={spotSearchQuery}
            onChange={(e) => setSpotSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setSpotSearchQuery('');
                (e.target as HTMLInputElement).blur();
              } else if (e.key === 'Enter' && matchingSpots.length > 0) {
                handleJumpToSpot(matchingSpots[0].dayNumber, matchingSpots[0].item.id);
                (e.target as HTMLInputElement).blur();
              }
            }}
            enterKeyHint="search"
            placeholder={isZh ? '搜尋全程景點或備註...' : 'Search spots or notes...'}
            className="w-full bg-transparent text-[15px] sm:text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden"
          />
          {spotSearchQuery && (
            <button
              type="button"
              onClick={() => setSpotSearchQuery('')}
              className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition shrink-0 cursor-pointer"
              aria-label="清除搜尋"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {todayDay && (timelineViewMode !== 'daily' || selectedDayNumber !== todayDay.dayNumber) && (
          <button
            type="button"
            onClick={handleJumpToToday}
            className="min-h-[40px] px-3 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-300/70 dark:border-teal-700/60 text-teal-800 dark:text-teal-300 text-xs font-bold shrink-0 cursor-pointer transition active:scale-95"
          >
            {isZh ? '今日' : 'Today'}
          </button>
        )}

        {timelineViewMode === 'daily' && trip.days.length > 0 && (
          <button
            type="button"
            onClick={() => setIsMapExpanded((prev) => !prev)}
            className={`min-h-[40px] flex items-center gap-1.5 px-3 rounded-xl border text-xs font-bold shrink-0 transition cursor-pointer ${
              isMapExpanded
                ? 'bg-teal-700 dark:bg-teal-600 text-white border-teal-700 dark:border-teal-600'
                : 'border-[#E5E2DC] dark:border-slate-800 bg-white dark:bg-[#111827] hover:bg-[#FAF9F6] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
            }`}
          >
            <MapIcon className={`w-3.5 h-3.5 ${isMapExpanded ? 'text-white' : 'text-teal-700 dark:text-teal-400'}`} />
            <span>{isMapExpanded ? (isZh ? '收合' : 'Hide') : (isZh ? '地圖' : 'Map')}</span>
            {activeDayGeoCount > 0 && !isMapExpanded && (
              <span className="font-mono text-[10px] opacity-75">({activeDayGeoCount})</span>
            )}
            {isMapExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Instant Search Results Dropdown */}
        {spotSearchQuery.trim() && (
          <div className="absolute top-full left-0 right-0 mt-1.5 z-30 max-h-80 overflow-y-auto rounded-2xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 shadow-xl p-2 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="px-2.5 py-1 text-[11px] font-bold text-slate-400 flex items-center justify-between border-b border-[#E5E2DC] dark:border-slate-800 pb-1.5">
              <span className="font-mono tabular-nums">搜尋結果 ({matchingSpots.length})</span>
            </div>

            {matchingSpots.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                找不到符合「{spotSearchQuery}」的景點或活動
              </div>
            ) : (
              matchingSpots.map(({ dayNumber, item }) => {
                const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP.other;
                const CatIcon = cat.icon;
                return (
                  <button
                    key={`${dayNumber}-${item.id}`}
                    type="button"
                    onClick={() => handleJumpToSpot(dayNumber, item.id)}
                    className="w-full text-left p-2.5 rounded-xl hover:bg-teal-50/80 dark:hover:bg-teal-950/40 flex items-center justify-between gap-3 transition group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#FAF9F6] dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-300">
                        <CatIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {item.title}
                          </span>
                          <span className="text-[10px] font-mono tabular-nums font-medium text-slate-500 dark:text-slate-400">
                            Day {dayNumber} · {item.startTime || '未定時間'}
                          </span>
                        </div>
                        {(item.locationName || item.address) && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {item.locationName || item.address}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-teal-700 dark:text-teal-400 shrink-0">
                      跳轉 →
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* 3. Main View Body */}
      {trip.days.length === 0 ? (
        <div className="py-14 px-6 text-center rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 shadow-2xs max-w-md mx-auto my-6 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center mx-auto">
            <Calendar className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              {isZh ? '尚未規劃任何天數' : 'No itinerary days yet'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {isZh
                ? '目前這趟旅程還沒有任何天數，立即建立第 1 天開始安排精彩景點！'
                : 'This trip has no days planned yet. Create Day 1 to start adding spots!'}
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={handleAddDay}
              className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-sm active:scale-95 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isZh ? '建立第 1 天行程' : 'Create Day 1'}</span>
            </button>
          )}
        </div>
      ) : timelineViewMode === 'overview' ? (
        <Suspense fallback={<LazyPanelFallback height={320} />}>
          <ItineraryOverviewTable
            trip={trip}
            selectedDayNumber={selectedDayNumber}
            onSelectDay={(dayNum) => {
              handleSelectDay(dayNum);
              setTimelineViewMode('daily');
            }}
            lang={lang}
            defaultExpanded={true}
          />
        </Suspense>
      ) : (
        <>
          {/* Interactive Map (Auto-expanded on Pick Mode or Locate click) */}
          {isMapExpanded && (
            <div id="timeline-day-map" className="scroll-mt-24">
              <Suspense fallback={<LazyPanelFallback height={300} />}>
                <LeafletMap
                  items={activeDay.items}
                  selectedItemId={selectedItemId}
                  onSelectItem={(it) => setSelectedItemId(it.id)}
                  isPickMode={isPickMode}
                  onPickLocation={onPickLocation}
                  onCancelPickMode={onCancelMapPick}
                  pickedLocation={pickedCoords}
                />
              </Suspense>
            </div>
          )}

          {/* Swipeable Daily Schedule Body */}
          <div
            className="space-y-3 touch-pan-y"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div
              key={activeDay.dayNumber}
              className={`space-y-3 animate-in fade-in duration-150 ${
                slideDirection === 'left'
                  ? 'slide-in-from-right-4'
                  : slideDirection === 'right'
                    ? 'slide-in-from-left-4'
                    : ''
              }`}
            >
              {/* Streamlined Day Header Card with Integrated Weather + Inline Day Edit/Delete */}
              <div
                id="day-schedule-section"
                className="bg-white dark:bg-[#111827] rounded-2xl p-3.5 sm:p-4 border border-[#E5E2DC] dark:border-slate-800 shadow-2xs scroll-mt-24"
              >
                {isEditingDayHeader ? (
                  <div className="space-y-2.5 text-xs animate-in fade-in duration-100">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-teal-700 dark:text-teal-400">
                        編輯 Day {activeDay.dayNumber} 主題與備註
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsEditingDayHeader(false)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-2 py-1 cursor-pointer"
                      >
                        取消
                      </button>
                    </div>
                    <input
                      type="text"
                      value={dayThemeDraft}
                      onChange={(e) => setDayThemeDraft(e.target.value)}
                      placeholder="今日主題（例如：金澤兼六園・東茶屋街漫步）"
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-[15px] sm:text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-teal-600"
                    />
                    <textarea
                      rows={2}
                      value={dayNotesDraft}
                      onChange={(e) => setDayNotesDraft(e.target.value)}
                      placeholder="當日提醒事項或住宿／票券備註..."
                      className="w-full px-3 py-2 rounded-xl bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-[15px] sm:text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-teal-600 resize-none"
                    />
                    <div className="flex items-center justify-between gap-2">
                      {trip.days.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingDayHeader(false);
                            setConfirmDeleteDay(activeDay);
                          }}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>刪除此天</span>
                        </button>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        onClick={handleSaveDayHeader}
                        className="min-h-[38px] px-4 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>儲存</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Meta row: Day N · MM/DD (週X) · Compact Inline Weather */}
                      <div className="flex items-center gap-1.5 flex-wrap text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-extrabold font-mono tabular-nums text-teal-700 dark:text-teal-400">
                          Day {activeDay.dayNumber}
                        </span>
                        <span>·</span>
                        <span className="font-mono tabular-nums">
                          {formatMonthDaySlash(activeDay.date)} ({getDayOfWeek(activeDay.date, lang)})
                        </span>

                        {activeDayWeather?.status === 'ok' && activeDayWeather.forecast && (
                          <>
                            <span>·</span>
                            <span
                              className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-700 dark:text-slate-200 font-semibold"
                              title={`${activeDayWeather.forecast.locationName} (${activeDayWeather.forecast.source === 'archive' ? '歷史氣候' : 'Open-Meteo'})`}
                            >
                              <span>{getWeatherDescription(activeDayWeather.forecast.weatherCode, lang).icon}</span>
                              <span>
                                {activeDayWeather.forecast.minTemp}°~{activeDayWeather.forecast.maxTemp}°
                              </span>
                              {activeDayWeather.forecast.rainProbability > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-teal-700 dark:text-teal-400 text-[11px]">
                                  <Umbrella className="w-3 h-3" />
                                  {activeDayWeather.forecast.rainProbability}%
                                </span>
                              )}
                            </span>
                          </>
                        )}

                        {activeDayWeather?.status === 'too_far_future' && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                              <CloudSun className="w-3 h-3" />
                              <span>{activeDayWeather.daysUntilForecast}天後開放預報</span>
                            </span>
                          </>
                        )}

                        {isWeatherLoading && !activeDayWeather && (
                          <span className="text-[10px] text-slate-400">· 氣象更新中</span>
                        )}
                      </div>

                      {/* Day Theme + Subtle Edit Trigger */}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <h3 className="font-bold text-slate-900 dark:text-white text-[15px] sm:text-base leading-snug truncate">
                          {activeDay.theme || t.day.replace('{n}', String(activeDay.dayNumber))}
                        </h3>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={handleStartEditDayHeader}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-teal-700 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 transition cursor-pointer"
                            title="編輯當日主題、備註或刪除天數"
                            aria-label="編輯當日主題"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {activeDay.notes && (
                        <p className="text-slate-600 dark:text-slate-400 text-xs mt-1 leading-relaxed">
                          {activeDay.notes}
                        </p>
                      )}
                    </div>

                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onOpenAddItem(activeDay.dayNumber, getSuggestedNextStartTime(activeDay.items))}
                        className="min-h-[40px] px-3.5 py-2 bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition active:scale-95 shrink-0 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>{t.addSpot}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Day Memories Compact Banner (if any exist) */}
              {(() => {
                const dayMems = (trip.memories || []).filter((m) => m.dayNumber === activeDay.dayNumber);
                if (dayMems.length === 0) return null;
                return (
                  <button
                    type="button"
                    onClick={() => onOpenMemories?.()}
                    className="w-full rounded-xl px-3.5 py-2.5 bg-[#FAF9F6] dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 flex items-center justify-between cursor-pointer hover:border-teal-600/50 transition group"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <Camera className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                      <span className="font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                        Day {activeDay.dayNumber} 相片回憶 ({dayMems.length})
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">相簿 →</span>
                  </button>
                );
              })()}

              {/* Subtle, Dismissible Schedule Time Overlap Strip */}
              {(() => {
                const report = dayConflictReports[activeDay.dayNumber];
                if (!report || report.conflicts.length === 0) return null;
                const key = getConflictKey(activeDay.dayNumber, report);
                if (dismissedConflictKeys[key]) return null;
                return (
                  <div className="rounded-xl px-3.5 py-2.5 bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/80 dark:border-amber-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-start sm:items-center gap-2 min-w-0">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                      <p className="text-amber-950 dark:text-amber-200 font-medium truncate">
                        {report.conflicts.length === 1
                          ? report.conflicts[0].message
                          : isZh
                            ? `有 ${report.conflicts.length} 組時段重疊（如：${report.conflicts[0].message}）`
                            : `${report.conflicts.length} overlapping times (e.g. ${report.conflicts[0].message})`}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                      {canEdit && report.hasFixableOverlap && (
                        <button
                          type="button"
                          onClick={() => handleAutoResolveDayConflicts(activeDay.dayNumber)}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 hover:bg-teal-50 text-teal-700 dark:text-teal-300 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                        >
                          <Wand2 className="w-3 h-3" />
                          <span>{isZh ? '自動順延' : 'Auto-Shift'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDismissDayConflict(activeDay.dayNumber, report)}
                        className="min-h-[32px] px-2 py-1 rounded-lg text-amber-700/70 dark:text-amber-300/70 hover:text-amber-900 dark:hover:text-amber-100 text-[11px] flex items-center gap-1 transition cursor-pointer"
                        aria-label="忽略此提醒"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Timeline Items List */}
              {activeDay.items.length === 0 ? (
                <div className="p-8 rounded-2xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 text-center">
                  <p className="text-slate-500 dark:text-slate-400 text-xs">
                    {isZh ? '這一天尚無行程安排' : 'No schedule yet.'}
                  </p>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onOpenAddItem(activeDay.dayNumber, '09:00')}
                      className="mt-3 min-h-[44px] px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t.addSpot}</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {activeDay.items.map((item, index) => {
                    const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP.other;
                    const catLabel = (t as any)[cat.labelKey] || cat.fallbackLabel;
                    const isSelected = item.id === selectedItemId;
                    const pinColor = CATEGORY_COLORS[item.category] || '#0d9488';

                    const nextItem = activeDay.items[index + 1];
                    let distanceInfo: { distStr: string; walkingMin: number; transitMin: number } | null = null;
                    if (
                      isValidCoordinate(item.lat, item.lng) &&
                      nextItem &&
                      isValidCoordinate(nextItem.lat, nextItem.lng)
                    ) {
                      const km = calculateDistanceKm(
                        { lat: item.lat!, lng: item.lng! },
                        { lat: nextItem.lat!, lng: nextItem.lng! }
                      );
                      const times = estimateTravelTime(km);
                      distanceInfo = {
                        distStr: formatDistance(km, lang),
                        walkingMin: times.walkingMin,
                        transitMin: times.transitMin,
                      };
                    }

                    const isDraggingThis = dragState?.fromIndex === index;
                    const isDropTarget =
                      dragState !== null &&
                      dragState.fromIndex !== index &&
                      dragState.overIndex === index;
                    const routeUrl = nextItem ? getGoogleMapsRouteUrl(item, nextItem) : null;

                    return (
                      <div
                        key={item.id}
                        data-timeline-spot-index={index}
                        className="space-y-2 relative"
                      >
                        {isDropTarget && dragState.fromIndex > index && (
                          <div className="h-1 rounded-full bg-teal-600 dark:bg-teal-400 mx-2 animate-pulse" />
                        )}
                        {/* Spot Card */}
                        <div
                          id={`spot-card-${item.id}`}
                          onClick={() => {
                            if (!dragState && !suppressClickRef.current) setSelectedItemId(item.id);
                          }}
                          className={`rounded-2xl p-3.5 sm:p-4 transition shadow-2xs border cursor-pointer ${
                            isDraggingThis
                              ? 'border-teal-600 ring-2 ring-teal-500/40 shadow-lg scale-[1.01] opacity-90 bg-teal-50/40 dark:bg-teal-950/30 select-none'
                              : isSelected
                              ? 'border-teal-600 ring-2 ring-teal-500/20 shadow-md bg-white dark:bg-[#111827]'
                              : item.completed
                                ? 'border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-900/50'
                                : 'border-[#E5E2DC] dark:border-slate-800 bg-white dark:bg-[#111827] hover:border-teal-600/50 dark:hover:border-teal-500/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2.5">
                            {/* Left Info with Drag Handle & Map Pin Twin Badge */}
                            <div className="flex items-start gap-2.5 sm:gap-3 flex-1 min-w-0">
                              {canEdit && activeDay.items.length > 1 && (
                                <button
                                  type="button"
                                  data-no-day-swipe="true"
                                  onClick={(e) => e.stopPropagation()}
                                  onPointerDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    beginDragReorder(index);
                                  }}
                                  className="touch-none self-center -ml-1.5 w-7 h-10 rounded-lg flex items-center justify-center text-slate-300 hover:text-teal-600 dark:text-slate-600 dark:hover:text-teal-400 active:text-teal-700 cursor-grab active:cursor-grabbing shrink-0 transition"
                                  title={isZh ? '按住拖曳調整景點順序' : 'Drag to reorder spot'}
                                  aria-label={isZh ? '按住拖曳調整景點順序' : 'Drag to reorder'}
                                >
                                  <GripVertical className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                data-no-day-swipe="true"
                                onPointerDown={(e) => {
                                  if (!canEdit || activeDay.items.length < 2) return;
                                  clearLongPress();
                                  const targetEl = e.currentTarget;
                                  longPressOriginRef.current = { x: e.clientX, y: e.clientY };
                                  longPressTimerRef.current = window.setTimeout(() => {
                                    longPressTimerRef.current = null;
                                    longPressOriginRef.current = null;
                                    targetEl.blur();
                                    beginDragReorder(index);
                                  }, 380);
                                }}
                                onPointerMove={(e) => {
                                  const origin = longPressOriginRef.current;
                                  if (!origin || longPressTimerRef.current === null) return;
                                  // User is scrolling, not long-pressing — cancel the pending drag
                                  if (Math.abs(e.clientX - origin.x) > 8 || Math.abs(e.clientY - origin.y) > 8) {
                                    clearLongPress();
                                  }
                                }}
                                onPointerUp={clearLongPress}
                                onPointerLeave={clearLongPress}
                                onPointerCancel={clearLongPress}
                                onContextMenu={(e) => {
                                  if (canEdit) e.preventDefault();
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (dragState || suppressClickRef.current) return;
                                  setSelectedItemId(item.id);
                                  setIsMapExpanded(true);
                                  setTimeout(() => {
                                    document.getElementById('timeline-day-map')?.scrollIntoView({
                                      behavior: 'smooth',
                                      block: 'center',
                                    });
                                  }, 80);
                                }}
                                title={isZh ? `點擊定位第 ${index + 1} 站（長按可拖曳排序）` : `Locate stop #${index + 1} (long-press to reorder)`}
                                className="relative shrink-0 flex flex-col items-center group/pin transition-transform active:scale-95 cursor-pointer mt-0.5 select-none"
                              >
                                <div
                                  style={{ backgroundColor: pinColor }}
                                  className={`w-8 h-8 rounded-full text-white flex items-center justify-center font-black text-xs shadow-sm border-2 border-white dark:border-slate-800 transition-all ${
                                    isSelected
                                      ? 'ring-4 ring-teal-400 scale-110'
                                      : 'group-hover/pin:scale-105'
                                  }`}
                                >
                                  <span>{index + 1}</span>
                                </div>
                                <div
                                  style={{ borderTopColor: pinColor }}
                                  className="w-0 h-0 border-l-[3.5px] border-l-transparent border-r-[3.5px] border-r-transparent border-t-[4.5px] -mt-0.5"
                                />
                              </button>

                              <div className="space-y-1 flex-1 min-w-0">
                                {/* Metadata Line */}
                                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium flex-wrap">
                                  {item.startTime && (
                                    <>
                                      <span className="flex items-center gap-1 font-mono tabular-nums text-teal-700 dark:text-teal-400 font-bold">
                                        <Clock className="w-3 h-3" />
                                        {item.startTime}
                                        {item.endTime ? ` - ${item.endTime}` : ''}
                                      </span>
                                      <span aria-hidden="true">·</span>
                                    </>
                                  )}
                                  <span className={`flex items-center gap-1 font-semibold ${cat.text}`}>
                                    <cat.icon className="w-3 h-3 shrink-0" />
                                    <span>{catLabel}</span>
                                  </span>
                                  {item.bookingCode && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 font-semibold">
                                        #{item.bookingCode}
                                      </span>
                                    </>
                                  )}
                                  {(() => {
                                    const report = dayConflictReports[activeDay.dayNumber];
                                    const key = getConflictKey(activeDay.dayNumber, report);
                                    if (!report || dismissedConflictKeys[key] || !report.conflictedItemIds.includes(item.id)) return null;
                                    return (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                                          <AlertTriangle className="w-3 h-3 shrink-0" />
                                          <span>{isZh ? '時段重疊' : 'Overlap'}</span>
                                        </span>
                                      </>
                                    );
                                  })()}
                                </div>

                                <h4
                                  className={`text-[15px] sm:text-base font-bold tracking-tight leading-snug ${
                                    item.completed
                                      ? 'line-through text-slate-400 dark:text-slate-500'
                                      : 'text-slate-900 dark:text-white'
                                  }`}
                                >
                                  {item.title}
                                </h4>

                                {(item.locationName || item.address) && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span className="truncate">{item.locationName || item.address}</span>
                                  </p>
                                )}

                                {(item.transportNote || item.notes) && (
                                  <div className="mt-1.5 pt-1.5 border-t border-[#E5E2DC]/70 dark:border-slate-800 space-y-1">
                                    {item.transportNote && (
                                      <p className="text-xs text-teal-800 dark:text-teal-300 flex items-start gap-1.5 leading-relaxed">
                                        <Bus className="w-3.5 h-3.5 shrink-0 mt-0.5 text-teal-700 dark:text-teal-400" />
                                        <span>{item.transportNote}</span>
                                      </p>
                                    )}
                                    {item.notes && (() => {
                                      const isLong = item.notes.length > 120 || item.notes.split('\n').length > 4;
                                      const isNotesOpen = Boolean(expandedNoteIds[item.id]);
                                      return (
                                        <div>
                                          <p
                                            className={`text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap break-words ${
                                              isLong && !isNotesOpen ? 'line-clamp-3' : ''
                                            }`}
                                          >
                                            {item.notes}
                                          </p>
                                          {isLong && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setExpandedNoteIds((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
                                              }}
                                              className="mt-0.5 min-h-[28px] text-[11px] font-bold text-teal-700 dark:text-teal-400 cursor-pointer"
                                            >
                                              {isNotesOpen ? (isZh ? '收合' : 'Show less') : (isZh ? '展開全文' : 'Show more')}
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}

                                {/* Spot Memory Thumbnails */}
                                {((item.memoryPhotos && item.memoryPhotos.length > 0) || item.googlePhotosUrl) && (
                                  <div className="flex items-center gap-2 pt-1.5 flex-wrap" data-no-day-swipe="true">
                                    {item.memoryPhotos && item.memoryPhotos.length > 0 && (
                                      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 select-none">
                                        {item.memoryPhotos.map((photo, pIdx) => (
                                          <button
                                            key={pIdx}
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setOverlaySpotPhoto({ item, photoIndex: pIdx });
                                            }}
                                            className="relative cursor-pointer transition hover:scale-105 active:scale-95 shrink-0"
                                            title="點擊開啟高畫質大圖檢視"
                                          >
                                            <MediaImage
                                              tripId={trip.id}
                                              ownerId={trip.ownerId}
                                              collabId={trip.collabId}
                                              src={photo}
                                              alt="Spot memory"
                                              className="w-10 h-10 rounded-lg object-cover border border-[#E5E2DC] dark:border-slate-700 shadow-xs"
                                            />
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    {item.googlePhotosUrl && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOverlaySpotPhoto({ item, photoIndex: 0 });
                                        }}
                                        className="min-h-[34px] px-2 inline-flex items-center gap-1 text-teal-700 dark:text-teal-300 text-xs font-semibold hover:underline cursor-pointer"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        <span>相簿原圖</span>
                                      </button>
                                    )}
                                  </div>
                                )}

                                {typeof item.cost === 'number' && item.cost > 0 && (
                                  <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums pt-0.5">
                                    <DollarSign className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                                    <span>
                                      {trip.currency} {item.cost.toLocaleString()}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      · {item.costPaid ? (isZh ? '已付款' : 'Paid') : (isZh ? '現場付' : 'Unpaid')}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Right Control Actions — Clean iOS Touch Targets */}
                            {canEdit ? (
                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => handleToggleComplete(item.id, e)}
                                  className={`w-10 h-10 sm:w-9 sm:h-9 rounded-xl transition cursor-pointer flex items-center justify-center ${
                                    item.completed
                                      ? 'bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-400 border border-teal-300/70 dark:border-teal-800'
                                      : 'bg-[#FAF9F6] dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 border border-[#E5E2DC] dark:border-slate-700'
                                  }`}
                                  title={item.completed ? '已打勾（點擊取消）' : '點擊打勾'}
                                  aria-label={item.completed ? '已打勾' : '未打勾'}
                                >
                                  {item.completed ? (
                                    <CheckCircle2 className="w-4 h-4 text-teal-700 dark:text-teal-400 stroke-[2.4]" />
                                  ) : (
                                    <Circle className="w-4 h-4" />
                                  )}
                                </button>

                                {/* Desktop Quick Edit (reorder via drag handle or ⋯ menu) */}
                                <div className="hidden sm:flex items-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => onOpenEditItem(item, activeDay.dayNumber)}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                    title="編輯"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                {/* Universal iOS Action Sheet Trigger (Move / Duplicate / Move Day / Edit / Safe Delete) */}
                                <button
                                  type="button"
                                  onClick={() => setActionMenuItem({ item, index })}
                                  className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-[#E5E2DC] sm:border-transparent dark:border-slate-700 sm:dark:border-transparent transition cursor-pointer"
                                  title="更多操作（編輯、移動天數、複製、刪除）"
                                  aria-label="更多景點操作"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                              </div>
                            ) : item.completed ? (
                              <div className="shrink-0 p-2 rounded-xl bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800">
                                <CheckCircle2 className="w-4 h-4 stroke-[2.4]" />
                              </div>
                            ) : null}
                          </div>

                          {/* Card Footer Bar: Navigation, Memories, Locate */}
                          <div className="mt-3 pt-2.5 border-t border-[#E5E2DC]/80 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <a
                                href={getGoogleMapsNavigationUrl(item)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition active:scale-95"
                              >
                                <Navigation className="w-3.5 h-3.5" />
                                <span>{t.navGoogle}</span>
                              </a>

                              {onOpenMemories && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenMemories(item.id);
                                  }}
                                  className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#FAF9F6] dark:bg-slate-800 text-teal-700 dark:text-teal-400 font-semibold text-xs flex items-center gap-1 hover:bg-teal-50 dark:hover:bg-teal-950/50 transition border border-[#E5E2DC] dark:border-slate-700 cursor-pointer"
                                >
                                  <Camera className="w-3.5 h-3.5" />
                                  <span>
                                    {item.memoryPhotos && item.memoryPhotos.length > 0
                                      ? `${item.memoryPhotos.length} 張`
                                      : isZh ? '相片' : 'Photos'}
                                  </span>
                                </button>
                              )}
                            </div>

                            {isValidCoordinate(item.lat, item.lng) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedItemId(item.id);
                                  setIsMapExpanded(true);
                                  setTimeout(() => {
                                    document.getElementById('timeline-day-map')?.scrollIntoView({
                                      behavior: 'smooth',
                                      block: 'center',
                                    });
                                  }, 80);
                                }}
                                className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 hover:bg-[#FAF9F6] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                              >
                                <MapPin className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                                <span>{t.locateMap}</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {isDropTarget && dragState.fromIndex < index && (
                          <div className="h-1 rounded-full bg-teal-600 dark:bg-teal-400 mx-2 animate-pulse" />
                        )}

                        {/* Two-Point Route Connector (origin -> destination) & Inline Spot Insert */}
                        {index < activeDay.items.length - 1 && (
                          <div className="py-1 px-2 flex flex-wrap items-center justify-center gap-2 group/connector">
                            {routeUrl && (
                              <a
                                href={routeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title={isZh ? `開啟「${item.title} → ${nextItem.title}」Google Maps 路線規劃` : `Route from ${item.title} to ${nextItem.title}`}
                                className="min-h-[32px] inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white dark:bg-[#111827] hover:bg-teal-50 dark:hover:bg-teal-950/50 border border-[#E5E2DC] dark:border-slate-700 hover:border-teal-500/60 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-300 shadow-2xs transition"
                              >
                                <Footprints className="w-3 h-3 text-teal-700 dark:text-teal-400 shrink-0" />
                                {distanceInfo ? (
                                  <span className="font-mono tabular-nums">
                                    {distanceInfo.distStr} · {t.walkMin.replace('{m}', String(distanceInfo.walkingMin))} · {t.driveMin.replace('{m}', String(distanceInfo.transitMin))}
                                  </span>
                                ) : (
                                  <span>{isZh ? '前往下一站' : 'Next leg'}</span>
                                )}
                                <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">|</span>
                                <span className="font-bold text-teal-700 dark:text-teal-400 inline-flex items-center gap-0.5">
                                  <span>{isZh ? '路線規劃' : 'Route'}</span>
                                  <ArrowRight className="w-3 h-3" />
                                </span>
                              </a>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => onOpenAddItem(activeDay.dayNumber, getBetweenTime(item, nextItem))}
                                className="opacity-85 sm:opacity-0 sm:group-hover/connector:opacity-100 hover:opacity-100 transition-all duration-150 min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FAF9F6] hover:bg-teal-50 dark:bg-slate-800/80 dark:hover:bg-teal-950/60 text-[11px] font-semibold text-slate-500 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-300 border border-[#E5E2DC] dark:border-slate-700 cursor-pointer"
                              >
                                <Plus className="w-3 h-3 text-teal-700 dark:text-teal-400" />
                                <span>{isZh ? '插入' : 'Insert'}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {canEdit && (
                    <div className="pt-1 text-center">
                      <button
                        type="button"
                        onClick={() => onOpenAddItem(activeDay.dayNumber, getSuggestedNextStartTime(activeDay.items))}
                        className="w-full min-h-[44px] py-3 px-4 rounded-2xl border-2 border-dashed border-[#E5E2DC] dark:border-slate-800 hover:border-teal-500 dark:hover:border-teal-600 hover:bg-teal-50/40 dark:hover:bg-teal-950/20 text-slate-500 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-[0.99] cursor-pointer"
                      >
                        <Plus className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                        <span>{isZh ? `新增第 ${activeDay.items.length + 1} 站` : 'Add next spot'}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Spot More Actions Sheet */}
      {actionMenuItem && (
        <IosActionSheet
          onClose={() => setActionMenuItem(null)}
          title={actionMenuItem.item.title}
          message={
            actionMenuItem.item.startTime
              ? `Day ${activeDay.dayNumber} · ${actionMenuItem.item.startTime}${actionMenuItem.item.endTime ? ` ~ ${actionMenuItem.item.endTime}` : ''}`
              : `Day ${activeDay.dayNumber}`
          }
          options={[
            {
              label: isZh ? '編輯景點資訊' : 'Edit Spot',
              tone: 'primary',
              onClick: () => {
                const target = actionMenuItem.item;
                setActionMenuItem(null);
                onOpenEditItem(target, activeDay.dayNumber);
              },
            },
            ...(actionMenuItem.index > 0
              ? [
                  {
                    label: isZh ? '往前移一站（上移）' : 'Move Up',
                    onClick: () => {
                      const idx = actionMenuItem.index;
                      setActionMenuItem(null);
                      handleMoveItem(idx, 'up');
                    },
                  },
                ]
              : []),
            ...(actionMenuItem.index < activeDay.items.length - 1
              ? [
                  {
                    label: isZh ? '往後移一站（下移）' : 'Move Down',
                    onClick: () => {
                      const idx = actionMenuItem.index;
                      setActionMenuItem(null);
                      handleMoveItem(idx, 'down');
                    },
                  },
                ]
              : []),
            {
              label: isZh ? '複製此景點' : 'Duplicate Spot',
              onClick: () => {
                const target = actionMenuItem.item;
                setActionMenuItem(null);
                handleDuplicateItem(target);
              },
            },
            ...(trip.days.length > 1
              ? [
                  {
                    label: isZh ? '移動至其他天' : 'Move to Another Day',
                    onClick: () => {
                      const target = actionMenuItem.item;
                      setActionMenuItem(null);
                      setMoveDayItem(target);
                    },
                  },
                ]
              : []),
            {
              label: isZh ? '刪除景點' : 'Delete Spot',
              tone: 'destructive',
              onClick: () => {
                const target = actionMenuItem.item;
                setActionMenuItem(null);
                setConfirmDeleteItem(target);
              },
            },
          ]}
        />
      )}

      {/* Move Spot to Another Day Sheet */}
      {moveDayItem && (
        <IosActionSheet
          onClose={() => setMoveDayItem(null)}
          title={isZh ? '移動景點至哪一天？' : 'Move Spot to Day'}
          message={moveDayItem.title}
          options={trip.days
            .filter((d) => d.dayNumber !== activeDay.dayNumber)
            .map((d) => ({
              label: `Day ${d.dayNumber} · ${formatMonthDaySlash(d.date)}${d.theme ? ` (${d.theme})` : ''}`,
              onClick: () => handleMoveItemToDay(moveDayItem, d.dayNumber),
            }))}
        />
      )}

      {/* Confirm Delete Spot Sheet (protects attached memories from accidental 1-tap loss!) */}
      {confirmDeleteItem && (
        <IosActionSheet
          onClose={() => setConfirmDeleteItem(null)}
          title={isZh ? `確定要刪除「${confirmDeleteItem.title}」？` : `Delete "${confirmDeleteItem.title}"?`}
          message={
            (trip.memories || []).some((m) => m.spotId === confirmDeleteItem.id)
              ? isZh
                ? '此景點包含關聯回憶照片，刪除後會一併移除。'
                : 'Attached memory photos for this spot will also be removed.'
              : isZh
                ? '刪除後無法復原。'
                : 'This action cannot be undone.'
          }
          options={[
            {
              label: isZh ? '確認刪除景點' : 'Delete Spot',
              tone: 'destructive',
              onClick: () => executeDeleteItem(confirmDeleteItem.id),
            },
          ]}
        />
      )}

      {/* Confirm Delete Day Sheet */}
      {confirmDeleteDay && (
        <IosActionSheet
          onClose={() => setConfirmDeleteDay(null)}
          title={isZh ? `確定要刪除 Day ${confirmDeleteDay.dayNumber}？` : `Delete Day ${confirmDeleteDay.dayNumber}?`}
          message={
            isZh
              ? `將移除該天排定的 ${confirmDeleteDay.items.length} 個景點，並自動重新編號後續天數與日期。`
              : `This removes ${confirmDeleteDay.items.length} spot(s) and renumbers subsequent days.`
          }
          options={[
            {
              label: isZh ? `確認刪除 Day ${confirmDeleteDay.dayNumber}` : `Delete Day ${confirmDeleteDay.dayNumber}`,
              tone: 'destructive',
              onClick: () => executeDeleteDay(confirmDeleteDay),
            },
          ]}
        />
      )}

      {/* High-Resolution Photo Overlay */}
      {overlaySpotPhoto && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center px-2 sm:p-6 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] bg-black/95 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => setOverlaySpotPhoto(null)}
        >
          <div
            className="max-w-4xl w-full bg-[#111827] rounded-3xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col max-h-full sm:max-h-[95dvh] relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setIsEditingOverlayGoogleUrl(!isEditingOverlayGoogleUrl)}
                  className="min-h-[40px] px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/90 text-teal-300 hover:text-white text-xs font-semibold transition flex items-center gap-1.5 border border-white/20 shadow-sm cursor-pointer"
                >
                  <Edit2 className="w-3 h-3" />
                  <span className="hidden sm:inline">{isEditingOverlayGoogleUrl ? '收合編輯' : '修改原圖連結'}</span>
                </button>
              )}

              {sanitizeExternalUrl(overlaySpotPhoto.item.googlePhotosUrl) && (
                <a
                  href={sanitizeExternalUrl(overlaySpotPhoto.item.googlePhotosUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] px-3 py-1.5 rounded-full bg-teal-700 hover:bg-teal-600 text-white text-xs font-bold transition flex items-center gap-1.5 border border-white/20 shadow-md"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-white" />
                  <span className="hidden sm:inline">在 Google 相簿開啟</span>
                  <span className="sm:hidden">原圖</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => setOverlaySpotPhoto(null)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/90 transition cursor-pointer"
                aria-label="關閉"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isEditingOverlayGoogleUrl && (
              <div className="p-3 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 z-20 mt-14">
                <input
                  type="url"
                  value={overlayEditUrl}
                  onChange={(e) => setOverlayEditUrl(e.target.value)}
                  placeholder="貼上 Google 相簿分享連結 (https://photos.app.goo.gl/...)"
                  className="flex-1 min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-[16px] sm:text-xs outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-500"
                />
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleSaveOverlayGoogleUrl}
                    className="min-h-[40px] px-4 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-600 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>儲存連結</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingOverlayGoogleUrl(false)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[280px] select-none p-2 sm:p-4">
              {overlaySpotPhoto.item.memoryPhotos && overlaySpotPhoto.item.memoryPhotos.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const photos = overlaySpotPhoto.item.memoryPhotos!;
                    const nextIdx = (overlaySpotPhoto.photoIndex - 1 + photos.length) % photos.length;
                    setOverlaySpotPhoto({ ...overlaySpotPhoto, photoIndex: nextIdx });
                  }}
                  className="absolute left-2 sm:left-4 z-10 w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition border border-white/10 cursor-pointer"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              {(() => {
                const currentLocal = overlaySpotPhoto.item.memoryPhotos?.[overlaySpotPhoto.photoIndex];
                const highResUrl = sanitizeExternalUrl(overlaySpotPhoto.item.googlePhotosUrl);
                const canUseHighRes = Boolean(highResUrl) && !overlayHighResFailed && !currentLocal;
                const activeSrc = currentLocal || (canUseHighRes ? highResUrl! : '');

                return (
                  <div className="relative flex items-center justify-center max-h-[65vh]">
                    <MediaImage
                      tripId={trip.id}
                      ownerId={trip.ownerId}
                      collabId={trip.collabId}
                      src={activeSrc}
                      alt={overlaySpotPhoto.item.title}
                      onError={() => {
                        if (canUseHighRes) setOverlayHighResFailed(true);
                      }}
                      className="max-h-[65vh] w-auto max-w-full object-contain rounded-xl"
                    />
                  </div>
                );
              })()}

              {overlaySpotPhoto.item.memoryPhotos && overlaySpotPhoto.item.memoryPhotos.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const photos = overlaySpotPhoto.item.memoryPhotos!;
                    const nextIdx = (overlaySpotPhoto.photoIndex + 1) % photos.length;
                    setOverlaySpotPhoto({ ...overlaySpotPhoto, photoIndex: nextIdx });
                  }}
                  className="absolute right-2 sm:right-4 z-10 w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition border border-white/10 cursor-pointer"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </div>

            {overlaySpotPhoto.item.memoryPhotos && overlaySpotPhoto.item.memoryPhotos.length > 1 && (
              <div className="px-4 py-2 bg-slate-950/90 border-t border-slate-800 flex items-center justify-center gap-2 overflow-x-auto">
                {overlaySpotPhoto.item.memoryPhotos.map((photo, pIdx) => (
                  <button
                    key={pIdx}
                    type="button"
                    onClick={() => setOverlaySpotPhoto({ ...overlaySpotPhoto, photoIndex: pIdx })}
                    className={`relative w-12 h-12 rounded-xl overflow-hidden shrink-0 transition border-2 cursor-pointer ${
                      pIdx === overlaySpotPhoto.photoIndex
                        ? 'border-teal-400 scale-105'
                        : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <MediaImage
                      tripId={trip.id}
                      ownerId={trip.ownerId}
                      collabId={trip.collabId}
                      src={photo}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            <div className="p-3.5 sm:p-4 bg-[#111827] text-white flex items-center justify-between gap-3 border-t border-slate-800">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base">{overlaySpotPhoto.item.memoryMood || '✨'}</span>
                  <h4 className="font-bold text-sm text-white truncate">{overlaySpotPhoto.item.title}</h4>
                </div>
                {(overlaySpotPhoto.item.notes || overlaySpotPhoto.item.memoryNotes) && (
                  <p className="text-xs text-slate-300 italic line-clamp-2 sm:line-clamp-none">
                    「{overlaySpotPhoto.item.memoryNotes || overlaySpotPhoto.item.notes}」
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {onOpenMemories && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = overlaySpotPhoto.item.id;
                      setOverlaySpotPhoto(null);
                      onOpenMemories(id);
                    }}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold shrink-0 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-teal-400" />
                    <span>相簿</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOverlaySpotPhoto(null)}
                  className="min-h-[40px] px-4 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-600 text-xs font-bold shrink-0 transition cursor-pointer"
                >
                  關閉
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
