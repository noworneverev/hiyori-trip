import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { Trip, ItineraryItem } from '../../types/itinerary';
import { getGoogleMapsNavigationUrl, getAppleMapsUrl } from '../../utils/geo';
import { formatDateSlash, getDayOfWeek } from '../../utils/date';
import { Language } from '../../utils/i18n';
import {
  MapPin,
  Calendar,
  Clock,
  Compass,
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
  Ticket,
} from 'lucide-react';

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
  spot: '#0d9488',      // Teal
  food: '#ea580c',      // Orange
  transport: '#0284c7', // Sky
  hotel: '#7c3aed',     // Violet
  shopping: '#db2777',  // Pink
  activity: '#e11d48',  // Rose
  other: '#475569',     // Slate
};

const CATEGORY_LABELS: Record<string, { zh: string; en: string; icon: any }> = {
  spot: { zh: '景點', en: 'Spot', icon: MapPin },
  food: { zh: '美食', en: 'Food', icon: Utensils },
  transport: { zh: '交通', en: 'Transit', icon: Train },
  hotel: { zh: '住宿', en: 'Stay', icon: Hotel },
  shopping: { zh: '購物', en: 'Shop', icon: ShoppingBag },
  activity: { zh: '活動', en: 'Activity', icon: Sparkles },
  other: { zh: '其他', en: 'Other', icon: Compass },
};

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
  const markersMapRef = useRef<Map<string, L.Marker>>(new Map());

  // Filter States
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | 'all'>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [colorMode, setColorMode] = useState<'day' | 'category'>('day');

  // Selected Spot for Detail Modal
  const [selectedSpot, setSelectedSpot] = useState<OverviewSpot | null>(null);

  // Collect all marked spots across all days
  const allSpots: OverviewSpot[] = useMemo(() => {
    const list: OverviewSpot[] = [];
    let count = 0;
    trip.days.forEach((day) => {
      day.items.forEach((item) => {
        if (
          typeof item.lat === 'number' &&
          typeof item.lng === 'number' &&
          !isNaN(item.lat) &&
          !isNaN(item.lng)
        ) {
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

  // Set initial selected spot if provided
  useEffect(() => {
    if (initialSelectedSpotId) {
      const match = allSpots.find((s) => s.id === initialSelectedSpotId);
      if (match) setSelectedSpot(match);
    }
  }, [initialSelectedSpotId, allSpots]);

  // Filtered spots
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

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Calculate initial map center based on first spot or East Asia default
    const firstSpot = allSpots[0];
    const initialCenter: [number, number] = firstSpot
      ? [firstSpot.item.lat!, firstSpot.item.lng!]
      : [36.5613, 136.6562]; // Kanazawa default

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 11,
      zoomControl: true,
      attributionControl: false,
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
      .addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>')
      .addTo(map);

    const routesGroup = L.layerGroup().addTo(map);
    const markersGroup = L.layerGroup().addTo(map);

    routeLinesLayerRef.current = routesGroup;
    markersLayerRef.current = markersGroup;
    mapInstanceRef.current = map;

    // Delay slight resize trigger for container stability
    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Escape key to close spot detail modal if open
  useEffect(() => {
    if (!selectedSpot) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedSpot(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSpot]);

  // Render Markers and Day Route Lines
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    const routesGroup = routeLinesLayerRef.current;
    if (!map || !markersGroup || !routesGroup) return;

    markersGroup.clearLayers();
    routesGroup.clearLayers();
    markersMapRef.current.clear();

    if (filteredSpots.length === 0) return;

    const latLngs: L.LatLngExpression[] = [];

    // Group filtered spots by day to draw routes per day
    const dayGroups: Record<number, OverviewSpot[]> = {};
    filteredSpots.forEach((spot) => {
      if (!dayGroups[spot.dayNumber]) dayGroups[spot.dayNumber] = [];
      dayGroups[spot.dayNumber].push(spot);
    });

    // Draw route lines
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

    // Add Markers
    filteredSpots.forEach((spot) => {
      const lat = spot.item.lat!;
      const lng = spot.item.lng!;
      latLngs.push([lat, lng]);

      const isSelected = selectedSpot?.id === spot.id;
      const markerColor =
        colorMode === 'day'
          ? DAY_PALETTE[(spot.dayNumber - 1) % DAY_PALETTE.length]
          : CATEGORY_COLORS[spot.item.category] || '#0d9488';

      const customIcon = L.divIcon({
        className: 'custom-trip-overview-marker',
        html: `
          <div class="relative flex flex-col items-center group cursor-pointer">
            <div class="px-2 py-0.5 mb-1 rounded-md text-[10.5px] font-bold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-md border border-slate-200 dark:border-slate-700 truncate max-w-[130px] pointer-events-none transition-transform group-hover:scale-105">
              <span class="text-[9px] font-extrabold mr-1 px-1 rounded text-white" style="background-color: ${DAY_PALETTE[(spot.dayNumber - 1) % DAY_PALETTE.length]}">D${spot.dayNumber}</span>
              ${spot.item.title}
            </div>
            <div style="background-color: ${markerColor};" class="w-8 h-8 rounded-full text-white flex items-center justify-center font-black text-xs shadow-lg border-2 border-white dark:border-slate-900 transition-all ${
              isSelected ? 'scale-125 ring-4 ring-teal-400 marker-pulse' : 'hover:scale-110'
            }">
              <span>D${spot.dayNumber}</span>
            </div>
            <div style="border-top-color: ${markerColor};" class="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px]"></div>
          </div>
        `,
        iconSize: [42, 54],
        iconAnchor: [21, 50],
        popupAnchor: [0, -48],
      });

      const marker = L.marker([lat, lng], { icon: customIcon });

      const googleMapsUrl = getGoogleMapsNavigationUrl(spot.item);
      const appleMapsUrl = getAppleMapsUrl(spot.item);
      const categoryMeta = CATEGORY_LABELS[spot.item.category] || CATEGORY_LABELS.other;

      const popupDiv = document.createElement('div');
      popupDiv.className = 'p-3 text-slate-800 dark:text-slate-100 text-xs w-[280px]';
      popupDiv.innerHTML = `
        <div class="flex items-center justify-between gap-1.5 border-b border-slate-100 dark:border-slate-700 pb-2 mb-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold text-white shrink-0" style="background-color: ${DAY_PALETTE[(spot.dayNumber - 1) % DAY_PALETTE.length]};">
              Day ${spot.dayNumber}
            </span>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
              ${lang === 'zh' ? categoryMeta.zh : categoryMeta.en}
            </span>
          </div>
          ${spot.item.startTime ? `<span class="text-[10px] font-mono font-semibold text-slate-500">${spot.item.startTime}${spot.item.endTime ? `~${spot.item.endTime}` : ''}</span>` : ''}
        </div>

        <h4 class="font-bold text-sm text-slate-900 dark:text-white leading-tight mb-1 truncate">${spot.item.title}</h4>
        ${spot.item.locationName ? `<p class="text-[11px] text-slate-500 dark:text-slate-400 truncate mb-1.5">📍 ${spot.item.locationName}</p>` : ''}
        ${spot.item.notes ? `<p class="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2 mb-2 leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded">${spot.item.notes}</p>` : ''}

        <div class="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700">
          <button id="view-spot-btn-${spot.id}" type="button" class="col-span-2 w-full py-1.5 px-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-center font-bold text-[11px] shadow-2xs transition flex items-center justify-center gap-1">
            <span>查看完整景點詳情</span>
            <span>➔</span>
          </button>
          <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #2563eb !important; color: #ffffff !important; text-decoration: none !important; white-space: nowrap !important;" class="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg font-bold text-[10.5px] shadow-2xs hover:opacity-90 transition">
            <span>Google 導航</span>
          </a>
          <a href="${appleMapsUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #0f172a !important; color: #ffffff !important; text-decoration: none !important; white-space: nowrap !important;" class="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg font-bold text-[10.5px] shadow-2xs hover:opacity-90 transition">
            <span>Apple 地圖</span>
          </a>
        </div>
      `;

      marker.bindPopup(popupDiv);

      // On Marker Click: Select Spot & Open Details
      marker.on('click', () => {
        setSelectedSpot(spot);
      });

      // Hook click on "查看完整景點詳情" inside popup
      marker.on('popupopen', () => {
        const btn = document.getElementById(`view-spot-btn-${spot.id}`);
        if (btn) {
          btn.onclick = (e) => {
            e.stopPropagation();
            setSelectedSpot(spot);
          };
        }
      });

      markersGroup.addLayer(marker);
      markersMapRef.current.set(spot.id, marker);
    });

    // Auto-fit bounds if we have spots and no single selected spot
    if (latLngs.length > 0 && !selectedSpot) {
      const bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [filteredSpots, colorMode, selectedSpot?.id, lang]);

  // Focus map when a spot is clicked
  const handleSpotCardClick = (spot: OverviewSpot) => {
    setSelectedSpot(spot);
    const map = mapInstanceRef.current;
    if (map && spot.item.lat && spot.item.lng) {
      map.setView([spot.item.lat, spot.item.lng], Math.max(map.getZoom(), 14), {
        animate: true,
      });
      const marker = markersMapRef.current.get(spot.id);
      if (marker) {
        marker.openPopup();
      }
    }
  };

  return (
    <div className="space-y-3">
      {/* 1. Overview Control Bar: Search & Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-3 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Title & Stats */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                  {lang === 'zh' ? '當前旅程景點概覽地圖' : 'Trip Attractions Overview Map'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                  {filteredSpots.length} / {allSpots.length} {lang === 'zh' ? '處標記景點' : 'Spots'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {lang === 'zh'
                  ? '點選地圖任意標記或下方列表，即可直接檢視景點完整詳情與路線導航'
                  : 'Click any marker or list item to view full attraction details and navigation'}
              </p>
            </div>
          </div>

          {/* Color Mode Switcher */}
          <div className="flex items-center gap-1.5 self-start sm:self-center shrink-0">
            <span className="text-[11px] text-slate-400 font-medium">標記色彩：</span>
            <div className="inline-flex rounded-xl p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setColorMode('day')}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                  colorMode === 'day'
                    ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                依日程
              </button>
              <button
                type="button"
                onClick={() => setColorMode('category')}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                  colorMode === 'category'
                    ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                依類別
              </button>
            </div>
          </div>
        </div>

        {/* Filter Pills & Search */}
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          {/* Day Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <span className="text-[11px] text-slate-400 font-bold shrink-0 mr-1">日程:</span>
            <button
              type="button"
              onClick={() => setSelectedDayFilter('all')}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition shrink-0 ${
                selectedDayFilter === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              全部日程 ({allSpots.length})
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
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1 ${
                    isCurrent
                      ? 'text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                  style={isCurrent ? { backgroundColor: dayColor } : {}}
                >
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ backgroundColor: dayColor }}
                  />
                  <span>Day {day.dayNumber}</span>
                  <span className="text-[10px] opacity-75 font-mono font-normal">({countInDay})</span>
                </button>
              );
            })}
          </div>

          {/* Category Filter & Keyword Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              <span className="text-[11px] text-slate-400 font-bold shrink-0 mr-1">類別:</span>
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter('all')}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition shrink-0 ${
                  selectedCategoryFilter === 'all'
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
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
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition shrink-0 flex items-center gap-1 ${
                      isSelected
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    <span>{lang === 'zh' ? catMeta.zh : catMeta.en}</span>
                    <span className="text-[10px] opacity-70 font-mono font-normal">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Keyword Search Input */}
            <div className="relative shrink-0 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜尋景點名稱、城市、地址..."
                className="w-full pl-8 pr-7 py-1 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Interactive Map Container */}
      <div className={`relative w-full ${heightClass} rounded-2xl overflow-hidden shadow-inner border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950`}>
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Empty notice */}
        {filteredSpots.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-[2px] z-20 p-4 text-center">
            <div className="max-w-xs">
              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center mx-auto mb-2 text-slate-500">
                <MapPin className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                無符合條件的景點
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                請嘗試清除搜尋條件或切換不同日程
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedDayFilter('all');
                  setSelectedCategoryFilter('all');
                  setSearchQuery('');
                }}
                className="mt-2.5 px-3 py-1 bg-teal-600 text-white rounded-lg text-xs font-bold"
              >
                重設篩選
              </button>
            </div>
          </div>
        )}

        {/* Floating Reset Zoom Button */}
        <button
          type="button"
          onClick={() => {
            const map = mapInstanceRef.current;
            if (map && filteredSpots.length > 0) {
              const bounds = L.latLngBounds(
                filteredSpots.map((s) => [s.item.lat!, s.item.lng!] as [number, number])
              );
              map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
            }
          }}
          className="absolute bottom-4 left-4 z-20 bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold shadow-md border border-slate-200 dark:border-slate-800 hover:bg-white flex items-center gap-1.5 transition"
        >
          <Compass className="w-3.5 h-3.5 text-teal-600" />
          <span>全景縮放</span>
        </button>
      </div>

      {/* 3. Horizontal Carousel of Spots for Quick Navigation */}
      {filteredSpots.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-3 shadow-2xs">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-teal-600" />
              <span>景點快捷導覽 ({filteredSpots.length})</span>
            </span>
            <span className="text-[10px] text-slate-400">點選直接定位與查看詳情</span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {filteredSpots.map((spot) => {
              const isSelected = selectedSpot?.id === spot.id;
              const dayColor = DAY_PALETTE[(spot.dayNumber - 1) % DAY_PALETTE.length];
              return (
                <div
                  key={spot.id}
                  onClick={() => handleSpotCardClick(spot)}
                  className={`min-w-[190px] max-w-[210px] p-2.5 rounded-xl border transition cursor-pointer shrink-0 select-none ${
                    isSelected
                      ? 'border-teal-500 bg-teal-50/80 dark:bg-teal-950/50 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: dayColor }}
                    >
                      Day {spot.dayNumber}
                    </span>
                    {spot.item.startTime && (
                      <span className="text-[10px] font-mono text-slate-400 truncate">
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

      {/* 4. ATTRACTION DETAIL MODAL / DRAWER (景點詳情彈窗) */}
      {selectedSpot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setSelectedSpot(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-150 relative text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Bar with Badges & Close Button */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="px-2.5 py-1 rounded-xl text-xs font-bold text-white shadow-2xs"
                  style={{
                    backgroundColor:
                      DAY_PALETTE[(selectedSpot.dayNumber - 1) % DAY_PALETTE.length],
                  }}
                >
                  Day {selectedSpot.dayNumber} · {formatDateSlash(selectedSpot.dayDate)} ({getDayOfWeek(selectedSpot.dayDate, lang)})
                </span>

                <span
                  className="px-2 py-0.5 rounded-lg text-xs font-bold border"
                  style={{
                    backgroundColor: `${CATEGORY_COLORS[selectedSpot.item.category]}15`,
                    color: CATEGORY_COLORS[selectedSpot.item.category],
                    borderColor: `${CATEGORY_COLORS[selectedSpot.item.category]}40`,
                  }}
                >
                  {CATEGORY_LABELS[selectedSpot.item.category]?.zh || '景點'}
                </span>

                {selectedSpot.item.completed && (
                  <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    已打卡完成
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedSpot(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Attraction Name & Theme */}
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {selectedSpot.item.title}
              </h2>
              {selectedSpot.dayTheme && (
                <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 mt-1">
                  日程主題：{selectedSpot.dayTheme}
                </p>
              )}
            </div>

            {/* Information Grid */}
            <div className="space-y-2.5 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs">
              {/* Scheduled Time */}
              <div className="flex items-start gap-2.5 text-slate-700 dark:text-slate-300">
                <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">預定停留時間：</span>
                  <span className="font-mono">
                    {selectedSpot.item.startTime || '未設定時間'}
                    {selectedSpot.item.endTime ? ` ~ ${selectedSpot.item.endTime}` : ''}
                  </span>
                </div>
              </div>

              {/* Location & Address */}
              <div className="flex items-start gap-2.5 text-slate-700 dark:text-slate-300">
                <MapPin className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="font-bold text-slate-900 dark:text-white">地址 / 地點：</span>
                  <div className="mt-0.5 select-all">
                    {selectedSpot.item.locationName && (
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {selectedSpot.item.locationName}
                      </div>
                    )}
                    {selectedSpot.item.address && (
                      <div className="text-slate-500 text-[11px] font-mono mt-0.5">
                        {selectedSpot.item.address}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      經緯度：{selectedSpot.item.lat?.toFixed(5)}, {selectedSpot.item.lng?.toFixed(5)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Transport notes */}
              {selectedSpot.item.transportNote && (
                <div className="flex items-start gap-2.5 text-slate-700 dark:text-slate-300">
                  <Train className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white">交通指引 / 車次：</span>
                    <p className="mt-0.5 text-sky-900 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/50 p-2 rounded-xl border border-sky-100 dark:border-sky-900/50">
                      {selectedSpot.item.transportNote}
                    </p>
                  </div>
                </div>
              )}

              {/* Cost / Booking info */}
              {(typeof selectedSpot.item.cost === 'number' || selectedSpot.item.bookingCode) && (
                <div className="flex items-start gap-2.5 text-slate-700 dark:text-slate-300">
                  <DollarSign className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white">費用與預約代碼：</span>
                    <div className="mt-0.5 space-y-0.5 font-mono">
                      {typeof selectedSpot.item.cost === 'number' && (
                        <div>
                          預估費用：{trip.currency} {selectedSpot.item.cost.toLocaleString()}{' '}
                          <span className="text-[10px] text-slate-400">
                            ({selectedSpot.item.costPaid ? '已付款' : '現場付'})
                          </span>
                        </div>
                      )}
                      {selectedSpot.item.bookingCode && (
                        <div>預約代號：{selectedSpot.item.bookingCode}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Detailed Guide / Notes */}
            {selectedSpot.item.notes && (
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                  <span>景點攻略與遊玩重點</span>
                </h4>
                <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/50 text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                  {selectedSpot.item.notes}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={getGoogleMapsNavigationUrl(selectedSpot.item)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    textDecoration: 'none',
                  }}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs shadow-2xs hover:opacity-90 transition text-white"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Google Maps 導航</span>
                  <ExternalLink className="w-3 h-3 opacity-80" />
                </a>

                <a
                  href={getAppleMapsUrl(selectedSpot.item)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    textDecoration: 'none',
                  }}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs shadow-2xs hover:opacity-90 transition text-white"
                >
                  <span>Apple 地圖開啟</span>
                  <ExternalLink className="w-3 h-3 opacity-80" />
                </a>
              </div>

              {onSelectDay && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectDay(selectedSpot.dayNumber);
                    setSelectedSpot(null);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-1.5"
                >
                  <Calendar className="w-4 h-4" />
                  <span>前往第 {selectedSpot.dayNumber} 天完整日程</span>
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
