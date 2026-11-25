import { compressImageFileWithMeta, storeImageAsMediaRef } from './image';

export interface PhotoExifMetadata {
  takenDate: string; // YYYY-MM-DD in photo's captured calendar day
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

/**
 * Extracts YYYY-MM-DD directly from EXIF/ISO strings before Date conversion so photos captured
 * in Japan (UTC+9) don't shift calendar days when uploaded in another timezone (e.g. UTC-5 / UTC+8).
 */
function parseExifDateToYyyyMmDd(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === 'string') {
    const directMatch = val.trim().match(/^(\d{4})[-:/](\d{1,2})[-:/](\d{1,2})/);
    if (directMatch) {
      const y = Number(directMatch[1]);
      const m = Number(directMatch[2]);
      const d = Number(directMatch[3]);
      if (y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 1990 && parsed.getFullYear() <= 2100) {
      return toLocalYyyyMmDd(parsed);
    }
    return null;
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    if (val.getFullYear() >= 1990 && val.getFullYear() <= 2100) {
      return toLocalYyyyMmDd(val);
    }
  }
  return null;
}

/**
 * Extract capture date and GPS coordinates in a single exifr file pass.
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
    const exifrModule = await import('exifr/dist/lite.esm.js');
    const exifr = exifrModule.default || exifrModule;
    const parsed = await exifr
      .parse(file, {
        pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef'],
        gps: true,
      })
      .catch(() => null);

    if (parsed) {
      const candidate =
        parseExifDateToYyyyMmDd(parsed.DateTimeOriginal) ||
        parseExifDateToYyyyMmDd(parsed.CreateDate) ||
        parseExifDateToYyyyMmDd(parsed.ModifyDate);

      if (candidate) {
        takenDate = candidate;
        hasExifDate = true;
      }

      if (
        typeof parsed.latitude === 'number' &&
        typeof parsed.longitude === 'number' &&
        Number.isFinite(parsed.latitude) &&
        Number.isFinite(parsed.longitude) &&
        Math.abs(parsed.latitude) <= 90 &&
        Math.abs(parsed.longitude) <= 180 &&
        !(parsed.latitude === 0 && parsed.longitude === 0)
      ) {
        lat = Math.round(parsed.latitude * 1000000) / 1000000;
        lng = Math.round(parsed.longitude * 1000000) / 1000000;
        hasGps = true;
      }
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
 * Extract EXIF metadata and compress image with a SINGLE bitmap decode (cuts iOS RAM spike in half).
 */
export async function processPhotoWithExif(
  file: File,
  tripId: string
): Promise<ProcessedBatchPhoto> {
  const [exif, compressed] = await Promise.all([
    extractPhotoExifMetadata(file),
    compressImageFileWithMeta(file),
  ]);
  const mediaRef = await storeImageAsMediaRef(tripId, compressed.dataUrl);

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
    originalWidth: compressed.originalWidth || undefined,
    originalHeight: compressed.originalHeight || undefined,
    originalMimeType: file.type || undefined,
  };
}
