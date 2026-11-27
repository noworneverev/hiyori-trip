import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useModalLayer } from '../../hooks/useModalHistory';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Trip, ItineraryItem } from '../../types/itinerary';
import { getGoogleMapsNavigationUrl, isValidCoordinate } from '../../utils/geo';
import { formatDateSlash, getDayOfWeek } from '../../utils/date';
import { Language } from '../../utils/i18n';
import {
  MapPin,
  Calendar,
  Clock,
  Map as MapIcon,
  Pin,
  Train,
  CheckCircle2,
  DollarSign,
  X,
  Search,
  ExternalLink,
  Layers,
  ChevronRight,
  Navigation,
  Utensils,
  Hotel,
  ShoppingBag,
  Sparkles,
  Lock,
  Unlock,
} from 'lucide-react';

function escapeHtml(str?: string | number | null): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface OverviewSpot {
  id: string;
  dayId: string;
  dayNumber: number;
  dayDate: string;
  dayTheme?: string;
  item: ItineraryItem;
  orderIndex: number;
}

interface TripOverviewMapProps {
  trip: Trip;
  onSelectDay?: (dayNumber: number) => void;
  lang?: Language;
  heightClass?: string;
  initialSelectedSpotId?: string;
}

export const DAY_PALETTE = [
  '#0d9488', // Teal (Day 1)
  '#059669', // Emerald (Day 2)
  '#d97706', // Amber (Day 3)
  '#e11d48', // Rose (Day 4)
  '#4f46e5', // Indigo (Day 5)
  '#7c3aed', // Violet (Day 6)
  '#0891b2', // Cyan (Day 7)
  '#2563eb', // Blue (Day 8)
  '#ea580c', // Orange (Day 9)
  '#be185d', // Pink (Day 10+)
];

export const CATEGORY_COLORS: Record<string, string> = {
  spot: '#0d9488',
  food: '#ea580c',
  transport: '#0284c7',
  hotel: '#7c3aed',
  shopping: '#db2777',
  activity: '#e11d48',
  other: '#475569',
};

const CATEGORY_LABELS: Record<string, { zh: string; en: string; icon: any }> = {
  spot: { zh: '景點', en: 'Spot', icon: MapPin },
  food: { zh: '美食', en: 'Food', icon: Utensils },
  transport: { zh: '交通', en: 'Transit', icon: Train },
  hotel: { zh: '住宿', en: 'Stay', icon: Hotel },
  shopping: { zh: '購物', en: 'Shop', icon: ShoppingBag },
  activity: { zh: '活動', en: 'Activity', icon: Sparkles },
  other: { zh: '其他', en: 'Other', icon: Pin },
};

