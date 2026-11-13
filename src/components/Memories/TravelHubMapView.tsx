import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Language } from '../../utils/i18n';
import { formatDateSlash } from '../../utils/date';
import { getGoogleMapsNavigationUrl } from '../../utils/geo';
import { MediaImage } from '../UI/MediaImage';
import {
  CATEGORY_HEX,
  CATEGORY_NAMES,
  FlattenedSpotMemory,
  GalleryPhotoItem,
  TRIP_MARKER_PALETTE,
} from './travelHubTypes';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Compass,
  ExternalLink,
  Layers,
  MapPin,
  Navigation,
  X,
} from 'lucide-react';

interface TravelHubMapViewProps {
  spots: FlattenedSpotMemory[];
  lang: Language;
  canEditMap: Map<string, boolean>;
  onSelectTrip: (tripId: string, targetSpotId?: string) => void;
  onToggleSpotVisited?: (tripId: string, dayNumber: number, spotId: string, e: React.MouseEvent) => void;
  onOpenLightbox: (photos: GalleryPhotoItem[], index: number) => void;
  onCloseHub: () => void;
}

interface CityHotspot {
  city: string;
  count: number;
  photoCount: number;
  centerLat: number;
  centerLng: number;
  bounds: L.LatLngBounds;
}

export const TravelHubMapView: React.FC<TravelHubMapViewProps> = ({
  spots,
  canEditMap,
  onSelectTrip,
  onToggleSpotVisited,
  onOpenLightbox,
  onCloseHub,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const hotspotLayerRef = useRef<L.LayerGroup | null>(null);

  const [colorBy, setColorBy] = useState<'trip' | 'category'>('trip');
  const [showHotspots, setShowHotspots] = useState(true);
  const [selectedSpot, setSelectedSpot] = useState<FlattenedSpotMemory | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [showUnmapped, setShowUnmapped] = useState(false);

  const mappedSpots = useMemo(
    () =>
      spots.filter(
        (s) =>
          typeof s.lat === 'number' &&
          typeof s.lng === 'number' &&
          !isNaN(s.lat) &&
          !isNaN(s.lng)
      ),
    [spots]
  );

  const unmappedSpots = useMemo(
    () =>
      spots.filter(
        (s) =>
          typeof s.lat !== 'number' ||
          typeof s.lng !== 'number' ||
          isNaN(s.lat) ||
          isNaN(s.lng)
      ),
    [spots]
  );

  const tripColorMap = useMemo(() => {
    const map = new Map<string, string>();
    let idx = 0;
    spots.forEach((s) => {
      if (!map.has(s.tripId)) {
        map.set(s.tripId, TRIP_MARKER_PALETTE[idx % TRIP_MARKER_PALETTE.length]);
        idx++;
      }
    });
    return map;
  }, [spots]);

  const cityHotspots = useMemo<CityHotspot[]>(() => {
    const grouped = new Map<
      string,
      { lats: number[]; lngs: number[]; count: number; photoCount: number }
    >();

    mappedSpots.forEach((s) => {
      const city = s.tripDestination?.trim() || '自由行足跡';
      const entry = grouped.get(city) || { lats: [], lngs: [], count: 0, photoCount: 0 };
      entry.lats.push(s.lat!);
      entry.lngs.push(s.lng!);
      entry.count += 1;
      entry.photoCount += s.photos.length;
      grouped.set(city, entry);
    });

    const list: CityHotspot[] = [];
    grouped.forEach((val, city) => {
      const latAvg = val.lats.reduce((a, b) => a + b, 0) / val.lats.length;
      const lngAvg = val.lngs.reduce((a, b) => a + b, 0) / val.lngs.length;
      const latLngs = val.lats.map((lat, i) => L.latLng(lat, val.lngs[i]));
      list.push({
        city,
        count: val.count,
        photoCount: val.photoCount,
        centerLat: latAvg,
        centerLng: lngAvg,
        bounds: L.latLngBounds(latLngs),
      });
    });

    return list.sort((a, b) => b.count - a.count);
  }, [mappedSpots]);

  // Keep selectedSpot fresh when completion toggles
  useEffect(() => {
    if (!selectedSpot) return;
    const updated = spots.find(
      (s) => s.tripId === selectedSpot.tripId && s.spotId === selectedSpot.spotId
    );
    if (updated) setSelectedSpot(updated);
    else setSelectedSpot(null);
  }, [spots]);

  // Initialize Leaflet instance once
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      center: [35.6762, 139.6503],
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const hotspotLayer = L.layerGroup().addTo(map);
    const markersLayer = L.layerGroup().addTo(map);

    mapRef.current = map;
    hotspotLayerRef.current = hotspotLayer;
    markersLayerRef.current = markersLayer;

    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 120);

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);

    return () => {
      clearTimeout(resizeTimer);
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      hotspotLayerRef.current = null;
    };
  }, []);

  // Render markers & city density rings whenever filtered data or styling changes
  useEffect(() => {
    const map = mapRef.current;
    const markersLayer = markersLayerRef.current;
    const hotspotLayer = hotspotLayerRef.current;
    if (!map || !markersLayer || !hotspotLayer) return;

    markersLayer.clearLayers();
    hotspotLayer.clearLayers();

    if (showHotspots) {
      cityHotspots.forEach((hs) => {
        const radiusMeters = Math.min(35000, Math.max(4500, hs.count * 2200));
        const ring = L.circle([hs.centerLat, hs.centerLng], {
          radius: radiusMeters,
          color: '#0d9488',
          weight: 1.5,
          opacity: 0.45,
          fillColor: '#0d9488',
          fillOpacity: 0.08,
        });
        ring.on('click', () => {
          setSelectedCity(hs.city);
          map.fitBounds(hs.bounds.pad(0.28), { maxZoom: 13 });
        });
        ring.addTo(hotspotLayer);
      });
    }

    const latLngs: L.LatLngExpression[] = [];

    mappedSpots.forEach((spot) => {
      const color =
        colorBy === 'trip'
          ? tripColorMap.get(spot.tripId) || '#0d9488'
          : CATEGORY_HEX[spot.category] || '#0d9488';
      const isActive =
        selectedSpot?.tripId === spot.tripId && selectedSpot?.spotId === spot.spotId;
      const hasPhoto = spot.photos.length > 0;
      const size = isActive ? 30 : hasPhoto ? 24 : 18;

      const icon = L.divIcon({
        className: 'hiyori-hub-marker',
        html: `<div style="
          width:${size}px;
          height:${size}px;
          border-radius:9999px;
          background:${color};
          border:${isActive ? '3px solid #ffffff' : '2px solid #ffffff'};
          box-shadow:0 3px 10px rgba(15,23,42,0.35);
          display:flex;
          align-items:center;
          justify-content:center;
          color:#ffffff;
          font-size:10px;
          font-weight:700;
          transition:transform 0.15s ease;
        ">${hasPhoto ? '●' : ''}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([spot.lat!, spot.lng!], { icon });
      marker.on('click', () => {
        setSelectedSpot(spot);
        setSelectedCity(spot.tripDestination || null);
        map.flyTo([spot.lat!, spot.lng!], Math.max(map.getZoom(), 13), { duration: 0.45 });
      });
      marker.bindTooltip(`${spot.spotTitle} · ${spot.tripDestination}`, {
        direction: 'top',
        offset: [0, -10],
      });
      marker.addTo(markersLayer);
      latLngs.push([spot.lat!, spot.lng!]);
    });

    if (latLngs.length > 0 && !selectedSpot && !selectedCity) {
      const bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds.pad(0.18), { maxZoom: 13 });
    }
  }, [mappedSpots, cityHotspots, colorBy, showHotspots, selectedSpot?.spotId, tripColorMap]);

  const handleCityFocus = (hs: CityHotspot) => {
    setSelectedCity(hs.city);
    setSelectedSpot(null);
    if (mapRef.current) {
      mapRef.current.fitBounds(hs.bounds.pad(0.25), { maxZoom: 13 });
    }
  };

  const handleResetView = () => {
    setSelectedCity(null);
    setSelectedSpot(null);
    if (mapRef.current && mappedSpots.length > 0) {
      const bounds = L.latLngBounds(mappedSpots.map((s) => [s.lat!, s.lng!]));
      mapRef.current.fitBounds(bounds.pad(0.18), { maxZoom: 13 });
    }
  };

  const selectedSpotPhotos: GalleryPhotoItem[] = useMemo(() => {
    if (!selectedSpot) return [];
    return selectedSpot.photos.map((url, idx) => ({
      id: `${selectedSpot.tripId}-${selectedSpot.spotId}-${idx}`,
      url,
      tripId: selectedSpot.tripId,
      tripTitle: selectedSpot.tripTitle,
      tripDestination: selectedSpot.tripDestination,
      ownerId: selectedSpot.ownerId,
      collabId: selectedSpot.collabId,
      spotId: selectedSpot.spotId,
      spotTitle: selectedSpot.spotTitle,
      dayNumber: selectedSpot.dayNumber,
      date: selectedSpot.date,
      category: selectedSpot.category,
      locationName: selectedSpot.locationName,
      mood: selectedSpot.mood,
      caption: selectedSpot.notes,
      googlePhotosUrl: selectedSpot.googlePhotosUrl,
      isFeaturedSpot: true,
    }));
  }, [selectedSpot]);

  return (
    <div className="space-y-4">
      {/* City Quick Jump Strip & Map Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            onClick={handleResetView}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
              selectedCity === null
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-teal-500'
            }`}
          >
            全景足跡 ({mappedSpots.length})
          </button>
          {cityHotspots.map((hs) => (
            <button
              key={hs.city}
              type="button"
              onClick={() => handleCityFocus(hs)}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
                selectedCity === hs.city
                  ? 'bg-teal-600 text-white'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-teal-500'
              }`}
            >
              <span>{hs.city}</span>
              <span className="font-mono tabular-nums opacity-75">{hs.count}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setColorBy((prev) => (prev === 'trip' ? 'category' : 'trip'))}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-500 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Layers className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>{colorBy === 'trip' ? '依旅程分色' : '依類別分色'}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowHotspots((prev) => !prev)}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              showHotspots
                ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-300 dark:border-teal-800 text-teal-800 dark:text-teal-200'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>城市熱區</span>
          </button>
        </div>
      </div>

      {/* Main Map Stage + Spot Preview Card */}
      <div className="relative rounded-3xl overflow-hidden border border-slate-200/90 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
        <div
          ref={mapContainerRef}
          className="w-full h-[380px] sm:h-[460px] lg:h-[520px]"
        />

        {mappedSpots.length === 0 && (
          <div className="absolute inset-0 z-20 bg-white/85 dark:bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center space-y-2">
            <MapPin className="w-8 h-8 text-slate-400" />
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              目前篩選條件下尚無經緯度座標
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
              在行程景點中使用「地圖選點」或搜尋地點儲存後，足跡座標將自動點亮於世界地圖上。
            </p>
          </div>
        )}

        {/* Selected Spot Editorial Preview Overlay */}
        {selectedSpot && (
          <div className="absolute inset-x-3 bottom-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[360px] z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5 flex-wrap">
                  <span>{selectedSpot.tripDestination}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {selectedSpot.date ? formatDateSlash(selectedSpot.date) : `D${selectedSpot.dayNumber}`}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{CATEGORY_NAMES[selectedSpot.category] || '景點'}</span>
                </div>
                <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-snug">
                  {selectedSpot.spotTitle}
                </h4>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {onToggleSpotVisited && (canEditMap.get(selectedSpot.tripId) ?? true) && (
                  <button
                    type="button"
                    onClick={(e) =>
                      onToggleSpotVisited(
                        selectedSpot.tripId,
                        selectedSpot.dayNumber,
                        selectedSpot.spotId,
                        e
                      )
                    }
                    className={`min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center transition cursor-pointer ${
                      selectedSpot.completed
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                    title={selectedSpot.completed ? '已造訪（點擊切換）' : '標記為已造訪'}
                  >
                    {selectedSpot.completed ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Circle className="w-4 h-4" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedSpot(null)}
                  className="min-w-[36px] min-h-[36px] rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition cursor-pointer"
                  aria-label="關閉景點預覽"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {(selectedSpot.locationName || selectedSpot.address) && (
              <p className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                <span className="line-clamp-2">
                  {selectedSpot.locationName || selectedSpot.address}
                </span>
              </p>
            )}

            {selectedSpot.notes && (
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3 border-t border-slate-100 dark:border-slate-800 pt-2">
                {selectedSpot.notes}
              </p>
            )}

            {selectedSpot.photos.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
                {selectedSpot.photos.map((url, idx) => (
                  <MediaImage
                    key={idx}
                    src={url}
                    tripId={selectedSpot.tripId}
                    ownerId={selectedSpot.ownerId}
                    collabId={selectedSpot.collabId}
                    alt={selectedSpot.spotTitle}
                    onClick={() => onOpenLightbox(selectedSpotPhotos, idx)}
                    className="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700 cursor-pointer hover:opacity-90 transition shrink-0"
                  />
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  onSelectTrip(selectedSpot.tripId, selectedSpot.spotId);
                  onCloseHub();
                }}
                className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <span>前往該日行程</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <a
                href={getGoogleMapsNavigationUrl({
                  title: selectedSpot.spotTitle,
                  lat: selectedSpot.lat,
                  lng: selectedSpot.lng,
                  address: selectedSpot.address,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1 transition whitespace-nowrap"
              >
                <Navigation className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>導航</span>
                <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Unmapped Spots Quiet Editorial Index */}
      {unmappedSpots.length > 0 && (
        <div className="border-t border-slate-200/80 dark:border-slate-800 pt-3">
          <button
            type="button"
            onClick={() => setShowUnmapped((prev) => !prev)}
            className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 flex items-center gap-1.5 cursor-pointer py-1"
          >
            <span>尚有 {unmappedSpots.length} 筆未標記經緯度的紀錄</span>
            <span className="text-teal-600 dark:text-teal-400">
              {showUnmapped ? '收合清單' : '展開檢視'}
            </span>
          </button>

          {showUnmapped && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-3">
              {unmappedSpots.slice(0, 18).map((s) => (
                <button
                  key={`${s.tripId}-${s.spotId}`}
                  type="button"
                  onClick={() => {
                    onSelectTrip(s.tripId, s.spotId);
                    onCloseHub();
                  }}
                  className="text-left p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-teal-500 transition space-y-1 cursor-pointer"
                >
                  <div className="text-[11px] text-slate-400 font-mono tabular-nums truncate">
                    {s.tripDestination} · {s.date ? formatDateSlash(s.date) : `D${s.dayNumber}`}
                  </div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                    {s.spotTitle}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
