import { useState, useEffect, useRef, useCallback } from 'react';

interface UseScrollDirectionOptions {
  thresholdDown?: number; // Scroll distance in px before hiding (default: 10)
  thresholdUp?: number;   // Scroll distance in px before revealing (default: 6)
  topOffset?: number;     // Scroll offset from page top where nav is always visible (default: 32)
}

/**
 * Custom hook to detect scroll direction on mobile viewports (< 640px)
 * for native-like Scroll-to-Hide dynamic chrome behavior.
 */
export function useScrollDirection({
  thresholdDown = 10,
  thresholdUp = 6,
  topOffset = 32,
}: UseScrollDirectionOptions = {}) {
  const [isNavHidden, setIsNavHidden] = useState(false);
  const lastScrollY = useRef(0);
  const accumulatedDelta = useRef(0);
  const ticking = useRef(false);

  const resetNavVisibility = useCallback(() => {
    setIsNavHidden(false);
    accumulatedDelta.current = 0;
  }, []);

  useEffect(() => {
    const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 640;

    const handleScroll = () => {
      if (!ticking.current) {
        window.requestAnimationFrame(() => {
          // If desktop or tablet, never hide nav
          if (!isMobile()) {
            setIsNavHidden(false);
            ticking.current = false;
            return;
          }

          const currentScrollY = Math.max(0, window.scrollY);
          const delta = currentScrollY - lastScrollY.current;

          // Always reveal nav bars when near the top of the page
          if (currentScrollY <= topOffset) {
            setIsNavHidden(false);
            accumulatedDelta.current = 0;
            lastScrollY.current = currentScrollY;
            ticking.current = false;
            return;
          }

          // Reset accumulated delta if direction reverses
          if (
            (delta > 0 && accumulatedDelta.current < 0) ||
            (delta < 0 && accumulatedDelta.current > 0)
          ) {
            accumulatedDelta.current = 0;
          }

          accumulatedDelta.current += delta;

          // Scrolling down past threshold -> hide chrome
          if (accumulatedDelta.current > thresholdDown) {
            setIsNavHidden(true);
          }
          // Scrolling up past threshold -> reveal chrome
          else if (accumulatedDelta.current < -thresholdUp) {
            setIsNavHidden(false);
          }

          lastScrollY.current = currentScrollY;
          ticking.current = false;
        });

        ticking.current = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [thresholdDown, thresholdUp, topOffset]);

  return { isNavHidden, resetNavVisibility };
}
