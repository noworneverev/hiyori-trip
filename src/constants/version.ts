/**
 * Application Version and Release Metadata
 * Displayed across the App Menu, Settings, and Update Engine
 */
export const APP_VERSION = 'v2.1.1';
export const BUILD_DATE = '2026.11.27';
export const BUILD_ID = `build-${BUILD_DATE.replace(/\./g, '')}-v211`;

export const RELEASE_HIGHLIGHTS = [
  '修復跨裝置雲端同步迴圈與背景洗版提示，所有頂部提示條均支援點擊與 × 立即關閉',
  '強化網頁匯入即時直推雲端與手機 PWA 切回前景自動拉取伺服器最新行程，手動同步升級為雙向同步',
  '全面商業級體驗重構：頁首兩行微層級切換器、分頁首屏減負、開啟 Sheet 自動隱藏浮動 ＋ 按鈕',
  '分帳導入真實還款紀錄與一鍵撤銷、憑證櫃檯出示支援離線 QR Code 與螢幕常亮、手機相片牆改為 Apple Photos 方形磚格',
];
