import { useEffect } from 'react';

/**
 * Bulletproof mobile & desktop body scroll locking hook.
 *
 * Handles iOS Safari / WebKit rubber-band scrolling and Android touch scroll leakage
 * by pinning document.body with `position: fixed` and matching `top: -${scrollY}px`.
 * Restores scroll position BEFORE clearing `data-scroll-locked` so scroll-hide navbars
 * never react to synthetic unlock scroll jumps, and avoids double scrollbar compensation
 * when `html { scrollbar-gutter: stable }` is active.
 */
let lockCount = 0;
let originalPosition = '';
let originalTop = '';
let originalLeft = '';
let originalRight = '';
let originalWidth = '';
let originalOverflow = '';
let originalOverscrollBehavior = '';
let originalTouchAction = '';
let originalPaddingRight = '';
let originalHtmlOverflow = '';
let originalHtmlOverscrollBehavior = '';
let originalHtmlTouchAction = '';
let savedScrollY = 0;

export function useBodyScrollLock(isLocked: boolean = true) {
  useEffect(() => {
    if (!isLocked) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    if (lockCount === 0) {
      savedScrollY =
        window.scrollY ||
        window.pageYOffset ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;

      originalPosition = document.body.style.position;
      originalTop = document.body.style.top;
      originalLeft = document.body.style.left;
      originalRight = document.body.style.right;
      originalWidth = document.body.style.width;
      originalOverflow = document.body.style.overflow;
      originalOverscrollBehavior = document.body.style.overscrollBehavior;
      originalTouchAction = document.body.style.touchAction;
      originalPaddingRight = document.body.style.paddingRight;

      originalHtmlOverflow = document.documentElement.style.overflow;
      originalHtmlOverscrollBehavior = document.documentElement.style.overscrollBehavior;
      originalHtmlTouchAction = document.documentElement.style.touchAction;

      // Only add paddingRight if the browser does NOT already reserve scrollbar-gutter: stable
      const htmlStyle = window.getComputedStyle(document.documentElement);
      const hasStableGutter =
        typeof (htmlStyle as any).scrollbarGutter === 'string' &&
        (htmlStyle as any).scrollbarGutter.includes('stable');
      const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollBarWidth > 0 && !hasStableGutter) {
        document.body.style.paddingRight = `${scrollBarWidth}px`;
      }

      document.body.setAttribute('data-scroll-locked', 'true');
      document.body.style.position = 'fixed';
      document.body.style.top = `-${savedScrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';

      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.overscrollBehavior = 'none';
    }

    lockCount++;

    return () => {
      lockCount = Math.max(0, lockCount - 1);

      if (lockCount === 0) {
        document.body.style.position = originalPosition || '';
        document.body.style.top = originalTop || '';
        document.body.style.left = originalLeft || '';
        document.body.style.right = originalRight || '';
        document.body.style.width = originalWidth || '';
        document.body.style.overflow = originalOverflow || '';
        document.body.style.overscrollBehavior = originalOverscrollBehavior || '';
        document.body.style.touchAction = originalTouchAction || '';
        document.body.style.paddingRight = originalPaddingRight || '';

        document.documentElement.style.overflow = originalHtmlOverflow || '';
        document.documentElement.style.overscrollBehavior = originalHtmlOverscrollBehavior || '';
        document.documentElement.style.touchAction = originalHtmlTouchAction || '';

        if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
        if (document.documentElement.style.overflow === 'hidden') document.documentElement.style.overflow = '';
        if (document.body.style.touchAction === 'none') document.body.style.touchAction = '';

        // Restore scroll position WHILE data-scroll-locked is still present so scroll listeners ignore the jump
        try {
          window.scrollTo({ top: savedScrollY, left: 0, behavior: 'instant' as ScrollBehavior });
        } catch {
          window.scrollTo(0, savedScrollY);
        }

        window.requestAnimationFrame(() => {
          if (lockCount === 0) {
            document.body.removeAttribute('data-scroll-locked');
          }
        });
      }
    };
  }, [isLocked]);
}
