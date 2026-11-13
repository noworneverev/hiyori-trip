import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { CategoryType, Trip } from '../../types/itinerary';
import { formatDateSlash, getDayOfWeek } from '../../utils/date';
import { Language } from '../../utils/i18n';
import { checkUserTripPermission } from '../../utils/firebase';
import { detectTripCurrency } from '../../utils/currency';
import { MediaImage } from '../UI/MediaImage';
import {
  CATEGORY_NAMES,
  FlattenedSpotMemory,
  GalleryPhotoItem,
  HubViewMode,
  LightboxPhotoState,
} from './travelHubTypes';
import { TravelHubMapView } from './TravelHubMapView';
import { TravelHubGalleryView } from './TravelHubGalleryView';
import { TravelHubAnalyticsView } from './TravelHubAnalyticsView';
import { TravelHubLightbox } from './TravelHubLightbox';
import { ShareCardStudioModal } from './ShareCardStudioModal';
import {
  ArrowRight,
  Award,
  BarChart3,
  Calendar as CalendarIcon,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Compass,
  Image as ImageIcon,
  Map as MapIcon,
  MapPin,
  Route,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';

interface GlobalTravelHubModalProps {
  trips: Trip[];
  currentTripId: string;
  currentUser?: User | null;
  lang: Language;
  onSelectTrip: (tripId: string, targetSpotId?: string) => void;
  onUpdateTrip?: (updatedTrip: Trip) => void;
  onClose: () => void;
  requireAuth?: (action: () => void, reason?: string) => boolean;
}

export const GlobalTravelHubModal: React.FC<GlobalTravelHubModalProps> = ({
  trips,
  currentTripId,
  currentUser = null,
  lang,
  onSelectTrip,
  onUpdateTrip,
  onClose,
  requireAuth,
}) => {
  useBodyScrollLock(true);

  const [viewMode, setViewMode] = useState<HubViewMode>('map');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedTripFilter, setSelectedTripFilter] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDestination, setSelectedDestination] = useState<string>('all');
  const [filterCompletedOnly, setFilterCompletedOnly] = useState<boolean>(true);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Deduplicate trips cleanly
  const uniqueTrips = useMemo(() => {
    const map = new Map<string, Trip>();
    (trips || []).forEach((tr) => {
      if (tr && tr.id && !map.has(tr.id)) {
        map.set(tr.id, tr);
      }
    });
    return Array.from(map.values());
  }, [trips]);

  const canEditMap = useMemo(() => {
    const map = new Map<string, boolean>();
    uniqueTrips.forEach((tr) => {
      const perm = checkUserTripPermission(tr, currentUser);
      map.set(tr.id, !tr.isCollaborative || perm.canEdit);
    });
    return map;
  }, [uniqueTrips, currentUser]);

  const activeTrip = useMemo(
    () => uniqueTrips.find((t) => t.id === currentTripId) || uniqueTrips[0],
    [uniqueTrips, currentTripId]
  );

  // Currency & Review states
  const [displayCurrency, setDisplayCurrency] = useState<string>(() =>
    detectTripCurrency(activeTrip) || 'TWD'
  );
  const [reviewYear, setReviewYear] = useState<string>(() => {
    if (activeTrip?.startDate && activeTrip.startDate.length >= 4) {
      return activeTrip.startDate.slice(0, 4);
    }
    return new Date().getFullYear().toString();
  });

  // Calendar navigation states
  const [calendarYear, setCalendarYear] = useState<number>(() => {
    if (activeTrip?.startDate && activeTrip.startDate.length >= 4) {
      const y = parseInt(activeTrip.startDate.slice(0, 4), 10);
      if (!isNaN(y)) return y;
    }
    return new Date().getFullYear();
  });
  const [calendarMonth, setCalendarMonth] = useState<number>(() => {
    if (activeTrip?.startDate && activeTrip.startDate.length >= 7) {
      const m = parseInt(activeTrip.startDate.slice(5, 7), 10);
      if (!isNaN(m)) return m - 1;
    }
    return new Date().getMonth();
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  // Overlays
  const [showShareStudio, setShowShareStudio] = useState(false);
  const [lightboxState, setLightboxState] = useState<LightboxPhotoState | null>(null);

  // Escape key closes topmost overlay cleanly
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (lightboxState) {
        setLightboxState(null);
      } else if (showShareStudio) {
        setShowShareStudio(false);
      } else if (showMobileFilters) {
        setShowMobileFilters(false);
      } else {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxState, showShareStudio, showMobileFilters, onClose]);

  const performToggleSpotVisited = (tripId: string, dayNumber: number, spotId: string) => {
    if (!onUpdateTrip) return;
    if (!(canEditMap.get(tripId) ?? true)) return;
    const targetTrip = uniqueTrips.find((t) => t.id === tripId);
    if (!targetTrip) return;

    const updatedDays = targetTrip.days.map((d) => {
      if (d.dayNumber !== dayNumber) return d;
      return {
        ...d,
        items: d.items.map((it) => (it.id === spotId ? { ...it, completed: !it.completed } : it)),
      };
    });

    onUpdateTrip({
      ...targetTrip,
      days: updatedDays,
      updatedAt: Date.now(),
    });
  };

  const handleToggleSpotVisited = (
    tripId: string,
    dayNumber: number,
    spotId: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (!onUpdateTrip || !(canEditMap.get(tripId) ?? true)) return;
    if (
      requireAuth &&
      !requireAuth(
        () => performToggleSpotVisited(tripId, dayNumber, spotId),
        lang === 'zh' ? '標記景點造訪狀態' : 'Update visited status'
      )
    ) {
      return;
    }
    performToggleSpotVisited(tripId, dayNumber, spotId);
  };

  // Flatten all spots across trips
  const allFlattenedSpots = useMemo<FlattenedSpotMemory[]>(() => {
    const list: FlattenedSpotMemory[] = [];
    const seenKeys = new Set<string>();

    uniqueTrips.forEach((trip) => {
      const memMap: Record<
        string,
        { photos: string[]; notes?: string; mood?: string; googlePhotosUrl?: string }
      > = {};
      (trip.memories || []).forEach((mem) => {
        if (mem.spotId) {
          if (!memMap[mem.spotId]) memMap[mem.spotId] = { photos: [] };
          if (mem.imageUrl) memMap[mem.spotId].photos.push(mem.imageUrl);
          if (mem.caption) memMap[mem.spotId].notes = mem.caption;
          if (mem.mood) memMap[mem.spotId].mood = mem.mood;
          if (mem.googlePhotosUrl) memMap[mem.spotId].googlePhotosUrl = mem.googlePhotosUrl;
        }
      });

      (trip.days || []).forEach((day) => {
        (day.items || []).forEach((spot) => {
          const key = `${trip.id}::${day.dayNumber}::${spot.id}`;
          if (seenKeys.has(key)) return;
          seenKeys.add(key);

          const directPhotos = spot.memoryPhotos || [];
          const memoryPhotos = memMap[spot.id]?.photos || [];
          const combinedPhotos = Array.from(new Set([...directPhotos, ...memoryPhotos]));

          list.push({
            tripId: trip.id,
            tripTitle: trip.title,
            tripDestination: trip.destination,
            tripCoverGradient: trip.coverGradient,
            tripCurrency: trip.currency || 'JPY',
            tripStartDate: trip.startDate,
            tripEndDate: trip.endDate,
            ownerId: trip.ownerId,
            collabId: trip.collabId,
            dayNumber: day.dayNumber,
            date: day.date,
            spotId: spot.id,
            spotTitle: spot.title,
            category: spot.category || 'spot',
            startTime: spot.startTime,
            endTime: spot.endTime,
            locationName: spot.locationName,
            address: spot.address,
            lat: spot.lat,
            lng: spot.lng,
            cost: spot.cost,
            notes: spot.notes || spot.memoryNotes || memMap[spot.id]?.notes,
            mood: spot.memoryMood || memMap[spot.id]?.mood,
            photos: combinedPhotos,
            googlePhotosUrl: spot.googlePhotosUrl || memMap[spot.id]?.googlePhotosUrl,
            completed: Boolean(spot.completed),
          });
        });
      });
    });

    return list;
  }, [uniqueTrips]);

  const displaySpots = useMemo(() => {
    if (!filterCompletedOnly) return allFlattenedSpots;
    return allFlattenedSpots.filter(
      (s) => s.completed || s.photos.length > 0 || Boolean(s.googlePhotosUrl)
    );
  }, [allFlattenedSpots, filterCompletedOnly]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    uniqueTrips.forEach((tr) => {
      if (tr.startDate && tr.startDate.length >= 4) years.add(tr.startDate.slice(0, 4));
      (tr.days || []).forEach((d) => {
        if (d.date && d.date.length >= 4) years.add(d.date.slice(0, 4));
      });
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [uniqueTrips]);

  const availableDestinations = useMemo(() => {
    const set = new Set<string>();
    uniqueTrips.forEach((tr) => {
      if (tr.destination?.trim()) set.add(tr.destination.trim());
    });
    return Array.from(set);
  }, [uniqueTrips]);

  // Unified filtered spots
  const filteredSpots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return displaySpots.filter((item) => {
      if (selectedTripFilter !== 'all' && item.tripId !== selectedTripFilter) return false;
      if (selectedDestination !== 'all' && item.tripDestination.trim() !== selectedDestination) {
        return false;
      }
      if (selectedYear !== 'all') {
        const y = item.date ? item.date.slice(0, 4) : item.tripStartDate.slice(0, 4);
        if (y !== selectedYear) return false;
      }
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      if (q) {
        const hay = `${item.spotTitle} ${item.tripTitle} ${item.tripDestination} ${item.locationName || ''} ${item.address || ''} ${item.notes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    displaySpots,
    searchQuery,
    selectedTripFilter,
    selectedDestination,
    selectedYear,
    selectedCategory,
  ]);

  // Unified Gallery Photos (both Spot photos and standalone trip.memories)
  const filteredGalleryPhotos = useMemo<GalleryPhotoItem[]>(() => {
    const result: GalleryPhotoItem[] = [];
    const seen = new Set<string>();
    const q = searchQuery.trim().toLowerCase();

    filteredSpots.forEach((s) => {
      s.photos.forEach((url, idx) => {
        const key = `${s.tripId}::${url}`;
        if (seen.has(key)) return;
        seen.add(key);
        result.push({
          id: `${s.tripId}-${s.spotId}-${idx}`,
          url,
          tripId: s.tripId,
          tripTitle: s.tripTitle,
          tripDestination: s.tripDestination,
          ownerId: s.ownerId,
          collabId: s.collabId,
          spotId: s.spotId,
          spotTitle: s.spotTitle,
          dayNumber: s.dayNumber,
          date: s.date,
          category: s.category,
          locationName: s.locationName,
          mood: s.mood,
          caption: s.notes,
          googlePhotosUrl: s.googlePhotosUrl,
          isFeaturedSpot: true,
        });
      });
    });

    // Include standalone memories if category filter is 'all'
    if (selectedCategory === 'all') {
      uniqueTrips.forEach((tr) => {
        if (selectedTripFilter !== 'all' && tr.id !== selectedTripFilter) return;
        if (selectedDestination !== 'all' && tr.destination?.trim() !== selectedDestination) return;

        (tr.memories || []).forEach((mem, idx) => {
          if (!mem.imageUrl) return;
          const memDate = mem.date || tr.startDate || '';
          if (selectedYear !== 'all' && !memDate.startsWith(selectedYear)) return;
          if (q) {
            const hay = `${mem.spotTitle || ''} ${mem.caption || ''} ${mem.location || ''} ${tr.title} ${tr.destination}`.toLowerCase();
            if (!hay.includes(q)) return;
          }
          const key = `${tr.id}::${mem.imageUrl}`;
          if (seen.has(key)) return;
          seen.add(key);

          result.push({
            id: `${tr.id}-mem-${mem.id || idx}`,
            url: mem.imageUrl,
            tripId: tr.id,
            tripTitle: tr.title,
            tripDestination: tr.destination,
            ownerId: tr.ownerId,
            collabId: tr.collabId,
            spotId: mem.spotId,
            spotTitle: mem.spotTitle || tr.title,
            dayNumber: mem.dayNumber,
            date: memDate,
            locationName: mem.location,
            mood: mem.mood,
            caption: mem.caption,
            googlePhotosUrl: mem.googlePhotosUrl,
            isFeaturedSpot: Boolean(mem.spotId),
          });
        });
      });
    }

    return result.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [
    filteredSpots,
    uniqueTrips,
    selectedTripFilter,
    selectedDestination,
    selectedYear,
    selectedCategory,
    searchQuery,
  ]);

  // Global stats for sidebar & Share Studio
  const stats = useMemo(() => {
    const uniqueDates = new Set<string>();
    displaySpots.forEach((s) => {
      if (s.date) uniqueDates.add(s.date);
    });
    return {
      totalTrips: uniqueTrips.length,
      totalDays:
        uniqueDates.size || uniqueTrips.reduce((acc, tr) => acc + (tr.days?.length || 1), 0),
      totalSpots: displaySpots.length,
      totalPhotos: filteredGalleryPhotos.length,
    };
  }, [uniqueTrips, displaySpots, filteredGalleryPhotos.length]);

  // Calendar maps
  const spotsByDateMap = useMemo(() => {
    const map = new Map<string, FlattenedSpotMemory[]>();
    filteredSpots.forEach((s) => {
      if (!s.date) return;
      const list = map.get(s.date) || [];
      const dup = list.some(
        (x) =>
          x.spotId === s.spotId ||
          (x.tripId === s.tripId &&
            x.spotTitle.trim() === s.spotTitle.trim() &&
            (x.startTime || '') === (s.startTime || ''))
      );
      if (!dup) list.push(s);
      map.set(s.date, list);
    });
    return map;
  }, [filteredSpots]);

  const tripsByDateMap = useMemo(() => {
    const map = new Map<string, { trip: Trip; dayNumber: number }>();
    uniqueTrips.forEach((tr) => {
      if (selectedTripFilter !== 'all' && tr.id !== selectedTripFilter) return;
      (tr.days || []).forEach((d) => {
        if (d.date) map.set(d.date, { trip: tr, dayNumber: d.dayNumber });
      });
    });
    return map;
  }, [uniqueTrips, selectedTripFilter]);

  const calendarDays = useMemo(() => {
    const first = new Date(calendarYear, calendarMonth, 1);
    const startDow = first.getDay();
    const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const prevLast = new Date(calendarYear, calendarMonth, 0).getDate();

    const days: {
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      spots: FlattenedSpotMemory[];
      tripInfo?: { trip: Trip; dayNumber: number };
    }[] = [];

    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevLast - i;
      const dt = new Date(calendarYear, calendarMonth - 1, d);
      const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        spots: spotsByDateMap.get(dateStr) || [],
        tripInfo: tripsByDateMap.get(dateStr),
      });
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        spots: spotsByDateMap.get(dateStr) || [],
        tripInfo: tripsByDateMap.get(dateStr),
      });
    }

    const rem = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= rem; i++) {
      const dt = new Date(calendarYear, calendarMonth + 1, i);
      const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      days.push({
        dateStr,
        dayNumber: dt.getDate(),
        isCurrentMonth: false,
        spots: spotsByDateMap.get(dateStr) || [],
        tripInfo: tripsByDateMap.get(dateStr),
      });
    }

    return days;
  }, [calendarYear, calendarMonth, spotsByDateMap, tripsByDateMap]);

  const selectedDateTripGroups = useMemo(() => {
    if (!selectedCalendarDate) return [];
    const daySpots = spotsByDateMap.get(selectedCalendarDate) || [];
    const groupMap = new Map<
      string,
      { trip: Trip; dayNumber: number; spots: FlattenedSpotMemory[] }
    >();
    daySpots.forEach((s) => {
      if (!groupMap.has(s.tripId)) {
        const found = uniqueTrips.find((t) => t.id === s.tripId);
        if (found) groupMap.set(s.tripId, { trip: found, dayNumber: s.dayNumber, spots: [] });
      }
      const g = groupMap.get(s.tripId);
      if (g && !g.spots.some((x) => x.spotId === s.spotId)) g.spots.push(s);
    });
    return Array.from(groupMap.values());
  }, [selectedCalendarDate, spotsByDateMap, uniqueTrips]);

  const timelineGrouped = useMemo(() => {
    const tripMap = new Map<string, Map<number, FlattenedSpotMemory[]>>();
    filteredSpots.forEach((s) => {
      if (!tripMap.has(s.tripId)) tripMap.set(s.tripId, new Map());
      const dMap = tripMap.get(s.tripId)!;
      const list = dMap.get(s.dayNumber) || [];
      if (!list.some((x) => x.spotId === s.spotId)) list.push(s);
      dMap.set(s.dayNumber, list);
    });

    const groups: {
      trip: Trip;
      days: { dayNumber: number; date: string; spots: FlattenedSpotMemory[] }[];
    }[] = [];

    uniqueTrips.forEach((tr) => {
      const dMap = tripMap.get(tr.id);
      if (!dMap) return;
      const days = Array.from(dMap.keys())
        .sort((a, b) => a - b)
        .map((dn) => {
          const spots = dMap.get(dn)!;
          return { dayNumber: dn, date: spots[0]?.date || '', spots };
        });
      groups.push({ trip: tr, days });
    });

    return groups;
  }, [filteredSpots, uniqueTrips]);

  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) +
    (selectedYear !== 'all' ? 1 : 0) +
    (selectedTripFilter !== 'all' ? 1 : 0) +
    (selectedCategory !== 'all' ? 1 : 0) +
    (selectedDestination !== 'all' ? 1 : 0);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedYear('all');
    setSelectedTripFilter('all');
    setSelectedCategory('all');
    setSelectedDestination('all');
  };

  const openSpotPhotosLightbox = (spot: FlattenedSpotMemory, startIndex: number) => {
    const items: GalleryPhotoItem[] = spot.photos.map((url, idx) => ({
      id: `${spot.tripId}-${spot.spotId}-${idx}`,
      url,
      tripId: spot.tripId,
      tripTitle: spot.tripTitle,
      tripDestination: spot.tripDestination,
      ownerId: spot.ownerId,
      collabId: spot.collabId,
      spotId: spot.spotId,
      spotTitle: spot.spotTitle,
      dayNumber: spot.dayNumber,
      date: spot.date,
      category: spot.category,
      locationName: spot.locationName,
      mood: spot.mood,
      caption: spot.notes,
      googlePhotosUrl: spot.googlePhotosUrl,
      isFeaturedSpot: true,
    }));
    setLightboxState({ photos: items, index: startIndex, autoPlay: false });
  };

  const renderFilterControls = () => (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜尋景點、城市、美食、筆記..."
          className="w-full min-h-[42px] pl-9 pr-8 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 outline-none focus:border-teal-500 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
            aria-label="清除搜尋"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Visited vs All */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">足跡範圍</span>
        <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => setFilterCompletedOnly(true)}
            className={`min-h-[38px] rounded-lg transition cursor-pointer flex items-center justify-center gap-1 ${
              filterCompletedOnly
                ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-2xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>已造訪</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterCompletedOnly(false)}
            className={`min-h-[38px] rounded-lg transition cursor-pointer ${
              !filterCompletedOnly
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            全部行程
          </button>
        </div>
      </div>

      {/* Trip Selector */}
      {uniqueTrips.length > 1 && (
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">
            指定旅程
          </label>
          <select
            value={selectedTripFilter}
            onChange={(e) => setSelectedTripFilter(e.target.value)}
            className="w-full min-h-[40px] px-3 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
          >
            <option value="all">全部旅程 ({uniqueTrips.length})</option>
            {uniqueTrips.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Destination Filter */}
      {availableDestinations.length > 1 && (
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">
            目的地城市
          </label>
          <select
            value={selectedDestination}
            onChange={(e) => setSelectedDestination(e.target.value)}
            className="w-full min-h-[40px] px-3 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
          >
            <option value="all">全部城市 ({availableDestinations.length})</option>
            {availableDestinations.map((dest) => (
              <option key={dest} value={dest}>
                {dest}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Year Filter */}
      <div className="space-y-1.5">
        <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">
          年份
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedYear('all')}
            className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold cursor-pointer transition ${
              selectedYear === 'all'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            全部
          </button>
          {availableYears.map((yr) => (
            <button
              key={yr}
              type="button"
              onClick={() => {
                setSelectedYear(yr);
                const yNum = parseInt(yr, 10);
                if (!isNaN(yNum)) setCalendarYear(yNum);
              }}
              className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold font-mono tabular-nums cursor-pointer transition ${
                selectedYear === yr
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {yr}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filter */}
      <div className="space-y-1.5">
        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">
          足跡類別
        </label>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full min-h-[40px] px-3 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
        >
          <option value="all">所有類別</option>
          {Object.entries(CATEGORY_NAMES).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={handleResetFilters}
          className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-teal-500 transition cursor-pointer"
        >
          清除篩選條件 ({activeFilterCount})
        </button>
      )}
    </div>
  );

  const navTabs: { id: HubViewMode; label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'map', label: '足跡地圖', shortLabel: '地圖', icon: MapIcon },
    { id: 'gallery', label: '相片牆', shortLabel: '相片', icon: ImageIcon },
    { id: 'calendar', label: '月曆足跡', shortLabel: '月曆', icon: CalendarIcon },
    { id: 'timeline', label: '時光故事軸', shortLabel: '故事軸', icon: Route },
    { id: 'review', label: '年度回顧', shortLabel: '年鑑', icon: BarChart3 },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm sm:p-4 overflow-hidden"
      onClick={onClose}
    >
      <div
        className="w-full max-w-7xl h-full sm:h-[92vh] sm:max-h-[900px] sm:rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border-0 sm:border border-slate-200/90 dark:border-slate-800 text-slate-800 dark:text-slate-100 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Editorial Masthead */}
        <header className="px-4 sm:px-6 py-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:pt-3.5 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-base text-slate-900 dark:text-white tracking-tight truncate">
                  足跡時光庫
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                  {uniqueTrips.length} 趟旅程 · {stats.totalSpots} 處足跡 · {filteredGalleryPhotos.length} 張照片
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="關閉足跡時光庫"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center justify-between md:justify-end gap-2.5 min-w-0">
            {/* Single-line View Mode Switcher */}
            <nav className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto no-scrollbar flex-1 md:flex-initial">
              {navTabs.map((tab) => {
                const Icon = tab.icon;
                const active = viewMode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setViewMode(tab.id)}
                    className={`min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition cursor-pointer ${
                      active
                        ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-200 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden">{tab.shortLabel}</span>
                  </button>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={() => setShowShareStudio(true)}
              className="hidden sm:inline-flex min-h-[40px] px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-teal-600 hover:opacity-90 text-white text-xs font-bold items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <Award className="w-3.5 h-3.5 text-amber-300" />
              <span>足跡圖卡</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="hidden md:flex min-w-[40px] min-h-[40px] items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
              aria-label="關閉"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Desktop Workbench Body (Left Filter Rail + Main Stage) */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {viewMode !== 'review' && (
            <aside className="hidden lg:flex flex-col w-[276px] shrink-0 border-r border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 p-5 overflow-y-auto justify-between gap-6">
              {renderFilterControls()}

              {/* Compact Summary Ledger */}
              <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800 space-y-2.5">
                <div className="text-[11px] font-bold text-slate-400">目前篩選結果</div>
                <div className="grid grid-cols-2 gap-2 font-mono tabular-nums text-xs">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                    <div className="text-[10px] font-sans text-slate-400">足跡行程點</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                      {filteredSpots.length}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                    <div className="text-[10px] font-sans text-slate-400">收錄相片</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                      {filteredGalleryPhotos.length}
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          )}

          {/* Main Scrollable Stage */}
          <main className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 lg:p-7 bg-slate-50/40 dark:bg-slate-950/40">
            <div className="max-w-5xl mx-auto">
              {viewMode === 'map' && (
                <TravelHubMapView
                  spots={filteredSpots}
                  lang={lang}
                  canEditMap={canEditMap}
                  onSelectTrip={onSelectTrip}
                  onToggleSpotVisited={handleToggleSpotVisited}
                  onOpenLightbox={(items, index) =>
                    setLightboxState({ photos: items, index, autoPlay: false })
                  }
                  onCloseHub={onClose}
                />
              )}

              {viewMode === 'gallery' && (
                <TravelHubGalleryView
                  photos={filteredGalleryPhotos}
                  onOpenLightbox={(items, index, autoPlay) =>
                    setLightboxState({ photos: items, index, autoPlay })
                  }
                  onSelectTrip={onSelectTrip}
                  onCloseHub={onClose}
                  onResetFilters={handleResetFilters}
                />
              )}

              {viewMode === 'calendar' && (
                <div className="space-y-4">
                  {/* Calendar Month Header */}
                  <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-200/90 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (calendarMonth === 0) {
                            setCalendarYear((y) => y - 1);
                            setCalendarMonth(11);
                          } else {
                            setCalendarMonth((m) => m - 1);
                          }
                          setSelectedCalendarDate(null);
                        }}
                        className="min-w-[38px] min-h-[38px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                        aria-label="上個月"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <h3 className="text-base sm:text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                        {calendarYear} 年 {calendarMonth + 1} 月
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          if (calendarMonth === 11) {
                            setCalendarYear((y) => y + 1);
                            setCalendarMonth(0);
                          } else {
                            setCalendarMonth((m) => m + 1);
                          }
                          setSelectedCalendarDate(null);
                        }}
                        className="min-w-[38px] min-h-[38px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                        aria-label="下個月"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        setCalendarYear(now.getFullYear());
                        setCalendarMonth(now.getMonth());
                        setSelectedCalendarDate(null);
                      }}
                      className="min-h-[36px] px-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold transition cursor-pointer"
                    >
                      回到本月
                    </button>
                  </div>

                  {/* 7-column Grid */}
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden">
                    <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-center py-2.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      <span className="text-rose-500">週日</span>
                      <span>週一</span>
                      <span>週二</span>
                      <span>週三</span>
                      <span>週四</span>
                      <span>週五</span>
                      <span className="text-teal-600 dark:text-teal-400">週六</span>
                    </div>

                    <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-slate-800/80">
                      {calendarDays.map((cell, idx) => {
                        const hasTrip = Boolean(cell.tripInfo);
                        const isSelected = selectedCalendarDate === cell.dateStr;
                        const spotCount = cell.spots.length;
                        const hasPhotos = cell.spots.some((s) => s.photos.length > 0);

                        return (
                          <div
                            key={`${cell.dateStr}-${idx}`}
                            onClick={() => {
                              if (hasTrip || spotCount > 0) {
                                setSelectedCalendarDate(cell.dateStr);
                              }
                            }}
                            className={`min-h-[60px] sm:min-h-[88px] p-1.5 sm:p-2 transition flex flex-col justify-between ${
                              !cell.isCurrentMonth ? 'opacity-30' : ''
                            } ${
                              hasTrip
                                ? 'bg-teal-50/50 dark:bg-teal-950/25 hover:bg-teal-100/60 dark:hover:bg-teal-900/40 cursor-pointer'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                            } ${
                              isSelected ? 'ring-2 ring-inset ring-teal-500 bg-teal-100/60 dark:bg-teal-900/50' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-xs font-mono tabular-nums font-bold ${
                                  hasTrip
                                    ? 'text-teal-900 dark:text-teal-200'
                                    : 'text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {cell.dayNumber}
                              </span>
                              {hasPhotos && (
                                <Camera className="w-3 h-3 text-rose-500 shrink-0" />
                              )}
                            </div>

                            {hasTrip && cell.tripInfo && (
                              <div className="mt-1 space-y-0.5 overflow-hidden">
                                <div className="text-[10px] font-bold text-teal-900 dark:text-teal-200 truncate leading-tight">
                                  {cell.tripInfo.trip.destination || cell.tripInfo.trip.title}
                                </div>
                                <div className="text-[9px] text-teal-700 dark:text-teal-400 font-mono tabular-nums">
                                  D{cell.tripInfo.dayNumber}
                                  {spotCount > 0 ? ` · ${spotCount}點` : ''}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Selected Date Details */}
                  {selectedCalendarDate && (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-teal-500/40 space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div>
                          <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white font-mono tabular-nums">
                            {formatDateSlash(selectedCalendarDate)} ({getDayOfWeek(selectedCalendarDate, lang)})
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            涵蓋 {selectedDateTripGroups.length} 趟旅程 · {selectedDateTripGroups.reduce((a, g) => a + g.spots.length, 0)} 處足跡
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedCalendarDate(null)}
                          className="min-w-[36px] min-h-[36px] rounded-xl text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {selectedDateTripGroups.length === 0 ? (
                        <p className="text-xs text-slate-400 py-3 text-center">
                          當日尚無細項足跡紀錄
                        </p>
                      ) : (
                        <div className="space-y-4">
                          {selectedDateTripGroups.map(({ trip, dayNumber, spots }) => (
                            <div key={trip.id} className="space-y-2.5">
                              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                                  {trip.title}
                                  <span className="font-mono font-medium text-slate-400 ml-2">
                                    · 第 {dayNumber} 天 · {spots.length} 處
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelectTrip(trip.id);
                                    onClose();
                                  }}
                                  className="min-h-[34px] px-3 py-1 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
                                >
                                  <span>前往行程</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {spots.map((spot) => (
                                  <div
                                    key={spot.spotId}
                                    className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-2"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                                        {spot.spotTitle}
                                      </span>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {spot.startTime && (
                                          <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                            {spot.startTime}
                                          </span>
                                        )}
                                        {onUpdateTrip && (canEditMap.get(spot.tripId) ?? true) && (
                                          <button
                                            type="button"
                                            onClick={(e) =>
                                              handleToggleSpotVisited(
                                                spot.tripId,
                                                spot.dayNumber,
                                                spot.spotId,
                                                e
                                              )
                                            }
                                            className={`min-w-[32px] min-h-[32px] rounded-lg flex items-center justify-center cursor-pointer ${
                                              spot.completed
                                                ? 'text-emerald-600 dark:text-emerald-400'
                                                : 'text-slate-400 hover:text-slate-600'
                                            }`}
                                          >
                                            {spot.completed ? (
                                              <CheckCircle2 className="w-4 h-4" />
                                            ) : (
                                              <Circle className="w-4 h-4" />
                                            )}
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {spot.locationName && (
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                                        <MapPin className="w-3 h-3 shrink-0" />
                                        <span className="truncate">{spot.locationName}</span>
                                      </p>
                                    )}

                                    {spot.notes && (
                                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                                        {spot.notes}
                                      </p>
                                    )}

                                    {spot.photos.length > 0 && (
                                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
                                        {spot.photos.map((imgUrl, i) => (
                                          <MediaImage
                                            key={i}
                                            src={imgUrl}
                                            tripId={spot.tripId}
                                            ownerId={spot.ownerId}
                                            collabId={spot.collabId}
                                            alt={spot.spotTitle}
                                            onClick={() => openSpotPhotosLightbox(spot, i)}
                                            className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-slate-700 cursor-pointer shrink-0"
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {viewMode === 'timeline' && (
                <div className="space-y-6">
                  {timelineGrouped.length === 0 ? (
                    <div className="py-16 text-center space-y-3">
                      <Search className="w-8 h-8 text-slate-400 mx-auto" />
                      <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300">
                        找不到符合條件的旅程故事
                      </h4>
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="min-h-[40px] px-4 py-2 bg-teal-600 text-white rounded-xl font-bold text-xs cursor-pointer"
                      >
                        重設所有篩選
                      </button>
                    </div>
                  ) : (
                    timelineGrouped.map(({ trip, days }) => (
                      <article
                        key={trip.id}
                        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden"
                      >
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                              {formatDateSlash(trip.startDate)} – {formatDateSlash(trip.endDate)} · {trip.destination}
                            </div>
                            <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white mt-0.5">
                              {trip.title}
                            </h3>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              onSelectTrip(trip.id);
                              onClose();
                            }}
                            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold inline-flex items-center gap-1.5 self-start sm:self-auto cursor-pointer shrink-0"
                          >
                            <span>打開此行程</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="p-5 space-y-6">
                          {days.map((dayGroup) => (
                            <div key={dayGroup.dayNumber} className="space-y-3">
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800/80 pb-2">
                                <span className="font-mono tabular-nums text-teal-700 dark:text-teal-400">
                                  DAY {String(dayGroup.dayNumber).padStart(2, '0')}
                                </span>
                                <span className="text-slate-300 dark:text-slate-700">·</span>
                                <span className="font-mono tabular-nums">
                                  {dayGroup.date
                                    ? `${formatDateSlash(dayGroup.date)} (${getDayOfWeek(dayGroup.date, lang)})`
                                    : `第 ${dayGroup.dayNumber} 天`}
                                </span>
                                <span className="text-slate-400 font-normal ml-auto font-mono tabular-nums">
                                  {dayGroup.spots.length} 處
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {dayGroup.spots.map((spot) => (
                                  <div
                                    key={spot.spotId}
                                    className="p-3.5 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-2"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                          {spot.startTime ? `${spot.startTime} · ` : ''}
                                          {CATEGORY_NAMES[spot.category] || '景點'}
                                        </div>
                                        <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                          {spot.spotTitle}
                                        </h4>
                                      </div>

                                      {onUpdateTrip && (canEditMap.get(spot.tripId) ?? true) && (
                                        <button
                                          type="button"
                                          onClick={(e) =>
                                            handleToggleSpotVisited(
                                              spot.tripId,
                                              spot.dayNumber,
                                              spot.spotId,
                                              e
                                            )
                                          }
                                          className={`min-w-[34px] min-h-[34px] rounded-xl flex items-center justify-center cursor-pointer ${
                                            spot.completed
                                              ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60'
                                              : 'text-slate-400 hover:text-slate-600'
                                          }`}
                                          title={spot.completed ? '已完成（點擊切換）' : '標記已造訪'}
                                        >
                                          {spot.completed ? (
                                            <CheckCircle2 className="w-4 h-4" />
                                          ) : (
                                            <Circle className="w-4 h-4" />
                                          )}
                                        </button>
                                      )}
                                    </div>

                                    {spot.locationName && (
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                                        <MapPin className="w-3 h-3 shrink-0" />
                                        <span className="truncate">{spot.locationName}</span>
                                      </p>
                                    )}

                                    {spot.notes && (
                                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                                        {spot.notes}
                                      </p>
                                    )}

                                    {spot.photos.length > 0 && (
                                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
                                        {spot.photos.map((photoUrl, pIdx) => (
                                          <MediaImage
                                            key={pIdx}
                                            src={photoUrl}
                                            tripId={spot.tripId}
                                            ownerId={spot.ownerId}
                                            collabId={spot.collabId}
                                            alt={spot.spotTitle}
                                            onClick={() => openSpotPhotosLightbox(spot, pIdx)}
                                            className="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700 cursor-pointer shrink-0"
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              )}

              {viewMode === 'review' && (
                <TravelHubAnalyticsView
                  uniqueTrips={uniqueTrips}
                  displaySpots={displaySpots}
                  availableYears={availableYears}
                  reviewYear={reviewYear}
                  setReviewYear={setReviewYear}
                  filterCompletedOnly={filterCompletedOnly}
                  setFilterCompletedOnly={setFilterCompletedOnly}
                  displayCurrency={displayCurrency}
                  setDisplayCurrency={setDisplayCurrency}
                  onSelectTrip={onSelectTrip}
                  onOpenShareStudio={() => setShowShareStudio(true)}
                  onOpenLightbox={(items, idx) =>
                    setLightboxState({ photos: items, index: idx, autoPlay: false })
                  }
                  onCloseHub={onClose}
                />
              )}
            </div>
          </main>
        </div>

        {/* Mobile One-Handed Bottom Action Bar (<= 15% sticky height, >= 44px touch targets) */}
        <footer className="lg:hidden border-t border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] flex items-center justify-between gap-2 shrink-0">
          {viewMode !== 'review' ? (
            <button
              type="button"
              onClick={() => setShowMobileFilters(true)}
              className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>
                篩選條件{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </span>
            </button>
          ) : (
            <div className="text-xs font-mono text-slate-500 dark:text-slate-400 px-2 truncate">
              {reviewYear === 'all' ? '歷年總覽' : `${reviewYear} 年度`} · {displayCurrency}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowShareStudio(true)}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Award className="w-4 h-4 text-amber-300" />
            <span>足跡圖卡</span>
          </button>
        </footer>
      </div>

      {/* Mobile Slide-Up Bottom Filter Sheet */}
      {showMobileFilters && (
        <div
          className="lg:hidden fixed inset-0 z-60 flex items-end justify-center bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowMobileFilters(false)}
        >
          <div
            className="w-full max-h-[82vh] rounded-t-3xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pt-3 pb-1 flex flex-col items-center shrink-0">
              <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mb-2" />
              <div className="w-full px-5 pb-2 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  篩選與搜尋條件
                </h3>
                <button
                  type="button"
                  onClick={() => setShowMobileFilters(false)}
                  className="min-w-[40px] min-h-[40px] rounded-xl text-slate-400 flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">{renderFilterControls()}</div>

            <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="w-full min-h-[48px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold cursor-pointer"
              >
                顯示 {filteredSpots.length} 處足跡
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editorial PNG Share Card Studio */}
      <ShareCardStudioModal
        isOpen={showShareStudio}
        trips={uniqueTrips}
        photos={filteredGalleryPhotos}
        availableYears={availableYears}
        initialYear={reviewYear}
        displayCurrency={displayCurrency}
        onClose={() => setShowShareStudio(false)}
      />

      {/* Fullscreen Lightbox & Story Slideshow Player */}
      {lightboxState && (
        <TravelHubLightbox
          photos={lightboxState.photos}
          initialIndex={lightboxState.index}
          initialAutoPlay={lightboxState.autoPlay}
          onClose={() => setLightboxState(null)}
          onSelectTrip={(tripId, spotId) => {
            onSelectTrip(tripId, spotId);
            onClose();
          }}
        />
      )}
    </div>
  );
};
