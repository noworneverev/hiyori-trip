import React, { useState, useEffect } from 'react';
import {
  getStorageUsage,
  getStorageUsageAsync,
  exportAllTripsToJSON,
  getDeletedTripIds,
  getStoredTrips,
  saveTrips,
} from '../../utils/storage';
import { auth, fetchUserTombstones, loginWithGoogleDetailed, logoutFirebase, saveTripToCloud } from '../../utils/firebase';
import { Trip } from '../../types/itinerary';
import { Language, TRANSLATIONS } from '../../utils/i18n';
import { onAuthStateChanged, User } from 'firebase/auth';
import { APP_VERSION, BUILD_DATE } from '../../constants/version';
import {
  getSavedAccessibilityScale,
  applyAccessibilityScale,
  AccessibilityScale,
  ACCESSIBILITY_OPTIONS,
} from '../../utils/accessibility';
import { performAppUpdate, UpdateState } from '../../utils/pwaUpdater';
import {
  IosModalSheet,
  IosNavBar,
  IosInsetGroup,
  IosRow,
  IosDisclosureRow,
  IosCheckmarkRow,
} from '../UI/IosPrimitives';
import {
  ShieldCheck,
  HardDrive,
  Download,
  Trash2,
  Github,
  ExternalLink,
  Cloud,
  CloudCheck,
  LogOut,
  RefreshCw,
  User as UserIcon,
  Eye,
  RotateCcw,
  ChevronRight,
} from 'lucide-react';

