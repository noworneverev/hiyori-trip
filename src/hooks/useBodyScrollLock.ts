import { useEffect } from 'react';

/**
 * Global lock counter and state to support nested modals seamlessly
 * without prematurely unlocking document.body scrolling.
 */
let lockCount = 0;
let originalOverflow = '';
let originalPaddingRight = '';
let savedScrollY = 0;

export function useBodyScrollLock(isLocked: boolean = true) {
  useEffect(() => {
    if (!isLocked) return;

    if (lockCount === 0) {
      // First modal opening: record scroll position & existing styles
      savedScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      originalOverflow = document.body.style.overflow;
      originalPaddingRight = document.body.style.paddingRight;

      // Prevent page layout shift by compensating for scrollbar width on desktop
      const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollBarWidth > 0) {
        document.body.style.paddingRight = `${scrollBarWidth}px`;
      }

      document.body.style.overflow = 'hidden';
      // Mark attribute for any CSS-based touch-action rules
      document.body.setAttribute('data-scroll-locked', 'true');
    }

    lockCount++;

    return () => {
      lockCount = Math.max(0, lockCount - 1);

      if (lockCount === 0) {
        // Last modal closing: restore styles and scroll position
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
        document.body.removeAttribute('data-scroll-locked');

        // Restore scroll position
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [isLocked]);
}
