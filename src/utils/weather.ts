import { Language } from './i18n';
import { isValidCoordinate } from './geo';
import { getTodayInTimezone } from './date';

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
  isStale?: boolean;
}

/**
 * WMO Weather Codes translation dictionary
 */
export function getWeatherDescription(code: number, lang: Language): { label: string; icon: string } {
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
      reject(Object.assign(new Error('Geolocation is not supported by your browser'), { code: 0 }));
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

// --- Geocoding Cache & Multi-token Querying ---
const GEOCODE_CACHE_KEY = 'hiyori_geocode_cache_v1';
const memoryGeocodeCache = new Map<string, { lat: number; lng: number; name: string } | null>();

function readGeocodeDiskCache(): Record<string, { lat: number; lng: number; name: string }> {
  try {
    const raw = localStorage.getItem(GEOCODE_CACHE_KEY);
    return raw ? JSON.parse(raw) || {} : {};
  } catch {
    return {};
  }
}

function writeGeocodeDiskCache(key: string, value: { lat: number; lng: number; name: string }): void {
  try {
    const all = readGeocodeDiskCache();
    all[key] = value;
    const trimmed = Object.entries(all).slice(-40);
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(Object.fromEntries(trimmed)));
  } catch {
    // Ignore quota
  }
}

/**
 * Build progressive candidate city tokens from compound destination strings
 * e.g. "日本北陸 (金澤・富山)" -> ["金澤", "富山", "日本北陸"]
 */
function extractGeocodeCandidates(raw: string): string[] {
  const trimmed = (raw || '').trim();
  if (!trimmed) return [];
  const candidates: string[] = [];

  // Extract parenthesized city list first — usually the most specific city names
  const parenMatch = trimmed.match(/[（(]([^）)]+)[）)]/);
  if (parenMatch && parenMatch[1]) {
    parenMatch[1]
      .split(/[・、,/／\s+&·]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
      .forEach((t) => candidates.push(t));
  }

  // Strip parenthesized portion and split by delimiters
  const outside = trimmed.replace(/[（(][^）)]*[）)]/g, ' ').trim();
  if (outside) {
    candidates.push(outside);
    outside
      .split(/[・、,/／\-–—\s+&·]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
      .forEach((t) => candidates.push(t));
  }

  return Array.from(new Set(candidates)).slice(0, 4);
}

/**
 * Geocode city name to coordinates via Open-Meteo geocoding API with cache & compound-title fallback
 */
