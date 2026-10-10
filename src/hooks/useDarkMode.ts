import { useState, useEffect } from 'react';

const DARK_KEY = 'wayfarer_theme_dark';

export function useDarkMode() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(DARK_KEY);
      if (saved !== null) {
        return saved === 'true';
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const themeColor = isDark ? '#020617' : '#ffffff';

    if (isDark) {
      root.classList.add('dark');
      root.style.backgroundColor = '#020617';
      root.style.colorScheme = 'dark';
      if (body) {
        body.style.backgroundColor = '#020617';
        body.style.colorScheme = 'dark';
      }
      try {
        localStorage.setItem(DARK_KEY, 'true');
      } catch {}
    } else {
      root.classList.remove('dark');
      root.style.backgroundColor = '#f8fafc';
      root.style.colorScheme = 'light';
      if (body) {
        body.style.backgroundColor = '#f8fafc';
        body.style.colorScheme = 'light';
      }
      try {
        localStorage.setItem(DARK_KEY, 'false');
      } catch {}
    }

    // Force update all theme-color meta tags for iOS Safari PWA Dynamic Island / Notch / Status Bar
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.setAttribute('content', themeColor);
    });

    const statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (statusBarMeta) {
      statusBarMeta.setAttribute('content', isDark ? 'black-translucent' : 'default');
    }
  }, [isDark]);

  const toggleDarkMode = () => setIsDark((prev) => !prev);

  return { isDark, toggleDarkMode };
}
