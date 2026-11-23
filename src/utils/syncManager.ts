import { Trip } from '../types/itinerary';
import {
  saveTripToCloud,
  deleteTripFromCloud,
  syncCollaborativeTrip,
  mergeSingleTrip,
  fetchUserTombstones,
} from './firebase';
import { getStoredTrips, saveTrips, getDeletedTripIds } from './storage';
import { idbGetSyncQueue, idbSaveSyncQueue } from './indexedDb';
import { convertAmount, detectTripCurrency } from './currency';

const QUEUE_STORAGE_KEY = 'hiyori_offline_sync_queue_v1';

export interface QueuedSyncItem {
  id: string;
  type: 'save_trip' | 'delete_trip' | 'sync_collab';
  userId?: string;
  trip?: Trip;
  tripId?: string;
  collabId?: string;
  editorName?: string;
  timestamp: number;
}

// Authoritative in-memory queue (prevents 5MB localStorage quota overflow from wiping IndexedDB queue)
let memoryQueue: QueuedSyncItem[] | null = null;
let queueHydratedFromIdb = false;
let flushInFlightPromise: Promise<{ successCount: number; failedCount: number }> | null = null;

function readLocalStorageQueue(): QueuedSyncItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getPendingQueueAsync(): Promise<QueuedSyncItem[]> {
  if (memoryQueue !== null && queueHydratedFromIdb) {
    return [...memoryQueue];
  }
  try {
    const idbQueue = await idbGetSyncQueue<QueuedSyncItem>();
    if (idbQueue !== null) {
      queueHydratedFromIdb = true;
      // Merge any items enqueued synchronously before IDB finished hydrating
      if (memoryQueue !== null && memoryQueue.length > 0) {
        const mergedMap = new Map<string, QueuedSyncItem>();
        idbQueue.forEach((it) => mergedMap.set(it.id, it));
        memoryQueue.forEach((it) => mergedMap.set(it.id, it));
        memoryQueue = Array.from(mergedMap.values()).slice(-30);
      } else {
        memoryQueue = idbQueue;
      }
      return [...memoryQueue];
    }
  } catch {}
  if (memoryQueue === null) {
    memoryQueue = readLocalStorageQueue();
  }
  return [...memoryQueue];
}

export function getPendingQueue(): QueuedSyncItem[] {
  if (memoryQueue !== null) {
    return [...memoryQueue];
  }
  memoryQueue = readLocalStorageQueue();
  return [...memoryQueue];
}

function setPendingQueue(queue: QueuedSyncItem[]): void {
  const capped = queue.slice(-30);
  memoryQueue = capped;
  queueHydratedFromIdb = true;
  idbSaveSyncQueue(capped).catch(() => {});
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // IndexedDB + memoryQueue remain authoritative if localStorage quota is full
  }
}

