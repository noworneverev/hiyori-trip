/**
 * Application Version and Release Metadata
 * Displayed across the App Menu, Settings, and Update Engine
 */
export const APP_VERSION = 'v1.9.4';
export const BUILD_DATE = '2026.11.18';
export const BUILD_ID = `build-${BUILD_DATE.replace(/\./g, '')}-v194`;

export const RELEASE_HIGHLIGHTS = [
  '跨裝置刪除即時同步機制：即時監聽雲端刪除紀錄 (Tombstones) 與伺服器驗證，手機刪除旅程後電腦端會自動清除舊快取，徹底解決刪除復活問題',
  '手機版頂部選單全面升級底部抽屜 (Bottom Sheet)：切換旅程、功能與設定、帳號選單在手機上改由底部滑出並鎖定背景滾動，手感如原生 App 般流暢',
  '切換旅程選單管理增強：支援於旅程列表內直接點選編輯設定或刪除指定旅程，免除層層切換的繁瑣操作',
  '清單分頁重整與行李打包獨立分頁：待辦事項／行李打包／訂位憑證三大直覺分頁，搭配 iPhone「提醒事項」無邊框編輯體驗',
];
