export type Language = 'zh' | 'en' | 'ja' | 'ko' | 'zh-CN';

export interface Translations {
  appName: string;
  appSubtitle: string;
  timeline: string;
  live: string;
  expenses: string;
  packing: string;
  memories: string;
  memo: string;
  newTrip: string;
  importBackup: string;
  settings: string;
  editTrip: string;
  deleteTrip: string;
  addSpot: string;
  day: string;
  daysCount: string;
  upNext: string;
  doneToday: string;
  navGoogle: string;
  navApple: string;
  locateMap: string;
  checkin: string;
  checked: string;
  totalBudget: string;
  spent: string;
  remaining: string;
  budgetRatio: string;
  addExpense: string;
  expenseHistory: string;
  loadRecommendedPacking: string;
  packedCount: string;
  all: string;
  unpacked: string;
  packed: string;
  emergencyContacts: string;
  addContact: string;
  dial: string;
  copy: string;
  copied: string;
  travelMemo: string;
  saveNotes: string;
  saved: string;
  aiParseTitle: string;
  aiParseSubtitle: string;
  localParse: string;
  pastePlaceholder: string;
  confirmApply: string;
  cat_spot: string;
  cat_food: string;
  cat_transport: string;
  cat_hotel: string;
  cat_shopping: string;
  cat_activity: string;
  cat_other: string;
  distToNext: string;
  walkMin: string;
  driveMin: string;
  offlineMode: string;
  localPrivacy: string;
  darkMode: string;
  lightMode: string;
  syncStatus: string;
  cloudSynced: string;
  guestOffline: string;
  loginPrompt: string;
  googleLogin: string;
  syncNow: string;
  // PDF Export
  exportPDF: string;
  exportPDFSubtitle: string;
  downloadPDF: string;
  printPDF: string;
  generatingPDF: string;
  pdfExportSuccess: string;
  includePacking: string;
  includeEmergency: string;
  includeNotes: string;
  includeBudget: string;
  // Weather
  currentWeather: string;
  destinationWeather: string;
  gpsWeather: string;
  useGpsLocation: string;
  useDestination: string;
  feelsLike: string;
  humidity: string;
  rainProb: string;
  wind: string;
  highLow: string;
  fetchingWeather: string;
}

