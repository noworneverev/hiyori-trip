import React, { useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

interface SwipeableExpenseRowProps {
  id: string;
  isOpen: boolean;
  canEdit: boolean;
  onOpenChange: (id: string | null) => void;
  onSwipeRevealed?: () => void;
  onRowClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  editLabel?: string;
  deleteLabel?: string;
  className?: string;
  children: React.ReactNode;
}

const ACTION_TRAY_WIDTH = 136; // 68px Edit + 68px Delete
const EDGE_GUARD_PX = 24; // Preserve browser left-edge back navigation gesture
const DEAD_ZONE_PX = 10;
const SNAP_THRESHOLD_PX = 64;
const FLICK_VELOCITY_PX_MS = -0.35;

export const SwipeableExpenseRow: React.FC<SwipeableExpenseRowProps> = ({
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
  children,
}) => {
  const [dragOffset, setDragOffset] = useState<number | null>(null);
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

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!canEdit || e.touches.length !== 1) return;
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
      initialOffset: isOpen ? -ACTION_TRAY_WIDTH : 0,
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
    if (clampedOffset < -ACTION_TRAY_WIDTH) {
      const overshoot = clampedOffset + ACTION_TRAY_WIDTH;
      clampedOffset = Math.max(-ACTION_TRAY_WIDTH - 28, -ACTION_TRAY_WIDTH + overshoot * 0.25);
    }
    setDragOffset(clampedOffset);
  };

  const finishGesture = (clientX?: number) => {
    const g = gestureRef.current;
    if (!g.active) return;
    g.active = false;

    if (g.axisLock !== 'horizontal') {
      setDragOffset(null);
      return;
    }

    const dx = typeof clientX === 'number' ? clientX - g.startX : 0;
    const elapsed = Math.max(1, Date.now() - g.startTime);
    const velocityX = dx / elapsed;
    const current = dragOffset !== null ? dragOffset : isOpen ? -ACTION_TRAY_WIDTH : 0;

    const shouldOpen =
      current <= -SNAP_THRESHOLD_PX ||
      (velocityX < FLICK_VELOCITY_PX_MS && current < -24);

    suppressClickUntilRef.current = Date.now() + 280;
    setDragOffset(null);
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
    onRowClick();
  };

  const isDragging = dragOffset !== null;
  const effectiveOffset = !canEdit
    ? 0
    : dragOffset !== null
    ? dragOffset
    : isOpen
    ? -ACTION_TRAY_WIDTH
    : 0;

  return (
    <div
      className="relative overflow-hidden bg-white dark:bg-[#111827]"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {/* Mobile Underlay Action Tray (revealed on left-swipe) */}
      {canEdit && (
        <div
          data-swipe-action="true"
          aria-hidden={!isOpen}
          className={`md:hidden absolute inset-y-0 right-0 w-[136px] flex items-stretch select-none ${
            isOpen ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
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
        </div>
      )}

      {/* Foreground Expense Row Surface */}
      <div
        onClick={handleForegroundClick}
        style={{
          transform: `translate3d(${effectiveOffset}px, 0, 0)`,
          touchAction: canEdit ? 'pan-y' : 'auto',
        }}
        className={`relative z-10 bg-white dark:bg-[#111827] ${
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
