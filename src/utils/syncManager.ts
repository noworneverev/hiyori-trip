import { Trip } from '../types/itinerary';
import { saveTripToCloud, deleteTripFromCloud, syncCollaborativeTrip } from './firebase';
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
 * Conflict-free bi-directional merge between local trips and cloud trips.
 * Preserves whichever has the latest updatedAt timestamp.
 * Returns the final merged trips and any trips that need to be uploaded to the cloud.
 */
export function mergeTrips(
  localTrips: Trip[],
  cloudTrips: Trip[]
): { merged: Trip[]; tripsToUpload: Trip[] } {
  const tripsToUpload: Trip[] = [];
  const mergedMap = new Map<string, Trip>();

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
      const localUpdated = lTrip.updatedAt || 0;
      const cloudUpdated = existing.updatedAt || 0;

      if (localUpdated > cloudUpdated) {
        // Local has newer offline changes! Keep local and upload to cloud
        mergedMap.set(lTrip.id, lTrip);
        tripsToUpload.push(lTrip);
      } else {
        // Cloud is newer or equal -> keep existing cloud version
      }
    }
  }

  const merged = Array.from(mergedMap.values());
  return { merged, tripsToUpload };
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
