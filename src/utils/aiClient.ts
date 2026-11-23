import { Trip } from '../types/itinerary';
import { parseTextItinerary } from './storage';
import { getTodayLocal, addDaysLocal } from './date';

const AI_REQUEST_TIMEOUT_MS = 25000;
const BYOK_GEMINI_STORAGE_KEY = 'hiyori_byok_gemini_key_v1';

export type AiBackendMode = 'server' | 'byok' | 'local_only';

let cachedServerAiAvailable: boolean | null = null;

export function getUserGeminiApiKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem(BYOK_GEMINI_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function saveUserGeminiApiKey(apiKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      localStorage.removeItem(BYOK_GEMINI_STORAGE_KEY);
    } else {
      localStorage.setItem(BYOK_GEMINI_STORAGE_KEY, trimmed);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Probes /api/health once per session to distinguish full server deployments from static hosts
 * (such as GitHub Pages) so the UI never presents broken AI server buttons.
 */
export async function checkAiAvailability(forceRefresh = false): Promise<AiBackendMode> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'local_only';
  }

  if (cachedServerAiAvailable === null || forceRefresh) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch('/api/health', { method: 'GET', signal: controller.signal });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          cachedServerAiAvailable = Boolean(data?.status === 'ok' && data?.hasAiApiKey);
        } else {
          cachedServerAiAvailable = false;
        }
      } else {
        cachedServerAiAvailable = false;
      }
    } catch {
      cachedServerAiAvailable = false;
    } finally {
      window.clearTimeout(timer);
    }
  }

  if (cachedServerAiAvailable) return 'server';
  if (getUserGeminiApiKey()) return 'byok';
  return 'local_only';
}

function isValidReturnedTrip(candidate: any): candidate is Trip {
  return Boolean(
    candidate &&
      typeof candidate === 'object' &&
      typeof candidate.title === 'string' &&
      Array.isArray(candidate.days) &&
      candidate.days.length > 0
  );
}

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function hydrateAiTripPayload(
  tripData: any,
  fallbackCurrency = 'JPY',
  fallbackStartDate?: string,
  fallbackEndDate?: string
): Trip {
  const todayStr = fallbackStartDate || getTodayLocal();
  const rawDays = Array.isArray(tripData.days) ? tripData.days : [];
  const startDate = tripData.startDate || todayStr;
  const endDate =
    tripData.endDate ||
    fallbackEndDate ||
    (rawDays.length > 0 ? addDaysLocal(startDate, rawDays.length - 1) : startDate);

  const now = Date.now();
  return {
    id: `ai-trip-${now}`,
    title: String(tripData.title || 'AI 智慧規劃行程').trim(),
    destination: String(tripData.destination || '旅遊目的地').trim(),
    startDate,
    endDate,
    currency: String(tripData.currency || fallbackCurrency || 'JPY'),
    budgetTotal: Number(tripData.budgetTotal) || 40000,
    coverGradient: 'from-emerald-600 via-teal-600 to-cyan-700',
    notes: String(tripData.notes || ''),
    days: rawDays.map((day: any, dIdx: number) => ({
      id: `day-${now}-${dIdx + 1}`,
      dayNumber: Number(day.dayNumber) || dIdx + 1,
      date: day.date || addDaysLocal(startDate, dIdx),
      theme: day.theme || `第 ${dIdx + 1} 天行程`,
      notes: day.notes || '',
      items: Array.isArray(day.items)
        ? day.items.map((item: any, iIdx: number) => ({
            id: `item-${now}-${dIdx + 1}-${iIdx + 1}`,
            title: String(item.title || '精選景點'),
            category: item.category || 'spot',
            startTime: item.startTime || '09:00',
            endTime: item.endTime || undefined,
            locationName: item.locationName || undefined,
            address: item.address || undefined,
            lat: typeof item.lat === 'number' && Number.isFinite(item.lat) ? item.lat : undefined,
            lng: typeof item.lng === 'number' && Number.isFinite(item.lng) ? item.lng : undefined,
            transportNote: item.transportNote || undefined,
            notes: item.notes || undefined,
            bookingCode: item.bookingCode || undefined,
            cost: typeof item.cost === 'number' && Number.isFinite(item.cost) ? item.cost : undefined,
            completed: false,
          }))
        : [],
    })),
    packingList: [],
    todos: [],
    expenses: [],
    emergencyContacts: [
      { id: 'em-1', name: '當地報警電話', type: 'police', phone: '110' },
      { id: 'em-2', name: '救護車 / 火警', type: 'ambulance', phone: '119' },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

async function callByokGeminiJson(systemPrompt: string, userPrompt: string): Promise<any | null> {
  const key = getUserGeminiApiKey();
  if (!key) return null;

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  for (const model of models) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });
      if (!res.ok) continue;
      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof rawText === 'string' && rawText.trim()) {
        return JSON.parse(stripCodeFences(rawText));
      }
    } catch {
      // Try next model or fall back to local rules
    } finally {
      window.clearTimeout(timer);
    }
  }
  return null;
}

