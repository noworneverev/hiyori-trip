import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { ItineraryItem } from '../../types/itinerary';
import { getGoogleMapsNavigationUrl, getAppleMapsUrl } from '../../utils/geo';
import { Navigation, ExternalLink, MapPin } from 'lucide-react';

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
  const routeLineRef = useRef<L.Polyline | null>(null);
  const pickMarkerRef = useRef<L.Marker | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center (Tokyo / East Asia)
    const map = L.map(mapContainerRef.current, {
      center: [35.6895, 139.6917],
      zoom: 13,
      zoomControl: true,
      attributionControl: false,
    });

    // Add OpenStreetMap Tile Layer (Free, zero cost, cached via SW)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c'],
    }).addTo(map);

    // Custom compact attribution in bottom-right
    L.control
      .attribution({
        prefix: false,
        position: 'bottomright',
      })
      .addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> 貢獻者')
      .addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle map click for Pick Mode
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (isPickMode && onPickLocation) {
        onPickLocation(e.latlng.lat, e.latlng.lng);
      }
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [isPickMode, onPickLocation]);

  // Update Picked Location Pin
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (pickMarkerRef.current) {
      pickMarkerRef.current.remove();
      pickMarkerRef.current = null;
    }

    if (pickedLocation) {
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
      marker.bindPopup(`<b>已選擇座標</b><br>${pickedLocation.lat.toFixed(5)}, ${pickedLocation.lng.toFixed(5)}`).openPopup();
      pickMarkerRef.current = marker;
      map.setView([pickedLocation.lat, pickedLocation.lng], Math.max(map.getZoom(), 15));
    }
  }, [pickedLocation]);

  // Render Itinerary Pins & Connecting Route Line
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }

    const validItems = items.filter(
      (item) => typeof item.lat === 'number' && typeof item.lng === 'number' && !isNaN(item.lat) && !isNaN(item.lng)
    );

    if (validItems.length === 0) {
      return;
    }

    const latLngs: L.LatLngExpression[] = [];

    validItems.forEach((item, index) => {
      const lat = item.lat!;
      const lng = item.lng!;
      latLngs.push([lat, lng]);

      const isSelected = item.id === selectedItemId;
      const color = CATEGORY_COLORS[item.category] || '#0d9488';

      // Create Custom HTML Pin
      const customIcon = L.divIcon({
        className: 'custom-itinerary-marker',
        html: `
          <div class="relative flex flex-col items-center group cursor-pointer">
            <div class="px-2 py-0.5 mb-0.5 rounded-md text-[11px] font-bold bg-white/95 text-slate-800 shadow-md border border-slate-200 truncate max-w-[120px] pointer-events-none">
              ${index + 1}. ${item.title}
            </div>
            <div style="background-color: ${color};" class="w-8 h-8 rounded-full text-white flex items-center justify-center font-black text-xs shadow-lg border-2 border-white transition-transform transform ${
              isSelected ? 'scale-125 ring-4 ring-teal-400 marker-pulse' : 'hover:scale-110'
            }">
              ${index + 1}
            </div>
            <div style="border-top-color: ${color};" class="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px]"></div>
          </div>
        `,
        iconSize: [40, 50],
        iconAnchor: [20, 48],
        popupAnchor: [0, -45],
      });

      const marker = L.marker([lat, lng], { icon: customIcon });

      const googleMapsUrl = getGoogleMapsNavigationUrl(item);
      const appleMapsUrl = getAppleMapsUrl(item);

      const popupContent = document.createElement('div');
      popupContent.className = 'p-3 text-slate-800 text-xs w-[265px]';
      popupContent.innerHTML = `
        <div class="flex items-center gap-1.5 font-bold text-sm text-slate-900 border-b border-slate-100 pb-1.5 mb-2">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] shrink-0" style="background-color: ${color};">
            ${index + 1}
          </span>
          <span class="truncate">${item.title}</span>
        </div>
        <div class="text-[11px] text-slate-600 space-y-1 mb-2.5">
          ${item.startTime ? `<div>預定時間：<b class="text-slate-800">${item.startTime}${item.endTime ? ` ~ ${item.endTime}` : ''}</b></div>` : ''}
          ${item.locationName ? `<div class="truncate text-slate-700">${item.locationName}</div>` : ''}
          ${item.transportNote ? `<div class="text-teal-700 bg-teal-50 p-1.5 rounded"><span class="font-bold">[交通]</span> ${item.transportNote}</div>` : ''}
          ${item.notes ? `<div class="text-slate-500 line-clamp-2">${item.notes}</div>` : ''}
        </div>
        <div class="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-100">
          <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #2563eb !important; color: #ffffff !important; text-decoration: none !important; white-space: nowrap !important;" class="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg font-bold text-[11px] shadow-2xs hover:opacity-90 transition">
            <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
            <span style="color: #ffffff !important; font-weight: 700; white-space: nowrap !important;">Google 導航</span>
          </a>
          <a href="${appleMapsUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #0f172a !important; color: #ffffff !important; text-decoration: none !important; white-space: nowrap !important;" class="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg font-bold text-[11px] shadow-2xs hover:opacity-90 transition">
            <span style="color: #ffffff !important; font-weight: 700; white-space: nowrap !important;">Apple 地圖</span>
          </a>
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.on('click', () => {
        if (onSelectItem) onSelectItem(item);
      });

      markersGroup.addLayer(marker);

      if (isSelected) {
        marker.openPopup();
        map.panTo([lat, lng], { animate: true });
      }
    });

    // Draw route connecting lines
    if (latLngs.length > 1) {
      const polyline = L.polyline(latLngs, {
        color: '#0f766e',
        weight: 4,
        opacity: 0.85,
        dashArray: '8, 8',
      }).addTo(map);
      routeLineRef.current = polyline;
    }

    // Auto fit map view to markers if no specific item selected
    if (latLngs.length > 0 && !selectedItemId) {
      const bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [items, selectedItemId, onSelectItem]);

  return (
    <div className={`relative w-full ${heightClass} rounded-2xl overflow-hidden shadow-inner border border-slate-200 bg-slate-100`}>
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Pick Mode Overlay Tip */}
      {isPickMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-rose-600/95 text-white px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-lg flex items-center gap-1.5 animate-pulse backdrop-blur-sm pointer-events-none">
          <MapPin className="w-4 h-4" />
          點擊地圖任意位置以選取景點座標
        </div>
      )}

      {/* Empty items notice */}
      {items.length === 0 && !isPickMode && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 backdrop-blur-[2px] z-10 p-4 text-center">
          <div className="max-w-xs">
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center mx-auto mb-2 text-slate-500">
              <MapPin className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-700">當天尚無座標景點</p>
            <p className="text-[11px] text-slate-500 mt-0.5">新增景點時設定地址或在地圖上點選，即可自動繪製路線與順序！</p>
          </div>
        </div>
      )}
    </div>
  );
};
