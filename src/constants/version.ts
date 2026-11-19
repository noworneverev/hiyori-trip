/**
 * Application Version and Release Metadata
 * Displayed across the App Menu, Settings, and Update Engine
 */
export const APP_VERSION = 'v1.9.6';
export const BUILD_DATE = '2026.11.19';
export const BUILD_ID = `build-${BUILD_DATE.replace(/\./g, '')}-v196`;

export const RELEASE_HIGHLIGHTS = [
  '全面依照 iOS 原生 Human Interface Guidelines 重構設定、新增、編輯彈窗與行內展開群組表單，維持日和暖白紙感美學',
  'iPhone PWA 深度最佳化：動態島與瀏海 Safe Area 精準閃避（Toast 提示、Timeline 黏性日程篩選列、更新通知與離線橫幅）、暖白/深邃夜色啟動畫面無縫銜接',
  '強化 iOS 主畫面獨立執行體驗：切換回前景自動檢查新版 Service Worker、防止離線誤清快取，並於選單內建 Safari 加入主畫面指引',
];
