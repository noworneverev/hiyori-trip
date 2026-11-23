import { useState, useEffect, useCallback } from 'react';

const DARK_KEY = 'hiyori_theme_dark';
const LEGACY_DARK_KEY = 'wayfarer_theme_dark';

function readExplicitPreference(): boolean | null {
  try {
    const saved = localStorage.getItem(DARK_KEY) ?? localStorage.getItem(LEGACY_DARK_KEY);
    if (saved === 'true') return true;
    if (saved === 'false') return false;
  } catch {}
  return null;
}

export function useDarkMode() {
  const [explicitPref, setExplicitPref] = useState<boolean | null>(() => readExplicitPreference());
  const [systemDark, setSystemDark] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const isDark = explicitPref !== null ? explicitPref : systemDark;

  // Follow OS appearance changes automatically whenever user hasn't forced an override
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    setSystemDark(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const themeColor = isDark ? '#090D16' : '#FAF9F6';

    if (isDark) {
      root.classList.add('dark');
      root.style.backgroundColor = '#090D16';
      root.style.colorScheme = 'dark';
      if (body) {
        body.style.backgroundColor = '#090D16';
        body.style.colorScheme = 'dark';
      }
    } else {
      root.classList.remove('dark');
      root.style.backgroundColor = '#FAF9F6';
      root.style.colorScheme = 'light';
      if (body) {
        body.style.backgroundColor = '#FAF9F6';
        body.style.colorScheme = 'light';
      }
    }

    // Update theme-color meta tags (ensures iOS Safari / PWA status bar & Dynamic Island match active theme)
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.removeAttribute('media');
      meta.setAttribute('content', themeColor);
    });
  }, [isDark]);

  const toggleDarkMode = useCallback(() => {
    setExplicitPref((prev) => {
      const next = prev !== null ? !prev : !systemDark;
      try {
        localStorage.setItem(DARK_KEY, String(next));
      } catch {}
      return next;
    });
  }, [systemDark]);

  const resetToSystemTheme = useCallback(() => {
    try {
      localStorage.removeItem(DARK_KEY);
      localStorage.removeItem(LEGACY_DARK_KEY);
    } catch {}
    setExplicitPref(null);
  }, []);

  return { isDark, isFollowingSystem: explicitPref === null, toggleDarkMode, resetToSystemTheme };
}
