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
 * Normalize a date string to YYYY-MM-DD
 */
export function normalizeDateKey(dateStr?: string): string {
  if (!dateStr) return '';
  return dateStr.trim().slice(0, 10).replace(/\//g, '-');
}

/**
 * Get weekday label for date string (supports YYYY-MM-DD and YYYY/MM/DD)
 */
export function getDayOfWeek(dateStr?: string, lang: string = 'zh'): string {
  if (!dateStr) return '';
  const normalized = normalizeDateKey(dateStr);
  const d = new Date(`${normalized}T00:00:00`);
  if (isNaN(d.getTime())) return '';
  const dayIndex = d.getDay();
  const zhDays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  const zhCnDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const jaDays = ['日', '月', '火', '水', '木', '金', '土'];
  const enDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const koDays = ['일', '월', '화', '수', '목', '금', '토'];
  if (lang === 'en') return enDays[dayIndex];
  if (lang === 'ja') return jaDays[dayIndex];
  if (lang === 'ko') return koDays[dayIndex];
  if (lang === 'zh-CN') return zhCnDays[dayIndex];
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
 * Return today's date string (YYYY-MM-DD) in a specific IANA timezone,
 * falling back cleanly to device local time if timezone is omitted or unsupported.
 */
export function getTodayInTimezone(tz?: string): string {
  if (!tz) return getTodayLocal();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Unsupported timezone identifier
  }
  return getTodayLocal();
}

/**
 * Return current minutes since midnight (0..1439) in a specific IANA timezone,
 * falling back to local device time if timezone is omitted or unsupported.
 */
export function getCurrentMinutesInTimezone(tz?: string): number {
  const now = new Date();
  if (!tz) return now.getHours() * 60 + now.getMinutes();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const hourRaw = Number(parts.find((p) => p.type === 'hour')?.value);
    const minuteRaw = Number(parts.find((p) => p.type === 'minute')?.value);
    if (Number.isFinite(hourRaw) && Number.isFinite(minuteRaw)) {
      const hour = hourRaw === 24 ? 0 : hourRaw;
      return hour * 60 + minuteRaw;
    }
  } catch {
    // Fallback below
  }
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Add or subtract days to a YYYY-MM-DD date string safely in local timezone
 */
export function addDaysLocal(baseDateStr: string, offsetDays: number): string {
  const clean = normalizeDateKey(baseDateStr);
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
 * Check if a date string matches today's date (in target timezone if provided, else local)
 */
export function isDateToday(dateStr?: string, tz?: string): boolean {
  if (!dateStr) return false;
  const clean = normalizeDateKey(dateStr);
  return clean === getTodayInTimezone(tz);
}

/**
 * Parse time string (e.g. "09:30", "9:30", "14:00") into minutes from midnight (0..1439).
 * Returns 99999 if time is empty or invalid, so unscheduled items appear at the end.
 */
export function parseTimeToMinutes(timeStr?: string): number {
  if (!timeStr || !timeStr.trim()) return 99999;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (!isNaN(hours) && !isNaN(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return hours * 60 + minutes;
    }
  }
  return 99999;
}

/**
 * Determine whether an event starting in the evening and ending in early morning
 * represents a legitimate overnight activity (e.g., 22:00 ~ 01:30 or red-eye flight).
 */
export function isOvernightTimeRange(startM: number, endM: number): boolean {
  return startM !== 99999 && endM !== 99999 && startM >= 18 * 60 && endM <= 6 * 60 && endM < startM;
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
  beforeItem?: T;
  afterItem?: T;
} {
  const newMinutes = parseTimeToMinutes(newItemTime);

  if (newMinutes === 99999 || items.length === 0) {
    const afterItem = items.length > 0 ? items[items.length - 1] : undefined;
    return {
      targetIndex: items.length,
      beforeItem: undefined,
      afterItem,
    };
  }

  let targetIndex = -1;
  for (let i = 0; i < items.length; i++) {
    const itemMinutes = parseTimeToMinutes(items[i].startTime);
    if (itemMinutes > newMinutes) {
      targetIndex = i;
      break;
    }
  }

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
 * If there are existing items, picks a time after the last item's endTime or startTime + 45m.
 * Defaults to "09:00" if no items exist.
 */
export function getSuggestedNextStartTime<T extends { startTime?: string; endTime?: string }>(
  items: T[]
): string {
  if (!items || items.length === 0) return '09:00';

  let maxMinutes = -1;
  for (const it of items) {
    const startM = parseTimeToMinutes(it.startTime);
    const endM = parseTimeToMinutes(it.endTime);
    let effectiveM = startM;
    if (endM !== 99999) {
      effectiveM = isOvernightTimeRange(startM, endM) ? 23 * 60 + 30 : Math.max(startM === 99999 ? -1 : startM, endM);
    }
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

export type TimeConflictType = 'overlap' | 'invalid_range';

export interface ScheduleConflict {
  id: string;
  type: TimeConflictType;
  itemAId: string;
  itemATitle: string;
  itemBId?: string;
  itemBTitle?: string;
  overlapMinutes?: number;
  message: string;
}

export interface DayConflictReport {
  conflicts: ScheduleConflict[];
  conflictedItemIds: string[];
  hasFixableOverlap: boolean;
}

export function formatMinutesToHHMM(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface SchedulableItemLike {
  id: string;
  title: string;
  startTime?: string;
  endTime?: string;
  lat?: number;
  lng?: number;
}

function isZhLang(lang: string): boolean {
  return lang === 'zh' || lang === 'zh-CN';
}

/**
 * Analyze a single day's sorted itinerary items for invalid time ranges
 * and genuine overlapping time windows — including non-adjacent overlaps
 * (e.g. a long 09:00-15:00 tour overlapping multiple short spots inside it).
 * Legitimate overnight items (18:00+ -> <=06:00) are respected without false alerts.
 */
export function detectDayTimeConflicts<T extends SchedulableItemLike>(
  items: T[],
  lang: string = 'zh'
): DayConflictReport {
  if (!items || items.length === 0) {
    return { conflicts: [], conflictedItemIds: [], hasFixableOverlap: false };
  }

  const zh = isZhLang(lang);
  const sorted = sortItineraryItemsByTime(items);
  const conflicts: ScheduleConflict[] = [];
  const conflictedSet = new Set<string>();
  let hasFixableOverlap = false;

  const parsed = sorted.map((it) => {
    const startM = parseTimeToMinutes(it.startTime);
    const endM = parseTimeToMinutes(it.endTime);
    const overnight = isOvernightTimeRange(startM, endM);
    const effectiveEndM =
      startM === 99999
        ? 99999
        : overnight
          ? 24 * 60
          : endM !== 99999 && endM >= startM
            ? endM
            : startM;
    return { item: it, startM, endM, overnight, effectiveEndM };
  });

  for (let i = 0; i < parsed.length; i++) {
    const curr = parsed[i];

    // Check genuinely inverted time range (excluding intentional overnight spans)
    if (curr.startM !== 99999 && curr.endM !== 99999 && curr.endM < curr.startM && !curr.overnight) {
      conflictedSet.add(curr.item.id);
      conflicts.push({
        id: `invalid-${curr.item.id}`,
        type: 'invalid_range',
        itemAId: curr.item.id,
        itemATitle: curr.item.title,
        message: zh
          ? `「${curr.item.title}」結束時間 (${curr.item.endTime}) 早於開始時間 (${curr.item.startTime})`
          : `"${curr.item.title}" end time (${curr.item.endTime}) is before start time (${curr.item.startTime})`,
      });
    }

    if (curr.startM === 99999) continue;

    // Compare against ALL subsequent scheduled items (catches non-adjacent overlaps too)
    for (let j = i + 1; j < parsed.length; j++) {
      const next = parsed[j];
      if (next.startM === 99999) break;

      if (next.startM === curr.startM) {
        conflictedSet.add(curr.item.id);
        conflictedSet.add(next.item.id);
        hasFixableOverlap = true;
        conflicts.push({
          id: `same-${curr.item.id}-${next.item.id}`,
          type: 'overlap',
          itemAId: curr.item.id,
          itemATitle: curr.item.title,
          itemBId: next.item.id,
          itemBTitle: next.item.title,
          overlapMinutes: 0,
          message: zh
            ? `「${curr.item.title}」與「${next.item.title}」開始時間同為 ${curr.item.startTime}`
            : `"${curr.item.title}" and "${next.item.title}" share start time ${curr.item.startTime}`,
        });
      } else if (curr.effectiveEndM > curr.startM && next.startM < curr.effectiveEndM) {
        const overlapMinutes = curr.effectiveEndM - next.startM;
        conflictedSet.add(curr.item.id);
        conflictedSet.add(next.item.id);
        hasFixableOverlap = true;
        conflicts.push({
          id: `overlap-${curr.item.id}-${next.item.id}`,
          type: 'overlap',
          itemAId: curr.item.id,
          itemATitle: curr.item.title,
          itemBId: next.item.id,
          itemBTitle: next.item.title,
          overlapMinutes,
          message: zh
            ? `「${curr.item.title}」與「${next.item.title}」重疊 ${overlapMinutes} 分鐘`
            : `"${curr.item.title}" overlaps with "${next.item.title}" by ${overlapMinutes} min`,
        });
      } else {
        // Since sorted by startM, no further item can start before curr.effectiveEndM
        break;
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
  const zh = isZhLang(lang);
  const cStart = parseTimeToMinutes(candidate.startTime);
  const cEnd = parseTimeToMinutes(candidate.endTime);
  const cOvernight = isOvernightTimeRange(cStart, cEnd);

  if (cStart !== 99999 && cEnd !== 99999 && cEnd < cStart && !cOvernight) {
    warnings.push(
      zh
        ? `結束時間 (${candidate.endTime}) 早於開始時間 (${candidate.startTime})`
        : `End time (${candidate.endTime}) is earlier than start time (${candidate.startTime})`
    );
  }

  if (cStart === 99999) return warnings;

  const effectiveCEnd = cOvernight ? 24 * 60 : cEnd !== 99999 && cEnd >= cStart ? cEnd : cStart;

  for (const other of others) {
    if (candidate.id && other.id === candidate.id) continue;
    const oStart = parseTimeToMinutes(other.startTime);
    const oEnd = parseTimeToMinutes(other.endTime);
    if (oStart === 99999) continue;

    if (oStart === cStart) {
      warnings.push(
        zh
          ? `與「${other.title}」開始時間相同 (${other.startTime})`
          : `Same start time as "${other.title}" (${other.startTime})`
      );
      continue;
    }

    const oOvernight = isOvernightTimeRange(oStart, oEnd);
    const effectiveOEnd = oOvernight ? 24 * 60 : oEnd !== 99999 && oEnd >= oStart ? oEnd : oStart;

    if (effectiveOEnd > oStart && cStart < effectiveOEnd && cStart >= oStart) {
      const overlap = effectiveOEnd - cStart;
      warnings.push(
        zh
          ? `與「${other.title}」(${other.startTime}-${other.endTime}) 重疊 ${overlap} 分鐘`
          : `Overlaps "${other.title}" (${other.startTime}-${other.endTime}) by ${overlap} min`
      );
    } else if (effectiveCEnd > cStart && oStart >= cStart && oStart < effectiveCEnd) {
      const overlap = effectiveCEnd - oStart;
      warnings.push(
        zh
          ? `與「${other.title}」(${other.startTime}) 重疊 ${overlap} 分鐘`
          : `Overlaps "${other.title}" (${other.startTime}) by ${overlap} min`
      );
    }
  }

  return warnings;
}

/**
 * Shift overlapping items forward sequentially while keeping their original duration.
 * Avoids clamping pile-ups at 23:45 and leaves valid overnight activities intact.
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
    const overnight = isOvernightTimeRange(startM, endM);
    const hasValidEnd = !overnight && endM !== 99999 && endM >= startM;
    const duration = hasValidEnd ? endM - startM : 0;

    let newStartM = startM;
    if (cursorEndM !== -1 && newStartM <= cursorEndM) {
      // Only add buffer if there is enough room before midnight; otherwise sit tightly after previous end
      const withBuffer = cursorEndM + bufferMinutes;
      if (withBuffer <= 23 * 60 + 50) {
        newStartM = withBuffer;
      } else {
        newStartM = Math.min(23 * 60 + 55, cursorEndM + 5);
      }
    }

    if (newStartM !== startM) {
      it.startTime = formatMinutesToHHMM(newStartM);
      if (hasValidEnd) {
        it.endTime = formatMinutesToHHMM(Math.min(23 * 60 + 59, newStartM + duration));
      }
    } else if (endM !== 99999 && endM < startM && !overnight) {
      // Fix genuinely inverted endTime cleanly to +60m
      it.endTime = formatMinutesToHHMM(Math.min(23 * 60 + 59, startM + 60));
    }

    const updatedEndM = parseTimeToMinutes(it.endTime);
    const updatedOvernight = isOvernightTimeRange(newStartM, updatedEndM);
    cursorEndM = updatedOvernight
      ? 23 * 60 + 55
      : updatedEndM !== 99999 && updatedEndM >= newStartM
        ? updatedEndM
        : newStartM;
  }

  return sorted;
}
