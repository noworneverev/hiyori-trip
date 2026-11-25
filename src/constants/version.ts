/**
 * Application Version and Release Metadata
 * Displayed across the App Menu, Settings, and Update Engine
 */
export const APP_VERSION = 'v2.1.0';
export const BUILD_DATE = '2026.11.25';
export const BUILD_ID = `build-${BUILD_DATE.replace(/\./g, '')}-v210`;

export const RELEASE_HIGHLIGHTS = [
  '全面商業級體驗重構：頁首兩行微層級切換器、分頁首屏減負、開啟 Sheet 自動隱藏浮動 ＋ 按鈕',
  '隨行頁對標 Flighty 優先置頂「現在行程／下一站」與即時氣象，新增行程拖曳自動捲動與地圖選點取消返回',
  '分帳導入真實還款紀錄與一鍵撤銷、憑證櫃檯出示支援離線 QR Code 與螢幕常亮、手機相片牆改為 Apple Photos 方形磚格',
  '底層同步與效能優化：修復共編與 Drive 權限異常、主入口 JS 縮減 81% 至 274 kB 並按需載入地圖與 PDF',
];
