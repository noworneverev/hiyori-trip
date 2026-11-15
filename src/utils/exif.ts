import { compressImageFile, getImageDimensions, storeImageAsMediaRef } from './image';

export interface PhotoExifMetadata {
  takenDate: string; // YYYY-MM-DD (EXIF DateTimeOriginal/CreateDate or fallback file.lastModified)
  hasExifDate: boolean;
  lat?: number;
  lng?: number;
  hasGps: boolean;
}

export interface ProcessedBatchPhoto {
  id: string;
  fileName: string;
  mediaRef: string;
  takenDate: string;
  hasExifDate: boolean;
  lat?: number;
  lng?: number;
  hasGps: boolean;
  rawFile?: File;
  originalBytes?: number;
  originalWidth?: number;
  originalHeight?: number;
  originalMimeType?: string;
}

function toLocalYyyyMmDd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseExifDateCandidate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val;
  }
  if (typeof val === 'string') {
    // Handle standard EXIF format "YYYY:MM:DD HH:MM:SS"
    const exifMatch = val.trim().match(/^(\d{4}):(\d{2}):(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
    if (exifMatch) {
      const d = new Date(
        Number(exifMatch[1]),
        Number(exifMatch[2]) - 1,
        Number(exifMatch[3]),
        Number(exifMatch[4] || 12),
        Number(exifMatch[5] || 0),
        Number(exifMatch[6] || 0)
      );
      if (!isNaN(d.getTime())) return d;
    }
    const isoParsed = new Date(val);
    if (!isNaN(isoParsed.getTime())) return isoParsed;
  }
  return null;
}

/**
 * Extract capture date and GPS coordinates purely client-side using exifr.
 * Never throws on EXIF-stripped or unsupported files; gracefully falls back to file.lastModified.
 */
export async function extractPhotoExifMetadata(file: File): Promise<PhotoExifMetadata> {
  const fallbackDate = file.lastModified
    ? toLocalYyyyMmDd(new Date(file.lastModified))
    : toLocalYyyyMmDd(new Date());

  let takenDate = fallbackDate;
  let hasExifDate = false;
  let lat: number | undefined;
  let lng: number | undefined;
  let hasGps = false;

  try {
    const exifrModule = await import('exifr');
    const exifr = exifrModule.default || exifrModule;
    const [tags, gps] = await Promise.all([
      exifr.parse(file, ['DateTimeOriginal', 'CreateDate', 'ModifyDate']).catch(() => null),
      exifr.gps(file).catch(() => null),
    ]);

    if (tags) {
      const candidate =
        parseExifDateCandidate(tags.DateTimeOriginal) ||
        parseExifDateCandidate(tags.CreateDate) ||
        parseExifDateCandidate(tags.ModifyDate);

      if (candidate && candidate.getFullYear() >= 1990 && candidate.getFullYear() <= 2100) {
        takenDate = toLocalYyyyMmDd(candidate);
        hasExifDate = true;
      }
    }

    if (
      gps &&
      typeof gps.latitude === 'number' &&
      typeof gps.longitude === 'number' &&
      Number.isFinite(gps.latitude) &&
      Number.isFinite(gps.longitude) &&
      Math.abs(gps.latitude) <= 90 &&
      Math.abs(gps.longitude) <= 180 &&
      !(gps.latitude === 0 && gps.longitude === 0)
    ) {
      lat = Math.round(gps.latitude * 1000000) / 1000000;
      lng = Math.round(gps.longitude * 1000000) / 1000000;
      hasGps = true;
    }
  } catch {
    // Graceful fallback without failing photo upload
  }

  return {
    takenDate,
    hasExifDate,
    lat,
    lng,
    hasGps,
  };
}

/**
 * Extract EXIF metadata, compress image for cloud/IndexedDB efficiency, and offload to media:// reference.
 */
export async function processPhotoWithExif(
  file: File,
  tripId: string
): Promise<ProcessedBatchPhoto> {
  const [exif, compressed, dims] = await Promise.all([
    extractPhotoExifMetadata(file),
    compressImageFile(file),
    getImageDimensions(file),
  ]);
  const mediaRef = await storeImageAsMediaRef(tripId, compressed);

  return {
    id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName: file.name,
    mediaRef,
    takenDate: exif.takenDate,
    hasExifDate: exif.hasExifDate,
    lat: exif.lat,
    lng: exif.lng,
    hasGps: exif.hasGps,
    rawFile: file,
    originalBytes: file.size || undefined,
    originalWidth: dims?.width,
    originalHeight: dims?.height,
    originalMimeType: file.type || undefined,
  };
}
