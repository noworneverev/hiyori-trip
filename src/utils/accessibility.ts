/**
 * Accessibility Utility: Typography & Display Scaling Engine
 * Supports 3 text scale tiers aligned strictly with src/index.css:
 * - normal (100%): Standard layout
 * - comfortable (110%): Enlarged text for comfortable reading
 * - senior (122%): Extra large text with enhanced contrast
 */

export type AccessibilityScale = 'normal' | 'comfortable' | 'senior';

export interface AccessibilityOption {
  id: AccessibilityScale;
  label: string;
  badge: string;
  description: string;
  multiplier: number;
}

export const ACCESSIBILITY_OPTIONS: AccessibilityOption[] = [
  {
    id: 'normal',
    label: '標準',
    badge: '100%',
    description: '預設文字大小',
    multiplier: 1.0,
  },
  {
    id: 'comfortable',
    label: '放大',
    badge: '110%',
    description: '字體適度放大，閱讀輕鬆',
    multiplier: 1.1,
  },
  {
    id: 'senior',
    label: '特大',
    badge: '122%',
    description: '特大字體與高對比顯示',
    multiplier: 1.22,
  },
];

const STORAGE_KEY = 'hiyori_accessibility_scale_v1';

export function getSavedAccessibilityScale(): AccessibilityScale {
  if (typeof window === 'undefined') return 'normal';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'normal' || saved === 'comfortable' || saved === 'senior') {
      return saved;
    }
  } catch (e) {
    console.warn('Failed to read accessibility scale:', e);
  }
  return 'normal';
}

export function applyAccessibilityScale(scale: AccessibilityScale): void {
  if (typeof document === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, scale);
  } catch (e) {
    console.warn('Failed to save accessibility scale:', e);
  }

  document.documentElement.setAttribute('data-text-scale', scale);

  const option = ACCESSIBILITY_OPTIONS.find((o) => o.id === scale) || ACCESSIBILITY_OPTIONS[0];
  document.documentElement.style.setProperty('--app-font-multiplier', String(option.multiplier));

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('accessibility_scale_changed', { detail: { scale } })
    );
  }
}

export function initAccessibilityScale(): AccessibilityScale {
  const scale = getSavedAccessibilityScale();
  applyAccessibilityScale(scale);
  return scale;
}
