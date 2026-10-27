import { Trip } from '../types/itinerary';
import { parseTextItinerary } from './storage';

const STORAGE_KEY_USER_GEMINI_KEY = 'wayfarer_user_gemini_key';

export function getCustomGeminiKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_USER_GEMINI_KEY) || '';
  } catch {
    return '';
  }
}

export function setCustomGeminiKey(key: string): void {
  try {
    if (key.trim()) {
      localStorage.setItem(STORAGE_KEY_USER_GEMINI_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_USER_GEMINI_KEY);
    }
  } catch (e) {
    console.error('Failed to save key:', e);
  }
}

/**
 * Universal Parse Itinerary:
 * 1. First tries backend /api/parse-itinerary (works in full-stack, Docker, or AI Studio)
 * 2. If running on static host (e.g. GitHub Pages) and backend is not present (404/network error):
 *    - Uses client-side custom Gemini key (if user entered one)
 *    - Otherwise falls back to local rule-based parser
 */
export async function universalParseItinerary(
  text: string,
  destinationHint?: string,
  preferredCurrency: string = 'JPY',
  startDate?: string,
  endDate?: string
): Promise<{ trip: Trip; source: 'server_ai' | 'client_ai' | 'local_fallback' }> {
  // 1. Try server backend first
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
  } catch (serverErr) {
    console.warn('Backend server unavailable (likely static hosting like GitHub Pages):', serverErr);
  }

  // 2. Check if client-side custom Gemini API key exists
  const clientKey = getCustomGeminiKey();
  if (clientKey) {
    try {
      const todayStr = startDate || new Date().toISOString().slice(0, 10);
      const prompt = `你是一位專業旅遊規劃專家。請解析以下旅遊內容為合法 JSON。
重要：每個景點必須提供真實經緯度數值 (lat, lng)。時間格式為 HH:MM。
類別 category 只能是: spot, food, transport, hotel, shopping, activity。
一律使用繁體中文。
格式結構：
{
  "title": "行程名稱",
  "destination": "目的地城市與國家",
  "startDate": "${todayStr}",
  "endDate": "${todayStr}",
  "currency": "${preferredCurrency}",
  "budgetTotal": 30000,
  "notes": "隨身叮嚀",
  "days": [
    {
      "dayNumber": 1,
      "date": "${todayStr}",
      "theme": "當日特色",
      "notes": "備忘",
      "items": [
        {
          "title": "景點名",
          "category": "spot",
          "startTime": "09:00",
          "endTime": "11:00",
          "locationName": "地點",
          "address": "地址",
          "lat": 35.6586,
          "lng": 139.7454,
          "transportNote": "交通指引",
          "notes": "備忘叮嚀",
          "cost": 1000
        }
      ]
    }
  ]
}

待解析文字：
${destinationHint ? `目的地提示: ${destinationHint}\n` : ''}
${text}`;

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${clientKey}`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const rawResponse = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawResponse) {
          const tripData = JSON.parse(rawResponse);
          const trip: Trip = {
            id: `client-ai-${Date.now()}`,
            title: tripData.title || 'AI 解析旅程',
            destination: tripData.destination || '目的地',
            startDate: tripData.startDate || todayStr,
            endDate: tripData.endDate || todayStr,
            currency: tripData.currency || preferredCurrency,
            budgetTotal: tripData.budgetTotal || 30000,
            coverGradient: 'from-emerald-600 via-teal-600 to-cyan-700',
            notes: tripData.notes || '',
            days: (tripData.days || []).map((d: any, dIdx: number) => ({
              id: `day-${Date.now()}-${dIdx + 1}`,
              dayNumber: d.dayNumber || dIdx + 1,
              date: d.date || todayStr,
              theme: d.theme || `第 ${dIdx + 1} 天`,
              notes: d.notes || '',
              items: (d.items || []).map((it: any, iIdx: number) => ({
                id: `item-${Date.now()}-${dIdx}-${iIdx}`,
                title: it.title,
                category: it.category || 'spot',
                startTime: it.startTime || '09:00',
                endTime: it.endTime,
                locationName: it.locationName,
                address: it.address,
                lat: typeof it.lat === 'number' ? it.lat : undefined,
                lng: typeof it.lng === 'number' ? it.lng : undefined,
                transportNote: it.transportNote,
                notes: it.notes,
                bookingCode: it.bookingCode,
                cost: it.cost,
                costPaid: false,
                completed: false,
              })),
            })),
            packingList: [],
            todos: [],
            expenses: [],
            emergencyContacts: [
              { id: 'em-1', name: '當地報警電話', type: 'police', phone: '110' },
              { id: 'em-2', name: '救護車 / 火警', type: 'ambulance', phone: '119' },
            ],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          return { trip, source: 'client_ai' };
        }
      }
    } catch (clientErr) {
      console.warn('Client-side AI call error, falling back to local:', clientErr);
    }
  }

  // 3. Fallback to local rule parser
  const localTrip = parseTextItinerary(text, '本地規則解析新行程');
  if (destinationHint) localTrip.destination = destinationHint;
  return { trip: localTrip, source: 'local_fallback' };
}

/**
 * AI Smart Trip Generator:
 * Generates a full itinerary from destination, days count, style, preferences
 */
export async function generateAiTrip(params: {
  destination: string;
  daysCount: number;
  style?: string;
  preferences?: string;
  currency?: string;
  startDate?: string;
}): Promise<Trip> {
  // 1. Try server backend first
  try {
    const res = await fetch('/api/generate-trip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('Backend server generate-trip error, attempting fallback:', e);
  }

  // 2. Client-side Gemini fallback
  const clientKey = getCustomGeminiKey();
  if (clientKey) {
    const prompt = `請為我規劃以下旅遊行程：
- 目的地：${params.destination}
- 天數：${params.daysCount} 天
- 出發日期：${params.startDate || new Date().toISOString().slice(0, 10)}
- 偏好風格：${params.style || '經典必去、美食探索'}
- 特別願望或指定景點：${params.preferences || '無'}
- 幣別：${params.currency || 'JPY'}`;

    const { trip } = await universalParseItinerary(prompt, params.destination, params.currency || 'JPY');
    return trip;
  }

  // 3. Fallback to basic template
  const todayStr = params.startDate || new Date().toISOString().slice(0, 10);
  const days: any[] = [];
  const start = new Date(todayStr);

  for (let i = 0; i < params.daysCount; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push({
      id: `day-${Date.now()}-${i + 1}`,
      dayNumber: i + 1,
      date: d.toISOString().slice(0, 10),
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
    id: `template-${Date.now()}`,
    title: `${params.destination} ${params.daysCount} 天自由行`,
    destination: params.destination,
    startDate: todayStr,
    endDate: todayStr,
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
  };
}
