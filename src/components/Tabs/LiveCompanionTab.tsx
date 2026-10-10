import React, { useState, useEffect } from 'react';
import { Trip, ItineraryItem, CategoryType } from '../../types/itinerary';
import { getGoogleMapsNavigationUrl, calculateDistanceKm, formatDistance } from '../../utils/geo';
import { formatDateSlash, formatMonthDaySlash } from '../../utils/date';
import { Language, TRANSLATIONS } from '../../utils/i18n';
import {
  WeatherData,
  fetchCurrentWeather,
  getBrowserCoordinates,
  geocodeCity,
  getWeatherDescription,
} from '../../utils/weather';
import { TaxiShowCardModal } from '../UI/TaxiShowCardModal';
import { detectTripCurrency } from '../../utils/currency';
import {
  Navigation,
  Clock,
  MapPin,
  CheckCircle2,
  Circle,
  Bookmark,
  Bus,
  Sparkles,
  CloudSun,
  RefreshCw,
  LocateFixed,
  Compass,
  Droplets,
  Wind,
  Umbrella,
  Thermometer,
  AlertTriangle,
  Info,
  FileText,
  DollarSign,
  Camera,
  ChevronDown,
  ChevronUp,
  Phone,
  ShieldAlert,
  Plus,
} from 'lucide-react';

interface LiveCompanionTabProps {
  trip: Trip;
  lang: Language;
  onUpdateTrip: (updatedTrip: Trip) => void;
  onNavigateToTimelineDay?: (dayNumber: number) => void;
  onOpenQuickAction?: (tab: 'calc' | 'expense' | 'scratchpad') => void;
}

