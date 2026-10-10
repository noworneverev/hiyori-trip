export interface GeoPoint {
  lat: number;
  lng: number;
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

export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} 公尺`;
  }
  return `${km.toFixed(1)} 公里`;
}

/**
 * Estimate travel time based on distance
 */
export function estimateTravelTime(km: number): { walkingMin: number; transitMin: number } {
  // Walking avg 4.5 km/h
  const walkingMin = Math.max(1, Math.round((km / 4.5) * 60));
  // Transit avg 25 km/h + 5 min wait/transfer
  const transitMin = Math.max(5, Math.round((km / 25) * 60 + 4));
  return { walkingMin, transitMin };
}

/**
 * Generate 100% free Google Maps direct navigation URL (opens native app on phone or web)
 */
export function getGoogleMapsNavigationUrl(item: { title: string; lat?: number; lng?: number; address?: string }): string {
  if (item.lat && item.lng) {
    return `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}`;
  }
  const query = encodeURIComponent(`${item.title} ${item.address || ''}`.trim());
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/**
 * Generate Apple Maps navigation URL
 */
export function getAppleMapsUrl(item: { title: string; lat?: number; lng?: number; address?: string }): string {
  if (item.lat && item.lng) {
    return `https://maps.apple.com/?daddr=${item.lat},${item.lng}&q=${encodeURIComponent(item.title)}`;
  }
  return `https://maps.apple.com/?q=${encodeURIComponent(`${item.title} ${item.address || ''}`.trim())}`;
}

/**
 * Free OpenStreetMap Geocoding Search (Nominatim)
 */
export async function searchLocationOSM(query: string): Promise<Array<{ name: string; lat: number; lng: number; address: string }>> {
  if (!navigator.onLine || !query.trim()) {
    return [];
  }
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'zh-TW,zh,en',
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((item: any) => ({
      name: item.display_name.split(',')[0],
      address: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    }));
  } catch (err) {
    console.warn('OSM search offline or rate limited:', err);
    return [];
  }
}
