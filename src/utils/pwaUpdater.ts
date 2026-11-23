// Safe PWA update manager: never destroys offline precaches unless an update is actually ready.

export interface UpdateState {
  status: 'idle' | 'checking' | 'updating' | 'latest' | 'error';
  message?: string;
}

let globalUpdateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

export const setGlobalUpdateSW = (updateFn: (reloadPage?: boolean) => Promise<void>) => {
  globalUpdateSW = updateFn;
};

export const triggerHaptic = (pattern: number | number[] = 12): void => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignored on platforms without Vibration API (e.g. iOS Safari)
    }
  }
};

export const performAppUpdate = async (
  onStatusChange?: (state: UpdateState) => void,
  options?: { forceApplyWaiting?: boolean }
): Promise<void> => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    onStatusChange?.({ status: 'error', message: '目前為離線模式，請連線後再檢查更新' });
    setTimeout(() => {
      onStatusChange?.({ status: 'idle' });
    }, 2800);
    return;
  }

  triggerHaptic([18, 24, 18]);
  onStatusChange?.({ status: 'checking', message: '正在檢查最新版本...' });

  try {
    let foundUpdate = Boolean(options?.forceApplyWaiting);
    let waitingWorker: ServiceWorker | null = null;

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        try {
          await reg.update();
          if (reg.waiting) {
            foundUpdate = true;
            waitingWorker = reg.waiting;
          } else if (reg.installing) {
            foundUpdate = true;
            const installing = reg.installing;
            await new Promise<void>((resolve) => {
              const timer = window.setTimeout(resolve, 6000);
              installing.addEventListener('statechange', () => {
                if (installing.state === 'installed' || installing.state === 'redundant') {
                  window.clearTimeout(timer);
                  if (reg.waiting) waitingWorker = reg.waiting;
                  resolve();
                }
              });
            });
          }
        } catch (regErr) {
          console.warn('SW reg update error:', regErr);
        }
      }
    }

    if (!foundUpdate) {
      onStatusChange?.({ status: 'latest', message: '已是最新版本，無需更新' });
      setTimeout(() => {
        onStatusChange?.({ status: 'idle' });
      }, 2600);
      return;
    }

    onStatusChange?.({ status: 'updating', message: '偵測到新版本，正在平滑套用...' });

    // Activate waiting SW cleanly without wiping offline caches prematurely
    if (globalUpdateSW) {
      try {
        await globalUpdateSW(true);
      } catch (swErr) {
        console.warn('globalUpdateSW error:', swErr);
      }
    } else if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }

    await new Promise((resolve) => setTimeout(resolve, 450));
    window.location.reload();
  } catch (error) {
    console.error('Update check failed:', error);
    onStatusChange?.({ status: 'error', message: '檢查更新失敗，請稍後再試' });
    setTimeout(() => {
      onStatusChange?.({ status: 'idle' });
    }, 2800);
  }
};
