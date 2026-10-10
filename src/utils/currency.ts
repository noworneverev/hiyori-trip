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
 */
export function detectTripCurrency(trip?: { currency?: string; destination?: string; title?: string } | null): string {
  if (trip?.currency && trip.currency.trim()) {
    const cur = trip.currency.trim().toUpperCase();
    if (SUPPORTED_CURRENCIES.some((c) => c.code === cur)) return cur;
  }
  const text = `${trip?.destination || ''} ${trip?.title || ''}`.toLowerCase();
  if (text.match(/歐|法|德|義|西|荷|奧|捷|瑞典|芬蘭|希臘|paris|france|europe|italy|germany|spain|rome|vienna|amsterdam/i)) return 'EUR';
  if (text.match(/英|倫敦|uk|london|britain|gbp|scotland/i)) return 'GBP';
  if (text.match(/瑞士|swiss|zurich|geneva/i)) return 'CHF';
  if (text.match(/美|紐約|舊金山|洛杉磯|西雅圖|夏威夷|usa|united states|america/i)) return 'USD';
  if (text.match(/泰|曼谷|清邁|普吉|thailand|bangkok|chiang mai/i)) return 'THB';
  if (text.match(/韓|首爾|釜山|濟州|弘大|明洞|korea|seoul|busan/i)) return 'KRW';
  if (text.match(/星|新加坡|singapore/i)) return 'SGD';
  if (text.match(/越|胡志明|河內|峴港|富國島|vietnam|da nang/i)) return 'VND';
  if (text.match(/澳|雪梨|墨爾本|布里斯本|australia|sydney|melbourne/i)) return 'AUD';
  if (text.match(/港|香港|九龍|hong kong/i)) return 'HKD';
  if (text.match(/中|北京|上海|成都|廣州|china/i)) return 'CNY';
  if (text.match(/台|台北|高雄|台中|台南|花蓮|宜蘭|taiwan/i)) return 'TWD';
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

/**
 * Retrieve cached daily exchange rates from localStorage
 */
export function getCachedLiveRates(): LiveRatesCache | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LIVE_RATES);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.rates) return parsed;
  } catch {}
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
    const resp = await fetch('https://open.er-api.com/v6/latest/JPY');
    if (!resp.ok) throw new Error(`HTTP error ${resp.status}`);
    const data = await resp.json();

    if (data && data.result === 'success' && data.rates) {
      const calculatedRates: Record<string, number> = {
        JPY: 1,
      };

      for (const cur of SUPPORTED_CURRENCIES) {
        if (cur.code === 'JPY') continue;
        const rateAgainstJPY = data.rates[cur.code];
        if (typeof rateAgainstJPY === 'number' && rateAgainstJPY > 0) {
          // 1 unit of cur.code = 1 / rateAgainstJPY JPY
          calculatedRates[cur.code] = Number((1 / rateAgainstJPY).toFixed(cur.decimals > 0 ? 3 : 2));
        } else {
          calculatedRates[cur.code] = cur.defaultRateToJPY;
        }
      }

      const result: LiveRatesCache = {
        rates: calculatedRates,
        updatedAt: Date.now(),
        source: 'Open Exchange Rates (當日即時匯率)',
      };

      localStorage.setItem(STORAGE_KEY_LIVE_RATES, JSON.stringify(result));
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

  return {
    rates: defaults,
    updatedAt: Date.now(),
    source: '內建基準匯率',
  };
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
  if (!amount || isNaN(amount)) return 0;
  if (fromCode === toCode) return amount;

  const cached = getCachedLiveRates();

  const getRateToJPY = (code: string) => {
    if (customRates && typeof customRates[code] === 'number') {
      return customRates[code];
    }
    if (cached && typeof cached.rates[code] === 'number') {
      return cached.rates[code];
    }
    return CURRENCY_MAP[code]?.defaultRateToJPY || 1;
  };

  const fromRate = getRateToJPY(fromCode);
  const toRate = getRateToJPY(toCode);

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
