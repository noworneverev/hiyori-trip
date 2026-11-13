import { Trip } from '../types/itinerary';

const DB_NAME = 'hiyori_db_v1';
const DB_VERSION = 1;

const STORE_TRIPS = 'trips';
const STORE_MEDIA = 'media';
const STORE_SYNC_QUEUE = 'sync_queue';
const STORE_META = 'meta';

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

// Fast synchronous RAM cache so resolved media:// images render instantly without flicker
const memoryMediaCache = new Map<string, string>();
const inflightListeners = new Set<() => void>();

export function getMemoryCachedMedia(mediaId: string): string | undefined {
  return memoryMediaCache.get(mediaId);
}

export function setMemoryCachedMedia(mediaId: string, dataUrl: string): void {
  if (!mediaId || !dataUrl) return;
  memoryMediaCache.set(mediaId, dataUrl);
}

export function clearMemoryMediaCache(): void {
  memoryMediaCache.clear();
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

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
        resolve(db);
      };

      request.onerror = () => {
        console.warn('[IndexedDB] Failed to open database, falling back:', request.error);
        dbPromise = null;
        resolve(null);
      };

      request.onblocked = () => {
        console.warn('[IndexedDB] Database upgrade blocked by another tab.');
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

    try {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req = executor(store);

      if (req) {
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => {
          console.warn(`[IndexedDB] Request error on ${storeName}:`, req.error);
          resolve(null);
        };
      } else {
        tx.oncomplete = () => resolve(null);
        tx.onerror = () => {
          console.warn(`[IndexedDB] Transaction error on ${storeName}:`, tx.error);
          resolve(null);
        };
      }
    } catch (err) {
      console.warn(`[IndexedDB] Exception on ${storeName}:`, err);
      resolve(null);
    }
  });
}

// ---------- Trips Store ----------

export async function idbGetAllTrips(): Promise<Trip[]> {
  const result = await runTx<Trip[]>(STORE_TRIPS, 'readonly', (store) => store.getAll());
  return Array.isArray(result) ? result : [];
}

export async function idbSaveAllTrips(trips: Trip[]): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_TRIPS, 'readwrite');
      const store = tx.objectStore(STORE_TRIPS);
      store.clear();
      for (const t of trips) {
        if (t && t.id) {
          store.put(t);
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        console.warn('[IndexedDB] Failed to save trips batch:', tx.error);
        resolve();
      };
    } catch (err) {
      console.warn('[IndexedDB] Save trips exception:', err);
      resolve();
    }
  });
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

export async function idbSaveMedia(record: MediaRecord): Promise<void> {
  if (!record || !record.id || !record.dataUrl) return;
  setMemoryCachedMedia(record.id, record.dataUrl);
  await runTx(STORE_MEDIA, 'readwrite', (store) => store.put(record));
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
        for (const rec of list) {
          if (rec?.id && rec?.dataUrl) {
            setMemoryCachedMedia(rec.id, rec.dataUrl);
          }
        }
        resolve(list);
      };
      req.onerror = () => resolve([]);
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
    } catch {
      resolve();
    }
  });
}

export async function idbWarmMediaCache(): Promise<void> {
  const all = await runTx<MediaRecord[]>(STORE_MEDIA, 'readonly', (store) => store.getAll());
  if (Array.isArray(all)) {
    for (const rec of all) {
      if (rec?.id && rec?.dataUrl) {
        setMemoryCachedMedia(rec.id, rec.dataUrl);
      }
    }
    inflightListeners.forEach((cb) => cb());
  }
}

export async function idbGetStorageStats(): Promise<{ totalBytes: number; mediaCount: number; tripsCount: number }> {
  const [trips, media] = await Promise.all([
    idbGetAllTrips(),
    runTx<MediaRecord[]>(STORE_MEDIA, 'readonly', (store) => store.getAll()),
  ]);

  const tripsBytes = new Blob([JSON.stringify(trips || [])]).size;
  const mediaList = Array.isArray(media) ? media : [];
  const mediaBytes = mediaList.reduce((sum, m) => sum + (m.byteSize || 0), 0);
  return {
    totalBytes: tripsBytes + mediaBytes,
    mediaCount: mediaList.length,
    tripsCount: trips.length,
  };
}

// ---------- Sync Queue Store ----------

export async function idbGetSyncQueue<T = any>(): Promise<T[]> {
  const res = await runTx<T[]>(STORE_SYNC_QUEUE, 'readonly', (store) => store.getAll());
  return Array.isArray(res) ? res : [];
}

export async function idbSaveSyncQueue<T extends { id: string }>(items: T[]): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_SYNC_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_SYNC_QUEUE);
      store.clear();
      for (const item of items) {
        if (item && item.id) {
          store.put(item);
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ---------- Meta Store (Tombstones & Flags) ----------

export async function idbGetMeta<T = any>(key: string): Promise<T | null> {
  const rec = await runTx<{ key: string; value: T }>(STORE_META, 'readonly', (store) => store.get(key));
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
    } catch {
      resolve();
    }
  });
}
