import { Language } from './i18n';

export interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  precipitation: number;
  weatherCode: number;
  maxTemp: number;
  minTemp: number;
  rainProbability: number;
  locationName: string;
  source: 'destination' | 'gps';
  fetchedAt: number;
}

/**
 * WMO Weather Codes translation dictionary
 */
export function getWeatherDescription(code: number, lang: Language): { label: string; icon: string } {
  // Mapping of WMO weather codes
  if (code === 0) {
    const labels: Record<Language, string> = {
      zh: '晴朗無雲',
      en: 'Clear Sky',
      ja: '快晴',
      ko: '맑음',
      'zh-CN': '晴朗无云',
    };
    return { label: labels[lang] || labels.en, icon: '☀️' };
  }
  if (code === 1 || code === 2) {
    const labels: Record<Language, string> = {
      zh: '多雲時晴',
      en: 'Partly Cloudy',
      ja: '晴れ時々曇り',
      ko: '구름 조금',
      'zh-CN': '多云时晴',
    };
    return { label: labels[lang] || labels.en, icon: '⛅' };
  }
  if (code === 3) {
    const labels: Record<Language, string> = {
      zh: '陰天多雲',
      en: 'Overcast',
      ja: '曇り',
      ko: '흐림',
      'zh-CN': '阴天多云',
    };
    return { label: labels[lang] || labels.en, icon: '☁️' };
  }
  if (code === 45 || code === 48) {
    const labels: Record<Language, string> = {
      zh: '有霧 / 薄霧',
      en: 'Foggy',
      ja: '霧',
      ko: '안개',
      'zh-CN': '有雾 / 薄雾',
    };
    return { label: labels[lang] || labels.en, icon: '🌫️' };
  }
  if (code >= 51 && code <= 57) {
    const labels: Record<Language, string> = {
      zh: '毛毛細雨',
      en: 'Drizzle',
      ja: '小雨・霧雨',
      ko: '이슬비',
      'zh-CN': '毛毛细雨',
    };
    return { label: labels[lang] || labels.en, icon: '🌦️' };
  }
  if (code >= 61 && code <= 67) {
    const labels: Record<Language, string> = {
      zh: '陣雨降雨',
      en: 'Rain',
      ja: '雨',
      ko: '비',
      'zh-CN': '阵雨降雨',
    };
    return { label: labels[lang] || labels.en, icon: '🌧️' };
  }
  if (code >= 71 && code <= 77) {
    const labels: Record<Language, string> = {
      zh: '飄雪 / 降雪',
      en: 'Snowfall',
      ja: '雪',
      ko: '눈',
      'zh-CN': '飘雪 / 降雪',
    };
    return { label: labels[lang] || labels.en, icon: '❄️' };
  }
  if (code >= 80 && code <= 82) {
    const labels: Record<Language, string> = {
      zh: '短暫驟雨',
      en: 'Rain Showers',
      ja: 'にわか雨',
      ko: '소나기',
      'zh-CN': '短暂骤雨',
    };
    return { label: labels[lang] || labels.en, icon: '🌧️' };
  }
  if (code >= 85 && code <= 86) {
    const labels: Record<Language, string> = {
      zh: '短暫陣雪',
      en: 'Snow Showers',
      ja: 'にわか雪',
      ko: '소낙눈',
      'zh-CN': '短暂阵雪',
    };
    return { label: labels[lang] || labels.en, icon: '🌨️' };
  }
  if (code >= 95) {
    const labels: Record<Language, string> = {
      zh: '雷陣雨',
      en: 'Thunderstorm',
      ja: '雷雨',
      ko: '뇌우',
      'zh-CN': '雷阵雨',
    };
    return { label: labels[lang] || labels.en, icon: '⛈️' };
  }

  const defaultLabels: Record<Language, string> = {
    zh: '良好天氣',
    en: 'Mild',
    ja: '穏やか',
    ko: '보통',
    'zh-CN': '良好天气',
  };
  return { label: defaultLabels[lang] || defaultLabels.en, icon: '🌤️' };
}

/**
 * Request user's current GPS position via browser Geolocation API
 */
export function getBrowserCoordinates(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        reject(err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  });
}

/**
 * Geocode city name to coordinates via Open-Meteo geocoding API
 */
export async function geocodeCity(name: string): Promise<{ lat: number; lng: number; name: string } | null> {
  try {
    const cleanName = encodeURIComponent(name.trim().split(/[,/]/)[0]);
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${cleanName}&count=1&language=en&format=json`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const match = data.results[0];
      return {
        lat: match.latitude,
        lng: match.longitude,
        name: match.name,
      };
    }
  } catch (e) {
    console.warn('Geocoding failed for', name, e);
  }
  return null;
}

/**
 * Fetch live weather from Open-Meteo (Free, reliable, no API key required)
 */
export async function fetchCurrentWeather(
  lat: number,
  lng: number,
  locationName: string,
  source: 'destination' | 'gps' = 'destination'
): Promise<WeatherData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Weather fetch failed: ${res.statusText}`);
  }

  const data = await res.json();
  const current = data.current;
  const daily = data.daily;

  return {
    temperature: Math.round(current.temperature_2m),
    apparentTemperature: Math.round(current.apparent_temperature),
    humidity: current.relative_humidity_2m,
    windSpeed: Math.round(current.wind_speed_10m),
    precipitation: current.precipitation,
    weatherCode: current.weather_code,
    maxTemp: daily?.temperature_2m_max?.[0] !== undefined ? Math.round(daily.temperature_2m_max[0]) : Math.round(current.temperature_2m),
    minTemp: daily?.temperature_2m_min?.[0] !== undefined ? Math.round(daily.temperature_2m_min[0]) : Math.round(current.temperature_2m),
    rainProbability: daily?.precipitation_probability_max?.[0] || 0,
    locationName,
    source,
    fetchedAt: Date.now(),
  };
}
