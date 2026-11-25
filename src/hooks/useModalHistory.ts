import { useEffect, useRef, useState } from 'react';

interface ModalLayerEntry {
  id: string;
  onClose: () => void;
  disableEscape?: boolean;
  pushedHistory: boolean;
}

const modalStack: ModalLayerEntry[] = [];
const stackSubscribers = new Set<() => void>();
let globalListenersAttached = false;
let suppressedPopCount = 0;

function notifyStackSubscribers() {
  stackSubscribers.forEach((fn) => {
    try {
      fn();
    } catch {
      // Ignore subscriber errors
    }
  });
}

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (modalStack.length === 0) return;
  const top = modalStack[modalStack.length - 1];
  if (top.disableEscape) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  top.onClose();
}

function handleGlobalPopState() {
  if (suppressedPopCount > 0) {
    suppressedPopCount = Math.max(0, suppressedPopCount - 1);
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
 * Reactive hook returning true whenever ANY modal, bottom sheet, action sheet, or lightbox
 * is registered on the global modal stack. Used to cleanly unmount portaled + FABs!
 */
export function useHasActiveModalLayer(): boolean {
  const [hasModal, setHasModal] = useState<boolean>(() => modalStack.length > 0);
  useEffect(() => {
    const sync = () => setHasModal(modalStack.length > 0);
    sync();
    stackSubscribers.add(sync);
    return () => {
      stackSubscribers.delete(sync);
    };
  }, []);
  return hasModal;
}

/**
 * Registers an open modal/sheet onto a LIFO stack so:
 * 1. Pressing Escape ONLY closes the topmost modal (never cascades through stacked modals).
 * 2. Mobile hardware Back / iOS edge-swipe Back dismisses the topmost sheet instead of exiting the PWA.
 * 3. Modal-to-Modal handoffs (closing Sheet A while opening Sheet B in the same tick) defer history.back()
 *    so asynchronous browser history pops never clobber Sheet B's newly pushed history state.
 */
export function useModalLayer(
  isOpen: boolean,
  onClose: () => void,
  options?: { disableEscape?: boolean; enableHistoryBack?: boolean }
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const disableEscape = Boolean(options?.disableEscape);
  const enableHistoryBack = options?.enableHistoryBack !== false && !disableEscape;

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    ensureGlobalListeners();

    const id = `modal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let pushedHistory = false;

    if (enableHistoryBack && typeof window.history?.pushState === 'function') {
      try {
        // If the current history entry is already an orphaned/replaced modal slot with 0 active modals,
        // replaceState cleanly instead of stacking unbounded entries; otherwise pushState.
        if (modalStack.length === 0 && window.history.state?.__hiyoriModalId) {
          window.history.replaceState({ ...(window.history.state || {}), __hiyoriModalId: id }, '');
        } else {
          window.history.pushState({ ...(window.history.state || {}), __hiyoriModalId: id }, '');
        }
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
    notifyStackSubscribers();

    return () => {
      const idx = modalStack.findIndex((m) => m.id === id);
      if (idx !== -1) {
        const [removed] = modalStack.splice(idx, 1);
        notifyStackSubscribers();

        if (removed.pushedHistory) {
          // Defer history.back() by 1 macrotask so synchronous Modal A -> Modal B transitions
          // can inspect whether another modal immediately took top-of-stack!
          window.setTimeout(() => {
            if (window.history.state && window.history.state.__hiyoriModalId === id) {
              suppressedPopCount++;
              try {
                window.history.back();
              } catch {
                suppressedPopCount = Math.max(0, suppressedPopCount - 1);
              }
              window.setTimeout(() => {
                suppressedPopCount = Math.max(0, suppressedPopCount - 1);
              }, 160);
            }
          }, 0);
        }
      }
    };
  }, [isOpen, disableEscape, enableHistoryBack]);
}
