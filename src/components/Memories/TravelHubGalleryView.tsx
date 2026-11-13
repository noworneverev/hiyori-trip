import React, { useMemo, useState } from 'react';
import { formatDateSlash } from '../../utils/date';
import { MediaImage } from '../UI/MediaImage';
import { GalleryPhotoItem } from './travelHubTypes';
import {
  Camera,
  MapPin,
  Play,
  Sparkles,
  ArrowRight,
  Image as ImageIcon,
} from 'lucide-react';

interface TravelHubGalleryViewProps {
  photos: GalleryPhotoItem[];
  onOpenLightbox: (photos: GalleryPhotoItem[], index: number, autoPlay?: boolean) => void;
  onSelectTrip: (tripId: string, targetSpotId?: string) => void;
  onCloseHub: () => void;
  onResetFilters: () => void;
}

export const TravelHubGalleryView: React.FC<TravelHubGalleryViewProps> = ({
  photos,
  onOpenLightbox,
  onSelectTrip,
  onCloseHub,
  onResetFilters,
}) => {
  const [featuredOnly, setFeaturedOnly] = useState(false);

  const visiblePhotos = useMemo(() => {
    if (!featuredOnly) return photos;
    return photos.filter((p) => p.isFeaturedSpot || Boolean(p.caption));
  }, [photos, featuredOnly]);

  const distinctTripsCount = useMemo(() => {
    return new Set(visiblePhotos.map((p) => p.tripId)).size;
  }, [visiblePhotos]);

  if (photos.length === 0) {
    return (
      <div className="py-16 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
          <ImageIcon className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
            目前篩選條件尚無回憶照片
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            在行程景點或旅行相簿上傳照片後，這裡將呈現您的跨旅程攝影集。
          </p>
        </div>
        <button
          type="button"
          onClick={onResetFilters}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition cursor-pointer"
        >
          重設篩選條件
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Editorial Story Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div className="space-y-0.5">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            旅途攝影精選牆
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {visiblePhotos.length} 張珍藏瞬間 · 橫跨 {distinctTripsCount} 趟旅程
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setFeaturedOnly(false)}
              className={`min-h-[34px] px-3 py-1 rounded-lg transition cursor-pointer whitespace-nowrap ${
                !featuredOnly
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              全部 ({photos.length})
            </button>
            <button
              type="button"
              onClick={() => setFeaturedOnly(true)}
              className={`min-h-[34px] px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                featuredOnly
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>有故事附註</span>
            </button>
          </div>

          <button
            type="button"
            disabled={visiblePhotos.length === 0}
            onClick={() => onOpenLightbox(visiblePhotos, 0, true)}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-[0.98] cursor-pointer whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>播放回憶故事</span>
          </button>
        </div>
      </div>

      {/* Responsive Masonry Waterfall */}
      <div className="columns-2 sm:columns-3 xl:columns-4 gap-3 sm:gap-4 space-y-3 sm:space-y-4">
        {visiblePhotos.map((photo, idx) => (
          <div
            key={photo.id}
            onClick={() => onOpenLightbox(visiblePhotos, idx, false)}
            className="break-inside-avoid group relative rounded-2xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 cursor-pointer transition hover:border-teal-500/70"
          >
            <div className="relative overflow-hidden bg-slate-100 dark:bg-slate-800">
              <MediaImage
                src={photo.url}
                tripId={photo.tripId}
                ownerId={photo.ownerId}
                collabId={photo.collabId}
                alt={photo.spotTitle}
                className="w-full h-auto object-cover group-hover:scale-[1.03] transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
                <span className="text-[11px] font-mono text-teal-200 tabular-nums">
                  {photo.date ? formatDateSlash(photo.date) : ''} · {photo.tripDestination}
                </span>
                <p className="text-xs font-bold text-white line-clamp-1 mt-0.5">
                  {photo.spotTitle}
                </p>
              </div>
            </div>

            {/* Clean Editorial Caption Strip */}
            <div className="p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {photo.spotTitle}
                </h4>
                {photo.mood && <span className="text-xs shrink-0">{photo.mood}</span>}
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
                <span className="truncate flex items-center gap-1">
                  <MapPin className="w-3 h-3 shrink-0 opacity-70" />
                  <span className="truncate">{photo.tripDestination}</span>
                </span>
                {photo.date && (
                  <span className="font-mono tabular-nums shrink-0">
                    {formatDateSlash(photo.date)}
                  </span>
                )}
              </div>

              {photo.caption && (
                <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                  {photo.caption}
                </p>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTrip(photo.tripId, photo.spotId);
                  onCloseHub();
                }}
                className="pt-1 text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Camera className="w-3 h-3" />
                <span className="truncate max-w-[140px]">{photo.tripTitle}</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