export const TRANSLATIONS: Record<Language, Translations> = {
  zh: {
    appName: '日和手帳 Hiyori',
    appSubtitle: '自由行隨身旅行手帖',
    timeline: '行程地圖',
    live: '隨行導覽',
    expenses: '消費記帳',
    packing: '清單待辦',
    memories: '旅程相簿',
    memo: '隨身便籤',
    newTrip: '新行程',
    importBackup: '匯入/備份',
    settings: '設定',
    editTrip: '編輯旅程',
    deleteTrip: '刪除旅程',
    addSpot: '新增景點',
    day: '第 {n} 天',
    daysCount: '共 {d} 天 {n} 夜',
    upNext: '下個行程',
    doneToday: '今日行程已全部完成！',
    navGoogle: 'Google 導航',
    navApple: 'Apple 地圖',
    locateMap: '地圖定位',
    checkin: '打勾',
    checked: '已造訪',
    totalBudget: '總預算',
    spent: '已花費',
    remaining: '剩餘',
    budgetRatio: '預算進度',
    addExpense: '記一筆',
    expenseHistory: '花費明細',
    loadRecommendedPacking: '載入必備品',
    packedCount: '已打包',
    all: '全部',
    unpacked: '未打包',
    packed: '已打包',
    emergencyContacts: '緊急聯絡與就醫',
    addContact: '新增聯絡',
    dial: '撥號',
    copy: '複製',
    copied: '已複製',
    travelMemo: '隨身筆記備忘',
    saveNotes: '儲存筆記',
    saved: '已儲存！',
    aiParseTitle: '智慧行程排程解析',
    aiParseSubtitle: '自動整理每日行程、真實座標與路線地圖',
    localParse: '本地離線解析',
    pastePlaceholder: '請貼上旅遊文字或旅行社行程...',
    confirmApply: '套用此行程',
    cat_spot: '景點',
    cat_food: '美食',
    cat_transport: '交通',
    cat_hotel: '住宿',
    cat_shopping: '購物',
    cat_activity: '體驗',
    cat_other: '其他',
    distToNext: '距下站',
    walkMin: '步行約 {m} 分',
    driveMin: '車行約 {m} 分',
    offlineMode: '離線快取・連線自動同步',
    localPrivacy: '雲端同步 · 支援離線快取',
    darkMode: '深色模式',
    lightMode: '淺色模式',
    syncStatus: '同步狀態',
    cloudSynced: 'Google 雲端即時同步中',
    guestOffline: '訪客離線模式',
    loginPrompt: '登入 Google 帳號，跨手機與電腦隨時同步行程',
    googleLogin: 'Google 登入',
    syncNow: '立即上傳同步',
    exportPDF: '匯出紙本 PDF',
    exportPDFSubtitle: '產生清晰、適合列印的 A4 離線旅遊手冊',
    downloadPDF: '下載 PDF 檔案',
    printPDF: '列印 / 另存為 PDF',
    generatingPDF: '正在產生高解析度 PDF...',
    pdfExportSuccess: 'PDF 產生成功！',
    includePacking: '包含行李清單',
    includeEmergency: '包含緊急電話',
    includeNotes: '包含隨身筆記',
    includeBudget: '包含花費預算',
    currentWeather: '即時天氣',
    destinationWeather: '目的地天氣',
    gpsWeather: '目前 GPS 定位天氣',
    useGpsLocation: '使用 GPS 定位',
    useDestination: '目的地座標',
    feelsLike: '體感',
    humidity: '濕度',
    rainProb: '降雨機率',
    wind: '風速',
    highLow: '最高/最低',
    fetchingWeather: '正在取得即時天氣...',
  },
  en: {
    appName: 'Hiyori Itinerary',
    appSubtitle: 'Field Notebook for Free Travelers',
    timeline: 'Timeline & Map',
    live: 'Live Guide',
    expenses: 'Expenses',
    packing: 'Checklists',
    memories: 'Memories',
    memo: 'Notes',
    newTrip: 'New Trip',
    importBackup: 'Import/Backup',
    settings: 'Settings',
    editTrip: 'Edit Trip',
    deleteTrip: 'Delete Trip',
    addSpot: 'Add Spot',
    day: 'Day {n}',
    daysCount: '{d} Days {n} Nights',
    upNext: 'Next Up',
    doneToday: 'All scheduled spots completed today!',
    navGoogle: 'Google Maps',
    navApple: 'Apple Maps',
    locateMap: 'Locate',
    checkin: 'Check in',
    checked: 'Visited',
    totalBudget: 'Budget',
    spent: 'Spent',
    remaining: 'Balance',
    budgetRatio: 'Budget used',
    addExpense: 'Add Expense',
    expenseHistory: 'Expense Records',
    loadRecommendedPacking: 'Load Essentials',
    packedCount: 'Packed',
    all: 'All',
    unpacked: 'Unpacked',
    packed: 'Packed',
    emergencyContacts: 'Emergency Contacts',
    addContact: 'Add Contact',
    dial: 'Call',
    copy: 'Copy',
    copied: 'Copied',
    travelMemo: 'Travel Notes',
    saveNotes: 'Save Notes',
    saved: 'Saved!',
    aiParseTitle: 'AI Smart Parse',
    aiParseSubtitle: 'Auto generates daily schedule, coordinates & map route',
    localParse: 'Local Offline Parse',
    pastePlaceholder: 'Paste your travel notes or itinerary text here...',
    confirmApply: 'Apply This Trip',
    cat_spot: 'Spot',
    cat_food: 'Food',
    cat_transport: 'Transit',
    cat_hotel: 'Hotel',
    cat_shopping: 'Shopping',
    cat_activity: 'Activity',
    cat_other: 'Other',
    distToNext: 'Next stop',
    walkMin: '~{m}m walk',
    driveMin: '~{m}m drive',
    offlineMode: 'Offline Cache • Auto Sync',
    localPrivacy: 'Cloud Synced • Offline Protected',
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',
    syncStatus: 'Sync Status',
    cloudSynced: 'Google Cloud Sync Active',
    guestOffline: 'Guest Offline Mode',
    loginPrompt: 'Sign in with Google to sync across all your devices',
    googleLogin: 'Sign In with Google',
    syncNow: 'Sync to Cloud Now',
    exportPDF: 'Export Printable PDF',
    exportPDFSubtitle: 'Generate a clean, printer-friendly A4 offline guidebook',
    downloadPDF: 'Download PDF File',
    printPDF: 'Print / Save as PDF',
    generatingPDF: 'Generating high-res PDF...',
    pdfExportSuccess: 'PDF successfully generated!',
    includePacking: 'Include Packing List',
    includeEmergency: 'Include Emergency SOS',
    includeNotes: 'Include Travel Notes',
    includeBudget: 'Include Budget Summary',
    currentWeather: 'Live Weather',
    destinationWeather: 'Destination Weather',
    gpsWeather: 'My Live GPS Weather',
    useGpsLocation: 'Use My GPS',
    useDestination: 'Destination Coords',
    feelsLike: 'Feels like',
    humidity: 'Humidity',
    rainProb: 'Rain',
    wind: 'Wind',
    highLow: 'High/Low',
    fetchingWeather: 'Fetching live weather...',
  },
  ja: {
    appName: '日和手帳（ひより）',
    appSubtitle: '自由旅行のためのスマート旅の手帖',
    timeline: '日程と地図',
    live: '旅行ガイド',
    expenses: '家計簿',
    packing: '持ち物リスト',
    memories: '想い出アルバム',
    memo: '旅のメモ',
    newTrip: '新規旅程',
    importBackup: 'インポート/バックアップ',
    settings: '設定',
    editTrip: '旅程を編集',
    deleteTrip: '旅程を削除',
    addSpot: 'スポット追加',
    day: '{n} 日目',
    daysCount: '{d} 日間 {n} 泊',
    upNext: '次の予定',
    doneToday: '本日の予定はすべて完了しました！',
    navGoogle: 'Google マップ',
    navApple: 'Apple マップ',
    locateMap: '地図で確認',
    checkin: 'チェック',
    checked: '訪問済み',
    totalBudget: '総予算',
    spent: '支出済',
    remaining: '残高',
    budgetRatio: '予算進捗',
    addExpense: '支出を記録',
    expenseHistory: '支出一覧',
    loadRecommendedPacking: '必需品を読み込む',
    packedCount: '準備済',
    all: 'すべて',
    unpacked: '未準備',
    packed: '準備済',
    emergencyContacts: '緊急連絡先',
    addContact: '連絡先追加',
    dial: '発信',
    copy: 'コピー',
    copied: 'コピー済',
    travelMemo: '旅のメモ',
    saveNotes: 'メモ保存',
    saved: '保存しました！',
    aiParseTitle: 'AI 日程自動生成',
    aiParseSubtitle: '旅行テキストから日程・座標・ルートを自動生成',
    localParse: 'オフライン解析',
    pastePlaceholder: '旅行のテキストをここに貼り付けてください...',
    confirmApply: 'この旅程を適用',
    cat_spot: '観光',
    cat_food: 'グルメ',
    cat_transport: '交通',
    cat_hotel: '宿泊',
    cat_shopping: '買い物',
    cat_activity: '体験',
    cat_other: 'その他',
    distToNext: '次まで',
    walkMin: '徒歩約 {m} 分',
    driveMin: '車で約 {m} 分',
    offlineMode: 'オフライン対応・自動同期',
    localPrivacy: 'クラウド同期・オフライン保護',
    darkMode: 'ダークモード',
    lightMode: 'ライトモード',
    syncStatus: '同期状態',
    cloudSynced: 'Google クラウド同期中',
    guestOffline: 'ゲストオフラインモード',
    loginPrompt: 'Google ログインで複数端末とリアルタイム同期',
    googleLogin: 'Google でログイン',
    syncNow: '今すぐ同期',
    exportPDF: '旅程をPDF出力',
    exportPDFSubtitle: '印刷に最適なA4オフライン旅行しおりを作成',
    downloadPDF: 'PDFファイルをダウンロード',
    printPDF: '印刷 / PDFとして保存',
    generatingPDF: '高画質PDFを生成中...',
    pdfExportSuccess: 'PDFが正常に生成されました！',
    includePacking: '持ち物リストを含める',
    includeEmergency: '緊急連絡先を含める',
    includeNotes: '旅のメモを含める',
    includeBudget: '予算・支出を含める',
    currentWeather: '現在の天気',
    destinationWeather: '旅行先の天気',
    gpsWeather: '現在地の天気 (GPS)',
    useGpsLocation: '現在地を使用',
    useDestination: '旅行先の座標',
    feelsLike: '体感',
    humidity: '湿度',
    rainProb: '降水確率',
    wind: '風速',
    highLow: '最高/最低',
    fetchingWeather: '天気を取得中...',
  },
  ko: {
    appName: '히요리 수첩 (Hiyori)',
    appSubtitle: '자유여행자를 위한 감성 여행수첩',
    timeline: '일정 및 지도',
    live: '여행 가이드',
    expenses: '가계부',
    packing: '짐싸기 목록',
    memories: '여행 앨범',
    memo: '여행 메모',
    newTrip: '새 일정',
    importBackup: '가져오기/백업',
    settings: '설정',
    editTrip: '일정 편집',
    deleteTrip: '일정 삭제',
    addSpot: '장소 추가',
    day: '{n} 일차',
    daysCount: '{d} 일 {n} 박',
    upNext: '다음 일정',
    doneToday: '오늘의 모든 일정을 완료했습니다!',
    navGoogle: 'Google 지도',
    navApple: 'Apple 지도',
    locateMap: '지도 위치',
    checkin: '체크',
    checked: '방문 완료',
    totalBudget: '총 예산',
    spent: '지출액',
    remaining: '남은 금액',
    budgetRatio: '예산 현황',
    addExpense: '지출 추가',
    expenseHistory: '지출 내역',
    loadRecommendedPacking: '필수품 불러오기',
    packedCount: '챙김',
    all: '전체',
    unpacked: '미완료',
    packed: '완료',
    emergencyContacts: '비상 연락처',
    addContact: '연락처 추가',
    dial: '전화',
    copy: '복사',
    copied: '복사됨',
    travelMemo: '여행 메모',
    saveNotes: '메모 저장',
    saved: '저장 완료!',
    aiParseTitle: 'AI 스마트 일정 변환',
    aiParseSubtitle: '텍스트에서 일정, 좌표 및 경로 자동 생성',
    localParse: '로컬 오프라인 분석',
    pastePlaceholder: '여행 일정 텍스트를 붙여넣으세요...',
    confirmApply: '이 일정 적용하기',
    cat_spot: '명소',
    cat_food: '맛집',
    cat_transport: '교통',
    cat_hotel: '숙소',
    cat_shopping: '쇼핑',
    cat_activity: '체험',
    cat_other: '기타',
    distToNext: '다음 장소까지',
    walkMin: '도보 약 {m}분',
    driveMin: '차량 약 {m}분',
    offlineMode: '오프라인 캐시・자동 동기화',
    localPrivacy: '클라우드 실시간 동기화',
    darkMode: '다크 모드',
    lightMode: '라이트 모드',
    syncStatus: '동기화 상태',
    cloudSynced: 'Google 클라우드 동기화 중',
    guestOffline: '게스트 오프라인 모드',
    loginPrompt: 'Google 로그인으로 모든 기기에서 즉시 일정 확인',
    googleLogin: 'Google 로그인',
    syncNow: '지금 동기화',
    exportPDF: '여행 일정 PDF 내보내기',
    exportPDFSubtitle: '오프라인 인쇄에 최적화된 깔끔한 A4 여행 가이드북 생성',
    downloadPDF: 'PDF 파일 다운로드',
    printPDF: '인쇄 / PDF로 저장',
    generatingPDF: '고해상도 PDF 생성 중...',
    pdfExportSuccess: 'PDF 생성이 완료되었습니다!',
    includePacking: '짐싸기 목록 포함',
    includeEmergency: '비상 연락처 포함',
    includeNotes: '여행 메모 포함',
    includeBudget: '예산 요약 포함',
    currentWeather: '현재 날씨',
    destinationWeather: '여행지 날씨',
    gpsWeather: '내 위치 날씨 (GPS)',
    useGpsLocation: '현재 위치 사용',
    useDestination: '여행지 좌표',
    feelsLike: '체감',
    humidity: '습도',
    rainProb: '강수 확률',
    wind: '풍속',
    highLow: '최고/최저',
    fetchingWeather: '실시간 날씨 확인 중...',
  },
  'zh-CN': {
    appName: '日和手帐 Hiyori',
    appSubtitle: '自由行随身旅行手帖',
    timeline: '行程地图',
    live: '随行导览',
    expenses: '消费记账',
    packing: '清单待办',
    memories: '旅程相册',
    memo: '随身便签',
    newTrip: '新行程',
    importBackup: '导入/备份',
    settings: '设置',
    editTrip: '编辑旅程',
    deleteTrip: '删除旅程',
    addSpot: '添加景点',
    day: '第 {n} 天',
    daysCount: '共 {d} 天 {n} 晚',
    upNext: '下个行程',
    doneToday: '今日行程已全部完成！',
    navGoogle: 'Google 导航',
    navApple: 'Apple 地图',
    locateMap: '地图定位',
    checkin: '打勾',
    checked: '已到访',
    totalBudget: '总预算',
    spent: '已花费',
    remaining: '剩余',
    budgetRatio: '预算进度',
    addExpense: '记一笔',
    expenseHistory: '花费明细',
    loadRecommendedPacking: '载入必备品',
    packedCount: '已打包',
    all: '全部',
    unpacked: '未打包',
    packed: '已打包',
    emergencyContacts: '紧急联络与求助',
    addContact: '添加联系人',
    dial: '拨号',
    copy: '复制',
    copied: '已复制',
    travelMemo: '随身备忘笔记',
    saveNotes: '保存笔记',
    saved: '已保存！',
    aiParseTitle: 'AI 智能解析',
    aiParseSubtitle: '自动生成每日行程、真实坐标与路线地图',
    localParse: '本地离线解析',
    pastePlaceholder: '请粘贴旅游文字或旅行社行程...',
    confirmApply: '应用此行程',
    cat_spot: '景点',
    cat_food: '美食',
    cat_transport: '交通',
    cat_hotel: '住宿',
    cat_shopping: '购物',
    cat_activity: '体验',
    cat_other: '其他',
    distToNext: '距下站',
    walkMin: '步行约 {m} 分',
    driveMin: '车行约 {m} 分',
    offlineMode: '离线缓存・联网自动同步',
    localPrivacy: '云端同步 · 支持离线缓存',
    darkMode: '深色模式',
    lightMode: '浅色模式',
    syncStatus: '同步状态',
    cloudSynced: 'Google 云端实时同步中',
    guestOffline: '访客离线模式',
    loginPrompt: '登录 Google 账号，跨手机与电脑随时同步行程',
    googleLogin: 'Google 登录',
    syncNow: '立即上传同步',
    exportPDF: '导出纸质 PDF',
    exportPDFSubtitle: '生成清晰、适合打印的 A4 离线旅游小册子',
    downloadPDF: '下载 PDF 文件',
    printPDF: '打印 / 另存为 PDF',
    generatingPDF: '正在生成高分辨率 PDF...',
    pdfExportSuccess: 'PDF 生成成功！',
    includePacking: '包含行李清单',
    includeEmergency: '包含紧急求助电话',
    includeNotes: '包含随身笔记',
    includeBudget: '包含费用预算',
    currentWeather: '实时天气',
    destinationWeather: '目的地天气',
    gpsWeather: '当前 GPS 定位天气',
    useGpsLocation: '使用 GPS 定位',
    useDestination: '目的地坐标',
    feelsLike: '体感',
    humidity: '湿度',
    rainProb: '降雨概率',
    wind: '风速',
    highLow: '最高/最低',
    fetchingWeather: '正在获取实时天气...',
  },
};

export const LANGUAGE_OPTIONS: { code: Language; name: string; flag: string }[] = [
  { code: 'zh', name: '繁體中文', flag: '🇹🇼' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'zh-CN', name: '简体中文', flag: '🇨🇳' },
];

const LANG_KEY = 'wayfarer_preferred_lang';

export function getStoredLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANG_KEY) as Language;
    if (saved && TRANSLATIONS[saved]) return saved;
  } catch {}
  return 'zh';
}

export function setStoredLanguage(lang: Language): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {}
}
