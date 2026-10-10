import React, { useState, useEffect } from 'react';
import { Trip, ItineraryItem } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { getGoogleMapsNavigationUrl } from '../../utils/geo';
import {
  X,
  MapPin,
  Phone,
  Navigation,
  Copy,
  Check,
  Building2,
  ChevronDown,
} from 'lucide-react';

interface TaxiShowCardModalProps {
  trip: Trip;
  lang: Language;
  initialItem?: ItineraryItem | null;
  onClose: () => void;
}

export const TaxiShowCardModal: React.FC<TaxiShowCardModalProps> = ({
  trip,
  initialItem,
  onClose,
}) => {
  // Collect all places with locations or hotel spots
  const candidateItems: { dayNumber: number; item: ItineraryItem }[] = [];
  trip.days.forEach((day) => {
    day.items.forEach((item) => {
      if (item.locationName || item.address || item.category === 'hotel') {
        candidateItems.push({ dayNumber: day.dayNumber, item });
      }
    });
  });

  const [selectedItem, setSelectedItem] = useState<ItineraryItem>(
    initialItem || candidateItems[0]?.item || {
      id: 'default',
      title: trip.destination,
      category: 'spot',
      startTime: '',
      locationName: trip.destination,
      address: trip.destination,
    }
  );

  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const textToCopy = `${selectedItem.locationName || selectedItem.title}\n${selectedItem.address || ''}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const navUrl = getGoogleMapsNavigationUrl(selectedItem);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border-2 border-slate-300 dark:border-slate-700 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="px-5 py-3.5 bg-amber-500 text-slate-950 flex items-center justify-between shrink-0 font-bold">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚕</span>
            <div>
              <h3 className="text-base font-black tracking-tight leading-none">
                計程車問路卡 / ドライバー提示用
              </h3>
              <p className="text-[11px] font-medium text-amber-950/80 mt-0.5">
                向司機或路人出示此大字卡，免溝通即可抵達
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/15 hover:bg-black/25 flex items-center justify-center text-slate-950 transition active:scale-95"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Location Selector Dropdown */}
        {candidateItems.length > 1 && (
          <div className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 shrink-0 flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">
              選擇目的地：
            </span>
            <div className="relative flex-1">
              <select
                value={selectedItem.id}
                onChange={(e) => {
                  const found = candidateItems.find((c) => c.item.id === e.target.value);
                  if (found) setSelectedItem(found.item);
                }}
                className="w-full appearance-none bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 pr-8 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none"
              >
                {candidateItems.map(({ dayNumber, item }) => (
                  <option key={item.id} value={item.id}>
                    Day {dayNumber} · {item.title} ({item.locationName || item.category})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Big Contrast Body Card for Driver */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* Japanese Polite Prompt */}
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-center">
            <p className="text-xl sm:text-2xl font-black text-amber-950 dark:text-amber-200 leading-snug tracking-wide">
              『運転手さん、ここまでお願いします。』
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-400 mt-1">
              （司機先生，請載我到這裡，謝謝！）
            </p>
          </div>

          {/* Destination Name in High Contrast */}
          <div className="p-5 rounded-2xl bg-slate-900 text-white dark:bg-black border border-slate-800 shadow-md text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-400 text-slate-950 text-xs font-bold uppercase tracking-wider">
              <MapPin className="w-3.5 h-3.5" />
              <span>目的地 (Destination)</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-amber-300 break-words py-1">
              {selectedItem.locationName || selectedItem.title}
            </h2>
            {selectedItem.locationName && selectedItem.title !== selectedItem.locationName && (
              <p className="text-sm font-semibold text-slate-300">
                {selectedItem.title}
              </p>
            )}
          </div>

          {/* Address Box */}
          {selectedItem.address && (
            <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                住所 (Address)
              </span>
              <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-relaxed select-all">
                {selectedItem.address}
              </p>
            </div>
          )}

          {/* Notes or Hotel info */}
          {selectedItem.notes && (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300">
              <span className="font-bold block mb-0.5 text-slate-500 dark:text-slate-400">備註指引：</span>
              <p className="whitespace-pre-wrap">{selectedItem.notes}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2.5 shrink-0">
          <button
            onClick={handleCopy}
            className="flex-1 py-3 px-4 rounded-2xl bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span>已複製地址</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-500" />
                <span>複製日文地址</span>
              </>
            )}
          </button>

          <a
            href={navUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition active:scale-95"
          >
            <Navigation className="w-4 h-4" />
            <span>Google Maps 導航</span>
          </a>
        </div>
      </div>
    </div>
  );
};
