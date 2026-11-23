import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Trip, ItineraryItem, CategoryType } from '../../types/itinerary';
import {
  getGoogleMapsNavigationUrl,
  calculateDistanceKm,
  formatDistance,
  isValidCoordinate,
} from '../../utils/geo';
import {
  formatDateSlash,
  formatMonthDaySlash,
  getTodayInTimezone,
  getCurrentMinutesInTimezone,
  normalizeDateKey,
  parseTimeToMinutes,
  getSuggestedNextStartTime,
} from '../../utils/date';
import { resolveDestinationTimezone } from '../../utils/timezone';
import { Language, TRANSLATIONS } from '../../utils/i18n';
import {
  WeatherData,
  DailyWeatherForecast,
  fetchCurrentWeather,
  fetchTripWeatherByDay,
  getBrowserCoordinates,
  geocodeCity,
  getWeatherDescription,
} from '../../utils/weather';
import { detectTripCurrency, convertAmount, formatCurrencyAmount } from '../../utils/currency';
import { copyTextToClipboard } from '../../utils/clipboard';
import {
  Navigation,
  Clock,
  MapPin,
  CheckCircle2,
  Circle,
  Bookmark,
  Bus,
  CloudSun,
  RefreshCw,
  LocateFixed,
  Umbrella,
  Info,
  FileText,
  DollarSign,
  Camera,
  ChevronDown,
  ChevronUp,
  Plus,
  Landmark,
  Utensils,
  Train,
  Hotel,
  ShoppingBag,
  Ticket,
  Copy,
  Check,
  Edit2,
  AlertCircle,
  ArrowUpRight,
} from 'lucide-react';
import { MediaImage } from '../UI/MediaImage';

interface LiveCompanionTabProps {
  trip: Trip;
  lang: Language;
  canEdit?: boolean;
  onUpdateTrip: (updatedTrip: Trip) => void;
  onNavigateToTimelineDay?: (dayNumber: number) => void;
  onOpenEditItem?: (item: ItineraryItem, dayNumber: number) => void;
  onOpenAddItem?: (dayNumber: number, suggestedStartTime?: string) => void;
  onOpenQuickAction?: (tab: 'expense' | 'todos') => void;
  requireAuth?: (action: () => void, reason?: string) => boolean;
}

const CATEGORY_TAGS: Record<CategoryType, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  spot: { label: '景點', Icon: Landmark },
  food: { label: '美食', Icon: Utensils },
  transport: { label: '交通', Icon: Train },
  hotel: { label: '住宿', Icon: Hotel },
  shopping: { label: '購物', Icon: ShoppingBag },
  activity: { label: '活動', Icon: Ticket },
  other: { label: '其他', Icon: Bookmark },
};

function formatDestClock(tz?: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || undefined,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
  } catch {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
}