function isCoarseTouchDevice(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

function spiderfyOverviewSpots(spots: OverviewSpot[]): Array<{ spot: OverviewSpot; lat: number; lng: number }> {
  const buckets = new Map<string, number[]>();
  spots.forEach((spot, idx) => {
    const key = `${spot.item.lat!.toFixed(5)},${spot.item.lng!.toFixed(5)}`;
    const list = buckets.get(key);
    if (list) list.push(idx);
    else buckets.set(key, [idx]);
  });

  const out = spots.map((spot) => ({
    spot,
    lat: spot.item.lat!,
    lng: spot.item.lng!,
  }));

  buckets.forEach((indices) => {
    if (indices.length <= 1) return;
    const radius = 0.00016;
    indices.forEach((entryIdx, pos) => {
      const angle = (2 * Math.PI * pos) / indices.length - Math.PI / 2;
      out[entryIdx].lat += Math.cos(angle) * radius;
      out[entryIdx].lng += Math.sin(angle) * radius * 1.25;
    });
  });

  return out;
}

export const TripOverviewMap: React.FC<TripOverviewMapProps> = ({
  trip,
  onSelectDay,
  lang = 'zh',
  heightClass = 'h-[420px] sm:h-[500px]',
  initialSelectedSpotId,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLinesLayerRef = useRef<L.LayerGroup | null>(null);
  const markersMapRef = useRef<Map<string, { marker: L.Marker; spot: OverviewSpot; lat: number; lng: number }>>(new Map());

  // Filter States
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | 'all'>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [colorMode, setColorMode] = useState<'day' | 'category'>('day');

  // Separate lightweight preview selection (floating map card) from full detail modal
  const [previewSpot, setPreviewSpot] = useState<OverviewSpot | null>(null);
  const [detailModalSpot, setDetailModalSpot] = useState<OverviewSpot | null>(null);

  const [isTouchDevice] = useState<boolean>(() => isCoarseTouchDevice());
  const [isTouchMapUnlocked, setIsTouchMapUnlocked] = useState<boolean>(false);
  const effectiveDragEnabled = !isTouchDevice || isTouchMapUnlocked;

  useBodyScrollLock(Boolean(detailModalSpot));
  useModalLayer(Boolean(detailModalSpot), () => setDetailModalSpot(null));

  // Reset filters & selection when switching trips
  useEffect(() => {
    setSelectedDayFilter('all');
    setSelectedCategoryFilter('all');
    setSearchQuery('');
    setPreviewSpot(null);
    setDetailModalSpot(null);
  }, [trip.id]);

  // Collect all validly marked spots across all days
  const allSpots: OverviewSpot[] = useMemo(() => {
    const list: OverviewSpot[] = [];
    let count = 0;
    trip.days.forEach((day) => {
      day.items.forEach((item) => {
        if (isValidCoordinate(item.lat, item.lng)) {
          count += 1;
          list.push({
            id: item.id,
            dayId: day.id,
            dayNumber: day.dayNumber,
            dayDate: day.date,
            dayTheme: day.theme,
            item,
            orderIndex: count,
          });
        }
      });
    });
    return list;
  }, [trip]);

  useEffect(() => {
    if (initialSelectedSpotId) {
      const match = allSpots.find((s) => s.id === initialSelectedSpotId);
      if (match) setPreviewSpot(match);
    }
  }, [initialSelectedSpotId, allSpots]);

  const filteredSpots = useMemo(() => {
    return allSpots.filter((s) => {
      if (selectedDayFilter !== 'all' && s.dayNumber !== selectedDayFilter) return false;
      if (selectedCategoryFilter !== 'all' && s.item.category !== selectedCategoryFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const inTitle = s.item.title.toLowerCase().includes(query);
        const inLocation = (s.item.locationName || '').toLowerCase().includes(query);
        const inAddress = (s.item.address || '').toLowerCase().includes(query);
        const inNotes = (s.item.notes || '').toLowerCase().includes(query);
        if (!inTitle && !inLocation && !inAddress && !inNotes) return false;
      }
      return true;
    });
  }, [allSpots, selectedDayFilter, selectedCategoryFilter, searchQuery]);

  const buildPinIcon = (spot: OverviewSpot, mode: 'day' | 'category', isSelected: boolean) => {
    const markerColor =
      mode === 'day'
        ? DAY_PALETTE[(spot.dayNumber - 1) % DAY_PALETTE.length]
        : CATEGORY_COLORS[spot.item.category] || '#0d9488';
    const dayBadgeColor = DAY_PALETTE[(spot.dayNumber - 1) % DAY_PALETTE.length];
    const safeTitle = escapeHtml(spot.item.title);
    const showLabelAlways = isSelected || filteredSpots.length <= 5;

    return L.divIcon({
      className: 'custom-trip-overview-marker',
      html: `
        <div class="relative flex flex-col items-center group cursor-pointer" style="width:136px;margin-left:-47px;">
          <div class="px-2 py-0.5 mb-1 rounded-md text-[10.5px] font-bold bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-slate-100 shadow-md border border-slate-200 dark:border-slate-700 truncate max-w-[132px] pointer-events-none transition-all group-hover:scale-105 ${
            showLabelAlways ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }">
            <span class="text-[9px] font-extrabold mr-1 px-1 rounded text-white" style="background-color: ${dayBadgeColor}">D${spot.dayNumber}</span>
            ${safeTitle}
          </div>
          <div style="background-color: ${markerColor};" class="w-8 h-8 rounded-full text-white flex items-center justify-center font-black text-xs shadow-lg border-2 border-white dark:border-slate-900 transition-transform ${
            isSelected ? 'scale-125 ring-4 ring-teal-400 marker-pulse' : 'hover:scale-110'
          }">
            <span>D${spot.dayNumber}</span>
          </div>
          <div style="border-top-color: ${markerColor};" class="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px]"></div>
        </div>
      `,
      iconSize: [42, 58],
      iconAnchor: [21, 56],
    });
  };

  // Initialize Map with ResizeObserver (eliminates grey tiles & dangling timeouts)
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const firstSpot = allSpots[0];
    const initialCenter: [number, number] = firstSpot
      ? [firstSpot.item.lat!, firstSpot.item.lng!]
      : [36.5613, 136.6562];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 11,
      zoomControl: true,
      attributionControl: false,
      dragging: !isCoarseTouchDevice(),
      tapHold: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c'],
    }).addTo(map);

    L.control
      .attribution({
        prefix: false,
        position: 'bottomright',
      })
      .addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>')
      .addTo(map);

    const routesGroup = L.layerGroup().addTo(map);
    const markersGroup = L.layerGroup().addTo(map);

    routeLinesLayerRef.current = routesGroup;
    markersLayerRef.current = markersGroup;
    mapInstanceRef.current = map;

    map.on('click', () => {
      setPreviewSpot(null);
    });

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
      routeLinesLayerRef.current = null;
      markersMapRef.current.clear();
    };
  }, []);

  // Sync mobile touch drag protection
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (effectiveDragEnabled) {
      map.dragging.enable();
      map.touchZoom.enable();
    } else {
      map.dragging.disable();
    }
  }, [effectiveDragEnabled]);

  // Render Markers and Day Route Lines ONLY when filteredSpots or colorMode changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    const routesGroup = routeLinesLayerRef.current;
    if (!map || !markersGroup || !routesGroup) return;

    markersGroup.clearLayers();
    routesGroup.clearLayers();
    markersMapRef.current.clear();

    if (filteredSpots.length === 0) return;

    // Group filtered spots by day to draw connecting routes per day
    const dayGroups: Record<number, OverviewSpot[]> = {};
    filteredSpots.forEach((spot) => {
      if (!dayGroups[spot.dayNumber]) dayGroups[spot.dayNumber] = [];
      dayGroups[spot.dayNumber].push(spot);
    });

    Object.keys(dayGroups).forEach((dayNumStr) => {
      const dayNum = parseInt(dayNumStr, 10);
      const spotsInDay = dayGroups[dayNum];
      if (spotsInDay.length > 1) {
        const dayCoords = spotsInDay.map((s) => [s.item.lat!, s.item.lng!] as [number, number]);
        const dayColor = DAY_PALETTE[(dayNum - 1) % DAY_PALETTE.length];
        const polyline = L.polyline(dayCoords, {
          color: dayColor,
          weight: 3.5,
          opacity: 0.75,
          dashArray: '6, 6',
        });
        routesGroup.addLayer(polyline);
      }
    });

    const spiderfied = spiderfyOverviewSpots(filteredSpots);
    const rawBoundsCoords: L.LatLngExpression[] = [];

    spiderfied.forEach(({ spot, lat, lng }) => {
      rawBoundsCoords.push([spot.item.lat!, spot.item.lng!]);
      const marker = L.marker([lat, lng], {
        icon: buildPinIcon(spot, colorMode, previewSpot?.id === spot.id),
        zIndexOffset: previewSpot?.id === spot.id ? 500 : 0,
      });

      // Clicking a pin smoothly focuses it & opens the non-overlapping bottom preview card
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setPreviewSpot(spot);
        map.panTo([lat, lng], { animate: true });
      });

      markersGroup.addLayer(marker);
      markersMapRef.current.set(spot.id, { marker, spot, lat, lng });
    });

    if (initialSelectedSpotId) {
      const targetEntry = markersMapRef.current.get(initialSelectedSpotId);
      if (targetEntry) {
        map.setView([targetEntry.lat, targetEntry.lng], 15, { animate: true });
        return;
      }
    }

    if (rawBoundsCoords.length > 0) {
      const bounds = L.latLngBounds(rawBoundsCoords);
      map.fitBounds(bounds, { padding: [44, 44], maxZoom: 15 });
    }
  }, [filteredSpots, colorMode]);

  // Update active pin highlight WITHOUT destroying markers or resetting user zoom
  useEffect(() => {
    markersMapRef.current.forEach(({ marker, spot }, id) => {
      const isSelected = previewSpot?.id === id || detailModalSpot?.id === id;
      marker.setIcon(buildPinIcon(spot, colorMode, isSelected));
      marker.setZIndexOffset(isSelected ? 500 : 0);
    });
  }, [previewSpot?.id, detailModalSpot?.id, colorMode]);

  // Focus map when a spot card in the carousel is clicked
  const handleSpotCardClick = (spot: OverviewSpot) => {
    setPreviewSpot(spot);
    const map = mapInstanceRef.current;
    const entry = markersMapRef.current.get(spot.id);
    if (map && entry) {
      map.setView([entry.lat, entry.lng], Math.max(map.getZoom(), 14), { animate: true });
    }
  };

  const isZh = lang === 'zh' || lang === 'zh-CN';

  return (
    <div className="space-y-3">
      {/* 1. Overview Control Bar: Search & Filters */}
      <div className="bg-white dark:bg-[#111827] rounded-2xl border border-[#E5E2DC] dark:border-slate-800 p-3 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-700 dark:bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <MapIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                  {isZh ? '旅程全景點概覽地圖' : 'Trip Attractions Overview Map'}
                </h3>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  · {filteredSpots.length} / {allSpots.length} {isZh ? '處座標景點' : 'Spots'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isZh
                  ? '點選任意地圖標記或下方卡片，即可快速導航或查看完整詳情'
                  : 'Tap any pin or card below to navigate or inspect full details'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-center shrink-0">
            <span className="text-[11px] text-slate-400 font-medium">色彩：</span>
            <div className="inline-flex rounded-xl p-0.5 bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setColorMode('day')}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                  colorMode === 'day'
                    ? 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                依日程
              </button>
              <button
                type="button"
                onClick={() => setColorMode('category')}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                  colorMode === 'category'
                    ? 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                依類別
              </button>
            </div>
          </div>
        </div>

        {/* Filter Buttons & Search */}
        <div className="space-y-2 pt-2.5 border-t border-[#E5E2DC] dark:border-slate-800">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <span className="text-[11px] text-slate-400 font-bold shrink-0 mr-1">日程:</span>
            <button
              type="button"
              onClick={() => setSelectedDayFilter('all')}
              className={`min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer tabular-nums ${
                selectedDayFilter === 'all'
                  ? 'bg-teal-700 dark:bg-teal-600 text-white shadow-2xs'
                  : 'bg-[#FAF9F6] dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-[#E5E2DC] dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              全部 ({allSpots.length})
            </button>
            {trip.days.map((day) => {
              const countInDay = allSpots.filter((s) => s.dayNumber === day.dayNumber).length;
              const isCurrent = selectedDayFilter === day.dayNumber;
              const dayColor = DAY_PALETTE[(day.dayNumber - 1) % DAY_PALETTE.length];
              return (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => setSelectedDayFilter(day.dayNumber)}
                  className={`min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1 cursor-pointer ${
                    isCurrent
                      ? 'text-white shadow-2xs'
                      : 'bg-[#FAF9F6] dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-[#E5E2DC] dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  style={isCurrent ? { backgroundColor: dayColor } : {}}
                >
                  <span>Day {day.dayNumber}</span>
                  <span className="text-[10px] opacity-75 font-mono tabular-nums font-normal">({countInDay})</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              <span className="text-[11px] text-slate-400 font-bold shrink-0 mr-1">類別:</span>
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter('all')}
                className={`min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-bold transition shrink-0 cursor-pointer ${
                  selectedCategoryFilter === 'all'
                    ? 'bg-teal-700 dark:bg-teal-600 text-white'
                    : 'bg-[#FAF9F6] dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-[#E5E2DC] dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                全類別
              </button>
              {Object.entries(CATEGORY_LABELS).map(([catKey, catMeta]) => {
                const count = allSpots.filter((s) => s.item.category === catKey).length;
                if (count === 0) return null;
                const isSelected = selectedCategoryFilter === catKey;
                return (
                  <button
                    key={catKey}
                    type="button"
                    onClick={() => setSelectedCategoryFilter(catKey)}
                    className={`min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-bold transition shrink-0 flex items-center gap-1 cursor-pointer ${
                      isSelected
                        ? 'bg-teal-700 dark:bg-teal-600 text-white'
                        : 'bg-[#FAF9F6] dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-[#E5E2DC] dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{isZh ? catMeta.zh : catMeta.en}</span>
                    <span className="text-[10px] opacity-70 font-mono tabular-nums font-normal">({count})</span>
                  </button>
                );
              })}
            </div>

            <div className="relative shrink-0 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜尋景點名稱、城市、地址..."
                className="w-full min-h-[36px] pl-8 pr-7 py-1.5 text-xs rounded-xl bg-[#FAF9F6] dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-[#E5E2DC] dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Interactive Map Container */}
      <div
        className={`relative isolate z-0 w-full ${heightClass} rounded-2xl overflow-hidden shadow-inner border border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-950 ${
          !effectiveDragEnabled ? 'touch-pan-y' : ''
        }`}
      >
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Mobile Scroll-Trap Protection Pill */}
        {isTouchDevice && filteredSpots.length > 0 && (
          <button
            type="button"
            onClick={() => setIsTouchMapUnlocked((prev) => !prev)}
            className={`absolute top-3 right-3 z-[450] min-h-[36px] px-3 py-1.5 rounded-full text-[11px] font-bold shadow-md border backdrop-blur-md flex items-center gap-1.5 transition cursor-pointer ${
              isTouchMapUnlocked
                ? 'bg-teal-700 text-white border-teal-600'
                : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 border-[#E5E2DC] dark:border-slate-700'
            }`}
          >
            {isTouchMapUnlocked ? (
              <>
                <Unlock className="w-3.5 h-3.5" />
                <span>拖曳已解鎖</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>點此移動地圖</span>
              </>
            )}
          </button>
        )}

        {/* Empty notice */}
        {filteredSpots.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#FAF9F6]/90 dark:bg-[#090D16]/85 backdrop-blur-[2px] z-[440] p-4 text-center">
            <div className="max-w-xs">
              <div className="w-10 h-10 rounded-2xl bg-slate-200/80 dark:bg-slate-800 flex items-center justify-center mx-auto mb-2 text-slate-500">
                <MapPin className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">無符合條件的景點</p>
              <p className="text-[11px] text-slate-500 mt-1">請嘗試清除搜尋條件或切換不同日程</p>
              <button
                type="button"
                onClick={() => {
                  setSelectedDayFilter('all');
                  setSelectedCategoryFilter('all');
                  setSearchQuery('');
                }}
                className="mt-2.5 px-3 py-1.5 bg-teal-700 dark:bg-teal-600 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                重設篩選
              </button>
            </div>
          </div>
        )}

        {/* Floating Reset Zoom Button (hidden when preview card is covering bottom) */}
        {filteredSpots.length > 0 && !previewSpot && (
          <button
            type="button"
            onClick={() => {
              const map = mapInstanceRef.current;
              if (map && filteredSpots.length > 0) {
                const bounds = L.latLngBounds(
                  filteredSpots.map((s) => [s.item.lat!, s.item.lng!] as [number, number])
                );
                map.fitBounds(bounds, { padding: [44, 44], maxZoom: 15 });
              }
            }}
            className="absolute bottom-4 left-4 z-[450] bg-white/95 dark:bg-[#111827]/95 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold shadow-md border border-[#E5E2DC] dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 flex items-center gap-1.5 transition cursor-pointer"
          >
            <MapIcon className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
            <span>全景縮放</span>
          </button>
        )}

        {/* Clean Floating Bottom Preview Card (zero Leaflet popup clipping or double modal clash!) */}
        {previewSpot && (
          <div className="absolute bottom-3 left-3 right-3 z-[460] bg-white/96 dark:bg-[#111827]/96 backdrop-blur-md rounded-2xl border border-[#E5E2DC] dark:border-slate-700 shadow-xl p-3 animate-in slide-in-from-bottom-4 duration-150">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] mb-0.5">
                  <span
                    className="px-1.5 py-0.5 rounded font-bold text-white font-mono tabular-nums"
                    style={{ backgroundColor: DAY_PALETTE[(previewSpot.dayNumber - 1) % DAY_PALETTE.length] }}
                  >
                    Day {previewSpot.dayNumber}
                  </span>
                  {previewSpot.item.startTime && (
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                      {previewSpot.item.startTime}
                      {previewSpot.item.endTime ? `~${previewSpot.item.endTime}` : ''}
                    </span>
                  )}
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-600 dark:text-slate-300 font-semibold">
                    {CATEGORY_LABELS[previewSpot.item.category]?.zh || '景點'}
                  </span>
                </div>
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                  {previewSpot.item.title}
                </h4>
                {previewSpot.item.locationName && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {previewSpot.item.locationName}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPreviewSpot(null)}
                aria-label="關閉預覽"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setDetailModalSpot(previewSpot)}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 text-white text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition"
              >
                <span>完整詳情</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <a
                href={getGoogleMapsNavigationUrl(previewSpot.item)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#FAF9F6] dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700 text-slate-800 dark:text-slate-100 text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                <Navigation className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                <span>Google 導航</span>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* 3. Horizontal Carousel of Spots for Quick Navigation */}
      {filteredSpots.length > 0 && (
        <div className="bg-white dark:bg-[#111827] rounded-2xl border border-[#E5E2DC] dark:border-slate-800 p-3 shadow-2xs">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 tabular-nums">
              <Layers className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
              <span>景點快捷導覽 ({filteredSpots.length})</span>
            </span>
            <span className="text-[10px] text-slate-400">點選定位景點</span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {filteredSpots.map((spot) => {
              const isSelected = previewSpot?.id === spot.id;
              const dayColor = DAY_PALETTE[(spot.dayNumber - 1) % DAY_PALETTE.length];
              return (
                <div
                  key={spot.id}
                  onClick={() => handleSpotCardClick(spot)}
                  className={`min-w-[184px] max-w-[205px] p-2.5 rounded-xl border transition cursor-pointer shrink-0 select-none ${
                    isSelected
                      ? 'border-teal-600 dark:border-teal-500 bg-teal-50/70 dark:bg-teal-950/40 shadow-2xs'
                      : 'border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-900/50 hover:bg-slate-100/70 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white shrink-0 font-mono tabular-nums"
                      style={{ backgroundColor: dayColor }}
                    >
                      Day {spot.dayNumber}
                    </span>
                    {spot.item.startTime && (
                      <span className="text-[10px] font-mono tabular-nums text-slate-400 truncate">
                        {spot.item.startTime}
                      </span>
                    )}
                  </div>
                  <h5 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                    {spot.item.title}
                  </h5>
                  {spot.item.locationName && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {spot.item.locationName}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. FULL ATTRACTION DETAIL MODAL (only opened explicitly via "完整詳情") */}
      {detailModalSpot && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:px-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[env(safe-area-inset-bottom,0px)] sm:pb-[max(1rem,env(safe-area-inset-bottom,0px))] bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setDetailModalSpot(null)}
        >
          <div
            className="bg-white dark:bg-[#111827] rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[88dvh] overflow-y-auto border border-[#E5E2DC] dark:border-slate-800 shadow-2xl p-5 sm:p-6 space-y-4 animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150 relative text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="font-bold font-mono tabular-nums text-teal-700 dark:text-teal-400">
                  Day {detailModalSpot.dayNumber} · {formatDateSlash(detailModalSpot.dayDate)} ({getDayOfWeek(detailModalSpot.dayDate, lang)})
                </span>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  {CATEGORY_LABELS[detailModalSpot.item.category]?.zh || '景點'}
                </span>
                {detailModalSpot.item.completed && (
                  <>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span className="font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>已打卡完成</span>
                    </span>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setDetailModalSpot(null)}
                aria-label="關閉"
                className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {detailModalSpot.item.title}
              </h2>
              {detailModalSpot.dayTheme && (
                <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 mt-1">
                  日程主題：{detailModalSpot.dayTheme}
                </p>
              )}
            </div>

            <div className="space-y-2.5 bg-[#FAF9F6] dark:bg-slate-900/60 p-4 rounded-2xl border border-[#E5E2DC] dark:border-slate-800 text-xs">
              <div className="flex items-start gap-2.5 text-slate-700 dark:text-slate-300">
                <Clock className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">預定停留時間：</span>
                  <span className="font-mono tabular-nums">
                    {detailModalSpot.item.startTime || '未設定時間'}
                    {detailModalSpot.item.endTime ? ` ~ ${detailModalSpot.item.endTime}` : ''}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-slate-700 dark:text-slate-300">
                <MapPin className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="font-bold text-slate-900 dark:text-white">地址 / 地點：</span>
                  <div className="mt-0.5 select-all">
                    {detailModalSpot.item.locationName && (
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {detailModalSpot.item.locationName}
                      </div>
                    )}
                    {detailModalSpot.item.address && (
                      <div className="text-slate-500 text-[11px] font-mono mt-0.5">
                        {detailModalSpot.item.address}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-400 font-mono tabular-nums mt-0.5">
                      經緯度：{detailModalSpot.item.lat?.toFixed(5)}, {detailModalSpot.item.lng?.toFixed(5)}
                    </div>
                  </div>
                </div>
              </div>

              {detailModalSpot.item.transportNote && (
                <div className="flex items-start gap-2.5 text-slate-700 dark:text-slate-300">
                  <Train className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white">交通指引 / 車次：</span>
                    <p className="mt-0.5 text-slate-700 dark:text-slate-300 bg-white dark:bg-[#111827] p-2 rounded-xl border border-[#E5E2DC] dark:border-slate-800">
                      {detailModalSpot.item.transportNote}
                    </p>
                  </div>
                </div>
              )}

              {(typeof detailModalSpot.item.cost === 'number' || detailModalSpot.item.bookingCode) && (
                <div className="flex items-start gap-2.5 text-slate-700 dark:text-slate-300">
                  <DollarSign className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white">費用與預約代碼：</span>
                    <div className="mt-0.5 space-y-0.5 font-mono tabular-nums">
                      {typeof detailModalSpot.item.cost === 'number' && (
                        <div>
                          預估費用：{trip.currency} {detailModalSpot.item.cost.toLocaleString()}{' '}
                          <span className="text-[10px] text-slate-400">
                            ({detailModalSpot.item.costPaid ? '已付款' : '現場付'})
                          </span>
                        </div>
                      )}
                      {detailModalSpot.item.bookingCode && (
                        <div>預約代號：{detailModalSpot.item.bookingCode}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {detailModalSpot.item.notes && (
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                  <span>景點攻略與遊玩重點</span>
                </h4>
                <div className="p-3.5 rounded-2xl bg-[#FAF9F6] dark:bg-slate-900/60 border border-[#E5E2DC] dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                  {detailModalSpot.item.notes}
                </div>
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-[#E5E2DC] dark:border-slate-800">
              <a
                href={getGoogleMapsNavigationUrl(detailModalSpot.item)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[44px] flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-xs shadow-2xs transition"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Google 地圖導航</span>
                <ExternalLink className="w-3 h-3 opacity-80" />
              </a>

              {onSelectDay && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectDay(detailModalSpot.dayNumber);
                    setDetailModalSpot(null);
                  }}
                  className="w-full min-h-[44px] py-2.5 px-3 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold text-xs shadow-2xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Calendar className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                  <span>前往第 {detailModalSpot.dayNumber} 天完整日程</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
