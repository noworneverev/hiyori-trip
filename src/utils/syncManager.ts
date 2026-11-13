import { Trip } from '../types/itinerary';
import { saveTripToCloud, deleteTripFromCloud, syncCollaborativeTrip, mergeSingleTrip } from './firebase';
import { getStoredTrips, saveTrips, getDeletedTripIds } from './storage';
import { idbGetSyncQueue, idbSaveSyncQueue } from './indexedDb';

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

/**
 * Retrieve current pending sync queue (IndexedDB primary, localStorage fallback)
 */
export async function getPendingQueueAsync(): Promise<QueuedSyncItem[]> {
  try {
    const idbQueue = await idbGetSyncQueue<QueuedSyncItem>();
    if (idbQueue && idbQueue.length > 0) {
      return idbQueue;
    }
  } catch {
    // Fallback to localStorage
  }
  return getPendingQueue();
}

export function getPendingQueue(): QueuedSyncItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Error reading offline sync queue:', e);
    return [];
  }
}

/**
 * Save pending sync queue to both IndexedDB and localStorage fallback
 */
function setPendingQueue(queue: QueuedSyncItem[]): void {
  const capped = queue.slice(-30);
  idbSaveSyncQueue(capped).catch(() => {});
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(capped));
  } catch (e) {
    console.warn('localStorage queue mirror skipped:', e);
  }
}

/**
 * Enqueue or update a pending trip save operation (scoped to userId)
 */
export function enqueueTripSave(userId: string, trip: Trip): void {
  const queue = getPendingQueue();
  const filtered = queue.filter(
    (item) => !(item.type === 'save_trip' && item.userId === userId && item.trip?.id === trip.id)
  );
  filtered.push({
    id: `save-${userId}-${trip.id}-${Date.now()}`,
    type: 'save_trip',
    userId,
    trip,
    timestamp: Date.now(),
  });
  setPendingQueue(filtered);
}

/**
 * Enqueue a pending trip delete operation (scoped to userId)
 */
export function enqueueTripDelete(userId: string, tripId: string): void {
  const queue = getPendingQueue();
  const filtered = queue.filter(
    (item) => !(item.type === 'save_trip' && item.userId === userId && item.trip?.id === tripId)
  );
  filtered.push({
    id: `delete-${userId}-${tripId}-${Date.now()}`,
    type: 'delete_trip',
    userId,
    tripId,
    timestamp: Date.now(),
  });
  setPendingQueue(filtered);
}

/**
 * Enqueue a collaborative trip sync
 */
export function enqueueCollabSync(collabId: string, trip: Trip, editorName?: string): void {
  const queue = getPendingQueue();
  const filtered = queue.filter(
    (item) => !(item.type === 'sync_collab' && item.collabId === collabId)
  );
  filtered.push({
    id: `collab-${collabId}-${Date.now()}`,
    type: 'sync_collab',
    collabId,
    trip,
    editorName,
    timestamp: Date.now(),
  });
  setPendingQueue(filtered);
}

/**
 * Flush pending offline sync tasks scoped to activeUserId when online
 */
export async function flushPendingSyncQueue(
  activeUserId?: string | null
): Promise<{ successCount: number; failedCount: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { successCount: 0, failedCount: 0 };
  }

  const queue = await getPendingQueueAsync();
  if (queue.length === 0) return { successCount: 0, failedCount: 0 };

  const remaining: QueuedSyncItem[] = [];
  let successCount = 0;
  let failedCount = 0;

  for (const item of queue) {
    // Keep another user's queued operations untouched until that account signs in
    if ((item.type === 'save_trip' || item.type === 'delete_trip') && item.userId !== activeUserId) {
      remaining.push(item);
      continue;
    }

    if (item.type === 'sync_collab' && !activeUserId) {
      remaining.push(item);
      continue;
    }

    try {
      if (item.type === 'save_trip' && item.userId && item.trip) {
        await saveTripToCloud(item.userId, item.trip);
        successCount++;
      } else if (item.type === 'delete_trip' && item.userId && item.tripId) {
        await deleteTripFromCloud(item.userId, item.tripId);
        successCount++;
      } else if (item.type === 'sync_collab' && item.collabId && item.trip) {
        await syncCollaborativeTrip(item.collabId, item.trip, item.editorName);
        successCount++;
      }
    } catch (err) {
      console.warn('Failed to process offline sync item, keeping in queue:', item, err);
      remaining.push(item);
      failedCount++;
    }
  }

  setPendingQueue(remaining);
  return { successCount, failedCount };
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
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  const secs = pad(d.getSeconds());
  return `${year}/${month}/${day} ${hours}:${mins}:${secs}`;
}

