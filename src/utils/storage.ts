import { Trip, DayPlan, ItineraryItem, CategoryType } from '../types/itinerary';
import { PRESET_TRIPS } from '../data/presetTrips';
import { HOKURIKU_CHUBU_9DAYS_TRIP } from '../data/hokurikuMasterpieceTrip';
import { getTodayLocal, addDaysLocal } from './date';
import {
  idbClearAll,
  idbGetAllTrips,
  idbGetStorageStats,
  idbSaveAllTrips,
  idbWarmMediaCache,
} from './indexedDb';
import { extractInlineImagesToMediaRefs, hydrateTripMediaForExport } from './image';

const STORAGE_KEY_TRIPS = 'hiyori_trips_data_v1';
const LEGACY_STORAGE_KEY_TRIPS = 'wayfarer_trips_data_v1';
const STORAGE_KEY_CURRENT_ID = 'hiyori_current_trip_id_v1';
const LEGACY_STORAGE_KEY_CURRENT_ID = 'wayfarer_current_trip_id_v1';
const STORAGE_KEY_PRESET_SEEDED = 'hiyori_preset_seeded_v1';
const STORAGE_KEY_DELETED_IDS = 'hiyori_deleted_trip_ids_v1';
const LEGACY_STORAGE_KEY_DELETED_IDS = 'wayfarer_deleted_trip_ids_v1';

let localTripsRevision = 0;
// Authoritative in-memory store synced with IndexedDB so 5MB localStorage quota overflow never returns stale snapshots
let authoritativeTripsCache: Trip[] | null = null;

function normalizeAndCleanTrips(rawTrips: Trip[]): Trip[] {
  const deletedIds = new Set(getDeletedTripIds());
  const uniqueMap = new Map<string, Trip>();
  rawTrips.forEach((t: Trip) => {
    if (t && t.id && !deletedIds.has(t.id)) {
      const existing = uniqueMap.get(t.id);
      if (!existing || (t.updatedAt || 0) > (existing.updatedAt || 0)) {
        uniqueMap.set(t.id, t);
      }
    }
  });
  const uniqueTrips = Array.from(uniqueMap.values());

  const cleaned = uniqueTrips.filter(
    (t: Trip) =>
      t.id !== 'preset-tokyo-5days' &&
      t.id !== 'preset-kyoto-osaka-6days' &&
      t.id !== 'preset-hokkaido-winter-7days'
  );

  const idx = cleaned.findIndex((t: Trip) => t.id === 'preset-hokuriku-chubu-9days');
  const alreadySeeded = localStorage.getItem(STORAGE_KEY_PRESET_SEEDED) === '1';

  if (idx === -1) {
    if (!alreadySeeded && !deletedIds.has('preset-hokuriku-chubu-9days')) {
      cleaned.unshift(HOKURIKU_CHUBU_9DAYS_TRIP);
    }
  } else {
    cleaned[idx] = {
      ...HOKURIKU_CHUBU_9DAYS_TRIP,
      ...cleaned[idx],
      days:
        cleaned[idx].days && cleaned[idx].days.length > 0
          ? cleaned[idx].days
          : HOKURIKU_CHUBU_9DAYS_TRIP.days,
      notes:
        cleaned[idx].notes !== undefined
          ? cleaned[idx].notes
          : HOKURIKU_CHUBU_9DAYS_TRIP.notes,
      todos:
        cleaned[idx].todos !== undefined
          ? cleaned[idx].todos
          : HOKURIKU_CHUBU_9DAYS_TRIP.todos,
      packingList:
        cleaned[idx].packingList !== undefined
          ? cleaned[idx].packingList
          : HOKURIKU_CHUBU_9DAYS_TRIP.packingList,
      expenses:
        cleaned[idx].expenses !== undefined
          ? cleaned[idx].expenses
          : HOKURIKU_CHUBU_9DAYS_TRIP.expenses,
    };
  }

  try {
    localStorage.setItem(STORAGE_KEY_PRESET_SEEDED, '1');
  } catch {}
  return cleaned;
}

