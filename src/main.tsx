import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { setGlobalUpdateSW } from './utils/pwaUpdater';

// Register PWA Service Worker gracefully and notify app UI when update is ready
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const checkOnResume = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        registration.update().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', checkOnResume);
  },
  onNeedRefresh() {
    console.log('[PWA] New version available, notifying UI.');
    window.dispatchEvent(new CustomEvent('pwa_update_available'));
  },
  onOfflineReady() {
    console.log('[PWA] Hiyori is ready to work offline.');
  },
});

setGlobalUpdateSW(updateSW);

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
