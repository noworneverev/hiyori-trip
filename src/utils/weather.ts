import { Language } from './i18n';

export interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  precipitation: number;
  weatherCode: number;
  maxTemp: number;
  minTemp: number;
  rainProbability: number;
  locationName: string;
  source: 'destination' | 'gps';
  fetchedAt: number;
}

/**
 * WMO Weather Codes translation dictionary
 */
export function getWeatherDescription(code: number, lang: Language): { label: string; icon: string } {
  // Mapping of WMO weather codes
  if (code === 0) {
    const labels: Record<Language, string> = {
      zh: '晴朗無雲',
      en: 'Clear Sky',
      ja: '快晴',
      ko: '맑음',
      'zh-CN': '晴朗无云',
    };
    return { label: labels[lang] || labels.en, icon: '☀️' };
  }
  if (code === 1 || code === 2) {
    const labels: Record<Language, string> = {
      zh: '多雲時晴',
      en: 'Partly Cloudy',
      ja: '晴れ時々曇り',
      ko: '구름 조금',
      'zh-CN': '多云时晴',
    };
    return { label: labels[lang] || labels.en, icon: '⛅' };
  }
  if (code === 3) {
    const labels: Record<Language, string> = {
      zh: '陰天多雲',
      en: 'Overcast',
      ja: '曇り',
      ko: '흐림',
      'zh-CN': '阴天多云',
    };
    return { label: labels[lang] || labels.en, icon: '☁️' };
  }
  if (code === 45 || code === 48) {
    const labels: Record<Language, string> = {
      zh: '有霧 / 薄霧',
      en: 'Foggy',
      ja: '霧',
      ko: '안개',
      'zh-CN': '有雾 / 薄雾',
    };
    return { label: labels[lang] || labels.en, icon: '🌫️' };
  }
  if (code >= 51 && code <= 57) {
    const labels: Record<Language, string> = {
      zh: '毛毛細雨',
      en: 'Drizzle',
      ja: '小雨・霧雨',
      ko: '이슬비',
      'zh-CN': '毛毛细雨',
    };
    return { label: labels[lang] || labels.en, icon: '🌦️' };
  }
  if (code >= 61 && code <= 67) {
    const labels: Record<Language, string> = {
      zh: '陣雨降雨',
      en: 'Rain',
      ja: '雨',
      ko: '비',
      'zh-CN': '阵雨降雨',
    };
    return { label: labels[lang] || labels.en, icon: '🌧️' };
  }
  if (code >= 71 && code <= 77) {
    const labels: Record<Language, string> = {
      zh: '飄雪 / 降雪',
      en: 'Snowfall',
      ja: '雪',
      ko: '눈',
      'zh-CN': '飘雪 / 降雪',
    };
    return { label: labels[lang] || labels.en, icon: '❄️' };
  }
  if (code >= 80 && code <= 82) {
    const labels: Record<Language, string> = {
      zh: '短暫驟雨',
      en: 'Rain Showers',
      ja: 'にわか雨',
      ko: '소나기',
      'zh-CN': '短暂骤雨',
    };
    return { label: labels[lang] || labels.en, icon: '🌧️' };
  }
  if (code >= 85 && code <= 86) {
    const labels: Record<Language, string> = {
      zh: '短暫陣雪',
      en: 'Snow Showers',
      ja: 'にわか雪',
      ko: '소낙눈',
      'zh-CN': '短暂阵雪',
    };
    return { label: labels[lang] || labels.en, icon: '🌨️' };
  }
  if (code >= 95) {
    const labels: Record<Language, string> = {
      zh: '雷陣雨',
      en: 'Thunderstorm',
      ja: '雷雨',
      ko: '뇌우',
      'zh-CN': '雷阵雨',
    };
    return { label: labels[lang] || labels.en, icon: '⛈️' };
  }

  const defaultLabels: Record<Language, string> = {
    zh: '良好天氣',
    en: 'Mild',
    ja: '穏やか',
    ko: '보통',
    'zh-CN': '良好天气',
  };
  return { label: defaultLabels[lang] || defaultLabels.en, icon: '🌤️' };
}

/**
 * Request user's current GPS position via browser Geolocation API
 */
export function getBrowserCoordinates(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        reject(err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  });
}

/**
 * Geocode city name to coordinates via Open-Meteo geocoding API
 */