export function enqueueTripSave(userId: string, trip: Trip): void {
  const queue = getPendingQueue();
  const filtered = queue.filter(
    (item) => !(item.type === 'save_trip' && item.userId === userId && item.trip?.id === trip.id)
  );
  filtered.push({
    id: `save-${userId}-${trip.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'save_trip',
    userId,
    trip,
    timestamp: Date.now(),
  });
  setPendingQueue(filtered);
}

export function enqueueTripDelete(userId: string, tripId: string): void {
  const queue = getPendingQueue();
  const filtered = queue.filter(
    (item) => !(item.type === 'save_trip' && item.userId === userId && item.trip?.id === tripId)
  );
  filtered.push({
    id: `delete-${userId}-${tripId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'delete_trip',
    userId,
    tripId,
    timestamp: Date.now(),
  });
  setPendingQueue(filtered);
}

export async function removePendingTripSave(userId: string, tripId: string): Promise<void> {
  const queue = await getPendingQueueAsync();
  const filtered = queue.filter(
    (item) => !(item.type === 'save_trip' && item.userId === userId && item.trip?.id === tripId)
  );
  if (filtered.length !== queue.length) {
    setPendingQueue(filtered);
  }
}

export function enqueueCollabSync(collabId: string, trip: Trip, editorName?: string): void {
  const queue = getPendingQueue();
  const filtered = queue.filter(
    (item) => !(item.type === 'sync_collab' && item.collabId === collabId)
  );
  filtered.push({
    id: `collab-${collabId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'sync_collab',
    collabId,
    trip,
    editorName,
    timestamp: Date.now(),
  });
  setPendingQueue(filtered);
}

/**
 * Mutex-protected offline queue flusher.
 * Never drops tasks enqueued concurrently during async network I/O.
 */
export async function flushPendingSyncQueue(
  activeUserId?: string | null,
  cloudTombstones?: Record<string, number>
): Promise<{ successCount: number; failedCount: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { successCount: 0, failedCount: 0 };
  }
  if (!activeUserId) {
    return { successCount: 0, failedCount: 0 };
  }

  if (flushInFlightPromise) {
    return flushInFlightPromise;
  }

  flushInFlightPromise = (async () => {
    try {
      const snapshotQueue = await getPendingQueueAsync();
      if (snapshotQueue.length === 0) return { successCount: 0, failedCount: 0 };

      let effectiveTombstones: Record<string, number> = cloudTombstones || {};
      if (cloudTombstones === undefined) {
        try {
          const fetched = await fetchUserTombstones(activeUserId);
          if (fetched !== null) {
            effectiveTombstones = fetched;
          }
        } catch {
          effectiveTombstones = {};
        }
      }

      const TOMBSTONE_CLOCK_SKEW_MS = 15 * 60 * 1000;
      const isCloudTombstoned = (tripId: string, updatedAt = 0) => {
        const deletedAt = effectiveTombstones?.[tripId];
        return typeof deletedAt === 'number' && deletedAt + TOMBSTONE_CLOCK_SKEW_MS >= updatedAt;
      };

      const completedOrDroppedIds = new Set<string>();
      let successCount = 0;
      let failedCount = 0;
      const syncedTimestamps: Record<string, number> = {};

      const deletedIds = new Set(getDeletedTripIds());
      const queuedDeleteIds = new Set(
        snapshotQueue
          .filter((q) => q.type === 'delete_trip' && q.userId === activeUserId && q.tripId)
          .map((q) => q.tripId as string)
      );

      for (const item of snapshotQueue) {
        if ((item.type === 'save_trip' || item.type === 'delete_trip') && item.userId !== activeUserId) {
          continue;
        }

        try {
          if (item.type === 'save_trip' && item.userId && item.trip) {
            if (
              deletedIds.has(item.trip.id) ||
              queuedDeleteIds.has(item.trip.id) ||
              isCloudTombstoned(item.trip.id, item.trip.updatedAt || 0)
            ) {
              completedOrDroppedIds.add(item.id);
              continue;
            }
            const saved = await saveTripToCloud(item.userId, item.trip);
            syncedTimestamps[item.trip.id] = Math.max(
              Date.now(),
              saved.lastSyncedAt || item.trip.updatedAt || 0
            );
            completedOrDroppedIds.add(item.id);
            successCount++;
          } else if (item.type === 'delete_trip' && item.userId && item.tripId) {
            await deleteTripFromCloud(item.userId, item.tripId);
            completedOrDroppedIds.add(item.id);
            successCount++;
          } else if (item.type === 'sync_collab' && item.collabId && item.trip) {
            if (
              deletedIds.has(item.trip.id) ||
              queuedDeleteIds.has(item.trip.id) ||
              isCloudTombstoned(item.trip.id, item.trip.updatedAt || 0)
            ) {
              completedOrDroppedIds.add(item.id);
              continue;
            }
            await syncCollaborativeTrip(item.collabId, item.trip, item.editorName);
            completedOrDroppedIds.add(item.id);
            successCount++;
          }
        } catch (err) {
          console.warn('Failed to process offline sync item, keeping in queue:', item.id, err);
          failedCount++;
        }
      }

      // Preserve any new items enqueued mid-flush; only remove exact IDs completed or dropped above
      if (completedOrDroppedIds.size > 0) {
        const latestQueue = getPendingQueue();
        const nextQueue = latestQueue.filter((it) => !completedOrDroppedIds.has(it.id));
        setPendingQueue(nextQueue);
      }

      if (Object.keys(syncedTimestamps).length > 0) {
        const stored = getStoredTrips();
        let changed = false;
        const updated = stored.map((tr) => {
          const ts = syncedTimestamps[tr.id];
          if (ts && (tr.lastSyncedAt || 0) < ts) {
            changed = true;
            return { ...tr, lastSyncedAt: ts };
          }
          return tr;
        });
        if (changed) {
          saveTrips(updated);
        }
      }

      return { successCount, failedCount };
    } finally {
      flushInFlightPromise = null;
    }
  })();

  return flushInFlightPromise;
}

export interface TripConflictSummary {
  spotCount: number;
  todoCount: number;
  packingCount: number;
  expenseCount: number;
  expenseTotal: number;
  updatedAt: number;
  formattedDate: string;
}

export interface TripConflict {
  tripId: string;
  tripTitle: string;
  destination: string;
  localTrip: Trip;
  cloudTrip: Trip;
  localSummary: TripConflictSummary;
  cloudSummary: TripConflictSummary;
  detectedAt: number;
  newerVersion: 'local' | 'cloud' | 'equal';
  timeDiffMinutes: number;
}

export function formatConflictTimestamp(ts?: number): string {
  if (!ts) return '未知時間';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '未知時間';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function summarizeTripForConflict(trip: Trip): TripConflictSummary {
  const spotCount = (trip.days || []).reduce((acc, d) => acc + (d.items || []).length, 0);
  const todoCount = (trip.todos || []).length;
  const packingCount = (trip.packingList || []).length;
  const expenseCount = (trip.expenses || []).length;
  const baseCur = trip.currency || detectTripCurrency(trip);
  const expenseTotal = (trip.expenses || []).reduce(
    (sum, e) =>
      sum +
      convertAmount(
        e.amount || 0,
        e.currency || baseCur,
        baseCur,
        trip.customExchangeRates
      ),
    0
  );
  return {
    spotCount,
    todoCount,
    packingCount,
    expenseCount,
    expenseTotal,
    updatedAt: trip.updatedAt || 0,
    formattedDate: formatConflictTimestamp(trip.updatedAt),
  };
}

function stableContentSignature(trip: Trip): string {
  const normalized = {
    title: trip.title || '',
    destination: trip.destination || '',
    startDate: trip.startDate || '',
    endDate: trip.endDate || '',
    currency: trip.currency || '',
    budgetTotal: trip.budgetTotal || 0,
    notes: trip.notes || '',
    coverGradient: trip.coverGradient || '',
    tripMode: trip.tripMode || 'planner',
    destinationLat: trip.destinationLat ?? null,
    destinationLng: trip.destinationLng ?? null,
    isSoloTrip: Boolean(trip.isSoloTrip),
    isSplitEnabled: Boolean(trip.isSplitEnabled),
    splitMembers: trip.splitMembers || [],
    initialCashAmount: trip.initialCashAmount ?? null,
    initialCashCurrency: trip.initialCashCurrency ?? null,
    customExchangeRates: trip.customExchangeRates || {},
    customExpenseCategories: trip.customExpenseCategories || [],
    customCategoryLabels: trip.customCategoryLabels || {},
    customExpenseTags: trip.customExpenseTags || [],
    googlePhotosAlbumUrl: trip.googlePhotosAlbumUrl || '',
    driveFolderId: trip.driveFolderId || '',
    generalAccess: trip.generalAccess || 'restricted',
    collaborators: trip.collaborators || [],
    days: trip.days || [],
    todos: trip.todos || [],
    packingList: trip.packingList || [],
    expenses: trip.expenses || [],
    bookings: trip.bookings || [],
    memories: trip.memories || [],
    stickyNotes: trip.stickyNotes || [],
    emergencyContacts: trip.emergencyContacts || [],
    deletedItemIds: trip.deletedItemIds || {},
  };
  return JSON.stringify(normalized);
}

/**
 * Deep substantive comparison ignoring volatile metadata (`updatedAt`, `lastSyncedAt`).
 */
export function hasTripContentDifference(a: Trip, b: Trip): boolean {
  return stableContentSignature(a) !== stableContentSignature(b);
}

export async function resolveTripConflict(
  conflict: TripConflict,
  strategy: 'keep_local' | 'keep_cloud' | 'smart_merge',
  userId?: string | null
): Promise<Trip> {
  let resolvedTrip: Trip;

  if (strategy === 'keep_local') {
    resolvedTrip = {
      ...conflict.localTrip,
      updatedAt: Date.now(),
    };
  } else if (strategy === 'keep_cloud') {
    resolvedTrip = {
      ...conflict.cloudTrip,
    };
  } else {
    const merged = mergeSingleTrip(conflict.localTrip, conflict.cloudTrip);
    resolvedTrip = {
      ...merged,
      updatedAt: Date.now(),
    };
  }

  const currentTrips = getStoredTrips();
  const updatedTrips = currentTrips.map((t) => (t.id === resolvedTrip.id ? resolvedTrip : t));
  saveTrips(updatedTrips);

  if (strategy !== 'keep_cloud') {
    if (userId && !(resolvedTrip.isCollaborative && resolvedTrip.ownerId && resolvedTrip.ownerId !== userId)) {
      saveTripToCloud(userId, resolvedTrip).catch((err) => {
        console.warn('Conflict resolution cloud save failed, enqueued:', err);
        enqueueTripSave(userId, resolvedTrip);
      });
    }

    if (resolvedTrip.collabId && resolvedTrip.isCollaborative) {
      syncCollaborativeTrip(resolvedTrip.collabId, resolvedTrip).catch((err) => {
        console.warn('Conflict resolution collab sync failed, enqueued:', err);
        enqueueCollabSync(resolvedTrip.collabId!, resolvedTrip);
      });
    }
  }

  return resolvedTrip;
}

/**
 * Tombstone-aware bi-directional merge between local trips and cloud trips.
 * Protects collaborative/shared trips from false auto-deletion and merges concurrent edits safely.
 */
export function mergeTrips(
  localTrips: Trip[],
  cloudTrips: Trip[],
  cloudTombstones: Record<string, number> = {},
  isServerAuthoritative = true,
  activeUserId?: string,
  pendingSaveIds?: Set<string>
): {
  merged: Trip[];
  tripsToUpload: Trip[];
  deletedLocalTripIds: string[];
  conflicts: TripConflict[];
} {
  const tripsToUpload: Trip[] = [];
  const deletedLocalTripIds: string[] = [];
  const conflicts: TripConflict[] = [];
  const mergedMap = new Map<string, Trip>();
  const localDeletedIds = new Set(getDeletedTripIds());

  const TOMBSTONE_CLOCK_SKEW_MS = 15 * 60 * 1000;
  const isTombstoned = (tripId: string, updatedAt = 0) => {
    if (localDeletedIds.has(tripId)) return true;
    const cloudDeletedAt = cloudTombstones[tripId];
    return typeof cloudDeletedAt === 'number' && cloudDeletedAt + TOMBSTONE_CLOCK_SKEW_MS >= updatedAt;
  };

  const validCloudTrips = (cloudTrips || []).filter((c) => !isTombstoned(c.id, c.updatedAt || 0));
  const validLocalTrips = (localTrips || []).filter((l) => !isTombstoned(l.id, l.updatedAt || 0));
  const hasCloudHistory = validCloudTrips.length > 0 || Object.keys(cloudTombstones || {}).length > 0;

  for (const lTrip of localTrips || []) {
    if (isTombstoned(lTrip.id, lTrip.updatedAt || 0)) {
      deletedLocalTripIds.push(lTrip.id);
    }
  }

  for (const cTrip of validCloudTrips) {
    mergedMap.set(cTrip.id, cTrip);
  }

  for (const lTrip of validLocalTrips) {
    const existing = mergedMap.get(lTrip.id);
    if (!existing) {
      // Never auto-delete read-only imported share trips or another owner's collaborative trip
      // just because they are not stored inside users/{activeUserId}/trips!
      const isExternalShareOrCollab =
        lTrip.id.startsWith('imported-share_') ||
        Boolean(lTrip.isCollaborative && lTrip.ownerId && activeUserId && lTrip.ownerId !== activeUserId);
      if (isExternalShareOrCollab) {
        mergedMap.set(lTrip.id, lTrip);
        continue;
      }

      if (isServerAuthoritative && lTrip.lastSyncedAt) {
        deletedLocalTripIds.push(lTrip.id);
        continue;
      }

      if (
        isServerAuthoritative &&
        hasCloudHistory &&
        lTrip.id === 'preset-hokuriku-chubu-9days' &&
        (lTrip.updatedAt || 0) <= 1728518400000
      ) {
        deletedLocalTripIds.push(lTrip.id);
        continue;
      }

      if (
        isServerAuthoritative &&
        hasCloudHistory &&
        activeUserId &&
        lTrip.ownerId === activeUserId &&
        !pendingSaveIds?.has(lTrip.id)
      ) {
        deletedLocalTripIds.push(lTrip.id);
        continue;
      }

      mergedMap.set(lTrip.id, lTrip);
      tripsToUpload.push(lTrip);
    } else {
      const localUpdated = lTrip.updatedAt || 0;
      const cloudUpdated = existing.updatedAt || 0;
      const lastSynced = lTrip.lastSyncedAt || 0;
      const timeDiffMs = Math.abs(localUpdated - cloudUpdated);
      const hasDiff = hasTripContentDifference(lTrip, existing);

      if (!hasDiff) {
        mergedMap.set(lTrip.id, existing);
        continue;
      }

      const bothDivergedSinceSync =
        lastSynced > 0 &&
        localUpdated > lastSynced + 2000 &&
        cloudUpdated > lastSynced + 2000 &&
        timeDiffMs > 2000;

      const divergedWithoutBaseline =
        !lTrip.id.startsWith('preset-') &&
        lastSynced === 0 &&
        localUpdated > 0 &&
        cloudUpdated > 0 &&
        timeDiffMs > 2000;

      if (bothDivergedSinceSync || divergedWithoutBaseline) {
        const localSummary = summarizeTripForConflict(lTrip);
        const cloudSummary = summarizeTripForConflict(existing);
        const newerVersion =
          localUpdated > cloudUpdated ? 'local' : cloudUpdated > localUpdated ? 'cloud' : 'equal';
        const timeDiffMinutes = Math.max(1, Math.round(timeDiffMs / (1000 * 60)));

        conflicts.push({
          tripId: lTrip.id,
          tripTitle: lTrip.title,
          destination: lTrip.destination,
          localTrip: lTrip,
          cloudTrip: existing,
          localSummary,
          cloudSummary,
          detectedAt: Date.now(),
          newerVersion,
          timeDiffMinutes,
        });
        mergedMap.set(lTrip.id, lTrip);
      } else if (lastSynced > 0 && localUpdated > lastSynced && cloudUpdated > lastSynced) {
        // Both modified within the short 2s window: smart-merge instead of silently dropping local edits!
        const mergedTrip =
          localUpdated >= cloudUpdated
            ? mergeSingleTrip(lTrip, existing)
            : mergeSingleTrip(existing, lTrip);
        mergedMap.set(lTrip.id, mergedTrip);
        tripsToUpload.push(mergedTrip);
      } else if (cloudUpdated > localUpdated) {
        mergedMap.set(lTrip.id, existing);
      } else {
        const mergedTrip = mergeSingleTrip(lTrip, existing);
        mergedMap.set(lTrip.id, mergedTrip);
        tripsToUpload.push(mergedTrip);
      }
    }
  }

  const merged = Array.from(mergedMap.values());
  return { merged, tripsToUpload, deletedLocalTripIds, conflicts };
}
