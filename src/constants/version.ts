/**
 * Application Version and Release Metadata
 * Displayed across the App Menu, Settings, and Update Engine
 */
export const APP_VERSION = 'v2.0.0';
export const BUILD_DATE = '2026.11.23';
export const BUILD_ID = `build-${BUILD_DATE.replace(/\./g, '')}-v200`;

export const RELEASE_HIGHLIGHTS = [
  '全面商業級重構 iOS 原生 PWA 體驗：行程支援長按／拖曳排序、相鄰景點兩點路線規劃、Google Maps 連結一鍵貼上匯入與旅程三階段智慧情境條',
  '記帳收斂為「明細／統計／分帳」三大分段視圖，新增分帳結算已還清勾選與免稅／含稅快速試算；準備頁極簡化為「待辦與隨記／預約憑證」',
  '圖片升級為輕量 WebP 壓縮並支援選配 Cloudinary／Cloudflare R2 圖床，靜態部署支援本機自訂 Gemini API Key（BYOK）與離線優先零衝突同步',
];
