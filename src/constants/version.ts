/**
 * Application Version and Release Metadata
 * Displayed across the App Menu, Settings, and Update Engine
 */
export const APP_VERSION = 'v1.9.2';
export const BUILD_DATE = '2026.11.17';
export const BUILD_ID = `build-${BUILD_DATE.replace(/\./g, '')}-v192`;

export const RELEASE_HIGHLIGHTS = [
  '待辦事項 iPhone「提醒事項」原生級體驗：點擊文字直接無邊框原位編輯、離開即自動儲存；右側 (i) 資訊按鈕可開啟 iOS 風格詳細資訊設定日期與備註',
  '全站手機版輸入防自動放大：統一調整觸控裝置輸入框與選單字級，徹底杜絕 iOS Safari / PWA 點擊輸入時畫面自動 Zoom In',
  '記帳編輯畫面極簡淨化：移除快速加額按鍵與冗餘描述標題，改為單一純淨文字輸入框並無損兼容既有備註',
  '全站手機版安全邊界 (Safe-Area) 全面修復：確保各類彈窗於手機全螢幕與 PWA 模式下不與頂部時間、電量重疊',
  '記帳可收合月曆切換日期與天天記帳式排版：支援前後日切換、點擊挑選類別／帳戶／成員／標籤與「再記一筆」連續記帳',
];
