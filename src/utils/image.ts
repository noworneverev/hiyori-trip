import { Trip } from '../types/itinerary';
import { tryUploadToExternalImageHost } from './cloudImageHost';
import {
  MediaRecord,
  getMemoryCachedMedia,
  idbDeleteMediaBatch,
  idbGetAllMediaIds,
  idbGetAllTrips,
  idbGetMedia,
  idbSaveMedia,
  setMemoryCachedMedia,
} from './indexedDb';

/**
 * Client-side image utility for receipts, booking vouchers, spot photos, and attachments.
 * Supports single-decode EXIF orientation handling, white-canvas alpha fill, WebP-first
 * adaptive compression (< 200KB Base64 for 6,000-10,000+ photos inside Firestore 1GiB free tier),
 * optional Cloudflare R2 / Cloudinary CDN upload, content-deduplicated media:// offloading,
 * and authoritative IndexedDB GC.
 */

export const MEDIA_PREFIX = 'media://';
const MAX_IMAGE_FILE_BYTES = 25 * 1024 * 1024; // 25MB raw upload guard
const ALLOWED_IMAGE_EXT_REGEX = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;
const TARGET_BASE64_CHARS = 210000; // ~155 KB binary (~55% smaller than previous 350KB cap)

let cachedWebpSupport: boolean | null = null;
function supportsCanvasWebp(): boolean {
  if (cachedWebpSupport !== null) return cachedWebpSupport;
  if (typeof document === 'undefined') {
    cachedWebpSupport = false;
    return false;
  }
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    cachedWebpSupport = c.toDataURL('image/webp', 0.8).startsWith('data:image/webp');
  } catch {
    cachedWebpSupport = false;
  }
  return cachedWebpSupport;
}

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

export interface CompressedImageResult {
  dataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

function renderSourceToJpeg(
  source: ImageBitmap | HTMLImageElement,
  srcWidth: number,
  srcHeight: number,
  maxDimension: number,
  initialQuality: number
): CompressedImageResult {
  let width = Math.max(1, srcWidth);
  let height = Math.max(1, srcHeight);

  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.max(1, Math.round((height * maxDimension) / width));
      width = maxDimension;
    } else {
      width = Math.max(1, Math.round((width * maxDimension) / height));
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  let q = initialQuality;
  let dataUrl = '';
  const preferWebp = supportsCanvasWebp();

  try {
    // Iterative adaptive compression ensures every photo stays crisp (~80-150KB WebP)
    // and safely fits Firestore free-tier quotas & IndexedDB cleanly
    for (let attempt = 0; attempt < 4; attempt++) {
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) break;

      // White background prevents transparent PNG/WebP from turning solid black
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

      if (preferWebp) {
        const webpUrl = canvas.toDataURL('image/webp', q);
        const jpegUrl = webpUrl.length > TARGET_BASE64_CHARS ? canvas.toDataURL('image/jpeg', q) : '';
        dataUrl = jpegUrl && jpegUrl.length < webpUrl.length ? jpegUrl : webpUrl;
      } else {
        dataUrl = canvas.toDataURL('image/jpeg', q);
      }

      if (dataUrl.length <= TARGET_BASE64_CHARS || (width <= 640 && height <= 640)) {
        break;
      }
      width = Math.max(480, Math.round(width * 0.8));
      height = Math.max(480, Math.round(height * 0.8));
      q = Math.max(0.55, q - 0.08);
    }
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }

  return {
    dataUrl,
    width,
    height,
    originalWidth: srcWidth,
    originalHeight: srcHeight,
  };
}

/**
 * Single-decode image compression returning both the JPEG data URL and original dimensions
 * (prevents double 48MP bitmap RAM spikes on iOS Safari).
 */
export async function compressImageFileWithMeta(
  file: File,
  maxWidth = 1200,
  quality = 0.76
): Promise<CompressedImageResult> {
  const validationError = validateImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    let bitmap: ImageBitmap | null = null;
    try {
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch {
        bitmap = await createImageBitmap(file);
      }
      const result = renderSourceToJpeg(bitmap, bitmap.width, bitmap.height, maxWidth, quality);
      if (result.dataUrl) {
        return result;
      }
    } catch {
      // Fallback to HTMLImageElement
    } finally {
      if (bitmap) {
        try {
          bitmap.close();
        } catch {}
      }
    }
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const isHeic = /\.(heic|heif)$/i.test(file.name || '') || /heic|heif/i.test(file.type || '');
      reject(
        new Error(
          isHeic
            ? `瀏覽器不支援直接解碼 HEIC 檔案「${file.name}」，建議於 iOS Safari 上傳或先轉存為 JPG。`
            : `無法讀取圖片「${file.name}」，檔案可能已損毀或不支援該格式。`
        )
      );
    };

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;
      const result = renderSourceToJpeg(img, naturalW, naturalH, maxWidth, quality);
      img.src = '';
      if (!result.dataUrl) {
        reject(new Error(`圖片「${file.name}」處理失敗，請改選其他照片。`));
        return;
      }
      resolve(result);
    };

    img.src = objectUrl;
  });
}

