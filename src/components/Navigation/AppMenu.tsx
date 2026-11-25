import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useIsMobileViewport } from '../../hooks/useIsMobileViewport';
import { Language, TRANSLATIONS, LANGUAGE_OPTIONS } from '../../utils/i18n';
import { performAppUpdate, UpdateState } from '../../utils/pwaUpdater';
import { APP_VERSION, BUILD_DATE } from '../../constants/version';
import {
  getSavedAccessibilityScale,
  applyAccessibilityScale,
  AccessibilityScale,
  ACCESSIBILITY_OPTIONS,
} from '../../utils/accessibility';
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
  Compass,
  Settings,
  AlertCircle,
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
  onOpenGlobalHub?: () => void;
  onOpenSettings?: () => void;
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
  onOpenGlobalHub,
  onOpenSettings,
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

  const isZh = lang === 'zh' || lang === 'zh-CN';

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
  const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;

  useEffect(() => {
    const handleScaleEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ scale?: AccessibilityScale }>).detail;
      setScale(detail?.scale || getSavedAccessibilityScale());
    };
    window.addEventListener('accessibility_scale_changed', handleScaleEvent);
    return () => window.removeEventListener('accessibility_scale_changed', handleScaleEvent);
  }, []);

  const handleSelectScale = (nextScale: AccessibilityScale) => {
    setScale(nextScale);
    applyAccessibilityScale(nextScale);
  };

  const closeMenu = () => {
    setIsOpen(false);
    setShowLangSubmenu(false);
    setShowScaleSubmenu(false);
    setShowAdvanced(false);
    setShowConfirmReset(false);
  };

  // Close desktop popover on click outside or Escape
  useEffect(() => {
    if (!isOpen || isMobile) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target)) {
        closeMenu();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu();
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
  const currentScaleOption =
    ACCESSIBILITY_OPTIONS.find((o) => o.id === scale) || ACCESSIBILITY_OPTIONS[0];
  const scaleLabel = `${currentScaleOption.label} ${currentScaleOption.badge}`;

  const renderGroupedSections = () => (
    <div className="space-y-4">
      {/* Section 1: Display & Reading Preferences */}
      <IosInsetGroup header={isZh ? '顯示偏好' : 'Display'}>
        <IosToggleRow
          icon={
            isDark ? (
              <Moon className="w-4 h-4 text-teal-400" />
            ) : (
              <Sun className="w-4 h-4 text-teal-700" />
            )
          }
          label={isZh ? '深色夜間模式' : 'Dark Appearance'}
          checked={isDark}
          onChange={() => onToggleDarkMode()}
        />

        <IosDisclosureRow
          icon={<Languages className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
          label={isZh ? '介面語言' : 'Language'}
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
          label={isZh ? '文字大小' : 'Text Size'}
          value={scaleLabel}
          expanded={showScaleSubmenu}
          onToggle={() => setShowScaleSubmenu((v) => !v)}
        >
          <div className="divide-y divide-[#E5E2DC]/70 dark:divide-slate-800">
            {ACCESSIBILITY_OPTIONS.map((item) => (
              <IosCheckmarkRow
                key={item.id}
                inset
                label={`${item.label} ${item.badge}`}
                subtitle={item.description}
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
      <IosInsetGroup header={isZh ? '行程工具' : 'Trip Tools'}>
        {onOpenGlobalHub && (
          <IosRow
            onClick={() => {
              onOpenGlobalHub();
              closeMenu();
            }}
            icon={<Compass className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={isZh ? '足跡時光庫' : 'Travel Footprint Hub'}
            subtitle={isZh ? '所有旅程地圖、年鑑統計與全相片畫廊' : 'All trips map, analytics & gallery'}
            trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
          />
        )}

        {onOpenCollaborate && (
          <IosRow
            onClick={() => {
              onOpenCollaborate();
              closeMenu();
            }}
            icon={<Users className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={isZh ? '成員與協作權限' : 'Trip Members & Roles'}
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
            label={isZh ? '分享行程給親友' : 'Share Trip with Friends'}
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
        header={isZh ? '系統與維護' : 'System'}
        footer={`${t.localPrivacy} · ${APP_VERSION} (${BUILD_DATE})`}
      >
        {onOpenSettings && (
          <IosRow
            onClick={() => {
              onOpenSettings();
              closeMenu();
            }}
            icon={<Settings className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={isZh ? '系統設定與完整備份' : 'System Settings & Backup'}
            subtitle={isZh ? '全旅程 JSON 備份、手動雲端同步與版本資訊' : 'Full JSON backup, sync & release notes'}
            trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
          />
        )}

        {isInstallable && (
          <IosRow
            onClick={async () => {
              await install();
              closeMenu();
            }}
            icon={<Smartphone className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={isZh ? '安裝至手機主畫面' : 'Install PWA App'}
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
            label={isZh ? '加到 iPhone 主畫面' : 'Add to iPhone Home Screen'}
            trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
          />
        )}

        {isInstalled && (
          <IosRow
            icon={<CheckCircle2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={isZh ? '主畫面 App 模式' : 'Home Screen App Mode'}
            trailing={
              <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                {isZh ? '離線就緒' : 'Offline Ready'}
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
            updateState.status === 'error' ? (
              <AlertCircle className="w-4 h-4 text-amber-500" />
            ) : updateState.status === 'latest' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <RotateCcw
                className={`w-4 h-4 text-teal-700 dark:text-teal-400 ${
                  updateState.status === 'checking' || updateState.status === 'updating'
                    ? 'animate-spin'
                    : ''
                }`}
              />
            )
          }
          label={
            updateState.status === 'checking'
              ? isZh
                ? '正在檢查更新...'
                : 'Checking...'
              : updateState.status === 'updating'
              ? isZh
                ? '正在套用新版...'
                : 'Updating...'
              : updateState.status === 'latest'
              ? updateState.message || (isZh ? '已是最新版本' : 'Up to date')
              : updateState.status === 'error'
              ? updateState.message || (isZh ? '檢查更新失敗' : 'Update check failed')
              : isZh
              ? '檢查系統更新'
              : 'Check for Updates'
          }
          trailing={
            updateState.status === 'idle' ? (
              <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                {isZh ? '檢查' : 'Check'}
              </span>
            ) : null
          }
        />

        <IosDisclosureRow
          icon={<HardDrive className="w-4 h-4 text-slate-500" />}
          label={isZh ? '本機空間與快取' : 'Local Storage'}
          value={storageInfo.formatted}
          expanded={showAdvanced}
          onToggle={() => setShowAdvanced((v) => !v)}
        >
          <div className="p-3.5 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">
                {isZh ? '清除本機所有資料（含未同步旅程）' : 'Erase All Local Data'}
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
                    className="min-h-[40px] px-3 rounded-xl bg-rose-600 text-white font-bold text-xs cursor-pointer"
                  >
                    {isZh ? '確認永久清除' : 'Confirm Erase'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirmReset(false)}
                    className="min-h-[40px] px-2.5 text-slate-500 font-semibold text-xs cursor-pointer"
                  >
                    {isZh ? '取消' : 'Cancel'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowConfirmReset(true)}
                  className="min-h-[40px] px-3 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold text-xs cursor-pointer"
                >
                  {isZh ? '清除資料' : 'Erase'}
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed pt-2 border-t border-[#E5E2DC]/70 dark:border-slate-800">
              {isZh
                ? '警告：清除將永久刪除本機所有未同步的行程、記帳與照片；建議操作前先匯出 JSON 完整備份。'
                : 'Warning: Erasing permanently deletes all unsynced local trips, expenses, and photos.'}
            </p>
          </div>
        </IosDisclosureRow>
      </IosInsetGroup>
    </div>
  );

  return (
    <div className="relative" ref={menuRef}>
      {/* Menu Trigger Button (>= 44x44pt on mobile) */}
      <button
        type="button"
        onClick={() => {
          if (isOpen) {
            closeMenu();
          } else {
            setIsOpen(true);
            setShowLangSubmenu(false);
            setShowScaleSubmenu(false);
            setShowAdvanced(false);
            setShowConfirmReset(false);
          }
        }}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl border border-[#E5E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center transition active:scale-95 cursor-pointer shrink-0"
        title={isZh ? '功能與設定' : 'Menu & Settings'}
        aria-label={isZh ? '功能與設定' : 'Menu & Settings'}
      >
        {isOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {/* Mobile Bottom Sheet via unified IosModalSheet */}
      {isOpen && isMobile && (
        <IosModalSheet
          onClose={closeMenu}
          zIndexClass="z-[80]"
          variant="grouped"
          ariaLabel={isZh ? '功能與設定' : 'Menu & Settings'}
        >
          <IosNavBar
            title={isZh ? '功能與設定' : 'Settings'}
            subtitle={`日和手帳 Hiyori · ${APP_VERSION}`}
            leftLabel=""
            rightLabel={isZh ? '完成' : 'Done'}
            onRightClick={closeMenu}
          />
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
            {renderGroupedSections()}
            <div className="mt-4 px-2 flex items-center justify-end text-[11px] text-slate-400">
              <a
                href="https://github.com/noworneverev/hiyori-trip"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:underline py-1"
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
        <div className="absolute right-0 top-full mt-2 w-[340px] max-h-[84dvh] flex flex-col overflow-hidden bg-[#FAF9F6] dark:bg-[#090D16] rounded-3xl shadow-2xl border border-[#E5E2DC] dark:border-slate-800 z-50 animate-in fade-in zoom-in-95 duration-150 text-xs">
          <div className="px-4 py-3 border-b border-[#E5E2DC] dark:border-slate-800 bg-white/90 dark:bg-[#111827]/90 flex items-center justify-between shrink-0">
            <div>
              <p className="font-bold text-xs text-slate-900 dark:text-slate-100">
                {isZh ? '功能與設定' : 'Menu & Settings'}
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
          ariaLabel={isZh ? '加到 iPhone 主畫面' : 'Add to iPhone Home Screen'}
        >
          <IosNavBar
            title={isZh ? '加到 iPhone 主畫面' : 'Add to Home Screen'}
            subtitle={isZh ? '以全螢幕 App 離線啟動日和手帳' : 'Launch Hiyori as a fullscreen offline App'}
            leftLabel=""
            rightLabel={isZh ? '完成' : 'Done'}
            onRightClick={() => setShowIOSGuide(false)}
          />
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] space-y-4">
            <IosInsetGroup
              header={isZh ? 'Safari 安裝步驟' : 'Safari Install Steps'}
              footer={
                isZh
                  ? '加入主畫面後即支援無網址列全螢幕顯示、安全區域貼合與離線隨時翻閱。'
                  : 'Enjoy fullscreen native-like display and instant offline access from your home screen.'
              }
            >
              <IosRow
                icon={
                  <span className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-200 font-bold flex items-center justify-center text-xs">
                    1
                  </span>
                }
                label={
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-normal leading-relaxed">
                    {isZh ? (
                      <>
                        點選 Safari 工具列的{' '}
                        <strong className="inline-flex items-center gap-0.5 text-teal-700 dark:text-teal-300">
                          <Share className="w-3.5 h-3.5 inline" /> 分享
                        </strong>{' '}
                        按鈕。
                      </>
                    ) : (
                      <>
                        Tap the{' '}
                        <strong className="inline-flex items-center gap-0.5 text-teal-700 dark:text-teal-300">
                          <Share className="w-3.5 h-3.5 inline" /> Share
                        </strong>{' '}
                        button in Safari.
                      </>
                    )}
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
                    {isZh ? (
                      <>
                        在選單中向上滑動，找到並點擊 <strong>「加入主畫面」</strong>。
                      </>
                    ) : (
                      <>
                        Scroll down and tap <strong>Add to Home Screen</strong>.
                      </>
                    )}
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
                    {isZh ? (
                      <>
                        點擊右上角 <strong>「新增」</strong>，即完成安裝！
                      </>
                    ) : (
                      <>
                        Tap <strong>Add</strong> in the top-right corner.
                      </>
                    )}
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
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs touch-none overscroll-none px-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] animate-in fade-in duration-150">
            <div className="bg-white dark:bg-[#111827] rounded-3xl p-6 shadow-2xl border border-[#E5E2DC] dark:border-slate-800 flex flex-col items-center gap-3 text-center max-w-xs animate-in zoom-in-95 duration-150">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-400 flex items-center justify-center">
                <RotateCcw className="w-6 h-6 animate-spin" />
              </div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                {updateState.message || (isZh ? '正在更新...' : 'Updating...')}
              </h4>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
