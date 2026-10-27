/**
 * Global Timezone & Country Destination Resolver
 * Dynamically computes IANA timezone, country flag, display labels, and currency.
 */

export interface DestinationTimezoneInfo {
  tz?: string;
  flag: string;
  label: string;
  countryName: string;
  currencyCode?: string;
}

interface DestinationRule {
  keywords: string[];
  tz: string;
  flag: string;
  label: string;
  countryName: string;
  currencyCode: string;
  latRange?: [number, number];
  lngRange?: [number, number];
}

const GLOBAL_RULES: DestinationRule[] = [
  // --- East Asia ---
  {
    keywords: ['日本', '東京', '大阪', '京都', '金澤', '名古屋', '福岡', '沖繩', '北海道', '札幌', '箱根', '富士山', '高山', '白川鄉', '富山', '輕井澤', 'japan', 'tokyo', 'osaka', 'kyoto', 'hokkaido', 'okinawa'],
    tz: 'Asia/Tokyo',
    flag: '🇯🇵',
    label: '日本時間 (JST)',
    countryName: '日本',
    currencyCode: 'JPY',
  },
  {
    keywords: ['韓國', '首爾', '釜山', '濟州', '仁川', '大邱', '弘大', '明洞', 'korea', 'seoul', 'busan', 'jeju'],
    tz: 'Asia/Seoul',
    flag: '🇰🇷',
    label: '韓國時間 (KST)',
    countryName: '韓國',
    currencyCode: 'KRW',
  },
  {
    keywords: ['台灣', '台北', '高雄', '台中', '台南', '花蓮', '墾丁', '日月潭', 'taiwan', 'taipei'],
    tz: 'Asia/Taipei',
    flag: '🇹🇼',
    label: '台灣時間 (TST)',
    countryName: '台灣',
    currencyCode: 'TWD',
  },
  {
    keywords: ['香港', '九龍', '中環', '尖沙咀', 'hong kong', 'hongkong', 'hk'],
    tz: 'Asia/Hong_Kong',
    flag: '🇭🇰',
    label: '香港時間 (HKT)',
    countryName: '香港',
    currencyCode: 'HKD',
  },
  {
    keywords: ['澳門', 'macau', 'macao'],
    tz: 'Asia/Macau',
    flag: '🇲🇴',
    label: '澳門時間 (CST)',
    countryName: '澳門',
    currencyCode: 'MOP',
  },
  {
    keywords: ['北京', '上海', '廣州', '深圳', '成都', '重慶', '西安', 'china', 'beijing', 'shanghai'],
    tz: 'Asia/Shanghai',
    flag: '🇨🇳',
    label: '中國標準時間 (CST)',
    countryName: '中國',
    currencyCode: 'CNY',
  },

  // --- Southeast Asia ---
  {
    keywords: ['泰國', '曼谷', '清邁', '普吉島', '芭達雅', '蘇美島', 'thailand', 'bangkok', 'chiang mai', 'phuket'],
    tz: 'Asia/Bangkok',
    flag: '🇹🇭',
    label: '泰國時間 (ICT)',
    countryName: '泰國',
    currencyCode: 'THB',
  },
  {
    keywords: ['新加坡', '聖淘沙', '濱海灣', 'singapore'],
    tz: 'Asia/Singapore',
    flag: '🇸🇬',
    label: '新加坡時間 (SGT)',
    countryName: '新加坡',
    currencyCode: 'SGD',
  },
  {
    keywords: ['越南', '河內', '胡志明', '峴港', '會安', '下龍灣', 'vietnam', 'hanoi', 'da nang'],
    tz: 'Asia/Ho_Chi_Minh',
    flag: '🇻🇳',
    label: '越南時間 (ICT)',
    countryName: '越南',
    currencyCode: 'VND',
  },
  {
    keywords: ['馬來西亞', '吉隆坡', '檳城', '沙巴', '蘭卡威', 'malaysia', 'kuala lumpur', 'penang'],
    tz: 'Asia/Kuala_Lumpur',
    flag: '🇲🇾',
    label: '馬來西亞時間 (MYT)',
    countryName: '馬來西亞',
    currencyCode: 'MYR',
  },
  {
    keywords: ['峇里島', '巴厘島', '雅加達', '印尼', 'bali', 'indonesia', 'jakarta'],
    tz: 'Asia/Makassar',
    flag: '🇮🇩',
    label: '峇里島時間 (WITA)',
    countryName: '印尼',
    currencyCode: 'IDR',
  },
  {
    keywords: ['菲律賓', '宿霧', '長灘島', '馬尼拉', '薄荷島', 'philippines', 'cebu', 'boracay'],
    tz: 'Asia/Manila',
    flag: '🇵🇭',
    label: '菲律賓時間 (PHT)',
    countryName: '菲律賓',
    currencyCode: 'PHP',
  },

  // --- Europe ---
  {
    keywords: ['法國', '巴黎', '尼斯', '里昂', '普羅旺斯', '馬賽', 'france', 'paris', 'nice'],
    tz: 'Europe/Paris',
    flag: '🇫🇷',
    label: '法國時間 (CET)',
    countryName: '法國',
    currencyCode: 'EUR',
  },
  {
    keywords: ['英國', '倫敦', '愛丁堡', '曼徹斯特', '劍橋', '牛津', 'uk', 'london', 'england', 'scotland'],
    tz: 'Europe/London',
    flag: '🇬🇧',
    label: '英國時間 (GMT)',
    countryName: '英國',
    currencyCode: 'GBP',
  },
  {
    keywords: ['義大利', '羅馬', '米蘭', '威尼斯', '佛羅倫斯', '拿坡里', 'italy', 'rome', 'milan', 'venice', 'florence'],
    tz: 'Europe/Rome',
    flag: '🇮🇹',
    label: '義大利時間 (CET)',
    countryName: '義大利',
    currencyCode: 'EUR',
  },
  {
    keywords: ['德國', '柏林', '慕尼黑', '法蘭克福', '科隆', '漢堡', 'germany', 'berlin', 'munich'],
    tz: 'Europe/Berlin',
    flag: '🇩🇪',
    label: '德國時間 (CET)',
    countryName: '德國',
    currencyCode: 'EUR',
  },
  {
    keywords: ['西班牙', '馬德里', '巴塞隆納', '塞維亞', '格拉納達', 'spain', 'madrid', 'barcelona'],
    tz: 'Europe/Madrid',
    flag: '🇪🇸',
    label: '西班牙時間 (CET)',
    countryName: '西班牙',
    currencyCode: 'EUR',
  },
  {
    keywords: ['瑞士', '蘇黎世', '日內瓦', '策馬特', '少女峰', '琉森', '因特拉肯', 'switzerland', 'zurich', 'geneva', 'zermatt'],
    tz: 'Europe/Zurich',
    flag: '🇨🇭',
    label: '瑞士時間 (CET)',
    countryName: '瑞士',
    currencyCode: 'CHF',
  },
  {
    keywords: ['荷蘭', '阿姆斯特丹', '鹿特丹', '海牙', 'netherlands', 'amsterdam'],
    tz: 'Europe/Amsterdam',
    flag: '🇳🇱',
    label: '荷蘭時間 (CET)',
    countryName: '荷蘭',
    currencyCode: 'EUR',
  },
  {
    keywords: ['奧地利', '維也納', '薩爾斯堡', '哈修塔特', 'austria', 'vienna', 'salzburg', 'hallstatt'],
    tz: 'Europe/Vienna',
    flag: '🇦🇹',
    label: '奧地利時間 (CET)',
    countryName: '奧地利',
    currencyCode: 'EUR',
  },
  {
    keywords: ['捷克', '布拉格', '庫倫洛夫', 'czech', 'prague', 'cesky krumlov'],
    tz: 'Europe/Prague',
    flag: '🇨🇿',
    label: '捷克時間 (CET)',
    countryName: '捷克',
    currencyCode: 'CZK',
  },
  {
    keywords: ['冰島', '雷克雅維克', '藍湖', 'iceland', 'reykjavik'],
    tz: 'Atlantic/Reykjavik',
    flag: '🇮🇸',
    label: '冰島時間 (GMT)',
    countryName: '冰島',
    currencyCode: 'ISK',
  },

  // --- North America ---
  {
    keywords: ['紐約', '波士頓', '華盛頓', '邁阿密', '奧蘭多', 'new york', 'boston', 'washington', 'miami'],
    tz: 'America/New_York',
    flag: '🇺🇸',
    label: '美東時間 (EST)',
    countryName: '美國',
    currencyCode: 'USD',
  },
  {
    keywords: ['加州', '洛杉磯', '舊金山', '西雅圖', '拉斯維加斯', '聖地牙哥', 'california', 'los angeles', 'san francisco', 'seattle', 'las vegas'],
    tz: 'America/Los_Angeles',
    flag: '🇺🇸',
    label: '美西時間 (PST)',
    countryName: '美國',
    currencyCode: 'USD',
  },
  {
    keywords: ['夏威夷', '檀香山', '歐胡島', 'hawaii', 'honolulu'],
    tz: 'Pacific/Honolulu',
    flag: '🌺',
    label: '夏威夷時間 (HST)',
    countryName: '美國',
    currencyCode: 'USD',
  },
  {
    keywords: ['加拿大', '溫哥華', '多倫多', '班夫', '蒙特婁', 'canada', 'vancouver', 'toronto', 'banff'],
    tz: 'America/Vancouver',
    flag: '🇨🇦',
    label: '加拿大時間',
    countryName: '加拿大',
    currencyCode: 'CAD',
  },

  // --- Oceania ---
  {
    keywords: ['澳洲', '雪梨', '墨爾本', '布里斯本', '黃金海岸', '凱恩斯', '伯斯', 'australia', 'sydney', 'melbourne', 'brisbane'],
    tz: 'Australia/Sydney',
    flag: '🇦🇺',
    label: '澳洲時間 (AEST)',
    countryName: '澳洲',
    currencyCode: 'AUD',
  },
  {
    keywords: ['紐西蘭', '奧克蘭', '基督城', '皇后鎮', 'new zealand', 'auckland', 'queenstown'],
    tz: 'Pacific/Auckland',
    flag: '🇳🇿',
    label: '紐西蘭時間 (NZST)',
    countryName: '紐西蘭',
    currencyCode: 'NZD',
  },
];

