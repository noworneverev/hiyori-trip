import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize Google Gemini SDK
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI() : null;

// Health check / API status
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasAiApiKey: Boolean(apiKey),
  });
});

// Helper: Multi-model fallback execution
async function generateWithModelFallback(params: {
  contents: any[];
  config: any;
}) {
  if (!ai) throw new Error('Gemini API key is not configured');
  const models = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
  let lastError: any = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });
      if (response && response.text) {
        return response;
      }
    } catch (err: any) {
      console.warn(`Model ${model} request failed, attempting fallback:`, err?.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error('所有 AI 模型皆暫時無法連線，請稍後重試。');
}

// AI Intelligent Travel Itinerary Parser
app.post('/api/parse-itinerary', async (req, res) => {
  try {
    const { text, destinationHint, preferredCurrency, startDate, endDate } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: '請提供行程文字或檔案內容' });
    }

    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API Key 未設定，可使用純本地規則解析模式。',
      });
    }

    const todayStr = startDate || new Date().toISOString().slice(0, 10);

    const systemInstruction = `
你是一位精通全球旅遊地理、交通路線規劃與景點地圖的資深旅遊規劃專家。
用戶會提供任意格式的旅遊筆記、旅行社行程單、航班飯店憑證、或雜亂的文字。
你的任務是將其解析並結構化為完整、邏輯嚴謹的每日旅遊行程 JSON 物件。

【極其重要的核心要求】：
1. 嚴格輸出合法的 JSON，不要包含任何 markdown 標記包裝以外的贅字。
2. 地圖經緯度座標 (lat, lng)：每個景點、餐廳、飯店、車站或體驗，都必須提供真實世界的精準經緯度數值 (例如 東京晴空塔: lat 35.710063, lng 139.8107)。這是前端繪製路線地圖、計算景點間距離與步行時間的核心依據！請務必填寫。
3. 時間排程：若原文有時間則依原文，若無時間則按一般出遊合理作息規劃 (例：09:00, 11:30, 14:00, 18:30)，使用 24 小時制 "HH:MM"。
4. 類別 category：只能從以下六種中選一：
   - 'spot' (景點觀光、古蹟、公園、寺廟)
   - 'food' (早餐、午餐、晚餐、下午茶、夜市美食)
   - 'transport' (機場接送、搭乘電車、特急列車、自駕移動)
   - 'hotel' (飯店入住、退房、民宿)
   - 'shopping' (商場、免稅店、商店街、伴手禮)
   - 'activity' (沉浸展覽、主題樂園、和服體驗、溫泉、展望台)
5. 交通提示 transportNote：請給予前一個地點前往此處的具體交通建議 (例如「搭乘山手線至原宿站步行3分鐘」、「搭乘市營巴士206號至清水道」)。
6. 隨身叮嚀 notes：填寫實用注意事項 (如「需先買票」、「週一休館」、「記得穿好走鞋子」)。
7. 語言：一律使用自然繁體中文 (Traditional Chinese, zh-TW)。
8. 日期：若無明確年份月份，以出發日 ${todayStr} 起算依序推算各天日期。
`;

    const userPrompt = `
請解析以下旅遊內容：
${destinationHint ? `【目的地參考】：${destinationHint}` : ''}
${preferredCurrency ? `【建議計價幣別】：${preferredCurrency}` : ''}

【用戶提供的行程文字】：
${text}
`;

    // Call Gemini with automatic model fallback
    const response = await generateWithModelFallback({
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: '行程名稱' },
            destination: { type: Type.STRING, description: '目的地城市與國家，例如：日本 東京' },
            startDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
            endDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
            currency: { type: Type.STRING, description: '計價幣別，例如 JPY, TWD, USD, EUR' },
            budgetTotal: { type: Type.NUMBER, description: '預估總預算' },
            notes: { type: Type.STRING, description: '整體行程旅遊須知與隨身叮嚀' },
            days: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  dayNumber: { type: Type.INTEGER, description: '第幾天 (1, 2, 3...)' },
                  date: { type: Type.STRING, description: 'YYYY-MM-DD' },
                  theme: { type: Type.STRING, description: '當日主題特色，例如：淺草下町與晴空塔夜景' },
                  notes: { type: Type.STRING, description: '當日提醒事項' },
                  items: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING, description: '景點或活動名稱' },
                        category: {
                          type: Type.STRING,
                          enum: ['spot', 'food', 'transport', 'hotel', 'shopping', 'activity', 'other'],
                        },
                        startTime: { type: Type.STRING, description: 'HH:MM' },
                        endTime: { type: Type.STRING, description: 'HH:MM (可選)' },
                        locationName: { type: Type.STRING, description: '地點地名' },
                        address: { type: Type.STRING, description: '詳細地址' },
                        lat: { type: Type.NUMBER, description: '緯度 Latitude' },
                        lng: { type: Type.NUMBER, description: '經度 Longitude' },
                        transportNote: { type: Type.STRING, description: '交通移動指引' },
                        notes: { type: Type.STRING, description: '必看亮點或備忘叮嚀' },
                        bookingCode: { type: Type.STRING, description: '預約代碼或訂位號' },
                        cost: { type: Type.NUMBER, description: '預估花費金額' },
                      },
                      required: ['title', 'category', 'startTime', 'lat', 'lng'],
                    },
                  },
                },
                required: ['dayNumber', 'date', 'items'],
              },
            },
          },
          required: ['title', 'destination', 'startDate', 'endDate', 'currency', 'days'],
        },
      },
    });

    const parsedJsonText = response.text;
    if (!parsedJsonText) {
      throw new Error('LLM 未返回有效解析數據');
    }

    const tripData = JSON.parse(parsedJsonText);

    // Assign IDs for client usage
    const processedTrip = {
      id: `ai-trip-${Date.now()}`,
      title: tripData.title || 'AI 解析生成的旅遊行程',
      destination: tripData.destination || '旅遊目的地',
      startDate: tripData.startDate || todayStr,
      endDate: tripData.endDate || todayStr,
      currency: tripData.currency || preferredCurrency || 'JPY',
      budgetTotal: tripData.budgetTotal || 30000,
      coverGradient: 'from-emerald-600 via-teal-600 to-cyan-700',
      notes: tripData.notes || '',
      days: (tripData.days || []).map((day: any, dIdx: number) => ({
        id: `day-${Date.now()}-${dIdx + 1}`,
        dayNumber: day.dayNumber || dIdx + 1,
        date: day.date || todayStr,
        theme: day.theme || `第 ${dIdx + 1} 天行程`,
        notes: day.notes || '',
        items: (day.items || []).map((item: any, iIdx: number) => ({
          id: `item-${Date.now()}-${dIdx}-${iIdx}`,
          title: item.title,
          category: item.category || 'spot',
          startTime: item.startTime || '09:00',
          endTime: item.endTime || undefined,
          locationName: item.locationName || item.title,
          address: item.address || undefined,
          lat: typeof item.lat === 'number' ? item.lat : undefined,
          lng: typeof item.lng === 'number' ? item.lng : undefined,
          transportNote: item.transportNote || undefined,
          notes: item.notes || undefined,
          bookingCode: item.bookingCode || undefined,
          cost: item.cost || undefined,
          costPaid: false,
          completed: false,
        })),
      })),
      packingList: [
        { id: 'p1', name: '護照正本（有效期6個月以上）', category: 'documents', packed: false, essential: true },
        { id: 'p2', name: '海外高回饋信用卡與現金', category: 'documents', packed: false, essential: true },
        { id: 'p3', name: '手機充電器與行動電源', category: 'electronics', packed: false, essential: true },
        { id: 'p4', name: '上網 eSIM 或實體上網卡', category: 'electronics', packed: false, essential: true },
        { id: 'p5', name: '個人常備藥品', category: 'medicine', packed: false, essential: true },
        { id: 'p6', name: '輕便好走運動鞋', category: 'clothing', packed: false, essential: true },
      ],
      expenses: [],
      emergencyContacts: [
        { id: 'em-1', name: '當地報警電話', type: 'police', phone: '110' },
        { id: 'em-2', name: '救護車 / 火警', type: 'ambulance', phone: '119' },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return res.json(processedTrip);
  } catch (err: any) {
    console.error('AI itinerary parse error:', err);
    return res.status(500).json({
      error: `AI 行程解析發生錯誤: ${err.message || '請稍後重試'}`,
    });
  }
});

