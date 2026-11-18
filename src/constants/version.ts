/**
 * Application Version and Release Metadata
 * Displayed across the App Menu, Settings, and Update Engine
 */
export const APP_VERSION = 'v1.9.5';
export const BUILD_DATE = '2026.11.18';
export const BUILD_ID = `build-${BUILD_DATE.replace(/\./g, '')}-v195`;

export const RELEASE_HIGHLIGHTS = [
  '修復 Firestore 安全規則欄位驗證（補齊消費標籤 customExpenseTags 與速記便籤 stickyNotes 寫入權限），讓雲端儲存、共編與刪除紀錄完全生效',
  '登出／重登／重新整理快取淨化與循序對帳：登出自動清除舊帳號快取，重登或重整時依序完成本機還原 ➔ 讀取雲端刪除紀錄 ➔ 清理離線佇列 ➔ 雲端合併，徹底根治手機刪除行程在電腦重登後復活的問題',
  '強化未編輯預設範例與帳號專屬行程在跨裝置刪除後的自動清理機制',
];
