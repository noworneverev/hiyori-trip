/**
 * Format any date string (YYYY-MM-DD or ISO) into YYYY/MM/DD
 */
export function formatDateSlash(dateStr?: string): string {
  if (!dateStr) return '';
  const clean = dateStr.slice(0, 10).replace(/-/g, '/');
  return clean;
}

/**
 * Format date string into MM/DD
 */
export function formatMonthDaySlash(dateStr?: string): string {
  if (!dateStr) return '';
  const clean = formatDateSlash(dateStr);
  const parts = clean.split('/');
  if (parts.length >= 3) {
    return `${parts[1]}/${parts[2]}`;
  }
  return clean;
}

/**
 * Get weekday label for date string
 */
export function getDayOfWeek(dateStr?: string, lang: string = 'zh'): string {
  if (!dateStr) return '';
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  const dayIndex = d.getDay();
  const zhDays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  const jaDays = ['日', '月', '火', '水', '木', '金', '土'];
  const enDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const koDays = ['일', '월', '화', '수', '목', '금', '토'];
  if (lang === 'en') return enDays[dayIndex];
  if (lang === 'ja') return jaDays[dayIndex];
  if (lang === 'ko') return koDays[dayIndex];
  return zhDays[dayIndex];
}

/**
 * Return today's date string in local timezone (YYYY-MM-DD)
 */
export function getTodayLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Add or subtract days to a YYYY-MM-DD date string safely in local timezone
 */
