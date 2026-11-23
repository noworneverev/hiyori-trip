import { Trip } from '../types/itinerary';

const DB_NAME = 'hiyori_db_v1';
const DB_VERSION = 1;

const STORE_TRIPS = 'trips';
const STORE_MEDIA = 'media';
const STORE_SYNC_QUEUE = 'sync_queue';
const STORE_META = 'meta';

const MAX_MEDIA_CACHE_ENTRIES = 64;
const WARM_MEDIA_LIMIT = 12;

export interface MediaRecord {
  id: string;
  tripId: string;
  dataUrl: string;
  mimeType: string;
  byteSize: number;
  createdAt: number;
}

export interface TombstoneMap {
  [id: string]: number;
}

// Bounded LRU RAM cache so resolved media:// images render instantly without risking iOS Safari OOM crashes
const memoryMediaCache = new Map<string, string>();

export function getMemoryCachedMedia(mediaId: string): string | undefined {
  const hit = memoryMediaCache.get(mediaId);
  if (hit !== undefined) {
    // Promote to most-recently-used
    memoryMediaCache.delete(mediaId);
    memoryMediaCache.set(mediaId, hit);
  }
  return hit;
}

export function setMemoryCachedMedia(mediaId: string, dataUrl: string): void {
  if (!mediaId || !dataUrl) return;
  if (memoryMediaCache.has(mediaId)) {
    memoryMediaCache.delete(mediaId);
  } else if (memoryMediaCache.size >= MAX_MEDIA_CACHE_ENTRIES) {
    const oldestKey = memoryMediaCache.keys().next().value;
    if (oldestKey !== undefined) {
      memoryMediaCache.delete(oldestKey);
    }
  }
  memoryMediaCache.set(mediaId, dataUrl);
}

export function clearMemoryMediaCache(): void {
  memoryMediaCache.clear();
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
let tripsWriteChain: Promise<void> = Promise.resolve();
let queueWriteChain: Promise<void> = Promise.resolve();

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_TRIPS)) {
          db.createObjectStore(STORE_TRIPS, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(STORE_MEDIA)) {
          const mediaStore = db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
          mediaStore.createIndex('tripId', 'tripId', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
          db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        // Crucial on iOS Safari PWA: OS may close idle IDB connections on backgrounding
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        console.warn('[IndexedDB] Failed to open database, falling back:', request.error);
        dbPromise = null;
        resolve(null);
      };

      request.onblocked = () => {
        console.warn('[IndexedDB] Database upgrade blocked by another tab.');
        dbPromise = null;
        resolve(null);
      };
    } catch (err) {
      console.warn('[IndexedDB] Unavailable:', err);
      dbPromise = null;
      resolve(null);
    }
  });

  return dbPromise;
}

function runTx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | null> {
  return new Promise(async (resolve) => {
    const db = await openDatabase();
    if (!db) {
      resolve(null);
      return;
    }

    let settled = false;
    const finish = (val: T | null) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };

    try {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req = executor(store);
      let reqResult: T | null = null;

      if (req) {
        req.onsuccess = () => {
          reqResult = (req.result as T) ?? null;
          if (mode === 'readonly') {
            finish(reqResult);
          }
        };
        req.onerror = () => {
          console.warn(`[IndexedDB] Request error on ${storeName}:`, req.error);
          finish(null);
        };
      }

      // For readwrite transactions, wait until commit (tx.oncomplete) so QuotaExceededError aborts are caught accurately
      tx.oncomplete = () => finish(reqResult);
      tx.onerror = () => {
        console.warn(`[IndexedDB] Transaction error on ${storeName}:`, tx.error);
        finish(null);
      };
      tx.onabort = () => {
        console.warn(`[IndexedDB] Transaction aborted on ${storeName}:`, tx.error);
        finish(null);
      };
    } catch (err: any) {
      if (err?.name === 'InvalidStateError') {
        dbPromise = null;
      }
      console.warn(`[IndexedDB] Exception on ${storeName}:`, err);
      finish(null);
    }
  });
}

// ---------- Trips Store ----------

