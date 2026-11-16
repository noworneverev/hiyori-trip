import React, { useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

export interface SwipeableActionRowProps {
  id: string;
  isOpen: boolean;
  canEdit: boolean;
  onOpenChange: (id: string | null) => void;
  onSwipeRevealed?: () => void;
  onRowClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  editLabel?: string;
  deleteLabel?: string;
  className?: string;
  containerClassName?: string;
  children: React.ReactNode;
}

const ACTION_BTN_WIDTH = 68;
const EDGE_GUARD_PX = 24; // Preserve browser left-edge back navigation gesture
const DEAD_ZONE_PX = 10;
const SNAP_THRESHOLD_PX = 56;
const FLICK_VELOCITY_PX_MS = -0.35;

export const SwipeableActionRow: React.FC<SwipeableActionRowProps> = ({
  id,
  isOpen,
  canEdit,
  onOpenChange,
  onSwipeRevealed,
  onRowClick,
  onEdit,
  onDelete,
  editLabel = '編輯',
  deleteLabel = '刪除',
  className = '',
  containerClassName = 'bg-white dark:bg-[#111827]',
  children,
}) => {
  const actionCount = (onEdit ? 1 : 0) + (onDelete ? 1 : 0);
  const trayWidth = actionCount * ACTION_BTN_WIDTH;
  const swipeEnabled = canEdit && actionCount > 0;

  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const dragOffsetRef = useRef<number | null>(null);
  const suppressClickUntilRef = useRef<number>(0);

  const gestureRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startTime: number;
    initialOffset: number;
    axisLock: 'none' | 'horizontal' | 'vertical';
  }>({
    active: false,
    startX: 0,
    startY: 0,
    startTime: 0,
    initialOffset: 0,
    axisLock: 'none',
  });

  const updateDragOffset = (val: number | null) => {
    dragOffsetRef.current = val;
    setDragOffset(val);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!swipeEnabled || e.touches.length !== 1) return;
    if (typeof window !== 'undefined' && window.innerWidth >= 768) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-swipe-action="true"]')) return;

    const touch = e.touches[0];
    if (touch.clientX < EDGE_GUARD_PX) return;

    gestureRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      initialOffset: isOpen ? -trayWidth : 0,
      axisLock: 'none',
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g.active || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const dx = touch.clientX - g.startX;
    const dy = touch.clientY - g.startY;

    if (g.axisLock === 'vertical') return;

    if (g.axisLock === 'none') {
      if (Math.abs(dx) < DEAD_ZONE_PX && Math.abs(dy) < DEAD_ZONE_PX) return;

      if (Math.abs(dy) > Math.abs(dx) * 1.1) {
        g.axisLock = 'vertical';
        g.active = false;
        return;
      }

      g.axisLock = 'horizontal';
      suppressClickUntilRef.current = Date.now() + 400;
      if (!isOpen) {
        onOpenChange(null);
      }
    }

    const rawOffset = g.initialOffset + dx;
    let clampedOffset = Math.min(0, rawOffset);
    if (clampedOffset < -trayWidth) {
      const overshoot = clampedOffset + trayWidth;
      clampedOffset = Math.max(-trayWidth - 28, -trayWidth + overshoot * 0.25);
    }
    updateDragOffset(clampedOffset);
  };

  const finishGesture = (clientX?: number) => {
    const g = gestureRef.current;
    if (!g.active) return;
    g.active = false;

    if (g.axisLock !== 'horizontal') {
      updateDragOffset(null);
      return;
    }

    const dx = typeof clientX === 'number' ? clientX - g.startX : 0;
    const elapsed = Math.max(1, Date.now() - g.startTime);
    const velocityX = dx / elapsed;
    const liveOffset = dragOffsetRef.current;
    const current = liveOffset !== null ? liveOffset : isOpen ? -trayWidth : 0;
    const snapThreshold = Math.min(SNAP_THRESHOLD_PX, Math.max(36, trayWidth * 0.42));

    const shouldOpen =
      current <= -snapThreshold ||
      (velocityX < FLICK_VELOCITY_PX_MS && current < -20);

    suppressClickUntilRef.current = Date.now() + 280;
    updateDragOffset(null);
    onOpenChange(shouldOpen ? id : null);
    if (shouldOpen) {
      onSwipeRevealed?.();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const endX = e.changedTouches[0]?.clientX;
    finishGesture(endX);
  };

  const handleTouchCancel = () => {
    finishGesture();
  };

  const handleForegroundClick = () => {
    if (Date.now() < suppressClickUntilRef.current) return;
    if (isOpen) {
      onOpenChange(null);
      return;
    }
    onRowClick?.();
  };

  const isDragging = dragOffset !== null;
  const effectiveOffset = !swipeEnabled
    ? 0
    : dragOffset !== null
    ? dragOffset
    : isOpen
    ? -trayWidth
    : 0;

  return (
    <div
      className={`relative overflow-hidden ${containerClassName}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {/* Mobile Underlay Action Tray (revealed on left-swipe) */}
      {swipeEnabled && (
        <div
          data-swipe-action="true"
          aria-hidden={!isOpen}
          style={{ width: `${trayWidth}px` }}
          className={`md:hidden absolute inset-y-0 right-0 flex items-stretch select-none ${
            isOpen ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          {onEdit && (
            <button
              type="button"
              tabIndex={isOpen ? 0 : -1}
              onClick={(e) => {
                e.stopPropagation();
                onOpenChange(null);
                onEdit();
              }}
              className="w-[68px] min-h-[44px] bg-teal-600 active:bg-teal-700 text-white flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors cursor-pointer"
              aria-label={editLabel}
            >
              <Pencil className="w-4 h-4" />
              <span>{editLabel}</span>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              tabIndex={isOpen ? 0 : -1}
              onClick={(e) => {
                e.stopPropagation();
                onOpenChange(null);
                onDelete();
              }}
              className="w-[68px] min-h-[44px] bg-rose-600 active:bg-rose-700 text-white flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors cursor-pointer"
              aria-label={deleteLabel}
            >
              <Trash2 className="w-4 h-4" />
              <span>{deleteLabel}</span>
            </button>
          )}
        </div>
      )}

      {/* Foreground Row Surface */}
      <div
        onClick={handleForegroundClick}
        style={{
          transform: `translate3d(${effectiveOffset}px, 0, 0)`,
          touchAction: swipeEnabled ? 'pan-y' : 'auto',
        }}
        className={`relative z-10 ${containerClassName} ${
          isDragging
            ? ''
            : 'transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none'
        } ${className}`}
      >
        {children}
      </div>
    </div>
  );
};

export const SwipeableExpenseRow = SwipeableActionRow;
