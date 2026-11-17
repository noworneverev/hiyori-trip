/**
 * Application Version and Release Metadata
 * Displayed across the App Menu, Settings, and Update Engine
 */
export const APP_VERSION = 'v1.9.3';
export const BUILD_DATE = '2026.11.17';
export const BUILD_ID = `build-${BUILD_DATE.replace(/\./g, '')}-v193`;

export const RELEASE_HIGHLIGHTS = [
  '清單分頁重整與行李打包獨立分頁：移除「筆記與急救」分頁，改為「待辦事項／行李打包／訂位憑證」三大直覺分頁並消除卡片內多餘按鈕',
  '行李打包同步升級 iPhone「提醒事項」編輯體驗：支援無邊框原位編輯自動儲存、左滑刪除，及右側 (i) 資訊視窗一鍵切換行李分類',
  '修復 (i) 詳細資訊視窗背景滑動穿透：透過頂層 Portal 掛載與防背景滾動鎖定，徹底消除開啟詳情彈窗時背後畫面仍可滑動的問題',
  '待辦事項 iPhone「提醒事項」原生級體驗與全站手機防 Zoom In：點擊文字即刻無邊框編輯，離開自動儲存並杜絕輸入自動放大',
  '記帳編輯畫面極簡淨化與安全邊界 (Safe-Area) 修復：單一純淨文字輸入框、可收合月曆切換與完整頂部／底部安全區適配',
];