export function getStoredTrips(): Trip[] {
  if (authoritativeTripsCache !== null) {
    return authoritativeTripsCache;
  }

  try {
    let raw = localStorage.getItem(STORAGE_KEY_TRIPS);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY_TRIPS);
    }
    if (!raw) {
      if (localStorage.getItem(STORAGE_KEY_PRESET_SEEDED) === '1') {
        authoritativeTripsCache = [];
        return [];
      }
      authoritativeTripsCache = PRESET_TRIPS;
      try {
        localStorage.setItem(STORAGE_KEY_TRIPS, JSON.stringify(PRESET_TRIPS));
        localStorage.setItem(STORAGE_KEY_CURRENT_ID, PRESET_TRIPS[0].id);
        localStorage.setItem(STORAGE_KEY_PRESET_SEEDED, '1');
      } catch {}
      return PRESET_TRIPS;
    }
    const trips = JSON.parse(raw);
    if (Array.isArray(trips)) {
      if (trips.length === 0) {
        const res = localStorage.getItem(STORAGE_KEY_PRESET_SEEDED) === '1' ? [] : PRESET_TRIPS;
        authoritativeTripsCache = res;
        return res;
      }
      const cleaned = normalizeAndCleanTrips(trips);
      authoritativeTripsCache = cleaned;
      return cleaned;
    }
    authoritativeTripsCache = PRESET_TRIPS;
    return PRESET_TRIPS;
  } catch (err) {
    console.error('Error loading trips from local storage:', err);
    return PRESET_TRIPS;
  }
}

export async function getStoredTripsAsync(): Promise<Trip[]> {
  if (authoritativeTripsCache !== null) {
    return authoritativeTripsCache;
  }
  try {
    const idbTrips = await idbGetAllTrips();
    if (idbTrips.length > 0) {
      const cleaned = normalizeAndCleanTrips(idbTrips);
      authoritativeTripsCache = cleaned;
      return cleaned;
    }
  } catch {}
  return getStoredTrips();
}

let isHydratingIdb = false;
let localStorageMirrorTimer: number | null = null;
let pendingLocalStorageMirror: Trip[] | null = null;

function flushLocalStorageMirror(): void {
  if (localStorageMirrorTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(localStorageMirrorTimer);
    localStorageMirrorTimer = null;
  }
  if (!pendingLocalStorageMirror) return;
  const toWrite = pendingLocalStorageMirror;
  pendingLocalStorageMirror = null;
  try {
    localStorage.setItem(STORAGE_KEY_TRIPS, JSON.stringify(toWrite));
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError' || err?.code === 22 || err?.code === 1014) {
      console.warn('LocalStorage quota exceeded; full data safely preserved in IndexedDB.');
    } else {
      console.error('Error saving trips to local storage:', err);
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushLocalStorageMirror);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushLocalStorageMirror();
  });
}

/**
 * Hydrate trips and bounded media cache from IndexedDB on startup, migrating legacy localStorage inline photos.
 * Safely merges any early mutations that occurred during hydration instead of discarding IDB-only trips!
 */
