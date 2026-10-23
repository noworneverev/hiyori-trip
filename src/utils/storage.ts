import { Trip, DayPlan, ItineraryItem, CategoryType } from '../types/itinerary';
import { PRESET_TRIPS } from '../data/presetTrips';
import { HOKURIKU_CHUBU_9DAYS_TRIP } from '../data/hokurikuMasterpieceTrip';

const STORAGE_KEY_TRIPS = 'wayfarer_trips_data_v1';
const STORAGE_KEY_CURRENT_ID = 'wayfarer_current_trip_id_v1';

export function getStoredTrips(): Trip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRIPS);
    if (!raw) {
      // First run: load presets into local storage
      localStorage.setItem(STORAGE_KEY_TRIPS, JSON.stringify(PRESET_TRIPS));
      localStorage.setItem(STORAGE_KEY_CURRENT_ID, PRESET_TRIPS[0].id);
      return PRESET_TRIPS;
    }
    const trips = JSON.parse(raw);
    if (Array.isArray(trips) && trips.length > 0) {
      // Keep only Hokuriku and any user custom created trips; filter out old sample presets
      const cleaned = trips.filter(
        (t: Trip) =>
          t.id !== 'preset-tokyo-5days' &&
          t.id !== 'preset-kyoto-osaka-6days' &&
          t.id !== 'preset-hokkaido-winter-7days'
      );
      const idx = cleaned.findIndex((t: Trip) => t.id === 'preset-hokuriku-chubu-9days');
      if (idx === -1) {
        cleaned.unshift(HOKURIKU_CHUBU_9DAYS_TRIP);
      } else {
        // Ensure Hokuriku trip has valid days, notes, and todos without clobbering user modifications
        cleaned[idx] = {
          ...HOKURIKU_CHUBU_9DAYS_TRIP,
          ...cleaned[idx],
          days: (cleaned[idx].days && cleaned[idx].days.length > 0)
            ? cleaned[idx].days
            : HOKURIKU_CHUBU_9DAYS_TRIP.days,
          notes: cleaned[idx].notes !== undefined
            ? cleaned[idx].notes
            : HOKURIKU_CHUBU_9DAYS_TRIP.notes,
          todos: cleaned[idx].todos !== undefined
            ? cleaned[idx].todos
            : HOKURIKU_CHUBU_9DAYS_TRIP.todos,
          packingList: cleaned[idx].packingList !== undefined
            ? cleaned[idx].packingList
            : HOKURIKU_CHUBU_9DAYS_TRIP.packingList,
          expenses: cleaned[idx].expenses !== undefined
            ? cleaned[idx].expenses
            : HOKURIKU_CHUBU_9DAYS_TRIP.expenses,
        };
      }
      localStorage.setItem(STORAGE_KEY_TRIPS, JSON.stringify(cleaned));
      return cleaned;
    }
    return PRESET_TRIPS;
  } catch (err) {
    console.error('Error loading trips from local storage:', err);
    return PRESET_TRIPS;
  }
}

export function saveTrips(trips: Trip[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_TRIPS, JSON.stringify(trips));
  } catch (err) {
    console.error('Error saving trips to local storage:', err);
  }
}

export function getCurrentTripId(): string {
  try {
    const id = localStorage.getItem(STORAGE_KEY_CURRENT_ID);
    if (id) return id;
    const trips = getStoredTrips();
    if (trips.length > 0) return trips[0].id;
  } catch (e) {
    // fallback
  }
  return PRESET_TRIPS[0].id;
}

export function setCurrentTripId(id: string): void {
  localStorage.setItem(STORAGE_KEY_CURRENT_ID, id);
}

export function getStorageUsage(): { bytes: number; formatted: string; count: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRIPS) || '';
    const bytes = new Blob([raw]).size;
    const formatted = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
    const trips = getStoredTrips();
    return { bytes, formatted, count: trips.length };
  } catch (e) {
    return { bytes: 0, formatted: '0 KB', count: 0 };
  }
}

/**
 * Download a trip or entire database as JSON file for full backup
 */
