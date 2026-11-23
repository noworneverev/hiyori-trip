/**
 * Optional zero-cost / commercial Cloud Image Host adapter for Hiyori PWA.
 * Supports:
 * - 'default': Local IndexedDB + Firestore compressed WebP sync (zero config)
 * - 'cloudinary': Cloudinary Free Tier (unsigned upload preset, auto CDN WebP/AVIF)
 * - 'r2': Cloudflare R2 via a lightweight Cloudflare Worker endpoint (10 GB free, $0 egress)
 *
 * Configuration can be supplied via Vite env vars or overridden in SettingsModal (localStorage).
 */

export type CloudImageProvider = 'default' | 'cloudinary' | 'r2';

export interface CloudImageHostConfig {
  provider: CloudImageProvider;
  cloudinaryCloudName: string;
  cloudinaryUploadPreset: string;
  r2UploadEndpoint: string;
  r2AuthToken: string;
}

const STORAGE_KEY = 'hiyori_cloud_image_host_v1';

function getEnvDefaultConfig(): CloudImageHostConfig {
  const env = (import.meta as any)?.env || {};
  const cloudName = String(env.VITE_CLOUDINARY_CLOUD_NAME || '').trim();
  const uploadPreset = String(env.VITE_CLOUDINARY_UPLOAD_PRESET || '').trim();
  const r2Endpoint = String(env.VITE_R2_UPLOAD_ENDPOINT || '').trim();
  const r2Token = String(env.VITE_R2_AUTH_TOKEN || '').trim();

  let provider: CloudImageProvider = 'default';
  if (r2Endpoint) {
    provider = 'r2';
  } else if (cloudName && uploadPreset) {
    provider = 'cloudinary';
  }

  return {
    provider,
    cloudinaryCloudName: cloudName,
    cloudinaryUploadPreset: uploadPreset,
    r2UploadEndpoint: r2Endpoint,
    r2AuthToken: r2Token,
  };
}

export function getCloudImageHostConfig(): CloudImageHostConfig {
  const envDefaults = getEnvDefaultConfig();
  if (typeof window === 'undefined') return envDefaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return envDefaults;
    const parsed = JSON.parse(raw);
    const provider: CloudImageProvider =
      parsed.provider === 'cloudinary' || parsed.provider === 'r2' ? parsed.provider : 'default';
    return {
      provider,
      cloudinaryCloudName: String(parsed.cloudinaryCloudName ?? envDefaults.cloudinaryCloudName ?? '').trim(),
      cloudinaryUploadPreset: String(parsed.cloudinaryUploadPreset ?? envDefaults.cloudinaryUploadPreset ?? '').trim(),
      r2UploadEndpoint: String(parsed.r2UploadEndpoint ?? envDefaults.r2UploadEndpoint ?? '').trim(),
      r2AuthToken: String(parsed.r2AuthToken ?? envDefaults.r2AuthToken ?? '').trim(),
    };
  } catch {
    return envDefaults;
  }
}

export function saveCloudImageHostConfig(config: CloudImageHostConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        provider: config.provider,
        cloudinaryCloudName: config.cloudinaryCloudName.trim(),
        cloudinaryUploadPreset: config.cloudinaryUploadPreset.trim(),
        r2UploadEndpoint: config.r2UploadEndpoint.trim(),
        r2AuthToken: config.r2AuthToken.trim(),
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function isExternalCloudImageHostReady(config = getCloudImageHostConfig()): boolean {
  if (config.provider === 'cloudinary') {
    return Boolean(config.cloudinaryCloudName && config.cloudinaryUploadPreset);
  }
  if (config.provider === 'r2') {
    return /^https?:\/\//i.test(config.r2UploadEndpoint);
  }
  return false;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:([^;]+);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * Attempts to upload a compressed image dataUrl to the configured external cloud host
 * (Cloudinary or Cloudflare R2 Worker). Returns a public HTTPS URL on success,
 * or null if unconfigured / offline / upload fails (allowing seamless local+Firestore fallback).
 */
export async function tryUploadToExternalImageHost(
  tripId: string,
  dataUrl: string
): Promise<string | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return null;
  }
  const config = getCloudImageHostConfig();
  if (!isExternalCloudImageHostReady(config)) {
    return null;
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);

  try {
    if (config.provider === 'cloudinary') {
      const formData = new FormData();
      formData.append('file', dataUrl);
      formData.append('upload_preset', config.cloudinaryUploadPreset);
      formData.append('folder', `hiyori-trip/${(tripId || 'local').replace(/[^a-zA-Z0-9_-]/g, '')}`);

      const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudinaryCloudName)}/image/upload`;
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const payload = await res.json();
      if (typeof payload?.secure_url === 'string' && payload.secure_url.startsWith('https://')) {
        // Inject Cloudinary automatic format & quality optimization for fast mobile loading
        return payload.secure_url.replace('/upload/', '/upload/f_auto,q_auto,w_1440,c_limit/');
      }
      return null;
    }

    if (config.provider === 'r2') {
      const blob = dataUrlToBlob(dataUrl);
      const ext = blob.type.includes('webp') ? 'webp' : 'jpg';
      const formData = new FormData();
      formData.append('file', blob, `hiyori_${Date.now()}.${ext}`);
      formData.append('tripId', tripId || 'local');

      const headers: Record<string, string> = {};
      if (config.r2AuthToken) {
        headers['Authorization'] = `Bearer ${config.r2AuthToken}`;
      }

      const res = await fetch(config.r2UploadEndpoint, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const payload = await res.json().catch(() => null);
      const url = payload?.url || payload?.publicUrl || payload?.secure_url;
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
        return url;
      }
      return null;
    }

    return null;
  } catch (err) {
    console.warn('[CloudImageHost] External upload failed, falling back to local media ref:', err);
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}