export function summarizeTripForConflict(trip: Trip): TripConflictSummary {
  const spotCount = (trip.days || []).reduce((acc, d) => acc + (d.items || []).length, 0);
  const todoCount = (trip.todos || []).length;
  const packingCount = (trip.packingList || []).length;
  const expenseCount = (trip.expenses || []).length;
  const expenseTotal = (trip.expenses || []).reduce(
    (sum, e) => sum + (e.convertedAmount || e.amount || 0),
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

/**
 * Deeply compares two trips for substantive differences across schedule, checklists, expenses, permissions & photos.
 */
export function hasTripContentDifference(a: Trip, b: Trip): boolean {
  if ((a.updatedAt || 0) !== (b.updatedAt || 0)) {
    return true;
  }

  const aSummary = summarizeTripForConflict(a);
  const bSummary = summarizeTripForConflict(b);

  if (
    aSummary.spotCount !== bSummary.spotCount ||
    aSummary.todoCount !== bSummary.todoCount ||
    aSummary.packingCount !== bSummary.packingCount ||
    aSummary.expenseCount !== bSummary.expenseCount ||
    Math.round(aSummary.expenseTotal) !== Math.round(bSummary.expenseTotal) ||
    a.title !== b.title ||
    a.destination !== b.destination ||
    a.startDate !== b.startDate ||
    a.endDate !== b.endDate ||
    (a.notes || '') !== (b.notes || '') ||
    a.googlePhotosAlbumUrl !== b.googlePhotosAlbumUrl ||
    a.isSoloTrip !== b.isSoloTrip ||
    a.isSplitEnabled !== b.isSplitEnabled ||
    a.coverGradient !== b.coverGradient ||
    a.generalAccess !== b.generalAccess ||
    (a.collaborators || []).length !== (b.collaborators || []).length ||
    (a.memories || []).length !== (b.memories || []).length ||
    Object.keys(a.deletedItemIds || {}).length !== Object.keys(b.deletedItemIds || {}).length
  ) {
    return true;
  }

  const aMems = a.memories || [];
  const bMems = b.memories || [];
  for (let m = 0; m < aMems.length; m++) {
    const ma = aMems[m];
    const mb = bMems[m];
    if (
      !mb ||
      ma.id !== mb.id ||
      ma.imageUrl !== mb.imageUrl ||
      ma.googlePhotosUrl !== mb.googlePhotosUrl ||
      ma.caption !== mb.caption ||
      ma.spotId !== mb.spotId ||
      ma.mood !== mb.mood
    ) {
      return true;
    }
  }

  const daysA = a.days || [];
  const daysB = b.days || [];
  if (daysA.length !== daysB.length) return true;

  for (let i = 0; i < daysA.length; i++) {
    const dayA = daysA[i];
    const dayB = daysB[i];
    if (!dayB) return true;
    const itemsA = dayA.items || [];
    const itemsB = dayB.items || [];
    if (itemsA.length !== itemsB.length) return true;

    for (let j = 0; j < itemsA.length; j++) {
      const itA = itemsA[j];
      const itB = itemsB[j];
      if (
        itA.id !== itB.id ||
        itA.title !== itB.title ||
        itA.startTime !== itB.startTime ||
        itA.endTime !== itB.endTime ||
        itA.notes !== itB.notes ||
        itA.completed !== itB.completed ||
        itA.googlePhotosUrl !== itB.googlePhotosUrl ||
        itA.memoryNotes !== itB.memoryNotes
      ) {
        return true;
      }

      const photosA = itA.memoryPhotos || [];
      const photosB = itB.memoryPhotos || [];
      if (photosA.length !== photosB.length) return true;
      for (let p = 0; p < photosA.length; p++) {
        if (photosA[p] !== photosB[p]) return true;
      }
    }
  }

  const expA = a.expenses || [];
  const expB = b.expenses || [];
  for (let i = 0; i < expA.length; i++) {
    const ea = expA[i];
    const eb = expB[i];
    if (
      !eb ||
      ea.id !== eb.id ||
      ea.amount !== eb.amount ||
      ea.title !== eb.title ||
      (ea.receiptImages || []).length !== (eb.receiptImages || []).length
    ) {
      return true;
    }
  }

  return false;
}

export function detectTripConflicts(
  localTrips: Trip[],
  cloudTrips: Trip[]
): TripConflict[] {
  const conflicts: TripConflict[] = [];

  for (const lTrip of localTrips) {
    const cTrip = cloudTrips.find((c) => c.id === lTrip.id);
    if (!cTrip) continue;

    const localUpdated = lTrip.updatedAt || 0;
    const cloudUpdated = cTrip.updatedAt || 0;
    const timeDiffMs = Math.abs(localUpdated - cloudUpdated);

    if (timeDiffMs > 2000 && hasTripContentDifference(lTrip, cTrip)) {
      const localSummary = summarizeTripForConflict(lTrip);
      const cloudSummary = summarizeTripForConflict(cTrip);
      const newerVersion =
        localUpdated > cloudUpdated ? 'local' : cloudUpdated > localUpdated ? 'cloud' : 'equal';
      const timeDiffMinutes = Math.max(1, Math.round(timeDiffMs / (1000 * 60)));

      conflicts.push({
        tripId: lTrip.id,
        tripTitle: lTrip.title,
        destination: lTrip.destination,
        localTrip: lTrip,
        cloudTrip: cTrip,
        localSummary,
        cloudSummary,
        detectedAt: Date.now(),
        newerVersion,
        timeDiffMinutes,
      });
    }
  }

  return conflicts;
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
    const runBackgroundSync = async () => {
      if (userId) {
        try {
          const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Cloud save timeout')), 4000)
          );
          await Promise.race([saveTripToCloud(userId, resolvedTrip), timeout]);
        } catch (err) {
          console.warn('Background cloud save delayed, enqueued in offline queue:', err);
          enqueueTripSave(userId, resolvedTrip);
        }
      }

      if (resolvedTrip.collabId && resolvedTrip.isCollaborative) {
        try {
          const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Collab sync timeout')), 4000)
          );
          await Promise.race([
            syncCollaborativeTrip(resolvedTrip.collabId, resolvedTrip),
            timeout,
          ]);
        } catch (err) {
          console.warn('Background collab sync delayed, enqueued in offline queue:', err);
          enqueueCollabSync(resolvedTrip.collabId, resolvedTrip);
        }
      }
    };

    runBackgroundSync().catch((err) => {
      console.warn('Trip conflict background sync encountered error:', err);
    });
  }

  return resolvedTrip;
}

