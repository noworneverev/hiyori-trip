/**
 * Application Version and Release Metadata
 * Displayed across the App Menu, Settings, and Update Engine
 */
export const APP_VERSION = 'v1.9.0';
export const BUILD_DATE = '2026.11.16';
export const BUILD_ID = `build-${BUILD_DATE.replace(/\./g, '')}-v190`;

export const RELEASE_HIGHLIGHTS = [
  '待辦清單極簡化與行內直接編輯：移除多餘分頁與編輯彈窗，點擊任一待辦項目即可行內快速修改內容與日期，保留行李打包清單視窗，右下角快速待辦同步升級',
  '記帳可收合月曆切換日期：支出明細頂部新增 7 欄月曆檢視每日花費與行程日標記，支援前後日切換與一鍵檢視全部明細',
  '天天記帳式直覺記帳排版：主記帳與右下角快記全面統一為「日期 / 金額 / 類別 / 帳戶 / 成員 / 標籤 / 收據照片 / DESCRIPTION 區」點擊挑選排版，並支援「再記一筆」連續記帳與自訂標籤',
  '手機端與 PWA 長效登入強化：顯式鎖定本機持久層、彈窗優先搭配跳轉自動接回，並拆開 Google 登入與 Drive 增量授權',
  '記帳明細與隨行編輯體驗升級：手機左滑與桌面點擊直覺展開編輯與刪除，安全確認防誤觸',
];
