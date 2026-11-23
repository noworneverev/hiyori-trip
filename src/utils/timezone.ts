/**
 * Global Timezone, Country Destination & Emergency Hotline Resolver
 * Dynamically computes IANA timezone, country flag, display labels, currency, and local emergency numbers.
 */

export interface DestinationTimezoneInfo {
  tz?: string;
  flag: string;
  label: string;
  countryName: string;
  countryCode?: string;
  currencyCode?: string;
}

export interface EmergencyNumberEntry {
  id: string;
  label: string;
  number: string;
  note?: string;
  kind: 'police' | 'ambulance' | 'hotline';
}

export interface DestinationEmergencyInfo {
  countryName: string;
  flag: string;
  entries: EmergencyNumberEntry[];
}

interface DestinationRule {
  keywords: string[];
  tz: string;
  flag: string;
  label: string;
  countryName: string;
  countryCode: string;
  currencyCode: string;
}

const GLOBAL_RULES: DestinationRule[] = [
  // --- East Asia ---
  {
    keywords: [
      '日本', '東京', '大阪', '京都', '金澤', '名古屋', '福岡', '沖繩', '北海道', '札幌',
      '箱根', '富士山', '高山', '白川鄉', '富山', '輕井澤', '神戶', '奈良', '橫濱', '仙台',
      '廣島', '熊本', '鹿兒島', '長崎', '鎌倉', '日光', '河口湖', '那霸', '石垣島', '宮古島',
      '小樽', '函館', '富良野', '美瑛', '青森', '長野', '松本', '宇治', '姬路', '岡山', '倉敷',
      '北陸', '關西', '關東', '九州', '四國', '東北',
      'japan', 'tokyo', 'osaka', 'kyoto', 'hokkaido', 'okinawa', 'fukuoka', 'nagoya',
      'kanazawa', 'sapporo', 'sendai', 'hiroshima', 'nara', 'kobe', 'yokohama', 'hakone',
      'takayama', 'toyama', 'karuizawa', 'kamakura', 'nikko', 'kumamoto', 'nagasaki',
    ],
    tz: 'Asia/Tokyo',
    flag: '🇯🇵',
    label: '日本時間 (JST)',
    countryName: '日本',
    countryCode: 'JP',
    currencyCode: 'JPY',
  },
  {
    keywords: [
      '韓國', '首爾', '釜山', '濟州', '仁川', '大邱', '弘大', '明洞', '慶州', '水原', '江陵',
      'korea', 'seoul', 'busan', 'jeju', 'incheon', 'daegu', 'gyeongju',
    ],
    tz: 'Asia/Seoul',
    flag: '🇰🇷',
    label: '韓國時間 (KST)',
    countryName: '韓國',
    countryCode: 'KR',
    currencyCode: 'KRW',
  },
  {
    keywords: [
      '台灣', '臺灣', '台北', '臺北', '新北', '桃園', '新竹', '台中', '臺中', '台南', '臺南',
      '高雄', '花蓮', '台東', '臺東', '墾丁', '日月潭', '宜蘭', '嘉義', '澎湖', '金門', '馬祖', '阿里山', '九份',
      'taiwan', 'taipei', 'kaohsiung', 'taichung', 'tainan', 'hualien', 'kenting',
    ],
    tz: 'Asia/Taipei',
    flag: '🇹🇼',
    label: '台灣時間 (TST)',
    countryName: '台灣',
    countryCode: 'TW',
    currencyCode: 'TWD',
  },
  {
    keywords: ['香港', '九龍', '中環', '尖沙咀', '銅鑼灣', '旺角', 'hong kong', 'hongkong', 'hk'],
    tz: 'Asia/Hong_Kong',
    flag: '🇭🇰',
    label: '香港時間 (HKT)',
    countryName: '香港',
    countryCode: 'HK',
    currencyCode: 'HKD',
  },
  {
    keywords: ['澳門', 'macau', 'macao'],
    tz: 'Asia/Macau',
    flag: '🇲🇴',
    label: '澳門時間 (CST)',
    countryName: '澳門',
    countryCode: 'MO',
    currencyCode: 'MOP',
  },
  {
    keywords: ['中國', '北京', '上海', '廣州', '深圳', '成都', '重慶', '西安', '杭州', '蘇州', '廈門', '南京', '青島', 'china', 'beijing', 'shanghai', 'chengdu', 'shenzhen', 'guangzhou'],
    tz: 'Asia/Shanghai',
    flag: '🇨🇳',
    label: '中國標準時間 (CST)',
    countryName: '中國',
    countryCode: 'CN',
    currencyCode: 'CNY',
  },

  // --- Southeast Asia ---
  {
    keywords: ['泰國', '曼谷', '清邁', '普吉島', '芭達雅', '蘇美島', '清萊', '華欣', 'thailand', 'bangkok', 'chiang mai', 'phuket', 'pattaya'],
    tz: 'Asia/Bangkok',
    flag: '🇹🇭',
    label: '泰國時間 (ICT)',
    countryName: '泰國',
    countryCode: 'TH',
    currencyCode: 'THB',
  },
  {
    keywords: ['新加坡', '聖淘沙', '濱海灣', 'singapore'],
    tz: 'Asia/Singapore',
    flag: '🇸🇬',
    label: '新加坡時間 (SGT)',
    countryName: '新加坡',
    countryCode: 'SG',
    currencyCode: 'SGD',
  },
  {
    keywords: ['越南', '河內', '胡志明', '峴港', '會安', '下龍灣', '富國島', '芽莊', 'vietnam', 'hanoi', 'ho chi minh', 'da nang', 'phu quoc'],
    tz: 'Asia/Ho_Chi_Minh',
    flag: '🇻🇳',
    label: '越南時間 (ICT)',
    countryName: '越南',
    countryCode: 'VN',
    currencyCode: 'VND',
  },
  {
    keywords: ['馬來西亞', '吉隆坡', '檳城', '沙巴', '蘭卡威', '麻六甲', '馬六甲', 'malaysia', 'kuala lumpur', 'penang', 'sabah', 'langkawi'],
    tz: 'Asia/Kuala_Lumpur',
    flag: '🇲🇾',
    label: '馬來西亞時間 (MYT)',
    countryName: '馬來西亞',
    countryCode: 'MY',
    currencyCode: 'MYR',
  },
  // Split Indonesia West (WIB) vs Bali/Central (WITA)
  {
    keywords: ['雅加達', '日惹', '萬隆', '泗水', 'jakarta', 'yogyakarta', 'bandung', 'surabaya'],
    tz: 'Asia/Jakarta',
    flag: '🇮🇩',
    label: '雅加達時間 (WIB)',
    countryName: '印尼',
    countryCode: 'ID',
    currencyCode: 'IDR',
  },
  {
    keywords: ['峇里島', '巴厘島', '印尼', '龍目島', 'bali', 'lombok', 'indonesia'],
    tz: 'Asia/Makassar',
    flag: '🇮🇩',
    label: '峇里島時間 (WITA)',
    countryName: '印尼',
    countryCode: 'ID',
    currencyCode: 'IDR',
  },
  {
    keywords: ['菲律賓', '宿霧', '長灘島', '馬尼拉', '薄荷島', '巴拉望', 'philippines', 'cebu', 'boracay', 'manila', 'palawan'],
    tz: 'Asia/Manila',
    flag: '🇵🇭',
    label: '菲律賓時間 (PHT)',
    countryName: '菲律賓',
    countryCode: 'PH',
    currencyCode: 'PHP',
  },

  // --- Europe ---
  {
    keywords: ['法國', '巴黎', '尼斯', '里昂', '普羅旺斯', '馬賽', '史特拉斯堡', '波爾多', 'france', 'paris', 'nice', 'lyon', 'marseille'],
    tz: 'Europe/Paris',
    flag: '🇫🇷',
    label: '法國時間 (CET)',
    countryName: '法國',
    countryCode: 'FR',
    currencyCode: 'EUR',
  },
  {
    keywords: ['英國', '倫敦', '愛丁堡', '曼徹斯特', '劍橋', '牛津', '利物浦', '蘇格蘭', 'uk', 'united kingdom', 'london', 'edinburgh', 'england', 'scotland'],
    tz: 'Europe/London',
    flag: '🇬🇧',
    label: '英國時間 (GMT/BST)',
    countryName: '英國',
    countryCode: 'GB',
    currencyCode: 'GBP',
  },
  {
    keywords: ['義大利', '意大利', '羅馬', '米蘭', '威尼斯', '佛羅倫斯', '拿坡里', '西西里', '多洛米蒂', 'italy', 'rome', 'milan', 'venice', 'florence', 'naples'],
    tz: 'Europe/Rome',
    flag: '🇮🇹',
    label: '義大利時間 (CET)',
    countryName: '義大利',
    countryCode: 'IT',
    currencyCode: 'EUR',
  },
  {
    keywords: ['德國', '柏林', '慕尼黑', '法蘭克福', '科隆', '漢堡', '紐倫堡', '斯圖加特', 'germany', 'berlin', 'munich', 'frankfurt', 'cologne', 'hamburg'],
    tz: 'Europe/Berlin',
    flag: '🇩🇪',
    label: '德國時間 (CET)',
    countryName: '德國',
    countryCode: 'DE',
    currencyCode: 'EUR',
  },
  {
    keywords: ['西班牙', '馬德里', '巴塞隆納', '塞維亞', '格拉納達', '瓦倫西亞', 'spain', 'madrid', 'barcelona', 'seville', 'granada'],
    tz: 'Europe/Madrid',
    flag: '🇪🇸',
    label: '西班牙時間 (CET)',
    countryName: '西班牙',
    countryCode: 'ES',
    currencyCode: 'EUR',
  },
  {
    keywords: ['瑞士', '蘇黎世', '日內瓦', '策馬特', '少女峰', '琉森', '因特拉肯', '伯恩', 'switzerland', 'zurich', 'geneva', 'zermatt', 'lucerne', 'interlaken'],
    tz: 'Europe/Zurich',
    flag: '🇨🇭',
    label: '瑞士時間 (CET)',
    countryName: '瑞士',
    countryCode: 'CH',
    currencyCode: 'CHF',
  },
  {
    keywords: ['荷蘭', '阿姆斯特丹', '鹿特丹', '海牙', '羊角村', 'netherlands', 'amsterdam', 'rotterdam'],
    tz: 'Europe/Amsterdam',
    flag: '🇳🇱',
    label: '荷蘭時間 (CET)',
    countryName: '荷蘭',
    countryCode: 'NL',
    currencyCode: 'EUR',
  },
  {
    keywords: ['奧地利', '維也納', '薩爾斯堡', '哈修塔特', '因斯布魯克', 'austria', 'vienna', 'salzburg', 'hallstatt'],
    tz: 'Europe/Vienna',
    flag: '🇦🇹',
    label: '奧地利時間 (CET)',
    countryName: '奧地利',
    countryCode: 'AT',
    currencyCode: 'EUR',
  },
  {
    keywords: ['捷克', '布拉格', '庫倫洛夫', 'czech', 'prague', 'cesky krumlov'],
    tz: 'Europe/Prague',
    flag: '🇨🇿',
    label: '捷克時間 (CET)',
    countryName: '捷克',
    countryCode: 'CZ',
    currencyCode: 'CZK',
  },
  {
    keywords: ['葡萄牙', '里斯本', '波多', '波爾圖', 'portugal', 'lisbon', 'porto'],
    tz: 'Europe/Lisbon',
    flag: '🇵🇹',
    label: '葡萄牙時間 (WET)',
    countryName: '葡萄牙',
    countryCode: 'PT',
    currencyCode: 'EUR',
  },
  {
    keywords: ['冰島', '雷克雅維克', '藍湖', 'iceland', 'reykjavik'],
    tz: 'Atlantic/Reykjavik',
    flag: '🇮🇸',
    label: '冰島時間 (GMT)',
    countryName: '冰島',
    countryCode: 'IS',
    currencyCode: 'ISK',
  },

  // --- North America (split by timezone) ---
  {
    keywords: ['紐約', '波士頓', '華盛頓', '邁阿密', '奧蘭多', '費城', '亞特蘭大', 'new york', 'nyc', 'boston', 'washington', 'miami', 'orlando'],
    tz: 'America/New_York',
    flag: '🇺🇸',
    label: '美東時間 (ET)',
    countryName: '美國',
    countryCode: 'US',
    currencyCode: 'USD',
  },
  {
    keywords: ['芝加哥', '達拉斯', '休士頓', '奧斯汀', '紐奧良', 'chicago', 'dallas', 'houston', 'austin', 'new orleans'],
    tz: 'America/Chicago',
    flag: '🇺🇸',
    label: '美中時間 (CT)',
    countryName: '美國',
    countryCode: 'US',
    currencyCode: 'USD',
  },
  {
    keywords: ['加州', '洛杉磯', '舊金山', '西雅圖', '拉斯維加斯', '聖地牙哥', '波特蘭', '優勝美地', 'california', 'los angeles', 'san francisco', 'seattle', 'las vegas', 'san diego', 'usa', '美國'],
    tz: 'America/Los_Angeles',
    flag: '🇺🇸',
    label: '美西時間 (PT)',
    countryName: '美國',
    countryCode: 'US',
    currencyCode: 'USD',
  },
  {
    keywords: ['夏威夷', '檀香山', '歐胡島', '茂宜島', 'hawaii', 'honolulu', 'maui', 'oahu'],
    tz: 'Pacific/Honolulu',
    flag: '🌺',
    label: '夏威夷時間 (HST)',
    countryName: '美國',
    countryCode: 'US',
    currencyCode: 'USD',
  },
  // Canada East BEFORE Canada West
  {
    keywords: ['多倫多', '蒙特婁', '渥太華', '魁北克', '尼加拉', 'toronto', 'montreal', 'ottawa', 'quebec'],
    tz: 'America/Toronto',
    flag: '🇨🇦',
    label: '加東時間 (ET)',
    countryName: '加拿大',
    countryCode: 'CA',
    currencyCode: 'CAD',
  },
  {
    keywords: ['溫哥華', '班夫', '卡加利', '黃刀鎮', '加拿大', 'vancouver', 'banff', 'calgary', 'yellowknife', 'canada'],
    tz: 'America/Vancouver',
    flag: '🇨🇦',
    label: '加西時間 (PT)',
    countryName: '加拿大',
    countryCode: 'CA',
    currencyCode: 'CAD',
  },

  // --- Oceania (split Perth vs East Coast) ---
  {
    keywords: ['伯斯', '柏斯', '西澳', 'perth'],
    tz: 'Australia/Perth',
    flag: '🇦🇺',
    label: '西澳時間 (AWST)',
    countryName: '澳洲',
    countryCode: 'AU',
    currencyCode: 'AUD',
  },
  {
    keywords: ['澳洲', '雪梨', '悉尼', '墨爾本', '布里斯本', '黃金海岸', '凱恩斯', '塔斯馬尼亞', 'australia', 'sydney', 'melbourne', 'brisbane', 'gold coast', 'cairns'],
    tz: 'Australia/Sydney',
    flag: '🇦🇺',
    label: '澳東時間 (AEST)',
    countryName: '澳洲',
    countryCode: 'AU',
    currencyCode: 'AUD',
  },
  {
    keywords: ['紐西蘭', '新西蘭', '奧克蘭', '基督城', '皇后鎮', '威靈頓', 'new zealand', 'auckland', 'queenstown', 'christchurch'],
    tz: 'Pacific/Auckland',
    flag: '🇳🇿',
    label: '紐西蘭時間 (NZST)',
    countryName: '紐西蘭',
    countryCode: 'NZ',
    currencyCode: 'NZD',
  },
];