/**
 * Tombstone-aware bi-directional merge between local trips and cloud trips.
 * Prevents deleted trips from resurrecting when another device deletes them.
 */
export function mergeTrips(
  localTrips: Trip[],
  cloudTrips: Trip[],
  cloudTombstones: Record<string, number> = {},
  isServerAuthoritative = true
): { merged: Trip[]; tripsToUpload: Trip[]; deletedLocalTripIds: string[]; conflicts: TripConflict[] } {
  const tripsToUpload: Trip[] = [];
  const deletedLocalTripIds: string[] = [];
  const mergedMap = new Map<string, Trip>();
  const localDeletedIds = new Set(getDeletedTripIds());

  const isTombstoned = (tripId: string, updatedAt = 0) => {
    if (localDeletedIds.has(tripId)) return true;
    const cloudDeletedAt = cloudTombstones[tripId];
    return typeof cloudDeletedAt === 'number' && cloudDeletedAt >= updatedAt;
  };

  const validCloudTrips = (cloudTrips || []).filter((c) => !isTombstoned(c.id, c.updatedAt || 0));
  const validLocalTrips = (localTrips || []).filter((l) => !isTombstoned(l.id, l.updatedAt || 0));

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
      // If trip was previously synced to cloud and is now missing from authoritative server list,
      // it was deleted on another device — do NOT resurrect it!
      if (isServerAuthoritative && lTrip.lastSyncedAt && !lTrip.id.startsWith('preset-')) {
        deletedLocalTripIds.push(lTrip.id);
        continue;
      }
      // Newly created local/offline trip never synced yet -> keep & upload
      mergedMap.set(lTrip.id, lTrip);
      tripsToUpload.push(lTrip);
    } else {
      const localUpdated = lTrip.updatedAt || 0;
      const cloudUpdated = existing.updatedAt || 0;

      if (cloudUpdated > localUpdated) {
        mergedMap.set(lTrip.id, existing);
      } else if (localUpdated > cloudUpdated) {
        const mergedTrip = mergeSingleTrip(lTrip, existing);
        mergedMap.set(lTrip.id, mergedTrip);
        tripsToUpload.push(mergedTrip);
      } else if (hasTripContentDifference(lTrip, existing)) {
        const mergedTrip = mergeSingleTrip(lTrip, existing);
        mergedMap.set(lTrip.id, mergedTrip);
        tripsToUpload.push(mergedTrip);
      } else {
        mergedMap.set(lTrip.id, existing);
      }
    }
  }

  const merged = Array.from(mergedMap.values());
  return { merged, tripsToUpload, deletedLocalTripIds, conflicts: [] };
}

export async function executeSafeTripUpdate(
  updatedTrip: Trip,
  userId?: string | null,
  userName?: string
): Promise<void> {
  const current = getStoredTrips();
  const idx = current.findIndex((t) => t.id === updatedTrip.id);
  const nextTrips = idx >= 0
    ? current.map((t) => (t.id === updatedTrip.id ? updatedTrip : t))
    : [updatedTrip, ...current];
  saveTrips(nextTrips);

  if (updatedTrip.collabId && updatedTrip.isCollaborative) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueueCollabSync(updatedTrip.collabId, updatedTrip, userName);
    } else {
      try {
        await syncCollaborativeTrip(updatedTrip.collabId, updatedTrip, userName);
      } catch (err) {
        console.warn('Collab sync failed, enqueuing for offline sync:', err);
        enqueueCollabSync(updatedTrip.collabId, updatedTrip, userName);
      }
    }
  }

  if (userId) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueueTripSave(userId, updatedTrip);
    } else {
      try {
        await saveTripToCloud(userId, updatedTrip);
      } catch (err) {
        console.warn('Cloud save failed, enqueuing for offline sync:', err);
        enqueueTripSave(userId, updatedTrip);
      }
    }
  }
}