export const LiveCompanionTab: React.FC<LiveCompanionTabProps> = ({
  trip,
  lang,
  canEdit = true,
  onUpdateTrip,
  onNavigateToTimelineDay,
  onOpenEditItem,
  onOpenAddItem,
  onOpenQuickAction,
  requireAuth,
}) => {
  const t = TRANSLATIONS[lang];
  const isZh = lang === 'zh' || lang === 'zh-CN';

  // Destination timezone from trip name or first valid coordinate
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

  const [destClock, setDestClock] = useState<string>(() => formatDestClock(destTzInfo.tz));
  const [nowMinutes, setNowMinutes] = useState<number>(() => getCurrentMinutesInTimezone(destTzInfo.tz));

  useEffect(() => {
    const updateClock = () => {
      setDestClock(formatDestClock(destTzInfo.tz));
      setNowMinutes(getCurrentMinutesInTimezone(destTzInfo.tz));
    };
    updateClock();
    const timer = setInterval(updateClock, 30000);
    return () => clearInterval(timer);
  }, [destTzInfo.tz]);

  const computeInitialDayNumber = (targetTrip: Trip, tz?: string) => {
    const today = getTodayInTimezone(tz);
    const match = (targetTrip.days || []).find((d) => normalizeDateKey(d.date) === today);
    if (match) return match.dayNumber;

    if (targetTrip.startDate && targetTrip.endDate) {
      const start = normalizeDateKey(targetTrip.startDate);
      const end = normalizeDateKey(targetTrip.endDate);
      if (today >= start && today <= end) {
        const upcoming = (targetTrip.days || []).find((d) => normalizeDateKey(d.date) >= today);
        if (upcoming) return upcoming.dayNumber;
      }
    }

    return targetTrip.days?.[0]?.dayNumber || 1;
  };

  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(() =>
    computeInitialDayNumber(trip, destTzInfo.tz)
  );

  // P0 FIX: Reset to today ONLY when switching trips (`trip.id`), NOT on every edit to `trip.days`!
  const prevTripIdRef = useRef<string>(trip.id);
  useEffect(() => {
    if (prevTripIdRef.current !== trip.id) {
      prevTripIdRef.current = trip.id;
      setSelectedDayNumber(computeInitialDayNumber(trip, destTzInfo.tz));
      setShowAllBookings(false);
    }
  }, [trip.id, destTzInfo.tz]);

  // Clamp cleanly only if currently viewed day was deleted
  useEffect(() => {
    if (trip.days.length > 0 && !trip.days.some((d) => d.dayNumber === selectedDayNumber)) {
      setSelectedDayNumber(trip.days[0].dayNumber);
    }
  }, [trip.days, selectedDayNumber]);

  const [expandedItemIds, setExpandedItemIds] = useState<Record<string, boolean>>({});
  const [showAllBookings, setShowAllBookings] = useState(false);

  // Weather States (supports live current weather AND day-specific forecasts when viewing future/past days)
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [dayForecast, setDayForecast] = useState<DailyWeatherForecast | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [weatherMode, setWeatherMode] = useState<'destination' | 'gps'>('destination');
  const [userGpsCoords, setUserGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isWeatherExpanded, setIsWeatherExpanded] = useState(false);
  const [copiedBookingKey, setCopiedBookingKey] = useState<string | null>(null);
  const weatherAbortRef = useRef<AbortController | null>(null);

  // Inline Day Theme & Notes Editing States
  const [isEditingFocus, setIsEditingFocus] = useState(false);
  const [focusThemeInput, setFocusThemeInput] = useState('');
  const [focusNotesInput, setFocusNotesInput] = useState('');

  useEffect(() => {
    setIsEditingFocus(false);
  }, [selectedDayNumber, trip.id]);

  const handleCopyBookingCode = async (code: string, keyId: string) => {
    const ok = await copyTextToClipboard(code);
    if (ok) {
      setCopiedBookingKey(keyId);
      setTimeout(() => setCopiedBookingKey((prev) => (prev === keyId ? null : prev)), 1800);
    }
  };

  const activeDay = trip.days.find((d) => d.dayNumber === selectedDayNumber) || trip.days[0] || {
    id: 'empty',
    dayNumber: 1,
    date: trip.startDate,
    items: [],
  };

  const destTodayStr = getTodayInTimezone(destTzInfo.tz);
  const activeDayDateKey = normalizeDateKey(activeDay.date) || destTodayStr;
  const isViewingToday = activeDayDateKey === destTodayStr;

  // Smart time-aware selection of "Now / Up Next" item
  const nextItem = useMemo(() => {
    const unchecked = activeDay.items.filter((it) => !it.completed);
    if (unchecked.length === 0) return null;
    if (!isViewingToday) return unchecked[0];

    // If an unchecked item is currently in progress, prioritize it first
    const inProgress = unchecked.find((it) => {
      const s = parseTimeToMinutes(it.startTime);
      const e = parseTimeToMinutes(it.endTime);
      if (s === 99999) return false;
      const effectiveEnd = e !== 99999 && e >= s ? e : s + 60;
      return nowMinutes >= s && nowMinutes <= effectiveEnd;
    });
    return inProgress || unchecked[0];
  }, [activeDay.items, isViewingToday, nowMinutes]);

  // Compute live schedule badge ("進行中" / "還有 X 分鐘" / "已過預定時間")
  const liveStatusChip = useMemo(() => {
    if (!nextItem || !isViewingToday) return null;
    const s = parseTimeToMinutes(nextItem.startTime);
    if (s === 99999) return null;
    const e = parseTimeToMinutes(nextItem.endTime);
    const effectiveEnd = e !== 99999 && e >= s ? e : s + 60;

    if (nowMinutes >= s && nowMinutes <= effectiveEnd) {
      return { kind: 'now' as const, label: isZh ? '正在進行中' : 'Happening Now' };
    }
    const diff = s - nowMinutes;
    if (diff > 0 && diff <= 180) {
      const hrs = Math.floor(diff / 60);
      const mins = diff % 60;
      const timeText = hrs > 0 ? `${hrs}h ${mins}m` : `${mins} ${isZh ? '分鐘' : 'min'}`;
      return { kind: 'soon' as const, label: isZh ? `${timeText}後開始` : `In ${timeText}` };
    }
    if (nowMinutes > effectiveEnd) {
      return { kind: 'late' as const, label: isZh ? '已過預定時段' : 'Past scheduled time' };
    }
    return null;
  }, [nextItem, isViewingToday, nowMinutes, isZh]);

  const completedCount = activeDay.items.filter((it) => it.completed).length;
  const totalCount = activeDay.items.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Daily expenses using normalized YYYY-MM-DD comparison
  const tripCurrency = trip.currency || detectTripCurrency(trip);
  const todayExpenses = useMemo(
    () => (trip.expenses || []).filter((e) => normalizeDateKey(e.date) === activeDayDateKey),
    [trip.expenses, activeDayDateKey]
  );
  const todayTotalSpent = useMemo(
    () =>
      todayExpenses.reduce(
        (sum, e) => sum + convertAmount(e.amount, e.currency || tripCurrency, tripCurrency, trip.customExchangeRates),
        0
      ),
    [todayExpenses, tripCurrency, trip.customExchangeRates]
  );

  const toggleItemExpanded = (id: string) => {
    setExpandedItemIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const resolveDestinationCoords = async (
    signal?: AbortSignal
  ): Promise<{ lat: number; lng: number; name: string } | null> => {
    if (nextItem && isValidCoordinate(nextItem.lat, nextItem.lng)) {
      return { lat: nextItem.lat!, lng: nextItem.lng!, name: nextItem.locationName || nextItem.title };
    }
    const dayItemWithCoords = activeDay.items.find((i) => isValidCoordinate(i.lat, i.lng));
    if (dayItemWithCoords) {
      return {
        lat: dayItemWithCoords.lat!,
        lng: dayItemWithCoords.lng!,
        name: dayItemWithCoords.locationName || dayItemWithCoords.title,
      };
    }
    if (firstTripCoords) {
      return { lat: firstTripCoords.lat, lng: firstTripCoords.lng, name: trip.destination };
    }
    if (trip.destination) {
      const geo = await geocodeCity(trip.destination, signal);
      if (geo) return geo;
    }
    return null;
  };

  // Fetch weather (live current weather for today; day forecast for non-today dates when available)
  const loadDestinationWeather = async (forceRefresh = false) => {
    weatherAbortRef.current?.abort();
    const controller = new AbortController();
    weatherAbortRef.current = controller;

    setIsWeatherLoading(true);
    setWeatherError(null);
    setDayForecast(null);

    try {
      const destCoords = await resolveDestinationCoords(controller.signal);
      if (controller.signal.aborted) return;

      if (!destCoords) {
        setWeather(null);
        setWeatherError(isZh ? '尚無座標，請在景點中設定地點或切換 GPS' : 'No trip coordinates set');
        return;
      }

      // If viewing a non-today day, try day-specific forecast first
      if (!isViewingToday && activeDay.date) {
        const dayMap = await fetchTripWeatherByDay(
          [{ dayNumber: activeDay.dayNumber, date: activeDay.date, items: activeDay.items }],
          trip.destination,
          destTzInfo.tz,
          controller.signal
        );
        if (controller.signal.aborted) return;
        const status = dayMap[activeDay.dayNumber];
        if (status?.status === 'ok' && status.forecast) {
          setDayForecast(status.forecast);
          setWeatherMode('destination');
        }
      }

      // Always fetch/load cached current destination weather as companion reference
      const data = await fetchCurrentWeather(
        destCoords.lat,
        destCoords.lng,
        destCoords.name,
        'destination',
        { forceRefresh, signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      setWeather(data);
      setWeatherMode('destination');
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.warn('Destination weather fetch error:', err);
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      setWeatherError(
        offline
          ? isZh
            ? '離線狀態：連線後將自動更新氣象'
            : 'Offline: weather updates when back online'
          : isZh
            ? '暫時無法連線至氣象服務，點擊重試'
            : 'Unable to load weather'
      );
    } finally {
      if (!controller.signal.aborted) {
        setIsWeatherLoading(false);
      }
    }
  };

  const loadGpsWeather = async (forceRefresh = false) => {
    weatherAbortRef.current?.abort();
    const controller = new AbortController();
    weatherAbortRef.current = controller;

    setIsWeatherLoading(true);
    setWeatherError(null);
    setDayForecast(null);

    try {
      const coords = await getBrowserCoordinates();
      if (controller.signal.aborted) return;
      setUserGpsCoords(coords);
      const data = await fetchCurrentWeather(
        coords.lat,
        coords.lng,
        isZh ? '目前 GPS 定位' : 'Current GPS Position',
        'gps',
        { forceRefresh, signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      setWeather(data);
      setWeatherMode('gps');
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.warn('Geolocation weather fetch error:', err);
      if (err?.code === 1) {
        setWeatherError(
          isZh
            ? '定位權限被拒：請於 iPhone「設定 > 隱私權與安全性 > 定位服務」開啟瀏覽器授權'
            : 'Location permission denied. Enable it in browser/device settings.'
        );
      } else if (err?.code === 3) {
        setWeatherError(isZh ? 'GPS 定位逾時，請移至戶外空曠處再試一次' : 'GPS timed out. Please retry.');
      } else if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setWeatherError(isZh ? '離線狀態無法更新即時 GPS 氣象' : 'Offline: cannot refresh live GPS weather');
      } else {
        setWeatherError(isZh ? '無法取得目前定位，已維持目的地氣象' : 'Unable to fetch GPS location');
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsWeatherLoading(false);
      }
    }
  };

  useEffect(() => {
    loadDestinationWeather(false);
    return () => {
      weatherAbortRef.current?.abort();
    };
  }, [selectedDayNumber, trip.id]);

  const handleToggleComplete = (itemId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleToggleComplete(itemId), isZh ? '打卡完成景點' : 'Check off spot')) {
      return;
    }
    const updatedDays = trip.days.map((day) => ({
      ...day,
      items: day.items.map((it) => (it.id === itemId ? { ...it, completed: !it.completed } : it)),
    }));
    onUpdateTrip({ ...trip, days: updatedDays, updatedAt: Date.now() });
  };

  const handleStartEditFocus = () => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(handleStartEditFocus, isZh ? '編輯今日焦點與備註' : 'Edit day focus')) {
      return;
    }
    setFocusThemeInput(activeDay.theme || '');
    setFocusNotesInput(activeDay.notes || '');
    setIsEditingFocus(true);
  };

  const handleSaveDayFocus = () => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(handleSaveDayFocus, isZh ? '儲存今日焦點與備註' : 'Save day focus')) {
      return;
    }
    const trimmedTheme = focusThemeInput.trim();
    const trimmedNotes = focusNotesInput.trim();
    const updatedDays = trip.days.map((d) =>
      d.dayNumber === activeDay.dayNumber
        ? { ...d, theme: trimmedTheme || undefined, notes: trimmedNotes || undefined }
        : d
    );
    onUpdateTrip({ ...trip, days: updatedDays, updatedAt: Date.now() });
    setIsEditingFocus(false);
  };

  // Distance from user's live GPS to next spot
  let gpsDistanceToSpot: string | null = null;
  if (userGpsCoords && nextItem && isValidCoordinate(nextItem.lat, nextItem.lng)) {
    const km = calculateDistanceKm(userGpsCoords, { lat: nextItem.lat!, lng: nextItem.lng! });
    gpsDistanceToSpot = formatDistance(km, lang);
  }

  // Decide displayed weather (day-specific forecast when browsing a non-today trip day, else live current weather)
  const showingDayForecast = Boolean(dayForecast && !isViewingToday && weatherMode === 'destination');
  const activeWeatherCode = showingDayForecast ? dayForecast!.weatherCode : weather?.weatherCode;
  const weatherDesc = activeWeatherCode !== undefined ? getWeatherDescription(activeWeatherCode, lang) : null;
  const activeRainProb = showingDayForecast ? dayForecast!.rainProbability : weather?.rainProbability ?? 0;

  let weatherAdvice = '';
  if (showingDayForecast && dayForecast) {
    if (dayForecast.rainProbability >= 40) {
      weatherAdvice = isZh ? '該日有較高降雨機率，建議備妥折疊傘或安排雨備' : 'Rain likely that day, pack an umbrella';
    } else if (dayForecast.maxTemp - dayForecast.minTemp >= 8) {
      weatherAdvice = isZh ? '該日早晚溫差較大，建議洋蔥式穿搭' : 'Large temperature swing, dress in layers';
    } else {
      weatherAdvice = isZh ? '氣候溫和舒適，適合安排戶外漫步行程' : 'Comfortable travel weather forecast';
    }
  } else if (weather) {
    if (weather.rainProbability >= 40) {
      weatherAdvice = isZh ? '今日降雨機率偏高，出門請攜帶折疊傘或雨具' : 'High chance of rain today, carry an umbrella';
    } else if (weather.maxTemp - weather.minTemp >= 8) {
      weatherAdvice = isZh ? '早晚溫差較大，建議隨身攜帶薄外套防風' : 'Noticeable day-night gap, pack a light jacket';
    } else if (weather.temperature >= 30) {
      weatherAdvice = isZh ? '氣候炎熱，請多補充水分並做好防曬' : 'Hot weather, stay hydrated and use sunscreen';
    } else if (weather.temperature <= 10) {
      weatherAdvice = isZh ? '氣溫偏低偏冷，請注意頭頸防寒保暖' : 'Cold temperatures, dress warmly in layers';
    } else {
      weatherAdvice = isZh ? '舒適宜人的旅遊好天氣，祝旅途愉快！' : 'Pleasant travel weather, enjoy your day!';
    }
  }

  return (
    <div className="space-y-4">
      {/* 1. Day Selector Ribbon + Live Destination Clock */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none flex-1 min-w-0">
          {trip.days.map((day) => {
            const isDayToday = normalizeDateKey(day.date) === destTodayStr;
            const isActive = day.dayNumber === selectedDayNumber;
            return (
              <button
                key={day.id}
                type="button"
                onClick={() => setSelectedDayNumber(day.dayNumber)}
                className={`min-h-[42px] sm:min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-2xs'
                    : isDayToday
                      ? 'bg-teal-50/80 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border border-teal-400/70 dark:border-teal-700'
                      : 'bg-white dark:bg-[#111827] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-[#E5E2DC] dark:border-slate-800'
                }`}
              >
                <span>D{day.dayNumber}</span>
                <span className="opacity-75 font-mono tabular-nums text-[10px]">{formatMonthDaySlash(day.date)}</span>
                {isDayToday && (
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-teal-200' : 'bg-teal-600 dark:bg-teal-400'}`} />
                )}
              </button>
            );
          })}
        </div>

        {/* Local Destination Clock Badge */}
        <div
          className="flex items-center gap-1 px-2.5 py-1.5 min-h-[38px] sm:min-h-[36px] rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 text-[11px] font-mono tabular-nums shrink-0"
          title={destTzInfo.label}
        >
          <span>{destTzInfo.flag}</span>
          <span className="font-bold text-slate-900 dark:text-white">{destClock}</span>
        </div>
      </div>

      {/* Responsive Workbench: Left Column | Right Column */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-5 space-y-3.5 lg:sticky lg:top-20">
          {/* 0. In-Transit Spending Snapshot */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 shadow-2xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200/70 dark:border-teal-800/70 flex items-center justify-center text-teal-700 dark:text-teal-400 shrink-0">
                <DollarSign className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums truncate">
                  {isViewingToday
                    ? `今日支出 (${todayExpenses.length})`
                    : `Day ${activeDay.dayNumber} · ${formatMonthDaySlash(activeDayDateKey)} 支出 (${todayExpenses.length})`}
                </div>
                <div className="text-base sm:text-lg font-black font-mono tabular-nums text-slate-900 dark:text-white">
                  {formatCurrencyAmount(todayTotalSpent, tripCurrency)}
                </div>
              </div>
            </div>

            {onOpenQuickAction && canEdit && (
              <button
                type="button"
                onClick={() => onOpenQuickAction('expense')}
                className="min-h-[42px] sm:min-h-[36px] px-3.5 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-xs shadow-2xs transition active:scale-95 flex items-center gap-1 shrink-0 cursor-pointer"
                title="記帳"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>記一筆</span>
              </button>
            )}
          </div>

          {/* 2. Daily Theme & Day Highlights Card (Inline Editable, fixed trailing middot) */}
          {(activeDay.theme || activeDay.notes || canEdit) && (
            <div className="rounded-2xl bg-[#FAF9F6] dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-3.5 sm:p-4 shadow-2xs">
              {isEditingFocus ? (
                <div className="space-y-2.5 text-xs animate-in fade-in duration-100">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{isZh ? `Day ${activeDay.dayNumber} 焦點與備註` : `Day ${activeDay.dayNumber} Focus & Notes`}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditingFocus(false)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-2 py-1 rounded-lg cursor-pointer"
                    >
                      {isZh ? '取消' : 'Cancel'}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={focusThemeInput}
                    onChange={(e) => setFocusThemeInput(e.target.value)}
                    placeholder={isZh ? '今日主題（例如：京都古寺巡禮）' : 'Day focus title...'}
                    className="w-full min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-[16px] sm:text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-teal-600"
                  />
                  <textarea
                    rows={2}
                    value={focusNotesInput}
                    onChange={(e) => setFocusNotesInput(e.target.value)}
                    placeholder={isZh ? '提醒事項（例如：記得帶 ICOCA、提前預約車票）' : 'Day notes...'}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-[16px] sm:text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-teal-600 resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleSaveDayFocus}
                      className="min-h-[42px] sm:min-h-[36px] px-4 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition active:scale-95 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isZh ? '儲存焦點' : 'Save'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className="p-2 rounded-xl bg-teal-700 dark:bg-teal-600 text-white shrink-0 mt-0.5 shadow-2xs">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className="text-[11px] font-bold text-teal-700 dark:text-teal-400">
                          {isViewingToday ? (isZh ? '今日焦點' : 'Today Focus') : `Day ${activeDay.dayNumber} 焦點`}
                        </span>
                        {activeDay.theme?.trim() ? (
                          <>
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                            <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                              {activeDay.theme.trim()}
                            </h4>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">
                            {isZh ? '尚未設定主題' : 'No focus set'}
                          </span>
                        )}
                      </div>
                      {activeDay.notes && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mt-1 flex items-start gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                          <span>{activeDay.notes}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={handleStartEditFocus}
                      className="min-w-[40px] min-h-[40px] sm:min-w-[34px] sm:min-h-[34px] flex items-center justify-center rounded-xl text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-[#E5E2DC] dark:hover:border-slate-700 transition shrink-0 cursor-pointer"
                      title={isZh ? '編輯焦點與備註' : 'Edit day focus'}
                      aria-label={isZh ? '編輯焦點與備註' : 'Edit day focus'}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. Micro Weather Capsule (Visible error states, Day forecast support, Stale offline cache) */}
          <div className="rounded-2xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 shadow-2xs overflow-hidden transition-all duration-200">
            <div className="p-3 sm:px-4 sm:py-3 flex items-center justify-between gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => setIsWeatherExpanded(!isWeatherExpanded)}
                className="flex items-center gap-2 min-w-0 text-left hover:opacity-85 transition group cursor-pointer flex-1"
              >
                <span className="text-xl shrink-0 select-none flex items-center justify-center">
                  {weatherDesc?.icon || <CloudSun className="w-5 h-5 text-teal-700 dark:text-teal-400" />}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap text-xs text-slate-700 dark:text-slate-300 min-w-0">
                  <span className="font-black font-mono tabular-nums text-sm sm:text-base text-slate-900 dark:text-white">
                    {showingDayForecast
                      ? `${dayForecast!.minTemp}°~${dayForecast!.maxTemp}°C`
                      : weather
                        ? `${weather.temperature}°C`
                        : isWeatherLoading
                          ? '...'
                          : '--°C'}
                  </span>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {weatherDesc?.label || (isWeatherLoading ? '更新中' : '氣象預報')}
                  </span>
                  {(showingDayForecast || weather) && (
                    <>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span className="text-teal-700 dark:text-teal-400 font-medium font-mono tabular-nums flex items-center gap-0.5">
                        <Umbrella className="w-3 h-3" />
                        <span>{activeRainProb}%</span>
                      </span>
                    </>
                  )}
                  {weather?.isStale && !showingDayForecast && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-semibold">
                      離線快取
                    </span>
                  )}
                </div>
                <span className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition shrink-0">
                  {isWeatherExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
              </button>

              <div className="flex items-center gap-1.5 shrink-0">
                {weatherMode === 'destination' ? (
                  <button
                    type="button"
                    onClick={() => loadGpsWeather(true)}
                    disabled={isWeatherLoading}
                    className="min-h-[38px] sm:min-h-[34px] px-2.5 py-1 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs sm:text-[11px] font-semibold flex items-center gap-1 transition active:scale-95 cursor-pointer"
                    title={t.useGpsLocation}
                  >
                    <LocateFixed className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                    <span>GPS</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => loadDestinationWeather(true)}
                    disabled={isWeatherLoading}
                    className="min-h-[38px] sm:min-h-[34px] px-2.5 py-1 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/50 hover:bg-teal-100/60 text-teal-800 dark:text-teal-200 text-xs sm:text-[11px] font-semibold flex items-center gap-1 transition active:scale-95 cursor-pointer"
                    title={t.useDestination}
                  >
                    <MapPin className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                    <span>景點</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => (weatherMode === 'destination' ? loadDestinationWeather(true) : loadGpsWeather(true))}
                  disabled={isWeatherLoading}
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#E5E2DC] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition cursor-pointer"
                  title="重新整理氣象"
                  aria-label="重新整理氣象"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isWeatherLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Always surface weather/GPS error visibly even when capsule is collapsed */}
            {weatherError && (
              <div className="px-3.5 py-2 bg-amber-50/70 dark:bg-amber-950/30 border-t border-amber-200/70 dark:border-amber-900/50 text-[11px] text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2">
                <div className="flex items-start gap-1.5 min-w-0">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="leading-snug">{weatherError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => loadDestinationWeather(true)}
                  className="px-2.5 py-1 rounded-lg bg-amber-700 text-white font-bold text-[10px] shrink-0 cursor-pointer"
                >
                  重試
                </button>
              </div>
            )}

            {isWeatherExpanded && (
              <div className="px-4 pb-3.5 pt-2.5 border-t border-[#E5E2DC] dark:border-slate-800 space-y-2.5 animate-in fade-in duration-150">
                {isWeatherLoading && !weather && !dayForecast ? (
                  <div className="py-3 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-700 dark:text-teal-400" />
                    <span>{t.fetchingWeather}</span>
                  </div>
                ) : weather ? (
                  <>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                      <span className="truncate">
                        📍 {showingDayForecast ? dayForecast!.locationName : weather.locationName}
                      </span>
                      <span className="font-mono text-[10px] shrink-0">
                        {showingDayForecast
                          ? dayForecast!.source === 'archive'
                            ? '當日歷史實測'
                            : `Day ${activeDay.dayNumber} 預報`
                          : '目前即時天氣'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 rounded-xl bg-[#FAF9F6] dark:bg-slate-900/60 border border-[#E5E2DC]/80 dark:border-slate-800 divide-y sm:divide-y-0 sm:divide-x divide-[#E5E2DC]/70 dark:divide-slate-800 text-xs overflow-hidden">
                      <div className="px-3 py-2 max-sm:border-r max-sm:border-[#E5E2DC]/70 max-sm:dark:border-slate-800">
                        <span className="text-slate-400 text-[10px] block">體感溫度</span>
                        <span className="font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200">
                          {weather.apparentTemperature}°C
                        </span>
                      </div>
                      <div className="px-3 py-2">
                        <span className="text-slate-400 text-[10px] block">最高 / 最低</span>
                        <span className="font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200">
                          {showingDayForecast ? `${dayForecast!.maxTemp}° / ${dayForecast!.minTemp}°` : `${weather.maxTemp}° / ${weather.minTemp}°`}
                        </span>
                      </div>
                      <div className="px-3 py-2 max-sm:border-r max-sm:border-[#E5E2DC]/70 max-sm:dark:border-slate-800">
                        <span className="text-slate-400 text-[10px] block">濕度</span>
                        <span className="font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200">
                          {weather.humidity}%
                        </span>
                      </div>
                      <div className="px-3 py-2">
                        <span className="text-slate-400 text-[10px] block">風速</span>
                        <span className="font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200">
                          {showingDayForecast ? dayForecast!.windSpeedMax : weather.windSpeed} km/h
                        </span>
                      </div>
                    </div>

                    {weatherAdvice && (
                      <div className="pt-2 border-t border-[#E5E2DC]/70 dark:border-slate-800 text-xs text-teal-800 dark:text-teal-200 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Info className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
                          <span className="truncate">{weatherAdvice}</span>
                        </div>
                        {gpsDistanceToSpot && (
                          <span className="font-mono tabular-nums font-bold text-teal-700 dark:text-teal-300 shrink-0 text-[11px]">
                            · 距下站 {gpsDistanceToSpot}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </div>

          {/* 4. Hero "Up Next" Card — Refined Light & Dark Editorial Theme */}
          {nextItem ? (
            <div className="rounded-3xl bg-gradient-to-br from-[#F0FDFA] via-white to-[#FAF9F6] dark:from-[#0E1E22] dark:via-[#111827] dark:to-[#0D1320] border border-teal-200/90 dark:border-teal-800/60 text-slate-900 dark:text-white p-5 sm:p-6 shadow-sm relative overflow-hidden">
              {/* Top Teal Editorial Accent Bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-600 via-teal-500 to-emerald-500" />

              <div className="flex items-center justify-between text-xs font-semibold mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-teal-700 dark:text-teal-400">
                    <Navigation className="w-3.5 h-3.5" />
                    <span>{liveStatusChip?.kind === 'now' ? (isZh ? '現在行程' : 'Now') : t.upNext}</span>
                  </span>
                  {liveStatusChip && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        liveStatusChip.kind === 'now'
                          ? 'bg-teal-700 text-white'
                          : liveStatusChip.kind === 'soon'
                            ? 'bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300'
                            : 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300'
                      }`}
                    >
                      {liveStatusChip.label}
                    </span>
                  )}
                  {nextItem.category && CATEGORY_TAGS[nextItem.category] && (
                    <span className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1 font-medium">
                      {React.createElement(CATEGORY_TAGS[nextItem.category].Icon, {
                        className: 'w-3 h-3 text-teal-700 dark:text-teal-400',
                      })}
                      <span>{CATEGORY_TAGS[nextItem.category].label}</span>
                    </span>
                  )}
                </div>

                {nextItem.startTime && (
                  <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 flex items-center gap-1 text-xs font-bold">
                    <Clock className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                    <span>{nextItem.startTime}</span>
                    {nextItem.endTime ? <span>~ {nextItem.endTime}</span> : ''}
                  </span>
                )}
              </div>

              <h3 className="font-black text-xl sm:text-2xl mt-1 tracking-tight text-slate-900 dark:text-white">
                {nextItem.title}
              </h3>

              {(nextItem.locationName || nextItem.address) && (
                <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm flex items-center gap-1.5 mt-1.5">
                  <MapPin className="w-4 h-4 shrink-0 text-teal-700 dark:text-teal-400" />
                  <span className="truncate">{nextItem.locationName || nextItem.address}</span>
                </p>
              )}

              {nextItem.notes && (
                <div className="mt-3 pt-3 border-t border-teal-200/60 dark:border-slate-800 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-teal-700 dark:text-teal-300 font-bold text-[11px]">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{isZh ? '重點備註' : 'Notes'}</span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-200 text-xs leading-relaxed whitespace-pre-wrap">
                    {nextItem.notes}
                  </p>
                </div>
              )}

              {nextItem.transportNote && (
                <div className="mt-3 pt-3 border-t border-teal-200/60 dark:border-slate-800 text-slate-700 dark:text-slate-100 text-xs flex items-start gap-2">
                  <Bus className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-[11px] text-teal-700 dark:text-teal-300 block">
                      {isZh ? '交通指引' : 'Transit'}
                    </span>
                    <span>{nextItem.transportNote}</span>
                  </div>
                </div>
              )}

              {(nextItem.bookingCode || (typeof nextItem.cost === 'number' && nextItem.cost > 0)) && (
                <div className="flex items-center gap-2 flex-wrap mt-3 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  {nextItem.bookingCode && (
                    <span className="inline-flex items-center gap-1 text-teal-800 dark:text-teal-300 font-bold">
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>#{nextItem.bookingCode}</span>
                    </span>
                  )}
                  {nextItem.bookingCode && typeof nextItem.cost === 'number' && nextItem.cost > 0 && (
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
                  )}
                  {typeof nextItem.cost === 'number' && nextItem.cost > 0 && (
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <DollarSign className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                      <span>預估 {formatCurrencyAmount(nextItem.cost, trip.currency || tripCurrency)}</span>
                    </span>
                  )}
                </div>
              )}

              {/* Action Buttons: Google Maps, Edit, Check Off */}
              <div className="mt-5 space-y-2">
                <a
                  href={getGoogleMapsNavigationUrl(nextItem)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition active:scale-95"
                >
                  <Navigation className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t.navGoogle}</span>
                </a>

                {canEdit && (
                  <div className={`grid gap-2 ${onOpenEditItem ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {onOpenEditItem && (
                      <button
                        type="button"
                        onClick={() => onOpenEditItem(nextItem, activeDay.dayNumber)}
                        className="min-h-[42px] py-2 px-3 rounded-xl bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-100 font-bold text-xs flex items-center justify-center gap-1.5 border border-[#E5E2DC] dark:border-slate-700 transition active:scale-95 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
                        <span>{isZh ? '編輯景點' : 'Edit'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleToggleComplete(nextItem.id, e)}
                      className="min-h-[42px] py-2 px-3 rounded-xl bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-200 font-bold text-xs flex items-center justify-center gap-1.5 border border-teal-200 dark:border-teal-800 transition active:scale-95 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                      <span>{t.checked}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-3xl bg-teal-50/90 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800/60 text-teal-900 dark:text-teal-100 p-6 shadow-xs text-center">
              <h3 className="font-bold text-base flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-teal-700 dark:text-teal-400" />
                <span>{totalCount === 0 ? (isZh ? '本日尚無排定景點' : 'No spots planned today') : t.doneToday}</span>
              </h3>
            </div>
          )}

          {/* Today's Key Booking Codes Quick-Copy Strip (Normalized dates + Expand All toggle) */}
          {(() => {
            const dayBookings: Array<{ id: string; title: string; code: string; sub?: string }> = [];
            activeDay.items.forEach((it) => {
              if (it.bookingCode && it.bookingCode.trim()) {
                dayBookings.push({
                  id: `it-${it.id}`,
                  title: it.title,
                  code: it.bookingCode.trim(),
                  sub: it.startTime || undefined,
                });
              }
            });
            (trip.bookings || []).forEach((b) => {
              const bStart = normalizeDateKey(b.startDate);
              const bEnd = normalizeDateKey(b.endDate);
              const matchesDay = b.dayNumber === activeDay.dayNumber || (bStart && bStart === activeDayDateKey);
              const spansDay = Boolean(bStart && bEnd && activeDayDateKey >= bStart && activeDayDateKey <= bEnd);
              if (matchesDay || spansDay || (!b.dayNumber && !bStart)) {
                dayBookings.push({
                  id: `bk-${b.id}`,
                  title: b.title,
                  code: b.bookingCode,
                  sub: b.secondaryCode || b.timeLabel,
                });
              }
            });

            if (dayBookings.length === 0) return null;
            const visibleBookings = showAllBookings ? dayBookings : dayBookings.slice(0, 5);

            return (
              <div className="rounded-2xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 shadow-2xs overflow-hidden">
                <div className="px-4 py-3 border-b border-[#E5E2DC]/80 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
                  <span className="flex items-center gap-1.5">
                    <Ticket className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                    <span>{isZh ? '訂位代號速查' : 'Booking Codes'}</span>
                  </span>
                  <span className="font-mono tabular-nums text-[11px] text-slate-400">
                    {dayBookings.length}
                  </span>
                </div>
                <div className="divide-y divide-[#E5E2DC]/75 dark:divide-slate-800">
                  {visibleBookings.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-2.5 px-4 py-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {entry.title}
                        </div>
                        <div className="font-mono tabular-nums text-[11px] text-teal-700 dark:text-teal-400 font-bold truncate">
                          {entry.code}
                          {entry.sub ? ` · ${entry.sub}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyBookingCode(entry.code, entry.id)}
                        className={`min-h-[38px] sm:min-h-[34px] px-3 rounded-xl text-xs sm:text-[11px] font-bold flex items-center gap-1 shrink-0 transition cursor-pointer ${
                          copiedBookingKey === entry.id
                            ? 'bg-teal-700 text-white'
                            : 'bg-[#FAF9F6] dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-teal-600'
                        }`}
                      >
                        {copiedBookingKey === entry.id ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>{isZh ? '已複製' : 'Copied'}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                            <span>{isZh ? '複製' : 'Copy'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
                {dayBookings.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllBookings((prev) => !prev)}
                    className="w-full py-2.5 text-xs font-bold text-teal-700 dark:text-teal-400 bg-[#FAF9F6] dark:bg-slate-900/50 border-t border-[#E5E2DC]/80 dark:border-slate-800 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition cursor-pointer"
                  >
                    {showAllBookings
                      ? isZh ? '收合清單' : 'Show less'
                      : isZh
                        ? `查看全部 ${dayBookings.length} 筆憑證代號`
                        : `View all ${dayBookings.length} codes`}
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        {/* 5. Progress & Complete Day Itinerary Checklist */}
        <div className="lg:col-span-7 bg-white dark:bg-[#111827] rounded-3xl p-4 sm:p-6 border border-[#E5E2DC] dark:border-slate-800 shadow-2xs space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#E5E2DC] dark:border-slate-800 flex-wrap">
            <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
              {t.day.replace('{n}', String(activeDay.dayNumber))} ({formatDateSlash(activeDay.date)}) {isZh ? '行程清單' : 'Itinerary'}
            </h4>
            <div className="flex items-center gap-3 shrink-0">
              <span className="font-mono tabular-nums font-bold text-xs text-teal-700 dark:text-teal-400">
                {completedCount} / {totalCount} · {progressPercent}%
              </span>
              {onNavigateToTimelineDay && (
                <button
                  type="button"
                  onClick={() => onNavigateToTimelineDay(activeDay.dayNumber)}
                  className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-400 flex items-center gap-0.5 cursor-pointer"
                >
                  <span>完整時序</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="w-full bg-[#FAF9F6] dark:bg-slate-800 border border-[#E5E2DC]/60 dark:border-slate-700/50 h-2 rounded-full overflow-hidden">
            <div
              className="bg-teal-700 dark:bg-teal-500 h-full transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="space-y-3 pt-1">
            {activeDay.items.map((item) => {
              const isExpanded = expandedItemIds[item.id] ?? true;
              const catTag = CATEGORY_TAGS[item.category] || CATEGORY_TAGS.spot;

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl p-3.5 sm:p-4 border transition ${
                    item.completed
                      ? 'bg-[#FAF9F6] dark:bg-slate-900/40 border-[#E5E2DC]/70 dark:border-slate-800 opacity-65'
                      : 'bg-white dark:bg-[#111827] border-[#E5E2DC] dark:border-slate-800 shadow-2xs hover:border-teal-600/50 dark:hover:border-teal-500/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-1.5 flex-1 min-w-0">
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={(e) => handleToggleComplete(item.id, e)}
                        className={`w-11 h-11 sm:w-9 sm:h-9 -ml-2 -mt-1.5 flex items-center justify-center rounded-xl shrink-0 text-slate-400 transition ${
                          canEdit
                            ? 'hover:text-teal-700 dark:hover:text-teal-400 hover:bg-slate-100/70 dark:hover:bg-slate-800 cursor-pointer'
                            : 'cursor-default opacity-80'
                        }`}
                        title={item.completed ? '標記為未完成' : '標記為已造訪'}
                      >
                        {item.completed ? (
                          <CheckCircle2 className="w-5 h-5 text-teal-700 dark:text-teal-400" />
                        ) : (
                          <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1 text-xs">
                          {item.startTime && (
                            <>
                              <span className="font-mono tabular-nums font-bold text-teal-700 dark:text-teal-400">
                                {item.startTime}{item.endTime ? ` ~ ${item.endTime}` : ''}
                              </span>
                              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
                            </>
                          )}
                          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 inline-flex items-center gap-1">
                            <catTag.Icon className="w-3 h-3 text-teal-700 dark:text-teal-400" />
                            <span>{catTag.label}</span>
                          </span>
                          {item.bookingCode && (
                            <>
                              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
                              <span className="text-[11px] font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1">
                                <Bookmark className="w-3 h-3 text-teal-700 dark:text-teal-400" />
                                <span>#{item.bookingCode}</span>
                              </span>
                            </>
                          )}
                        </div>

                        <h5
                          onClick={(e) => canEdit && handleToggleComplete(item.id, e)}
                          className={`text-sm sm:text-base font-bold transition ${
                            canEdit ? 'cursor-pointer hover:text-teal-700 dark:hover:text-teal-300' : 'cursor-default'
                          } ${
                            item.completed
                              ? 'line-through text-slate-400 dark:text-slate-500'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {item.title}
                        </h5>

                        {(item.locationName || item.address) && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                            <MapPin className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
                            <span className="truncate">{item.locationName || item.address}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={getGoogleMapsNavigationUrl(item)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 border border-teal-200/70 dark:border-teal-800/60 transition active:scale-95"
                        title={t.navGoogle}
                      >
                        <Navigation className="w-4 h-4" />
                      </a>
                      {canEdit && onOpenEditItem && (
                        <button
                          type="button"
                          onClick={() => onOpenEditItem(item, activeDay.dayNumber)}
                          className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-[#FAF9F6] dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-300 hover:border-teal-500/60 transition active:scale-95 cursor-pointer"
                          title={isZh ? '編輯景點資訊' : 'Edit spot'}
                          aria-label={isZh ? '編輯景點資訊' : 'Edit spot'}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      {(item.notes || item.transportNote) && (
                        <button
                          type="button"
                          onClick={() => toggleItemExpanded(item.id)}
                          className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-[#FAF9F6] dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
                          title={isExpanded ? '收合說明' : '展開說明'}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (item.notes || item.transportNote || item.cost || (item.memoryPhotos && item.memoryPhotos.length > 0)) && (
                    <div className="mt-3 pt-2.5 border-t border-[#E5E2DC] dark:border-slate-800 divide-y divide-[#E5E2DC]/65 dark:divide-slate-800/80 text-xs">
                      {item.notes && (
                        <div className="py-2 first:pt-0">
                          <div className="flex items-center gap-1 text-[11px] font-bold text-teal-700 dark:text-teal-400 mb-1">
                            <FileText className="w-3.5 h-3.5" />
                            <span>{isZh ? '備註' : 'Notes'}</span>
                          </div>
                          <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap text-xs">
                            {item.notes}
                          </p>
                        </div>
                      )}

                      {item.transportNote && (
                        <div className="py-2 first:pt-0 text-teal-900 dark:text-teal-200 text-xs flex items-start gap-2">
                          <Bus className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-teal-800 dark:text-teal-300 mr-1.5">
                              {isZh ? '交通' : 'Transit'} ·
                            </span>
                            <span>{item.transportNote}</span>
                          </div>
                        </div>
                      )}

                      {typeof item.cost === 'number' && item.cost > 0 && (
                        <div className="py-2 first:pt-0 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <DollarSign className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                          <span>
                            {isZh ? '預估費用' : 'Cost'} ·{' '}
                            <strong className="text-slate-800 dark:text-slate-200 font-mono tabular-nums">
                              {formatCurrencyAmount(item.cost, trip.currency || tripCurrency)}
                            </strong>
                          </span>
                        </div>
                      )}

                      {item.memoryPhotos && item.memoryPhotos.length > 0 && (
                        <div className="pt-2 border-t border-[#E5E2DC] dark:border-slate-800">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-teal-700 dark:text-teal-400 mb-1.5">
                            <Camera className="w-3.5 h-3.5" />
                            <span className="font-mono tabular-nums">打卡回憶相片 ({item.memoryPhotos.length})</span>
                          </div>
                          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                            {item.memoryPhotos.map((photo, pIdx) => (
                              <MediaImage
                                key={pIdx}
                                tripId={trip.id}
                                ownerId={trip.ownerId}
                                collabId={trip.collabId}
                                src={photo}
                                alt="Memory photo"
                                className="w-14 h-14 rounded-xl object-cover border border-[#E5E2DC] dark:border-slate-700 shadow-2xs shrink-0"
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {canEdit && onOpenAddItem && (
              <button
                type="button"
                onClick={() => onOpenAddItem(activeDay.dayNumber, getSuggestedNextStartTime(activeDay.items))}
                className="w-full min-h-[44px] py-3 px-4 rounded-2xl border-2 border-dashed border-[#E5E2DC] dark:border-slate-700 hover:border-teal-600/60 dark:hover:border-teal-500/60 hover:bg-teal-50/40 dark:hover:bg-teal-950/20 text-slate-600 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-300 text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-98 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <span>{isZh ? `新增 Day ${activeDay.dayNumber} 行程景點` : `Add Spot to Day ${activeDay.dayNumber}`}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