export async function idbGetAllTrips(): Promise<Trip[]> {
  const result = await runTx<Trip[]>(STORE_TRIPS, 'readonly', (store) => store.getAll());
  return Array.isArray(result) ? result : [];
}

export function idbSaveAllTrips(trips: Trip[]): Promise<void> {
  const snapshot = (trips || []).filter((t) => Boolean(t && t.id));
  tripsWriteChain = tripsWriteChain
    .then(async () => {
      const db = await openDatabase();
      if (!db) return;

      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_TRIPS, 'readwrite');
          const store = tx.objectStore(STORE_TRIPS);
          store.clear();
          for (const t of snapshot) {
            store.put(t);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => {
            console.warn('[IndexedDB] Failed to save trips batch:', tx.error);
            resolve();
          };
          tx.onabort = () => {
            console.warn('[IndexedDB] Save trips batch aborted:', tx.error);
            resolve();
          };
        } catch (err: any) {
          if (err?.name === 'InvalidStateError') dbPromise = null;
          console.warn('[IndexedDB] Save trips exception:', err);
          resolve();
        }
      });
    })
    .catch(() => {});

  return tripsWriteChain;
}

export async function idbPutTrip(trip: Trip): Promise<void> {
  if (!trip || !trip.id) return;
  await runTx(STORE_TRIPS, 'readwrite', (store) => store.put(trip));
}

export async function idbDeleteTrip(tripId: string): Promise<void> {
  if (!tripId) return;
  await runTx(STORE_TRIPS, 'readwrite', (store) => store.delete(tripId));
}

// ---------- Media Store ----------

export async function idbSaveMedia(record: MediaRecord): Promise<boolean> {
  if (!record || !record.id || !record.dataUrl) return false;
  setMemoryCachedMedia(record.id, record.dataUrl);
  const res = await runTx(STORE_MEDIA, 'readwrite', (store) => store.put(record));
  return res !== null;
}

export async function idbGetMedia(mediaId: string): Promise<MediaRecord | null> {
  if (!mediaId) return null;
  const rec = await runTx<MediaRecord>(STORE_MEDIA, 'readonly', (store) => store.get(mediaId));
  if (rec?.dataUrl) {
    setMemoryCachedMedia(mediaId, rec.dataUrl);
  }
  return rec;
}

export async function idbGetMediaByTrip(tripId: string): Promise<MediaRecord[]> {
  const db = await openDatabase();
  if (!db || !tripId) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_MEDIA, 'readonly');
      const store = tx.objectStore(STORE_MEDIA);
      const index = store.index('tripId');
      const req = index.getAll(IDBKeyRange.only(tripId));
      req.onsuccess = () => {
        const list = Array.isArray(req.result) ? (req.result as MediaRecord[]) : [];
        // Warm up to a bounded slice only to keep memory tight
        for (const rec of list.slice(0, WARM_MEDIA_LIMIT)) {
          if (rec?.id && rec?.dataUrl) {
            setMemoryCachedMedia(rec.id, rec.dataUrl);
          }
        }
        resolve(list);
      };
      req.onerror = () => resolve([]);
      tx.onabort = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function idbDeleteMedia(mediaId: string): Promise<void> {
  if (!mediaId) return;
  memoryMediaCache.delete(mediaId);
  await runTx(STORE_MEDIA, 'readwrite', (store) => store.delete(mediaId));
}

