import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { setGlobalUpdateSW } from './utils/pwaUpdater';

// Register PWA Service Worker gracefully without aggressive auto-reload loop
const updateSW = registerSW({
  immediate: false,
  onNeedRefresh() {
    console.log('New PWA version available.');
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
