import { Trip } from '../types/itinerary';
import {
  MediaRecord,
  getMemoryCachedMedia,
  idbGetMedia,
  idbSaveMedia,
  setMemoryCachedMedia,
} from './indexedDb';

/**
 * Client-side image utility for receipts, travel spot check-in photos, and attachments.
 * Supports MIME/size validation, Retina-crisp adaptive JPEG compression, and media:// reference offloading.
 */

export const MEDIA_PREFIX = 'media://';
const MAX_IMAGE_FILE_BYTES = 25 * 1024 * 1024; // 25MB raw upload guard
const ALLOWED_IMAGE_EXT_REGEX = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;

export type CloudMediaResolverFn = (
  mediaId: string,
  hint?: { tripId?: string; ownerId?: string; collabId?: string }
) => Promise<string | null>;

let registeredCloudMediaResolver: CloudMediaResolverFn | null = null;

export function registerCloudMediaResolver(fn: CloudMediaResolverFn): void {
  registeredCloudMediaResolver = fn;
}

export function isMediaRef(src?: string | null): src is string {
  return typeof src === 'string' && src.startsWith(MEDIA_PREFIX);
}

export function extractMediaId(src: string): string {
  return src.startsWith(MEDIA_PREFIX) ? src.slice(MEDIA_PREFIX.length) : src;
}

export function createMediaId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `m_${ts}_${rand}`;
}

export function isInlineDataImage(src?: string | null): src is string {
  return typeof src === 'string' && src.startsWith('data:image/');
}

export function getCachedMediaDisplaySrc(src?: string | null): string {
  if (!src) return '';
  if (!isMediaRef(src)) return src;
  const mediaId = extractMediaId(src);
  return getMemoryCachedMedia(mediaId) || '';
}

export function validateImageFile(file: File): string | null {
  if (!file) {
    return '未選取任何檔案';
  }
  const hasImageMime = Boolean(file.type && file.type.startsWith('image/'));
  const hasImageExt = ALLOWED_IMAGE_EXT_REGEX.test(file.name || '');
  if (!hasImageMime && !hasImageExt) {
    return `檔案「${file.name}」不是有效的圖片格式，請選擇 JPG、PNG 或 WebP 圖片。`;
  }
  if (file.size > MAX_IMAGE_FILE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `圖片「${file.name}」過大（${mb} MB），請選擇 25MB 以內的相片。`;
  }
  return null;
}

export const compressImageFile = async (
  file: File,
  maxWidth = 960,
  quality = 0.72
): Promise<string> => {
  const validationError = validateImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const renderToJpeg = (
    source: ImageBitmap | HTMLImageElement,
    srcWidth: number,
    srcHeight: number,
    maxDimension: number,
    q: number
  ): string => {
    let width = srcWidth;
    let height = srcHeight;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    let dataUrl = canvas.toDataURL('image/jpeg', q);

    // Keep individual media doc compact (~<= 150KB Base64) for fast sync & subcollection efficiency
    if (dataUrl.length > 180000) {
      const secondWidth = Math.max(1, Math.round(canvas.width * 0.78));
      const secondHeight = Math.max(1, Math.round(canvas.height * 0.78));
      canvas.width = secondWidth;
      canvas.height = secondHeight;
      const ctx2 = canvas.getContext('2d');
      if (ctx2) {
        ctx2.imageSmoothingEnabled = true;
        ctx2.imageSmoothingQuality = 'high';
        ctx2.drawImage(source, 0, 0, secondWidth, secondHeight);
        dataUrl = canvas.toDataURL('image/jpeg', Math.max(0.55, q - 0.12));
      }
    }

    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  };

  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      const dataUrl = renderToJpeg(bitmap, bitmap.width, bitmap.height, maxWidth, quality);
      bitmap.close();
      if (dataUrl) return dataUrl;
    } catch {
      // Fallback to URL.createObjectURL
    }
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`無法讀取圖片「${file.name}」，檔案可能已損毀或不支援該格式（如部分 HEIC 檔）。`));
    };

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const dataUrl = renderToJpeg(img, img.width, img.height, maxWidth, quality);
      img.src = '';
      if (!dataUrl) {
        reject(new Error(`圖片「${file.name}」處理失敗，請改選其他照片。`));
        return;
      }
      resolve(dataUrl);
    };

    img.src = objectUrl;
  });
};

/**
 * Store a compressed dataUrl into IndexedDB + RAM cache and return a lightweight media:// reference
 */
