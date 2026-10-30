import React, { useState, useRef, useEffect } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { Language, TRANSLATIONS, LANGUAGE_OPTIONS } from '../../utils/i18n';
import { performAppUpdate, UpdateState } from '../../utils/pwaUpdater';
import { APP_VERSION, BUILD_DATE } from '../../constants/version';
import { getSavedAccessibilityScale, applyAccessibilityScale, AccessibilityScale, ACCESSIBILITY_OPTIONS } from '../../utils/accessibility';
import { getCustomGeminiKey, setCustomGeminiKey } from '../../utils/aiClient';
import { getStorageUsage } from '../../utils/storage';
import {
  Menu,
  X,
  Sun,
  Moon,
  Languages,
  Upload,
  Smartphone,
  ExternalLink,
  ShieldCheck,
  Github,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Check,
  Printer,
  Share2,
  Users,
  RotateCcw,
  Eye,
  Key,
  Trash2,
  HardDrive,
} from 'lucide-react';

import { usePWAInstall } from '../../hooks/usePWAInstall';

interface AppMenuProps {
  lang: Language;
  onSelectLang: (lang: Language) => void;
  isDark: boolean;
  onToggleDarkMode: () => void;
  onOpenImportExport: () => void;
  onOpenExportPDF: () => void;
  onOpenShareTrip?: () => void;
  onOpenCollaborate?: () => void;
  onResetData?: () => void;
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
  onResetData,
}) => {
  const { isInstallable, install } = usePWAInstall();
  const [isOpen, setIsOpen] = useState(false);
  const [showLangSubmenu, setShowLangSubmenu] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [geminiKey, setGeminiKeyState] = useState(getCustomGeminiKey());
  const [isSavedKey, setIsSavedKey] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' });
  const [scale, setScale] = useState<AccessibilityScale>(getSavedAccessibilityScale);
  const storageInfo = getStorageUsage();

  useBodyScrollLock(updateState.status === 'checking' || updateState.status === 'updating');
  const menuRef = useRef<HTMLDivElement>(null);
  const t = TRANSLATIONS[lang];

  useEffect(() => {
    const handleScaleEvent = (e: any) => {
      setScale(e.detail?.scale || getSavedAccessibilityScale());
    };
    window.addEventListener('accessibility_scale_changed', handleScaleEvent);
    return () => window.removeEventListener('accessibility_scale_changed', handleScaleEvent);
  }, []);

  const handleSelectScale = (nextScale: AccessibilityScale) => {
    setScale(nextScale);
    applyAccessibilityScale(nextScale);
  };

  const handleSaveGeminiKey = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomGeminiKey(geminiKey);
    setIsSavedKey(true);
    setTimeout(() => setIsSavedKey(false), 2000);
  };

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
        className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center transition shadow-2xs active:scale-95 cursor-pointer"
        title={lang === 'zh' ? '功能與設定' : 'Menu & Settings'}
        aria-label="Menu"
      >
        {isOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {/* Popover Menu - Unified, single layer, clean layout */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-24px)] max-w-[310px] sm:w-[320px] max-h-[85vh] overflow-y-auto bg-white/98 dark:bg-slate-900/98 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200/90 dark:border-slate-800 p-2.5 z-50 animate-in fade-in zoom-in-95 duration-150 text-xs">
          {/* Header Label with Version Tag */}
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-200">
                {lang === 'zh' ? '功能與設定' : 'Menu & Settings'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-slate-400">日和手帳 Hiyori</span>
                <span className="px-1.5 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 font-mono text-[9px] font-bold border border-teal-200/60 dark:border-teal-800">
                  {APP_VERSION}
                </span>
              </div>
            </div>

            {/* GitHub Link */}
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
            {/* Section 1: 介面與顯示偏好 (Display & Reading Preferences) */}
            <div className="space-y-1">
              <p className="px-2 pt-0.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {lang === 'zh' ? '顯示偏好' : 'Display'}
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

                {/* Clean Typography Scaling (Zero awkward presbyopia/elderly mentions) */}
                <div className="p-2.5 space-y-1.5 bg-teal-50/30 dark:bg-teal-950/20">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span>{lang === 'zh' ? '文字大小' : 'Text Size'}</span>
                    </span>
                    <span className="text-[10px] font-bold text-teal-700 dark:text-teal-300">
                      {scale === 'senior' ? '特大 130%' : scale === 'comfortable' ? '放大 115%' : '標準 100%'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 p-0.5 rounded-xl bg-slate-200/60 dark:bg-slate-800 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => handleSelectScale('normal')}
                      className={`py-1 rounded-lg transition cursor-pointer text-center ${
                        scale === 'normal'
                          ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-200 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      標準
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectScale('comfortable')}
                      className={`py-1 rounded-lg transition cursor-pointer text-center ${
                        scale === 'comfortable'
                          ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-200 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      放大
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectScale('senior')}
                      className={`py-1 rounded-lg transition cursor-pointer text-center ${
                        scale === 'senior'
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      特大
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: 行程工具 (Trip Tools & Sharing) */}
            <div className="space-y-1">
              <p className="px-2 pt-0.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {lang === 'zh' ? '行程工具' : 'Trip Tools'}
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

            {/* Section 3: 系統維護與進階 (System & Advanced) */}
            <div className="space-y-1">
              <p className="px-2 pt-0.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {lang === 'zh' ? '系統與維護' : 'System'}
              </p>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
                {/* Install PWA (if supported) */}
                {isInstallable && (
                  <button
                    onClick={async () => {
                      await install();
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

                {/* Check Update with Version Info */}
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
                    <div className="text-left">
                      <span className="font-semibold text-xs block">
                        {updateState.status === 'checking'
                          ? (lang === 'zh' ? '正在檢查更新...' : 'Checking...')
                          : updateState.status === 'updating'
                          ? (lang === 'zh' ? '正在載入新版...' : 'Loading...')
                          : (lang === 'zh' ? '檢查系統更新' : 'Check for Updates')}
                      </span>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        {APP_VERSION} ({BUILD_DATE})
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800">
                    {lang === 'zh' ? '檢查' : 'Check'}
                  </span>
                </button>

                {/* Collapsible Advanced Settings (Directly inside menu - No extra modal layer) */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-100/70 dark:hover:bg-slate-800 transition text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-medium text-xs">
                        {lang === 'zh' ? '進階資料與快取' : 'Advanced & Storage'}
                      </span>
                    </div>
                    {showAdvanced ? (
                      <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>

                  {showAdvanced && (
                    <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 space-y-3 animate-in fade-in duration-100">
                      {/* Storage Info & Reset */}
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 dark:text-slate-400">
                          {lang === 'zh' ? '本機已使用容量' : 'Local Storage'}: <strong className="text-slate-700 dark:text-slate-200">{storageInfo.formatted}</strong>
                        </span>

                        {showConfirmReset ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                if (onResetData) {
                                  onResetData();
                                } else {
                                  localStorage.clear();
                                  window.location.reload();
                                }
                              }}
                              className="px-2 py-1 bg-rose-600 text-white rounded-lg font-bold text-[10px] hover:bg-rose-700 transition"
                            >
                              確定重設
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowConfirmReset(false)}
                              className="px-1.5 py-1 text-slate-400 hover:text-slate-600 text-[10px]"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowConfirmReset(true)}
                            className="text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 font-semibold text-[10px]"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>重設快取</span>
                          </button>
                        )}
                      </div>

                      {/* Custom Gemini Key Form */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                          <span className="font-bold flex items-center gap-1">
                            <Key className="w-3 h-3 text-teal-600" />
                            <span>{lang === 'zh' ? '自訂 Gemini API Key (選填)' : 'Custom Gemini Key'}</span>
                          </span>
                        </div>
                        <form onSubmit={handleSaveGeminiKey} className="flex gap-1.5">
                          <input
                            type="password"
                            value={geminiKey}
                            onChange={(e) => setGeminiKeyState(e.target.value)}
                            placeholder="AIzaSy... (留空即使用預設免費解析)"
                            className="flex-1 px-2.5 py-1 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 font-mono text-[11px] outline-none focus:border-teal-500 text-slate-800 dark:text-slate-100"
                          />
                          <button
                            type="submit"
                            className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 transition"
                          >
                            {isSavedKey ? <Check className="w-3 h-3" /> : null}
                            <span>{isSavedKey ? '已存' : '儲存'}</span>
                          </button>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
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