export async function geocodeCity(
  name: string,
  signal?: AbortSignal
): Promise<{ lat: number; lng: number; name: string } | null> {
  const normalized = (name || '').trim();
  if (!normalized) return null;

  const cacheKey = normalized.toLowerCase();
  if (memoryGeocodeCache.has(cacheKey)) {
    return memoryGeocodeCache.get(cacheKey) ?? null;
  }

  const diskAll = readGeocodeDiskCache();
  if (diskAll[cacheKey] && isValidCoordinate(diskAll[cacheKey].lat, diskAll[cacheKey].lng)) {
    memoryGeocodeCache.set(cacheKey, diskAll[cacheKey]);
    return diskAll[cacheKey];
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return null;
  }

  const candidates = extractGeocodeCandidates(normalized);
  let sawNetworkError = false;

  for (const candidate of candidates) {
    const cleanName = encodeURIComponent(candidate);
    // Try Traditional Chinese first (for exonyms like 首爾, 釜山, 清邁), then English fallback
    for (const langCode of ['zh', 'en']) {
      try {
        const res = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${cleanName}&count=1&language=${langCode}&format=json`,
          { signal }
        );
        if (!res.ok) continue;
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const match = data.results[0];
          if (isValidCoordinate(match.latitude, match.longitude)) {
            const hit = {
              lat: match.latitude,
              lng: match.longitude,
              name: match.name || candidate,
            };
            memoryGeocodeCache.set(cacheKey, hit);
            writeGeocodeDiskCache(cacheKey, hit);
            return hit;
          }
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') return null;
        sawNetworkError = true;
      }
    }
  }

  // Only cache negative miss when network succeeded cleanly (so retry buttons actually retry after transient errors!)
  if (!sawNetworkError) {
    memoryGeocodeCache.set(cacheKey, null);
  }
  return null;
}

// --- Current Weather Cache (30-min TTL + Offline Stale Fallback) ---
const CURRENT_WEATHER_CACHE_KEY = 'hiyori_current_weather_cache_v1';
const CURRENT_WEATHER_TTL_MS = 30 * 60 * 1000; // 30 minutes
const memoryCurrentWeatherCache = new Map<string, WeatherData>();

function readCurrentWeatherDiskCache(): Record<string, WeatherData> {
  try {
    const raw = localStorage.getItem(CURRENT_WEATHER_CACHE_KEY);
    return raw ? JSON.parse(raw) || {} : {};
  } catch {
    return {};
  }
}

function writeCurrentWeatherDiskCache(key: string, entry: WeatherData): void {
  memoryCurrentWeatherCache.set(key, entry);
  try {
    const all = readCurrentWeatherDiskCache();
    all[key] = entry;
    const trimmed = Object.entries(all)
      .sort((a, b) => b[1].fetchedAt - a[1].fetchedAt)
      .slice(0, 16);
    localStorage.setItem(CURRENT_WEATHER_CACHE_KEY, JSON.stringify(Object.fromEntries(trimmed)));
  } catch {
    // Ignore quota issues
  }
}

/**
 * Fetch live weather from Open-Meteo (Free, reliable, no API key required)
 * Supports 30-min caching and offline stale-cache fallback.
 */
export async function fetchCurrentWeather(
  lat: number,
  lng: number,
  locationName: string,
  source: 'destination' | 'gps' = 'destination',
  options?: { forceRefresh?: boolean; signal?: AbortSignal }
): Promise<WeatherData> {
  if (!isValidCoordinate(lat, lng)) {
    throw new Error('Invalid coordinates for weather lookup');
  }

  const bucketKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const memHit = memoryCurrentWeatherCache.get(bucketKey);
  const diskHit = !memHit ? readCurrentWeatherDiskCache()[bucketKey] : memHit;

  if (!options?.forceRefresh && diskHit && Date.now() - diskHit.fetchedAt < CURRENT_WEATHER_TTL_MS) {
    memoryCurrentWeatherCache.set(bucketKey, diskHit);
    return { ...diskHit, locationName, source, isStale: false };
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`;

  try {
    const res = await fetch(url, { signal: options?.signal });
    if (!res.ok) {
      throw new Error(`Weather fetch failed: ${res.status}`);
    }

    const data = await res.json();
    const current = data.current;
    const daily = data.daily;

    if (!current || typeof current.temperature_2m !== 'number') {
      throw new Error('Malformed weather payload');
    }

    const fresh: WeatherData = {
      temperature: Math.round(current.temperature_2m),
      apparentTemperature: Math.round(current.apparent_temperature ?? current.temperature_2m),
      humidity: Math.round(current.relative_humidity_2m ?? 0),
      windSpeed: Math.round(current.wind_speed_10m ?? 0),
      precipitation: current.precipitation ?? 0,
      weatherCode: current.weather_code ?? 1,
      maxTemp:
        daily?.temperature_2m_max?.[0] !== undefined
          ? Math.round(daily.temperature_2m_max[0])
          : Math.round(current.temperature_2m),
      minTemp:
        daily?.temperature_2m_min?.[0] !== undefined
          ? Math.round(daily.temperature_2m_min[0])
          : Math.round(current.temperature_2m),
      rainProbability: Math.round(daily?.precipitation_probability_max?.[0] ?? 0),
      locationName,
      source,
      fetchedAt: Date.now(),
      isStale: false,
    };

    writeCurrentWeatherDiskCache(bucketKey, fresh);
    return fresh;
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    // Graceful offline / error fallback to cached reading if available
    if (diskHit) {
      return { ...diskHit, locationName, source, isStale: true };
    }
    throw err;
  }
}

export interface DailyWeatherForecast {
  date: string; // YYYY-MM-DD
  weatherCode: number;
  maxTemp: number;
  minTemp: number;
  rainProbability: number;
  precipitationSum?: number;
  windSpeedMax: number;
  locationName: string;
  source: 'forecast' | 'archive';
}

export interface DayWeatherStatus {
  status: 'ok' | 'too_far_future' | 'no_coords' | 'error';
  forecast?: DailyWeatherForecast;
  daysUntilForecast?: number;
}

const DAILY_WEATHER_CACHE_KEY = 'hiyori_daily_weather_cache_v2';
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
    const entries = Object.entries(existing)
      .sort((a, b) => b[1].fetchedAt - a[1].fetchedAt)
      .slice(0, 24);
    localStorage.setItem(DAILY_WEATHER_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Ignore storage quota issues
  }
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
 * Fetch Open-Meteo daily forecast (recent past -5d up to +15d) or historical ERA5 archive (<= -6d).
 * IMPORTANT: Archive API rejects `precipitation_probability_max` with HTTP 400, so we request
 * `precipitation_sum` in archive mode and map observed rainfall to an intuitive display indicator.
 */
async function fetchOpenMeteoRange(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
  locationName: string,
  mode: 'forecast' | 'archive',
  signal?: AbortSignal
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

  // Archive API does NOT support precipitation_probability_max (returns HTTP 400).
  const dailyFields =
    mode === 'forecast'
      ? 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max'
      : 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max';

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    daily: dailyFields,
    timezone: 'auto',
    start_date: startDate,
    end_date: endDate,
  });

  try {
    const res = await fetch(`${baseUrl}?${params.toString()}`, { signal });
    if (!res.ok) {
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

        const precipSum = typeof daily.precipitation_sum?.[i] === 'number' ? daily.precipitation_sum[i] : 0;
        let rainProb = 0;
        if (mode === 'forecast' && typeof daily.precipitation_probability_max?.[i] === 'number') {
          rainProb = Math.round(daily.precipitation_probability_max[i]);
        } else {
          // For historical archive days, translate actual recorded rainfall (mm) cleanly
          rainProb = precipSum >= 5 ? 95 : precipSum >= 1 ? 80 : precipSum > 0.2 ? 50 : 0;
        }

        result[date] = {
          date,
          weatherCode: typeof code === 'number' ? code : 1,
          maxTemp: Math.round(maxT),
          minTemp: Math.round(minT),
          rainProbability: rainProb,
          precipitationSum: Math.round(precipSum * 10) / 10,
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
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    if (diskHit) return diskHit.days;
    throw err;
  }
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
  fallbackDestination: string,
  destinationTz?: string,
  signal?: AbortSignal
): Promise<Record<number, DayWeatherStatus>> {
  const output: Record<number, DayWeatherStatus> = {};
  if (!days || days.length === 0) return output;

  const todayStr = getTodayInTimezone(destinationTz);
  const maxForecastDate = addDaysYYYYMMDD(todayStr, 15);
  // Open-Meteo /v1/forecast covers recent past days seamlessly (avoiding the 2-5 day ERA5 archive lag)
  const archiveCutoffStr = addDaysYYYYMMDD(todayStr, -6);

  // Find trip-wide fallback coordinates from any spot or geocode destination
  let globalCoords: { lat: number; lng: number; name: string } | null = null;
  for (const d of days) {
    const withCoords = d.items.find((it) => isValidCoordinate(it.lat, it.lng));
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
    const geo = await geocodeCity(fallbackDestination, signal);
    if (geo) {
      globalCoords = geo;
    }
  }

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

    const daySpot = d.items.find((it) => isValidCoordinate(it.lat, it.lng));
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

    const mode: 'forecast' | 'archive' = cleanDate <= archiveCutoffStr ? 'archive' : 'forecast';
    const bucketKey = `${mode}:${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}`;

    const existing = groups.get(bucketKey);
    if (existing) {
      if (cleanDate < existing.minDate) existing.minDate = cleanDate;
      if (cleanDate > existing.maxDate) existing.maxDate = cleanDate;
      existing.dayEntries.push({ dayNumber: d.dayNumber, date: cleanDate });
    } else {
      groups.set(bucketKey, {
        lat: coords.lat,
        lng: coords.lng,
        locationName: coords.name,
        mode,
        minDate: cleanDate,
        maxDate: cleanDate,
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
          group.mode,
          signal
        );
        for (const entry of group.dayEntries) {
          const hit = rangeMap[entry.date];
          if (hit) {
            output[entry.dayNumber] = { status: 'ok', forecast: hit };
          } else {
            output[entry.dayNumber] = { status: 'error' };
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        for (const entry of group.dayEntries) {
          output[entry.dayNumber] = { status: 'error' };
        }
      }
    })
  );

  return output;
}
