import { useState, useEffect, useRef, useCallback } from 'react';

interface UseScrollDirectionOptions {
  thresholdDown?: number;
  thresholdUp?: number;
  topOffset?: number;
  paused?: boolean;
}

/**
 * Native-like Scroll-to-Hide dynamic chrome hook for mobile viewports (< 640px).
 * Guards against top AND bottom iOS elastic rubber-band bounce and ignores height-only
 * Safari URL-bar resize jitter.
 */
export function useScrollDirection({
  thresholdDown = 14,
  thresholdUp = 8,
  topOffset = 40,
  paused = false,
}: UseScrollDirectionOptions = {}) {
  const [isNavHidden, setIsNavHidden] = useState(false);
  const lastScrollY = useRef(0);
  const lastInnerWidth = useRef(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const accumulatedDelta = useRef(0);
  const rafId = useRef<number | null>(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      setIsNavHidden(false);
      accumulatedDelta.current = 0;
    } else if (typeof window !== 'undefined') {
      lastScrollY.current = Math.max(0, window.scrollY);
      accumulatedDelta.current = 0;
    }
  }, [paused]);

  const resetNavVisibility = useCallback(() => {
    setIsNavHidden(false);
    accumulatedDelta.current = 0;
    if (typeof window !== 'undefined') {
      lastScrollY.current = Math.max(0, window.scrollY);
    }
  }, []);

  useEffect(() => {
    const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 640;

    const handleScroll = () => {
      if (
        pausedRef.current ||
        (typeof document !== 'undefined' && document.body.hasAttribute('data-scroll-locked'))
      ) {
        return;
      }

      if (rafId.current === null) {
        rafId.current = window.requestAnimationFrame(() => {
          rafId.current = null;

          if (
            pausedRef.current ||
            (typeof document !== 'undefined' && document.body.hasAttribute('data-scroll-locked'))
          ) {
            return;
          }

          if (!isMobile()) {
            setIsNavHidden(false);
            return;
          }

          const currentScrollY = Math.max(0, window.scrollY);
          const maxScrollY = Math.max(
            0,
            document.documentElement.scrollHeight - window.innerHeight
          );

          // Ignore iOS bottom elastic rubber-band rebound
          if (maxScrollY > 40 && currentScrollY >= maxScrollY - 24) {
            lastScrollY.current = currentScrollY;
            accumulatedDelta.current = 0;
            return;
          }

          const delta = currentScrollY - lastScrollY.current;

          if (currentScrollY <= topOffset) {
            setIsNavHidden(false);
            accumulatedDelta.current = 0;
            lastScrollY.current = currentScrollY;
            return;
          }

          if (
            (delta > 0 && accumulatedDelta.current < 0) ||
            (delta < 0 && accumulatedDelta.current > 0)
          ) {
            accumulatedDelta.current = 0;
          }

          accumulatedDelta.current += delta;

          if (accumulatedDelta.current > thresholdDown) {
            setIsNavHidden(true);
          } else if (accumulatedDelta.current < -thresholdUp) {
            setIsNavHidden(false);
          }

          lastScrollY.current = currentScrollY;
        });
      }
    };

    const handleResize = () => {
      // Only respond when viewport width crosses mobile/desktop threshold (ignore iOS address-bar height resize)
      const currentWidth = window.innerWidth;
      if (currentWidth !== lastInnerWidth.current) {
        lastInnerWidth.current = currentWidth;
        if (currentWidth >= 640) {
          setIsNavHidden(false);
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      if (rafId.current !== null) {
        window.cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, [thresholdDown, thresholdUp, topOffset]);

  return { isNavHidden, resetNavVisibility };
}
