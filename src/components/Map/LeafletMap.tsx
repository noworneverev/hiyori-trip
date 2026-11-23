import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { ItineraryItem } from '../../types/itinerary';
import { getGoogleMapsNavigationUrl, isValidCoordinate } from '../../utils/geo';
import { sanitizeExternalUrl } from '../../utils/url';
import { MapPin, Lock, Unlock, Maximize2 } from 'lucide-react';

function escapeHtml(str?: string | number | null): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface LeafletMapProps {
  items: ItineraryItem[];
  selectedItemId?: string | null;
  onSelectItem?: (item: ItineraryItem) => void;
  isPickMode?: boolean;
  onPickLocation?: (lat: number, lng: number) => void;
  pickedLocation?: { lat: number; lng: number } | null;
  heightClass?: string;
}

export const CATEGORY_COLORS: Record<string, string> = {
  spot: '#0d9488',      // teal
  food: '#ea580c',      // orange
  transport: '#0284c7', // sky
  hotel: '#7c3aed',     // violet
  shopping: '#db2777',  // pink
  activity: '#e11d48',  // rose
  other: '#475569',     // slate
};

function isCoarseTouchDevice(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Compute gentle radial offsets (~15m) for pins that share identical coordinates,
 * ensuring every stacked attraction remains visible and individually tappable.
 */
function buildSpiderfiedCoords(
  entries: Array<{ item: ItineraryItem; displayNumber: number }>
): Array<{ item: ItineraryItem; displayNumber: number; lat: number; lng: number }> {
  const buckets = new Map<string, number[]>();
  entries.forEach((entry, idx) => {
    const key = `${entry.item.lat!.toFixed(5)},${entry.item.lng!.toFixed(5)}`;
    const list = buckets.get(key);
    if (list) list.push(idx);
    else buckets.set(key, [idx]);
  });

  const result = entries.map((entry) => ({
    ...entry,
    lat: entry.item.lat!,
    lng: entry.item.lng!,
  }));

  buckets.forEach((indices) => {
    if (indices.length <= 1) return;
    const radius = 0.00014; // ~15 meters
    indices.forEach((entryIdx, pos) => {
      const angle = (2 * Math.PI * pos) / indices.length - Math.PI / 2;
      result[entryIdx].lat += Math.cos(angle) * radius;
      result[entryIdx].lng += Math.sin(angle) * radius * 1.25;
    });
  });

  return result;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  items,
  selectedItemId,
  onSelectItem,
  isPickMode = false,
  onPickLocation,
  pickedLocation,
  heightClass = 'h-[360px] md:h-[460px]',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markersByIdRef = useRef<Map<string, { marker: L.Marker; lat: number; lng: number; displayNumber: number; item: ItineraryItem }>>(new Map());
  const routeLineRef = useRef<L.Polyline | null>(null);
  const pickMarkerRef = useRef<L.Marker | null>(null);

  // Keep latest callbacks in refs so parent re-renders NEVER destroy markers or reset user pan/zoom
  const onSelectItemRef = useRef(onSelectItem);
  onSelectItemRef.current = onSelectItem;
  const onPickLocationRef = useRef(onPickLocation);
  onPickLocationRef.current = onPickLocation;

  // Prevent mobile scroll-trap: start locked on coarse touch devices until tapped or in pick mode
  const [isTouchDevice] = useState<boolean>(() => isCoarseTouchDevice());
  const [isTouchMapUnlocked, setIsTouchMapUnlocked] = useState<boolean>(false);
  const effectiveDragEnabled = !isTouchDevice || isTouchMapUnlocked || isPickMode;

  const validIndexedItems = useMemo(() => {
    const out: Array<{ item: ItineraryItem; displayNumber: number }> = [];
    items.forEach((item, idx) => {
      if (isValidCoordinate(item.lat, item.lng)) {
        out.push({ item, displayNumber: idx + 1 });
      }
    });
    return out;
  }, [items]);

  const buildMarkerIcon = (item: ItineraryItem, displayNumber: number, isSelected: boolean) => {
    const color = CATEGORY_COLORS[item.category] || '#0d9488';
    const safeTitle = escapeHtml(item.title);
    return L.divIcon({
      className: 'custom-itinerary-marker',
      html: `
        <div class="relative flex flex-col items-center group cursor-pointer" style="width:128px;margin-left:-44px;">
          <div class="px-2 py-0.5 mb-0.5 rounded-md text-[11px] font-bold bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-slate-100 shadow-md border border-slate-200 dark:border-slate-700 truncate max-w-[124px] pointer-events-none">
            ${displayNumber}. ${safeTitle}
          </div>
          <div style="background-color: ${color};" class="w-8 h-8 rounded-full text-white flex items-center justify-center font-black text-xs shadow-lg border-2 border-white dark:border-slate-900 transition-transform transform ${
            isSelected ? 'scale-125 ring-4 ring-teal-400 marker-pulse' : 'hover:scale-110'
          }">
            ${displayNumber}
          </div>
          <div style="border-top-color: ${color};" class="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px]"></div>
        </div>
      `,
      iconSize: [40, 58],
      iconAnchor: [20, 56],
      popupAnchor: [0, -54],
    });
  };

  // Initialize Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [35.6895, 139.6917],
      zoom: 13,
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

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;
    mapInstanceRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
      markersByIdRef.current.clear();
    };
  }, []);

  // Sync touch dragging lock state
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

  // Handle map click for Pick Mode
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (isPickMode && onPickLocationRef.current) {
        onPickLocationRef.current(e.latlng.lat, e.latlng.lng);
      }
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [isPickMode]);

  // Update Picked Location Pin
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (pickMarkerRef.current) {
      pickMarkerRef.current.remove();
      pickMarkerRef.current = null;
    }

    if (pickedLocation && isValidCoordinate(pickedLocation.lat, pickedLocation.lng)) {
      const pickIcon = L.divIcon({
        className: 'custom-itinerary-marker',
        html: `
          <div class="relative flex items-center justify-center">
            <div class="w-9 h-9 rounded-full bg-rose-600 text-white flex items-center justify-center font-bold shadow-xl border-2 border-white marker-pulse">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      });

      const marker = L.marker([pickedLocation.lat, pickedLocation.lng], { icon: pickIcon }).addTo(map);
      marker
        .bindPopup(
          `<div class="p-2 text-xs text-slate-800 dark:text-slate-100"><b>已選擇座標</b><br><span class="font-mono">${pickedLocation.lat.toFixed(5)}, ${pickedLocation.lng.toFixed(5)}</span></div>`
        )
        .openPopup();
      pickMarkerRef.current = marker;
      map.setView([pickedLocation.lat, pickedLocation.lng], Math.max(map.getZoom(), 15));
    }
  }, [pickedLocation]);

  // Render Itinerary Pins & Connecting Route Line ONLY when items change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();
    markersByIdRef.current.clear();
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }

    if (validIndexedItems.length === 0) return;

    const spiderfied = buildSpiderfiedCoords(validIndexedItems);
    const rawRouteLatLngs: L.LatLngExpression[] = validIndexedItems.map((e) => [e.item.lat!, e.item.lng!]);

    spiderfied.forEach(({ item, displayNumber, lat, lng }) => {
      const color = CATEGORY_COLORS[item.category] || '#0d9488';
      const safeTitle = escapeHtml(item.title);
      const safeLocation = escapeHtml(item.locationName);
      const safeTransport = escapeHtml(item.transportNote);
      const safeNotes = escapeHtml(item.notes);
      const safeStart = escapeHtml(item.startTime);
      const safeEnd = escapeHtml(item.endTime);

      const marker = L.marker([lat, lng], {
        icon: buildMarkerIcon(item, displayNumber, item.id === selectedItemId),
        zIndexOffset: item.id === selectedItemId ? 500 : 0,
      });

      const googleMapsUrl = escapeHtml(sanitizeExternalUrl(getGoogleMapsNavigationUrl(item)) || '#');

      const popupContent = document.createElement('div');
      popupContent.className = 'p-3 text-slate-800 dark:text-slate-100 text-xs w-[260px]';
      popupContent.innerHTML = `
        <div class="flex items-center gap-1.5 font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-1.5 mb-2">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] shrink-0 font-mono" style="background-color: ${color};">
            ${displayNumber}
          </span>
          <span class="truncate">${safeTitle}</span>
        </div>
        <div class="text-[11px] text-slate-600 dark:text-slate-300 space-y-1 mb-2.5">
          ${safeStart ? `<div>預定時間：<b class="text-slate-800 dark:text-slate-100 font-mono">${safeStart}${safeEnd ? ` ~ ${safeEnd}` : ''}</b></div>` : ''}
          ${safeLocation ? `<div class="truncate text-slate-700 dark:text-slate-200">${safeLocation}</div>` : ''}
          ${safeTransport ? `<div class="text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 p-1.5 rounded"><span class="font-bold">[交通]</span> ${safeTransport}</div>` : ''}
          ${safeNotes ? `<div class="text-slate-500 dark:text-slate-400 line-clamp-2">${safeNotes}</div>` : ''}
        </div>
        <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
          <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #0d9488 !important; color: #ffffff !important; text-decoration: none !important; white-space: nowrap !important;" class="w-full flex items-center justify-center gap-1 py-2 px-3 rounded-lg font-bold text-[11px] shadow-2xs hover:opacity-90 transition">
            <span style="color: #ffffff !important; font-weight: 700; white-space: nowrap !important;">Google 地圖導航</span>
          </a>
        </div>
      `;

      marker.bindPopup(popupContent, {
        maxWidth: 276,
        autoPanPaddingTopLeft: L.point(16, 64),
        autoPanPaddingBottomRight: L.point(16, 24),
      });

      marker.on('click', () => {
        if (onSelectItemRef.current) onSelectItemRef.current(item);
      });

      markersGroup.addLayer(marker);
      markersByIdRef.current.set(item.id, { marker, lat, lng, displayNumber, item });
    });

    if (rawRouteLatLngs.length > 1) {
      const polyline = L.polyline(rawRouteLatLngs, {
        color: '#0f766e',
        weight: 3.5,
        opacity: 0.82,
        dashArray: '8, 8',
      }).addTo(map);
      routeLineRef.current = polyline;
    }

    // Fit map cleanly to this day's route
    const bounds = L.latLngBounds(rawRouteLatLngs);
    map.fitBounds(bounds, { padding: [44, 44], maxZoom: 16 });
  }, [validIndexedItems]);

  // Smoothly update selected highlight & pan WITHOUT rebuilding markers or wiping zoom
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    markersByIdRef.current.forEach((entry, id) => {
      const isSelected = id === selectedItemId;
      entry.marker.setIcon(buildMarkerIcon(entry.item, entry.displayNumber, isSelected));
      entry.marker.setZIndexOffset(isSelected ? 500 : 0);
      if (isSelected) {
        entry.marker.openPopup();
        map.panTo([entry.lat, entry.lng], { animate: true });
      }
    });
  }, [selectedItemId]);

  const handleFitBounds = () => {
    const map = mapInstanceRef.current;
    if (!map || validIndexedItems.length === 0) return;
    const bounds = L.latLngBounds(validIndexedItems.map((e) => [e.item.lat!, e.item.lng!] as [number, number]));
    map.fitBounds(bounds, { padding: [44, 44], maxZoom: 16 });
  };

  return (
    <div
      className={`relative w-full ${heightClass} rounded-2xl overflow-hidden shadow-inner border border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-950 ${
        !effectiveDragEnabled ? 'touch-pan-y' : ''
      }`}
    >
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Pick Mode Overlay Tip */}
      {isPickMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[450] bg-slate-900/95 dark:bg-[#111827]/95 text-white px-4 py-2 rounded-2xl text-xs font-semibold shadow-lg border border-teal-500/40 flex items-center gap-2 backdrop-blur-md pointer-events-none whitespace-nowrap">
          <MapPin className="w-4 h-4 text-teal-400 shrink-0" />
          <span>點擊地圖任意位置以選取座標</span>
        </div>
      )}

      {/* Mobile Scroll-Trap Protection Toggle Pill */}
      {isTouchDevice && !isPickMode && validIndexedItems.length > 0 && (
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

      {/* Fit Bounds Button */}
      {validIndexedItems.length > 0 && !isPickMode && (
        <button
          type="button"
          onClick={handleFitBounds}
          aria-label="全景縮放"
          className="absolute bottom-3 left-3 z-[450] min-h-[36px] px-2.5 py-1.5 rounded-xl bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 text-[11px] font-bold shadow-md border border-[#E5E2DC] dark:border-slate-700 flex items-center gap-1.5 hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
          <span>全景</span>
        </button>
      )}

      {/* Empty coordinates notice (guards validIndexedItems, not just items.length) */}
      {validIndexedItems.length === 0 && !isPickMode && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#FAF9F6]/90 dark:bg-[#090D16]/85 backdrop-blur-[2px] z-[440] p-4 text-center">
          <div className="max-w-xs">
            <div className="w-10 h-10 rounded-2xl bg-slate-200/80 dark:bg-slate-800 flex items-center justify-center mx-auto mb-2 text-slate-500 dark:text-slate-400">
              <MapPin className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">當天尚無座標景點</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              編輯景點時搜尋地址或點選地圖座標，即可自動繪製當日路線！
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