interface SettingsModalProps {
  trips: Trip[];
  lang: Language;
  onResetData: () => void;
  onSimulateConflict?: () => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  trips,
  lang,
  onResetData,
  onSimulateConflict,
  onClose,
}) => {
  const t = TRANSLATIONS[lang];
  const [currentUser, setCurrentUser] = useState<User | null>(() => auth.currentUser);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [scale, setScale] = useState<AccessibilityScale>(getSavedAccessibilityScale);
  const [isScaleExpanded, setIsScaleExpanded] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' });
  const [storageInfo, setStorageInfo] = useState(getStorageUsage);
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  useEffect(() => {
    let active = true;
    getStorageUsageAsync().then((info) => {
      if (active) setStorageInfo(info);
    });
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleManualSync = async () => {
    if (!currentUser) return;
    setIsSyncing(true);
    try {
      const localDeletedIds = new Set(getDeletedTripIds());
      const cloudTombstones = await fetchUserTombstones(currentUser.uid);
      const TOMBSTONE_SKEW_MS = 15 * 60 * 1000;

      const validTrips = trips.filter((trip) => {
        if (localDeletedIds.has(trip.id)) return false;
        const deletedAt = cloudTombstones[trip.id];
        if (typeof deletedAt === 'number' && deletedAt + TOMBSTONE_SKEW_MS >= (trip.updatedAt || 0)) {
          return false;
        }
        return true;
      });

      const syncedMap: Record<string, number> = {};
      for (const trip of validTrips) {
        const saved = await saveTripToCloud(currentUser.uid, trip);
        syncedMap[trip.id] = Math.max(Date.now(), saved.lastSyncedAt || trip.updatedAt || 0);
      }
      if (Object.keys(syncedMap).length > 0) {
        const stored = getStoredTrips();
        saveTrips(
          stored.map((tr) =>
            syncedMap[tr.id] ? { ...tr, lastSyncedAt: Math.max(tr.lastSyncedAt || 0, syncedMap[tr.id]) } : tr
          )
        );
      }
      setSyncDone(true);
      setTimeout(() => setSyncDone(false), 3000);
    } catch (err) {
      console.error('Manual sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePerformReset = () => {
    onResetData();
    setShowConfirmReset(false);
    onClose();
  };

  const currentScaleLabel =
    scale === 'senior' ? '特大 130%' : scale === 'comfortable' ? '放大 115%' : '標準 100%';

  return (
    <IosModalSheet onClose={onClose} zIndexClass="z-[85]" variant="grouped" ariaLabel={t.settings}>
      <IosNavBar
        title={t.settings}
        rightLabel={lang === 'zh' ? '完成' : 'Done'}
        onRightClick={onClose}
      />

      <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] space-y-5">
        {/* Section 1: Account & Cloud Sync */}
        <IosInsetGroup
          header={t.syncStatus}
          footer={!currentUser ? t.loginPrompt : undefined}
        >
          {currentUser ? (
            <>
              <IosRow
                icon={
                  currentUser.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt="Avatar"
                      className="w-9 h-9 rounded-full object-cover border border-[#E5E2DC] dark:border-slate-700"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-teal-700 text-white flex items-center justify-center">
                      <UserIcon className="w-4 h-4" />
                    </div>
                  )
                }
                label={currentUser.displayName || 'Google User'}
                subtitle={<span className="font-mono">{currentUser.email}</span>}
                trailing={
                  <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-1">
                    <CloudCheck className="w-3.5 h-3.5" />
                    <span>{t.cloudSynced}</span>
                  </span>
                }
              />
              <IosRow
                icon={<RefreshCw className={`w-4 h-4 text-teal-700 dark:text-teal-400 ${isSyncing ? 'animate-spin' : ''}`} />}
                label={syncDone ? (lang === 'zh' ? '已同步至雲端' : 'Synced to Cloud') : t.syncNow}
                onClick={handleManualSync}
                disabled={isSyncing}
                trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
              />
              <IosRow
                icon={<LogOut className="w-4 h-4 text-rose-600 dark:text-rose-400" />}
                label={lang === 'zh' ? '登出 Google 帳號' : 'Sign Out'}
                destructive
                onClick={() => logoutFirebase()}
              />
            </>
          ) : (
            <>
              <IosRow
                icon={<Cloud className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
                label={lang === 'zh' ? '目前狀態' : 'Status'}
                trailing={
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                    {t.guestOffline}
                  </span>
                }
              />
              <IosRow
                icon={
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                }
                label={<span className="text-teal-700 dark:text-teal-400">{t.googleLogin}</span>}
                onClick={async () => {
                  setAuthError(null);
                  const res = await loginWithGoogleDetailed();
                  if (!res.user && !res.redirected && !res.cancelled && res.errorMessage) {
                    setAuthError(res.errorMessage);
                  }
                }}
                trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
              />
              {authError && (
                <div className="px-4 py-2.5 text-[11px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50/60 dark:bg-rose-950/20">
                  {authError}
                </div>
              )}
            </>
          )}

          {onSimulateConflict && (
            <IosRow
              icon={<RefreshCw className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
              label={lang === 'zh' ? '預覽版本衝突解決視窗' : 'Preview Conflict Modal'}
              onClick={onSimulateConflict}
              trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
            />
          )}
        </IosInsetGroup>

        {/* Section 2: Display & Accessibility */}
        <IosInsetGroup header={lang === 'zh' ? '顯示與閱讀設定' : 'Display & Accessibility'}>
          <IosDisclosureRow
            icon={<Eye className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={lang === 'zh' ? '文字大小' : 'Text Size'}
            value={currentScaleLabel}
            valueAccent
            expanded={isScaleExpanded}
            onToggle={() => setIsScaleExpanded((v) => !v)}
          >
            <div className="divide-y divide-[#E5E2DC]/70 dark:divide-slate-800/80">
              {ACCESSIBILITY_OPTIONS.map((opt) => (
                <IosCheckmarkRow
                  key={opt.id}
                  inset
                  label={opt.label}
                  subtitle={opt.description}
                  trailingMeta={
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {opt.badge}
                    </span>
                  }
                  selected={scale === opt.id}
                  onSelect={() => {
                    setScale(opt.id);
                    applyAccessibilityScale(opt.id);
                  }}
                />
              ))}
            </div>
          </IosDisclosureRow>
        </IosInsetGroup>

        {/* Section 3: Offline Cache & Local Storage */}
        <IosInsetGroup header={lang === 'zh' ? '離線快取與本地儲存' : 'Offline Cache & Storage'}>
          <IosRow
            icon={<HardDrive className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={lang === 'zh' ? '已儲存旅程' : 'Saved Trips'}
            trailing={
              <span className="text-xs font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-300">
                {trips.length}
              </span>
            }
          />
          <IosRow
            icon={<HardDrive className="w-4 h-4 text-slate-400" />}
            label={lang === 'zh' ? '本地快取佔用' : 'Cache Usage'}
            trailing={
              <span className="text-xs font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-300">
                {storageInfo.formatted}
              </span>
            }
          />
          <IosRow
            icon={<Download className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={lang === 'zh' ? '下載完整備份 (JSON)' : 'Export All JSON'}
            onClick={() => void exportAllTripsToJSON(trips)}
            trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
          />

          {showConfirmReset ? (
            <div className="px-4 py-3 bg-rose-50/70 dark:bg-rose-950/30 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-rose-700 dark:text-rose-300">
                確定清除本機所有快取資料？
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowConfirmReset(false)}
                  className="min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handlePerformReset}
                  className="min-h-[38px] px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                >
                  確定清除
                </button>
              </div>
            </div>
          ) : (
            <IosRow
              icon={<Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />}
              label={lang === 'zh' ? '重設本機快取資料' : 'Reset Local Cache'}
              destructive
              onClick={() => setShowConfirmReset(true)}
            />
          )}
        </IosInsetGroup>

        {/* Section 4: System & About */}
        <IosInsetGroup
          header={lang === 'zh' ? '關於日和手帳' : 'About Hiyori'}
          footer={
            lang === 'zh'
              ? '在雲端預覽環境自動使用安全代理執行智慧解析；離線或靜態部署環境自動無縫切換為本機規則解析，無須輸入 API Key。'
              : 'Uses secure server proxy when available and falls back automatically to zero-key local parsing offline.'
          }
        >
          <IosRow
            icon={<ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={lang === 'zh' ? '版本資訊' : 'Version'}
            trailing={
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {APP_VERSION} · {BUILD_DATE}
              </span>
            }
          />
          <IosRow
            icon={
              <RotateCcw
                className={`w-4 h-4 text-teal-700 dark:text-teal-400 ${
                  updateState.status === 'checking' || updateState.status === 'updating' ? 'animate-spin' : ''
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
                  ? '載入最新版本...'
                  : 'Updating...'
                : lang === 'zh'
                ? '檢查更新 / 重新整理'
                : 'Check for Updates'
            }
            onClick={async () => {
              await performAppUpdate((s) => setUpdateState(s));
            }}
            disabled={updateState.status === 'checking' || updateState.status === 'updating'}
            trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
          />
          <a
            href="https://github.com/noworneverev/hiyori-trip"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full min-h-[48px] px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-[#FAF9F6] dark:hover:bg-slate-800/45 transition text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Github className="w-4 h-4 text-slate-600 dark:text-slate-300 shrink-0" />
              <span className="text-sm sm:text-xs font-semibold text-slate-900 dark:text-slate-100">
                GitHub 原始碼專案頁
              </span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </a>
        </IosInsetGroup>
      </div>
    </IosModalSheet>
  );
};