export async function hydrateStorageFromIndexedDB(): Promise<Trip[]> {
  const startRevision = localTripsRevision;
  isHydratingIdb = true;
  try {
    await idbWarmMediaCache();
    const idbTrips = await idbGetAllTrips();
    if (idbTrips && idbTrips.length > 0) {
      const cleaned = normalizeAndCleanTrips(idbTrips);
      const migrated: Trip[] = [];
      for (const t of cleaned) {
        const { trip: lightweight } = await extractInlineImagesToMediaRefs(t);
        migrated.push(lightweight);
      }

      const deletedSet = new Set(getDeletedTripIds());
      const mergedMap = new Map<string, Trip>();
      migrated.forEach((t) => {
        if (!deletedSet.has(t.id)) mergedMap.set(t.id, t);
      });

      // If any mutation occurred while awaiting IDB, overlay the newer in-memory mutations on top of IDB trips!
      if (localTripsRevision !== startRevision && authoritativeTripsCache) {
        authoritativeTripsCache.forEach((memTrip) => {
          if (deletedSet.has(memTrip.id)) return;
          const existing = mergedMap.get(memTrip.id);
          if (!existing || (memTrip.updatedAt || 0) >= (existing.updatedAt || 0)) {
            mergedMap.set(memTrip.id, memTrip);
          }
        });
      }

      const finalMigrated = Array.from(mergedMap.values());
      authoritativeTripsCache = finalMigrated;
      await idbSaveAllTrips(finalMigrated);
      pendingLocalStorageMirror = finalMigrated;
      flushLocalStorageMirror();
      return finalMigrated;
    }

    const localTrips = getStoredTrips();
    const migrated: Trip[] = [];
    for (const t of localTrips) {
      const { trip: lightweight } = await extractInlineImagesToMediaRefs(t);
      migrated.push(lightweight);
    }
    const deletedSet = new Set(getDeletedTripIds());
    const mergedMap = new Map<string, Trip>();
    migrated.forEach((t) => {
      if (!deletedSet.has(t.id)) mergedMap.set(t.id, t);
    });
    if (localTripsRevision !== startRevision && authoritativeTripsCache) {
      authoritativeTripsCache.forEach((memTrip) => {
        if (deletedSet.has(memTrip.id)) return;
        const existing = mergedMap.get(memTrip.id);
        if (!existing || (memTrip.updatedAt || 0) >= (existing.updatedAt || 0)) {
          mergedMap.set(memTrip.id, memTrip);
        }
      });
    }
    const finalMigrated = Array.from(mergedMap.values());
    authoritativeTripsCache = finalMigrated;
    await idbSaveAllTrips(finalMigrated);
    pendingLocalStorageMirror = finalMigrated;
    flushLocalStorageMirror();
    return finalMigrated;
  } catch (err) {
    console.warn('[Storage] IndexedDB hydration fallback:', err);
    return getStoredTrips();
  } finally {
    isHydratingIdb = false;
  }
}

export function saveTrips(trips: Trip[]): void {
  localTripsRevision++;
  const uniqueMap = new Map<string, Trip>();
  (trips || []).forEach((t) => {
    if (t && t.id) {
      const existing = uniqueMap.get(t.id);
      if (!existing || (t.updatedAt || 0) >= (existing.updatedAt || 0)) {
        uniqueMap.set(t.id, t);
      }
    }
  });
  const deduped = Array.from(uniqueMap.values());
  authoritativeTripsCache = deduped;

  // 1. Primary durable persistence in IndexedDB: skip destructive store.clear() while initial hydration is in flight
  if (!isHydratingIdb) {
    idbSaveAllTrips(deduped).catch((err) => {
      console.warn('[Storage] IndexedDB save warning:', err);
    });
  }

  // 2. Debounced fast-boot mirror in localStorage (avoids synchronous main-thread JSON.stringify jank on rapid taps)
  pendingLocalStorageMirror = deduped;
  if (typeof window !== 'undefined') {
    if (localStorageMirrorTimer !== null) {
      window.clearTimeout(localStorageMirrorTimer);
    }
    localStorageMirrorTimer = window.setTimeout(flushLocalStorageMirror, 320);
  } else {
    flushLocalStorageMirror();
  }
}

export function clearAccountTripsOnLogout(
  signedOutUid?: string,
  pendingQueuedTripIds: string[] = []
): Trip[] {
  localTripsRevision++;
  const pendingSet = new Set(pendingQueuedTripIds);
  const current = getStoredTrips();
  const retained = current.filter((t) => {
    if (pendingSet.has(t.id)) return true;
    if (t.lastSyncedAt) return false;
    if (t.ownerId && (!signedOutUid || t.ownerId === signedOutUid)) return false;
    if (t.id === 'preset-hokuriku-chubu-9days' && (t.updatedAt || 0) <= 1728518400000) {
      return false;
    }
    return true;
  });

  try {
    localStorage.setItem(STORAGE_KEY_PRESET_SEEDED, '1');
    localStorage.removeItem(STORAGE_KEY_CURRENT_ID);
    // Clear account-specific deleted IDs on logout so switching accounts on the same device never hides Account B's trips
    localStorage.removeItem(STORAGE_KEY_DELETED_IDS);
  } catch {}

  saveTrips(retained);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('hiyori_account_cache_cleared', {
        detail: { retainedTrips: retained },
      })
    );
  }
  return retained;
}

