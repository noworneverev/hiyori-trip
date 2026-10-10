import React, { useState, useRef, useEffect } from 'react';
import { Language, TRANSLATIONS, LANGUAGE_OPTIONS } from '../../utils/i18n';
import { performAppUpdate, UpdateState } from '../../utils/pwaUpdater';
import {
  Menu,
  X,
  Sun,
  Moon,
  Languages,
  Upload,
  Settings,
  Smartphone,
  ExternalLink,
  ShieldCheck,
  Github,
  ChevronRight,
  Check,
  Printer,
  Share2,
  Users,
  RotateCcw,
} from 'lucide-react';

interface AppMenuProps {
  lang: Language;
  onSelectLang: (lang: Language) => void;
  isDark: boolean;
  onToggleDarkMode: () => void;
  onOpenImportExport: () => void;
  onOpenExportPDF: () => void;
  onOpenShareTrip?: () => void;
  onOpenCollaborate?: () => void;
  onOpenSettings: () => void;
  canInstallPWA?: boolean;
  onInstallPWA?: () => void;
}

export const AppMenu: React.FC<AppMenuProps> = ({
  lang,
  onSelectLang,
  isDark,
  onToggleDarkMode,
  onOpenImportExport,
  onOpenExportPDF,
  onOpenShareTrip,
  onOpenCollaborate,
  onOpenSettings,
  canInstallPWA,
  onInstallPWA,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showLangSubmenu, setShowLangSubmenu] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' });
  const menuRef = useRef<HTMLDivElement>(null);
  const t = TRANSLATIONS[lang];

  // Close menu on click/touch outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowLangSubmenu(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside, { passive: true });
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const currentLangOption = LANGUAGE_OPTIONS.find((l) => l.code === lang) || LANGUAGE_OPTIONS[0];

  return (
    <div className="relative" ref={menuRef}>
      {/* Menu Trigger Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setShowLangSubmenu(false);
        }}
        className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center transition shadow-2xs active:scale-95"
        title={lang === 'zh' ? '功能選單' : 'Menu'}
        aria-label="Menu"
      >
        {isOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-24px)] max-w-[280px] sm:w-72 max-h-[82vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-800 p-2 z-50 animate-in fade-in zoom-in-95 duration-150 text-xs">
          {/* Header Label */}
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-200">
                {lang === 'zh' ? '設定與工具' : 'Settings & Tools'}
              </p>
              <p className="text-[10px] text-slate-400">日和手帳 Hiyori • 隨行手帖</p>
            </div>

            {/* GitHub Quick Link */}
            <a
              href="https://github.com/noworneverev/hiyori-trip"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="GitHub Repository"
            >
              <Github className="w-4 h-4" />
            </a>
          </div>

          <div className="py-1 space-y-0.5">
            {/* Dark Mode Toggle */}
            <button
              onClick={onToggleDarkMode}
              className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-slate-700 dark:text-slate-300 transition"
            >
              <div className="flex items-center gap-2.5">
                {isDark ? (
                  <Moon className="w-4 h-4 text-amber-400" />
                ) : (
                  <Sun className="w-4 h-4 text-amber-500" />
                )}
                <span className="font-medium">
                  {lang === 'zh' ? '外觀風格' : 'Appearance'}
                </span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                {isDark ? t.darkMode : t.lightMode}
              </span>
            </button>

            {/* Multi-Language Selector */}
            <div>
              <button
                onClick={() => setShowLangSubmenu(!showLangSubmenu)}
                className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-slate-700 dark:text-slate-300 transition"
              >
                <div className="flex items-center gap-2.5">
                  <Languages className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span className="font-medium">
                    {lang === 'zh' ? '介面語言' : 'Language'}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <span>{currentLangOption.flag} {currentLangOption.name}</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              </button>

              {/* Language Sub-options */}
              {showLangSubmenu && (
                <div className="p-1 mx-2 my-1 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-0.5 animate-in fade-in duration-100">
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.code}
                      onClick={() => {
                        onSelectLang(opt.code);
                        setShowLangSubmenu(false);
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs transition ${
                        opt.code === lang
                          ? 'bg-teal-600 text-white font-bold'
                          : 'hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span>{opt.flag}</span>
                        <span>{opt.name}</span>
                      </span>
                      {opt.code === lang && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Import & Backup Center */}
            <button
              onClick={() => {
                onOpenImportExport();
                setIsOpen(false);
              }}
              className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 text-slate-700 dark:text-slate-300 transition"
            >
              <Upload className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <div className="text-left">
                <p className="font-medium">{t.importBackup}</p>
                <p className="text-[10px] text-slate-400">
                  {lang === 'zh' ? '文字解析、JSON / CSV 匯出' : 'Parse text, JSON / CSV export'}
                </p>
              </div>
            </button>

            {/* Export Printable PDF */}
            <button
              onClick={() => {
                onOpenExportPDF();
                setIsOpen(false);
              }}
              className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 text-slate-700 dark:text-slate-300 transition"
            >
              <Printer className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <div className="text-left">
                <p className="font-medium text-teal-800 dark:text-teal-300">{t.exportPDF}</p>
                <p className="text-[10px] text-slate-400">
                  {t.exportPDFSubtitle}
                </p>
              </div>
            </button>

            {/* Share Trip with Family & Friends */}
            {onOpenShareTrip && (
              <button
                onClick={() => {
                  onOpenShareTrip();
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 text-slate-700 dark:text-slate-300 transition"
              >
                <Share2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <div className="text-left">
                  <p className="font-medium text-slate-800 dark:text-slate-200">
                    {lang === 'zh' ? '分享行程給親友' : 'Share Trip with Friends'}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {lang === 'zh' ? '發布專屬公開網址與 QR Code' : 'Generate link & QR Code'}
                  </p>
                </div>
              </button>
            )}

            {/* Multiplayer Collaboration */}
            {onOpenCollaborate && (
              <button
                onClick={() => {
                  onOpenCollaborate();
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 text-slate-700 dark:text-slate-300 transition"
              >
                <Users className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <div className="text-left">
                  <p className="font-medium text-slate-800 dark:text-slate-200">
                    {lang === 'zh' ? '行程成員與協作權限' : 'Trip Members & Permissions'}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {lang === 'zh' ? '新增成員 Email、指派編輯或檢視權限' : 'Manage members & edit/view roles'}
                  </p>
                </div>
              </button>
            )}

            {/* Install PWA (if supported) */}
            {canInstallPWA && onInstallPWA && (
              <button
                onClick={() => {
                  onInstallPWA();
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 text-slate-700 dark:text-slate-300 transition"
              >
                <Smartphone className="w-4 h-4 text-emerald-600" />
                <div className="text-left">
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">
                    {lang === 'zh' ? '安裝至手機主畫面' : 'Install PWA App'}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {lang === 'zh' ? '全螢幕離線隨行體驗' : 'Full-screen offline companion'}
                  </p>
                </div>
              </button>
            )}

            {/* Force Check Update / Reload PWA */}
            <button
              type="button"
              disabled={updateState.status === 'checking' || updateState.status === 'updating'}
              onClick={async (e) => {
                e.stopPropagation();
                await performAppUpdate((state) => setUpdateState(state));
              }}
              className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-teal-50 dark:active:bg-teal-950/40 active:scale-[0.97] select-none touch-manipulation flex items-center gap-2.5 text-slate-700 dark:text-slate-300 transition cursor-pointer disabled:opacity-60"
            >
              <RotateCcw
                className={`w-4 h-4 text-teal-600 dark:text-teal-400 ${
                  updateState.status === 'checking' || updateState.status === 'updating'
                    ? 'animate-spin'
                    : ''
                }`}
              />
              <div className="text-left flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-800 dark:text-slate-200 truncate">
                    {updateState.status === 'checking'
                      ? (lang === 'zh' ? '正在檢查更新...' : 'Checking updates...')
                      : updateState.status === 'updating'
                      ? (lang === 'zh' ? '正在載入最新版...' : 'Loading latest build...')
                      : (lang === 'zh' ? '檢查更新 / 重新載入' : 'Check for Updates')}
                  </p>
                  {(updateState.status === 'checking' || updateState.status === 'updating') && (
                    <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 animate-pulse ml-1 shrink-0">
                      {lang === 'zh' ? '載入中' : 'Loading'}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 truncate">
                  {updateState.status === 'checking' || updateState.status === 'updating'
                    ? (lang === 'zh' ? '正在下載最新資源並刷新' : 'Fetching latest assets...')
                    : (lang === 'zh' ? '清除舊快取並獲取最新版本' : 'Clear cache & reload latest build')}
                </p>
              </div>
            </button>

            {/* Settings */}
            <button
              onClick={() => {
                onOpenSettings();
                setIsOpen(false);
              }}
              className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 text-slate-700 dark:text-slate-300 transition"
            >
              <Settings className="w-4 h-4 text-slate-500" />
              <div className="text-left">
                <p className="font-medium">{t.settings}</p>
                <p className="text-[10px] text-slate-400">
                  {lang === 'zh' ? '帳號同步、快取管理' : 'Account sync, cache management'}
                </p>
              </div>
            </button>
          </div>

          {/* Footer note */}
          <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1 text-teal-600 dark:text-teal-400 font-semibold">
              <ShieldCheck className="w-3 h-3" />
              {t.localPrivacy}
            </span>
            <a
              href="https://github.com/noworneverev/hiyori-trip"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:underline"
            >
              <span>GitHub</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        </div>
      )}

      {/* Global App Update Transition Overlay */}
      {(updateState.status === 'checking' || updateState.status === 'updating') && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center gap-3 text-center max-w-xs animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/80 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <RotateCcw className="w-6 h-6 animate-spin" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                {updateState.message || (lang === 'zh' ? '正在獲取最新版本...' : 'Loading latest version...')}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                {lang === 'zh'
                  ? '日和手帳正在更新，即將為您重新載入最新行程畫面'
                  : 'Hiyori is updating, reloading your itinerary shortly'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
