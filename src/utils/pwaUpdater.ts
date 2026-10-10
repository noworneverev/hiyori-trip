// Utility for triggering PWA updates with proper tactile feedback and iOS standalone compatibility

export interface UpdateState {
  status: 'idle' | 'checking' | 'updating' | 'latest' | 'error';
  message?: string;
}

// Global reference to the VitePWA update function
let globalUpdateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

export const setGlobalUpdateSW = (updateFn: (reloadPage?: boolean) => Promise<void>) => {
  globalUpdateSW = updateFn;
};

export const performAppUpdate = async (onStatusChange?: (state: UpdateState) => void): Promise<void> => {
  // 1. Tactile haptic feedback for mobile/iOS users
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([25, 30, 25]);
    } catch (_) {
      // Vibrate not supported or denied
    }
  }

  onStatusChange?.({ status: 'checking', message: '正在檢查最新版本...' });

  try {
    let hasNewWorker = false;

    // 2. Safely check service worker registrations
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        try {
          await reg.update();
          if (reg.waiting) {
            hasNewWorker = true;
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          } else if (reg.installing) {
            hasNewWorker = true;
          }
        } catch (regErr) {
          console.warn('SW reg update error:', regErr);
        }
      }
    }

    // 3. Trigger VitePWA updateSW if available
    if (globalUpdateSW) {
      try {
        await globalUpdateSW(true);
      } catch (swErr) {
        console.warn('globalUpdateSW error:', swErr);
      }
    }

    onStatusChange?.({ status: 'updating', message: '正在載入最新版本...' });

    // Give a short visible transition (400ms) so the user experiences the press confirmation
    await new Promise((resolve) => setTimeout(resolve, 450));

    // 4. Safe reload with cache buster instead of crashing iOS standalone PWA
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('_v', Date.now().toString());
    window.location.replace(currentUrl.toString());
  } catch (error) {
    console.error('Update check failed:', error);
    onStatusChange?.({ status: 'error', message: '更新失敗，請檢查網路連線' });
    setTimeout(() => {
      onStatusChange?.({ status: 'idle' });
    }, 2000);
  }
};
