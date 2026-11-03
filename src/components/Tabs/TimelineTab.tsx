import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Trip, DayPlan, ItineraryItem } from '../../types/itinerary';
import { LeafletMap, CATEGORY_COLORS } from '../Map/LeafletMap';
import { calculateDistanceKm, formatDistance, estimateTravelTime, getGoogleMapsNavigationUrl } from '../../utils/geo';
import {
  formatDateSlash,
  formatMonthDaySlash,
  getDayOfWeek,
  isDateToday,
  sortItineraryItemsByTime,
  getSuggestedNextStartTime,
  parseTimeToMinutes,
} from '../../utils/date';
import { Language, TRANSLATIONS } from '../../utils/i18n';
import { ItineraryOverviewTable } from '../Itinerary/ItineraryOverviewTable';
import {
  Calendar,
  Clock,
  MapPin,
  Navigation,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit2,
  CheckCircle2,
  Circle,
  Bus,
  Bookmark,
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
  Route,
  Search,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react';

interface TimelineTabProps {
  trip: Trip;
  lang: Language;
  onUpdateTrip: (updatedTrip: Trip) => void;
  onOpenAddItem: (dayNumber: number, suggestedStartTime?: string) => void;
  onOpenEditItem: (item: ItineraryItem, dayNumber: number) => void;
  isPickMode: boolean;
  onStartMapPick: () => void;
  pickedCoords: { lat: number; lng: number } | null;
  onPickLocation: (lat: number, lng: number) => void;
  onOpenMemories?: (spotId?: string) => void;
}

const CATEGORY_MAP: Record<string, { labelKey: string; icon: React.ComponentType<{ className?: string }>; text: string }> = {
  spot: { labelKey: 'cat_spot', icon: Landmark, text: 'text-teal-700 dark:text-teal-300' },
  food: { labelKey: 'cat_food', icon: Utensils, text: 'text-orange-700 dark:text-orange-300' },
  transport: { labelKey: 'cat_transport', icon: Train, text: 'text-sky-700 dark:text-sky-300' },
  hotel: { labelKey: 'cat_hotel', icon: Hotel, text: 'text-violet-700 dark:text-violet-300' },
  shopping: { labelKey: 'cat_shopping', icon: ShoppingBag, text: 'text-pink-700 dark:text-pink-300' },
  activity: { labelKey: 'cat_activity', icon: Sparkles, text: 'text-rose-700 dark:text-rose-300' },
};

/**
 * Generic debounce utility with cancel capability to prevent excessive re-renders
 * during rapid scrolling bursts.
 */
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

export const TimelineTab: React.FC<TimelineTabProps> = ({
  trip,
  lang,
  onUpdateTrip,
  onOpenAddItem,
  onOpenEditItem,
  isPickMode,
  onStartMapPick,
  pickedCoords,
  onPickLocation,
  onOpenMemories,
}) => {
  const t = TRANSLATIONS[lang];
  const [timelineViewMode, setTimelineViewMode] = useState<'daily' | 'overview'>('daily');
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(1);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [spotSearchQuery, setSpotSearchQuery] = useState('');

  // Horizontal Day Filter Bar scroll state & auto-centering
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Scroll Detection for Date Filter Bar and Header Expansion State using requestAnimationFrame and debounce
  const [isCompact, setIsCompact] = useState(false);
  const lastScrollYRef = useRef(0);
  const isCompactRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    isCompactRef.current = isCompact;
  }, [isCompact]);

  useEffect(() => {
    // Debounce function to prevent excessive re-renders during rapid scrolling that causes UI stutter
    const debouncedSetExpansion = debounce((shouldCompact: boolean) => {
      if (isCompactRef.current !== shouldCompact) {
        setIsCompact(shouldCompact);
      }
    }, 60);

    const handleWindowScroll = () => {
      // Cancel previous pending animation frame to avoid queuing frame updates
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }

      // Use requestAnimationFrame for frame-aligned measurement and updating the expansion state
      rafIdRef.current = window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;
        const diff = currentScrollY - lastScrollYRef.current;

        // Reset to full mode immediately when near the top of the page
        if (currentScrollY <= 80) {
          debouncedSetExpansion.cancel();
          if (isCompactRef.current) {
            setIsCompact(false);
          }
        }
        // Downward scroll deep into timeline schedule -> compact mode via debounce
        else if (currentScrollY > 180 && diff > 15) {
          debouncedSetExpansion(true);
        }
        // Deliberate upward scroll -> restore full expansion mode via debounce
        else if (diff < -25) {
          debouncedSetExpansion(false);
        }

        lastScrollYRef.current = currentScrollY;
        rafIdRef.current = null;
      });
    };

    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleWindowScroll);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      debouncedSetExpansion.cancel();
    };
  }, []);

  // Safe Haptic Feedback helper (10ms subtle vibration for touch devices)
  const triggerHaptic = (ms = 10) => {
    try {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(ms);
      }
    } catch {
      // Ignore vibration error on unsupported platforms
    }
  };

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

  // Auto-scroll selected day or overview into view when selectedDayNumber or view mode changes
  useEffect(() => {
    const targetId = timelineViewMode === 'daily'
      ? `day-filter-chip-${selectedDayNumber}`
      : 'day-filter-chip-overview';
    scrollToCenterChip(targetId);
  }, [selectedDayNumber, timelineViewMode]);

  const handleScrollDays = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const offset = direction === 'left' ? -260 : 260;
    scrollContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  // Identify actual today Day or closest Day in the itinerary
  const todayDay = useMemo(() => {
    return trip.days.find((d) => isDateToday(d.date));
  }, [trip.days]);

  const targetTodayDay = useMemo(() => {
    if (todayDay) return todayDay;
    const nowMs = new Date().setHours(0, 0, 0, 0);
    let closest = trip.days[0];
    let minDiff = Infinity;
    for (const d of trip.days) {
      const dMs = new Date(d.date + 'T00:00:00').getTime();
      const diff = Math.abs(dMs - nowMs);
      if (diff < minDiff) {
        minDiff = diff;
        closest = d;
      }
    }
    return closest || trip.days[0];
  }, [todayDay, trip.days]);

  const isCurrentToday = timelineViewMode === 'daily' && selectedDayNumber === (todayDay?.dayNumber || targetTodayDay?.dayNumber);

  // Travel Progress Information (Calculated for horizontal progress bar & today dot indicator)
  const todayProgressInfo = useMemo(() => {
    const totalDays = trip.days.length;
    if (totalDays === 0) return null;

    const todayIdx = trip.days.findIndex((d) => isDateToday(d.date));
    const isTodayInTrip = todayIdx !== -1;

    // Pinpoint today's center coordinate along the progress track
    const todayPercent = isTodayInTrip
      ? ((todayIdx + 0.5) / totalDays) * 100
      : null;

    // Current viewed progress fill (percentage of total trip days)
    const selectedPercent = timelineViewMode === 'overview'
      ? 100
      : Math.min(100, Math.max(0, (selectedDayNumber / totalDays) * 100));

    return {
      totalDays,
      todayIdx,
      isTodayInTrip,
      todayPercent,
      selectedPercent,
      currentDayNum: selectedDayNumber,
      todayDayNumber: isTodayInTrip ? trip.days[todayIdx].dayNumber : null,
      todayDate: isTodayInTrip ? trip.days[todayIdx].date : null,
    };
  }, [trip.days, selectedDayNumber, timelineViewMode]);

  const handleJumpToToday = () => {
    const target = todayDay || targetTodayDay;
    if (!target) return;
    triggerHaptic(12);
    handleSelectDay(target.dayNumber);
    setTimelineViewMode('daily');
    scrollToCenterChip(`day-filter-chip-${target.dayNumber}`);
    setTimeout(() => {
      const scheduleEl = document.getElementById('day-schedule-section');
      if (scheduleEl) {
        scheduleEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
  };

  // High-Resolution Photo Overlay State for intercepting thumbnail clicks & displaying original high-res URL
  const [overlaySpotPhoto, setOverlaySpotPhoto] = useState<{
    item: ItineraryItem;
    photoIndex: number;
  } | null>(null);
  const [overlayHighResFailed, setOverlayHighResFailed] = useState(false);
  const [isEditingOverlayGoogleUrl, setIsEditingOverlayGoogleUrl] = useState(false);
  const [overlayEditUrl, setOverlayEditUrl] = useState('');

  useEffect(() => {
    setOverlayHighResFailed(false);
    setIsEditingOverlayGoogleUrl(false);
    setOverlayEditUrl(overlaySpotPhoto?.item.googlePhotosUrl || '');
  }, [overlaySpotPhoto?.item.id, overlaySpotPhoto?.photoIndex]);

  const handleSaveOverlayGoogleUrl = () => {
    if (!overlaySpotPhoto) return;
    const finalUrl = overlayEditUrl.trim();
    const targetItemId = overlaySpotPhoto.item.id;

    // Update spot in trip.days
    const updatedDays = trip.days.map((d) => ({
      ...d,
      items: d.items.map((it) => (it.id === targetItemId ? { ...it, googlePhotosUrl: finalUrl || undefined } : it)),
    }));

    // Update memories if present
    const updatedMemories = (trip.memories || []).map((m) =>
      m.spotId === targetItemId ? { ...m, googlePhotosUrl: finalUrl || undefined } : m
    );

    const updatedTrip = {
      ...trip,
      days: updatedDays,
      memories: updatedMemories,
      updatedAt: Date.now(),
    };
    onUpdateTrip(updatedTrip);

    // Update local overlay state
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

  const getBetweenTime = (prevItem: ItineraryItem, nextItem?: ItineraryItem): string => {
    if (!nextItem) return getSuggestedNextStartTime([prevItem]);
    const prevEnd = parseTimeToMinutes(prevItem.endTime || prevItem.startTime);
    const nextStart = parseTimeToMinutes(nextItem.startTime);
    if (prevEnd !== 99999 && nextStart !== 99999 && nextStart > prevEnd) {
      const midMinutes = Math.floor((prevEnd + nextStart) / 2 / 15) * 15;
      const h = Math.floor(midMinutes / 60);
      const m = midMinutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    if (prevEnd !== 99999) {
      const midMinutes = prevEnd + 30;
      const h = Math.floor(midMinutes / 60);
      const m = midMinutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return '12:00';
  };

  const handleSelectDay = (dayNum: number) => {
    setSelectedDayNumber(dayNum);
    setSelectedItemId(null);
  };

  const handleToggleComplete = (itemId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const updatedDays = trip.days.map((day) => ({
      ...day,
      items: day.items.map((it) => (it.id === itemId ? { ...it, completed: !it.completed } : it)),
    }));
    onUpdateTrip({ ...trip, days: updatedDays, updatedAt: Date.now() });
  };

  const handleDeleteItem = (itemId: string) => {
    const updatedDays = trip.days.map((day) => {
      if (day.dayNumber !== selectedDayNumber) return day;
      return {
        ...day,
        items: day.items.filter((it) => it.id !== itemId),
      };
    });
    const updatedMemories = (trip.memories || []).filter((m) => m.spotId !== itemId);
    onUpdateTrip({ ...trip, days: updatedDays, memories: updatedMemories, updatedAt: Date.now() });
  };

  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    const items = [...activeDay.items];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= items.length) return;

    const cur = { ...items[index] };
    const target = { ...items[targetIdx] };

    // If both have start times and they differ, swap their time slots so chronological ordering is preserved
    if (cur.startTime && target.startTime && cur.startTime !== target.startTime) {
      const tempStartTime = cur.startTime;
      const tempEndTime = cur.endTime;
      cur.startTime = target.startTime;
      cur.endTime = target.endTime;
      target.startTime = tempStartTime;
      target.endTime = tempEndTime;
    }

    items[index] = target;
    items[targetIdx] = cur;

    const sorted = sortItineraryItemsByTime(items);

    const updatedDays = trip.days.map((day) => {
      if (day.dayNumber !== selectedDayNumber) return day;
      return { ...day, items: sorted };
    });
    onUpdateTrip({ ...trip, days: updatedDays, updatedAt: Date.now() });
  };

  const handleAddDay = () => {
    const newDayNum = trip.days.length + 1;
    const lastDay = trip.days[trip.days.length - 1];
    let nextDate = trip.endDate;
    if (lastDay) {
      const d = new Date(lastDay.date);
      d.setDate(d.getDate() + 1);
      nextDate = d.toISOString().slice(0, 10);
    }

    const newDay: DayPlan = {
      id: `day-${Date.now()}-${newDayNum}`,
      dayNumber: newDayNum,
      date: nextDate,
      theme: lang === 'zh' ? `第 ${newDayNum} 天行程` : `Day ${newDayNum} Schedule`,
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

  return (
    <div className="space-y-3.5">
      {/* 水平捲動日期/天數篩選列 (Horizontal Day & Date Filter Bar with Scroll Detection & Compact Mode) */}
      <div
        className={`sticky top-14 z-20 group/filter bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-white/10 transition-all duration-300 ease-in-out ${
          isCompact ? 'py-1 px-1.5 shadow-md' : 'p-2 shadow-2xs'
        }`}
        style={{ overflowAnchor: 'none' }}
      >
        {/* Header bar with Section Label & Floating 'Return to Today' button (collapses smoothly when scrolling down) */}
        <div
          className={`flex items-center justify-between px-1 transition-all duration-300 ease-in-out overflow-hidden ${
            isCompact
              ? 'max-h-0 opacity-0 mb-0 pointer-events-none pb-0 pt-0'
              : 'max-h-12 opacity-100 mb-1 pb-1.5 pt-0.5'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>{lang === 'zh' ? '行程日程' : 'Itinerary Days'}</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              · {trip.days.length} 天
            </span>
          </div>

          {/* 返回今日浮動小按鈕 (Floating Jump to Today Button) */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.03 }}
            onClick={handleJumpToToday}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer ${
              isCurrentToday
                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-400/30'
                : 'bg-slate-50 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-amber-400/80 shadow-2xs'
            }`}
            title={lang === 'zh' ? '快速捲動至今日行程' : 'Jump to Today'}
            aria-label="返回今日"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse" />
            <span>{lang === 'zh' ? '返回今日' : 'Today'}</span>
            {targetTodayDay && (
              <span className="text-[10px] font-mono opacity-80 font-normal">
                (Day {targetTodayDay.dayNumber})
              </span>
            )}
          </motion.button>
        </div>

        {/* Left scroll arrow button */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => handleScrollDays('left')}
            className={`absolute left-1.5 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/95 dark:bg-slate-800/95 shadow-md border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer ${
              isCompact ? 'w-6 h-6' : 'w-7 h-7'
            }`}
            aria-label="往左捲動天數"
          >
            <ChevronLeft className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          </button>
        )}

        {/* Scrollable Container with Scroll Snap (removed CSS scroll-smooth to prevent fighting scroll-snap) */}
        <div
          ref={scrollContainerRef}
          className={`flex items-center gap-2 overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-px-4 sm:scroll-px-6 transition-all duration-300 ${
            isCompact ? 'px-1 py-0.5' : 'px-2 py-1.5'
          }`}
        >
          {/* Overview button option */}
          <motion.button
            type="button"
            id="day-filter-chip-overview"
            whileTap={{ scale: 1.05 }}
            animate={
              timelineViewMode === 'overview'
                ? { scale: 1.03, y: -2 }
                : { scale: 1, y: 0 }
            }
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            onClick={() => {
              triggerHaptic(10);
              setTimelineViewMode('overview');
              scrollToCenterChip('day-filter-chip-overview');
            }}
            className={`rounded-xl text-left shrink-0 snap-center snap-always cursor-pointer select-none transition-all duration-200 ${
              isCompact
                ? 'min-w-[76px] px-2.5 py-1.5 h-9 flex items-center justify-center gap-1.5'
                : 'min-w-[84px] px-3.5 py-2.5 h-[56px] flex flex-col justify-between'
            } ${
              timelineViewMode === 'overview'
                ? 'bg-teal-700 text-white shadow-md ring-2 ring-teal-500/40 z-1'
                : 'bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-white/5'
            }`}
          >
            {isCompact ? (
              <>
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] font-bold whitespace-nowrap">
                  {lang === 'zh' ? '總覽' : 'All'}
                </span>
                <span className="text-[10px] opacity-75 font-mono whitespace-nowrap">
                  ({trip.days.length})
                </span>
              </>
            ) : (
              <>
                <span className="text-[11px] font-bold flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {lang === 'zh' ? '行程總覽' : 'Overview'}
                </span>
                <span className="text-[10px] opacity-75 font-mono mt-0.5">
                  {trip.days.length} 天日程
                </span>
              </>
            )}
          </motion.button>

          {/* Individual Day Chips */}
          {trip.days.map((day) => {
            const isCurrent = timelineViewMode === 'daily' && day.dayNumber === selectedDayNumber;
            const completedCount = day.items.filter((i) => i.completed).length;
            const totalCount = day.items.length;
            const weekday = getDayOfWeek(day.date, lang);
            const dateStr = formatMonthDaySlash(day.date);
            const isToday = isDateToday(day.date);
            const isEmpty = totalCount === 0;

            return (
              <motion.button
                key={day.id}
                id={`day-filter-chip-${day.dayNumber}`}
                type="button"
                whileTap={{ scale: 1.05 }}
                animate={
                  isCurrent
                    ? { scale: 1.03, y: -2 }
                    : { scale: 1, y: 0 }
                }
                transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                onClick={() => {
                  triggerHaptic(10);
                  handleSelectDay(day.dayNumber);
                  setTimelineViewMode('daily');
                  scrollToCenterChip(`day-filter-chip-${day.dayNumber}`);
                  setTimeout(() => {
                    const scheduleEl = document.getElementById('day-schedule-section');
                    if (scheduleEl) {
                      scheduleEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }, 60);
                }}
                className={`rounded-xl text-left shrink-0 snap-center snap-always cursor-pointer select-none transition-all duration-200 relative ${
                  isCompact
                    ? 'min-w-[88px] px-2.5 py-1.5 h-9 flex items-center justify-between gap-1.5'
                    : 'min-w-[110px] px-3.5 py-2.5 h-[56px] flex flex-col justify-between'
                } ${
                  isCurrent
                    ? `bg-teal-700 text-white shadow-md ring-2 ring-teal-500/40 z-1 ${isToday ? 'border-amber-400/80' : ''}`
                    : isToday
                    ? 'bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-900/30 text-slate-800 dark:text-slate-200 border border-amber-300 dark:border-amber-500/60 ring-1.5 ring-amber-400/80 shadow-xs'
                    : isEmpty
                    ? 'bg-slate-50/40 dark:bg-slate-900/30 hover:bg-amber-50/30 dark:hover:bg-amber-950/20 text-slate-500 dark:text-slate-400 border border-dashed border-amber-300/60 dark:border-amber-800/50 opacity-80 hover:opacity-100'
                    : 'bg-slate-50 dark:bg-slate-800/60 hover:bg-teal-50/60 dark:hover:bg-teal-950/30 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-white/5'
                }`}
              >
                {isCompact ? (
                  /* Compact Single-line Layout */
                  <>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-xs font-black ${isCurrent ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                        D{day.dayNumber}
                      </span>
                      {isToday && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-xs animate-pulse" />
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-mono shrink-0">
                      <span className={isCurrent ? 'text-teal-100' : 'text-slate-500 dark:text-slate-400'}>
                        {dateStr}
                      </span>
                      {isEmpty ? (
                        <span className={`text-[9px] ${isCurrent ? 'text-amber-200' : 'text-amber-500 dark:text-amber-400'}`}>
                          (空)
                        </span>
                      ) : (
                        <span className={`text-[10px] ${isCurrent ? 'text-teal-100 font-bold' : 'opacity-70'}`}>
                          ·{totalCount}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  /* Full Two-Row Layout */
                  <>
                    <div className="flex items-center justify-between gap-1.5">
                      <span className={`text-xs font-black ${isCurrent ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                        Day {day.dayNumber}
                      </span>
                      {totalCount > 0 ? (
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                            isCurrent
                              ? 'bg-teal-900/60 text-teal-100 font-bold'
                              : completedCount === totalCount
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold'
                              : 'bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {completedCount > 0 ? `✓ ${completedCount}/${totalCount}` : `${totalCount}`}
                        </span>
                      ) : (
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.2 rounded-md ${
                            isCurrent
                              ? 'bg-teal-900/70 text-amber-200/90 border border-teal-600/50'
                              : 'bg-amber-100/70 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40'
                          }`}
                        >
                          {lang === 'zh' ? '空行程' : 'Empty'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-1 text-[10px] font-mono opacity-85">
                      <div className="flex items-center gap-1">
                        <span>{dateStr}</span>
                        {weekday && <span>({weekday})</span>}
                      </div>
                      {isToday && (
                        <span className="flex items-center gap-1 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-xs animate-pulse" />
                          <span className={`text-[9px] font-bold ${isCurrent ? 'text-amber-300' : 'text-amber-600 dark:text-amber-400'}`}>
                            {lang === 'zh' ? '今日' : 'Today'}
                          </span>
                        </span>
                      )}
                    </div>
                  </>
                )}
              </motion.button>
            );
          })}

          {/* Add Day button */}
          <motion.button
            type="button"
            whileTap={{ scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            onClick={() => {
              triggerHaptic(10);
              handleAddDay();
            }}
            className={`rounded-xl border border-dashed border-teal-500/70 hover:border-teal-500 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 text-xs font-semibold flex items-center justify-center gap-1 shrink-0 snap-center transition-all cursor-pointer ${
              isCompact ? 'h-9 px-2.5' : 'h-[52px] px-3'
            }`}
            title={lang === 'zh' ? '增加一天' : 'Add Day'}
            aria-label="增加一天"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-[11px] whitespace-nowrap">{lang === 'zh' ? '加一天' : '+Day'}</span>
          </motion.button>
        </div>

        {/* Right scroll arrow button */}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => handleScrollDays('right')}
            className={`absolute right-1.5 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/95 dark:bg-slate-800/95 shadow-md border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer ${
              isCompact ? 'w-6 h-6' : 'w-7 h-7'
            }`}
            aria-label="往右捲動天數"
          >
            <ChevronRight className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          </button>
        )}

        {/* 細長水平進度條 (Slim Horizontal Travel Progress Bar with Today Micro Marker) */}
        {trip.days.length > 0 && (
          <div className={`transition-all duration-300 ${isCompact ? 'mt-1 px-1 pb-0.5' : 'mt-1.5 px-1.5 pb-0.5'}`}>
            {/* Header label row for progress (collapses smoothly in compact mode) */}
            <div
              className={`flex items-center justify-between text-[10px] font-mono text-slate-400 dark:text-slate-500 overflow-hidden transition-all duration-300 ${
                isCompact
                  ? 'max-h-0 opacity-0 mb-0 pointer-events-none'
                  : 'max-h-6 opacity-100 mb-1'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  {lang === 'zh' ? '行程進度' : 'Progress'}
                </span>
                <span className="text-teal-600 dark:text-teal-400 font-bold">
                  {timelineViewMode === 'overview'
                    ? (lang === 'zh' ? '全景總覽 (100%)' : 'All Days (100%)')
                    : `${Math.round(todayProgressInfo?.selectedPercent ?? 0)}% (Day ${selectedDayNumber}/${trip.days.length})`}
                </span>
              </div>

              {todayProgressInfo?.isTodayInTrip && (
                <button
                  type="button"
                  onClick={handleJumpToToday}
                  className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold hover:underline cursor-pointer"
                  title={lang === 'zh' ? '點擊跳轉至今日' : 'Click to jump to today'}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span>
                    {lang === 'zh'
                      ? `今日位於 Day ${todayProgressInfo.todayDayNumber}`
                      : `Today: Day ${todayProgressInfo.todayDayNumber}`}
                  </span>
                </button>
              )}
            </div>

            {/* The progress track container */}
            <div
              className="relative w-full h-1.5 bg-slate-100 dark:bg-white/10 rounded-full overflow-visible select-none"
              title={
                lang === 'zh'
                  ? `當前進度：${Math.round(todayProgressInfo?.selectedPercent ?? 0)}%`
                  : `Progress: ${Math.round(todayProgressInfo?.selectedPercent ?? 0)}%`
              }
            >
              {/* Filled progress bar with smooth transition */}
              <motion.div
                className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-teal-500 via-teal-600 to-emerald-500 rounded-full shadow-xs"
                initial={false}
                animate={{ width: `${todayProgressInfo?.selectedPercent ?? 0}%` }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              />

              {/* Day segment dividers */}
              {trip.days.length > 1 &&
                Array.from({ length: trip.days.length - 1 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 w-[1.5px] -ml-[0.75px] bg-white/70 dark:bg-[#1c1c1e]/80 z-1 pointer-events-none"
                    style={{ left: `${((idx + 1) / trip.days.length) * 100}%` }}
                  />
                ))}

              {/* Today micro marker / glowing dot */}
              {todayProgressInfo && todayProgressInfo.todayPercent !== null && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleJumpToToday();
                  }}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 flex flex-col items-center group cursor-pointer p-0.5 bg-transparent border-none"
                  style={{ left: `${todayProgressInfo.todayPercent}%` }}
                  title={
                    lang === 'zh'
                      ? `今日位置 (Day ${todayProgressInfo.todayDayNumber}) - 點擊定位`
                      : `Today (Day ${todayProgressInfo.todayDayNumber}) - Click to jump`
                  }
                  aria-label="今日位置"
                >
                  <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400 ring-2 ring-white dark:ring-[#1c1c1e] shadow-sm group-hover:scale-125 transition-transform" />
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 行程全景點即時搜尋列 (Instant Spot & Place Search) */}
      <div className="relative">
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white dark:bg-[#1c1c1e] border border-slate-200/80 dark:border-white/10 shadow-2xs focus-within:ring-2 focus-within:ring-teal-500/50 focus-within:border-teal-500 transition">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={spotSearchQuery}
            onChange={(e) => setSpotSearchQuery(e.target.value)}
            placeholder={lang === 'zh' ? '搜尋景點、地點或備註...' : 'Search spots or notes...'}
            className="w-full bg-transparent text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden"
          />
          {spotSearchQuery && (
            <button
              type="button"
              onClick={() => setSpotSearchQuery('')}
              className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
              aria-label="清除搜尋"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 即時搜尋結果浮層 (Search Dropdown / Results Preview) */}
        {spotSearchQuery.trim() && (
          <div className="absolute top-full left-0 right-0 mt-1.5 z-30 max-h-80 overflow-y-auto rounded-2xl bg-white dark:bg-[#1c1c1e] border border-slate-200/90 dark:border-white/10 shadow-xl p-2 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="px-2.5 py-1 text-[11px] font-bold text-slate-400 flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-1.5">
              <span>搜尋結果 ({matchingSpots.length})</span>
            </div>

            {matchingSpots.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                找不到符合「{spotSearchQuery}」的景點或活動
              </div>
            ) : (
              matchingSpots.map(({ dayNumber, item }) => {
                const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP.spot;
                const CatIcon = cat.icon;
                return (
                  <button
                    key={`${dayNumber}-${item.id}`}
                    type="button"
                    onClick={() => handleJumpToSpot(dayNumber, item.id)}
                    className="w-full text-left p-2.5 rounded-xl hover:bg-teal-50/80 dark:hover:bg-teal-950/40 flex items-center justify-between gap-3 transition group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-300 group-hover:bg-teal-100 dark:group-hover:bg-teal-900/60 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition">
                        <CatIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-teal-700 dark:group-hover:text-teal-300">
                            {item.title}
                          </span>
                          <span className="text-[10px] font-mono font-medium text-slate-500 dark:text-slate-400">
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
                    <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 shrink-0 opacity-0 group-hover:opacity-100 transition">
                      跳轉 →
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* View Mode Switcher: 每日時序 vs 全程總覽大表 */}
      <div className="flex items-center justify-between gap-2 pb-1">
        <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTimelineViewMode('daily')}
            className={`px-3.5 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
              timelineViewMode === 'daily'
                ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 font-bold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Route className="w-3.5 h-3.5" />
            <span>{lang === 'zh' ? '每日時序' : 'Daily'}</span>
          </button>
          <button
            type="button"
            onClick={() => setTimelineViewMode('overview')}
            className={`px-3.5 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
              timelineViewMode === 'overview'
                ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 font-bold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{lang === 'zh' ? '行程總覽' : 'Overview'}</span>
          </button>
        </div>

        {timelineViewMode === 'daily' && (
          <button
            onClick={() => setIsMapExpanded(!isMapExpanded)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold shrink-0 transition"
          >
            <MapIcon className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>{isMapExpanded ? (lang === 'zh' ? '收合' : 'Hide') : (lang === 'zh' ? '地圖' : 'Map')}</span>
            {isMapExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* If overview mode: show ItineraryOverviewTable */}
      {timelineViewMode === 'overview' ? (
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
      ) : (
        <>
          {/* Interactive Map (When expanded) */}
          {isMapExpanded && (
            <LeafletMap
              items={activeDay.items}
              selectedItemId={selectedItemId}
              onSelectItem={(it) => setSelectedItemId(it.id)}
              isPickMode={isPickMode}
              onPickLocation={onPickLocation}
              pickedLocation={pickedCoords}
            />
          )}

          {/* Day Memories Banner (if any exist) */}
          {(() => {
            const dayMems = (trip.memories || []).filter((m) => m.dayNumber === activeDay.dayNumber);
            if (dayMems.length === 0) return null;
            return (
              <div
                onClick={() => onOpenMemories?.()}
                className="rounded-2xl p-3 bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/40 flex items-center justify-between cursor-pointer hover:bg-rose-50 transition shadow-2xs group"
              >
                <div className="flex items-center gap-2 text-xs">
                  <Camera className="w-4 h-4 text-rose-500" />
                  <span className="font-bold text-rose-900 dark:text-rose-200">
                    Day {activeDay.dayNumber} 相片 ({dayMems.length})
                  </span>
                </div>
                <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 group-hover:translate-x-0.5 transition flex items-center gap-1">
                  <span>相簿</span>
                  <span>→</span>
                </span>
              </div>
            );
          })()}

      {/* Active Day Header Bar */}
      <div id="day-schedule-section" className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 scroll-mt-20">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-bold text-teal-700 dark:text-teal-300">
              {t.day.replace('{n}', String(activeDay.dayNumber))}
            </span>
            <span>·</span>
            <span className="flex items-center gap-1 font-mono">
              <Calendar className="w-3.5 h-3.5" />
              {formatDateSlash(activeDay.date)}
            </span>
          </div>
          <h3 className="font-bold text-slate-900 dark:text-white text-base mt-1">
            {activeDay.theme || t.day.replace('{n}', String(activeDay.dayNumber))}
          </h3>
          {activeDay.notes && (
            <p className="text-slate-600 dark:text-slate-400 text-xs mt-1">
              {activeDay.notes}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onOpenAddItem(activeDay.dayNumber, getSuggestedNextStartTime(activeDay.items))}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{t.addSpot}</span>
          </button>
        </div>
      </div>

      {/* Timeline Items List */}
      {activeDay.items.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
          <p className="text-slate-500 dark:text-slate-400 text-xs">
            {lang === 'zh' ? '尚無行程安排' : 'No schedule yet.'}
          </p>
          <button
            onClick={() => onOpenAddItem(activeDay.dayNumber, '09:00')}
            className="mt-3 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.addSpot}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {activeDay.items.map((item, index) => {
            const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP.other;
            const catLabel = (t as any)[cat.labelKey] || cat.labelKey;
            const isSelected = item.id === selectedItemId;
            const pinColor = CATEGORY_COLORS[item.category] || '#0d9488';

            // Distance & Travel time to next spot
            const nextItem = activeDay.items[index + 1];
            let distanceInfo = null;
            if (item.lat && item.lng && nextItem && nextItem.lat && nextItem.lng) {
              const km = calculateDistanceKm(
                { lat: item.lat, lng: item.lng },
                { lat: nextItem.lat, lng: nextItem.lng }
              );
              const times = estimateTravelTime(km);
              distanceInfo = {
                distStr: formatDistance(km),
                walkingMin: times.walkingMin,
                transitMin: times.transitMin,
              };
            }

            return (
              <div key={item.id} className="space-y-2">
                {/* Spot Card */}
                <div
                  id={`spot-card-${item.id}`}
                  onClick={() => setSelectedItemId(item.id)}
                  className={`rounded-2xl p-4 sm:p-5 transition shadow-2xs border cursor-pointer ${
                    isSelected
                      ? 'border-teal-500 ring-2 ring-teal-500/20 shadow-md bg-white dark:bg-slate-900'
                      : item.completed
                      ? 'border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/20 dark:bg-emerald-950/20 shadow-xs'
                      : 'border-slate-200/80 dark:border-slate-800 bg-white/75 dark:bg-slate-900/60 opacity-85 hover:opacity-100 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3.5">
                    {/* Left Info with Map Pin Twin Badge */}
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      {/* Map Pin Matcher Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItemId(item.id);
                          if (typeof window !== 'undefined' && window.innerWidth < 768) {
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }
                        }}
                        title={lang === 'zh' ? `點擊在地圖定位第 ${index + 1} 站` : `Locate stop #${index + 1} on map`}
                        className="relative shrink-0 flex flex-col items-center group/pin transition-transform active:scale-95 cursor-pointer mt-0.5 select-none"
                      >
                        <div
                          style={{ backgroundColor: pinColor }}
                          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full text-white flex items-center justify-center font-black text-xs shadow-md border-2 border-white dark:border-slate-800 transition-all ${
                            isSelected
                              ? 'ring-4 ring-teal-400 scale-110 shadow-lg'
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

                      {/* Text details */}
                      <div className="space-y-1.5 flex-1 min-w-0">
                        {/* Quiet unboxed metadata */}
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium flex-wrap">
                          <span className="flex items-center gap-1 font-mono text-teal-700 dark:text-teal-400 font-semibold bg-teal-50/80 dark:bg-teal-950/40 px-2 py-0.5 rounded-md">
                            <Clock className="w-3.5 h-3.5" />
                            {item.startTime}
                            {item.endTime ? ` - ${item.endTime}` : ''}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className={`flex items-center gap-1 ${cat.text}`}>
                            <cat.icon className="w-3.5 h-3.5 shrink-0" />
                            <span>{catLabel}</span>
                          </span>
                          {item.bookingCode && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-amber-700 dark:text-amber-400 font-semibold">
                                #{item.bookingCode}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Spot Title (No line-through, elegant contrast) */}
                        <h4
                          className={`text-base sm:text-lg font-bold tracking-tight ${
                            item.completed
                              ? 'text-slate-900 dark:text-white'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {item.title}
                        </h4>

                        {/* Location Address */}
                        {(item.locationName || item.address) && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{item.locationName || item.address}</span>
                          </p>
                        )}

                      {/* Notes / Transport info */}
                      {item.transportNote && (
                        <p className="text-xs text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 p-2.5 rounded-xl border border-teal-100 dark:border-teal-900/60 flex items-start gap-1.5">
                          <Bus className="w-3.5 h-3.5 shrink-0 mt-0.5 text-teal-600 dark:text-teal-400" />
                          <span>{item.transportNote}</span>
                        </p>
                      )}

                      {item.notes && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                          {item.notes}
                        </p>
                      )}

                      {/* Spot Memory Photos Thumbnail Badges & Google Photos Original Link */}
                      {((item.memoryPhotos && item.memoryPhotos.length > 0) || item.googlePhotosUrl) && (
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
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
                                  className="relative group/thumb cursor-pointer transition hover:scale-105 active:scale-95 shrink-0"
                                  title="點擊開啟高畫質大圖檢視"
                                >
                                  <img
                                    src={photo}
                                    alt="Spot memory"
                                    className="w-10 h-10 rounded-lg object-cover border border-rose-200 dark:border-rose-900/60 shadow-xs"
                                  />
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOverlaySpotPhoto({ item, photoIndex: 0 });
                                }}
                                className="text-[10px] text-rose-600 dark:text-rose-400 font-bold shrink-0 flex items-center gap-1 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 px-2 py-1 rounded-lg transition active:scale-95 cursor-pointer"
                                title="點擊開啟相片檢視大圖"
                              >
                                <Camera className="w-3 h-3" />
                                <span>{item.memoryPhotos.length} 張</span>
                              </button>
                            </div>
                          )}

                          {item.googlePhotosUrl && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOverlaySpotPhoto({ item, photoIndex: 0 });
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 border border-teal-200/80 dark:border-teal-800/80 text-[11px] font-bold transition shadow-2xs active:scale-95 cursor-pointer"
                              title="點擊開啟 Google 相簿原始高畫質照片"
                            >
                              <ExternalLink className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                              <span>Google 相簿原圖</span>
                            </button>
                          )}
                        </div>
                      )}

                      {typeof item.cost === 'number' && item.cost > 0 && (
                        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-mono pt-0.5">
                          <DollarSign className="w-3.5 h-3.5 text-teal-600" />
                          <span>{trip.currency} {item.cost.toLocaleString()}</span>
                          <span className="text-[10px] text-slate-400">
                            ({item.costPaid ? (lang === 'zh' ? '已付款' : 'Paid') : (lang === 'zh' ? '現場付' : 'Unpaid')})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                    {/* Right Control Actions */}
                    <div className="flex items-center sm:flex-col gap-1.5 self-end sm:self-start shrink-0">
                      {/* Check-in toggle (Icon only, clean and quiet) */}
                      <button
                        type="button"
                        onClick={(e) => handleToggleComplete(item.id, e)}
                        className={`p-2 rounded-xl transition cursor-pointer flex items-center justify-center ${
                          item.completed
                            ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border border-emerald-300/60 dark:border-emerald-800'
                            : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 border border-slate-200/60 dark:border-slate-700'
                        }`}
                        title={item.completed ? (lang === 'zh' ? '已打勾（點擊取消）' : 'Completed') : (lang === 'zh' ? '點擊打勾' : 'Mark completed')}
                        aria-label={item.completed ? '已打勾' : '未打勾'}
                      >
                        {item.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 stroke-[2.4]" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-400" />
                        )}
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          disabled={index === 0}
                          onClick={() => handleMoveItem(index, 'up')}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20"
                          title={lang === 'zh' ? '上移' : 'Move up'}
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>

                        <button
                          disabled={index === activeDay.items.length - 1}
                          onClick={() => handleMoveItem(index, 'down')}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20"
                          title={lang === 'zh' ? '下移' : 'Move down'}
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onOpenEditItem(item, selectedDayNumber)}
                          className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title={lang === 'zh' ? '編輯' : 'Edit'}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          title={lang === 'zh' ? '刪除' : 'Delete'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Navigation and Location Bar */}
                  <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <a
                        href={getGoogleMapsNavigationUrl(item)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-2xs transition active:scale-95"
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
                          className="px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-semibold text-xs flex items-center gap-1.5 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition active:scale-95 border border-rose-200/80 dark:border-rose-800/60"
                          title="上傳或查看此景點回憶照片"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>
                            {item.memoryPhotos && item.memoryPhotos.length > 0
                              ? `${item.memoryPhotos.length} 張回憶`
                              : (lang === 'zh' ? '回憶相片' : 'Memories')}
                          </span>
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setSelectedItemId(item.id);
                        setIsMapExpanded(true);
                      }}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span>{t.locateMap}</span>
                    </button>
                  </div>
                </div>

                {/* Transit Step Connector & Inline Spot Insertion between cards */}
                {index < activeDay.items.length - 1 && (
                  <div className="py-1 px-4 flex flex-col items-center justify-center gap-1.5 group/connector">
                    {distanceInfo && (
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-medium bg-slate-100/80 dark:bg-slate-800/80 px-3 py-1 rounded-full border border-slate-200/60 dark:border-slate-700/60">
                        <Footprints className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        <span>{t.distToNext} {distanceInfo.distStr}</span>
                        <span aria-hidden="true">·</span>
                        <span>{t.walkMin.replace('{m}', String(distanceInfo.walkingMin))}</span>
                        <span aria-hidden="true">·</span>
                        <span>{t.driveMin.replace('{m}', String(distanceInfo.transitMin))}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenAddItem(activeDay.dayNumber, getBetweenTime(item, nextItem))}
                      className="opacity-75 sm:opacity-0 sm:group-hover/connector:opacity-100 hover:opacity-100 transition-all duration-200 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100/90 hover:bg-teal-50 dark:bg-slate-800/80 dark:hover:bg-teal-950/60 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-300 border border-slate-200/80 dark:border-slate-700 hover:border-teal-400 dark:hover:border-teal-600 shadow-2xs active:scale-95 cursor-pointer"
                      title={lang === 'zh' ? `在「${item.title}」與「${nextItem.title}」之間插入行程（依時間自動排入）` : 'Insert spot here'}
                    >
                      <Plus className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                      <span>{lang === 'zh' ? '在此處插入景點' : 'Insert spot here'}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Quick Add Next Spot Button at Bottom of List */}
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => onOpenAddItem(activeDay.dayNumber, getSuggestedNextStartTime(activeDay.items))}
              className="w-full py-3 px-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-teal-400 dark:hover:border-teal-600 hover:bg-teal-50/40 dark:hover:bg-teal-950/20 text-slate-500 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 font-semibold text-xs flex items-center justify-center gap-2 transition active:scale-[0.99]"
            >
              <Plus className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>{lang === 'zh' ? `新增第 ${activeDay.items.length + 1} 站行程景點（自動依時間排入）` : 'Add next spot'}</span>
            </button>
          </div>
        </div>
      )}
    </>
  )}

  {/* High-Resolution Photo Overlay for Timeline */}
  {overlaySpotPhoto && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/95 backdrop-blur-md animate-in fade-in duration-150"
      onClick={() => setOverlaySpotPhoto(null)}
    >
      <div
        className="max-w-4xl w-full bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-700/80 flex flex-col max-h-[95vh] relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Close Button & Action Bar */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsEditingOverlayGoogleUrl(!isEditingOverlayGoogleUrl)}
            className="px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/90 text-teal-300 hover:text-white text-xs font-semibold transition flex items-center gap-1.5 border border-white/20 shadow-sm"
            title="編輯此景點的 Google 相簿連結"
          >
            <Edit2 className="w-3 h-3" />
            <span className="hidden sm:inline">{isEditingOverlayGoogleUrl ? '收合編輯' : '修改原圖連結'}</span>
          </button>

          {overlaySpotPhoto.item.googlePhotosUrl && (
            <a
              href={overlaySpotPhoto.item.googlePhotosUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-full bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition flex items-center gap-1.5 border border-white/20 shadow-md backdrop-blur-md active:scale-95"
              title="開啟 Google 相簿檢視 4K / 原始超高畫質相片"
            >
              <ExternalLink className="w-3.5 h-3.5 text-white" />
              <span className="hidden sm:inline">在 Google 相簿開啟 (4K)</span>
              <span className="sm:hidden">4K 原圖</span>
            </a>
          )}

          <button
            type="button"
            onClick={() => setOverlaySpotPhoto(null)}
            className="p-2 rounded-full bg-black/60 text-white hover:bg-black/90 transition shadow-sm"
            title="關閉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Inline Edit Bar for Google Photos URL */}
        {isEditingOverlayGoogleUrl && (
          <div className="p-3 bg-slate-800/95 border-b border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 z-20 mt-12 sm:mt-14">
            <input
              type="url"
              value={overlayEditUrl}
              onChange={(e) => setOverlayEditUrl(e.target.value)}
              placeholder="貼上 Google 相簿分享或原始照片連結 (如 https://photos.app.goo.gl/...)"
              className="flex-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-xs outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-500"
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={handleSaveOverlayGoogleUrl}
                className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                <span>儲存連結</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEditingOverlayGoogleUrl(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs transition"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* Main Image Area with High-Resolution Source */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[300px] select-none p-2 sm:p-4">
          {/* Prev Button if multiple photos */}
          {overlaySpotPhoto.item.memoryPhotos && overlaySpotPhoto.item.memoryPhotos.length > 1 && (
            <button
              type="button"
              onClick={() => {
                const photos = overlaySpotPhoto.item.memoryPhotos!;
                const nextIdx = (overlaySpotPhoto.photoIndex - 1 + photos.length) % photos.length;
                setOverlaySpotPhoto({ ...overlaySpotPhoto, photoIndex: nextIdx });
              }}
              className="absolute left-2 sm:left-4 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition active:scale-90 border border-white/10"
              title="上一張"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {/* High-Resolution Image Display */}
          {(() => {
            const currentLocal = overlaySpotPhoto.item.memoryPhotos?.[overlaySpotPhoto.photoIndex];
            const highResUrl = overlaySpotPhoto.item.googlePhotosUrl;
            const canUseHighRes = Boolean(highResUrl) && !overlayHighResFailed;
            const activeSrc = canUseHighRes ? highResUrl! : (currentLocal || highResUrl || '');

            return (
              <div className="relative flex items-center justify-center max-h-[65vh]">
                <img
                  src={activeSrc}
                  alt={overlaySpotPhoto.item.title}
                  onError={() => {
                    if (canUseHighRes) setOverlayHighResFailed(true);
                  }}
                  className="max-h-[65vh] w-auto max-w-full object-contain rounded-xl"
                />
                {canUseHighRes ? (
                  <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[11px] font-bold text-teal-300 border border-teal-500/30 flex items-center gap-1.5 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                    <span>Google 相簿高解析度原圖</span>
                  </div>
                ) : highResUrl ? (
                  <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[11px] font-bold text-amber-300 border border-amber-500/30 flex items-center gap-1.5 shadow-sm">
                    <ExternalLink className="w-3 h-3 text-amber-400" />
                    <span>已連結 Google 相簿相簿</span>
                  </div>
                ) : null}
              </div>
            );
          })()}

          {/* Next Button if multiple photos */}
          {overlaySpotPhoto.item.memoryPhotos && overlaySpotPhoto.item.memoryPhotos.length > 1 && (
            <button
              type="button"
              onClick={() => {
                const photos = overlaySpotPhoto.item.memoryPhotos!;
                const nextIdx = (overlaySpotPhoto.photoIndex + 1) % photos.length;
                setOverlaySpotPhoto({ ...overlaySpotPhoto, photoIndex: nextIdx });
              }}
              className="absolute right-2 sm:right-4 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition active:scale-90 border border-white/10"
              title="下一張"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Thumbnail Strip if multiple photos */}
        {overlaySpotPhoto.item.memoryPhotos && overlaySpotPhoto.item.memoryPhotos.length > 1 && (
          <div className="px-4 py-2 bg-slate-950/80 border-t border-slate-800 flex items-center justify-center gap-2 overflow-x-auto">
            {overlaySpotPhoto.item.memoryPhotos.map((photo, pIdx) => (
              <button
                key={pIdx}
                type="button"
                onClick={() => setOverlaySpotPhoto({ ...overlaySpotPhoto, photoIndex: pIdx })}
                className={`relative w-12 h-12 rounded-xl overflow-hidden shrink-0 transition border-2 ${
                  pIdx === overlaySpotPhoto.photoIndex
                    ? 'border-teal-400 scale-105 shadow-md'
                    : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                <img src={photo} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Bottom Info Bar */}
        <div className="p-3.5 sm:p-4 bg-slate-900 text-white flex items-center justify-between gap-3 border-t border-slate-800">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base">{overlaySpotPhoto.item.memoryMood || '✨'}</span>
              <h4 className="font-bold text-sm text-white truncate">
                {overlaySpotPhoto.item.title}
              </h4>
              <span className="text-[10px] font-mono bg-teal-900/80 text-teal-200 px-2 py-0.5 rounded-full shrink-0">
                {overlaySpotPhoto.item.startTime}
              </span>
            </div>
            {(overlaySpotPhoto.item.notes || overlaySpotPhoto.item.memoryNotes) && (
              <p className="text-xs text-slate-300 italic truncate">
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
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold shrink-0 transition flex items-center gap-1"
              >
                <Camera className="w-3.5 h-3.5 text-rose-400" />
                <span>相簿專區</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setOverlaySpotPhoto(null)}
              className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-xs font-bold shrink-0 transition shadow-xs"
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