function matchesKeyword(cleanDest: string, keyword: string): boolean {
  const kw = keyword.toLowerCase();
  // Short ASCII codes (e.g. 'uk', 'hk', 'nyc', 'usa') must match on word boundaries
  // so 'uk' never matches 'Fukuoka', 'Fukushima', or 'Tsukiji'.
  if (/^[a-z]{2,3}$/.test(kw)) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(cleanDest);
  }
  return cleanDest.includes(kw);
}

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
      if (rule.keywords.some((k) => matchesKeyword(cleanDest, k))) {
        return {
          tz: rule.tz,
          flag: rule.flag,
          label: rule.label,
          countryName: rule.countryName,
          countryCode: rule.countryCode,
          currencyCode: rule.currencyCode,
        };
      }
    }
  }

  // 2. Coordinate boundary match if valid non-zero coordinates are provided
  if (
    coords &&
    typeof coords.lat === 'number' &&
    typeof coords.lng === 'number' &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    !(coords.lat === 0 && coords.lng === 0)
  ) {
    const { lat, lng } = coords;

    // Specific smaller regions MUST be tested BEFORE larger encompassing boxes!
    // Taiwan (before Japan)
    if (lat >= 21.5 && lat <= 25.5 && lng >= 119.3 && lng <= 122.1) {
      return { tz: 'Asia/Taipei', flag: '🇹🇼', label: '台灣時間 (TST)', countryName: '台灣', countryCode: 'TW', currencyCode: 'TWD' };
    }
    // Hong Kong & Macau
    if (lat >= 22.1 && lat <= 22.6 && lng >= 113.4 && lng <= 114.5) {
      return { tz: 'Asia/Hong_Kong', flag: '🇭🇰', label: '香港時間 (HKT)', countryName: '香港', countryCode: 'HK', currencyCode: 'HKD' };
    }
    // Korea (before Japan — Korea overlaps Japan's western longitude range)
    if (lat >= 33.0 && lat <= 38.7 && lng >= 124.5 && lng <= 130.95) {
      return { tz: 'Asia/Seoul', flag: '🇰🇷', label: '韓國時間 (KST)', countryName: '韓國', countryCode: 'KR', currencyCode: 'KRW' };
    }
    // Japan
    if (lat >= 24 && lat <= 46 && lng >= 122.5 && lng <= 153) {
      return { tz: 'Asia/Tokyo', flag: '🇯🇵', label: '日本時間 (JST)', countryName: '日本', countryCode: 'JP', currencyCode: 'JPY' };
    }
    // Singapore
    if (lat >= 1.15 && lat <= 1.5 && lng >= 103.55 && lng <= 104.1) {
      return { tz: 'Asia/Singapore', flag: '🇸🇬', label: '新加坡時間 (SGT)', countryName: '新加坡', countryCode: 'SG', currencyCode: 'SGD' };
    }
    // Thailand
    if (lat >= 5.6 && lat <= 20.5 && lng >= 97.3 && lng <= 105.6) {
      return { tz: 'Asia/Bangkok', flag: '🇹🇭', label: '泰國時間 (ICT)', countryName: '泰國', countryCode: 'TH', currencyCode: 'THB' };
    }
    // UK & Ireland (BEFORE Western Europe!)
    if (lat >= 49.8 && lat <= 61 && lng >= -11 && lng <= 2) {
      return { tz: 'Europe/London', flag: '🇬🇧', label: '英國時間 (GMT/BST)', countryName: '英國', countryCode: 'GB', currencyCode: 'GBP' };
    }
    // Western & Central Europe
    if (lat >= 35 && lat <= 60 && lng >= -10 && lng <= 20) {
      return { tz: 'Europe/Paris', flag: '🇪🇺', label: '歐洲中部時間 (CET)', countryName: '歐洲', countryCode: 'EU', currencyCode: 'EUR' };
    }
    // US West
    if (lat >= 30 && lat <= 50 && lng >= -125 && lng <= -114) {
      return { tz: 'America/Los_Angeles', flag: '🇺🇸', label: '美西時間 (PT)', countryName: '美國', countryCode: 'US', currencyCode: 'USD' };
    }
    // US East
    if (lat >= 25 && lat <= 48 && lng >= -85 && lng <= -65) {
      return { tz: 'America/New_York', flag: '🇺🇸', label: '美東時間 (ET)', countryName: '美國', countryCode: 'US', currencyCode: 'USD' };
    }
    // Australia West (Perth)
    if (lat >= -36 && lat <= -13 && lng >= 112 && lng <= 129) {
      return { tz: 'Australia/Perth', flag: '🇦🇺', label: '西澳時間 (AWST)', countryName: '澳洲', countryCode: 'AU', currencyCode: 'AUD' };
    }
    // Australia East
    if (lat >= -45 && lat <= -10 && lng > 129 && lng <= 155) {
      return { tz: 'Australia/Sydney', flag: '🇦🇺', label: '澳東時間 (AEST)', countryName: '澳洲', countryCode: 'AU', currencyCode: 'AUD' };
    }
    // New Zealand
    if (lat >= -48 && lat <= -34 && lng >= 166 && lng <= 179) {
      return { tz: 'Pacific/Auckland', flag: '🇳🇿', label: '紐西蘭時間 (NZST)', countryName: '紐西蘭', countryCode: 'NZ', currencyCode: 'NZD' };
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

  return {
    tz: undefined,
    flag: '📍',
    label: '當地時間',
    countryName: '旅遊地',
    currencyCode: 'USD',
  };
}

const EMERGENCY_PRESETS: Record<string, EmergencyNumberEntry[]> = {
  JP: [
    { id: 'jp-police', label: '警察局報案', number: '110', note: '交通事故、遺失重要證件或緊急治安', kind: 'police' },
    { id: 'jp-ambulance', label: '火警與救護車', number: '119', note: '突發傷病、緊急醫療救護', kind: 'ambulance' },
    { id: 'jp-hotline', label: 'JNTO 觀光熱線 (中文24H)', number: '050-3816-2787', note: '日本觀光局多語種緊急協助', kind: 'hotline' },
  ],
  KR: [
    { id: 'kr-police', label: '韓國報警專線', number: '112', note: '緊急報案、財物遺失', kind: 'police' },
    { id: 'kr-ambulance', label: '急救與火警', number: '119', note: '急診與救護車支援', kind: 'ambulance' },
    { id: 'kr-hotline', label: '韓國旅遊諮詢熱線 (中文)', number: '1330', note: '24小時旅遊翻譯與急難協助', kind: 'hotline' },
  ],
  TW: [
    { id: 'tw-police', label: '警察報案', number: '110', note: '治安與交通事故', kind: 'police' },
    { id: 'tw-ambulance', label: '救護與火警', number: '119', note: '緊急醫療與救災', kind: 'ambulance' },
    { id: 'tw-hotline', label: '交通部觀光署旅服熱線', number: '0800-011-765', note: '24小時免付費旅遊諮詢', kind: 'hotline' },
  ],
  HK: [
    { id: 'hk-999', label: '報警 / 急救 / 消防', number: '999', note: '香港統一緊急求救專線', kind: 'police' },
    { id: 'hk-112', label: '行動電話緊急專線', number: '112', note: '無訊號或漫遊時自動轉接 999', kind: 'ambulance' },
  ],
  MO: [
    { id: 'mo-999', label: '報警 / 急救 / 消防', number: '999', note: '澳門緊急求救熱線', kind: 'police' },
  ],
  CN: [
    { id: 'cn-police', label: '公安報警', number: '110', kind: 'police' },
    { id: 'cn-ambulance', label: '醫療急救', number: '120', kind: 'ambulance' },
    { id: 'cn-fire', label: '火警救援', number: '119', kind: 'hotline' },
  ],
  TH: [
    { id: 'th-police', label: '泰國報警', number: '191', kind: 'police' },
    { id: 'th-ambulance', label: '醫療急救', number: '1669', kind: 'ambulance' },
    { id: 'th-tourist', label: '觀光警察 (英文/中文)', number: '1155', note: '24小時旅客專屬報案與糾紛協調', kind: 'hotline' },
  ],
  SG: [
    { id: 'sg-police', label: '新加坡警察', number: '999', kind: 'police' },
    { id: 'sg-ambulance', label: '急救與消防', number: '995', kind: 'ambulance' },
  ],
  VN: [
    { id: 'vn-police', label: '越南報警', number: '113', kind: 'police' },
    { id: 'vn-ambulance', label: '醫療急救', number: '115', kind: 'ambulance' },
  ],
  MY: [
    { id: 'my-999', label: '報警 / 急救 / 消防', number: '999', kind: 'police' },
  ],
  ID: [
    { id: 'id-112', label: '印尼緊急救難', number: '112', note: '涵蓋報警與緊急救援', kind: 'police' },
    { id: 'id-ambulance', label: '救護車專線', number: '118', kind: 'ambulance' },
  ],
  PH: [
    { id: 'ph-911', label: '緊急報警與救援', number: '911', kind: 'police' },
  ],
  GB: [
    { id: 'gb-999', label: '英國緊急專線 (警/醫/消)', number: '999', kind: 'police' },
    { id: 'gb-111', label: 'NHS 非緊急醫療諮詢', number: '111', kind: 'hotline' },
  ],
  US: [
    { id: 'us-911', label: '緊急報警 / 救護 / 消防', number: '911', note: '美國與加拿大統一緊急專線', kind: 'police' },
  ],
  CA: [
    { id: 'ca-911', label: '緊急報警 / 救護 / 消防', number: '911', note: '加拿大統一緊急專線', kind: 'police' },
  ],
  AU: [
    { id: 'au-000', label: '澳洲緊急專線 (警/醫/消)', number: '000', kind: 'police' },
    { id: 'au-112', label: '行動電話緊急專線', number: '112', kind: 'ambulance' },
  ],
  NZ: [
    { id: 'nz-111', label: '紐西蘭緊急專線 (警/醫/消)', number: '111', kind: 'police' },
  ],
};

const EU_COUNTRIES = new Set(['FR', 'IT', 'DE', 'ES', 'CH', 'NL', 'AT', 'CZ', 'PT', 'IS', 'EU']);

/**
 * Resolve destination-appropriate emergency numbers (police, ambulance, tourist hotline).
 */
export function getEmergencyNumbersForDestination(
  destination?: string,
  coords?: { lat?: number; lng?: number } | null
): DestinationEmergencyInfo {
  const tzInfo = resolveDestinationTimezone(destination, coords);
  const code = tzInfo.countryCode;

  if (code && EMERGENCY_PRESETS[code]) {
    return {
      countryName: tzInfo.countryName,
      flag: tzInfo.flag,
      entries: EMERGENCY_PRESETS[code],
    };
  }

  if (code && EU_COUNTRIES.has(code)) {
    return {
      countryName: tzInfo.countryName,
      flag: tzInfo.flag,
      entries: [
        { id: 'eu-112', label: '歐洲統一緊急求救 (警/醫/消)', number: '112', note: '全歐洲免付費、支援英文通話', kind: 'police' },
      ],
    };
  }

  return {
    countryName: tzInfo.countryName || '國際通用',
    flag: tzInfo.flag || '🌍',
    entries: [
      { id: 'global-112', label: '國際通用緊急求救', number: '112', note: '多數國家行動網路皆可轉接當地警消', kind: 'police' },
      { id: 'global-911', label: '北美 / 多國緊急報案', number: '911', kind: 'ambulance' },
    ],
  };
}
