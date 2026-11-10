/**
 * Application Version and Release Metadata
 * Displayed across the App Menu, Settings, and Update Engine
 */
export const APP_VERSION = 'v1.7.2';
export const BUILD_DATE = '2026.11.10';
export const BUILD_ID = `build-${BUILD_DATE.replace(/\./g, '')}-v172`;

export const RELEASE_HIGHLIGHTS = [
  '一秒記帳金額體驗升級：多螢幕字體動態適配（大數字自動縮放避免溢出）、數值專用鍵盤防跳動與快速累加按鈕',
  '雲端防丟失全面強化：未登入提供唯讀瀏覽模式，任何編輯與新增操作智能導向 Google 登入',
  '本機資料自動雲端遷移：登入 Google 帳號後，自動將裝置上既有行程與相片上傳至雲端資料庫',
  'Google 風格無障礙同步狀態標籤：雲端打勾、旋轉同步、上傳箭頭，色盲友善且點擊即強制備份',
  '行程分享連結免登入預覽：公開分享連結保持免登入唯讀瀏覽，匯入編輯需登入確保雲端儲存',
  '跨旅程回憶與足跡時光庫：月曆足跡、時光故事軸與全新「年度回顧」分頁',
];
