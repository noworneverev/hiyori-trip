import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __hiyoriDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== 'undefined' && window.__hiyoriDeferredInstallPrompt) {
      return window.__hiyoriDeferredInstallPrompt;
    }
    return null;
  });
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const standaloneMedia = window.matchMedia('(display-mode: standalone)');
    const computeStandalone = () =>
      standaloneMedia.matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    setIsInstalled(computeStandalone());

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    setIsIOS(isIOSDevice);

    const handleDisplayModeChange = () => {
      setIsInstalled(computeStandalone());
    };

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      window.__hiyoriDeferredInstallPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handleEarlyCaptured = () => {
      if (window.__hiyoriDeferredInstallPrompt) {
        setDeferredPrompt(window.__hiyoriDeferredInstallPrompt);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      window.__hiyoriDeferredInstallPrompt = null;
      setDeferredPrompt(null);
    };

    standaloneMedia.addEventListener?.('change', handleDisplayModeChange);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('hiyori_install_prompt_ready', handleEarlyCaptured);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      standaloneMedia.removeEventListener?.('change', handleDisplayModeChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('hiyori_install_prompt_ready', handleEarlyCaptured);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    const promptToUse = deferredPrompt;
    // Per spec, BeforeInstallPromptEvent can only be prompted once regardless of outcome
    window.__hiyoriDeferredInstallPrompt = null;
    setDeferredPrompt(null);
    try {
      await promptToUse.prompt();
      const { outcome } = await promptToUse.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        return true;
      }
    } catch (err) {
      console.warn('PWA install prompt error:', err);
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}
