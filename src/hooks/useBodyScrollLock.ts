import { useEffect } from 'react';

/**
 * Bulletproof mobile & desktop body scroll locking hook.
 *
 * Handles iOS Safari / WebKit rubber-band scrolling and Android touch scroll leakage
 * by pinning document.body with `position: fixed` and matching `top: -${scrollY}px`.
 * Supports nested modals seamlessly via global reference counting.
 */
let lockCount = 0;
let originalPosition = '';
let originalTop = '';
let originalLeft = '';
let originalRight = '';
let originalWidth = '';
let originalOverflow = '';
let originalOverscrollBehavior = '';
let originalHtmlOverflow = '';
let originalHtmlOverscrollBehavior = '';
let savedScrollY = 0;

export function useBodyScrollLock(isLocked: boolean = true) {
  useEffect(() => {
    if (!isLocked) return;

    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    if (lockCount === 0) {
      // 1. Record current scroll offset before freezing
      savedScrollY =
        window.scrollY ||
        window.pageYOffset ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;

      // 2. Backup existing inline styles
      originalPosition = document.body.style.position;
      originalTop = document.body.style.top;
      originalLeft = document.body.style.left;
      originalRight = document.body.style.right;
      originalWidth = document.body.style.width;
      originalOverflow = document.body.style.overflow;
      originalOverscrollBehavior = document.body.style.overscrollBehavior;
      originalHtmlOverflow = document.documentElement.style.overflow;
      originalHtmlOverscrollBehavior = document.documentElement.style.overscrollBehavior;

      // 3. Compensate for desktop scrollbar jump
      const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollBarWidth > 0) {
        document.body.style.paddingRight = `${scrollBarWidth}px`;
      }

      // 4. Pin body in place - this is the ONLY technique that stops iOS Safari rubber-band background scrolling
      document.body.style.position = 'fixed';
      document.body.style.top = `-${savedScrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';

      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.overscrollBehavior = 'none';

      document.body.setAttribute('data-scroll-locked', 'true');
    }

    lockCount++;

    return () => {
      lockCount = Math.max(0, lockCount - 1);

      if (lockCount === 0) {
        // Restore all body styles
        document.body.style.position = originalPosition;
        document.body.style.top = originalTop;
        document.body.style.left = originalLeft;
        document.body.style.right = originalRight;
        document.body.style.width = originalWidth;
        document.body.style.overflow = originalOverflow;
        document.body.style.overscrollBehavior = originalOverscrollBehavior;
        document.body.style.paddingRight = '';

        document.documentElement.style.overflow = originalHtmlOverflow;
        document.documentElement.style.overscrollBehavior = originalHtmlOverscrollBehavior;

        document.body.removeAttribute('data-scroll-locked');

        // Restore user scroll position smoothly
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [isLocked]);
}
