import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useIsMobileViewport } from '../../hooks/useIsMobileViewport';
import { Language, TRANSLATIONS, LANGUAGE_OPTIONS } from '../../utils/i18n';
import { performAppUpdate, UpdateState } from '../../utils/pwaUpdater';
import { APP_VERSION, BUILD_DATE } from '../../constants/version';
import { getSavedAccessibilityScale, applyAccessibilityScale, AccessibilityScale } from '../../utils/accessibility';
import { getStorageUsage, getStorageUsageAsync, resetAllLocalData } from '../../utils/storage';
import {
  IosModalSheet,
  IosNavBar,
  IosInsetGroup,
  IosRow,
  IosDisclosureRow,
  IosCheckmarkRow,
  IosToggleRow,
} from '../UI/IosPrimitives';
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
  Printer,
  Share2,
  Users,
  RotateCcw,
  Eye,
  HardDrive,
  Share,
  CheckCircle2,
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
  onOpenChange?: (isOpen: boolean) => void;
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
  onOpenChange,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const isMobile = useIsMobileViewport();
  const [isOpen, setIsOpen] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showLangSubmenu, setShowLangSubmenu] = useState(false);
  const [showScaleSubmenu, setShowScaleSubmenu] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' });
  const [scale, setScale] = useState<AccessibilityScale>(getSavedAccessibilityScale);
  const [storageInfo, setStorageInfo] = useState(getStorageUsage);

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    getStorageUsageAsync().then((info) => {
      if (active) setStorageInfo(info);
    });
    return () => {
      active = false;
    };
  }, [isOpen]);

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

  // Close desktop popover on click outside
  useEffect(() => {
    if (!isOpen || isMobile) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target)) {
        setIsOpen(false);
        setShowLangSubmenu(false);
        setShowScaleSubmenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setShowLangSubmenu(false);
        setShowScaleSubmenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isMobile]);

  const currentLangOption = LANGUAGE_OPTIONS.find((l) => l.code === lang) || LANGUAGE_OPTIONS[0];
  const scaleLabel =
    scale === 'senior' ? '特大 130%' : scale === 'comfortable' ? '放大 115%' : '標準 100%';

  const closeMenu = () => {
    setIsOpen(false);
    setShowLangSubmenu(false);
    setShowScaleSubmenu(false);
  };

  const renderGroupedSections = () => (
    <div className="space-y-4">
      {/* Section 1: Display & Reading Preferences */}
      <IosInsetGroup header={lang === 'zh' ? '顯示偏好' : 'Display'}>
        <IosToggleRow
          icon={
            isDark ? (
              <Moon className="w-4 h-4 text-teal-400" />
            ) : (
              <Sun className="w-4 h-4 text-teal-700" />
            )
          }
          label={lang === 'zh' ? '深色夜間模式' : 'Dark Appearance'}
          checked={isDark}
          onChange={() => onToggleDarkMode()}
        />

        <IosDisclosureRow
          icon={<Languages className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
          label={lang === 'zh' ? '介面語言' : 'Language'}
          value={`${currentLangOption.flag} ${currentLangOption.name}`}
          expanded={showLangSubmenu}
          onToggle={() => setShowLangSubmenu((v) => !v)}
        >
          <div className="divide-y divide-[#E5E2DC]/70 dark:divide-slate-800">
            {LANGUAGE_OPTIONS.map((opt) => (
              <IosCheckmarkRow
                key={opt.code}
                inset
                icon={<span>{opt.flag}</span>}
                label={opt.name}
                selected={opt.code === lang}
                onSelect={() => {
                  onSelectLang(opt.code);
                  setShowLangSubmenu(false);
                }}
              />
            ))}
          </div>
        </IosDisclosureRow>

        <IosDisclosureRow
          icon={<Eye className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
          label={lang === 'zh' ? '文字大小' : 'Text Size'}
          value={scaleLabel}
          expanded={showScaleSubmenu}
          onToggle={() => setShowScaleSubmenu((v) => !v)}
        >
          <div className="divide-y divide-[#E5E2DC]/70 dark:divide-slate-800">
            {[
              { id: 'normal' as AccessibilityScale, label: '標準 100%' },
              { id: 'comfortable' as AccessibilityScale, label: '放大 115%' },
              { id: 'senior' as AccessibilityScale, label: '特大 130%' },
            ].map((item) => (
              <IosCheckmarkRow
                key={item.id}
                inset
                label={item.label}
                selected={scale === item.id}
                onSelect={() => {
                  handleSelectScale(item.id);
                  setShowScaleSubmenu(false);
                }}
              />
            ))}
          </div>
        </IosDisclosureRow>
      </IosInsetGroup>

      {/* Section 2: Trip Tools */}
      <IosInsetGroup header={lang === 'zh' ? '行程工具' : 'Trip Tools'}>
        {onOpenCollaborate && (
          <IosRow
            onClick={() => {
              onOpenCollaborate();
              closeMenu();
            }}
            icon={<Users className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={lang === 'zh' ? '成員與協作權限' : 'Trip Members & Roles'}
            trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
          />
        )}

        {onOpenShareTrip && (
          <IosRow
            onClick={() => {
              onOpenShareTrip();
              closeMenu();
            }}
            icon={<Share2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={lang === 'zh' ? '分享行程給親友' : 'Share Trip with Friends'}
            trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
          />
        )}

        <IosRow
          onClick={() => {
            onOpenImportExport();
            closeMenu();
          }}
          icon={<Upload className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
          label={t.importBackup}
          trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
        />

        <IosRow
          onClick={() => {
            onOpenExportPDF();
            closeMenu();
          }}
          icon={<Printer className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
          label={t.exportPDF}
          trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
        />
      </IosInsetGroup>

      {/* Section 3: System & Maintenance */}
      <IosInsetGroup
        header={lang === 'zh' ? '系統與維護' : 'System'}
        footer={`${t.localPrivacy} · ${APP_VERSION} (${BUILD_DATE})`}
      >
        {isInstallable && (
          <IosRow
            onClick={async () => {
              await install();
              closeMenu();
            }}
            icon={<Smartphone className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={lang === 'zh' ? '安裝至手機主畫面' : 'Install PWA App'}
            trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
          />
        )}

        {!isInstallable && isIOS && !isInstalled && (
          <IosRow
            onClick={() => {
              closeMenu();
              setShowIOSGuide(true);
            }}
            icon={<Smartphone className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={lang === 'zh' ? '加到 iPhone 主畫面' : 'Add to iPhone Home Screen'}
            trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
          />
        )}

        {isInstalled && (
          <IosRow
            icon={<CheckCircle2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={lang === 'zh' ? '主畫面 App 模式' : 'Home Screen App Mode'}
            trailing={
              <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                {lang === 'zh' ? '離線就緒' : 'Offline Ready'}
              </span>
            }
          />
        )}

        <IosRow
          onClick={async () => {
            await performAppUpdate((state) => setUpdateState(state));
          }}
          disabled={updateState.status === 'checking' || updateState.status === 'updating'}
          icon={
            <RotateCcw
              className={`w-4 h-4 text-teal-700 dark:text-teal-400 ${
                updateState.status === 'checking' || updateState.status === 'updating'
                  ? 'animate-spin'
                  : ''
              }`}
            />
          }
          label={
            updateState.status === 'checking'
              ? lang === 'zh'
                ? '正在檢查更新...'
                : 'Checking...'
              : updateState.status === 'updating'
              ? lang === 'zh'
                ? '正在載入新版...'
                : 'Loading...'
              : lang === 'zh'
              ? '檢查系統更新'
              : 'Check for Updates'
          }
          trailing={
            <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
              {lang === 'zh' ? '檢查' : 'Check'}
            </span>
          }
        />

        <IosDisclosureRow
          icon={<HardDrive className="w-4 h-4 text-slate-500" />}
          label={lang === 'zh' ? '本機空間與快取' : 'Local Storage'}
          value={storageInfo.formatted}
          expanded={showAdvanced}
          onToggle={() => setShowAdvanced((v) => !v)}
        >
          <div className="p-3.5 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">
                {lang === 'zh' ? '清除離線快取資料' : 'Reset Local Cache'}
              </span>
              {showConfirmReset ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      if (onResetData) {
                        onResetData();
                      } else {
                        await resetAllLocalData();
                        window.location.reload();
                      }
                    }}
                    className="min-h-[34px] px-3 rounded-lg bg-rose-600 text-white font-bold text-xs cursor-pointer"
                  >
                    確認重設
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirmReset(false)}
                    className="min-h-[34px] px-2 text-slate-500 font-semibold text-xs cursor-pointer"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowConfirmReset(true)}
                  className="min-h-[34px] px-2.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold text-xs cursor-pointer"
                >
                  重設快取
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed pt-2 border-t border-[#E5E2DC]/70 dark:border-slate-800">
              {lang === 'zh'
                ? '行程文字解析已由安全代理或本機離線規則自動處理，無需手動設定 API Key。'
                : 'Itinerary parsing automatically uses the server proxy or local offline rules.'}
            </p>
          </div>
        </IosDisclosureRow>
      </IosInsetGroup>
    </div>
  );

  return (
    <div className="relative" ref={menuRef}>
      {/* Menu Trigger Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setShowLangSubmenu(false);
          setShowScaleSubmenu(false);
        }}
        className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl border border-[#E5E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center transition active:scale-95 cursor-pointer"
        title={lang === 'zh' ? '功能與設定' : 'Menu & Settings'}
        aria-label="Menu"
      >
        {isOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {/* Mobile Bottom Sheet via unified IosModalSheet */}
      {isOpen && isMobile && (
        <IosModalSheet
          onClose={closeMenu}
          zIndexClass="z-[80]"
          variant="grouped"
          ariaLabel={lang === 'zh' ? '功能與設定' : 'Menu & Settings'}
        >
          <IosNavBar
            title={lang === 'zh' ? '功能與設定' : 'Settings'}
            subtitle={`日和手帳 Hiyori · ${APP_VERSION}`}
            leftLabel=""
            rightLabel={lang === 'zh' ? '完成' : 'Done'}
            onRightClick={closeMenu}
          />
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
            {renderGroupedSections()}
            <div className="mt-4 px-2 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1 text-teal-700 dark:text-teal-400 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                {t.localPrivacy}
              </span>
              <a
                href="https://github.com/noworneverev/hiyori-trip"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:underline"
              >
                <Github className="w-3.5 h-3.5" />
                <span>GitHub</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        </IosModalSheet>
      )}

      {/* Desktop Popover Menu */}
      {isOpen && !isMobile && (
        <div className="absolute right-0 top-full mt-2 w-[340px] max-h-[84dvh] flex flex-col overflow-hidden bg-[#FAF9F6] dark:bg-[#0B1120] rounded-3xl shadow-2xl border border-[#E5E2DC] dark:border-slate-800 z-50 animate-in fade-in zoom-in-95 duration-150 text-xs">
          <div className="px-4 py-3 border-b border-[#E5E2DC] dark:border-slate-800 bg-white/80 dark:bg-[#111827]/90 flex items-center justify-between shrink-0">
            <div>
              <p className="font-bold text-xs text-slate-900 dark:text-slate-100">
                {lang === 'zh' ? '功能與設定' : 'Menu & Settings'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                日和手帳 Hiyori · {APP_VERSION}
              </p>
            </div>
            <a
              href="https://github.com/noworneverev/hiyori-trip"
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition"
              title="GitHub Repository"
            >
              <Github className="w-4 h-4" />
            </a>
          </div>
          <div className="p-3 overflow-y-auto overscroll-contain flex-1">
            {renderGroupedSections()}
          </div>
        </div>
      )}

      {/* iOS Safari Add-to-Home-Screen Guide Sheet */}
      {showIOSGuide && (
        <IosModalSheet
          onClose={() => setShowIOSGuide(false)}
          maxWidthClass="sm:max-w-sm"
          zIndexClass="z-[90]"
          variant="grouped"
          ariaLabel="加到 iPhone 主畫面"
        >
          <IosNavBar
            title="加到 iPhone 主畫面"
            subtitle="以全螢幕 App 離線啟動日和手帳"
            leftLabel=""
            rightLabel={lang === 'zh' ? '完成' : 'Done'}
            onRightClick={() => setShowIOSGuide(false)}
          />
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] space-y-4">
            <IosInsetGroup
              header="Safari 安裝步驟"
              footer="加入主畫面後即支援無網址列全螢幕顯示、安全區域貼合與離線隨時翻閱。"
            >
              <IosRow
                icon={
                  <span className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-200 font-bold flex items-center justify-center text-xs">
                    1
                  </span>
                }
                label={
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-normal leading-relaxed">
                    點選 Safari 工具列的 <strong className="inline-flex items-center gap-0.5 text-teal-700 dark:text-teal-300"><Share className="w-3.5 h-3.5 inline" /> 分享</strong> 按鈕。
                  </span>
                }
              />
              <IosRow
                icon={
                  <span className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-200 font-bold flex items-center justify-center text-xs">
                    2
                  </span>
                }
                label={
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-normal leading-relaxed">
                    在選單中向上滑動，找到並點擊 <strong>「加入主畫面」</strong>。
                  </span>
                }
              />
              <IosRow
                icon={
                  <span className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-200 font-bold flex items-center justify-center text-xs">
                    3
                  </span>
                }
                label={
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-normal leading-relaxed">
                    點擊右上角 <strong>「新增」</strong>，即完成安裝！
                  </span>
                }
              />
            </IosInsetGroup>
          </div>
        </IosModalSheet>
      )}

      {/* Global App Update Transition Overlay */}
      {(updateState.status === 'checking' || updateState.status === 'updating') &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs touch-none overscroll-none px-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] animate-in fade-in duration-150">
            <div className="bg-white dark:bg-[#111827] rounded-3xl p-6 shadow-2xl border border-[#E5E2DC] dark:border-slate-800 flex flex-col items-center gap-3 text-center max-w-xs animate-in zoom-in-95 duration-150">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-400 flex items-center justify-center">
                <RotateCcw className="w-6 h-6 animate-spin" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  {updateState.message || (lang === 'zh' ? '正在更新...' : 'Updating...')}
                </h4>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