async function fetchJsonWithTimeout(url: string, body: unknown, timeoutMs = AI_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Universal Parse Itinerary:
 * 1. Tries backend /api/parse-itinerary when server proxy is available.
 * 2. Tries user's optional BYOK Gemini API key directly from browser (great for GitHub Pages).
 * 3. Falls back cleanly to zero-key local rule parser when offline or unconfigured.
 */
export async function universalParseItinerary(
  text: string,
  destinationHint?: string,
  preferredCurrency: string = 'JPY',
  startDate?: string,
  endDate?: string
): Promise<{ trip: Trip; source: 'server_ai' | 'local_fallback'; fallbackReason?: string }> {
  let fallbackReason: string | undefined;

  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    const mode = await checkAiAvailability();
    if (mode === 'server') {
      try {
        const res = await fetchJsonWithTimeout('/api/parse-itinerary', {
          text,
          destinationHint,
          preferredCurrency,
          startDate,
          endDate,
        });

        if (res.ok) {
          const trip = await res.json();
          if (isValidReturnedTrip(trip)) {
            return { trip, source: 'server_ai' };
          }
          fallbackReason = 'AI 回傳格式不完整，已自動改用本機規則解析';
        } else {
          const errPayload = await res.json().catch(() => null);
          fallbackReason = errPayload?.error || `雲端 AI 服務暫時不可用 (${res.status})`;
        }
      } catch (err: any) {
        fallbackReason =
          err?.name === 'AbortError' ? '雲端 AI 解析逾時，已改用本機規則解析' : undefined;
      }
    } else if (mode === 'byok') {
      const todayStr = startDate || getTodayLocal();
      const systemPrompt = `你是精通全球旅遊地理的行程整理專家。請將使用者提供的行程文字解析成繁體中文 JSON 物件，欄位包含：title, destination, startDate(YYYY-MM-DD, 預設 ${todayStr}), endDate, currency(預設 ${preferredCurrency}), budgetTotal, notes, days([{ dayNumber, date, theme, notes, items([{ title, category('spot'|'food'|'transport'|'hotel'|'shopping'|'activity'|'other'), startTime('HH:MM'), endTime, locationName, address, lat, lng, transportNote, notes, bookingCode, cost }]) }])。請務必填寫精準經緯度 lat/lng。`;
      const userPrompt = `${destinationHint ? `目的地參考：${destinationHint}\n` : ''}行程文字：\n${text.slice(0, 30000)}`;
      const parsed = await callByokGeminiJson(systemPrompt, userPrompt);
      if (parsed && Array.isArray(parsed.days) && parsed.days.length > 0) {
        return {
          trip: hydrateAiTripPayload(parsed, preferredCurrency, startDate, endDate),
          source: 'server_ai',
        };
      }
      fallbackReason = '自訂 Gemini Key 解析失敗，已改用本機規則解析';
    }
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
  return { trip: localTrip, source: 'local_fallback', fallbackReason };
}

/**
 * Smart Trip Generator with server proxy, BYOK Gemini key, and deterministic offline template fallback.
 */
export async function generateAiTrip(params: {
  destination: string;
  daysCount: number;
  style?: string;
  preferences?: string;
  currency?: string;
  startDate?: string;
}): Promise<{ trip: Trip; source: 'server_ai' | 'local_fallback'; fallbackReason?: string }> {
  let fallbackReason: string | undefined;

  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    const mode = await checkAiAvailability();
    if (mode === 'server') {
      try {
        const res = await fetchJsonWithTimeout('/api/generate-trip', params);
        if (res.ok) {
          const trip = await res.json();
          if (isValidReturnedTrip(trip)) {
            return { trip, source: 'server_ai' };
          }
          fallbackReason = 'AI 回傳格式不完整，已套用本機行程範本';
        } else {
          const errPayload = await res.json().catch(() => null);
          fallbackReason = errPayload?.error || `雲端 AI 服務暫時不可用 (${res.status})`;
        }
      } catch (err: any) {
        fallbackReason =
          err?.name === 'AbortError' ? '雲端 AI 生成逾時，已改用本機行程範本' : undefined;
      }
    } else if (mode === 'byok') {
      const todayStr = params.startDate || getTodayLocal();
      const safeDays = Math.min(Math.max(Number(params.daysCount) || 3, 1), 14);
      const systemPrompt = `你是資深旅遊規劃師。請輸出繁體中文旅遊行程 JSON，欄位：title, destination, startDate(YYYY-MM-DD, 從 ${todayStr} 起), endDate, currency(${params.currency || 'JPY'}), budgetTotal, notes, days([{ dayNumber, date, theme, notes, items([{ title, category('spot'|'food'|'transport'|'hotel'|'shopping'|'activity'|'other'), startTime('HH:MM'), endTime, locationName, address, lat, lng, transportNote, notes }]) }])。每個景點都要填真實經緯度 lat/lng。`;
      const userPrompt = `目的地：${params.destination}，天數：${safeDays} 天，風格：${params.style || '自由行'}，偏好：${params.preferences || '美食與經典景點'}`;
      const parsed = await callByokGeminiJson(systemPrompt, userPrompt);
      if (parsed && Array.isArray(parsed.days) && parsed.days.length > 0) {
        return {
          trip: hydrateAiTripPayload(parsed, params.currency || 'JPY', todayStr),
          source: 'server_ai',
        };
      }
      fallbackReason = '自訂 Gemini Key 生成失敗，已套用本機行程範本';
    }
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
    fallbackReason,
  };
}
