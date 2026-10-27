/**
 * Resolves the public share base URL for AI Studio preview apps.
 * In AI Studio, 'ais-dev-...' domains require developer workspace authentication
 * and cannot be opened on mobile devices or by external guests without login.
 * The corresponding 'ais-pre-...' domain is the public preview URL accessible
 * to any mobile browser or guest with zero login required.
 */
export function getPublicShareBaseUrl(): string {
  const FALLBACK_PUBLIC_URL = 'https://ais-pre-nn72dhbkshijlrk4ksqlrd-660220013431.asia-northeast1.run.app';
  
  if (typeof window === 'undefined') return FALLBACK_PUBLIC_URL;

  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return FALLBACK_PUBLIC_URL;
  }

  if (hostname.includes('ais-dev-')) {
    const publicHost = hostname.replace('ais-dev-', 'ais-pre-');
    return `${window.location.protocol}//${publicHost}${window.location.pathname}`;
  }

  return `${window.location.origin}${window.location.pathname}`;
}
