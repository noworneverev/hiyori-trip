/**
 * Strict URL protocol allowlist for external user-provided links.
 * Blocks dangerous schemes like javascript:, data:, vbscript:, file:.
 */
export function isSafeExternalUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed, 'https://placeholder.invalid');
    // Only allow explicit http(s) URLs; reject relative paths without explicit http/https
    if (trimmed.startsWith('//')) return true;
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeExternalUrl(url?: string): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  try {
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : trimmed.startsWith('//') ? `https:${trimmed}` : '';
    if (!candidate) return undefined;
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function sanitizeTelHref(phone?: string): string {
  if (!phone || typeof phone !== 'string') return '#';
  const cleaned = phone.replace(/[^\d+\-*#,;() ]/g, '').trim();
  if (!cleaned || !/\d/.test(cleaned)) return '#';
  return `tel:${cleaned.replace(/\s+/g, '')}`;
}

/**
 * Resolves the public share base URL dynamically from the current deployment host.
 * Converts AI Studio 'ais-dev-...' preview URLs into public 'ais-pre-...' links
 * while supporting GitHub Pages subpaths and localhost cleanly.
 */
export function getPublicShareBaseUrl(): string {
  if (typeof window === 'undefined') return '';

  const hostname = window.location.hostname;
  const cleanPath = window.location.pathname || '/';

  if (hostname.includes('ais-dev-')) {
    const publicHost = hostname.replace('ais-dev-', 'ais-pre-');
    return `${window.location.protocol}//${publicHost}${cleanPath}`;
  }

  return `${window.location.origin}${cleanPath}`;
}