export const compressImageFile = async (
  file: File,
  maxWidth = 1200,
  quality = 0.76
): Promise<string> => {
  const result = await compressImageFileWithMeta(file, maxWidth, quality);
  return result.dataUrl;
};

export async function getImageDimensions(
  file: File
): Promise<{ width: number; height: number } | null> {
  if (!file) return null;
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    let bitmap: ImageBitmap | null = null;
    try {
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch {
        bitmap = await createImageBitmap(file);
      }
      const dims = { width: bitmap.width, height: bitmap.height };
      if (dims.width > 0 && dims.height > 0) return dims;
    } catch {
      // Fallback to Image
    } finally {
      if (bitmap) {
        try {
          bitmap.close();
        } catch {}
      }
    }
  }
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims =
        img.width > 0 && img.height > 0 ? { width: img.width, height: img.height } : null;
      URL.revokeObjectURL(objectUrl);
      img.src = '';
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
}

export async function storeImageAsMediaRef(tripId: string, dataUrl: string): Promise<string> {
  if (!isInlineDataImage(dataUrl)) return dataUrl;

  // If user configured Cloudinary or Cloudflare R2 Worker, upload directly to CDN first
  const hostedUrl = await tryUploadToExternalImageHost(tripId, dataUrl);
  if (hostedUrl) {
    return hostedUrl;
  }

  const id = createMediaId();
  const mimeMatch = dataUrl.match(/^data:([^;]+);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/webp';
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
        const mimeMatch = remoteDataUrl.match(/^data:([^;]+);/);
        setMemoryCachedMedia(mediaId, remoteDataUrl);
        await idbSaveMedia({
          id: mediaId,
          tripId: hint?.tripId || 'remote',
          dataUrl: remoteDataUrl,
          mimeType: mimeMatch ? mimeMatch[1] : 'image/jpeg',
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
 * Offload any inline Base64 images inside a Trip into IndexedDB + deduplicate identical payloads
 * so JSON re-imports never duplicate spot & memory photos into two separate IDs.
 */
export async function extractInlineImagesToMediaRefs(
  trip: Trip
): Promise<{ trip: Trip; extractedRecords: MediaRecord[] }> {
  const extractedRecords: MediaRecord[] = [];
  const dedupMap = new Map<string, string>(); // exact dataUrl -> media://id
  let changed = false;

  const convertIfInline = async (src?: string): Promise<string | undefined> => {
    if (!src) return src;
    if (!isInlineDataImage(src)) return src;
    changed = true;
    const existingRef = dedupMap.get(src);
    if (existingRef) return existingRef;

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
    const ref = `${MEDIA_PREFIX}${id}`;
    dedupMap.set(src, ref);
    extractedRecords.push(rec);
    await idbSaveMedia(rec);
    return ref;
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

  const nextBookings = await Promise.all(
    (trip.bookings || []).map(async (b: any) => {
      if (!b?.voucherImages || !Array.isArray(b.voucherImages) || b.voucherImages.length === 0) {
        return b;
      }
      const list: string[] = [];
      for (const img of b.voucherImages) {
        const converted = await convertIfInline(img);
        if (converted) list.push(converted);
      }
      return { ...b, voucherImages: list };
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
      bookings: nextBookings,
    },
    extractedRecords,
  };
}

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

  const nextBookings = await Promise.all(
    (trip.bookings || []).map(async (b: any) => {
      if (!b?.voucherImages || !Array.isArray(b.voucherImages) || b.voucherImages.length === 0) {
        return b;
      }
      const hydrated = await Promise.all(
        b.voucherImages.map((img: string) => resolveOrKeep(img).then((v) => v || img))
      );
      return { ...b, voucherImages: hydrated };
    })
  );

  return {
    ...trip,
    days: nextDays,
    memories: nextMemories,
    expenses: nextExpenses,
    bookings: nextBookings,
  };
}

export function collectReferencedMediaIdsFromTrips(trips: Trip[]): Set<string> {
  const referenced = new Set<string>();
  const addRef = (src?: string | null) => {
    if (isMediaRef(src)) {
      const id = extractMediaId(src);
      if (id) referenced.add(id);
    }
  };

  (trips || []).forEach((trip) => {
    (trip.days || []).forEach((d) => {
      (d.items || []).forEach((it) => {
        (it.memoryPhotos || []).forEach(addRef);
      });
    });
    (trip.memories || []).forEach((m) => addRef(m.imageUrl));
    (trip.expenses || []).forEach((e) => {
      addRef(e.receiptImage);
      (e.receiptImages || []).forEach(addRef);
    });
    (trip.bookings || []).forEach((b: any) => {
      if (Array.isArray(b?.voucherImages)) {
        b.voucherImages.forEach(addRef);
      }
    });
  });

  return referenced;
}

/**
 * Authoritative IndexedDB media GC: merges caller's trips with IndexedDB's authoritative trip list
 * so stale/full localStorage can NEVER cause live receipts or memories to be deleted.
 */
export async function garbageCollectOrphanedMedia(
  trips: Trip[],
  excludeIds?: Iterable<string>
): Promise<number> {
  try {
    const allIds = await idbGetAllMediaIds();
    if (allIds.length === 0) return 0;

    // Combine authoritative IDB trips + caller trips (caller wins per ID) so no trip is ever missed
    const mergedById = new Map<string, Trip>();
    try {
      const idbTrips = await idbGetAllTrips();
      for (const t of idbTrips) {
        if (t?.id) mergedById.set(t.id, t);
      }
    } catch {}
    for (const t of trips || []) {
      if (t?.id) mergedById.set(t.id, t);
    }

    const referenced = collectReferencedMediaIdsFromTrips(Array.from(mergedById.values()));
    if (excludeIds) {
      for (const id of excludeIds) {
        if (id) referenced.add(extractMediaId(id));
      }
    }

    const orphans = allIds.filter((id) => !referenced.has(id));
    if (orphans.length > 0) {
      await idbDeleteMediaBatch(orphans);
    }
    return orphans.length;
  } catch (err) {
    console.warn('[Media GC] Cleanup skipped:', err);
    return 0;
  }
}

export async function rebindTripMediaIds(trip: Trip, newTripId: string): Promise<Trip> {
  const hint = { tripId: trip.id, ownerId: trip.ownerId, collabId: trip.collabId };
  const refMap = new Map<string, string>();

  const cloneRef = async (src?: string): Promise<string | undefined> => {
    if (!src) return src;
    if (!isMediaRef(src)) return src;
    if (refMap.has(src)) return refMap.get(src)!;

    const dataUrl = await resolveMediaSrc(src, hint);
    if (!dataUrl || !isInlineDataImage(dataUrl)) {
      return src;
    }
    const freshRef = await storeImageAsMediaRef(newTripId, dataUrl);
    refMap.set(src, freshRef);
    return freshRef;
  };

  const nextDays = await Promise.all(
    (trip.days || []).map(async (day) => ({
      ...day,
      items: await Promise.all(
        (day.items || []).map(async (item) => {
          if (!item.memoryPhotos || item.memoryPhotos.length === 0) return item;
          const nextPhotos = await Promise.all(
            item.memoryPhotos.map((p) => cloneRef(p).then((v) => v || p))
          );
          return { ...item, memoryPhotos: nextPhotos };
        })
      ),
    }))
  );

  const nextMemories = await Promise.all(
    (trip.memories || []).map(async (mem) => ({
      ...mem,
      imageUrl: (await cloneRef(mem.imageUrl)) || mem.imageUrl,
    }))
  );

  const nextExpenses = await Promise.all(
    (trip.expenses || []).map(async (exp) => {
      const nextReceiptImage = await cloneRef(exp.receiptImage);
      const nextReceiptImages = exp.receiptImages
        ? await Promise.all(exp.receiptImages.map((r) => cloneRef(r).then((v) => v || r)))
        : undefined;
      return {
        ...exp,
        ...(nextReceiptImage !== undefined ? { receiptImage: nextReceiptImage } : {}),
        ...(nextReceiptImages !== undefined ? { receiptImages: nextReceiptImages } : {}),
      };
    })
  );

  const nextBookings = await Promise.all(
    (trip.bookings || []).map(async (b: any) => {
      if (!b?.voucherImages || !Array.isArray(b.voucherImages) || b.voucherImages.length === 0) {
        return b;
      }
      const cloned = await Promise.all(
        b.voucherImages.map((img: string) => cloneRef(img).then((v) => v || img))
      );
      return { ...b, voucherImages: cloned };
    })
  );

  return {
    ...trip,
    id: newTripId,
    days: nextDays,
    memories: nextMemories,
    expenses: nextExpenses,
    bookings: nextBookings,
  };
}
