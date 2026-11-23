export interface CurrencyMeta {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  defaultRateToJPY: number; // 1 unit of this currency = X JPY
  decimals: number;
}

export const SUPPORTED_CURRENCIES: CurrencyMeta[] = [
  { code: 'EUR', name: '歐元', symbol: '€', flag: '🇪🇺', defaultRateToJPY: 165.20, decimals: 2 },
  { code: 'JPY', name: '日圓', symbol: '¥', flag: '🇯🇵', defaultRateToJPY: 1, decimals: 0 },
  { code: 'TWD', name: '新台幣', symbol: 'NT$', flag: '🇹🇼', defaultRateToJPY: 4.80, decimals: 0 },
  { code: 'USD', name: '美元', symbol: '$', flag: '🇺🇸', defaultRateToJPY: 153.50, decimals: 2 },
  { code: 'GBP', name: '英鎊', symbol: '£', flag: '🇬🇧', defaultRateToJPY: 198.50, decimals: 2 },
  { code: 'CHF', name: '瑞士法郎', symbol: 'CHF', flag: '🇨🇭', defaultRateToJPY: 173.00, decimals: 2 },
  { code: 'KRW', name: '韓元', symbol: '₩', flag: '🇰🇷', defaultRateToJPY: 0.11, decimals: 0 },
  { code: 'THB', name: '泰銖', symbol: '฿', flag: '🇹🇭', defaultRateToJPY: 4.45, decimals: 0 },
  { code: 'SGD', name: '新加坡幣', symbol: 'S$', flag: '🇸🇬', defaultRateToJPY: 118.00, decimals: 2 },
  { code: 'HKD', name: '港幣', symbol: 'HK$', flag: '🇭🇰', defaultRateToJPY: 19.70, decimals: 2 },
  { code: 'CNY', name: '人民幣', symbol: '¥', flag: '🇨🇳', defaultRateToJPY: 21.20, decimals: 2 },
  { code: 'AUD', name: '澳幣', symbol: 'A$', flag: '🇦🇺', defaultRateToJPY: 101.50, decimals: 2 },
  { code: 'VND', name: '越南盾', symbol: '₫', flag: '🇻🇳', defaultRateToJPY: 0.006, decimals: 0 },
];

/**
 * Automatically determine the most sensible default currency for a trip.
 * Respects explicit trip.currency if set, otherwise analyzes destination / title.
 * Avoids single-character CJK false positives (e.g. 關西->EUR, 美瑛->USD, 星野->SGD, 台中->CNY).
 */
