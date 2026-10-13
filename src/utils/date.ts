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
