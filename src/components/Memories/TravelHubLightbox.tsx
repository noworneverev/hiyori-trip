import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDateSlash } from '../../utils/date';
import { useModalLayer } from '../../hooks/useModalHistory';
import {
  connectGoogleDrive,
  getDriveAccessToken,
  hasDriveAccessToken,
} from '../../utils/firebase';
import {
  downloadDriveOriginalFile,
  DriveAuthExpiredError,
  fetchDriveOriginalObjectUrl,
  formatBytesLabel,
  getCachedDriveOriginalObjectUrl,
} from '../../utils/googleDrive';
import { sanitizeExternalUrl } from '../../utils/url';
import { MediaImage } from '../UI/MediaImage';
import { GalleryPhotoItem } from './travelHubTypes';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  HardDrive,
  Loader2,
  MapPin,
  Pause,
  Play,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface TravelHubLightboxProps {
  photos: GalleryPhotoItem[];
  initialIndex: number;
  initialAutoPlay?: boolean;
  onClose: () => void;
  onSelectTrip: (tripId: string, targetSpotId?: string) => void;
}

const SLIDE_DURATION_MS = 4500;

function getDownloadExtFromMime(mime?: string): string {
  const m = (mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('heic') || m.includes('heif')) return 'heic';
  if (m.includes('gif')) return 'gif';
  return 'jpg';
}

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
  const [driveConnected, setDriveConnected] = useState<boolean>(() => hasDriveAccessToken());
  const [driveOriginalUrl, setDriveOriginalUrl] = useState<string | null>(() =>
    getCachedDriveOriginalObjectUrl(photos[initialIndex]?.driveFileId)
  );
  const [isLoadingOriginal, setIsLoadingOriginal] = useState(false);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [isDownloadingOriginal, setIsDownloadingOriginal] = useState(false);
  const [driveLoadError, setDriveLoadError] = useState<string | null>(null);

  // Native iOS Photos-style gesture states: double-tap zoom, pinch zoom, pan, pull-down-to-dismiss
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [pullDismissY, setPullDismissY] = useState(0);
  const [isDraggingDismiss, setIsDraggingDismiss] = useState(false);

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);
  const pinchStartRef = useRef<{ dist: number; scale: number } | null>(null);
  const lastTapRef = useRef<number>(0);

  const currentPhoto = photos[currentIndex];

  useModalLayer(true, onClose);

  const resetZoom = useCallback(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setPullDismissY(0);
    setIsDraggingDismiss(false);
  }, []);

  useEffect(() => {
    resetZoom();
  }, [currentIndex, resetZoom]);

  useEffect(() => {
    const syncDrive = () => setDriveConnected(hasDriveAccessToken());
    window.addEventListener('hiyori_drive_auth_changed', syncDrive);
    return () => window.removeEventListener('hiyori_drive_auth_changed', syncDrive);
  }, []);

  useEffect(() => {
    setDriveLoadError(null);
    const fileId = currentPhoto?.driveFileId;
    if (!fileId) {
      setDriveOriginalUrl(null);
      setIsLoadingOriginal(false);
      return;
    }

    const cached = getCachedDriveOriginalObjectUrl(fileId);
    if (cached) {
      setDriveOriginalUrl(cached);
      setIsLoadingOriginal(false);
      return;
    }

    setDriveOriginalUrl(null);
    const token = getDriveAccessToken();
    if (!token) {
      setIsLoadingOriginal(false);
      return;
    }

    let cancelled = false;
    setIsLoadingOriginal(true);
    fetchDriveOriginalObjectUrl(fileId, token)
      .then((url) => {
        if (!cancelled) {
          setDriveOriginalUrl(url);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof DriveAuthExpiredError) {
            setDriveConnected(false);
          } else {
            setDriveLoadError(err instanceof Error ? err.message : '原圖載入失敗');
          }
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingOriginal(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentPhoto?.driveFileId, driveConnected]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % photos.length);
  }, [photos.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
  }, [photos.length]);

  // Zero-polling slideshow timer: pauses cleanly while Drive HD original is still loading or user zoomed in
  const isSlideAdvancing = isPlaying && photos.length > 1 && !isLoadingOriginal && zoomScale === 1;

  useEffect(() => {
    if (!isSlideAdvancing) return;
    const timer = window.setTimeout(() => {
      handleNext();
    }, SLIDE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [isSlideAdvancing, currentIndex, handleNext]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === ' ') {
        e.preventDefault();
        if (photos.length > 1) setIsPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [photos.length, handleNext, handlePrev]);

  if (!currentPhoto) return null;

  const safeGooglePhotosUrl = sanitizeExternalUrl(currentPhoto.googlePhotosUrl);

  // Cap visible progress segments at 24 to keep bar readable on huge albums
  const maxBars = Math.min(photos.length, 24);
  const activeBarIdx =
    photos.length <= maxBars
      ? currentIndex
      : Math.min(maxBars - 1, Math.floor((currentIndex / photos.length) * maxBars));

  const handleStageTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch zoom start
      touchStartRef.current = null;
      panStartRef.current = null;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartRef.current = { dist: Math.hypot(dx, dy) || 1, scale: zoomScale };
      return;
    }

    if (e.touches.length === 1) {
      const t = e.touches[0];
      const now = Date.now();
      if (now - lastTapRef.current < 280) {
        // Double-tap toggles 1x <-> 2.25x zoom
        lastTapRef.current = 0;
        if (zoomScale > 1.05) {
          resetZoom();
        } else {
          setZoomScale(2.25);
          setPanOffset({ x: 0, y: 0 });
        }
        return;
      }
      lastTapRef.current = now;

      if (zoomScale > 1.05) {
        panStartRef.current = {
          x: t.clientX,
          y: t.clientY,
          origX: panOffset.x,
          origY: panOffset.y,
        };
        touchStartRef.current = null;
      } else {
        touchStartRef.current = { x: t.clientX, y: t.clientY, time: now };
        panStartRef.current = null;
      }
    }
  };

  const handleStageTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy) || 1;
      const nextScale = Math.min(3.5, Math.max(1, pinchStartRef.current.scale * (dist / pinchStartRef.current.dist)));
      setZoomScale(nextScale);
      if (nextScale <= 1.02) {
        setPanOffset({ x: 0, y: 0 });
      }
      return;
    }

    if (e.touches.length === 1 && panStartRef.current && zoomScale > 1.05) {
      const dx = e.touches[0].clientX - panStartRef.current.x;
      const dy = e.touches[0].clientY - panStartRef.current.y;
      const maxPan = 220 * (zoomScale - 1);
      setPanOffset({
        x: Math.max(-maxPan, Math.min(maxPan, panStartRef.current.origX + dx)),
        y: Math.max(-maxPan, Math.min(maxPan, panStartRef.current.origY + dy)),
      });
      return;
    }

    if (e.touches.length === 1 && touchStartRef.current && zoomScale === 1) {
      const dx = e.touches[0].clientX - touchStartRef.current.x;
      const dy = e.touches[0].clientY - touchStartRef.current.y;
      if (dy > 14 && dy > Math.abs(dx) * 1.25) {
        setIsDraggingDismiss(true);
        setPullDismissY(Math.min(260, dy));
      }
    }
  };

  const handleStageTouchEnd = (e: React.TouchEvent) => {
    if (pinchStartRef.current) {
      if (e.touches.length < 2) {
        pinchStartRef.current = null;
        if (zoomScale < 1.1) resetZoom();
      }
      return;
    }

    if (panStartRef.current) {
      panStartRef.current = null;
      return;
    }

    const start = touchStartRef.current;
    touchStartRef.current = null;

    if (isDraggingDismiss) {
      if (pullDismissY > 95) {
        onClose();
      } else {
        setPullDismissY(0);
        setIsDraggingDismiss(false);
      }
      return;
    }

    if (!start || e.changedTouches.length !== 1 || zoomScale > 1.05) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4 && photos.length > 1) {
      if (dx < 0) handleNext();
      else handlePrev();
    }
  };

  const backdropAlpha = Math.max(0.45, 0.95 - pullDismissY / 420);

  const content = (
    <div
      className="fixed inset-0 z-[100] flex flex-col justify-between backdrop-blur-md text-white select-none overscroll-none animate-in fade-in duration-150"
      style={{ backgroundColor: `rgba(2, 6, 23, ${backdropAlpha.toFixed(2)})` }}
      onClick={onClose}
    >
      <style>{`
        @keyframes hiyoriSlideProgress {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>

      {/* Top Story Progress Bars & Controls */}
      <div
        className="w-full max-w-5xl mx-auto pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[calc(0.85rem+env(safe-area-inset-top,0px))] pb-2 space-y-3 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {photos.length > 1 && (
          <div className="flex items-center gap-1">
            {Array.from({ length: maxBars }, (_, i) => {
              const isPast = i < activeBarIdx;
              const isCurrent = i === activeBarIdx;
              return (
                <div
                  key={i}
                  className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden"
                >
                  {isPast ? (
                    <div className="h-full w-full bg-white" />
                  ) : isCurrent ? (
                    isSlideAdvancing ? (
                      <div
                        key={`anim-${currentIndex}`}
                        className="h-full w-full bg-white origin-left"
                        style={{
                          animation: `hiyoriSlideProgress ${SLIDE_DURATION_MS}ms linear forwards`,
                        }}
                      />
                    ) : (
                      <div className="h-full w-full bg-white/90" />
                    )
                  ) : null}
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

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => (zoomScale > 1.05 ? resetZoom() : setZoomScale(2.25))}
              className="min-w-[40px] min-h-[40px] rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition cursor-pointer"
              title={zoomScale > 1.05 ? '恢復原尺寸' : '放大檢視'}
              aria-label={zoomScale > 1.05 ? '恢復原尺寸' : '放大檢視'}
            >
              {zoomScale > 1.05 ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
            </button>
            {photos.length > 1 && (
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span className="hidden sm:inline">{isPlaying ? '暫停故事' : '播放故事'}</span>
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

      {/* Center Stage Media + Touch Gestures + Left/Right Controls */}
      <div
        className="flex-1 min-h-0 relative flex items-center justify-center pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:px-14 py-2 overflow-hidden touch-none"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleStageTouchStart}
        onTouchMove={handleStageTouchMove}
        onTouchEnd={handleStageTouchEnd}
        onDoubleClick={() => (zoomScale > 1.05 ? resetZoom() : setZoomScale(2.25))}
      >
        {photos.length > 1 && zoomScale <= 1.05 && (
          <button
            type="button"
            onClick={handlePrev}
            className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 items-center justify-center transition cursor-pointer z-10"
            aria-label="上一張"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <div
          className="flex items-center justify-center will-change-transform"
          style={{
            transform: `translate3d(${panOffset.x}px, ${panOffset.y + pullDismissY}px, 0) scale(${zoomScale})`,
            transition: isDraggingDismiss || pinchStartRef.current || panStartRef.current ? 'none' : 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <MediaImage
            src={driveOriginalUrl || currentPhoto.url}
            tripId={currentPhoto.tripId}
            ownerId={currentPhoto.ownerId}
            collabId={currentPhoto.collabId}
            alt={currentPhoto.spotTitle || '旅行回憶'}
            className="max-w-full max-h-[68dvh] object-contain rounded-2xl shadow-2xl border border-white/10 pointer-events-none"
          />
        </div>

        {photos.length > 1 && zoomScale <= 1.05 && (
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
        className="w-full max-w-4xl mx-auto pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-2 shrink-0"
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
            <h4 className="font-bold text-sm sm:text-base text-white break-words">
              {currentPhoto.spotTitle}
            </h4>
            {currentPhoto.caption && (
              <p className="text-xs text-slate-300 whitespace-pre-wrap break-words max-h-24 overflow-y-auto leading-relaxed">
                {currentPhoto.caption}
              </p>
            )}
            {currentPhoto.driveFileId && (
              <div className="text-[11px] font-mono tabular-nums text-slate-300 flex items-center gap-1.5 flex-wrap pt-0.5">
                <HardDrive className="w-3 h-3 text-teal-400 shrink-0" />
                {currentPhoto.originalWidth && currentPhoto.originalHeight && (
                  <span>
                    {currentPhoto.originalWidth} × {currentPhoto.originalHeight}
                  </span>
                )}
                {currentPhoto.originalBytes && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{formatBytesLabel(currentPhoto.originalBytes)}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                {isLoadingOriginal ? (
                  <span className="font-sans text-teal-300 inline-flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>載入 Drive 原圖中...</span>
                  </span>
                ) : driveOriginalUrl ? (
                  <span className="font-sans text-teal-300">Drive 原圖畫質</span>
                ) : driveLoadError ? (
                  <span className="font-sans text-amber-300">{driveLoadError}</span>
                ) : (
                  <span className="font-sans text-slate-400">1440px 高清預覽</span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
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

            {currentPhoto.driveFileId && !driveOriginalUrl && !isLoadingOriginal && !driveConnected && (
              <button
                type="button"
                disabled={isConnectingDrive}
                onClick={async () => {
                  setDriveLoadError(null);
                  setIsConnectingDrive(true);
                  try {
                    const token = await connectGoogleDrive();
                    const ok = Boolean(token) || hasDriveAccessToken();
                    setDriveConnected(ok);
                    if (!ok) {
                      setDriveLoadError('Google Drive 授權已取消或彈窗被封鎖');
                    }
                  } finally {
                    setIsConnectingDrive(false);
                  }
                }}
                className="min-h-[44px] sm:min-h-[40px] px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-teal-300 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>{isConnectingDrive ? '授權中...' : '載入 Drive 原圖'}</span>
              </button>
            )}

            {currentPhoto.driveFileId && (
              <button
                type="button"
                disabled={isDownloadingOriginal}
                onClick={async () => {
                  setDriveLoadError(null);
                  let token = getDriveAccessToken();
                  if (!token) {
                    token = await connectGoogleDrive();
                    setDriveConnected(Boolean(token) || hasDriveAccessToken());
                    if (!token) {
                      setDriveLoadError('Google Drive 授權已取消或彈窗被封鎖');
                      return;
                    }
                  }
                  if (!currentPhoto.driveFileId) return;
                  setIsDownloadingOriginal(true);
                  try {
                    const ext = getDownloadExtFromMime(currentPhoto.originalMimeType);
                    const safeName = `${currentPhoto.date || 'hiyori'}_${currentPhoto.spotTitle || 'photo'}.${ext}`.replace(
                      /[\\/:*?"<>|]/g,
                      '_'
                    );
                    await downloadDriveOriginalFile(currentPhoto.driveFileId, safeName, token);
                  } catch (err) {
                    setDriveLoadError(err instanceof Error ? err.message : '下載失敗');
                  } finally {
                    setIsDownloadingOriginal(false);
                  }
                }}
                className="min-h-[44px] sm:min-h-[40px] px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap disabled:opacity-50"
                title="從 Google Drive 下載未壓縮原始照片"
              >
                {isDownloadingOriginal ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5 text-teal-300" />
                )}
                <span>下載原圖</span>
              </button>
            )}

            {safeGooglePhotosUrl && (
              <a
                href={safeGooglePhotosUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] sm:min-h-[40px] px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-amber-200 text-xs font-semibold inline-flex items-center gap-1 transition whitespace-nowrap"
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

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
