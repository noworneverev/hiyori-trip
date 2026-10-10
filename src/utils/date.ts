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
