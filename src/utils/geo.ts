export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Validate that latitude & longitude are finite, within geographic bounds, and not Null Island (0, 0).
 */
export function isValidCoordinate(lat?: number | null, lng?: number | null): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/**
 * Calculate distance between two coordinates in kilometers using Haversine formula
 */
export function calculateDistanceKm(point1: GeoPoint, point2: GeoPoint): number {
  const R = 6371; // Earth radius in km
  const dLat = ((point2.lat - point1.lat) * Math.PI) / 180;
  const dLng = ((point2.lng - point1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((point1.lat * Math.PI) / 180) *
      Math.cos((point2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistance(km: number, lang: string = 'zh'): string {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) {
    const meters = Math.round(km * 1000);
    if (lang === 'en') return `${meters} m`;
    if (lang === 'ja') return `${meters} m`;
    if (lang === 'ko') return `${meters} m`;
    if (lang === 'zh-CN') return `${meters} 米`;
    return `${meters} 公尺`;
  }
  const formatted = km.toFixed(1);
  if (lang === 'en' || lang === 'ja' || lang === 'ko') return `${formatted} km`;
  return `${formatted} 公里`;
}

/**
 * Estimate travel time based on distance
 */
export function estimateTravelTime(km: number): { walkingMin: number; transitMin: number } {
  // Walking avg 4.5 km/h
  const walkingMin = Math.max(1, Math.round((km / 4.5) * 60));
  // Transit avg 25 km/h + 4 min wait/transfer
  const transitMin = Math.max(5, Math.round((km / 25) * 60 + 4));
  return { walkingMin, transitMin };
}

/**
 * Generate Google Maps navigation URL.
 * Uses exact pin coordinates via Directions API when valid coordinates exist (so custom pins
 * and localized titles always route to the exact point), falling back to place search otherwise.
 */
export function getGoogleMapsNavigationUrl(item: {
  title: string;
  lat?: number;
  lng?: number;
  address?: string;
  locationName?: string;
}): string {
  if (isValidCoordinate(item.lat, item.lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}`;
  }

  const cleanTitle = (item.title || '').trim();
  const cleanAddress = (item.address || item.locationName || '').trim();

  let query = cleanTitle;
  if (cleanAddress) {
    if (!cleanTitle) {
      query = cleanAddress;
    } else if (!cleanAddress.toLowerCase().includes(cleanTitle.toLowerCase())) {
      query = `${cleanTitle} ${cleanAddress}`;
    }
  }

  if (query) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  return 'https://www.google.com/maps';
}

/**
 * Generate Google Maps two-point Directions URL (origin -> destination).
 * Automatically prefers walking for short hops (< 1.2 km) and transit otherwise.
 */
export function getGoogleMapsRouteUrl(
  origin: { title: string; lat?: number; lng?: number; address?: string; locationName?: string },
  destination: { title: string; lat?: number; lng?: number; address?: string; locationName?: string },
  travelMode?: 'transit' | 'walking' | 'driving'
): string {
  const formatPoint = (pt: {
    title: string;
    lat?: number;
    lng?: number;
    address?: string;
    locationName?: string;
  }) => {
    if (isValidCoordinate(pt.lat, pt.lng)) {
      return `${pt.lat},${pt.lng}`;
    }
    const label = [pt.title, pt.locationName || pt.address]
      .filter((s) => typeof s === 'string' && s.trim().length > 0)
      .join(' ')
      .trim();
    return label || '';
  };

  const originStr = formatPoint(origin);
  const destStr = formatPoint(destination);
  if (!originStr || !destStr) {
    return getGoogleMapsNavigationUrl(destination);
  }

  let mode = travelMode;
  if (!mode && isValidCoordinate(origin.lat, origin.lng) && isValidCoordinate(destination.lat, destination.lng)) {
    const km = calculateDistanceKm(
      { lat: origin.lat!, lng: origin.lng! },
      { lat: destination.lat!, lng: destination.lng! }
    );
    mode = km <= 1.1 ? 'walking' : 'transit';
  }
  const finalMode = mode || 'transit';
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originStr)}&destination=${encodeURIComponent(destStr)}&travelmode=${finalMode}`;
}

export interface ParsedGoogleMapsPlace {
  name?: string;
  lat?: number;
  lng?: number;
  isShortLink?: boolean;
}

export function looksLikeGoogleMapsUrl(input: string): boolean {
  const trimmed = (input || '').trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  return /(google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(trimmed);
}

/**
 * Parse place name and exact coordinates from a Google Maps URL.
 * Prioritizes exact pin coordinates (!3dLAT!4dLNG) over map viewport (@LAT,LNG).
 */
export function parseGoogleMapsUrl(rawUrl: string): ParsedGoogleMapsPlace | null {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return null;

  // Support pasting raw "lat, lng" directly as a convenience (accepts 2+ decimal digits)
  const rawCoordMatch = trimmed.match(/^(-?\d{1,2}\.\d{2,})\s*[,，\s]\s*(-?\d{1,3}\.\d{2,})$/);
  if (rawCoordMatch) {
    const lat = Number(rawCoordMatch[1]);
    const lng = Number(rawCoordMatch[2]);
    if (isValidCoordinate(lat, lng)) {
      return { lat, lng };
    }
  }

  if (!looksLikeGoogleMapsUrl(trimmed)) return null;

  if (/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(trimmed)) {
    return { isShortLink: true };
  }

  let name: string | undefined;
  let lat: number | undefined;
  let lng: number | undefined;

  // 1. Extract place name from /maps/place/<Name>/...
  const placeMatch = trimmed.match(/\/maps\/place\/([^/@?]+)/i);
  if (placeMatch && placeMatch[1]) {
    try {
      const decoded = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
      if (decoded && !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(decoded)) {
        name = decoded;
      }
    } catch {
      name = placeMatch[1].replace(/\+/g, ' ').trim();
    }
  }

  // 2. Exact pin coordinates (!3dLAT!4dLNG)
  const pinMatch = trimmed.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pinMatch) {
    const pLat = Number(pinMatch[1]);
    const pLng = Number(pinMatch[2]);
    if (isValidCoordinate(pLat, pLng)) {
      lat = pLat;
      lng = pLng;
    }
  }

  // 3. Fallback: @lat,lng
  if (!isValidCoordinate(lat, lng)) {
    const atMatch = trimmed.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      const aLat = Number(atMatch[1]);
      const aLng = Number(atMatch[2]);
      if (isValidCoordinate(aLat, aLng)) {
        lat = aLat;
        lng = aLng;
      }
    }
  }

  // 4. Fallback: query params (?q=lat,lng / ?query= / &ll= / &destination=)
  if (!isValidCoordinate(lat, lng) || !name) {
    try {
      const u = new URL(trimmed);
      const qParam = u.searchParams.get('q') || u.searchParams.get('query') || u.searchParams.get('destination') || u.searchParams.get('ll');
      if (qParam) {
        const coordInQ = qParam.match(/(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/);
        if (coordInQ && !isValidCoordinate(lat, lng)) {
          const qLat = Number(coordInQ[1]);
          const qLng = Number(coordInQ[2]);
          if (isValidCoordinate(qLat, qLng)) {
            lat = qLat;
            lng = qLng;
          }
        } else if (!name && !/^-?\d+\.\d+/.test(qParam.trim())) {
          name = qParam.trim();
        }
      }
    } catch {
      // Ignore malformed URL
    }
  }

  if (!name && !isValidCoordinate(lat, lng)) return null;
  return { name, lat, lng };
}

/**
 * Resolves either a full Google Maps URL or a short link (maps.app.goo.gl / goo.gl/maps).
 * Uses backend /api/resolve-maps-url when available to expand short links cleanly.
 */
export async function resolveGoogleMapsLink(
  rawUrl: string
): Promise<{ place?: ParsedGoogleMapsPlace; error?: string }> {
  const localParsed = parseGoogleMapsUrl(rawUrl);
  if (!localParsed) {
    return { error: '無法辨識此 Google Maps 連結，請貼上完整地圖網址或「緯度, 經度」。' };
  }

  if (!localParsed.isShortLink) {
    return { place: localParsed };
  }

  // Attempt to expand short link via local/backend resolver endpoint
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch('/api/resolve-maps-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: rawUrl.trim() }),
      signal: controller.signal,
    });
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        if (typeof data?.resolvedUrl === 'string') {
          const expanded = parseGoogleMapsUrl(data.resolvedUrl);
          if (expanded && !expanded.isShortLink) {
            return { place: expanded };
          }
        }
      }
    }
    return {
      error: '短網址（maps.app.goo.gl）需先在瀏覽器開啟後複製展開的完整網址，或直接輸入店名搜尋。',
    };
  } catch {
    return {
      error: '純靜態環境無法展開短網址，請在瀏覽器開啟連結後複製完整 Google Maps 網址貼上。',
    };
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Generate Apple Maps navigation URL prioritizing exact pin coordinates with readable place label.
 */
export function getAppleMapsUrl(item: {
  title: string;
  lat?: number;
  lng?: number;
  address?: string;
  locationName?: string;
}): string {
  const cleanTitle = (item.title || '').trim();
  const cleanAddress = (item.address || item.locationName || '').trim();
  const label = encodeURIComponent(cleanTitle || cleanAddress || 'Destination');

  if (isValidCoordinate(item.lat, item.lng)) {
    return `https://maps.apple.com/?daddr=${item.lat},${item.lng}&q=${label}`;
  }

  const query = encodeURIComponent(`${cleanTitle} ${cleanAddress}`.trim() || 'Destination');
  return `https://maps.apple.com/?q=${query}`;
}

/**
 * Free OpenStreetMap Geocoding Search (Nominatim) with 8s timeout & coordinate validation
 */
export async function searchLocationOSM(
  query: string,
  externalSignal?: AbortSignal
): Promise<Array<{ name: string; lat: number; lng: number; address: string }>> {
  if ((typeof navigator !== 'undefined' && !navigator.onLine) || !query.trim()) {
    return [];
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      return [];
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query.trim())}&limit=5&addressdetails=1`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept-Language': 'zh-TW,zh,en',
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .map((item: any) => ({
        name: String(item.display_name || '').split(',')[0].trim() || query.trim(),
        address: String(item.display_name || ''),
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      }))
      .filter((entry) => isValidCoordinate(entry.lat, entry.lng));
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      console.warn('OSM search offline or rate limited:', err);
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}