export function detectTripCurrency(trip?: { currency?: string; destination?: string; title?: string } | null): string {
  if (trip?.currency && trip.currency.trim()) {
    const cur = trip.currency.trim().toUpperCase();
    if (SUPPORTED_CURRENCIES.some((c) => c.code === cur)) return cur;
  }
  const text = `${trip?.destination || ''} ${trip?.title || ''}`.toLowerCase();

  // Check explicit Japan keywords first so names like 關西 / 法隆寺 / 奧日光 / 美瑛 / 星野 / 越後湯澤 / 神戶港 stay JPY
  if (/(日本|東京|大阪|京都|北海道|札幌|函館|小樽|富良野|美瑛|沖繩|那霸|福岡|九州|熊本|鹿兒島|長崎|別府|由布院|名古屋|中部|北陸|金澤|高山|白川鄉|立山|輕井澤|箱根|河口湖|富士山|鎌倉|橫濱|日光|東北|仙台|青森|秋田|廣島|岡山|四國|關西|關東|奈良|神戶|宇治|嵐山|琵琶湖|新潟|越後湯澤|星野|japan|tokyo|osaka|kyoto|hokkaido|sapporo|okinawa|fukuoka|kyushu|nagoya|kanazawa|hakone|sendai|hiroshima|kobe|nara|yokohama)/i.test(text)) {
    return 'JPY';
  }
  // Check Taiwan before China so 台中 / 台北 / 台南 / 台東 don't trigger China
  if (/(台灣|臺灣|台北|臺北|新北|桃園|新竹|苗栗|台中|臺中|彰化|南投|日月潭|清境|嘉義|阿里山|台南|臺南|高雄|墾丁|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|馬祖|綠島|蘭嶼|taiwan|taipei|taichung|tainan|kaohsiung|hualien|yilan|kenting)/i.test(text)) {
    return 'TWD';
  }
  // Check Hong Kong / Macau before China
  if (/(香港|九龍|尖沙咀|銅鑼灣|中環|旺角|澳門|hong kong|\bhk\b|kowloon|macau)/i.test(text)) {
    return 'HKD';
  }
  // Switzerland (CHF) before general Europe
  if (/(瑞士|蘇黎世|日內瓦|琉森|少女峰|策馬特|因特拉肯|swiss|switzerland|zurich|geneva|lucerne|zermatt|interlaken)/i.test(text)) {
    return 'CHF';
  }
  // United Kingdom (GBP) before general Europe
  if (/(英國|倫敦|愛丁堡|曼徹斯特|牛津|劍橋|蘇格蘭|威爾斯|\buk\b|london|britain|england|scotland|\bgbp\b|edinburgh|manchester)/i.test(text)) {
    return 'GBP';
  }
  // Eurozone countries & major cities
  if (/(歐洲|法國|巴黎|里昂|尼斯|南法|德國|柏林|慕尼黑|法蘭克福|義大利|意大利|羅馬|米蘭|威尼斯|佛羅倫斯|托斯卡尼|西班牙|馬德里|巴塞隆納|塞維亞|荷蘭|阿姆斯特丹|比利時|布魯塞爾|奧地利|維也納|薩爾斯堡|哈修塔特|葡萄牙|里斯本|波多|希臘|雅典|聖托里尼|愛爾蘭|都柏林|芬蘭|赫爾辛基|羅瓦涅米|歐元|paris|france|europe|italy|germany|spain|rome|milan|venice|florence|barcelona|madrid|vienna|austria|amsterdam|netherlands|belgium|portugal|lisbon|greece|athens|santorini|berlin|munich|finland|helsinki|ireland|dublin)/i.test(text)) {
    return 'EUR';
  }
  // United States (USD)
  if (/(美國|紐約|舊金山|洛杉磯|西雅圖|波士頓|芝加哥|拉斯維加斯|華盛頓|邁阿密|奧蘭多|夏威夷|檀香山|關島|阿拉斯加|\busa\b|\bu\.s\.a\b|united states|america|new york|san francisco|los angeles|seattle|hawaii|las vegas|boston|chicago|guam)/i.test(text)) {
    return 'USD';
  }
  // South Korea (KRW)
  if (/(韓國|南韓|首爾|釜山|濟州|大邱|仁川|弘大|明洞|聖水|江南|慶州|korea|seoul|busan|jeju|daegu|incheon)/i.test(text)) {
    return 'KRW';
  }
  // Thailand (THB)
  if (/(泰國|曼谷|清邁|清萊|普吉|芭達雅|華欣|蘇美島|喀比|thailand|bangkok|chiang mai|phuket|pattaya|krabi|samui)/i.test(text)) {
    return 'THB';
  }
  // Singapore (SGD)
  if (/(新加坡|聖淘沙|星國|singapore|sentosa)/i.test(text)) {
    return 'SGD';
  }
  // Vietnam (VND)
  if (/(越南|胡志明|河內|峴港|會安|富國島|芽莊|下龍灣|順化|沙壩|vietnam|ho chi minh|hanoi|da nang|hoi an|phu quoc|nha trang)/i.test(text)) {
    return 'VND';
  }
  // Australia (AUD)
  if (/(澳洲|澳大利亞|雪梨|悉尼|墨爾本|布里斯本|黃金海岸|伯斯|凱恩斯|阿德雷德|塔斯馬尼亞|australia|sydney|melbourne|brisbane|gold coast|perth|cairns|adelaide|tasmania)/i.test(text)) {
    return 'AUD';
  }
  // China (CNY)
  if (/(中國|大陸|北京|上海|廣州|深圳|成都|重慶|西安|杭州|蘇州|廈門|青島|張家界|麗江|雲南|西藏|新疆|china|beijing|shanghai|shenzhen|guangzhou|chengdu|chongqing|xian|hangzhou)/i.test(text)) {
    return 'CNY';
  }
  return 'JPY';
}

export const CURRENCY_MAP = SUPPORTED_CURRENCIES.reduce((acc, c) => {
  acc[c.code] = c;
  return acc;
}, {} as Record<string, CurrencyMeta>);

const STORAGE_KEY_LIVE_RATES = 'hiyori_live_exchange_rates_v1';

export interface LiveRatesCache {
  rates: Record<string, number>; // code -> rateToJPY
  updatedAt: number;
  source: string;
}

// Module-level memory cache to avoid JSON.parse(localStorage) on every expense row render
let memoryLiveRatesCache: LiveRatesCache | null | undefined = undefined;

/**
 * Retrieve cached daily exchange rates (memory-cached, backed by localStorage)
 */