const CATEGORY_TAGS: Record<CategoryType, { label: string; icon: string; badgeClass: string }> = {
  spot: { label: '景點', icon: '🏛️', badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  food: { label: '美食', icon: '🍜', badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  transport: { label: '交通', icon: '🚄', badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  hotel: { label: '住宿', icon: '🏨', badgeClass: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
  shopping: { label: '購物', icon: '🛍️', badgeClass: 'bg-pink-50 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300 border-pink-200 dark:border-pink-800' },
  activity: { label: '活動', icon: '🎟️', badgeClass: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800' },
  other: { label: '其他', icon: '📌', badgeClass: 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700' },
};

export const LiveCompanionTab: React.FC<LiveCompanionTabProps> = ({
  trip,
  lang,
  onUpdateTrip,
  onOpenQuickAction,
}) => {
  const t = TRANSLATIONS[lang];
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(1);
  const [expandedItemIds, setExpandedItemIds] = useState<Record<string, boolean>>({});

  // Taxi Show Card Modal state
  const [showTaxiCard, setShowTaxiCard] = useState(false);
  const [taxiCardItem, setTaxiCardItem] = useState<ItineraryItem | null>(null);

  // Live Clocks (Destination vs Home)
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Determine destination timezone
  const getDestinationTimeZone = () => {
    const dest = (trip.destination || '').toLowerCase();
    if (
      dest.includes('日本') ||
      dest.includes('東京') ||
      dest.includes('金澤') ||
      dest.includes('大阪') ||
      dest.includes('京都') ||
      dest.includes('名古屋') ||
      dest.includes('福岡') ||
      dest.includes('沖繩') ||
      dest.includes('北海道') ||
      dest.includes('japan')
    ) {
      return { tz: 'Asia/Tokyo', flag: '🇯🇵', label: '日本時間 (JST)' };
    }
    if (dest.includes('韓國') || dest.includes('首爾') || dest.includes('釜山') || dest.includes('korea')) {
      return { tz: 'Asia/Seoul', flag: '🇰🇷', label: '韓國時間 (KST)' };
    }
    if (dest.includes('巴黎') || dest.includes('法國') || dest.includes('paris') || dest.includes('france')) {
      return { tz: 'Europe/Paris', flag: '🇫🇷', label: '巴黎時間 (CET)' };
    }
    if (dest.includes('倫敦') || dest.includes('英國') || dest.includes('london') || dest.includes('uk')) {
      return { tz: 'Europe/London', flag: '🇬🇧', label: '倫敦時間 (GMT)' };
    }
    if (dest.includes('紐約') || dest.includes('new york')) {
      return { tz: 'America/New_York', flag: '🇺🇸', label: '紐約時間 (EST)' };
    }
    if (dest.includes('加州') || dest.includes('舊金山') || dest.includes('洛杉磯') || dest.includes('los angeles') || dest.includes('san francisco')) {
      return { tz: 'America/Los_Angeles', flag: '🇺🇸', label: '美西時間 (PST)' };
    }
    if (dest.includes('曼谷') || dest.includes('泰國') || dest.includes('bangkok') || dest.includes('thailand')) {
      return { tz: 'Asia/Bangkok', flag: '🇹🇭', label: '泰國時間 (ICT)' };
    }
    return { tz: undefined, flag: '📍', label: '當地時間' };
  };

  const destTzInfo = getDestinationTimeZone();
  const destTimeFormatted = destTzInfo.tz
    ? currentTime.toLocaleTimeString('zh-TW', { timeZone: destTzInfo.tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : currentTime.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const homeTimeFormatted = currentTime.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false });

  // Weather States
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [weatherMode, setWeatherMode] = useState<'destination' | 'gps'>('destination');
  const [userGpsCoords, setUserGpsCoords] = useState<{ lat: number; lng: number } | null>(null);

  const activeDay = trip.days.find((d) => d.dayNumber === selectedDayNumber) || trip.days[0] || {
    id: 'empty',
    dayNumber: 1,
    date: trip.startDate,
    items: [],
  };

  const nextItem = activeDay.items.find((it) => !it.completed) || null;
  const completedCount = activeDay.items.filter((it) => it.completed).length;
  const totalCount = activeDay.items.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Today's Expense calculations
  const todayDateStr = activeDay.date || new Date().toISOString().slice(0, 10);
  const todayExpenses = trip.expenses.filter((e) => e.date === todayDateStr);
  const todayTotalSpent = todayExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Toggle item expanded note state
  const toggleItemExpanded = (id: string) => {
    setExpandedItemIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // 1. Resolve destination coordinates from saved trip items or destination name
  const resolveDestinationCoords = async (): Promise<{ lat: number; lng: number; name: string } | null> => {
    if (nextItem && typeof nextItem.lat === 'number' && typeof nextItem.lng === 'number') {
      return { lat: nextItem.lat, lng: nextItem.lng, name: nextItem.locationName || nextItem.title };
    }
    const dayItemWithCoords = activeDay.items.find((i) => typeof i.lat === 'number' && typeof i.lng === 'number');
    if (dayItemWithCoords) {
      return { lat: dayItemWithCoords.lat!, lng: dayItemWithCoords.lng!, name: dayItemWithCoords.locationName || dayItemWithCoords.title };
    }
    for (const d of trip.days) {
      const it = d.items.find((i) => typeof i.lat === 'number' && typeof i.lng === 'number');
      if (it) {
        return { lat: it.lat!, lng: it.lng!, name: it.locationName || trip.destination };
      }
    }
    if (trip.destination) {
      const geo = await geocodeCity(trip.destination);
      if (geo) {
        return { lat: geo.lat, lng: geo.lng, name: geo.name };
      }
    }
    return null;
  };

  // 2. Fetch destination weather
  const loadDestinationWeather = async () => {
    setIsWeatherLoading(true);
    setWeatherError(null);
    try {
      const destCoords = await resolveDestinationCoords();
      if (!destCoords) {
        throw new Error(lang === 'zh' ? '無行程座標，請在行程中設定景點定位' : 'No coordinates found in trip schedule');
      }
      const data = await fetchCurrentWeather(destCoords.lat, destCoords.lng, destCoords.name, 'destination');
      setWeather(data);
      setWeatherMode('destination');
    } catch (err: any) {
      console.warn('Destination weather fetch error:', err);
      setWeatherError(err.message || 'Unable to load weather');
    } finally {
      setIsWeatherLoading(false);
    }
  };

  // 3. Fetch user's live GPS weather using browser Geolocation API
  const loadGpsWeather = async () => {
    setIsWeatherLoading(true);
    setWeatherError(null);
    try {
      const coords = await getBrowserCoordinates();
      setUserGpsCoords(coords);
      const data = await fetchCurrentWeather(
        coords.lat,
        coords.lng,
        lang === 'zh' ? '目前 GPS 定位' : 'Current GPS Position',
        'gps'
      );
      setWeather(data);
      setWeatherMode('gps');
    } catch (err: any) {
      console.warn('Geolocation weather fetch error:', err);
      const deniedMsg =
        lang === 'zh'
          ? '無法取得瀏覽器定位授權，請確認已允許定位權限。'
          : 'Unable to access browser GPS location. Please allow location permissions.';
      setWeatherError(deniedMsg);
    } finally {
      setIsWeatherLoading(false);
    }
  };

  // Initial weather load
  useEffect(() => {
    loadDestinationWeather();
  }, [selectedDayNumber, trip.id]);

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

  // Calculate distance from user's live GPS position to destination/next spot
  let gpsDistanceToSpot: string | null = null;
  if (userGpsCoords && nextItem && typeof nextItem.lat === 'number' && typeof nextItem.lng === 'number') {
    const km = calculateDistanceKm(userGpsCoords, { lat: nextItem.lat, lng: nextItem.lng });
    gpsDistanceToSpot = formatDistance(km);
  }

  // Weather description & clothing advice
  const weatherDesc = weather ? getWeatherDescription(weather.weatherCode, lang) : null;
  let weatherAdvice = '';
  if (weather) {
    if (weather.rainProbability >= 40) {
      weatherAdvice = lang === 'zh' ? '今日降雨機率偏高，出門請攜帶折疊傘或雨具' : 'High chance of rain today, carry an umbrella';
    } else if (weather.maxTemp - weather.minTemp >= 8) {
      weatherAdvice = lang === 'zh' ? '早晚溫差較大，建議隨身攜帶薄外套防風' : 'Noticeable day-night gap, pack a light jacket';
    } else if (weather.temperature >= 30) {
      weatherAdvice = lang === 'zh' ? '氣候炎熱，請多補充水分並做好防曬' : 'Hot weather, stay hydrated and use sunscreen';
    } else if (weather.temperature <= 10) {
      weatherAdvice = lang === 'zh' ? '氣溫偏低偏冷，請注意頭頸防寒保暖' : 'Cold temperatures, dress warmly in layers';
    } else {
      weatherAdvice = lang === 'zh' ? '舒適宜人的旅遊好天氣，祝旅途愉快！' : 'Pleasant travel weather, enjoy your day!';
    }
  }

  return (
    <div className="space-y-4">
      {/* 0. Live Dual Timezone Clock & In-Transit Spending Snapshot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* Dual Timezone Clock Card */}
        <div className="p-3 sm:p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 flex items-center justify-center text-teal-700 dark:text-teal-300 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <span>{destTzInfo.flag}</span>
                <span>{destTzInfo.label}</span>
              </div>
              <div className="text-lg sm:text-xl font-black font-mono text-slate-900 dark:text-white tracking-tight">
                {destTimeFormatted}
              </div>
            </div>
          </div>

          <div className="text-right border-l border-slate-100 dark:border-slate-800 pl-3">
            <div className="text-[10px] font-medium text-slate-400">🇹🇼 台北/家鄉時間</div>
            <div className="text-xs sm:text-sm font-bold font-mono text-slate-600 dark:text-slate-300">
              {homeTimeFormatted}
            </div>
          </div>
        </div>

        {/* Today's In-Transit Spend Snapshot */}
        <div className="p-3 sm:p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-300 shrink-0">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                本日已記錄支出 ({todayExpenses.length} 筆)
              </div>
              <div className="text-base sm:text-lg font-black font-mono text-amber-700 dark:text-amber-300">
                {trip.currency || detectTripCurrency(trip)} {todayTotalSpent.toLocaleString()}
              </div>
            </div>
          </div>

          {onOpenQuickAction && (
            <button
              onClick={() => onOpenQuickAction('expense')}
              className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition active:scale-95 flex items-center gap-1 shrink-0"
              title="一秒速記本日花費"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>記一筆</span>
            </button>
          )}
        </div>
      </div>

      {/* 1. Day Selector Ribbon */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {trip.days.map((day) => (
          <button
            key={day.id}
            onClick={() => setSelectedDayNumber(day.dayNumber)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
              day.dayNumber === selectedDayNumber
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <span>{t.day.replace('{n}', String(day.dayNumber))}</span>
            <span className="opacity-70 font-mono text-[10px]">({formatMonthDaySlash(day.date)})</span>
          </button>
        ))}
      </div>

      {/* 2. Daily Theme & Day Highlights Card */}
      {(activeDay.theme || activeDay.notes) && (
        <div className="rounded-2xl bg-amber-50/70 dark:bg-slate-900 border border-amber-200/80 dark:border-amber-900/40 p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-start gap-2.5">
            <div className="p-2 rounded-xl bg-amber-700 text-white shrink-0 mt-0.5 shadow-2xs">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              {activeDay.theme && (
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[10px] font-bold tracking-wider text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                    {lang === 'zh' ? '本日重點' : 'Day Focus'}
                  </span>
                  <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                    {activeDay.theme}
                  </h4>
                </div>
              )}
              {activeDay.notes && (
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mt-1 flex items-start gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>{activeDay.notes}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Live Destination & Geolocation Weather Card */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-3">
        {/* Weather Card Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              <CloudSun className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                  {weatherMode === 'destination' ? t.destinationWeather : t.gpsWeather}
                </h4>
                <span className="text-[10px] px-2 py-0.2 rounded-full font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {weather?.locationName || trip.destination}
                </span>
              </div>
            </div>
          </div>

          {/* Weather Location Switcher & Refresh */}
          <div className="flex items-center gap-1.5">
            {weatherMode === 'destination' ? (
              <button
                onClick={loadGpsWeather}
                disabled={isWeatherLoading}
                className="px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold flex items-center gap-1 transition active:scale-95"
                title={t.useGpsLocation}
              >
                <LocateFixed className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                <span>{t.useGpsLocation}</span>
              </button>
            ) : (
              <button
                onClick={loadDestinationWeather}
                disabled={isWeatherLoading}
                className="px-2.5 py-1 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/50 hover:bg-teal-100/50 text-teal-800 dark:text-teal-200 text-[11px] font-semibold flex items-center gap-1 transition active:scale-95"
                title={t.useDestination}
              >
                <Compass className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                <span>{t.useDestination}</span>
              </button>
            )}

            <button
              onClick={weatherMode === 'destination' ? loadDestinationWeather : loadGpsWeather}
              disabled={isWeatherLoading}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition"
              title="Refresh Weather"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isWeatherLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Weather Content Body */}
        {isWeatherLoading && !weather ? (
          <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-600" />
            <span>{t.fetchingWeather}</span>
          </div>
        ) : weatherError ? (
          <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{weatherError}</span>
            </div>
            <button
              onClick={loadDestinationWeather}
              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] shrink-0"
            >
              重試
            </button>
          </div>
        ) : weather ? (
          <div className="space-y-3">
            {/* Primary Metrics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Temperature & Condition */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <span className="text-3xl select-none">{weatherDesc?.icon || '🌤️'}</span>
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black font-mono text-slate-900 dark:text-white">
                      {weather.temperature}°
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">C</span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">
                    {weatherDesc?.label}
                  </p>
                </div>
              </div>

              {/* Feels Like & High / Low */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1">
                <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <Thermometer className="w-3.5 h-3.5 text-teal-600" />
                  <span>{t.feelsLike}: <strong className="text-slate-800 dark:text-slate-200 font-mono">{weather.apparentTemperature}°</strong></span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  <span>{t.highLow}: <strong className="text-slate-800 dark:text-slate-200 font-mono">{weather.maxTemp}° / {weather.minTemp}°</strong></span>
                </div>
              </div>

              {/* Rain Probability */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1">
                <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <Umbrella className="w-3.5 h-3.5 text-blue-500" />
                  <span>{t.rainProb}: <strong className="text-slate-800 dark:text-slate-200 font-mono">{weather.rainProbability}%</strong></span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <Droplets className="w-3.5 h-3.5 text-sky-500" />
                  <span>{t.humidity}: <strong className="text-slate-800 dark:text-slate-200 font-mono">{weather.humidity}%</strong></span>
                </div>
              </div>

              {/* Wind Speed & Source */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1">
                <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <Wind className="w-3.5 h-3.5 text-teal-600" />
                  <span>{t.wind}: <strong className="text-slate-800 dark:text-slate-200 font-mono">{weather.windSpeed} km/h</strong></span>
                </div>
                <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                  <Navigation className="w-3 h-3 text-teal-600" />
                  <span>{weather.source === 'gps' ? 'GPS 即時定位' : '行程座標預報'}</span>
                </div>
              </div>
            </div>

            {/* Travel Advisory Bar */}
            <div className="p-2.5 rounded-xl bg-teal-50/60 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900/60 text-[11px] text-teal-900 dark:text-teal-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 truncate">
                <Info className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span className="truncate">{weatherAdvice}</span>
              </div>
              {gpsDistanceToSpot && (
                <span className="font-mono font-bold text-teal-700 dark:text-teal-300 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-md border border-teal-200 dark:border-teal-800 shrink-0">
                  距下站 {gpsDistanceToSpot}
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* 4. Hero "Up Next" Card */}
      {nextItem ? (
        <div className="rounded-3xl bg-slate-900 dark:bg-slate-950 border border-slate-800 text-white p-5 sm:p-6 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-300 font-semibold mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-teal-300">
                <Navigation className="w-3.5 h-3.5" />
                <span>{t.upNext}</span>
              </span>
              {/* Category Badge */}
              {nextItem.category && CATEGORY_TAGS[nextItem.category] && (
                <>
                  <span aria-hidden="true" className="text-slate-500">·</span>
                  <span className="text-xs text-teal-100 flex items-center gap-1 font-medium">
                    <span>{CATEGORY_TAGS[nextItem.category].icon}</span>
                    <span>{CATEGORY_TAGS[nextItem.category].label}</span>
                  </span>
                </>
              )}
            </div>

            <span className="font-mono text-slate-300 flex items-center gap-1 text-xs">
              <Clock className="w-3.5 h-3.5 text-teal-300" />
              <span>{nextItem.startTime}</span>
              {nextItem.endTime ? <span>~ {nextItem.endTime}</span> : ''}
            </span>
          </div>

          <h3 className="font-black text-xl sm:text-2xl mt-1 tracking-tight">
            {nextItem.title}
          </h3>

          {(nextItem.locationName || nextItem.address) && (
            <p className="text-teal-100 text-xs sm:text-sm flex items-center gap-1.5 mt-1.5 opacity-90">
              <MapPin className="w-4 h-4 shrink-0 text-teal-300" />
              <span className="truncate">{nextItem.locationName || nextItem.address}</span>
            </p>
          )}

          {/* Missing Itinerary Notes / Explanation in Up Next */}
          {nextItem.notes && (
            <div className="mt-3 p-3 rounded-2xl bg-white/15 backdrop-blur-md text-white text-xs border border-white/20 space-y-1">
              <div className="flex items-center gap-1.5 text-amber-300 font-bold text-[11px]">
                <FileText className="w-3.5 h-3.5" />
                <span>{lang === 'zh' ? '行程說明與重點叮嚀' : 'Itinerary Notes & Tips'}</span>
              </div>
              <p className="text-teal-50 text-xs leading-relaxed whitespace-pre-wrap">
                {nextItem.notes}
              </p>
            </div>
          )}

          {nextItem.transportNote && (
            <div className="mt-2.5 p-2.5 rounded-xl bg-white/10 backdrop-blur-md text-teal-50 text-xs flex items-start gap-2 border border-white/10">
              <Bus className="w-4 h-4 text-teal-300 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-[11px] text-teal-200 block">{lang === 'zh' ? '交通搭乘指引' : 'Transit Guide'}:</span>
                <span>{nextItem.transportNote}</span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap mt-2.5">
            {nextItem.bookingCode && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-400/20 text-amber-200 text-xs font-mono font-bold border border-amber-300/30">
                <Bookmark className="w-3.5 h-3.5" />
                <span>{nextItem.bookingCode}</span>
              </div>
            )}
            {typeof nextItem.cost === 'number' && nextItem.cost > 0 && (
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 text-teal-200 text-xs font-mono font-semibold">
                <DollarSign className="w-3 h-3 text-teal-300" />
                <span>預估: {trip.currency} {nextItem.cost.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <a
              href={getGoogleMapsNavigationUrl(nextItem)}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 px-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition active:scale-95"
            >
              <Navigation className="w-4 h-4" />
              <span>{t.navGoogle}</span>
            </a>

            <button
              onClick={() => {
                setTaxiCardItem(nextItem);
                setShowTaxiCard(true);
              }}
              className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition active:scale-95"
              title="向計程車司機出示大字卡"
            >
              <span>🚕</span>
              <span>司機問路卡</span>
            </button>

            <button
              type="button"
              onClick={(e) => handleToggleComplete(nextItem.id, e)}
              className="py-2.5 px-3 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-white/20 transition active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4 text-teal-300" />
              <span>{t.checked}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-emerald-800 text-white p-6 shadow-md text-center">
          <h3 className="font-bold text-base flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-300" />
            <span>{t.doneToday}</span>
          </h3>
        </div>
      )}

      {/* 5. Progress & Complete Day Itinerary Checklist with Full Descriptions */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-6 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm">
              {t.day.replace('{n}', String(activeDay.dayNumber))} ({formatDateSlash(activeDay.date)}) {lang === 'zh' ? '完整行程與說明' : 'Full Itinerary'}
            </h4>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {lang === 'zh' ? '包含詳細參觀說明、轉乘提示與門票憑證' : 'Includes all spot notes, transit instructions, and booking codes'}
            </p>
          </div>
          <span className="font-bold text-xs px-2.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
            {completedCount} / {totalCount} ({progressPercent}%)
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
          <div
            className="bg-teal-600 h-full transition-all duration-300 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Spots list */}
        <div className="space-y-3 pt-1">
          {activeDay.items.map((item, idx) => {
            const isExpanded = expandedItemIds[item.id] ?? true; // Default expanded so notes are immediately visible!
            const catTag = CATEGORY_TAGS[item.category] || CATEGORY_TAGS.spot;

            return (
              <div
                key={item.id}
                className={`rounded-2xl p-3.5 border transition ${
                  item.completed
                    ? 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 opacity-60'
                    : 'bg-white dark:bg-slate-900/90 border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-teal-300 dark:hover:border-teal-700'
                }`}
              >
                {/* Spot Header Row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={(e) => handleToggleComplete(item.id, e)}
                      className="mt-0.5 shrink-0 text-slate-400 hover:text-emerald-600 transition"
                      title={item.completed ? '標記為未完成' : '標記為已造訪'}
                    >
                      {item.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600 hover:text-teal-600" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded-md border border-teal-200/50 dark:border-teal-800/50">
                          {item.startTime} {item.endTime ? `~ ${item.endTime}` : ''}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold flex items-center gap-1 ${catTag.badgeClass}`}>
                          <span>{catTag.icon}</span>
                          <span>{catTag.label}</span>
                        </span>
                        {item.bookingCode && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px] font-mono font-bold flex items-center gap-1">
                            <Bookmark className="w-3 h-3" />
                            <span>{item.bookingCode}</span>
                          </span>
                        )}
                      </div>

                      <h5
                        onClick={(e) => handleToggleComplete(item.id, e)}
                        className={`text-sm sm:text-base font-bold cursor-pointer hover:text-teal-600 dark:hover:text-teal-300 transition ${
                          item.completed
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {item.title}
                      </h5>

                      {(item.locationName || item.address) && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                          <MapPin className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                          <span className="truncate">{item.locationName || item.address}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right actions: Navigation, Taxi card & Note expand toggle */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {(item.locationName || item.address) && (
                      <button
                        onClick={() => {
                          setTaxiCardItem(item);
                          setShowTaxiCard(true);
                        }}
                        className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900 transition active:scale-95 text-xs font-bold"
                        title="司機問路大字卡"
                      >
                        <span>🚕</span>
                      </button>
                    )}
                    <a
                      href={getGoogleMapsNavigationUrl(item)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-900 transition active:scale-95"
                      title={t.navGoogle}
                    >
                      <Navigation className="w-3.5 h-3.5" />
                    </a>
                    {(item.notes || item.transportNote) && (
                      <button
                        onClick={() => toggleItemExpanded(item.id)}
                        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
                        title={isExpanded ? '收合說明' : '展開說明'}
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Spot Details (Notes, Transport Note, Cost) */}
                {isExpanded && (item.notes || item.transportNote || item.cost) && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                    {/* Itinerary Notes Description */}
                    {item.notes && (
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80">
                        <div className="flex items-center gap-1 text-[11px] font-bold text-teal-700 dark:text-teal-400 mb-1">
                          <FileText className="w-3.5 h-3.5 text-teal-600" />
                          <span>{lang === 'zh' ? '景點說明與參觀須知' : 'Spot Notes'}:</span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap text-[11px]">
                          {item.notes}
                        </p>
                      </div>
                    )}

                    {/* Transport note */}
                    {item.transportNote && (
                      <div className="p-2.5 rounded-xl bg-teal-50/50 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900/40 text-teal-900 dark:text-teal-200 text-[11px] flex items-start gap-2">
                        <Bus className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="block text-teal-800 dark:text-teal-300 font-semibold mb-0.5">
                            {lang === 'zh' ? '交通方式 / 轉乘指引' : 'Transit Directions'}:
                          </strong>
                          <span>{item.transportNote}</span>
                        </div>
                      </div>
                    )}

                    {/* Cost note */}
                    {typeof item.cost === 'number' && item.cost > 0 && (
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-teal-600" />
                        <span>{lang === 'zh' ? '預估門票/消費' : 'Cost'}: <strong className="text-slate-800 dark:text-slate-200 font-mono">{trip.currency} {item.cost.toLocaleString()}</strong></span>
                      </div>
                    )}

                    {/* Spot Memory Photos */}
                    {item.memoryPhotos && item.memoryPhotos.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-400 mb-1.5">
                          <Camera className="w-3.5 h-3.5" />
                          <span>打卡回憶相片 ({item.memoryPhotos.length} 張)</span>
                        </div>
                        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                          {item.memoryPhotos.map((photo, pIdx) => (
                            <img
                              key={pIdx}
                              src={photo}
                              alt="Memory photo"
                              className="w-14 h-14 rounded-xl object-cover border border-rose-200 dark:border-rose-900 shadow-2xs shrink-0"
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
        </div>
      </div>

      {/* 6. In-Transit Emergency Assistance Bar */}
      <div className="p-4 rounded-3xl bg-slate-900 text-white border border-slate-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-white">旅途緊急求助熱線</h4>
            <p className="text-[10px] text-slate-400">當身處海外遭遇急難、失竊或意外時快速點擊撥打</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <a
            href="tel:110"
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-mono font-bold text-xs flex items-center gap-1.5 border border-white/10 transition"
          >
            <Phone className="w-3 h-3 text-rose-400" />
            <span>警察 110</span>
          </a>
          <a
            href="tel:119"
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-mono font-bold text-xs flex items-center gap-1.5 border border-white/10 transition"
          >
            <Phone className="w-3 h-3 text-amber-400" />
            <span>救護/急救 119</span>
          </a>
          <a
            href="tel:+886800085095"
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-mono font-bold text-xs flex items-center gap-1.5 border border-white/10 transition"
          >
            <Phone className="w-3 h-3 text-teal-400" />
            <span>外交部緊急急難救助</span>
          </a>
        </div>
      </div>

      {/* Taxi Show-Card Modal */}
      {showTaxiCard && (
        <TaxiShowCardModal
          trip={trip}
          lang={lang}
          initialItem={taxiCardItem}
          onClose={() => {
            setShowTaxiCard(false);
            setTaxiCardItem(null);
          }}
        />
      )}
    </div>
  );
};
