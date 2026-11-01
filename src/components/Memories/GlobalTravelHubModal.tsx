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
  BarChart3,
  Sparkles,
  Trophy,
  Building2,
  TrendingUp,
  Copy,
  Landmark,
  Utensils,
  Train,
  Hotel,
  ShoppingBag,
  Footprints,
  Circle,
  CheckCircle2,
} from 'lucide-react';

interface GlobalTravelHubModalProps {
  trips: Trip[];
  currentTripId: string;
  lang: Language;
  onSelectTrip: (tripId: string, targetSpotId?: string) => void;
  onUpdateTrip?: (updatedTrip: Trip) => void;
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
  completed: boolean;
}

const CATEGORY_NAMES: Record<CategoryType, string> = {
  spot: '景點觀光',
  food: '美食品嚐',
  transport: '交通移動',
  hotel: '住宿飯店',
  shopping: '購物採買',
  activity: '體驗活動',
  other: '其他行程',
};

const CATEGORY_ICONS: Record<CategoryType, React.ComponentType<{ className?: string }>> = {
  spot: Landmark,
  food: Utensils,
  transport: Train,
  hotel: Hotel,
  shopping: ShoppingBag,
  activity: Footprints,
  other: Circle,
};

// High contrast WCAG AA compliant colors for dark and light themes
const CATEGORY_COLORS: Record<
  CategoryType,
  { bg: string; border: string; text: string; iconColor: string; bar: string }
> = {
  spot: {
    bg: 'bg-teal-50/70 dark:bg-teal-950/40',
    border: 'border-teal-200/90 dark:border-teal-800/70',
    text: 'text-teal-900 dark:text-teal-200',
    iconColor: 'text-teal-700 dark:text-teal-400',
    bar: 'bg-teal-600 dark:bg-teal-400',
  },
  food: {
    bg: 'bg-amber-50/70 dark:bg-amber-950/40',
    border: 'border-amber-200/90 dark:border-amber-800/70',
    text: 'text-amber-900 dark:text-amber-200',
    iconColor: 'text-amber-700 dark:text-amber-400',
    bar: 'bg-amber-600 dark:bg-amber-400',
  },
  transport: {
    bg: 'bg-sky-50/70 dark:bg-sky-950/40',
    border: 'border-sky-200/90 dark:border-sky-800/70',
    text: 'text-sky-900 dark:text-sky-200',
    iconColor: 'text-sky-700 dark:text-sky-400',
    bar: 'bg-sky-600 dark:bg-sky-400',
  },
  hotel: {
    bg: 'bg-indigo-50/70 dark:bg-indigo-950/40',
    border: 'border-indigo-200/90 dark:border-indigo-800/70',
    text: 'text-indigo-900 dark:text-indigo-200',
    iconColor: 'text-indigo-700 dark:text-indigo-400',
    bar: 'bg-indigo-600 dark:bg-indigo-400',
  },
  shopping: {
    bg: 'bg-rose-50/70 dark:bg-rose-950/40',
    border: 'border-rose-200/90 dark:border-rose-800/70',
    text: 'text-rose-900 dark:text-rose-200',
    iconColor: 'text-rose-700 dark:text-rose-400',
    bar: 'bg-rose-600 dark:bg-rose-400',
  },
  activity: {
    bg: 'bg-emerald-50/70 dark:bg-emerald-950/40',
    border: 'border-emerald-200/90 dark:border-emerald-800/70',
    text: 'text-emerald-900 dark:text-emerald-200',
    iconColor: 'text-emerald-700 dark:text-emerald-400',
    bar: 'bg-emerald-600 dark:bg-emerald-400',
  },
  other: {
    bg: 'bg-slate-100/70 dark:bg-slate-800/40',
    border: 'border-slate-200/90 dark:border-slate-700/70',
    text: 'text-slate-900 dark:text-slate-200',
    iconColor: 'text-slate-700 dark:text-slate-400',
    bar: 'bg-slate-600 dark:bg-slate-400',
  },
};

