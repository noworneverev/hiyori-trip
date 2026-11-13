import React, { useEffect, useRef, useState } from 'react';
import { formatDateSlash } from '../../utils/date';
import { MediaImage } from '../UI/MediaImage';
import { GalleryPhotoItem } from './travelHubTypes';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MapPin,
  Pause,
  Play,
  X,
} from 'lucide-react';

interface TravelHubLightboxProps {
  photos: GalleryPhotoItem[];
  initialIndex: number;
  initialAutoPlay?: boolean;
  onClose: () => void;
  onSelectTrip: (tripId: string, targetSpotId?: string) => void;
}

const SLIDE_DURATION_MS = 4500;

export const TravelHubLightbox: React.FC<TravelHubLightboxProps> = ({
  photos,
  initialIndex,
  initialAutoPlay = false,
  onClose,
  onSelectTrip,
}) => {
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.min(Math.max(0, initialIndex), Math.max(0, photos.length - 1))
  );
  const [isPlaying, setIsPlaying] = useState(initialAutoPlay && photos.length > 1);
  const [progress, setProgress] = useState(0);

  const touchStartXRef = useRef<number | null>(null);

  const currentPhoto = photos[currentIndex];

  const handleNext = () => {
    setProgress(0);
    setCurrentIndex((prev) => (prev + 1) % photos.length);
  };

  const handlePrev = () => {
    setProgress(0);
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  useEffect(() => {
    if (!isPlaying || photos.length <= 1) {
      setProgress(0);
      return;
    }

    const stepMs = 50;
    const stepPercent = (stepMs / SLIDE_DURATION_MS) * 100;
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev + stepPercent >= 100) {
          setCurrentIndex((idx) => (idx + 1) % photos.length);
          return 0;
        }
        return prev + stepPercent;
      });
    }, stepMs);

    return () => clearInterval(interval);
  }, [isPlaying, photos.length, currentIndex]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === ' ') {
        e.preventDefault();
        if (photos.length > 1) setIsPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [photos.length, onClose]);

  if (!currentPhoto) return null;

  // Cap visible progress segments at 24 to keep bar readable on huge albums
  const maxBars = Math.min(photos.length, 24);
  const activeBarIdx =
    photos.length <= maxBars
      ? currentIndex
      : Math.min(maxBars - 1, Math.floor((currentIndex / photos.length) * maxBars));

  return (
    <div
      className="fixed inset-0 z-70 flex flex-col justify-between bg-slate-950/95 backdrop-blur-md text-white select-none animate-in fade-in duration-150"
      onClick={onClose}
      onTouchStart={(e) => {
        touchStartXRef.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchStartXRef.current === null) return;
        const endX = e.changedTouches[0]?.clientX ?? touchStartXRef.current;
        const delta = endX - touchStartXRef.current;
        touchStartXRef.current = null;
        if (Math.abs(delta) > 45 && photos.length > 1) {
          if (delta < 0) handleNext();
          else handlePrev();
        }
      }}
    >
      {/* Top Story Progress Bars & Controls */}
      <div
        className="w-full max-w-5xl mx-auto px-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-2 space-y-3 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {photos.length > 1 && (
          <div className="flex items-center gap-1">
            {Array.from({ length: maxBars }, (_, i) => {
              const fillWidth =
                i < activeBarIdx
                  ? '100%'
                  : i === activeBarIdx
                  ? isPlaying
                    ? `${progress}%`
                    : '100%'
                  : '0%';
              return (
                <div
                  key={i}
                  className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden"
                >
                  <div
                    className="h-full bg-white transition-all duration-75"
                    style={{ width: fillWidth }}
                  />
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-xs text-slate-300 font-mono tabular-nums truncate">
            <span>{currentIndex + 1} / {photos.length}</span>
            <span className="mx-2 text-white/30">·</span>
            <span className="font-sans font-semibold text-white">{currentPhoto.tripTitle}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {photos.length > 1 && (
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{isPlaying ? '暫停故事' : '播放故事'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition cursor-pointer"
              aria-label="關閉照片檢視"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Center Stage Media + Left/Right Controls */}
      <div
        className="flex-1 min-h-0 relative flex items-center justify-center px-3 sm:px-14 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        {photos.length > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 items-center justify-center transition cursor-pointer z-10"
            aria-label="上一張"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <MediaImage
          src={currentPhoto.url}
          tripId={currentPhoto.tripId}
          ownerId={currentPhoto.ownerId}
          collabId={currentPhoto.collabId}
          alt={currentPhoto.spotTitle || '旅行回憶'}
          className="max-w-full max-h-[68vh] object-contain rounded-2xl shadow-2xl border border-white/10"
        />

        {photos.length > 1 && (
          <button
            type="button"
            onClick={handleNext}
            className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 items-center justify-center transition cursor-pointer z-10"
            aria-label="下一張"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Editorial Story Caption */}
      <div
        className="w-full max-w-4xl mx-auto px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-2 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-white/8 backdrop-blur-md border border-white/10 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="text-[11px] text-teal-300 font-mono tabular-nums flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {currentPhoto.tripDestination}
              </span>
              {currentPhoto.date && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{formatDateSlash(currentPhoto.date)}</span>
                </>
              )}
              {currentPhoto.mood && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{currentPhoto.mood}</span>
                </>
              )}
            </div>
            <h4 className="font-bold text-sm sm:text-base text-white truncate">
              {currentPhoto.spotTitle}
            </h4>
            {currentPhoto.caption && (
              <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                {currentPhoto.caption}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {photos.length > 1 && (
              <div className="flex sm:hidden items-center gap-1 mr-auto">
                <button
                  type="button"
                  onClick={handlePrev}
                  className="min-w-[40px] min-h-[40px] rounded-xl bg-white/10 flex items-center justify-center"
                  aria-label="上一張"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="min-w-[40px] min-h-[40px] rounded-xl bg-white/10 flex items-center justify-center"
                  aria-label="下一張"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {currentPhoto.googlePhotosUrl && (
              <a
                href={currentPhoto.googlePhotosUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-amber-200 text-xs font-semibold inline-flex items-center gap-1 transition whitespace-nowrap"
              >
                <span>Google 相簿</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            <button
              type="button"
              onClick={() => {
                onSelectTrip(currentPhoto.tripId, currentPhoto.spotId);
                onClose();
              }}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
            >
              <span>查看旅程</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
