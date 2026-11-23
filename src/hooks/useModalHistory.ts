import { useEffect, useRef } from 'react';

interface ModalLayerEntry {
  id: string;
  onClose: () => void;
  disableEscape?: boolean;
  pushedHistory: boolean;
}

const modalStack: ModalLayerEntry[] = [];
let globalListenersAttached = false;
let suppressNextPopState = false;

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (modalStack.length === 0) return;
  const top = modalStack[modalStack.length - 1];
  if (top.disableEscape) return;
  e.preventDefault();
  e.stopPropagation();
  top.onClose();
}

function handleGlobalPopState() {
  if (suppressNextPopState) {
    suppressNextPopState = false;
    return;
  }
  if (modalStack.length === 0) return;
  const top = modalStack[modalStack.length - 1];
  if (top.pushedHistory) {
    top.pushedHistory = false;
  }
  if (!top.disableEscape) {
    top.onClose();
  }
}

function ensureGlobalListeners() {
  if (globalListenersAttached || typeof window === 'undefined') return;
  globalListenersAttached = true;
  window.addEventListener('keydown', handleGlobalKeyDown);
  window.addEventListener('popstate', handleGlobalPopState);
}

/**
 * Registers an open modal/sheet onto a LIFO stack so:
 * 1. Pressing Escape ONLY closes the topmost modal (never cascades through stacked modals).
 * 2. Mobile hardware Back / iOS edge-swipe Back dismisses the topmost sheet instead of exiting the PWA.
 */
export function useModalLayer(
  isOpen: boolean,
  onClose: () => void,
  options?: { disableEscape?: boolean; enableHistoryBack?: boolean }
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const disableEscape = Boolean(options?.disableEscape);
  const enableHistoryBack = options?.enableHistoryBack !== false;

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    ensureGlobalListeners();

    const id = `modal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let pushedHistory = false;

    if (enableHistoryBack && typeof window.history?.pushState === 'function') {
      try {
        window.history.pushState({ ...(window.history.state || {}), __hiyoriModalId: id }, '');
        pushedHistory = true;
      } catch {
        pushedHistory = false;
      }
    }

    const entry: ModalLayerEntry = {
      id,
      onClose: () => onCloseRef.current(),
      disableEscape,
      pushedHistory,
    };

    modalStack.push(entry);

    return () => {
      const idx = modalStack.findIndex((m) => m.id === id);
      if (idx !== -1) {
        const [removed] = modalStack.splice(idx, 1);
        if (
          removed.pushedHistory &&
          window.history.state &&
          window.history.state.__hiyoriModalId === id
        ) {
          suppressNextPopState = true;
          try {
            window.history.back();
          } catch {
            suppressNextPopState = false;
          }
          // Safety reset in case browser ignores history.back()
          window.setTimeout(() => {
            suppressNextPopState = false;
          }, 120);
        }
      }
    };
  }, [isOpen, disableEscape, enableHistoryBack]);
}
