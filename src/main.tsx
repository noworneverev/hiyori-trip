import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { setGlobalUpdateSW } from './utils/pwaUpdater';

// Clean up any stray cache-buster query param left by prior manual updates
try {
  const url = new URL(window.location.href);
  if (url.searchParams.has('_v') || url.searchParams.has('_t')) {
    url.searchParams.delete('_v');
    url.searchParams.delete('_t');
    window.history.replaceState(window.history.state, '', url.toString());
  }
} catch {}

// Register PWA Service Worker with prompt-based updates (never force-reloads mid-form)
let lastSwCheckAt = 0;
const SW_CHECK_COOLDOWN_MS = 5 * 60 * 1000;

const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const checkOnResume = () => {
      const now = Date.now();
      if (
        document.visibilityState === 'visible' &&
        navigator.onLine &&
        now - lastSwCheckAt > SW_CHECK_COOLDOWN_MS
      ) {
        lastSwCheckAt = now;
        registration.update().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', checkOnResume);
  },
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('pwa_update_available'));
  },
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent('pwa_offline_ready'));
  },
  onRegisterError(err) {
    console.warn('[PWA] Service Worker registration failed:', err);
  },
});

setGlobalUpdateSW(updateSW);

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
