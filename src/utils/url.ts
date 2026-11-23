/**
 * Strict URL protocol allowlist for external user-provided links.
 * Blocks dangerous schemes like javascript:, data:, vbscript:, file:, and rejects relative paths.
 */
export function isSafeExternalUrl(url?: string): boolean {
  return Boolean(sanitizeExternalUrl(url));
}

export function sanitizeExternalUrl(url?: string): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  try {
    let candidate = '';
    if (/^https?:\/\//i.test(trimmed)) {
      candidate = trimmed;
    } else if (trimmed.startsWith('//')) {
      // Reject protocol-relative tricks like //javascript:alert(1)
      if (/^\/\/[a-z][a-z0-9+.-]*:/i.test(trimmed)) return undefined;
      candidate = `https:${trimmed}`;
    } else {
      return undefined;
    }
    const parsed = new URL(candidate);
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname &&
      !parsed.hostname.includes(':')
    ) {
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
 * Preserves port when rewriting ais-dev- preview hosts and strips trailing /index.html.
 */
export function getPublicShareBaseUrl(): string {
  if (typeof window === 'undefined') return '';

  const hostname = window.location.hostname;
  const portSuffix = window.location.port ? `:${window.location.port}` : '';
  const rawPath = window.location.pathname || '/';
  const cleanPath = rawPath.replace(/\/index\.html$/i, '/');

  if (hostname.includes('ais-dev-')) {
    const publicHost = hostname.replace('ais-dev-', 'ais-pre-');
    return `${window.location.protocol}//${publicHost}${portSuffix}${cleanPath}`;
  }

  return `${window.location.origin}${cleanPath}`;
}
