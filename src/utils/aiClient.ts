import { Trip } from '../types/itinerary';
import { parseTextItinerary } from './storage';
import { getTodayLocal, addDaysLocal } from './date';

/**
 * Universal Parse Itinerary:
 * 1. Tries backend /api/parse-itinerary (uses server-side Gemini API in full-stack / AI Studio).
 * 2. In static hosting (GitHub Pages) or offline mode, falls back automatically
 *    to the zero-key local smart rule parser without prompting for API keys.
 */
export async function universalParseItinerary(
  text: string,
  destinationHint?: string,
  preferredCurrency: string = 'JPY',
  startDate?: string,
  endDate?: string
): Promise<{ trip: Trip; source: 'server_ai' | 'local_fallback' }> {
  try {
    const res = await fetch('/api/parse-itinerary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, destinationHint, preferredCurrency, startDate, endDate }),
    });

    if (res.ok) {
      const trip = await res.json();
      return { trip, source: 'server_ai' };
    }
  } catch {
    // Static hosting (GitHub Pages) or offline — fallback silently to local parser
  }

  const localTrip = parseTextItinerary(text, '本地智慧規則解析新行程');
  if (destinationHint) localTrip.destination = destinationHint;
  if (preferredCurrency) localTrip.currency = preferredCurrency;
  if (startDate && localTrip.days.length > 0) {
    localTrip.startDate = startDate;
    localTrip.days = localTrip.days.map((d, idx) => ({
      ...d,
      date: addDaysLocal(startDate, idx),
    }));
    localTrip.endDate = endDate || localTrip.days[localTrip.days.length - 1].date;
  }
  return { trip: localTrip, source: 'local_fallback' };
}

/**
 * Smart Trip Generator:
 * Calls backend /api/generate-trip when available; falls back to an accurately
 * dated multi-day itinerary template on static hosts or when offline.
 */
export async function generateAiTrip(params: {
  destination: string;
  daysCount: number;
  style?: string;
  preferences?: string;
  currency?: string;
  startDate?: string;
}): Promise<{ trip: Trip; source: 'server_ai' | 'local_fallback' }> {
  try {
    const res = await fetch('/api/generate-trip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (res.ok) {
      const trip = await res.json();
      return { trip, source: 'server_ai' };
    }
  } catch {
    // Static hosting or offline — fall back cleanly
  }

  const todayStr = params.startDate || getTodayLocal();
  const safeDaysCount = Math.min(Math.max(Number(params.daysCount) || 3, 1), 14);
  const days: Trip['days'] = [];

  for (let i = 0; i < safeDaysCount; i++) {
    days.push({
      id: `day-${Date.now()}-${i + 1}`,
      dayNumber: i + 1,
      date: addDaysLocal(todayStr, i),
      theme: `第 ${i + 1} 天精選行程`,
      notes: '',
      items: [
        {
          id: `item-${Date.now()}-${i}-1`,
          title: `${params.destination} 精選景點`,
          category: 'spot',
          startTime: '09:30',
          endTime: '12:00',
          locationName: params.destination,
          transportNote: '可搭乘大眾運輸前往',
          notes: '建議提早抵達避開人潮',
          completed: false,
        },
        {
          id: `item-${Date.now()}-${i}-2`,
          title: '在地人氣推薦美食',
          category: 'food',
          startTime: '12:30',
          endTime: '14:00',
          locationName: '特色美食街',
          transportNote: '步行約 5 分鐘',
          notes: '品嚐當地招牌料理',
          completed: false,
        },
      ],
    });
  }

  return {
    trip: {
      id: `template-${Date.now()}`,
      title: `${params.destination} ${safeDaysCount} 天自由行`,
      destination: params.destination,
      startDate: todayStr,
      endDate: addDaysLocal(todayStr, Math.max(0, safeDaysCount - 1)),
      currency: params.currency || 'JPY',
      budgetTotal: 50000,
      coverGradient: 'from-emerald-600 via-teal-600 to-cyan-700',
      notes: '祝旅途愉快！',
      days,
      packingList: [],
      todos: [],
      expenses: [],
      emergencyContacts: [
        { id: 'em-1', name: '當地報警電話', type: 'police', phone: '110' },
        { id: 'em-2', name: '救護車 / 火警', type: 'ambulance', phone: '119' },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    source: 'local_fallback',
  };
}
