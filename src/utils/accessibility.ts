/**
 * Accessibility Utility: Typography & Display Scaling Engine
 * Supports 3 text scale tiers:
 * - normal (100%): Standard layout
 * - comfortable (115%): Enlarged text for comfortable reading
 * - senior (130%): Extra large text with enhanced contrast
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
    badge: '115%',
    description: '字體適度放大，閱讀輕鬆',
    multiplier: 1.15,
  },
  {
    id: 'senior',
    label: '特大',
    badge: '130%',
    description: '特大字體與高對比顯示',
    multiplier: 1.3,
  },
];

const STORAGE_KEY = 'hiyori_accessibility_scale_v1';

/**
 * Retrieve saved accessibility scale from LocalStorage
 */
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

/**
 * Apply accessibility scale to document root and persist preference
 */
export function applyAccessibilityScale(scale: AccessibilityScale): void {
  if (typeof document === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, scale);
  } catch (e) {
    console.warn('Failed to save accessibility scale:', e);
  }

  // Set attribute on <html> root element for CSS selectors
  document.documentElement.setAttribute('data-text-scale', scale);

  // Set CSS custom properties for fluid typography
  const option = ACCESSIBILITY_OPTIONS.find((o) => o.id === scale) || ACCESSIBILITY_OPTIONS[0];
  document.documentElement.style.setProperty('--app-font-multiplier', String(option.multiplier));

  // Dispatch custom event for React components that need to re-render or adjust layout
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('accessibility_scale_changed', { detail: { scale } })
    );
  }
}

/**
 * Initialize accessibility scale on app startup
 */
export function initAccessibilityScale(): AccessibilityScale {
  const scale = getSavedAccessibilityScale();
  applyAccessibilityScale(scale);
  return scale;
}
