import React, { useEffect, useRef } from 'react';
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

const ACTION_BTN_WIDTH = 72;
const EDGE_GUARD_PX = 24; // Preserve iOS left-edge back navigation gesture
const DEAD_ZONE_PX = 10;
const SNAP_THRESHOLD_PX = 54;
const OPEN_FLICK_VELOCITY = -0.32;
const CLOSE_FLICK_VELOCITY = 0.32;

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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const foregroundRef = useRef<HTMLDivElement | null>(null);
  const suppressClickUntilRef = useRef<number>(0);

  const propsRef = useRef({
    id,
    isOpen,
    swipeEnabled,
    trayWidth,
    onOpenChange,
    onSwipeRevealed,
  });
  propsRef.current = { id, isOpen, swipeEnabled, trayWidth, onOpenChange, onSwipeRevealed };

  // Sync resting transform when isOpen or trayWidth changes
  useEffect(() => {
    const el = foregroundRef.current;
    if (!el) return;
    const target = swipeEnabled && isOpen ? -trayWidth : 0;
    el.style.transition = 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)';
    el.style.transform = `translate3d(${target}px, 0, 0)`;
  }, [isOpen, swipeEnabled, trayWidth]);

  // Native non-passive touch listeners so horizontal lock cleanly prevents vertical Safari scroll drift
  // and mutates DOM transform directly at 60-120fps without React re-renders.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const gesture = {
      active: false,
      startX: 0,
      startY: 0,
      startTime: 0,
      initialOffset: 0,
      liveOffset: 0,
      axisLock: 'none' as 'none' | 'horizontal' | 'vertical',
    };

    const applyTransform = (offset: number, animated: boolean) => {
      const el = foregroundRef.current;
      if (!el) return;
      el.style.transition = animated ? 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
      el.style.transform = `translate3d(${offset}px, 0, 0)`;
    };

    const isTouchCapableViewport = () => {
      if (typeof window === 'undefined') return false;
      return window.innerWidth < 1024 || window.matchMedia?.('(pointer: coarse)').matches;
    };

    const onTouchStart = (e: TouchEvent) => {
      const p = propsRef.current;
      if (!p.swipeEnabled || e.touches.length !== 1 || !isTouchCapableViewport()) return;

      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-swipe-action="true"]')) return;

      const touch = e.touches[0];
      if (touch.clientX < EDGE_GUARD_PX) return;

      const initial = p.isOpen ? -p.trayWidth : 0;
      gesture.active = true;
      gesture.startX = touch.clientX;
      gesture.startY = touch.clientY;
      gesture.startTime = Date.now();
      gesture.initialOffset = initial;
      gesture.liveOffset = initial;
      gesture.axisLock = 'none';
    };

    const onTouchMove = (e: TouchEvent) => {
      const p = propsRef.current;
      if (!gesture.active || e.touches.length !== 1) return;

      const touch = e.touches[0];
      const dx = touch.clientX - gesture.startX;
      const dy = touch.clientY - gesture.startY;

      if (gesture.axisLock === 'vertical') return;

      if (gesture.axisLock === 'none') {
        if (Math.abs(dx) < DEAD_ZONE_PX && Math.abs(dy) < DEAD_ZONE_PX) return;

        // Require clear horizontal intent (|dx| > |dy| * 1.4) so diagonal scrolling never hijacks
        if (Math.abs(dx) <= Math.abs(dy) * 1.4) {
          gesture.axisLock = 'vertical';
          gesture.active = false;
          return;
        }

        // When closed, ignore rightward swipes so they never suppress taps or disrupt scrolling
        if (!p.isOpen && dx > 0) {
          gesture.axisLock = 'vertical';
          gesture.active = false;
          return;
        }

        gesture.axisLock = 'horizontal';
        suppressClickUntilRef.current = Date.now() + 380;
        if (!p.isOpen) {
          p.onOpenChange(null);
        }
      }

      if (e.cancelable) {
        e.preventDefault();
      }

      const rawOffset = gesture.initialOffset + dx;
      let clamped = Math.min(0, rawOffset);
      if (clamped < -p.trayWidth) {
        const overshoot = clamped + p.trayWidth;
        clamped = Math.max(-p.trayWidth - 28, -p.trayWidth + overshoot * 0.25);
      }
      gesture.liveOffset = clamped;
      applyTransform(clamped, false);
    };

    const onTouchEnd = (e: TouchEvent) => {
      const p = propsRef.current;
      if (!gesture.active) return;
      gesture.active = false;

      if (gesture.axisLock !== 'horizontal') return;

      const endX = e.changedTouches[0]?.clientX ?? gesture.startX;
      const dx = endX - gesture.startX;
      const elapsed = Math.max(1, Date.now() - gesture.startTime);
      const velocityX = dx / elapsed;
      const current = gesture.liveOffset;
      const snapThreshold = Math.min(SNAP_THRESHOLD_PX, Math.max(36, p.trayWidth * 0.42));

      let shouldOpen: boolean;
      if (velocityX > CLOSE_FLICK_VELOCITY) {
        shouldOpen = false;
      } else if (velocityX < OPEN_FLICK_VELOCITY && current < -18) {
        shouldOpen = true;
      } else {
        shouldOpen = current <= -snapThreshold;
      }

      suppressClickUntilRef.current = Date.now() + 260;
      applyTransform(shouldOpen ? -p.trayWidth : 0, true);
      p.onOpenChange(shouldOpen ? p.id : null);
      if (shouldOpen) {
        p.onSwipeRevealed?.();
      }
    };

    const onTouchCancel = () => {
      const p = propsRef.current;
      if (!gesture.active) return;
      gesture.active = false;
      // On system gesture cancel, always snap cleanly back to closed/resting state (never snap open unexpectedly)
      applyTransform(0, true);
      if (p.isOpen) {
        p.onOpenChange(null);
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    container.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchCancel);
    };
  }, []);

  const handleForegroundClick = () => {
    if (Date.now() < suppressClickUntilRef.current) return;
    if (isOpen) {
      onOpenChange(null);
      return;
    }
    onRowClick?.();
  };

  return (
    <div
      ref={containerRef}
      style={{ touchAction: swipeEnabled ? 'pan-y' : 'auto' }}
      className={`relative overflow-hidden ${containerClassName}`}
    >
      {/* Mobile Underlay Action Tray */}
      {swipeEnabled && (
        <div
          data-swipe-action="true"
          aria-hidden={!isOpen}
          style={{ width: `${trayWidth}px` }}
          className={`lg:hidden absolute inset-y-0 right-0 flex items-stretch ios-chrome ${
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
              className="w-[72px] min-h-[44px] bg-teal-600 active:bg-teal-700 text-white flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors cursor-pointer"
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
              className="w-[72px] min-h-[44px] bg-rose-600 active:bg-rose-700 text-white flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors cursor-pointer"
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
        ref={foregroundRef}
        onClick={handleForegroundClick}
        className={`relative z-10 will-change-transform ${containerClassName} ${className}`}
      >
        {children}
      </div>
    </div>
  );
};

export const SwipeableExpenseRow = SwipeableActionRow;
