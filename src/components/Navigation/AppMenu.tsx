import React, { useState, useRef, useEffect } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
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
  useBodyScrollLock(updateState.status === 'checking' || updateState.status === 'updating');
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
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-24px)] max-w-[310px] sm:w-[320px] max-h-[85vh] overflow-y-auto bg-white/98 dark:bg-slate-900/98 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200/90 dark:border-slate-800 p-2.5 z-50 animate-in fade-in zoom-in-95 duration-150 text-xs">
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

          <div className="py-1 space-y-2.5">
            {/* Card 1: 常用偏好 (Preferences) */}
            <div className="space-y-1">
              <p className="px-2 pt-0.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {lang === 'zh' ? '常用偏好' : 'Preferences'}
              </p>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
                {/* Dark Mode Toggle */}
                <button
                  onClick={onToggleDarkMode}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100/70 dark:hover:bg-slate-800 transition text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {isDark ? (
                      <Moon className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Sun className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    <span className="font-medium text-xs">
                      {lang === 'zh' ? '外觀風格' : 'Appearance'}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded bg-white dark:bg-slate-700 shadow-2xs border border-slate-200/50 dark:border-slate-600/50">
                    {isDark ? t.darkMode : t.lightMode}
                  </span>
                </button>

                {/* Multi-Language Selector */}
                <div>
                  <button
                    onClick={() => setShowLangSubmenu(!showLangSubmenu)}
                    className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100/70 dark:hover:bg-slate-800 transition text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Languages className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span className="font-medium text-xs">
                        {lang === 'zh' ? '介面語言' : 'Language'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      <span>{currentLangOption.flag} {currentLangOption.name}</span>
                      <ChevronRight className="w-3 h-3 text-slate-400" />
                    </div>
                  </button>

                  {/* Language Sub-options */}
                  {showLangSubmenu && (
                    <div className="p-1 mx-2 my-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 space-y-0.5 animate-in fade-in duration-100">
                      {LANGUAGE_OPTIONS.map((opt) => (
                        <button
                          key={opt.code}
                          onClick={() => {
                            onSelectLang(opt.code);
                            setShowLangSubmenu(false);
                          }}
                          className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs transition cursor-pointer ${
                            opt.code === lang
                              ? 'bg-teal-600 text-white font-bold'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
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
              </div>
            </div>

            {/* Card 2: 行程分享與協作 (Collaboration & Sharing) */}
            <div className="space-y-1">
              <p className="px-2 pt-0.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {lang === 'zh' ? '分享與協作' : 'Collaboration'}
              </p>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
                {/* Multiplayer Collaboration */}
                {onOpenCollaborate && (
                  <button
                    onClick={() => {
                      onOpenCollaborate();
                      setIsOpen(false);
                    }}
                    className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100/70 dark:hover:bg-slate-800 transition text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span className="font-medium text-xs">
                        {lang === 'zh' ? '成員與協作權限' : 'Trip Members & Roles'}
                      </span>
                    </div>
                    <ChevronRight className="w-3 h-3 text-slate-400" />
                  </button>
                )}

                {/* Share Trip with Family & Friends */}
                {onOpenShareTrip && (
                  <button
                    onClick={() => {
                      onOpenShareTrip();
                      setIsOpen(false);
                    }}
                    className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100/70 dark:hover:bg-slate-800 transition text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Share2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span className="font-medium text-xs">
                        {lang === 'zh' ? '分享行程給親友' : 'Share Trip with Friends'}
                      </span>
                    </div>
                    <ChevronRight className="w-3 h-3 text-slate-400" />
                  </button>
                )}

                {/* Import & Backup Center */}
                <button
                  onClick={() => {
                    onOpenImportExport();
                    setIsOpen(false);
                  }}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100/70 dark:hover:bg-slate-800 transition text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span className="font-medium text-xs">{t.importBackup}</span>
                  </div>
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                </button>

                {/* Export Printable PDF */}
                <button
                  onClick={() => {
                    onOpenExportPDF();
                    setIsOpen(false);
                  }}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100/70 dark:hover:bg-slate-800 transition text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Printer className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span className="font-medium text-xs text-teal-700 dark:text-teal-300">{t.exportPDF}</span>
                  </div>
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                </button>
              </div>
            </div>

            {/* Card 3: 隨行工具與系統 (Tools & System) */}
            <div className="space-y-1">
              <p className="px-2 pt-0.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {lang === 'zh' ? '隨行與系統' : 'Tools & System'}
              </p>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
                {/* Install PWA (if supported) */}
                {canInstallPWA && onInstallPWA && (
                  <button
                    onClick={() => {
                      onInstallPWA();
                      setIsOpen(false);
                    }}
                    className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100/70 dark:hover:bg-slate-800 transition text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="font-medium text-xs text-emerald-700 dark:text-emerald-400">
                        {lang === 'zh' ? '安裝至手機主畫面' : 'Install PWA App'}
                      </span>
                    </div>
                    <ChevronRight className="w-3 h-3 text-slate-400" />
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
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100/70 dark:hover:bg-slate-800 transition text-slate-700 dark:text-slate-300 cursor-pointer disabled:opacity-60"
                >
                  <div className="flex items-center gap-2">
                    <RotateCcw
                      className={`w-3.5 h-3.5 text-teal-600 dark:text-teal-400 ${
                        updateState.status === 'checking' || updateState.status === 'updating'
                          ? 'animate-spin'
                          : ''
                      }`}
                    />
                    <span className="font-medium text-xs">
                      {updateState.status === 'checking'
                        ? (lang === 'zh' ? '正在檢查更新...' : 'Checking...')
                        : updateState.status === 'updating'
                        ? (lang === 'zh' ? '正在載入新版...' : 'Loading...')
                        : (lang === 'zh' ? '檢查更新 / 重新載入' : 'Check for Updates')}
                    </span>
                  </div>
                  {updateState.status === 'idle' && <ChevronRight className="w-3 h-3 text-slate-400" />}
                </button>

                {/* Settings */}
                <button
                  onClick={() => {
                    onOpenSettings();
                    setIsOpen(false);
                  }}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100/70 dark:hover:bg-slate-800 transition text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Settings className="w-3.5 h-3.5 text-slate-500" />
                    <span className="font-medium text-xs">{t.settings}</span>
                  </div>
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                </button>
              </div>
            </div>
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
