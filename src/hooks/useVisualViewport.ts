import { useEffect, useState } from 'react';

export interface VisualViewportMetrics {
  height: number | null;
  offsetTop: number;
  keyboardInset: number;
  isKeyboardOpen: boolean;
}

/**
 * Tracks window.visualViewport so iOS Safari / Android Chrome bottom sheets
 * dynamically shrink & stay above the software keyboard without flipping false
 * when iOS WebKit pans visualViewport.offsetTop downward.
 */
export function useVisualViewport(enabled: boolean = true): VisualViewportMetrics {
  const [metrics, setMetrics] = useState<VisualViewportMetrics>({
    height: null,
    offsetTop: 0,
    keyboardInset: 0,
    isKeyboardOpen: false,
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.visualViewport) {
      setMetrics({ height: null, offsetTop: 0, keyboardInset: 0, isKeyboardOpen: false });
      return;
    }

    const vv = window.visualViewport;
    let rafId: number | null = null;

    const update = () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const layoutHeight = window.innerHeight;
        const scale = vv.scale || 1;
        const visibleHeight = Math.round(vv.height);
        const offsetTop = Math.max(0, Math.round(vv.offsetTop));
        // Do NOT subtract vv.offsetTop: when iOS Safari pans a focused lower input upward,
        // vv.offsetTop increases to match the keyboard height while the keyboard is STILL open!
        const occludedHeight = Math.max(0, Math.round(layoutHeight - vv.height * scale));
        const isKeyboardOpen = occludedHeight > 110;
        setMetrics({
          height: visibleHeight,
          offsetTop,
          keyboardInset: isKeyboardOpen ? occludedHeight : 0,
          isKeyboardOpen,
        });
      });
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [enabled]);

  return metrics;
}