/**
 * Resolve timezone, flag, and currency from destination string or GPS coordinates
 */
export function resolveDestinationTimezone(
  destination?: string,
  coords?: { lat?: number; lng?: number } | null
): DestinationTimezoneInfo {
  const cleanDest = (destination || '').toLowerCase().trim();

  // 1. Keyword match against destination name
  if (cleanDest) {
    for (const rule of GLOBAL_RULES) {
      if (rule.keywords.some((k) => cleanDest.includes(k.toLowerCase()))) {
        return {
          tz: rule.tz,
          flag: rule.flag,
          label: rule.label,
          countryName: rule.countryName,
          currencyCode: rule.currencyCode,
        };
      }
    }
  }

  // 2. Coordinate boundary match if coordinates are provided
  if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
    const { lat, lng } = coords;

    // Approximate regional bounding boxes
    // Japan
    if (lat >= 24 && lat <= 46 && lng >= 122 && lng <= 153) {
      return { tz: 'Asia/Tokyo', flag: '🇯🇵', label: '日本時間 (JST)', countryName: '日本', currencyCode: 'JPY' };
    }
    // Korea
    if (lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132) {
      return { tz: 'Asia/Seoul', flag: '🇰🇷', label: '韓國時間 (KST)', countryName: '韓國', currencyCode: 'KRW' };
    }
    // Taiwan
    if (lat >= 21.5 && lat <= 26 && lng >= 119 && lng <= 123) {
      return { tz: 'Asia/Taipei', flag: '🇹🇼', label: '台灣時間 (TST)', countryName: '台灣', currencyCode: 'TWD' };
    }
    // Western Europe
    if (lat >= 35 && lat <= 60 && lng >= -10 && lng <= 20) {
      return { tz: 'Europe/Paris', flag: '🇪🇺', label: '歐洲中部時間 (CET)', countryName: '歐洲', currencyCode: 'EUR' };
    }
    // UK & Ireland
    if (lat >= 50 && lat <= 60 && lng >= -11 && lng <= 2) {
      return { tz: 'Europe/London', flag: '🇬🇧', label: '英國時間 (GMT)', countryName: '英國', currencyCode: 'GBP' };
    }
    // US West
    if (lat >= 30 && lat <= 50 && lng >= -125 && lng <= -114) {
      return { tz: 'America/Los_Angeles', flag: '🇺🇸', label: '美西時間 (PST)', countryName: '美國', currencyCode: 'USD' };
    }
    // US East
    if (lat >= 25 && lat <= 48 && lng >= -85 && lng <= -65) {
      return { tz: 'America/New_York', flag: '🇺🇸', label: '美東時間 (EST)', countryName: '美國', currencyCode: 'USD' };
    }
    // Australia
    if (lat >= -45 && lat <= -10 && lng >= 110 && lng <= 155) {
      return { tz: 'Australia/Sydney', flag: '🇦🇺', label: '澳洲時間 (AEST)', countryName: '澳洲', currencyCode: 'AUD' };
    }

    // Mathematical Longitude Offset Fallback (15 degrees = 1 hour)
    const offsetHours = Math.round(lng / 15);
    const sign = offsetHours >= 0 ? '+' : '';
    return {
      tz: undefined,
      flag: '📍',
      label: `當地時間 (UTC${sign}${offsetHours})`,
      countryName: '當地',
      currencyCode: 'USD',
    };
  }

  // Default fallback if unknown
  return {
    tz: undefined,
    flag: '📍',
    label: '當地時間',
    countryName: '旅遊地',
    currencyCode: 'USD',
  };
}