// AI Smart Trip Generator Endpoint
app.post('/api/generate-trip', async (req, res) => {
  try {
    const { destination, daysCount, style, preferences, currency, startDate } = req.body;
    if (!destination || typeof destination !== 'string' || !destination.trim()) {
      return res.status(400).json({ error: '請提供旅遊目的地' });
    }

    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API Key 未設定，可使用熱門範本或本地規則解析。',
      });
    }

    const count = Math.min(Math.max(Number(daysCount) || 4, 1), 14);
    const start = startDate || new Date().toISOString().slice(0, 10);
    const curr = currency || 'JPY';

    const systemInstruction = `
你是一位精通全球旅遊地理、交通路線規劃與景點地圖的資深旅遊規劃專家。
請為旅客量身打造一份專業、流暢、包含真實精準經緯度座標的 ${count} 天旅遊行程。

【極其重要的核心要求】：
1. 嚴格輸出合法的 JSON。
2. 每個景點、餐廳、飯店、體驗，都必須提供真實世界的精準經緯度數值 (lat, lng)。
3. 時間排程：合理順暢，按一般出遊合理作息規劃 (例：09:00, 11:30, 14:00, 18:30)，使用 24 小時制 "HH:MM"。
4. 類別 category：只能是 'spot', 'food', 'transport', 'hotel', 'shopping', 'activity', 'other'。
5. 交通提示 transportNote：請給予前往該地點的具體交通建議。
6. 隨身叮嚀 notes：填寫實用注意事項。
7. 語言：一律使用自然繁體中文 (Traditional Chinese, zh-TW)。
`;

    const userPrompt = `
請為我規劃以下旅遊行程：
- 目的地：${destination}
- 天數：${count} 天
- 出發日期：${start}
- 偏好風格：${style || '經典必去、在地美食與悠閒漫步'}
- 特別願望或指定景點：${preferences || '無特定指定，請安排最順路、值得一訪的精選景點'}
- 幣別：${curr}
`;

    const response = await generateWithModelFallback({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: '行程名稱' },
            destination: { type: Type.STRING, description: '目的地城市與國家' },
            startDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
            endDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
            currency: { type: Type.STRING, description: '計價幣別' },
            budgetTotal: { type: Type.NUMBER, description: '預估總預算' },
            notes: { type: Type.STRING, description: '整體行程旅遊須知與隨身叮嚀' },
            days: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  dayNumber: { type: Type.INTEGER },
                  date: { type: Type.STRING },
                  theme: { type: Type.STRING },
                  notes: { type: Type.STRING },
                  items: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        category: {
                          type: Type.STRING,
                          enum: ['spot', 'food', 'transport', 'hotel', 'shopping', 'activity', 'other'],
                        },
                        startTime: { type: Type.STRING },
                        endTime: { type: Type.STRING },
                        locationName: { type: Type.STRING },
                        address: { type: Type.STRING },
                        lat: { type: Type.NUMBER },
                        lng: { type: Type.NUMBER },
                        transportNote: { type: Type.STRING },
                        notes: { type: Type.STRING },
                        cost: { type: Type.NUMBER },
                      },
                      required: ['title', 'category', 'startTime', 'lat', 'lng'],
                    },
                  },
                },
                required: ['dayNumber', 'date', 'items'],
              },
            },
          },
          required: ['title', 'destination', 'startDate', 'endDate', 'currency', 'days'],
        },
      },
    });

    const parsedJsonText = response.text;
    if (!parsedJsonText) throw new Error('LLM 未返回有效數據');
    const tripData = JSON.parse(parsedJsonText);

    const processedTrip = {
      id: `ai-gen-${Date.now()}`,
      title: tripData.title || `${destination} ${count} 天精選之旅`,
      destination: tripData.destination || destination,
      startDate: tripData.startDate || start,
      endDate: tripData.endDate || start,
      currency: tripData.currency || curr,
      budgetTotal: tripData.budgetTotal || 50000,
      coverGradient: 'from-emerald-600 via-teal-600 to-cyan-700',
      notes: tripData.notes || '',
      days: (tripData.days || []).map((day: any, dIdx: number) => ({
        id: `day-${Date.now()}-${dIdx + 1}`,
        dayNumber: day.dayNumber || dIdx + 1,
        date: day.date || start,
        theme: day.theme || `第 ${dIdx + 1} 天精選行程`,
        notes: day.notes || '',
        items: (day.items || []).map((item: any, iIdx: number) => ({
          id: `item-${Date.now()}-${dIdx}-${iIdx}`,
          title: item.title,
          category: item.category || 'spot',
          startTime: item.startTime || '09:00',
          endTime: item.endTime || undefined,
          locationName: item.locationName || item.title,
          address: item.address || undefined,
          lat: typeof item.lat === 'number' ? item.lat : undefined,
          lng: typeof item.lng === 'number' ? item.lng : undefined,
          transportNote: item.transportNote || undefined,
          notes: item.notes || undefined,
          cost: item.cost || undefined,
          costPaid: false,
          completed: false,
        })),
      })),
      packingList: [
        { id: 'p1', name: '護照正本（有效期6個月以上）', category: 'documents', packed: false, essential: true },
        { id: 'p2', name: '海外回饋信用卡與當地現金', category: 'documents', packed: false, essential: true },
        { id: 'p3', name: '手機充電器與行動電源', category: 'electronics', packed: false, essential: true },
        { id: 'p4', name: '上網 eSIM 或實體上網卡', category: 'electronics', packed: false, essential: true },
        { id: 'p5', name: '個人常備藥品', category: 'medicine', packed: false, essential: true },
        { id: 'p6', name: '好走舒適運動鞋', category: 'clothing', packed: false, essential: true },
      ],
      expenses: [],
      emergencyContacts: [
        { id: 'em-1', name: '當地報警電話', type: 'police', phone: '110' },
        { id: 'em-2', name: '救護車 / 火警', type: 'ambulance', phone: '119' },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return res.json(processedTrip);
  } catch (err: any) {
    console.error('AI trip generation error:', err);
    return res.status(500).json({
      error: `AI 規劃行程發生錯誤: ${err.message || '請稍後重試'}`,
    });
  }
});

// Mount Vite in development or serve static in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`日和手帳 Hiyori backend running on http://0.0.0.0:${port}`);
  });
}

startServer();