export function addDaysLocal(baseDateStr: string, offsetDays: number): string {
  const clean = (baseDateStr || '').slice(0, 10).replace(/\//g, '-');
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const base = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + offsetDays)
    : new Date();
  if (!match) {
    base.setDate(base.getDate() + offsetDays);
  }
  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, '0');
  const day = String(base.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a date string matches today's local date (YYYY-MM-DD or YYYY/MM/DD)
 */
export function isDateToday(dateStr?: string): boolean {
  if (!dateStr) return false;
  const clean = dateStr.slice(0, 10).replace(/\//g, '-');
  return clean === getTodayLocal();
}

/**
 * Parse time string (e.g. "09:30", "9:30", "14:00") into minutes from midnight.
 * Returns 99999 if time is empty or invalid, so unscheduled items appear at the end.
 */
export function parseTimeToMinutes(timeStr?: string): number {
  if (!timeStr || !timeStr.trim()) return 99999;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (!isNaN(hours) && !isNaN(minutes)) {
      return hours * 60 + minutes;
    }
  }
  return 99999;
}

/**
 * Sorts itinerary items by their start time chronologically.
 * Items with earlier start times are placed first.
 * If start times are identical or missing, preserves their original relative order.
 */
export function sortItineraryItemsByTime<T extends { startTime?: string }>(items: T[]): T[] {
  return [...items]
    .map((item, originalIndex) => ({
      item,
      originalIndex,
      minutes: parseTimeToMinutes(item.startTime),
    }))
    .sort((a, b) => {
      if (a.minutes !== b.minutes) return a.minutes - b.minutes;
      return a.originalIndex - b.originalIndex;
    })
    .map((entry) => entry.item);
}

/**
 * Determines where to insert an item into an existing list based on start time.
 * Returns the 0-based targetIndex, and references to the item immediately before and after.
 */
export function findInsertionPosition<T extends { title?: string; startTime?: string }>(
  items: T[],
  newItemTime?: string
): {
  targetIndex: number;
  beforeItem?: T; // Item immediately following the new item (i.e. new item is placed before this one)
  afterItem?: T;  // Item immediately preceding the new item (i.e. new item is placed after this one)
} {
  const newMinutes = parseTimeToMinutes(newItemTime);

  // If new item has no specified time, place at the very end
  if (newMinutes === 99999 || items.length === 0) {
    const afterItem = items.length > 0 ? items[items.length - 1] : undefined;
    return {
      targetIndex: items.length,
      beforeItem: undefined,
      afterItem,
    };
  }

  // Find the first item whose scheduled time is strictly greater than the new item's time
  let targetIndex = -1;
  for (let i = 0; i < items.length; i++) {
    const itemMinutes = parseTimeToMinutes(items[i].startTime);
    // If the item has a valid time greater than newMinutes, or if it has no time (99999) while new item does have time:
    if (itemMinutes > newMinutes) {
      targetIndex = i;
      break;
    }
  }

  // If all existing items are earlier, insert at the end
  if (targetIndex === -1) {
    targetIndex = items.length;
  }

  const afterItem = targetIndex > 0 ? items[targetIndex - 1] : undefined;
  const beforeItem = targetIndex < items.length ? items[targetIndex] : undefined;

  return {
    targetIndex,
    beforeItem,
    afterItem,
  };
}

/**
 * Calculates a reasonable suggested start time for a new spot.
 * If there are existing items, picks a time after the last item's endTime or startTime + 1h.
 * Defaults to "09:00" if no items exist.
 */
export function getSuggestedNextStartTime<T extends { startTime?: string; endTime?: string }>(
  items: T[]
): string {
  if (!items || items.length === 0) return '09:00';

  let maxMinutes = -1;
  for (const it of items) {
    const endM = parseTimeToMinutes(it.endTime);
    const startM = parseTimeToMinutes(it.startTime);
    const effectiveM = endM !== 99999 ? endM : startM;
    if (effectiveM !== 99999 && effectiveM > maxMinutes) {
      maxMinutes = effectiveM;
    }
  }

  if (maxMinutes === -1) return '09:00';

  const nextMinutes = Math.min(23 * 60 + 30, maxMinutes + 45);
  const h = Math.floor(nextMinutes / 60);
  const m = Math.floor((nextMinutes % 60) / 15) * 15;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export type TimeConflictType = 'overlap' | 'invalid_range' | 'tight_transfer';

export interface ScheduleConflict {
  id: string;
  type: TimeConflictType;
  itemAId: string;
  itemATitle: string;
  itemBId?: string;
  itemBTitle?: string;
  overlapMinutes?: number;
  distanceKm?: number;
  message: string;
}

export interface DayConflictReport {
  conflicts: ScheduleConflict[];
  conflictedItemIds: string[];
  hasFixableOverlap: boolean;
}

function formatMinutesToHHMM(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface SchedulableItemLike {
  id: string;
  title: string;
  startTime?: string;
  endTime?: string;
  lat?: number;
  lng?: number;
}

/**
 * Analyze a single day's sorted itinerary items for invalid time ranges,
 * overlapping time windows, and impossibly tight cross-city transfers.
 */
export function detectDayTimeConflicts<T extends SchedulableItemLike>(
  items: T[],
  lang: string = 'zh'
): DayConflictReport {
  if (!items || items.length === 0) {
    return { conflicts: [], conflictedItemIds: [], hasFixableOverlap: false };
  }

  const sorted = sortItineraryItemsByTime(items);
  const conflicts: ScheduleConflict[] = [];
  const conflictedSet = new Set<string>();
  let hasFixableOverlap = false;

  for (let i = 0; i < sorted.length; i++) {
    const curr = sorted[i];
    const startM = parseTimeToMinutes(curr.startTime);
    const endM = parseTimeToMinutes(curr.endTime);

    if (startM !== 99999 && endM !== 99999 && endM < startM) {
      conflictedSet.add(curr.id);
      conflicts.push({
        id: `invalid-${curr.id}`,
        type: 'invalid_range',
        itemAId: curr.id,
        itemATitle: curr.title,
        message:
          lang === 'zh'
            ? `「${curr.title}」結束時間 (${curr.endTime}) 早於開始時間 (${curr.startTime})`
            : `"${curr.title}" end time (${curr.endTime}) is before start time (${curr.startTime})`,
      });
    }

    if (i < sorted.length - 1) {
      const next = sorted[i + 1];
      const nextStartM = parseTimeToMinutes(next.startTime);
      if (startM === 99999 || nextStartM === 99999) continue;

      const effectiveEndM = endM !== 99999 && endM >= startM ? endM : startM;

      if (endM !== 99999 && endM >= startM && nextStartM < effectiveEndM) {
        const overlapMinutes = effectiveEndM - nextStartM;
        conflictedSet.add(curr.id);
        conflictedSet.add(next.id);
        hasFixableOverlap = true;
        conflicts.push({
          id: `overlap-${curr.id}-${next.id}`,
          type: 'overlap',
          itemAId: curr.id,
          itemATitle: curr.title,
          itemBId: next.id,
          itemBTitle: next.title,
          overlapMinutes,
          message:
            lang === 'zh'
              ? `「${curr.title}」與「${next.title}」時段重疊 ${overlapMinutes} 分鐘`
              : `"${curr.title}" overlaps with "${next.title}" by ${overlapMinutes} min`,
        });
      } else if (nextStartM === startM) {
        conflictedSet.add(curr.id);
        conflictedSet.add(next.id);
        hasFixableOverlap = true;
        conflicts.push({
          id: `same-${curr.id}-${next.id}`,
          type: 'overlap',
          itemAId: curr.id,
          itemATitle: curr.title,
          itemBId: next.id,
          itemBTitle: next.title,
          overlapMinutes: 0,
          message:
            lang === 'zh'
              ? `「${curr.title}」與「${next.title}」開始時間同為 ${curr.startTime}`
              : `"${curr.title}" and "${next.title}" share start time ${curr.startTime}`,
        });
      } else if (
        typeof curr.lat === 'number' &&
        typeof curr.lng === 'number' &&
        typeof next.lat === 'number' &&
        typeof next.lng === 'number'
      ) {
        const km = haversineKm(curr.lat, curr.lng, next.lat, next.lng);
        const gapM = nextStartM - effectiveEndM;
        if (km >= 5 && gapM >= 0 && gapM < 15) {
          conflictedSet.add(curr.id);
          conflictedSet.add(next.id);
          conflicts.push({
            id: `tight-${curr.id}-${next.id}`,
            type: 'tight_transfer',
            itemAId: curr.id,
            itemATitle: curr.title,
            itemBId: next.id,
            itemBTitle: next.title,
            distanceKm: Math.round(km * 10) / 10,
            message:
              lang === 'zh'
                ? `「${curr.title}」至「${next.title}」相距 ${km.toFixed(1)} km，預留轉乘僅 ${gapM} 分鐘`
                : `Only ${gapM} min transfer between "${curr.title}" and "${next.title}" (${km.toFixed(1)} km apart)`,
          });
        }
      }
    }
  }

  return {
    conflicts,
    conflictedItemIds: Array.from(conflictedSet),
    hasFixableOverlap,
  };
}

/**
 * Check a candidate item's startTime/endTime against existing items in the same day (live edit preview).
 */
export function checkItemTimeOverlap<T extends SchedulableItemLike>(
  candidate: { id?: string; title?: string; startTime?: string; endTime?: string },
  others: T[],
  lang: string = 'zh'
): string[] {
  const warnings: string[] = [];
  const cStart = parseTimeToMinutes(candidate.startTime);
  const cEnd = parseTimeToMinutes(candidate.endTime);

  if (cStart !== 99999 && cEnd !== 99999 && cEnd < cStart) {
    warnings.push(
      lang === 'zh'
        ? `結束時間 (${candidate.endTime}) 早於開始時間 (${candidate.startTime})`
        : `End time (${candidate.endTime}) is earlier than start time (${candidate.startTime})`
    );
  }

  if (cStart === 99999) return warnings;

  const effectiveCEnd = cEnd !== 99999 && cEnd >= cStart ? cEnd : cStart + 30;

  for (const other of others) {
    if (candidate.id && other.id === candidate.id) continue;
    const oStart = parseTimeToMinutes(other.startTime);
    const oEnd = parseTimeToMinutes(other.endTime);
    if (oStart === 99999) continue;

    if (oStart === cStart) {
      warnings.push(
        lang === 'zh'
          ? `與「${other.title}」開始時間相同 (${other.startTime})`
          : `Same start time as "${other.title}" (${other.startTime})`
      );
      continue;
    }

    const effectiveOEnd = oEnd !== 99999 && oEnd >= oStart ? oEnd : oStart;
    // Check true interval overlap (when at least one item specifies an endTime)
    if (oEnd !== 99999 && cStart < effectiveOEnd && cStart >= oStart) {
      const overlap = effectiveOEnd - cStart;
      warnings.push(
        lang === 'zh'
          ? `與「${other.title}」(${other.startTime}-${other.endTime}) 重疊 ${overlap} 分鐘`
          : `Overlaps "${other.title}" (${other.startTime}-${other.endTime}) by ${overlap} min`
      );
    } else if (cEnd !== 99999 && cEnd >= cStart && oStart >= cStart && oStart < effectiveCEnd) {
      const overlap = effectiveCEnd - oStart;
      warnings.push(
        lang === 'zh'
          ? `與「${other.title}」(${other.startTime}) 重疊 ${overlap} 分鐘`
          : `Overlaps "${other.title}" (${other.startTime}) by ${overlap} min`
      );
    }
  }

  return warnings;
}

/**
 * Shift overlapping items forward sequentially while keeping their original duration.
 * Only adjusts items whose startTime collides with the preceding item's endTime (or identical startTime).
 */
export function autoShiftDayConflicts<T extends SchedulableItemLike>(
  items: T[],
  bufferMinutes: number = 15
): T[] {
  if (!items || items.length === 0) return items;

  const sorted = sortItineraryItemsByTime(items).map((it) => ({ ...it }));
  let cursorEndM = -1;

  for (let i = 0; i < sorted.length; i++) {
    const it = sorted[i];
    const startM = parseTimeToMinutes(it.startTime);
    if (startM === 99999) continue;

    const endM = parseTimeToMinutes(it.endTime);
    const hasValidEnd = endM !== 99999 && endM >= startM;
    const duration = hasValidEnd ? endM - startM : 0;

    let newStartM = startM;
    if (cursorEndM !== -1 && newStartM <= cursorEndM) {
      // Push past previous item's end (or same startTime) with buffer
      newStartM = Math.min(23 * 60 + 45, cursorEndM + bufferMinutes);
    }

    if (newStartM !== startM) {
      it.startTime = formatMinutesToHHMM(newStartM);
      if (hasValidEnd) {
        it.endTime = formatMinutesToHHMM(Math.min(23 * 60 + 59, newStartM + duration));
      }
    } else if (endM !== 99999 && endM < startM) {
      // Fix inverted endTime cleanly to +60m
      it.endTime = formatMinutesToHHMM(Math.min(23 * 60 + 59, startM + 60));
    }

    const updatedEndM = parseTimeToMinutes(it.endTime);
    cursorEndM = updatedEndM !== 99999 && updatedEndM >= newStartM ? updatedEndM : newStartM;
  }

  return sorted;
}
