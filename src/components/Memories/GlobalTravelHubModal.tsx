import React, { useState, useMemo, useEffect } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { Trip, CategoryType } from '../../types/itinerary';
import { formatDateSlash, getDayOfWeek } from '../../utils/date';
import { Language, TRANSLATIONS } from '../../utils/i18n';
import {
  X,
  Search,
  Calendar as CalendarIcon,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Camera,
  ExternalLink,
  Award,
  Share2,
  Check,
  Compass,
  ArrowRight,
  Filter,
  Route,
} from 'lucide-react';

interface GlobalTravelHubModalProps {
  trips: Trip[];
  currentTripId: string;
  lang: Language;
  onSelectTrip: (tripId: string, targetSpotId?: string) => void;
  onClose: () => void;
}

interface FlattenedSpotMemory {
  tripId: string;
  tripTitle: string;
  tripDestination: string;
  tripCoverGradient?: string;
  tripStartDate: string;
  tripEndDate: string;
  dayNumber: number;
  date: string; // "YYYY-MM-DD"
  spotId: string;
  spotTitle: string;
  category: CategoryType;
  startTime?: string;
  endTime?: string;
  locationName?: string;
  address?: string;
  notes?: string;
  mood?: string;
  photos: string[];
  googlePhotosUrl?: string;
}

const CATEGORY_NAMES: Record<CategoryType, string> = {
  spot: '景點',
  food: '美食',
  transport: '交通',
  hotel: '住宿',
  shopping: '購物',
  activity: '體驗',
  other: '其他',
};

