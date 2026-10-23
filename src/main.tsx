import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { setGlobalUpdateSW } from './utils/pwaUpdater';

// Register PWA Service Worker with immediate auto-update
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('New PWA version available, auto refreshing...');
    updateSW(true);
  },
  onOfflineReady() {
    console.log('Hiyori is ready to work offline.');
  },
});

setGlobalUpdateSW(updateSW);

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