export async function idbDeleteMediaByTrip(tripId: string): Promise<void> {
  const records = await idbGetMediaByTrip(tripId);
  if (records.length === 0) return;
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_MEDIA, 'readwrite');
      const store = tx.objectStore(STORE_MEDIA);
      for (const rec of records) {
        memoryMediaCache.delete(rec.id);
        store.delete(rec.id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function idbGetAllMediaIds(): Promise<string[]> {
  const keys = await runTx<IDBValidKey[]>(STORE_MEDIA, 'readonly', (store) => store.getAllKeys());
  if (!Array.isArray(keys)) return [];
  return keys.map((k) => String(k)).filter(Boolean);
}

export async function idbDeleteMediaBatch(mediaIds: string[]): Promise<void> {
  if (!mediaIds || mediaIds.length === 0) return;
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_MEDIA, 'readwrite');
      const store = tx.objectStore(STORE_MEDIA);
      for (const id of mediaIds) {
        if (!id) continue;
        memoryMediaCache.delete(id);
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Lightly warms only up to WARM_MEDIA_LIMIT records using a cursor (preventing iOS Safari OOM on startup).
 */
export async function idbWarmMediaCache(): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_MEDIA, 'readonly');
      const store = tx.objectStore(STORE_MEDIA);
      const req = store.openCursor();
      let warmed = 0;

      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor || warmed >= WARM_MEDIA_LIMIT) {
          resolve();
          return;
        }
        const rec = cursor.value as MediaRecord;
        if (rec?.id && rec?.dataUrl) {
          setMemoryCachedMedia(rec.id, rec.dataUrl);
          warmed++;
        }
        cursor.continue();
      };
      req.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Streams media sizes via cursor so computing storage usage never allocates every photo into RAM at once.
 */
export async function idbGetStorageStats(): Promise<{
  totalBytes: number;
  mediaCount: number;
  tripsCount: number;
}> {
  const trips = await idbGetAllTrips();
  const tripsBytes = new Blob([JSON.stringify(trips || [])]).size;

  const db = await openDatabase();
  if (!db) {
    return { totalBytes: tripsBytes, mediaCount: 0, tripsCount: trips.length };
  }

  const mediaStats = await new Promise<{ count: number; bytes: number }>((resolve) => {
    try {
      const tx = db.transaction(STORE_MEDIA, 'readonly');
      const store = tx.objectStore(STORE_MEDIA);
      const req = store.openCursor();
      let count = 0;
      let bytes = 0;

      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve({ count, bytes });
          return;
        }
        const rec = cursor.value as MediaRecord;
        count++;
        bytes += rec?.byteSize || (rec?.dataUrl ? rec.dataUrl.length : 0);
        cursor.continue();
      };
      req.onerror = () => resolve({ count: 0, bytes: 0 });
      tx.onabort = () => resolve({ count: 0, bytes: 0 });
    } catch {
      resolve({ count: 0, bytes: 0 });
    }
  });

  return {
    totalBytes: tripsBytes + mediaStats.bytes,
    mediaCount: mediaStats.count,
    tripsCount: trips.length,
  };
}

// ---------- Sync Queue Store ----------

export async function idbGetSyncQueue<T = any>(): Promise<T[] | null> {
  const res = await runTx<T[]>(STORE_SYNC_QUEUE, 'readonly', (store) => store.getAll());
  return Array.isArray(res) ? res : null;
}

export function idbSaveSyncQueue<T extends { id: string }>(items: T[]): Promise<void> {
  const snapshot = (items || []).filter((item) => Boolean(item && item.id));
  queueWriteChain = queueWriteChain
    .then(async () => {
      const db = await openDatabase();
      if (!db) return;

      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_SYNC_QUEUE, 'readwrite');
          const store = tx.objectStore(STORE_SYNC_QUEUE);
          store.clear();
          for (const item of snapshot) {
            store.put(item);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        } catch (err: any) {
          if (err?.name === 'InvalidStateError') dbPromise = null;
          resolve();
        }
      });
    })
    .catch(() => {});

  return queueWriteChain;
}

// ---------- Meta Store (Tombstones & Flags) ----------

export async function idbGetMeta<T = any>(key: string): Promise<T | null> {
  const rec = await runTx<{ key: string; value: T }>(STORE_META, 'readonly', (store) =>
    store.get(key)
  );
  return rec ? rec.value : null;
}

export async function idbSetMeta<T = any>(key: string, value: T): Promise<void> {
  await runTx(STORE_META, 'readwrite', (store) => store.put({ key, value }));
}

export async function idbClearAll(): Promise<void> {
  clearMemoryMediaCache();
  const db = await openDatabase();
  if (!db) return;

  const stores = [STORE_TRIPS, STORE_MEDIA, STORE_SYNC_QUEUE, STORE_META];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(stores, 'readwrite');
      stores.forEach((s) => tx.objectStore(s).clear());
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