export const GlobalTravelHubModal: React.FC<GlobalTravelHubModalProps> = ({
  trips,
  currentTripId,
  lang,
  onSelectTrip,
  onClose,
}) => {
  useBodyScrollLock(true);
  const t = TRANSLATIONS[lang];

  // Active view mode: 'calendar' or 'timeline'
  const [viewMode, setViewMode] = useState<'calendar' | 'timeline'>('calendar');

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDestination, setSelectedDestination] = useState<string>('all');

  // Calendar navigation state
  const [calendarYear, setCalendarYear] = useState<number>(() => {
    // Default to the year of the current trip or most recent trip or current year
    const active = trips.find((t) => t.id === currentTripId);
    if (active?.startDate && active.startDate.length >= 4) {
      const y = parseInt(active.startDate.slice(0, 4), 10);
      if (!isNaN(y)) return y;
    }
    if (trips.length > 0 && trips[0].startDate) {
      const y = parseInt(trips[0].startDate.slice(0, 4), 10);
      if (!isNaN(y)) return y;
    }
    return new Date().getFullYear();
  });

  const [calendarMonth, setCalendarMonth] = useState<number>(() => {
    const active = trips.find((t) => t.id === currentTripId);
    if (active?.startDate && active.startDate.length >= 7) {
      const m = parseInt(active.startDate.slice(5, 7), 10);
      if (!isNaN(m)) return m - 1; // 0-indexed
    }
    if (trips.length > 0 && trips[0].startDate) {
      const m = parseInt(trips[0].startDate.slice(5, 7), 10);
      if (!isNaN(m)) return m - 1;
    }
    return new Date().getMonth();
  });

  // Selected date on calendar to inspect day details
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  // Milestone Passport Card Modal toggle
  const [showPassportCard, setShowPassportCard] = useState(false);
  const [copiedShareText, setCopiedShareText] = useState(false);

  // Photo Lightbox state
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    caption?: string;
    spotTitle?: string;
    tripTitle?: string;
    date?: string;
    googlePhotosUrl?: string;
  } | null>(null);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxImage) {
          setLightboxImage(null);
        } else if (showPassportCard) {
          setShowPassportCard(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage, showPassportCard, onClose]);

  // Flatten all spots across all trips for search and calendar indexing
  const allFlattenedSpots = useMemo(() => {
    const list: FlattenedSpotMemory[] = [];

    trips.forEach((trip) => {
      // Collect photos from trip.memories mapped by spotId
      const memoryPhotoMap: Record<string, { photos: string[]; notes?: string; mood?: string; googlePhotosUrl?: string }> = {};
      (trip.memories || []).forEach((mem) => {
        if (mem.spotId) {
          if (!memoryPhotoMap[mem.spotId]) {
            memoryPhotoMap[mem.spotId] = { photos: [] };
          }
          if (mem.imageUrl) memoryPhotoMap[mem.spotId].photos.push(mem.imageUrl);
          if (mem.caption) memoryPhotoMap[mem.spotId].notes = mem.caption;
          if (mem.mood) memoryPhotoMap[mem.spotId].mood = mem.mood;
          if (mem.googlePhotosUrl) memoryPhotoMap[mem.spotId].googlePhotosUrl = mem.googlePhotosUrl;
        }
      });

      (trip.days || []).forEach((day) => {
        (day.items || []).forEach((spot) => {
          const directPhotos = spot.memoryPhotos || [];
          const memoryPhotos = memoryPhotoMap[spot.id]?.photos || [];
          const combinedPhotos = Array.from(new Set([...directPhotos, ...memoryPhotos]));

          list.push({
            tripId: trip.id,
            tripTitle: trip.title,
            tripDestination: trip.destination,
            tripCoverGradient: trip.coverGradient,
            tripStartDate: trip.startDate,
            tripEndDate: trip.endDate,
            dayNumber: day.dayNumber,
            date: day.date,
            spotId: spot.id,
            spotTitle: spot.title,
            category: spot.category || 'spot',
            startTime: spot.startTime,
            endTime: spot.endTime,
            locationName: spot.locationName,
            address: spot.address,
            notes: spot.notes || spot.memoryNotes || memoryPhotoMap[spot.id]?.notes,
            mood: spot.memoryMood || memoryPhotoMap[spot.id]?.mood,
            photos: combinedPhotos,
            googlePhotosUrl: spot.googlePhotosUrl || memoryPhotoMap[spot.id]?.googlePhotosUrl,
          });
        });
      });
    });

    return list;
  }, [trips]);

  // Extract available years
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    trips.forEach((tr) => {
      if (tr.startDate && tr.startDate.length >= 4) {
        years.add(tr.startDate.slice(0, 4));
      }
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [trips]);

  // Overall Travel Milestone Statistics
  const stats = useMemo(() => {
    const totalTrips = trips.length;
    const uniqueDates = new Set<string>();
    const uniqueDestinations = new Set<string>();
    let totalSpots = 0;
    let totalPhotos = 0;

    trips.forEach((tr) => {
      if (tr.destination) uniqueDestinations.add(tr.destination);
      (tr.days || []).forEach((d) => {
        if (d.date) uniqueDates.add(d.date);
        totalSpots += (d.items || []).length;
      });
      (tr.memories || []).forEach((m) => {
        if (m.imageUrl) totalPhotos++;
      });
      (tr.days || []).forEach((d) => {
        (d.items || []).forEach((it) => {
          if (it.memoryPhotos) totalPhotos += it.memoryPhotos.length;
        });
      });
    });

    return {
      totalTrips,
      totalDays: uniqueDates.size || trips.reduce((acc, t) => acc + (t.days?.length || 1), 0),
      totalDestinations: uniqueDestinations.size,
      totalSpots,
      totalPhotos,
    };
  }, [trips]);

  // Filtered spots based on user search query, year, destination, category
  const filteredSpots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return allFlattenedSpots.filter((item) => {
      // Query search
      if (q) {
        const matchTitle = item.spotTitle.toLowerCase().includes(q);
        const matchTrip = item.tripTitle.toLowerCase().includes(q);
        const matchDest = item.tripDestination.toLowerCase().includes(q);
        const matchLoc = item.locationName?.toLowerCase().includes(q);
        const matchNotes = item.notes?.toLowerCase().includes(q);
        const matchCategory = CATEGORY_NAMES[item.category]?.toLowerCase().includes(q);
        if (!matchTitle && !matchTrip && !matchDest && !matchLoc && !matchNotes && !matchCategory) {
          return false;
        }
      }

      // Year filter
      if (selectedYear !== 'all') {
        if (!item.date.startsWith(selectedYear)) return false;
      }

      // Category filter
      if (selectedCategory !== 'all') {
        if (item.category !== selectedCategory) return false;
      }

      // Destination filter
      if (selectedDestination !== 'all') {
        if (!item.tripDestination.includes(selectedDestination)) return false;
      }

      return true;
    });
  }, [allFlattenedSpots, searchQuery, selectedYear, selectedCategory, selectedDestination]);

  // Map of date string "YYYY-MM-DD" to list of spots for the calendar
  const spotsByDateMap = useMemo(() => {
    const map = new Map<string, FlattenedSpotMemory[]>();
    allFlattenedSpots.forEach((spot) => {
      const existing = map.get(spot.date) || [];
      existing.push(spot);
      map.set(spot.date, existing);
    });
    return map;
  }, [allFlattenedSpots]);

  // Trips active on each date for calendar footprint visualization
  const tripsByDateMap = useMemo(() => {
    const map = new Map<string, { trip: Trip; dayNumber: number }>();
    trips.forEach((tr) => {
      (tr.days || []).forEach((d) => {
        if (d.date) {
          map.set(d.date, { trip: tr, dayNumber: d.dayNumber });
        }
      });
    });
    return map;
  }, [trips]);

  // Days in current calendar month
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1);
    const lastDayOfMonth = new Date(calendarYear, calendarMonth + 1, 0);
    const startWeekday = firstDayOfMonth.getDay(); // 0 is Sunday
    const totalDays = lastDayOfMonth.getDate();

    const days: {
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      spots: FlattenedSpotMemory[];
      tripInfo?: { trip: Trip; dayNumber: number };
    }[] = [];

    // Preceding empty/overflow days
    for (let i = 0; i < startWeekday; i++) {
      const prevDate = new Date(calendarYear, calendarMonth, 1 - (startWeekday - i));
      const y = prevDate.getFullYear();
      const m = String(prevDate.getMonth() + 1).padStart(2, '0');
      const d = String(prevDate.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      days.push({
        dateStr,
        dayNumber: prevDate.getDate(),
        isCurrentMonth: false,
        spots: spotsByDateMap.get(dateStr) || [],
        tripInfo: tripsByDateMap.get(dateStr),
      });
    }

    // Days in this month
    for (let d = 1; d <= totalDays; d++) {
      const y = calendarYear;
      const m = String(calendarMonth + 1).padStart(2, '0');
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${y}-${m}-${dayStr}`;
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        spots: spotsByDateMap.get(dateStr) || [],
        tripInfo: tripsByDateMap.get(dateStr),
      });
    }

    // Trailing days to complete the 7-column grid
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(calendarYear, calendarMonth + 1, i);
      const y = nextDate.getFullYear();
      const m = String(nextDate.getMonth() + 1).padStart(2, '0');
      const dayStr = String(nextDate.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${dayStr}`;
      days.push({
        dateStr,
        dayNumber: nextDate.getDate(),
        isCurrentMonth: false,
        spots: spotsByDateMap.get(dateStr) || [],
        tripInfo: tripsByDateMap.get(dateStr),
      });
    }

    return days;
  }, [calendarYear, calendarMonth, spotsByDateMap, tripsByDateMap]);

  // Spots for selected calendar date
  const selectedDateSpots = useMemo(() => {
    if (!selectedCalendarDate) return [];
    return spotsByDateMap.get(selectedCalendarDate) || [];
  }, [selectedCalendarDate, spotsByDateMap]);

  const selectedDateTripInfo = useMemo(() => {
    if (!selectedCalendarDate) return null;
    return tripsByDateMap.get(selectedCalendarDate) || null;
  }, [selectedCalendarDate, tripsByDateMap]);

  // Group filtered spots by Year and Trip for the Timeline Story Wall
  const timelineGrouped = useMemo(() => {
    const groups: {
      trip: Trip;
      days: {
        dayNumber: number;
        date: string;
        spots: FlattenedSpotMemory[];
      }[];
    }[] = [];

    // Identify which trips have matching spots
    const tripMap = new Map<string, Map<number, FlattenedSpotMemory[]>>();

    filteredSpots.forEach((spot) => {
      if (!tripMap.has(spot.tripId)) {
        tripMap.set(spot.tripId, new Map());
      }
      const dayMap = tripMap.get(spot.tripId)!;
      const list = dayMap.get(spot.dayNumber) || [];
      list.push(spot);
      dayMap.set(spot.dayNumber, list);
    });

    trips.forEach((tr) => {
      if (tripMap.has(tr.id)) {
        const dayMap = tripMap.get(tr.id)!;
        const sortedDayNumbers = Array.from(dayMap.keys()).sort((a, b) => a - b);
        const days = sortedDayNumbers.map((dn) => {
          const spots = dayMap.get(dn)!;
          const date = spots[0]?.date || '';
          return { dayNumber: dn, date, spots };
        });
        groups.push({ trip: tr, days });
      }
    });

    return groups;
  }, [filteredSpots, trips]);

  // Month navigation handlers
  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarYear((prev) => prev - 1);
      setCalendarMonth(11);
    } else {
      setCalendarMonth((prev) => prev - 1);
    }
    setSelectedCalendarDate(null);
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarYear((prev) => prev + 1);
      setCalendarMonth(0);
    } else {
      setCalendarMonth((prev) => prev + 1);
    }
    setSelectedCalendarDate(null);
  };

  const handleCopyShareText = () => {
    const text = `🗾【我的旅行手帳足跡】\n✈️ 累積旅程：${stats.totalTrips} 趟\n📅 漫遊天數：${stats.totalDays} 天\n📍 走訪景點：${stats.totalSpots} 處\n📸 珍藏回憶：${stats.totalPhotos} 張照片\n\n— 紀錄於 日和手帳 Hiyori`;
    navigator.clipboard?.writeText(text);
    setCopiedShareText(true);
    setTimeout(() => setCopiedShareText(false), 2500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-2 sm:p-4 overflow-hidden"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl h-[92vh] max-h-[860px] rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/90 dark:border-slate-800 text-slate-800 dark:text-slate-100 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Compass className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate flex items-center gap-2">
                <span>跨旅程回憶與足跡時光庫</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800 hidden sm:inline-flex">
                  {trips.length} 趟旅程 · {stats.totalSpots} 個足跡點
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                穿梭歷年所有旅行點滴 · 月曆足跡與時光故事軸
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* View Mode Toggle Button Group */}
            <div className="flex items-center p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'calendar'
                    ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-200 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">月曆足跡</span>
                <span className="sm:hidden">月曆</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('timeline')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'timeline'
                    ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-200 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Route className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">時光軸故事牆</span>
                <span className="sm:hidden">故事軸</span>
              </button>
            </div>

            {/* Passport Milestone Card Button */}
            <button
              type="button"
              onClick={() => setShowPassportCard(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-xs border border-amber-500/30 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="查看旅行足跡里程碑卡"
            >
              <Award className="w-4 h-4 text-amber-500" />
              <span className="hidden md:inline">旅行足跡卡</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
              title="關閉"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Multi-dimension Filter Bar */}
        <div className="px-4 sm:px-6 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          {/* Universal Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋景點、城市、美食、住宿、隨行筆記..."
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 outline-none focus:border-teal-500 dark:focus:border-teal-400 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Year Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 shrink-0">
            <span className="text-[11px] font-bold text-slate-400 shrink-0 flex items-center gap-1">
              <Filter className="w-3 h-3" />
              <span>年份:</span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedYear('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition shrink-0 cursor-pointer ${
                selectedYear === 'all'
                  ? 'bg-teal-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
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
                  const num = parseInt(yr, 10);
                  if (!isNaN(num)) setCalendarYear(num);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition shrink-0 cursor-pointer ${
                  selectedYear === yr
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {yr}年
              </button>
            ))}

            {/* Quick Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-2 py-1 text-[11px] rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
            >
              <option value="all">所有類別</option>
              {Object.entries(CATEGORY_NAMES).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Content Area: Calendar View OR Timeline View */}
        <div className="flex-1 overflow-y-auto min-h-0 bg-slate-50/50 dark:bg-slate-950/40 p-3 sm:p-5">
          {viewMode === 'calendar' ? (
            /* ================= VIEW 1: 月曆足跡視角 ================= */
            <div className="space-y-4 max-w-4xl mx-auto">
              {/* Calendar Month Header & Month Stepper */}
              <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                    title="上個月"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                      {calendarYear} 年 {calendarMonth + 1} 月
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      點選標記日曆格子，即可查看當日所有景點與留影
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                    title="下個月"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                {/* Quick Trip Jump */}
                <div className="flex items-center gap-1.5">
                  {trips.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const tr = trips.find((t) => t.id === currentTripId) || trips[0];
                        if (tr.startDate) {
                          setCalendarYear(parseInt(tr.startDate.slice(0, 4), 10));
                          setCalendarMonth(parseInt(tr.startDate.slice(5, 7), 10) - 1);
                          setSelectedCalendarDate(tr.startDate);
                        }
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 rounded-lg hover:bg-teal-100 transition cursor-pointer"
                    >
                      跳至目前旅程
                    </button>
                  )}
                </div>
              </div>

              {/* 7-column Calendar Grid */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
                {/* Weekday Row */}
                <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-center py-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  <span className="text-rose-500">週日</span>
                  <span>週一</span>
                  <span>週二</span>
                  <span>週三</span>
                  <span>週四</span>
                  <span>週五</span>
                  <span className="text-teal-600 dark:text-teal-400">週六</span>
                </div>

                {/* Day Cells */}
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
                        className={`min-h-[58px] sm:min-h-[85px] p-1 sm:p-2 transition flex flex-col justify-between ${
                          !cell.isCurrentMonth
                            ? 'opacity-30 bg-slate-50/30 dark:bg-slate-900/30'
                            : ''
                        } ${
                          hasTrip
                            ? 'bg-teal-50/50 dark:bg-teal-950/20 hover:bg-teal-100/60 dark:hover:bg-teal-900/40 cursor-pointer'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                        } ${
                          isSelected
                            ? 'ring-2 ring-teal-500 bg-teal-100/70 dark:bg-teal-900/60'
                            : ''
                        }`}
                      >
                        {/* Day number & indicators */}
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-bold font-mono ${
                              hasTrip
                                ? 'text-teal-900 dark:text-teal-200'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {cell.dayNumber}
                          </span>
                          {hasPhotos && (
                            <Camera className="w-3 h-3 text-rose-500 shrink-0" />
                          )}
                        </div>

                        {/* Trip & Spot summary pill */}
                        {hasTrip && cell.tripInfo && (
                          <div className="mt-0.5 sm:mt-1 space-y-0.5 overflow-hidden">
                            <div className="text-[9px] sm:text-[10px] font-bold text-teal-800 dark:text-teal-200 truncate leading-tight">
                              {cell.tripInfo.trip.destination || cell.tripInfo.trip.title}
                            </div>
                            <div className="text-[8px] sm:text-[9px] text-teal-600 dark:text-teal-400 flex items-center gap-1 font-mono">
                              <span>D{cell.tripInfo.dayNumber}</span>
                              {spotCount > 0 && <span>· {spotCount}點</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Selected Day Footprint Details Sheet / Panel */}
              {selectedCalendarDate && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-teal-500/40 shadow-lg space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                          {formatDateSlash(selectedCalendarDate)} ({getDayOfWeek(selectedCalendarDate, lang)})
                        </span>
                        {selectedDateTripInfo && (
                          <span className="px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 text-[10px] font-bold border border-teal-200/60 dark:border-teal-800">
                            【{selectedDateTripInfo.trip.title}】第 {selectedDateTripInfo.dayNumber} 天
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        當日共排定 {selectedDateSpots.length} 個景點活動
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedDateTripInfo && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectTrip(selectedDateTripInfo.trip.id);
                            onClose();
                          }}
                          className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1 transition shadow-xs cursor-pointer"
                        >
                          <span>進入此行程規劃</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedCalendarDate(null)}
                        className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Spot cards for the selected day */}
                  {selectedDateSpots.length === 0 ? (
                    <p className="text-xs text-slate-400 py-3 text-center">
                      當天為旅程休息日或無行程項目
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {selectedDateSpots.map((spot) => (
                        <div
                          key={spot.spotId}
                          className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                {spot.startTime && (
                                  <span className="font-mono font-bold text-teal-600 dark:text-teal-400">
                                    {spot.startTime}
                                  </span>
                                )}
                                <span>·</span>
                                <span>{CATEGORY_NAMES[spot.category]}</span>
                                {spot.mood && <span>· {spot.mood}</span>}
                              </div>
                              <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate mt-0.5">
                                {spot.spotTitle}
                              </h4>
                            </div>

                            {spot.googlePhotosUrl && (
                              <a
                                href={spot.googlePhotosUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-300 text-[10px] font-bold flex items-center gap-1 hover:underline shrink-0"
                              >
                                <span>相簿</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>

                          {spot.locationName && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{spot.locationName}</span>
                            </p>
                          )}

                          {spot.notes && (
                            <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2 bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700/50">
                              {spot.notes}
                            </p>
                          )}

                          {/* Photos thumbnails */}
                          {spot.photos.length > 0 && (
                            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                              {spot.photos.map((imgUrl, i) => (
                                <img
                                  key={i}
                                  src={imgUrl}
                                  alt={spot.spotTitle}
                                  onClick={() =>
                                    setLightboxImage({
                                      url: imgUrl,
                                      spotTitle: spot.spotTitle,
                                      tripTitle: spot.tripTitle,
                                      date: spot.date,
                                      caption: spot.notes,
                                      googlePhotosUrl: spot.googlePhotosUrl,
                                    })
                                  }
                                  className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-slate-700 cursor-pointer hover:scale-105 transition shadow-2xs shrink-0"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ================= VIEW 2: 時光軸回憶故事牆 ================= */
            <div className="space-y-6 max-w-4xl mx-auto">
              {timelineGrouped.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                    <Search className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300">
                    找不到符合條件的旅程回憶
                  </h4>
                  <p className="text-xs text-slate-400">
                    請嘗試更換搜尋關鍵字或清除篩選條件
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedYear('all');
                      setSelectedCategory('all');
                      setSelectedDestination('all');
                    }}
                    className="mt-2 px-3.5 py-1.5 bg-teal-600 text-white rounded-xl font-bold text-xs cursor-pointer"
                  >
                    重設所有篩選
                  </button>
                </div>
              ) : (
                timelineGrouped.map(({ trip, days }) => (
                  <div
                    key={trip.id}
                    className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs space-y-4"
                  >
                    {/* Trip Chapter Header Banner */}
                    <div
                      className={`p-4 sm:p-5 text-white bg-gradient-to-r ${
                        trip.coverGradient || 'from-teal-700 via-teal-800 to-emerald-900'
                      } flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
                    >
                      <div>
                        <div className="flex items-center gap-2 text-xs text-teal-100 font-medium">
                          <span>{formatDateSlash(trip.startDate)} ~ {formatDateSlash(trip.endDate)}</span>
                          <span>·</span>
                          <span>{trip.destination}</span>
                        </div>
                        <h3 className="font-black text-base sm:text-xl tracking-tight mt-0.5">
                          {trip.title}
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onSelectTrip(trip.id);
                          onClose();
                        }}
                        className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 border border-white/20 cursor-pointer shrink-0"
                      >
                        <span>進入此趟行程</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Days and Spots along the Timeline */}
                    <div className="p-4 sm:p-5 space-y-6">
                      {days.map((day) => (
                        <div key={day.dayNumber} className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-teal-600" />
                            <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                              第 {day.dayNumber} 天 ({formatDateSlash(day.date)})
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {day.spots.length} 個行程點
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-3 sm:pl-4 border-l-2 border-slate-100 dark:border-slate-800">
                            {day.spots.map((spot) => (
                              <div
                                key={spot.spotId}
                                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex flex-col justify-between gap-2.5 hover:shadow-xs transition"
                              >
                                <div>
                                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                                    <span className="font-bold font-mono text-teal-600 dark:text-teal-400">
                                      {spot.startTime || '隨行'}
                                    </span>
                                    <span>{CATEGORY_NAMES[spot.category]}</span>
                                  </div>

                                  <h4 className="font-bold text-sm text-slate-900 dark:text-white mt-1">
                                    {spot.spotTitle}
                                  </h4>

                                  {spot.locationName && (
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span className="truncate">{spot.locationName}</span>
                                    </p>
                                  )}

                                  {spot.notes && (
                                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-2 bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700/60 leading-relaxed">
                                      {spot.notes}
                                    </p>
                                  )}
                                </div>

                                {/* Photo Grid */}
                                {spot.photos.length > 0 && (
                                  <div className="flex items-center gap-2 overflow-x-auto py-1">
                                    {spot.photos.map((photoUrl, pIdx) => (
                                      <div
                                        key={pIdx}
                                        onClick={() =>
                                          setLightboxImage({
                                            url: photoUrl,
                                            spotTitle: spot.spotTitle,
                                            tripTitle: spot.tripTitle,
                                            date: spot.date,
                                            caption: spot.notes,
                                            googlePhotosUrl: spot.googlePhotosUrl,
                                          })
                                        }
                                        className="relative group shrink-0 cursor-pointer"
                                      >
                                        <img
                                          src={photoUrl}
                                          alt={spot.spotTitle}
                                          className="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shadow-2xs group-hover:scale-105 transition"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* ================= MODAL: 旅行足跡里程碑手帳成就卡 ================= */}
      {showPassportCard && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setShowPassportCard(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 relative text-slate-800 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  我的日和手帳 · 旅行足跡成就卡
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPassportCard(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Passport Card Body */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-teal-700 via-teal-800 to-emerald-950 text-white space-y-4 shadow-inner relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] tracking-widest text-teal-200 uppercase font-mono">
                    HIYORI TRAVEL FOOTPRINTS
                  </span>
                  <h4 className="font-black text-lg">一生旅路探索證件</h4>
                </div>
                <div className="w-10 h-10 rounded-full border-2 border-teal-300/40 flex items-center justify-center text-teal-200 font-mono text-xs font-bold">
                  PASS
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3 pt-2 text-left">
                <div className="bg-white/10 backdrop-blur-md p-2.5 rounded-xl border border-white/10">
                  <span className="text-[10px] text-teal-200 block">累積探索旅程</span>
                  <strong className="text-xl font-bold font-mono">{stats.totalTrips}</strong> 趟
                </div>
                <div className="bg-white/10 backdrop-blur-md p-2.5 rounded-xl border border-white/10">
                  <span className="text-[10px] text-teal-200 block">漫遊旅途天數</span>
                  <strong className="text-xl font-bold font-mono">{stats.totalDays}</strong> 天
                </div>
                <div className="bg-white/10 backdrop-blur-md p-2.5 rounded-xl border border-white/10">
                  <span className="text-[10px] text-teal-200 block">打卡景點總數</span>
                  <strong className="text-xl font-bold font-mono">{stats.totalSpots}</strong> 處
                </div>
                <div className="bg-white/10 backdrop-blur-md p-2.5 rounded-xl border border-white/10">
                  <span className="text-[10px] text-teal-200 block">珍藏回憶照片</span>
                  <strong className="text-xl font-bold font-mono">{stats.totalPhotos}</strong> 張
                </div>
              </div>

              {/* Destinations Stamp Row */}
              <div className="pt-2 border-t border-white/15">
                <span className="text-[10px] text-teal-200 block mb-1">已點亮旅行目的地：</span>
                <p className="text-xs font-semibold text-white/90">
                  {Array.from(
                    new Set(trips.map((t) => t.destination).filter(Boolean))
                  ).join(' · ') || '自由行探索中'}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleCopyShareText}
                className="flex-1 py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-xs cursor-pointer"
              >
                {copiedShareText ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                <span>{copiedShareText ? '已複製足跡文字！' : '複製足跡文案分享'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPassportCard(false)}
                className="py-2 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= LIGHTBOX: 照片大圖檢視 ================= */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-150"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="max-w-2xl max-h-[85vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImage.url}
              alt={lightboxImage.spotTitle || 'Memory'}
              className="max-w-full max-h-[70vh] rounded-2xl object-contain shadow-2xl"
            />
            <div className="bg-slate-900/90 text-white p-3 rounded-2xl border border-slate-700/80 max-w-md w-full flex items-center justify-between text-xs backdrop-blur-md">
              <div className="truncate pr-2">
                <p className="font-bold truncate">{lightboxImage.spotTitle}</p>
                <p className="text-[11px] text-slate-300 truncate">
                  {lightboxImage.tripTitle} · {lightboxImage.date}
                </p>
                {lightboxImage.caption && (
                  <p className="text-[11px] text-teal-300 mt-1">{lightboxImage.caption}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {lightboxImage.googlePhotosUrl && (
                  <a
                    href={lightboxImage.googlePhotosUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white flex items-center gap-1 text-[11px]"
                  >
                    <span>Google 相簿</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