export async function storeImageAsMediaRef(tripId: string, dataUrl: string): Promise<string> {
  if (!isInlineDataImage(dataUrl)) return dataUrl;
  const id = createMediaId();
  const mimeMatch = dataUrl.match(/^data:([^;]+);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const record: MediaRecord = {
    id,
    tripId: tripId || 'global',
    dataUrl,
    mimeType,
    byteSize: dataUrl.length,
    createdAt: Date.now(),
  };
  await idbSaveMedia(record);
  return `${MEDIA_PREFIX}${id}`;
}

/**
 * Resolve any src (media://, data:, https:) to a renderable URL using RAM -> IndexedDB -> Cloud Subcollection
 */
export async function resolveMediaSrc(
  src: string,
  hint?: { tripId?: string; ownerId?: string; collabId?: string }
): Promise<string> {
  if (!src) return '';
  if (!isMediaRef(src)) return src;

  const mediaId = extractMediaId(src);
  const ramHit = getMemoryCachedMedia(mediaId);
  if (ramHit) return ramHit;

  const idbRec = await idbGetMedia(mediaId);
  if (idbRec?.dataUrl) {
    setMemoryCachedMedia(mediaId, idbRec.dataUrl);
    return idbRec.dataUrl;
  }

  if (registeredCloudMediaResolver) {
    try {
      const remoteDataUrl = await registeredCloudMediaResolver(mediaId, hint);
      if (remoteDataUrl) {
        setMemoryCachedMedia(mediaId, remoteDataUrl);
        await idbSaveMedia({
          id: mediaId,
          tripId: hint?.tripId || 'remote',
          dataUrl: remoteDataUrl,
          mimeType: 'image/jpeg',
          byteSize: remoteDataUrl.length,
          createdAt: Date.now(),
        });
        return remoteDataUrl;
      }
    } catch (err) {
      console.warn('[Media] Cloud media fetch failed:', mediaId, err);
    }
  }

  return '';
}

/**
 * Offload any inline Base64 images inside a Trip into IndexedDB + return lightweight media:// Trip + MediaRecords
 */
export async function extractInlineImagesToMediaRefs(
  trip: Trip
): Promise<{ trip: Trip; extractedRecords: MediaRecord[] }> {
  const extractedRecords: MediaRecord[] = [];
  let changed = false;

  const convertIfInline = async (src?: string): Promise<string | undefined> => {
    if (!src) return src;
    if (!isInlineDataImage(src)) return src;
    changed = true;
    const id = createMediaId();
    const mimeMatch = src.match(/^data:([^;]+);/);
    const rec: MediaRecord = {
      id,
      tripId: trip.id,
      dataUrl: src,
      mimeType: mimeMatch ? mimeMatch[1] : 'image/jpeg',
      byteSize: src.length,
      createdAt: Date.now(),
    };
    extractedRecords.push(rec);
    await idbSaveMedia(rec);
    return `${MEDIA_PREFIX}${id}`;
  };

  const nextDays = await Promise.all(
    (trip.days || []).map(async (day) => {
      if (!day.items || day.items.length === 0) return day;
      const nextItems = await Promise.all(
        day.items.map(async (item) => {
          if (!item.memoryPhotos || item.memoryPhotos.length === 0) return item;
          const nextPhotos: string[] = [];
          for (const p of item.memoryPhotos) {
            const converted = await convertIfInline(p);
            if (converted) nextPhotos.push(converted);
          }
          return { ...item, memoryPhotos: nextPhotos };
        })
      );
      return { ...day, items: nextItems };
    })
  );

  const nextMemories = await Promise.all(
    (trip.memories || []).map(async (mem) => {
      const converted = await convertIfInline(mem.imageUrl);
      if (converted && converted !== mem.imageUrl) {
        return { ...mem, imageUrl: converted };
      }
      return mem;
    })
  );

  const nextExpenses = await Promise.all(
    (trip.expenses || []).map(async (exp) => {
      const nextReceiptImage = await convertIfInline(exp.receiptImage);
      let nextReceiptImages = exp.receiptImages;
      if (exp.receiptImages && exp.receiptImages.length > 0) {
        const list: string[] = [];
        for (const r of exp.receiptImages) {
          const converted = await convertIfInline(r);
          if (converted) list.push(converted);
        }
        nextReceiptImages = list;
      }
      return {
        ...exp,
        ...(nextReceiptImage !== undefined ? { receiptImage: nextReceiptImage } : {}),
        ...(nextReceiptImages !== undefined ? { receiptImages: nextReceiptImages } : {}),
      };
    })
  );

  if (!changed) {
    return { trip, extractedRecords: [] };
  }

  return {
    trip: {
      ...trip,
      days: nextDays,
      memories: nextMemories,
      expenses: nextExpenses,
    },
    extractedRecords,
  };
}

/**
 * Hydrate all media:// references in a Trip back into full data URLs for JSON export
 */
export async function hydrateTripMediaForExport(trip: Trip): Promise<Trip> {
  const hint = { tripId: trip.id, ownerId: trip.ownerId, collabId: trip.collabId };

  const resolveOrKeep = async (src?: string): Promise<string | undefined> => {
    if (!src) return src;
    if (!isMediaRef(src)) return src;
    const resolved = await resolveMediaSrc(src, hint);
    return resolved || src;
  };

  const nextDays = await Promise.all(
    (trip.days || []).map(async (day) => ({
      ...day,
      items: await Promise.all(
        (day.items || []).map(async (item) => {
          if (!item.memoryPhotos || item.memoryPhotos.length === 0) return item;
          const nextPhotos = await Promise.all(
            item.memoryPhotos.map((p) => resolveOrKeep(p).then((v) => v || p))
          );
          return { ...item, memoryPhotos: nextPhotos };
        })
      ),
    }))
  );

  const nextMemories = await Promise.all(
    (trip.memories || []).map(async (mem) => ({
      ...mem,
      imageUrl: (await resolveOrKeep(mem.imageUrl)) || mem.imageUrl,
    }))
  );

  const nextExpenses = await Promise.all(
    (trip.expenses || []).map(async (exp) => {
      const nextReceiptImage = await resolveOrKeep(exp.receiptImage);
      const nextReceiptImages = exp.receiptImages
        ? await Promise.all(exp.receiptImages.map((r) => resolveOrKeep(r).then((v) => v || r)))
        : undefined;
      return {
        ...exp,
        ...(nextReceiptImage !== undefined ? { receiptImage: nextReceiptImage } : {}),
        ...(nextReceiptImages !== undefined ? { receiptImages: nextReceiptImages } : {}),
      };
    })
  );

  return {
    ...trip,
    days: nextDays,
    memories: nextMemories,
    expenses: nextExpenses,
  };
}