export async function resetAllLocalData(): Promise<void> {
  localTripsRevision++;
  authoritativeTripsCache = null;
  await idbClearAll();
  localStorage.clear();
}

export function getCurrentTripId(): string {
  try {
    const id =
      localStorage.getItem(STORAGE_KEY_CURRENT_ID) ||
      localStorage.getItem(LEGACY_STORAGE_KEY_CURRENT_ID);
    if (id) return id;
    const trips = getStoredTrips();
    if (trips.length > 0) return trips[0].id;
  } catch {}
  return localStorage.getItem(STORAGE_KEY_PRESET_SEEDED) === '1' ? '' : PRESET_TRIPS[0].id;
}

export function setCurrentTripId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_CURRENT_ID, id);
  } catch {}
}

export function getDeletedTripIds(): string[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY_DELETED_IDS) ||
      localStorage.getItem(LEGACY_STORAGE_KEY_DELETED_IDS);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordDeletedTripId(tripId: string): void {
  localTripsRevision++;
  try {
    const current = getDeletedTripIds();
    if (!current.includes(tripId)) {
      current.push(tripId);
      localStorage.setItem(STORAGE_KEY_DELETED_IDS, JSON.stringify(current.slice(-100)));
    }
  } catch {}
}

export function clearDeletedTripId(tripId: string): void {
  localTripsRevision++;
  try {
    const current = getDeletedTripIds().filter((id) => id !== tripId);
    localStorage.setItem(STORAGE_KEY_DELETED_IDS, JSON.stringify(current));
  } catch {}
}

export function getStorageUsage(): { bytes: number; formatted: string; count: number } {
  try {
    const trips = getStoredTrips();
    const raw = JSON.stringify(trips);
    const bytes = new Blob([raw]).size;
    const formatted =
      bytes < 1024
        ? `${bytes} B`
        : bytes < 1024 * 1024
        ? `${(bytes / 1024).toFixed(1)} KB`
        : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return { bytes, formatted, count: trips.length };
  } catch {
    return { bytes: 0, formatted: '0 KB', count: 0 };
  }
}