export const GlobalTravelHubModal: React.FC<GlobalTravelHubModalProps> = ({
  trips,
  currentTripId,
  lang,
  onSelectTrip,
  onUpdateTrip,
  onClose,
}) => {
  useBodyScrollLock(true);
  const t = TRANSLATIONS[lang];

  // Active view mode: 'calendar', 'timeline', or 'review'
  const [viewMode, setViewMode] = useState<'calendar' | 'timeline' | 'review'>('calendar');

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedTripFilter, setSelectedTripFilter] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDestination, setSelectedDestination] = useState<string>('all');

  // Filter completed/visited spots only vs all planned spots (Default: true)
  const [filterCompletedOnly, setFilterCompletedOnly] = useState<boolean>(true);

  // Toggle spot visited status from Global Hub
  const handleToggleSpotVisited = (tripId: string, dayNumber: number, spotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onUpdateTrip) return;
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

  // 1. Strictly deduplicate trips by ID to prevent duplicate trip rendering
  const uniqueTrips = useMemo(() => {
    const map = new Map<string, Trip>();
    (trips || []).forEach((t) => {
      if (t && t.id && !map.has(t.id)) {
        map.set(t.id, t);
      }
    });
    return Array.from(map.values());
  }, [trips]);

  // Annual Review filter states
  const [reviewYear, setReviewYear] = useState<string>(() => {
    const active = uniqueTrips.find((t) => t.id === currentTripId);
    if (active?.startDate && active.startDate.length >= 4) {
      return active.startDate.slice(0, 4);
    }
    if (uniqueTrips.length > 0 && uniqueTrips[0].startDate && uniqueTrips[0].startDate.length >= 4) {
      return uniqueTrips[0].startDate.slice(0, 4);
    }
    return new Date().getFullYear().toString();
  });
  const [reviewSelectedMonth, setReviewSelectedMonth] = useState<number | null>(null);
  const [copiedReviewReport, setCopiedReviewReport] = useState(false);

  // Calendar navigation state
  const [calendarYear, setCalendarYear] = useState<number>(() => {
    const active = uniqueTrips.find((t) => t.id === currentTripId);
    if (active?.startDate && active.startDate.length >= 4) {
      const y = parseInt(active.startDate.slice(0, 4), 10);
      if (!isNaN(y)) return y;
    }
    if (uniqueTrips.length > 0 && uniqueTrips[0].startDate) {
      const y = parseInt(uniqueTrips[0].startDate.slice(0, 4), 10);
      if (!isNaN(y)) return y;
    }
    return new Date().getFullYear();
  });

  const [calendarMonth, setCalendarMonth] = useState<number>(() => {
    const active = uniqueTrips.find((t) => t.id === currentTripId);
    if (active?.startDate && active.startDate.length >= 7) {
      const m = parseInt(active.startDate.slice(5, 7), 10);
      if (!isNaN(m)) return m - 1; // 0-indexed
    }
    if (uniqueTrips.length > 0 && uniqueTrips[0].startDate) {
      const m = parseInt(uniqueTrips[0].startDate.slice(5, 7), 10);
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

  // Flatten all spots across unique trips with strict spotId deduplication
  const allFlattenedSpots = useMemo(() => {
    const list: FlattenedSpotMemory[] = [];
    const seenSpotKeys = new Set<string>();

    uniqueTrips.forEach((trip) => {
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
          const spotKey = `${trip.id}::${day.dayNumber}::${spot.id}`;
          if (seenSpotKeys.has(spotKey)) return;
          seenSpotKeys.add(spotKey);

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
            completed: !!spot.completed,
          });
        });
      });
    });

    return list;
  }, [uniqueTrips]);

  // Active spots according to filterCompletedOnly (Default: true -> only checked or photographed spots)
  const displaySpots = useMemo(() => {
    if (!filterCompletedOnly) return allFlattenedSpots;
    return allFlattenedSpots.filter(
      (s) => s.completed || s.photos.length > 0 || !!s.googlePhotosUrl
    );
  }, [allFlattenedSpots, filterCompletedOnly]);

  // Extract available years
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    uniqueTrips.forEach((tr) => {
      if (tr.startDate && tr.startDate.length >= 4) {
        years.add(tr.startDate.slice(0, 4));
      }
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [uniqueTrips]);

  // Overall Travel Milestone Statistics (reflects displaySpots)
  const stats = useMemo(() => {
    const totalTrips = uniqueTrips.length;
    const uniqueDates = new Set<string>();
    const uniqueDestinations = new Set<string>();
    let totalSpots = 0;
    let totalPhotos = 0;

    displaySpots.forEach((s) => {
      totalSpots++;
      totalPhotos += s.photos.length;
      if (s.date) uniqueDates.add(s.date);
      if (s.tripDestination) uniqueDestinations.add(s.tripDestination.trim());
    });

    return {
      totalTrips,
      totalDays: uniqueDates.size || uniqueTrips.reduce((acc, t) => acc + (t.days?.length || 1), 0),
      totalDestinations: uniqueDestinations.size,
      totalSpots,
      totalPhotos,
    };
  }, [uniqueTrips, displaySpots]);

  // ================= CONSOLIDATED HIGH-PERFORMANCE ANNUAL REVIEW AGGREGATOR =================
  // Computes all metrics, categories, cities, monthly heatmaps, and per-trip indexes in a single pass O(N)
  const annualReviewData = useMemo(() => {
    // 1. Pre-filter relevant trips
    const matchedTrips: Trip[] = [];
    const matchedTripIdSet = new Set<string>();

    uniqueTrips.forEach((t) => {
      if (reviewYear === 'all') {
        matchedTrips.push(t);
        matchedTripIdSet.add(t.id);
        return;
      }
      const startY = t.startDate?.slice(0, 4);
      const endY = t.endDate?.slice(0, 4);
      const hasMatchingDay = (t.days || []).some((d) => d.date?.startsWith(reviewYear));
      if (startY === reviewYear || endY === reviewYear || hasMatchingDay) {
        matchedTrips.push(t);
        matchedTripIdSet.add(t.id);
      }
    });

    // 2. Pre-filter spots belonging to this period & build per-trip spot/photo index for O(1) lookups
    const matchedSpots: FlattenedSpotMemory[] = [];
    const tripSpotMap = new Map<string, { spots: FlattenedSpotMemory[]; photosCount: number }>();
    matchedTrips.forEach((t) => {
      tripSpotMap.set(t.id, { spots: [], photosCount: 0 });
    });

    displaySpots.forEach((s) => {
      const match =
        reviewYear === 'all'
          ? true
          : (s.date && s.date.startsWith(reviewYear)) ||
            (s.tripStartDate && s.tripStartDate.startsWith(reviewYear));

      if (match) {
        matchedSpots.push(s);
        const record = tripSpotMap.get(s.tripId);
        if (record) {
          record.spots.push(s);
          record.photosCount += s.photos.length;
        }
      }
    });

    // 3. Single-pass metric accumulator
    const uniqueDates = new Set<string>();
    const cityMap = new Map<
      string,
      { city: string; spotsCount: number; trips: Set<string>; photos: string[] }
    >();
    const categoryCounts: Record<CategoryType, number> = {
      spot: 0,
      food: 0,
      transport: 0,
      hotel: 0,
      shopping: 0,
      activity: 0,
      other: 0,
    };

    // 12 months array
    const months = Array.from({ length: 12 }, (_, i) => {
      const mNum = i + 1;
      return {
        month: mNum,
        name: `${mNum}月`,
        uniqueDates: new Set<string>(),
        spotsCount: 0,
        tripsSet: new Set<string>(),
        spots: [] as FlattenedSpotMemory[],
      };
    });

    // Accumulate unique travel dates & monthly trips based on filterCompletedOnly
    if (filterCompletedOnly) {
      matchedSpots.forEach((s) => {
        if (!s.date) return;
        const [y, m] = s.date.split('-');
        if (reviewYear !== 'all' && y !== reviewYear) return;

        uniqueDates.add(s.date);
        const mIdx = parseInt(m, 10) - 1;
        if (mIdx >= 0 && mIdx < 12) {
          months[mIdx].uniqueDates.add(s.date);
          months[mIdx].tripsSet.add(s.tripId);
        }
      });
    } else {
      matchedTrips.forEach((tr) => {
        (tr.days || []).forEach((d) => {
          if (!d.date) return;
          const [y, m] = d.date.split('-');
          if (reviewYear !== 'all' && y !== reviewYear) return;

          uniqueDates.add(d.date);
          const mIdx = parseInt(m, 10) - 1;
          if (mIdx >= 0 && mIdx < 12) {
            months[mIdx].uniqueDates.add(d.date);
            months[mIdx].tripsSet.add(tr.id);
          }
        });
      });
    }

    // Accumulate spots, categories, cities, and monthly spots in one pass
    matchedSpots.forEach((s) => {
      // Category count
      const cat = s.category || 'spot';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

      // City count
      const city = s.tripDestination?.trim() || '自由行';
      let cRecord = cityMap.get(city);
      if (!cRecord) {
        cRecord = {
          city,
          spotsCount: 0,
          trips: new Set([s.tripTitle]),
          photos: [],
        };
        cityMap.set(city, cRecord);
      } else {
        cRecord.trips.add(s.tripTitle);
      }
      cRecord.spotsCount++;
      if (s.photos && s.photos.length > 0 && cRecord.photos.length < 3) {
        cRecord.photos.push(...s.photos.slice(0, 3 - cRecord.photos.length));
      }

      // Monthly spots
      if (s.date) {
        const [y, m] = s.date.split('-');
        if (reviewYear === 'all' || y === reviewYear) {
          const mIdx = parseInt(m, 10) - 1;
          if (mIdx >= 0 && mIdx < 12) {
            months[mIdx].spotsCount++;
            months[mIdx].spots.push(s);
          }
        }
      }
    });

    // Compute cities summary array with percentages
    const totalSpots = matchedSpots.length;
    const citiesSummary = Array.from(cityMap.values())
      .sort((a, b) => b.spotsCount - a.spotsCount)
      .map((item) => ({
        ...item,
        sharePercent: totalSpots > 0 ? Math.round((item.spotsCount / totalSpots) * 100) : 0,
      }));

    // Populate monthly summary
    const populatedMonths = months.map((m) => ({
      month: m.month,
      name: m.name,
      daysCount: m.uniqueDates.size,
      spotsCount: m.spotsCount,
      tripsTotal: m.tripsSet.size,
      spots: m.spots,
    }));

    const activeMonths = populatedMonths.filter((m) => m.daysCount > 0 || m.spotsCount > 0);
    const mostVisited = [...activeMonths].sort((a, b) => {
      if (b.daysCount !== a.daysCount) return b.daysCount - a.daysCount;
      return b.spotsCount - a.spotsCount;
    })[0] || null;

    const maxDays = Math.max(...populatedMonths.map((m) => m.daysCount), 1);
    const maxSpots = Math.max(...populatedMonths.map((m) => m.spotsCount), 1);

    const totalPhotosCount = matchedSpots.reduce((acc, s) => acc + s.photos.length, 0);

    return {
      reviewTrips: matchedTrips,
      reviewSpots: matchedSpots,
      citiesSummary,
      categoryCounts,
      monthlyStats: {
        months: populatedMonths,
        mostVisited,
        maxDays,
        maxSpots,
      },
      totalTravelDays: uniqueDates.size,
      totalPhotosCount,
      tripSpotMap,
    };
  }, [uniqueTrips, allFlattenedSpots, reviewYear]);

  // Spots for selected review month drill-down
  const selectedMonthSpots = useMemo(() => {
    if (reviewSelectedMonth === null) return [];
    const targetMonth = annualReviewData.monthlyStats.months.find(
      (m) => m.month === reviewSelectedMonth
    );
    return targetMonth?.spots || [];
  }, [reviewSelectedMonth, annualReviewData.monthlyStats.months]);

  // Review copy report handler
  const handleCopyReviewReport = () => {
    const yearLabel = reviewYear === 'all' ? '歷年全部' : `${reviewYear} 年度`;
    const citiesStr = annualReviewData.citiesSummary.map((c) => `${c.city} (${c.spotsCount}處)`).join('、') || '無紀錄';
    const topMonthStr = annualReviewData.monthlyStats.mostVisited
      ? `${annualReviewData.monthlyStats.mostVisited.name}（出遊 ${annualReviewData.monthlyStats.mostVisited.daysCount} 天 · 走訪 ${annualReviewData.monthlyStats.mostVisited.spotsCount} 個行程點）`
      : '無';

    const text = `✨【日和手帳 · ${yearLabel}旅行回顧戰報】✨\n` +
      `📅 漫遊總天數：${annualReviewData.totalTravelDays} 天\n` +
      `✈️ 累積旅程：${annualReviewData.reviewTrips.length} 趟\n` +
      `🏙️ 造訪城市：${annualReviewData.citiesSummary.length} 個（${citiesStr}）\n` +
      `📍 景點打卡總數：${annualReviewData.reviewSpots.length} 處\n` +
      `   · 景點觀光：${annualReviewData.categoryCounts.spot} 處\n` +
      `   · 美食品嚐：${annualReviewData.categoryCounts.food} 處\n` +
      `   · 交通移動：${annualReviewData.categoryCounts.transport} 次\n` +
      `   · 住宿飯店：${annualReviewData.categoryCounts.hotel} 晚\n` +
      `   · 購物血拼：${annualReviewData.categoryCounts.shopping} 處\n` +
      `   · 體驗活動：${annualReviewData.categoryCounts.activity} 次\n` +
      `👑 最常出遊月份：${topMonthStr}\n` +
      `\n— 紀錄於 日和手帳 Hiyori`;

    navigator.clipboard?.writeText(text);
    setCopiedReviewReport(true);
    setTimeout(() => setCopiedReviewReport(false), 2500);
  };

  // Filtered spots for Search in calendar and timeline modes
  const filteredSpots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return displaySpots.filter((item) => {
      // Trip selection filter
      if (selectedTripFilter !== 'all' && item.tripId !== selectedTripFilter) {
        return false;
      }

      if (q) {
        const matchTitle = item.spotTitle.toLowerCase().includes(q);
        const matchTrip = item.tripTitle.toLowerCase().includes(q);
        const matchDest = item.tripDestination.toLowerCase().includes(q);
        const matchLoc = (item.locationName || '').toLowerCase().includes(q);
        const matchNotes = (item.notes || '').toLowerCase().includes(q);
        if (!matchTitle && !matchTrip && !matchDest && !matchLoc && !matchNotes) {
          return false;
        }
      }

      if (selectedYear !== 'all') {
        const itemYear = item.date ? item.date.slice(0, 4) : item.tripStartDate.slice(0, 4);
        if (itemYear !== selectedYear) return false;
      }

      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }

      if (selectedDestination !== 'all' && item.tripDestination !== selectedDestination) {
        return false;
      }

      return true;
    });
  }, [displaySpots, searchQuery, selectedTripFilter, selectedYear, selectedCategory, selectedDestination]);

  // Calendar mapping: date string -> spots (strictly deduplicated on identical spotId or same tripId+title+startTime)
  const spotsByDateMap = useMemo(() => {
    const map = new Map<string, FlattenedSpotMemory[]>();
    filteredSpots.forEach((s) => {
      if (!s.date) return;
      const list = map.get(s.date) || [];
      const isDuplicate = list.some(
        (existing) =>
          existing.spotId === s.spotId ||
          (existing.tripId === s.tripId &&
            existing.spotTitle.trim() === s.spotTitle.trim() &&
            (existing.startTime || '') === (s.startTime || ''))
      );
      if (!isDuplicate) {
        list.push(s);
      }
      map.set(s.date, list);
    });
    return map;
  }, [filteredSpots]);

  // Trip ranges mapping: date string -> Trip info
  const tripsByDateMap = useMemo(() => {
    const map = new Map<string, { trip: Trip; dayNumber: number }>();
    uniqueTrips.forEach((tr) => {
      (tr.days || []).forEach((d) => {
        if (d.date) {
          map.set(d.date, { trip: tr, dayNumber: d.dayNumber });
        }
      });
    });
    return map;
  }, [uniqueTrips]);

  // Days in current calendar month
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1);
    const startingDayOfWeek = firstDayOfMonth.getDay();
    const lastDayOfMonth = new Date(calendarYear, calendarMonth + 1, 0);
    const totalDays = lastDayOfMonth.getDate();

    const days: {
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      spots: FlattenedSpotMemory[];
      tripInfo?: { trip: Trip; dayNumber: number };
    }[] = [];

    // Leading days from previous month
    const prevMonthLastDate = new Date(calendarYear, calendarMonth, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDate - i;
      const prevDate = new Date(calendarYear, calendarMonth - 1, d);
      const y = prevDate.getFullYear();
      const m = String(prevDate.getMonth() + 1).padStart(2, '0');
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${y}-${m}-${dayStr}`;
      days.push({
        dateStr,
        dayNumber: d,
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

    // Trailing days to complete 7-column grid
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

  // Selected date trips & spots grouped strictly by Trip
  const selectedDateTripGroups = useMemo(() => {
    if (!selectedCalendarDate) return [];
    const daySpots = spotsByDateMap.get(selectedCalendarDate) || [];
    if (daySpots.length === 0) return [];

    const groupMap = new Map<string, { trip: Trip; dayNumber: number; spots: FlattenedSpotMemory[] }>();

    daySpots.forEach((s) => {
      if (!groupMap.has(s.tripId)) {
        const foundTrip = uniqueTrips.find((t) => t.id === s.tripId);
        if (foundTrip) {
          groupMap.set(s.tripId, {
            trip: foundTrip,
            dayNumber: s.dayNumber,
            spots: [],
          });
        }
      }
      const group = groupMap.get(s.tripId);
      if (group) {
        if (!group.spots.some((existing) => existing.spotId === s.spotId || (existing.spotTitle.trim() === s.spotTitle.trim() && (existing.startTime || '') === (s.startTime || '')))) {
          group.spots.push(s);
        }
      }
    });

    return Array.from(groupMap.values());
  }, [selectedCalendarDate, spotsByDateMap, uniqueTrips]);

  // Total count of spots for the selected day across all trips
  const totalSelectedDaySpotsCount = useMemo(() => {
    return selectedDateTripGroups.reduce((acc, g) => acc + g.spots.length, 0);
  }, [selectedDateTripGroups]);

  // Group filtered spots by Year and Trip for Timeline Story Wall
  const timelineGrouped = useMemo(() => {
    const groups: {
      trip: Trip;
      days: {
        dayNumber: number;
        date: string;
        spots: FlattenedSpotMemory[];
      }[];
    }[] = [];

    const tripMap = new Map<string, Map<number, FlattenedSpotMemory[]>>();

    filteredSpots.forEach((spot) => {
      if (!tripMap.has(spot.tripId)) {
        tripMap.set(spot.tripId, new Map());
      }
      const dayMap = tripMap.get(spot.tripId)!;
      const list = dayMap.get(spot.dayNumber) || [];
      if (!list.some((existing) => existing.spotId === spot.spotId)) {
        list.push(spot);
      }
      dayMap.set(spot.dayNumber, list);
    });

    uniqueTrips.forEach((tr) => {
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
  }, [filteredSpots, uniqueTrips]);

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
                  {uniqueTrips.length} 趟旅程 · {stats.totalSpots} 個足跡點
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                穿梭歷年所有旅行點滴 · 月曆足跡、時光故事軸與年度回顧
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
              <button
                type="button"
                onClick={() => setViewMode('review')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'review'
                    ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-200 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">年度回顧</span>
                <span className="sm:hidden">回顧</span>
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

        {/* Search & Multi-dimension Filter Bar (for Calendar and Timeline views) */}
        {viewMode !== 'review' && (
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

            {/* Quick Filters */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 shrink-0">
              {/* Visited vs All Planned Toggle */}
              <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-[11px] font-bold shrink-0 border border-slate-200/80 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setFilterCompletedOnly(true)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                    filterCompletedOnly
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="僅呈現有打勾或有照片的實際造訪足跡"
                >
                  <Check className="w-3 h-3 stroke-[2.5]" />
                  <span>僅已造訪</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCompletedOnly(false)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                    !filterCompletedOnly
                      ? 'bg-slate-700 text-white dark:bg-slate-600 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="包含未打卡或預定行程"
                >
                  <span>全部預定</span>
                </button>
              </div>

              {/* Trip Filter */}
              {uniqueTrips.length > 1 && (
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-bold text-slate-400 shrink-0">旅程:</span>
                  <select
                    value={selectedTripFilter}
                    onChange={(e) => setSelectedTripFilter(e.target.value)}
                    className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 outline-none cursor-pointer max-w-[130px] sm:max-w-[170px] truncate"
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

              {/* Year Filter */}
              <div className="flex items-center gap-1">
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
              </div>

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
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 dark:bg-slate-950/40">
          {viewMode === 'calendar' ? (
            /* ================= VIEW 1: 月曆足跡視角 ================= */
            <div className="space-y-4 max-w-4xl mx-auto">
              {/* Calendar Month Navigation Header */}
              <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                    title="上個月"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-mono tracking-tight">
                    {calendarYear} 年 {calendarMonth + 1} 月
                  </h3>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                    title="下個月"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      setCalendarYear(now.getFullYear());
                      setCalendarMonth(now.getMonth());
                      setSelectedCalendarDate(null);
                    }}
                    className="px-2.5 py-1 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold transition cursor-pointer"
                  >
                    回到今天
                  </button>
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

              {/* Selected Day Footprint Details Sheet / Panel (Grouped cleanly by Trip without duplicates) */}
              {selectedCalendarDate && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-teal-500/40 shadow-lg space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                          {formatDateSlash(selectedCalendarDate)} ({getDayOfWeek(selectedCalendarDate, lang)})
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        當日共排定 {totalSelectedDaySpotsCount} 個景點活動 · 涵蓋 {selectedDateTripGroups.length} 趟旅程
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedCalendarDate(null)}
                      className="p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer"
                      title="關閉當日詳情"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Spots list for the day grouped cleanly by Trip */}
                  {selectedDateTripGroups.length === 0 ? (
                    <p className="text-xs text-slate-400 py-3 text-center">
                      當日尚無詳細行程景點，點擊上方可直接進入該旅程進行規劃。
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {selectedDateTripGroups.map(({ trip, dayNumber, spots }) => (
                        <div key={trip.id} className="space-y-2.5">
                          {/* Trip Section Header */}
                          <div className="flex items-center justify-between bg-slate-100/80 dark:bg-slate-800/80 p-2 sm:px-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${trip.coverGradient || 'from-teal-600 to-emerald-600'} shrink-0`}
                              />
                              <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                                【{trip.title}】
                              </span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 font-bold border border-slate-200/60 dark:border-slate-600 shrink-0">
                                第 {dayNumber} 天
                              </span>
                              <span className="text-[11px] text-slate-400 font-normal hidden sm:inline">
                                ({spots.length} 個景點)
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                onSelectTrip(trip.id);
                                onClose();
                              }}
                              className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[11px] flex items-center gap-1 transition cursor-pointer shadow-2xs shrink-0"
                            >
                              <span>前往此行程</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Spot Cards Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
                            {spots.map((spot, sIdx) => (
                              <div
                                key={`${spot.tripId}-${spot.spotId}-${sIdx}`}
                                className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-2 hover:border-teal-400 transition"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                                      {spot.spotTitle}
                                    </span>
                                    {spot.completed ? (
                                      <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-300/60 dark:border-emerald-800 shrink-0 flex items-center gap-0.5">
                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                                        <span>已造訪</span>
                                      </span>
                                    ) : (
                                      <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-medium border border-slate-200/60 dark:border-slate-600 shrink-0">
                                        待造訪
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {spot.startTime && (
                                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold border border-slate-200/60 dark:border-slate-600">
                                        {spot.startTime}
                                      </span>
                                    )}
                                    {onUpdateTrip && (
                                      <button
                                        type="button"
                                        onClick={(e) => handleToggleSpotVisited(spot.tripId, spot.dayNumber, spot.spotId, e)}
                                        className={`text-[10px] px-2 py-0.5 rounded-md font-semibold transition cursor-pointer flex items-center gap-1 ${
                                          spot.completed
                                            ? 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                                        }`}
                                        title={spot.completed ? '標記為未造訪' : '標記為已造訪'}
                                      >
                                        <Check className="w-2.5 h-2.5" />
                                        <span>{spot.completed ? '取消' : '打卡'}</span>
                                      </button>
                                    )}
                                  </div>
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
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : viewMode === 'timeline' ? (
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
                      setSelectedTripFilter('all');
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
                        className="px-3.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer shadow-xs"
                      >
                        <span>打開此行程</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Days and Spots in Trip */}
                    <div className="p-4 sm:p-5 space-y-5">
                      {days.map((dayGroup) => (
                        <div key={dayGroup.dayNumber} className="space-y-3">
                          <div className="flex items-center gap-2.5">
                            <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-[11px] font-mono font-bold flex items-center justify-center shrink-0">
                              D{dayGroup.dayNumber}
                            </span>
                            <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                              {dayGroup.date ? `${formatDateSlash(dayGroup.date)} (${getDayOfWeek(dayGroup.date, lang)})` : `第 ${dayGroup.dayNumber} 天`}
                            </span>
                            <span className="text-[11px] text-slate-400 font-normal">
                              ({dayGroup.spots.length} 個點)
                            </span>
                          </div>

                          {/* Spots in Day */}
                          <div className="ml-3 pl-5 border-l-2 border-teal-500/30 space-y-3">
                            {dayGroup.spots.map((spot) => (
                              <div
                                key={spot.spotId}
                                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 space-y-2 hover:border-teal-500/50 transition"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-xs font-bold text-teal-800 dark:text-teal-200 truncate">
                                      {spot.spotTitle}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-600 shrink-0">
                                      {CATEGORY_NAMES[spot.category] || '景點'}
                                    </span>
                                    {spot.completed ? (
                                      <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-300/60 dark:border-emerald-800 shrink-0 flex items-center gap-0.5">
                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                                        <span>已造訪</span>
                                      </span>
                                    ) : (
                                      <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-medium border border-slate-200/60 dark:border-slate-600 shrink-0">
                                        待造訪
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {spot.startTime && (
                                      <span className="text-[10px] font-mono font-semibold text-slate-400">
                                        {spot.startTime}
                                      </span>
                                    )}
                                    {onUpdateTrip && (
                                      <button
                                        type="button"
                                        onClick={(e) => handleToggleSpotVisited(spot.tripId, spot.dayNumber, spot.spotId, e)}
                                        className={`text-[10px] px-2 py-0.5 rounded-md font-semibold transition cursor-pointer flex items-center gap-1 ${
                                          spot.completed
                                            ? 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                                        }`}
                                        title={spot.completed ? '標記為未造訪' : '標記為已造訪'}
                                      >
                                        <Check className="w-2.5 h-2.5" />
                                        <span>{spot.completed ? '取消' : '打卡'}</span>
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {spot.locationName && (
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span className="truncate">{spot.locationName}</span>
                                  </p>
                                )}

                                {spot.notes && (
                                  <p className="text-xs text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200/50 dark:border-slate-700/50 leading-relaxed">
                                    {spot.notes}
                                  </p>
                                )}

                                {/* Spot Memory Photos */}
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
          ) : (
            /* ================= VIEW 3: 年度回顧 (Annual Review - High Performance & Theme Balanced) ================= */
            <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-200">
              {/* Year Selector & Copy Report Bar */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0 flex items-center gap-1.5">
                    <CalendarIcon className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span>回顧年度:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setReviewYear('all');
                      setReviewSelectedMonth(null);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                      reviewYear === 'all'
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    全部年份
                  </button>
                  {availableYears.map((yr) => (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => {
                        setReviewYear(yr);
                        setReviewSelectedMonth(null);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                        reviewYear === yr
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {yr} 年
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {/* Visited vs All Planned Toggle */}
                  <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold border border-slate-200/80 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setFilterCompletedOnly(true)}
                      className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                        filterCompletedOnly
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                      title="僅統計已打卡造訪的景點與城市"
                    >
                      <Check className="w-3 h-3 stroke-[2.5]" />
                      <span>僅已造訪</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterCompletedOnly(false)}
                      className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                        !filterCompletedOnly
                          ? 'bg-slate-700 text-white dark:bg-slate-600 shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                      title="統計所有曾排定的行程景點"
                    >
                      <span>全部預定</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyReviewReport}
                    className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
                    title="複製年度旅行回顧報表"
                  >
                    {copiedReviewReport ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedReviewReport ? '已複製回顧報表！' : '複製年度回顧報告'}</span>
                  </button>
                </div>
              </div>

              {/* Top 4 Core Metrics Cards (Balanced Contrast for Light and Dark modes) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Visited Cities Count (造訪城市數量) */}
                <div className="p-4 rounded-3xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/90 dark:border-emerald-800/60 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
                      <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>造訪城市數量</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100/90 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 font-bold border border-emerald-200/70 dark:border-emerald-700/60">
                      {reviewYear === 'all' ? '歷年累計' : `${reviewYear}年`}
                    </span>
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-white tracking-tight">
                      {annualReviewData.citiesSummary.length}{' '}
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">個城市</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-1">
                      {annualReviewData.citiesSummary.map((c) => c.city).slice(0, 3).join(' · ') || '尚未登錄城市'}
                    </p>
                  </div>
                </div>

                {/* 2. Total Spots Count (景點打卡總數) */}
                <div className="p-4 rounded-3xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/90 dark:border-amber-800/60 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                      <Landmark className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span>景點打卡總數</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100/90 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 font-bold border border-amber-200/70 dark:border-amber-700/60">
                      累積足跡
                    </span>
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-white tracking-tight">
                      {annualReviewData.reviewSpots.length}{' '}
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">處行程點</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-1">
                      含景點 {annualReviewData.categoryCounts.spot} · 美食 {annualReviewData.categoryCounts.food} · 住宿 {annualReviewData.categoryCounts.hotel}
                    </p>
                  </div>
                </div>

                {/* 3. Most Frequently Visited Month (最常造訪的月份) */}
                <div className="p-4 rounded-3xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200/90 dark:border-rose-800/60 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5 text-rose-800 dark:text-rose-300">
                      <Trophy className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      <span>最常造訪月份</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100/90 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 font-bold border border-rose-200/70 dark:border-rose-700/60 flex items-center gap-1">
                      👑 巔峰出遊
                    </span>
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                      {annualReviewData.monthlyStats.mostVisited ? annualReviewData.monthlyStats.mostVisited.name : '—'}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-1">
                      {annualReviewData.monthlyStats.mostVisited ? (
                        <span>
                          出遊 {annualReviewData.monthlyStats.mostVisited.daysCount} 天 · 走訪 {annualReviewData.monthlyStats.mostVisited.spotsCount} 點
                        </span>
                      ) : (
                        '該年度暫無行程'
                      )}
                    </p>
                  </div>
                </div>

                {/* 4. Total Travel Days & Trips (漫遊總天數) */}
                <div className="p-4 rounded-3xl bg-sky-50/80 dark:bg-sky-950/30 border border-sky-200/90 dark:border-sky-800/60 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5 text-sky-800 dark:text-sky-300">
                      <Compass className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                      <span>漫遊旅途天數</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100/90 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 font-bold border border-sky-200/70 dark:border-sky-700/60">
                      {annualReviewData.reviewTrips.length} 趟旅程
                    </span>
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-white tracking-tight">
                      {annualReviewData.totalTravelDays}{' '}
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">天</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-1">
                      珍藏回憶照片 {annualReviewData.totalPhotosCount} 張
                    </p>
                  </div>
                </div>
              </div>

              {/* 12-Month Travel Frequency Bar Chart (Visual contrast optimized for both themes) */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      <span>12 個月旅行熱度分佈長條圖</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      點選柱狀圖任意月份，可即時查看當月出遊明細與景點打卡清單
                    </p>
                  </div>

                  {annualReviewData.monthlyStats.mostVisited && (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800 dark:text-rose-200 bg-rose-100/80 dark:bg-rose-950/70 px-3 py-1 rounded-xl border border-rose-200 dark:border-rose-800/80 shadow-2xs self-start sm:self-auto">
                      <span>👑 出遊最高峰：{annualReviewData.monthlyStats.mostVisited.name}</span>
                    </div>
                  )}
                </div>

                {/* 12 Columns Visual Bar Grid */}
                <div className="grid grid-cols-12 gap-1.5 sm:gap-2.5 pt-4 pb-2 items-end min-h-[145px]">
                  {annualReviewData.monthlyStats.months.map((m) => {
                    const isPeak = annualReviewData.monthlyStats.mostVisited?.month === m.month && m.daysCount > 0;
                    const isSelected = reviewSelectedMonth === m.month;
                    const heightPercent = m.daysCount > 0
                      ? Math.max(18, Math.round((m.daysCount / annualReviewData.monthlyStats.maxDays) * 100))
                      : 8;

                    return (
                      <div
                        key={m.month}
                        onClick={() => {
                          if (m.daysCount > 0 || m.spotsCount > 0) {
                            setReviewSelectedMonth(isSelected ? null : m.month);
                          }
                        }}
                        className={`flex flex-col items-center justify-end h-full group cursor-pointer ${
                          m.daysCount === 0 && m.spotsCount === 0 ? 'opacity-35 cursor-default' : ''
                        }`}
                        title={`${m.name}: 出遊 ${m.daysCount} 天, ${m.spotsCount} 個行程點`}
                      >
                        {/* Peak indicator icon */}
                        {isPeak && (
                          <span className="text-[11px] text-rose-500 font-bold mb-1 animate-bounce">
                            👑
                          </span>
                        )}

                        {/* Bar Track & Fill */}
                        <div className="w-full max-w-[34px] bg-slate-100 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-xl overflow-hidden flex flex-col justify-end p-0.5">
                          <div
                            style={{ height: `${heightPercent}%` }}
                            className={`w-full rounded-lg transition-all duration-300 ${
                              isPeak
                                ? 'bg-gradient-to-t from-rose-600 to-amber-500 dark:from-rose-500 dark:to-amber-400 shadow-sm'
                                : isSelected
                                ? 'bg-teal-500 dark:bg-teal-400 ring-2 ring-teal-400 dark:ring-teal-300 shadow-xs'
                                : m.daysCount > 0
                                ? 'bg-teal-600 dark:bg-teal-500 hover:bg-teal-500 dark:hover:bg-teal-400'
                                : 'bg-slate-200/90 dark:bg-slate-700'
                            }`}
                          />
                        </div>

                        {/* Month Label */}
                        <span
                          className={`mt-2 text-[10px] sm:text-xs font-mono font-bold ${
                            isPeak
                              ? 'text-rose-700 dark:text-rose-300 font-black'
                              : isSelected
                              ? 'text-teal-700 dark:text-teal-300 font-black'
                              : m.daysCount > 0
                              ? 'text-slate-800 dark:text-slate-200'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {m.month}月
                        </span>

                        {/* Days Pill */}
                        {m.daysCount > 0 && (
                          <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono font-semibold">
                            {m.daysCount}天
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Interactive Month Selection Drill-down Banner */}
                {reviewSelectedMonth !== null && (
                  <div className="p-3.5 rounded-2xl bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-teal-600 text-white font-mono font-bold text-xs">
                        {reviewSelectedMonth}月
                      </span>
                      <span className="text-xs font-bold text-teal-900 dark:text-teal-200">
                        當月出遊明細：共 {selectedMonthSpots.length} 個行程點
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setReviewSelectedMonth(null)}
                      className="px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer self-end sm:self-auto"
                    >
                      清除月份篩選
                    </button>
                  </div>
                )}
              </div>

              {/* Visited Cities Breakdown (造訪城市排行榜與足跡) */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <span>造訪城市與足跡清單 ({annualReviewData.citiesSummary.length} 座)</span>
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">依行程打卡數排序</span>
                </div>

                {annualReviewData.citiesSummary.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    該年度尚未記錄任何造訪城市。
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {annualReviewData.citiesSummary.map((item, idx) => {
                      const rankClass =
                        idx === 0
                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200 border border-amber-300 dark:border-amber-700/80'
                          : idx === 1
                          ? 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                          : idx === 2
                          ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                          : 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300';

                      return (
                        <div
                          key={item.city}
                          className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-700/90 space-y-2.5 hover:border-teal-500/60 dark:hover:border-teal-400/60 transition shadow-2xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-5 h-5 rounded-full ${rankClass} text-[10px] font-mono font-bold flex items-center justify-center shrink-0`}
                              >
                                {idx + 1}
                              </span>
                              <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                                {item.city}
                              </h4>
                            </div>
                            <span className="text-[11px] font-mono font-bold text-teal-700 dark:text-teal-300 shrink-0">
                              {item.spotsCount} 個點
                            </span>
                          </div>

                          {/* High contrast progress bar */}
                          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${Math.max(10, item.sharePercent)}%` }}
                              className="bg-teal-600 dark:bg-teal-400 h-full rounded-full transition-all duration-300"
                            />
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="truncate">相關旅程：{Array.from(item.trips).join('、')}</span>
                            <span className="font-mono font-bold">{item.sharePercent}%</span>
                          </div>

                          {/* Sample thumbnails */}
                          {item.photos.length > 0 && (
                            <div className="flex items-center gap-1.5 pt-1">
                              {item.photos.map((p, pIdx) => (
                                <img
                                  key={pIdx}
                                  src={p}
                                  alt={item.city}
                                  onClick={() =>
                                    setLightboxImage({
                                      url: p,
                                      spotTitle: item.city,
                                      tripTitle: Array.from(item.trips).join('、'),
                                    })
                                  }
                                  className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 cursor-pointer hover:scale-105 transition shrink-0"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Spot Category Distribution (景點類別比例 & Stacked Bar) */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>行程類別分佈 ({annualReviewData.reviewSpots.length} 處打卡點)</span>
                  </h3>
                </div>

                {/* Stacked Proportional Progress Bar */}
                {annualReviewData.reviewSpots.length > 0 && (
                  <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
                    {(['spot', 'food', 'transport', 'hotel', 'shopping', 'activity', 'other'] as CategoryType[]).map(
                      (cat) => {
                        const count = annualReviewData.categoryCounts[cat] || 0;
                        if (count === 0) return null;
                        const pct = (count / annualReviewData.reviewSpots.length) * 100;
                        const color = CATEGORY_COLORS[cat];
                        return (
                          <div
                            key={cat}
                            style={{ width: `${pct}%` }}
                            className={`${color.bar} h-full transition-all`}
                            title={`${CATEGORY_NAMES[cat]}: ${count} (${Math.round(pct)}%)`}
                          />
                        );
                      }
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  {(['spot', 'food', 'transport', 'hotel', 'shopping', 'activity'] as CategoryType[]).map((cat) => {
                    const count = annualReviewData.categoryCounts[cat] || 0;
                    const percent =
                      annualReviewData.reviewSpots.length > 0
                        ? Math.round((count / annualReviewData.reviewSpots.length) * 100)
                        : 0;
                    const Icon = CATEGORY_ICONS[cat] || Circle;
                    const color = CATEGORY_COLORS[cat];

                    return (
                      <div
                        key={cat}
                        className={`p-3 rounded-2xl ${color.bg} border ${color.border} flex flex-col justify-between space-y-1.5`}
                      >
                        <div className="flex items-center justify-between">
                          <Icon className={`w-4 h-4 ${color.iconColor}`} />
                          <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
                            {percent}%
                          </span>
                        </div>
                        <div>
                          <div className={`text-lg font-black font-mono ${color.text}`}>
                            {count}
                          </div>
                          <p className={`text-[11px] font-bold ${color.text}`}>
                            {CATEGORY_NAMES[cat]}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Trips of the Year List (年度所有旅程清單 - O(1) spot count lookups) */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                    <Route className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <span>年度旅程篇章 ({annualReviewData.reviewTrips.length} 趟旅程)</span>
                  </h3>
                </div>

                <div className="space-y-3">
                  {annualReviewData.reviewTrips.map((tr) => {
                    const tripData = annualReviewData.tripSpotMap.get(tr.id);
                    const spotsCount = tripData?.spots.length || 0;
                    const photosCount = tripData?.photosCount || 0;

                    return (
                      <div
                        key={tr.id}
                        className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 hover:border-teal-400 dark:hover:border-teal-500 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-12 h-12 rounded-xl bg-gradient-to-br ${
                              tr.coverGradient || 'from-teal-600 to-emerald-700'
                            } text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs`}
                          >
                            {tr.destination ? tr.destination.slice(0, 2) : '日和'}
                          </div>

                          <div className="min-w-0">
                            <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                              {tr.title}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 font-mono mt-0.5">
                              <span>{formatDateSlash(tr.startDate)} ~ {formatDateSlash(tr.endDate)}</span>
                              <span>·</span>
                              <span>{tr.destination}</span>
                              <span>·</span>
                              <span>{spotsCount} 個行程點</span>
                              {photosCount > 0 && <span>· 📸 {photosCount} 張照片</span>}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            onSelectTrip(tr.id);
                            onClose();
                          }}
                          className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 shadow-xs"
                        >
                          <span>直達行程</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
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
                    new Set(uniqueTrips.map((t) => t.destination).filter(Boolean))
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

      {/* ================= MODAL: 高解析照片 Lightbox ================= */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center gap-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute -top-10 right-0 p-1.5 rounded-full bg-white/20 hover:bg-white/40 text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <img
              src={lightboxImage.url}
              alt={lightboxImage.spotTitle || '照片回憶'}
              className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl border border-white/10"
            />

            {(lightboxImage.spotTitle || lightboxImage.caption) && (
              <div className="text-center space-y-1 bg-black/50 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/10 max-w-lg">
                <h4 className="font-bold text-sm text-white">
                  {lightboxImage.spotTitle}
                </h4>
                {lightboxImage.tripTitle && (
                  <p className="text-[11px] text-teal-300">
                    {lightboxImage.tripTitle} · {lightboxImage.date}
                  </p>
                )}
                {lightboxImage.caption && (
                  <p className="text-xs text-white/80">{lightboxImage.caption}</p>
                )}
                {lightboxImage.googlePhotosUrl && (
                  <a
                    href={lightboxImage.googlePhotosUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-amber-300 hover:underline pt-1"
                  >
                    <span>在 Google 相簿中開啟相簿</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