export function getCachedLiveRates(): LiveRatesCache | null {
  if (memoryLiveRatesCache !== undefined) {
    return memoryLiveRatesCache;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LIVE_RATES);
    if (!raw) {
      memoryLiveRatesCache = null;
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed && parsed.rates && typeof parsed.rates === 'object') {
      // Sanitize any corrupted 0/NaN entries from older cached builds (e.g. VND rounded to 0.00 or 0.01)
      const sanitizedRates: Record<string, number> = { ...parsed.rates, JPY: 1 };
      for (const cur of SUPPORTED_CURRENCIES) {
        if (cur.code === 'JPY') continue;
        const r = sanitizedRates[cur.code];
        if (typeof r !== 'number' || !Number.isFinite(r) || r <= 0) {
          sanitizedRates[cur.code] = cur.defaultRateToJPY;
        }
      }
      const parsedResult: LiveRatesCache = { ...parsed, rates: sanitizedRates };
      memoryLiveRatesCache = parsedResult;
      return parsedResult;
    }
  } catch {
    // ignore storage parse failure
  }
  memoryLiveRatesCache = null;
  return null;
}

/**
 * Fetch latest daily market exchange rates from open exchange rate API
 * (CORS enabled, no API key needed, updated daily by international markets)
 */
export async function fetchLiveExchangeRates(force = false): Promise<LiveRatesCache> {
  const cached = getCachedLiveRates();
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  // Use fresh cache if available and not forced
  if (!force && cached && Date.now() - cached.updatedAt < SIX_HOURS) {
    return cached;
  }

  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    const resp = await fetch('https://open.er-api.com/v6/latest/JPY', { signal: controller.signal });
    window.clearTimeout(timer);
    if (!resp.ok) throw new Error(`HTTP error ${resp.status}`);
    const data = await resp.json();

    if (data && data.result === 'success' && data.rates) {
      const calculatedRates: Record<string, number> = {
        JPY: 1,
      };

      for (const cur of SUPPORTED_CURRENCIES) {
        if (cur.code === 'JPY') continue;
        const rateAgainstJPY = data.rates[cur.code];
        if (typeof rateAgainstJPY === 'number' && Number.isFinite(rateAgainstJPY) && rateAgainstJPY > 0) {
          // Use 6 significant digits so low-unit currencies like VND (~0.00615) & KRW (~0.1085) stay exact
          const exactRate = Number((1 / rateAgainstJPY).toPrecision(6));
          calculatedRates[cur.code] = exactRate > 0 ? exactRate : cur.defaultRateToJPY;
        } else {
          calculatedRates[cur.code] = cur.defaultRateToJPY;
        }
      }

      const result: LiveRatesCache = {
        rates: calculatedRates,
        updatedAt: Date.now(),
        source: 'Open Exchange Rates (當日即時匯率)',
      };

      memoryLiveRatesCache = result;
      try {
        localStorage.setItem(STORAGE_KEY_LIVE_RATES, JSON.stringify(result));
      } catch {
        // ignore quota errors
      }
      return result;
    }
  } catch (err) {
    console.warn('Failed to fetch live exchange rates, falling back to cache or defaults:', err);
  }

  if (cached) return cached;

  // Fallback defaults
  const defaults: Record<string, number> = {};
  SUPPORTED_CURRENCIES.forEach((c) => {
    defaults[c.code] = c.defaultRateToJPY;
  });

  const fallbackResult: LiveRatesCache = {
    rates: defaults,
    updatedAt: Date.now(),
    source: '內建基準匯率',
  };
  memoryLiveRatesCache = fallbackResult;
  return fallbackResult;
}

/**
 * Convert an amount from one currency to another using live rates or custom user overrides
 */
export function convertAmount(
  amount: number,
  fromCode: string,
  toCode: string,
  customRates?: Record<string, number>
): number {
  if (!amount || !Number.isFinite(amount)) return 0;
  if (fromCode === toCode) return amount;

  const cached = getCachedLiveRates();

  const getRateToJPY = (code: string) => {
    const custom = customRates?.[code];
    if (typeof custom === 'number' && Number.isFinite(custom) && custom > 0) {
      return custom;
    }
    const live = cached?.rates?.[code];
    if (typeof live === 'number' && Number.isFinite(live) && live > 0) {
      return live;
    }
    return CURRENCY_MAP[code]?.defaultRateToJPY || 1;
  };

  const fromRate = getRateToJPY(fromCode);
  const toRate = getRateToJPY(toCode);
  if (fromRate <= 0 || toRate <= 0) return 0;

  // Convert from -> JPY -> to
  const amountInJPY = amount * fromRate;
  const result = amountInJPY / toRate;

  const targetDecimals = CURRENCY_MAP[toCode]?.decimals ?? 0;
  return Number(result.toFixed(targetDecimals));
}

/**
 * Format currency with appropriate symbol and thousands separator
 */
export function formatCurrencyAmount(amount: number, currencyCode: string): string {
  const meta = CURRENCY_MAP[currencyCode];
  const symbol = meta ? meta.symbol : currencyCode;
  const decimals = meta ? meta.decimals : 0;

  const formattedNum = (amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${symbol} ${formattedNum}`;
}