export async function getStorageUsageAsync(): Promise<{
  bytes: number;
  formatted: string;
  count: number;
  mediaCount: number;
}> {
  try {
    const stats = await idbGetStorageStats();
    const bytes = stats.totalBytes;
    const formatted =
      bytes < 1024
        ? `${bytes} B`
        : bytes < 1024 * 1024
        ? `${(bytes / 1024).toFixed(1)} KB`
        : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return {
      bytes,
      formatted,
      count: stats.tripsCount,
      mediaCount: stats.mediaCount,
    };
  } catch {
    const fallback = getStorageUsage();
    return { ...fallback, mediaCount: 0 };
  }
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const downloadAnchor = document.createElement('a');
  downloadAnchor.href = url;
  downloadAnchor.download = filename;
  downloadAnchor.rel = 'noopener';
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  // Generous 30s timeout so large multi-MB photo backups never abort on mobile browsers
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function exportTripToJSON(trip: Trip): Promise<void> {
  const hydrated = await hydrateTripMediaForExport(trip);
  const blob = new Blob([JSON.stringify(hydrated, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const safeTitle = (trip.title || 'trip').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_');
  triggerBlobDownload(blob, `${safeTitle}_行程備份.json`);
}

export async function exportAllTripsToJSON(trips: Trip[]): Promise<void> {
  const hydratedList = await Promise.all((trips || []).map((t) => hydrateTripMediaForExport(t)));
  const blob = new Blob([JSON.stringify(hydratedList, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  triggerBlobDownload(blob, `日和手帳_所有旅遊行程完整備份_${getTodayLocal()}.json`);
}

/**
 * RFC-4180 CSV escaping with Formula Injection (CWE-1236) neutralization.
 */
function escapeCSVCell(value: unknown): string {
  let str = value === null || value === undefined ? '' : String(value);
  // Prevent spreadsheet formula execution when opening shared/imported trips in Excel/Sheets
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportTripToCSV(trip: Trip): void {
  const headers = [
    'Day',
    '日期',
    '當日主題',
    '開始時間',
    '結束時間',
    '類別',
    '景點名稱',
    '地點',
    '地址',
    '交通指引',
    '預約代碼',
    '預估費用',
    '備忘筆記',
  ];

  const rows: string[][] = [headers];
  (trip.days || []).forEach((day) => {
    if (!day.items || day.items.length === 0) {
      rows.push([
        String(day.dayNumber),
        day.date || '',
        day.theme || '',
        '',
        '',
        '',
        '（尚無景點安排）',
        '',
        '',
        '',
        '',
        '',
        day.notes || '',
      ]);
      return;
    }

    day.items.forEach((item) => {
      rows.push([
        String(day.dayNumber),
        day.date || '',
        day.theme || '',
        item.startTime || '',
        item.endTime || '',
        item.category || 'spot',
        item.title || '',
        item.locationName || '',
        item.address || '',
        item.transportNote || '',
        item.bookingCode || '',
        item.cost !== undefined ? String(item.cost) : '',
        item.notes || '',
      ]);
    });
  });

  const csvBody = rows.map((row) => row.map(escapeCSVCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csvBody], {
    type: 'text/csv;charset=utf-8',
  });
  const safeTitle = (trip.title || 'trip').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_');
  triggerBlobDownload(blob, `${safeTitle}_行程表.csv`);
}

function escapeMarkdownCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

export function exportTripToMarkdown(trip: Trip): void {
  const budgetStr = Number(trip.budgetTotal || 0).toLocaleString();
  let md = `# ✈️ ${trip.title}\n\n`;
  md += `**目的地:** ${trip.destination}\n`;
  md += `**日期:** ${trip.startDate} ~ ${trip.endDate}\n`;
  md += `**幣別 / 預算:** ${trip.currency} ${budgetStr}\n`;
  if (trip.notes) md += `**備註事項:** ${trip.notes}\n`;
  md += `\n---\n\n`;

  (trip.days || []).forEach((day) => {
    md += `## 📅 第 ${day.dayNumber} 天 (${day.date})${day.theme ? ` - ${day.theme}` : ''}\n`;
    if (day.notes) md += `*每日叮嚀: ${day.notes}*\n\n`;

    (day.items || []).forEach((item, idx) => {
      md += `### ${idx + 1}. [${item.startTime}${item.endTime ? ` - ${item.endTime}` : ''}] ${item.title}\n`;
      if (item.locationName) md += `- **地點:** ${item.locationName}\n`;
      if (item.address) md += `- **地址:** ${item.address}\n`;
      if (item.transportNote) md += `- **交通指引:** ${item.transportNote}\n`;
      if (item.notes) md += `- **備忘/叮嚀:** ${item.notes}\n`;
      if (item.bookingCode) md += `- **預約代號:** \`${item.bookingCode}\`\n`;
      if (item.cost) md += `- **費用:** ${trip.currency} ${item.cost} (${item.costPaid ? '已付款' : '現場付'})\n`;
      if (item.lat && item.lng) {
        md += `- **Google Maps 導航連結:** https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}\n`;
      }
      md += `\n`;
    });
    md += `\n`;
  });

  if (trip.todos && trip.todos.length > 0) {
    md += `---\n\n## 🎫 行前待辦與票券提醒\n\n`;
    trip.todos.forEach((todo) => {
      md += `- [${todo.completed ? 'x' : ' '}] ${todo.title}${todo.dueDate ? ` (${todo.dueDate})` : ''}${todo.notes ? ` — ${todo.notes}` : ''}\n`;
    });
    md += `\n`;
  }

  if (trip.packingList && trip.packingList.length > 0) {
    md += `---\n\n## 🧳 行李打包清單\n\n`;
    trip.packingList.forEach((pack) => {
      md += `- [${pack.packed ? 'x' : ' '}] ${pack.name}${pack.essential ? ' *(必帶)*' : ''}\n`;
    });
    md += `\n`;
  }

  if (trip.expenses && trip.expenses.length > 0) {
    md += `---\n\n## 💰 消費記帳明細\n\n`;
    md += `| 日期 | 項目 | 類別 | 金額 | 付款方式 | 備註 |\n`;
    md += `| --- | --- | --- | --- | --- | --- |\n`;
    trip.expenses.forEach((exp) => {
      const catLabel = trip.customCategoryLabels?.[exp.category] || exp.category;
      md += `| ${escapeMarkdownCell(exp.date)} | ${escapeMarkdownCell(exp.title)} | ${escapeMarkdownCell(catLabel)} | ${escapeMarkdownCell(exp.currency)} ${Number(exp.amount || 0).toLocaleString()} | ${escapeMarkdownCell(exp.paymentMethod)} | ${escapeMarkdownCell(exp.notes || '')} |\n`;
    });
    md += `\n`;
  }

  if (trip.emergencyContacts && trip.emergencyContacts.length > 0) {
    md += `---\n\n## 🆘 緊急聯絡資訊\n\n`;
    trip.emergencyContacts.forEach((c) => {
      md += `- **${c.name}**: \`${c.phone}\`${c.address ? ` (${c.address})` : ''}${c.note ? ` — ${c.note}` : ''}\n`;
    });
    md += `\n`;
  }

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const safeTitle = (trip.title || 'trip').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_');
  triggerBlobDownload(blob, `${safeTitle}_行程清單.md`);
}

/**
 * Smart Text Parser: converts unstructured travel text notes into structured Days & Items
 */
export function parseTextItinerary(rawText: string, tripTitle = '匯入的旅遊行程'): Trip {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const startDate = getTodayLocal();
  const days: DayPlan[] = [];
  let currentDay: DayPlan | null = null;
  let dayCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const strippedHeading = line.replace(/^#+\s*/, '');
    const dayMatch = strippedHeading.match(
      /^(?:Day\s*(\d+)|第\s*([一二三四五六七八九十\d]+)\s*天|D(\d+))(?:\s*[:：\-—–]|\s|$)/i
    );
    if (dayMatch) {
      const parsedNum = Number(dayMatch[1] || dayMatch[3]);
      const dayNum = Number.isInteger(parsedNum) && parsedNum > 0 ? parsedNum : dayCounter;
      dayCounter = Math.max(dayCounter + 1, dayNum + 1);

      const theme = strippedHeading
        .replace(/^(?:Day\s*\d+|第\s*[一二三四五六七八九十\d]+\s*天|D\d+)\s*[:：\-—–]?\s*/i, '')
        .trim();

      currentDay = {
        id: `imported-day-${Date.now()}-${dayNum}-${i}`,
        dayNumber: dayNum,
        date: addDaysLocal(startDate, dayNum - 1),
        theme: theme || `第 ${dayNum} 天行程`,
        items: [],
      };
      days.push(currentDay);
      continue;
    }

    if (!currentDay) {
      currentDay = {
        id: `imported-day-${Date.now()}-1`,
        dayNumber: 1,
        date: startDate,
        theme: '主要行程安排',
        items: [],
      };
      days.push(currentDay);
    }

    const timeMatch = line.match(/^(\d{1,2}:\d{2})(?:\s*[-~至到]\s*(\d{1,2}:\d{2}))?\s*(.*)$/);
    if (timeMatch) {
      const startTime = timeMatch[1].padStart(5, '0');
      const endTime = timeMatch[2] ? timeMatch[2].padStart(5, '0') : undefined;
      const content = timeMatch[3].trim() || '自訂景點行程';

      let category: CategoryType = 'spot';
      if (/吃|餐|飯|食|拉麵|火鍋|居酒屋|咖啡|午餐|晚餐|早餐/.test(content)) category = 'food';
      else if (/機|飛機|機場|JR|地鐵|巴士|車|轉乘|步行|抵達|返程/.test(content)) category = 'transport';
      else if (/飯店|酒店|民宿|Check-in|入住|青旅/.test(content)) category = 'hotel';
      else if (/買|購|商場|百貨|選品|伴手禮|超市/.test(content)) category = 'shopping';

      currentDay.items.push({
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: content,
        category,
        startTime,
        endTime,
        completed: false,
      });
      continue;
    }

    // Properly strip list bullets (`- `, `* `, `• `, `10. `, `1) `) without eating digits of `"2026年..."`
    const bulletMatch = line.match(/^(?:[-*•]\s+|\d+[.)、]\s+)(.*)$/);
    const itemTitle = (bulletMatch ? bulletMatch[1] : line).trim();
    if (itemTitle.length > 1) {
      const defaultTime = `${String(8 + Math.min(currentDay.items.length * 2, 12)).padStart(2, '0')}:00`;
      currentDay.items.push({
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: itemTitle,
        category: 'spot',
        startTime: defaultTime,
        completed: false,
      });
    }
  }

  const lastDayDate = days.length > 0 ? days[days.length - 1].date : startDate;

  return {
    id: `trip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: tripTitle || '匯入的旅遊新行程',
    destination: '自訂目的地',
    startDate,
    endDate: lastDayDate,
    currency: 'TWD',
    budgetTotal: 20000,
    coverGradient: 'from-teal-600 via-emerald-600 to-cyan-700',
    days:
      days.length > 0
        ? days
        : [
            {
              id: `day-${Date.now()}-1`,
              dayNumber: 1,
              date: startDate,
              theme: '精彩第一天',
              items: [],
            },
          ],
    todos: [],
    packingList: [
      { id: 'p1', name: '護照 / 身分證件', category: 'documents', packed: false, essential: true },
      { id: 'p2', name: '手機充電線 & 行動電源', category: 'electronics', packed: false, essential: true },
      { id: 'p3', name: '個人常備藥品', category: 'medicine', packed: false, essential: true },
    ],
    expenses: [],
    emergencyContacts: [
      { id: 'em-1', name: '報警專線', type: 'police', phone: '110' },
      { id: 'em-2', name: '緊急醫療救護', type: 'ambulance', phone: '119' },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * RFC-4180 compliant CSV parser: only opens quotes at cell start so mid-cell quotes (`5" Ramen`) stay intact.
 */
export function parseCSVRows(csvContent: string): string[][] {
  const clean = csvContent.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"' && currentCell.trim().length === 0) {
        currentCell = '';
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c.length > 0)) rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c.length > 0)) rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }
  }

  currentRow.push(currentCell.trim());
  if (currentRow.some((c) => c.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

export function parseCSVItinerary(csvContent: string): Trip {
  const rows = parseCSVRows(csvContent);
  if (rows.length < 2) {
    throw new Error('CSV 檔案行數不足，至少需要標題列與一筆資料列');
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const dayIdx = headers.findIndex((h) => h.includes('day') || h.includes('天'));
  const dateIdx = headers.findIndex((h) => h.includes('date') || h.includes('日期'));
  const themeIdx = headers.findIndex((h) => h.includes('theme') || h.includes('主題'));
  const startIdx = headers.findIndex(
    (h) => h.includes('start') || h.includes('開始') || h === 'time' || h === '時間'
  );
  const endIdx = headers.findIndex((h) => h.includes('end') || h.includes('結束'));
  const catIdx = headers.findIndex((h) => h.includes('category') || h.includes('類別'));
  const titleIdx = headers.findIndex(
    (h) => h.includes('title') || h.includes('景點') || h.includes('名稱') || h.includes('name')
  );
  const locationIdx = headers.findIndex((h) => h.includes('location') || h.includes('地點'));
  const addressIdx = headers.findIndex((h) => h.includes('address') || h.includes('地址'));
  const transportIdx = headers.findIndex((h) => h.includes('transport') || h.includes('交通'));
  const bookingIdx = headers.findIndex((h) => h.includes('booking') || h.includes('預約'));
  const costIdx = headers.findIndex((h) => h.includes('cost') || h.includes('費用') || h.includes('價格'));
  const noteIdx = headers.findIndex((h) => h.includes('note') || h.includes('備忘') || h.includes('備註'));

  const daysMap = new Map<number, { date?: string; theme?: string; items: ItineraryItem[] }>();
  const validCats: Set<string> = new Set([
    'spot',
    'food',
    'transport',
    'hotel',
    'shopping',
    'activity',
    'other',
  ]);

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    const dayRaw = dayIdx !== -1 ? cols[dayIdx] || '' : '';
    const dayDigits = dayRaw.match(/(\d+)/);
    const dayNum = dayDigits ? Math.max(1, parseInt(dayDigits[1], 10)) : 1;
    const rawTitle = titleIdx !== -1 ? cols[titleIdx] : cols[0] || '';
    const dateVal = dateIdx !== -1 ? cols[dateIdx] : undefined;
    const themeVal = themeIdx !== -1 ? cols[themeIdx] : undefined;

    if (!daysMap.has(dayNum)) {
      daysMap.set(dayNum, { date: dateVal || undefined, theme: themeVal || undefined, items: [] });
    }

    if (!rawTitle || rawTitle === '（尚無景點安排）') continue;

    const rawCat = catIdx !== -1 ? (cols[catIdx] || '').toLowerCase() : 'spot';
    const category: CategoryType = validCats.has(rawCat) ? (rawCat as CategoryType) : 'spot';
    const rawCost = costIdx !== -1 ? parseFloat((cols[costIdx] || '').replace(/,/g, '')) : NaN;

    const item: ItineraryItem = {
      id: `csv-item-${Date.now()}-${i}`,
      title: rawTitle,
      category,
      startTime: startIdx !== -1 && cols[startIdx] ? cols[startIdx] : '10:00',
      endTime: endIdx !== -1 && cols[endIdx] ? cols[endIdx] : undefined,
      locationName: locationIdx !== -1 && cols[locationIdx] ? cols[locationIdx] : undefined,
      address: addressIdx !== -1 && cols[addressIdx] ? cols[addressIdx] : undefined,
      transportNote: transportIdx !== -1 && cols[transportIdx] ? cols[transportIdx] : undefined,
      bookingCode: bookingIdx !== -1 && cols[bookingIdx] ? cols[bookingIdx] : undefined,
      notes: noteIdx !== -1 && cols[noteIdx] ? cols[noteIdx] : undefined,
      cost: !isNaN(rawCost) && rawCost > 0 ? rawCost : undefined,
      completed: false,
    };

    daysMap.get(dayNum)!.items.push(item);
  }

  const startDateStr = getTodayLocal();
  const sortedDayNumbers = Array.from(daysMap.keys()).sort((a, b) => a - b);
  const days: DayPlan[] = sortedDayNumbers.map((dayNum) => {
    const entry = daysMap.get(dayNum)!;
    return {
      id: `csv-day-${dayNum}`,
      dayNumber: dayNum,
      date: entry.date || addDaysLocal(startDateStr, dayNum - 1),
      theme: entry.theme || `第 ${dayNum} 天行程安排`,
      items: entry.items,
    };
  });

  return {
    id: `trip-csv-${Date.now()}`,
    title: 'CSV 匯入旅遊行程',
    destination: '自訂目的地',
    startDate: days[0]?.date || startDateStr,
    endDate: days.length > 0 ? days[days.length - 1].date : startDateStr,
    currency: 'TWD',
    budgetTotal: 15000,
    coverGradient: 'from-sky-600 via-indigo-600 to-purple-700',
    days:
      days.length > 0
        ? days
        : [
            {
              id: `csv-day-1`,
              dayNumber: 1,
              date: startDateStr,
              theme: '第一天',
              items: [],
            },
          ],
    todos: [],
    packingList: [],
    expenses: [],
    emergencyContacts: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
