import { Trip } from '../types/itinerary';
import { saveTripToCloud, deleteTripFromCloud, syncCollaborativeTrip, mergeSingleTrip } from './firebase';
import { getStoredTrips, saveTrips } from './storage';

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
 * Retrieve current pending sync queue from localStorage
 */
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
 * Save pending sync queue to localStorage
 */
function setPendingQueue(queue: QueuedSyncItem[]): void {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Error saving offline sync queue:', e);
  }
}

/**
 * Enqueue or update a pending trip save operation
 */
export function enqueueTripSave(userId: string, trip: Trip): void {
  const queue = getPendingQueue();
  // If there is already a pending save for this trip, replace with newest version
  const filtered = queue.filter(
    (item) => !(item.type === 'save_trip' && item.userId === userId && item.trip?.id === trip.id)
  );
  filtered.push({
    id: `save-${trip.id}-${Date.now()}`,
    type: 'save_trip',
    userId,
    trip,
    timestamp: Date.now(),
  });
  setPendingQueue(filtered);
}

/**
 * Enqueue a pending trip delete operation
 */
export function enqueueTripDelete(userId: string, tripId: string): void {
  const queue = getPendingQueue();
  // Remove any pending saves for this trip, add delete
  const filtered = queue.filter(
    (item) => !(item.type === 'save_trip' && item.userId === userId && item.trip?.id === tripId)
  );
  filtered.push({
    id: `delete-${tripId}-${Date.now()}`,
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
 * Flush all pending offline sync tasks when network is available
 */
export async function flushPendingSyncQueue(): Promise<{ successCount: number; failedCount: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { successCount: 0, failedCount: 0 };
  }

  const queue = getPendingQueue();
  if (queue.length === 0) return { successCount: 0, failedCount: 0 };

  const remaining: QueuedSyncItem[] = [];
  let successCount = 0;
  let failedCount = 0;

  for (const item of queue) {
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

/**
 * Summary metrics of a trip for comparison in conflict resolution UI
 */
export interface TripConflictSummary {
  spotCount: number;
  todoCount: number;
  packingCount: number;
  expenseCount: number;
  expenseTotal: number;
  updatedAt: number;
  formattedDate: string;
}

/**
 * Conflict object representing divergent versions between Local and Cloud
 */
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

/**
 * Format timestamp into readable localized date and time string
 */
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

/**
 * Generate quick summary comparison metrics for a trip
 */
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
 * Check if two trips have substantive content differences (not just noise)
 */
export function hasTripContentDifference(a: Trip, b: Trip): boolean {
  const aSummary = summarizeTripForConflict(a);
  const bSummary = summarizeTripForConflict(b);

  if (
    aSummary.spotCount !== bSummary.spotCount ||
    aSummary.todoCount !== bSummary.todoCount ||
    aSummary.packingCount !== bSummary.packingCount ||
    aSummary.expenseCount !== bSummary.expenseCount ||
    Math.round(aSummary.expenseTotal) !== Math.round(bSummary.expenseTotal) ||
    a.title !== b.title ||
    a.startDate !== b.startDate ||
    a.endDate !== b.endDate ||
    (a.notes || '') !== (b.notes || '')
  ) {
    return true;
  }

  // Check day by day items
  if ((a.days || []).length !== (b.days || []).length) return true;
  for (let i = 0; i < (a.days || []).length; i++) {
    const dayA = a.days[i];
    const dayB = b.days[i];
    if (!dayB) return true;
    if ((dayA.items || []).length !== (dayB.items || []).length) return true;
  }

  return false;
}

/**
 * Detect conflicts between local trips and incoming cloud trips.
 * Triggered on offline-to-online transition, login, or initial sync.
 */
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

    // If modified more than 2 seconds apart AND content is different
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

/**
 * Resolve a detected conflict by user choice:
 * - 'keep_local': Local version wins and is immediately pushed to cloud.
 * - 'keep_cloud': Cloud version wins and replaces local cache.
 * - 'smart_merge': Merges both versions preserving added items from both sides.
 */
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
    // 'smart_merge'
    const merged = mergeSingleTrip(conflict.localTrip, conflict.cloudTrip);
    resolvedTrip = {
      ...merged,
      updatedAt: Date.now(),
    };
  }

  // 1. Immediately update local storage so user has zero wait time
  const currentTrips = getStoredTrips();
  const updatedTrips = currentTrips.map((t) => (t.id === resolvedTrip.id ? resolvedTrip : t));
  saveTrips(updatedTrips);

  // 2. Background non-blocking sync with timeout protection
  if (strategy !== 'keep_cloud') {
    const runBackgroundSync = async () => {
      if (userId) {
        try {
          const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Cloud save timeout')), 3000)
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
            setTimeout(() => reject(new Error('Collab sync timeout')), 3000)
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

    // Non-blocking invocation
    runBackgroundSync().catch((err) => {
      console.warn('Trip conflict background sync encountered error:', err);
    });
  }

  return resolvedTrip;
}

/**
 * Conflict-aware bi-directional merge between local trips and cloud trips.
 * Flags any divergence as a TripConflict for user resolution,
 * while safely preserving local changes until user decides.
 */
export function mergeTrips(
  localTrips: Trip[],
  cloudTrips: Trip[]
): { merged: Trip[]; tripsToUpload: Trip[]; conflicts: TripConflict[] } {
  const tripsToUpload: Trip[] = [];
  const mergedMap = new Map<string, Trip>();

  // Detect conflicts first
  const conflicts = detectTripConflicts(localTrips, cloudTrips);
  const conflictIds = new Set(conflicts.map((c) => c.tripId));

  // Process cloud trips first
  for (const cTrip of cloudTrips) {
    mergedMap.set(cTrip.id, cTrip);
  }

  // Compare with local trips
  for (const lTrip of localTrips) {
    const existing = mergedMap.get(lTrip.id);
    if (!existing) {
      // Exists locally but not in cloud -> Keep local and mark for cloud upload
      mergedMap.set(lTrip.id, lTrip);
      tripsToUpload.push(lTrip);
    } else {
      if (conflictIds.has(lTrip.id)) {
        // Conflicting trip: Keep local copy in view so offline work isn't lost while modal prompts
        mergedMap.set(lTrip.id, lTrip);
      } else {
        const localUpdated = lTrip.updatedAt || 0;
        const cloudUpdated = existing.updatedAt || 0;

        if (localUpdated > cloudUpdated) {
          // Local has newer offline changes without divergence! Keep local and upload to cloud
          mergedMap.set(lTrip.id, lTrip);
          tripsToUpload.push(lTrip);
        } else {
          // Cloud is newer or equal -> keep existing cloud version
        }
      }
    }
  }

  const merged = Array.from(mergedMap.values());
  return { merged, tripsToUpload, conflicts };
}

/**
 * Execute a safe trip update:
 * 1. Immediately updates localStorage (works 100% offline).
 * 2. If online and logged in, sends to cloud.
 * 3. If offline or cloud save fails, safely enqueues in offline sync queue.
 */
export async function executeSafeTripUpdate(
  updatedTrip: Trip,
  userId?: string | null,
  userName?: string
): Promise<void> {
  // 1. Local update first
  const current = getStoredTrips();
  const idx = current.findIndex((t) => t.id === updatedTrip.id);
  const nextTrips = idx >= 0
    ? current.map((t) => (t.id === updatedTrip.id ? updatedTrip : t))
    : [updatedTrip, ...current];
  saveTrips(nextTrips);

  // 2. Collab sync
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

  // 3. User Cloud sync
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
