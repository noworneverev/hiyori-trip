/**
 * Application Version and Release Metadata
 * Displayed across the App Menu, Settings, and Update Engine
 */
export const APP_VERSION = 'v1.8.0';
export const BUILD_DATE = '2026.11.15';
export const BUILD_ID = `build-${BUILD_DATE.replace(/\./g, '')}-v180`;

export const RELEASE_HIGHLIGHTS = [
  '手機端與 PWA 長效登入強化：顯式鎖定本機持久層、彈窗優先搭配跳轉自動接回，並拆開 Google 登入與 Drive 增量授權',
  '記帳明細手機左滑操作：左滑支出列展開編輯與刪除按鈕，搭配安全確認視窗與防誤觸手勢保護',
  'Google Drive 原圖備份與 EXIF 批次上傳：相簿縮圖極速載入、燈箱切換檢視 400GB 原始高畫質照片',
  '雲端同步與離線衝突防護：冷快取防覆寫、媒體垃圾回收（GC）、外部連結與記帳多幣別精準度全面加固',
];
