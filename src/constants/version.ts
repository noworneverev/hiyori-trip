/**
 * Application Version and Release Metadata
 * Displayed across the App Menu, Settings, and Update Engine
 */
export const APP_VERSION = 'v1.9.1';
export const BUILD_DATE = '2026.11.16';
export const BUILD_ID = `build-${BUILD_DATE.replace(/\./g, '')}-v191`;

export const RELEASE_HIGHLIGHTS = [
  '記帳編輯畫面極簡淨化：移除快速加額按鍵與冗餘描述標題，改為單一純淨文字輸入框並無損兼容既有備註',
  '全站手機版安全邊界 (Safe-Area) 全面修復：修正記帳編輯視窗、快速行動抽屜、景點編輯、行李清單、相簿燈箱與各類設定彈窗於手機全螢幕與 PWA 模式下與頂部時間、電量重疊之問題',
  '待辦清單極簡化與行內直接編輯：點擊任一待辦項目即可行內快速修改內容與日期，保留行李打包清單視窗',
  '記帳可收合月曆切換日期與天天記帳式排版：支援前後日切換、點擊挑選類別／帳戶／成員／標籤與「再記一筆」連續記帳',
  '手機端與 PWA 長效登入強化：顯式鎖定本機持久層、彈窗優先搭配跳轉自動接回，並拆開 Google 登入與 Drive 增量授權',
];