export function exportTripToJSON(trip: Trip): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(trip, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  const safeTitle = trip.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_');
  downloadAnchor.setAttribute('download', `${safeTitle}_行程備份.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

export function exportAllTripsToJSON(trips: Trip[]): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(trips, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `日和手帳_所有旅遊行程完整備份_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

/**
 * Export trip as Markdown / Printable format
 */
export function exportTripToMarkdown(trip: Trip): void {
  let md = `# ✈️ ${trip.title}\n\n`;
  md += `**目的地:** ${trip.destination}\n`;
  md += `**日期:** ${trip.startDate} ~ ${trip.endDate}\n`;
  md += `**幣別 / 預算:** ${trip.currency} ${trip.budgetTotal.toLocaleString()}\n`;
  if (trip.notes) md += `**備註事項:** ${trip.notes}\n`;
  md += `\n---\n\n`;

  trip.days.forEach((day) => {
    md += `## 📅 第 ${day.dayNumber} 天 (${day.date})${day.theme ? ` - ${day.theme}` : ''}\n`;
    if (day.notes) md += `*每日叮嚀: ${day.notes}*\n\n`;

    day.items.forEach((item, idx) => {
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

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', url);
  downloadAnchor.setAttribute('download', `${trip.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_')}_行程清單.md`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Smart Text Parser: converts unstructured travel text notes into structured Days & Items
 */
export function parseTextItinerary(rawText: string, tripTitle = '匯入的旅遊行程'): Trip {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  
  const today = new Date();
  const startDate = today.toISOString().slice(0, 10);
  
  const days: DayPlan[] = [];
  let currentDay: DayPlan | null = null;
  let dayCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect Day Header: Day 1, Day1, 第一天, D1, 2026-10-15 etc.
    const dayMatch = line.match(/^(?:Day\s*(\d+)|第\s*([一二三四五六七八九十\d]+)\s*天|D(\d+))/i);
    if (dayMatch || line.startsWith('### Day') || line.startsWith('## Day')) {
      const dayNum = dayCounter++;
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + (dayNum - 1));
      
      const theme = line.replace(/^(?:Day\s*\d+|第[一二三四五六七八九十\d]+天|D\d+|#+)\s*[:：\-]?\s*/i, '').trim();

      currentDay = {
        id: `imported-day-${Date.now()}-${dayNum}`,
        dayNumber: dayNum,
        date: targetDate.toISOString().slice(0, 10),
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

    // Try to detect time: "09:30 淺草寺", "14:00 - 16:00 晴空塔"
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
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        title: content,
        category,
        startTime,
        endTime,
        completed: false,
      });
      continue;
    }

    // Check if bullet point or text item
    const bulletMatch = line.match(/^[-*•\d+.]\s*(.*)$/);
    const itemTitle = bulletMatch ? bulletMatch[1].trim() : line;
    if (itemTitle.length > 1) {
      const defaultTime = `${String(8 + Math.min(currentDay.items.length * 2, 12)).padStart(2, '0')}:00`;
      currentDay.items.push({
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        title: itemTitle,
        category: 'spot',
        startTime: defaultTime,
        completed: false,
      });
    }
  }

  // Calculate end date
  const lastDayDate = days.length > 0 ? days[days.length - 1].date : startDate;

  return {
    id: `trip-${Date.now()}`,
    title: tripTitle || '匯入的旅遊新行程',
    destination: '自訂目的地',
    startDate,
    endDate: lastDayDate,
    currency: 'TWD',
    budgetTotal: 20000,
    coverGradient: 'from-teal-600 via-emerald-600 to-cyan-700',
    days: days.length > 0 ? days : [
      {
        id: `day-${Date.now()}-1`,
        dayNumber: 1,
        date: startDate,
        theme: '精彩第一天',
        items: [],
      }
    ],
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
 * CSV Import Parser
 */
export function parseCSVItinerary(csvContent: string): Trip {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV 檔案行數不足');
  }

  // Header checking
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const dayIdx = headers.findIndex(h => h.includes('day') || h.includes('天'));
  const timeIdx = headers.findIndex(h => h.includes('time') || h.includes('時間'));
  const titleIdx = headers.findIndex(h => h.includes('title') || h.includes('景點') || h.includes('名稱') || h.includes('name'));
  const noteIdx = headers.findIndex(h => h.includes('note') || h.includes('備忘') || h.includes('備註'));
  const locationIdx = headers.findIndex(h => h.includes('location') || h.includes('地點') || h.includes('address'));
  const costIdx = headers.findIndex(h => h.includes('cost') || h.includes('費用') || h.includes('價格'));

  const daysMap = new Map<number, ItineraryItem[]>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    const dayNum = dayIdx !== -1 ? parseInt(cols[dayIdx], 10) || 1 : 1;
    const time = timeIdx !== -1 && cols[timeIdx] ? cols[timeIdx] : '10:00';
    const title = titleIdx !== -1 && cols[titleIdx] ? cols[titleIdx] : cols[0] || '景點行程';
    const notes = noteIdx !== -1 ? cols[noteIdx] : undefined;
    const locationName = locationIdx !== -1 ? cols[locationIdx] : undefined;
    const cost = costIdx !== -1 ? parseFloat(cols[costIdx]) || undefined : undefined;

    const item: ItineraryItem = {
      id: `csv-item-${Date.now()}-${i}`,
      title,
      category: 'spot',
      startTime: time,
      locationName,
      notes,
      cost,
      completed: false,
    };

    if (!daysMap.has(dayNum)) {
      daysMap.set(dayNum, []);
    }
    daysMap.get(dayNum)!.push(item);
  }

  const today = new Date();
  const sortedDayNumbers = Array.from(daysMap.keys()).sort((a, b) => a - b);
  const days: DayPlan[] = sortedDayNumbers.map(dayNum => {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + (dayNum - 1));
    return {
      id: `csv-day-${dayNum}`,
      dayNumber: dayNum,
      date: targetDate.toISOString().slice(0, 10),
      theme: `第 ${dayNum} 天行程安排`,
      items: daysMap.get(dayNum) || [],
    };
  });

  return {
    id: `trip-csv-${Date.now()}`,
    title: 'CSV 匯入旅遊行程',
    destination: '自訂目的地',
    startDate: today.toISOString().slice(0, 10),
    endDate: (days.length > 0 ? days[days.length - 1].date : today.toISOString().slice(0, 10)),
    currency: 'TWD',
    budgetTotal: 15000,
    coverGradient: 'from-sky-600 via-indigo-600 to-purple-700',
    days: days.length > 0 ? days : [
      {
        id: `csv-day-1`,
        dayNumber: 1,
        date: today.toISOString().slice(0, 10),
        theme: '第一天',
        items: [],
      }
    ],
    packingList: [],
    expenses: [],
    emergencyContacts: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