export async function geocodeCity(name: string): Promise<{ lat: number; lng: number; name: string } | null> {
  try {
    const cleanName = encodeURIComponent(name.trim().split(/[,/]/)[0]);
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${cleanName}&count=1&language=en&format=json`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const match = data.results[0];
      return {
        lat: match.latitude,
        lng: match.longitude,
        name: match.name,
      };
    }
  } catch (e) {
    console.warn('Geocoding failed for', name, e);
  }
  return null;
}

/**
 * Fetch live weather from Open-Meteo (Free, reliable, no API key required)
 */
export async function fetchCurrentWeather(
  lat: number,
  lng: number,
  locationName: string,
  source: 'destination' | 'gps' = 'destination'
): Promise<WeatherData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Weather fetch failed: ${res.statusText}`);
  }

  const data = await res.json();
  const current = data.current;
  const daily = data.daily;

  return {
    temperature: Math.round(current.temperature_2m),
    apparentTemperature: Math.round(current.apparent_temperature),
    humidity: current.relative_humidity_2m,
    windSpeed: Math.round(current.wind_speed_10m),
    precipitation: current.precipitation,
    weatherCode: current.weather_code,
    maxTemp: daily?.temperature_2m_max?.[0] !== undefined ? Math.round(daily.temperature_2m_max[0]) : Math.round(current.temperature_2m),
    minTemp: daily?.temperature_2m_min?.[0] !== undefined ? Math.round(daily.temperature_2m_min[0]) : Math.round(current.temperature_2m),
    rainProbability: daily?.precipitation_probability_max?.[0] || 0,
    locationName,
    source,
    fetchedAt: Date.now(),
  };
}

export interface DailyWeatherForecast {
  date: string; // YYYY-MM-DD
  weatherCode: number;
  maxTemp: number;
  minTemp: number;
  rainProbability: number;
  windSpeedMax: number;
  locationName: string;
  source: 'forecast' | 'archive';
}

export interface DayWeatherStatus {
  status: 'ok' | 'too_far_future' | 'no_coords' | 'error';
  forecast?: DailyWeatherForecast;
  daysUntilForecast?: number;
}

const DAILY_WEATHER_CACHE_KEY = 'hiyori_daily_weather_cache_v1';
const FORECAST_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const ARCHIVE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedDailyWeatherEntry {
  fetchedAt: number;
  source: 'forecast' | 'archive';
  days: Record<string, DailyWeatherForecast>;
}

const memoryWeatherCache = new Map<string, CachedDailyWeatherEntry>();

function readWeatherCache(): Record<string, CachedDailyWeatherEntry> {
  try {
    const raw = localStorage.getItem(DAILY_WEATHER_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function writeWeatherCache(key: string, entry: CachedDailyWeatherEntry): void {
  memoryWeatherCache.set(key, entry);
  try {
    const existing = readWeatherCache();
    existing[key] = entry;
    // Keep at most 24 cache entries to keep localStorage lightweight
    const entries = Object.entries(existing)
      .sort((a, b) => b[1].fetchedAt - a[1].fetchedAt)
      .slice(0, 24);
    localStorage.setItem(DAILY_WEATHER_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Ignore storage quota issues
  }
}

function getLocalTodayYYYYMMDD(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function diffDaysYYYYMMDD(fromDate: string, toDate: string): number {
  const a = new Date(`${fromDate.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${toDate.slice(0, 10)}T00:00:00Z`).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function addDaysYYYYMMDD(base: string, offset: number): string {
  const dt = new Date(`${base.slice(0, 10)}T00:00:00Z`);
  if (isNaN(dt.getTime())) return base;
  dt.setUTCDate(dt.getUTCDate() + offset);
  return dt.toISOString().slice(0, 10);
}

/**
 * Fetch Open-Meteo daily forecast (up to +15 days from today) or historical archive (< today)
 * for a rounded coordinate bucket and date range, using memory + localStorage caching.
 */
async function fetchOpenMeteoRange(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
  locationName: string,
  mode: 'forecast' | 'archive'
): Promise<Record<string, DailyWeatherForecast>> {
  const bucketKey = `${mode}:${lat.toFixed(2)},${lng.toFixed(2)}:${startDate}:${endDate}`;
  const ttl = mode === 'forecast' ? FORECAST_CACHE_TTL_MS : ARCHIVE_CACHE_TTL_MS;

  const memHit = memoryWeatherCache.get(bucketKey);
  if (memHit && Date.now() - memHit.fetchedAt < ttl) {
    return memHit.days;
  }

  const diskAll = readWeatherCache();
  const diskHit = diskAll[bucketKey];
  if (diskHit && Date.now() - diskHit.fetchedAt < ttl) {
    memoryWeatherCache.set(bucketKey, diskHit);
    return diskHit.days;
  }

  const baseUrl =
    mode === 'forecast'
      ? 'https://api.open-meteo.com/v1/forecast'
      : 'https://archive-api.open-meteo.com/v1/archive';

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
    timezone: 'auto',
    start_date: startDate,
    end_date: endDate,
  });

  const res = await fetch(`${baseUrl}?${params.toString()}`);
  if (!res.ok) {
    // If diskHit exists even slightly stale, return gracefully
    if (diskHit) return diskHit.days;
    throw new Error(`Open-Meteo ${mode} failed: ${res.status}`);
  }

  const json = await res.json();
  const daily = json?.daily;
  const result: Record<string, DailyWeatherForecast> = {};

  if (daily && Array.isArray(daily.time)) {
    for (let i = 0; i < daily.time.length; i++) {
      const date = daily.time[i];
      const maxT = daily.temperature_2m_max?.[i];
      const minT = daily.temperature_2m_min?.[i];
      const code = daily.weather_code?.[i];
      if (typeof maxT !== 'number' || typeof minT !== 'number') continue;

      result[date] = {
        date,
        weatherCode: typeof code === 'number' ? code : 1,
        maxTemp: Math.round(maxT),
        minTemp: Math.round(minT),
        rainProbability: Math.round(daily.precipitation_probability_max?.[i] ?? 0),
        windSpeedMax: Math.round(daily.wind_speed_10m_max?.[i] ?? 0),
        locationName,
        source: mode,
      };
    }
  }

  writeWeatherCache(bucketKey, {
    fetchedAt: Date.now(),
    source: mode,
    days: result,
  });

  return result;
}

export interface DayWeatherQueryInput {
  dayNumber: number;
  date: string;
  items: Array<{ lat?: number; lng?: number; locationName?: string; title?: string }>;
}

/**
 * Resolve per-day weather across an entire multi-day itinerary (supporting cross-city trips
 * where Day 1 is Tokyo and Day 3 is Kyoto) using free, keyless Open-Meteo APIs.
 */
export async function fetchTripWeatherByDay(
  days: DayWeatherQueryInput[],
  fallbackDestination: string
): Promise<Record<number, DayWeatherStatus>> {
  const output: Record<number, DayWeatherStatus> = {};
  if (!days || days.length === 0) return output;

  const todayStr = getLocalTodayYYYYMMDD();
  const maxForecastDate = addDaysYYYYMMDD(todayStr, 15);
  const yesterdayStr = addDaysYYYYMMDD(todayStr, -1);

  // Find trip-wide fallback coordinates from any spot or geocode destination
  let globalCoords: { lat: number; lng: number; name: string } | null = null;
  for (const d of days) {
    const withCoords = d.items.find((it) => typeof it.lat === 'number' && typeof it.lng === 'number');
    if (withCoords) {
      globalCoords = {
        lat: withCoords.lat!,
        lng: withCoords.lng!,
        name: withCoords.locationName || fallbackDestination,
      };
      break;
    }
  }

  if (!globalCoords && fallbackDestination) {
    const geo = await geocodeCity(fallbackDestination);
    if (geo) {
      globalCoords = geo;
    }
  }

  // Group day requests by coordinate bucket + mode ('forecast' | 'archive') to minimize HTTP requests
  interface BucketGroup {
    lat: number;
    lng: number;
    locationName: string;
    mode: 'forecast' | 'archive';
    minDate: string;
    maxDate: string;
    dayEntries: Array<{ dayNumber: number; date: string }>;
  }

  const groups = new Map<string, BucketGroup>();

  for (const d of days) {
    const cleanDate = (d.date || '').slice(0, 10).replace(/\//g, '-');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) continue;

    const daySpot = d.items.find((it) => typeof it.lat === 'number' && typeof it.lng === 'number');
    const coords = daySpot
      ? {
          lat: daySpot.lat!,
          lng: daySpot.lng!,
          name: daySpot.locationName || daySpot.title || fallbackDestination,
        }
      : globalCoords;

    if (!coords) {
      output[d.dayNumber] = { status: 'no_coords' };
      continue;
    }

    if (cleanDate > maxForecastDate) {
      const daysUntilForecast = Math.max(1, diffDaysYYYYMMDD(maxForecastDate, cleanDate));
      output[d.dayNumber] = { status: 'too_far_future', daysUntilForecast };
      continue;
    }

    const mode: 'forecast' | 'archive' = cleanDate < todayStr ? 'archive' : 'forecast';
    const clampedEnd = mode === 'archive' && cleanDate > yesterdayStr ? yesterdayStr : cleanDate;
    const bucketKey = `${mode}:${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}`;

    const existing = groups.get(bucketKey);
    if (existing) {
      if (clampedEnd < existing.minDate) existing.minDate = clampedEnd;
      if (clampedEnd > existing.maxDate) existing.maxDate = clampedEnd;
      existing.dayEntries.push({ dayNumber: d.dayNumber, date: cleanDate });
    } else {
      groups.set(bucketKey, {
        lat: coords.lat,
        lng: coords.lng,
        locationName: coords.name,
        mode,
        minDate: clampedEnd,
        maxDate: clampedEnd,
        dayEntries: [{ dayNumber: d.dayNumber, date: cleanDate }],
      });
    }
  }

  await Promise.all(
    Array.from(groups.values()).map(async (group) => {
      try {
        const rangeMap = await fetchOpenMeteoRange(
          group.lat,
          group.lng,
          group.minDate,
          group.maxDate,
          group.locationName,
          group.mode
        );
        for (const entry of group.dayEntries) {
          const hit = rangeMap[entry.date];
          if (hit) {
            output[entry.dayNumber] = { status: 'ok', forecast: hit };
          } else {
            output[entry.dayNumber] = { status: 'error' };
          }
        }
      } catch {
        for (const entry of group.dayEntries) {
          output[entry.dayNumber] = { status: 'error' };
        }
      }
    })
  );

  return output;
}
