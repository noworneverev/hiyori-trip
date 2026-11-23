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
  CloudImageHostConfig,
  CloudImageProvider,
  getCloudImageHostConfig,
  saveCloudImageHostConfig,
} from '../../utils/cloudImageHost';
import { getUserGeminiApiKey, saveUserGeminiApiKey } from '../../utils/aiClient';
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
  Image as ImageIcon,
  KeyRound,
  Check,
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
  const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;
  const isZh = lang === 'zh' || lang === 'zh-CN';
  const [currentUser, setCurrentUser] = useState<User | null>(() => auth.currentUser);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [scale, setScale] = useState<AccessibilityScale>(getSavedAccessibilityScale);
  const [isScaleExpanded, setIsScaleExpanded] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' });
  const [storageInfo, setStorageInfo] = useState(getStorageUsage);
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  // Cloud Image Host (Default WebP / Cloudinary / Cloudflare R2) & BYOK Gemini Key
  const [isImageHostExpanded, setIsImageHostExpanded] = useState(false);
  const [imageHostConfig, setImageHostConfig] = useState<CloudImageHostConfig>(() => getCloudImageHostConfig());
  const [imageHostSaved, setImageHostSaved] = useState(false);
  const [isByokExpanded, setIsByokExpanded] = useState(false);
  const [byokKeyInput, setByokKeyInput] = useState<string>(() => getUserGeminiApiKey());
  const [byokSaved, setByokSaved] = useState(false);

  const handleSaveImageHost = () => {
    saveCloudImageHostConfig(imageHostConfig);
    setImageHostSaved(true);
    setTimeout(() => setImageHostSaved(false), 2200);
  };

  const handleSaveByokKey = () => {
    saveUserGeminiApiKey(byokKeyInput);
    setByokSaved(true);
    setTimeout(() => setByokSaved(false), 2200);
  };

  const imageHostLabel =
    imageHostConfig.provider === 'cloudinary'
      ? 'Cloudinary'
      : imageHostConfig.provider === 'r2'
      ? 'Cloudflare R2'
      : isZh
      ? '預設輕量 WebP'
      : 'Default WebP';

  useEffect(() => {
    let active = true;
    getStorageUsageAsync().then((info) => {
      if (active) setStorageInfo(info);
    });
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) setIsLoggingIn(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleManualSync = async () => {
    if (!currentUser || isSyncing) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const localDeletedIds = new Set(getDeletedTripIds());
      const cloudTombstones = (await fetchUserTombstones(currentUser.uid)) || {};
      const TOMBSTONE_SKEW_MS = 15 * 60 * 1000;

      const validTrips = trips.filter((trip) => {
        if (localDeletedIds.has(trip.id)) return false;
        if (trip.id.startsWith('imported-share_')) return false;
        if (trip.isCollaborative && trip.ownerId && trip.ownerId !== currentUser.uid) return false;
        const deletedAt = cloudTombstones[trip.id];
        if (typeof deletedAt === 'number' && deletedAt + TOMBSTONE_SKEW_MS >= (trip.updatedAt || 0)) {
          return false;
        }
        return true;
      });

      const syncedMap: Record<string, number> = {};
      let failCount = 0;
      for (const trip of validTrips) {
        try {
          const saved = await saveTripToCloud(currentUser.uid, trip);
          syncedMap[trip.id] = Math.max(Date.now(), saved.lastSyncedAt || trip.updatedAt || 0);
        } catch (err) {
          failCount++;
          console.warn('Manual sync failed for trip:', trip.id, err);
        }
      }
      if (Object.keys(syncedMap).length > 0) {
        const stored = getStoredTrips();
        saveTrips(
          stored.map((tr) =>
            syncedMap[tr.id] ? { ...tr, lastSyncedAt: Math.max(tr.lastSyncedAt || 0, syncedMap[tr.id]) } : tr
          )
        );
      }
      if (failCount > 0) {
        setSyncError(
          isZh ? `有 ${failCount} 筆旅程同步失敗，請檢查網路後再試` : `${failCount} trip(s) failed to sync`
        );
      } else {
        setSyncDone(true);
        setTimeout(() => setSyncDone(false), 3000);
      }
    } catch (err) {
      console.error('Manual sync failed:', err);
      setSyncError(isZh ? '雲端同步失敗，請檢查網路連線' : 'Manual cloud sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePerformReset = () => {
    onResetData();
    setShowConfirmReset(false);
    onClose();
  };

  const activeScaleOpt =
    ACCESSIBILITY_OPTIONS.find((o) => o.id === scale) || ACCESSIBILITY_OPTIONS[0];
  const currentScaleLabel = `${activeScaleOpt.label} ${activeScaleOpt.badge}`;

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
                label={syncDone ? (isZh ? '已同步至雲端' : 'Synced to Cloud') : t.syncNow}
                onClick={handleManualSync}
                disabled={isSyncing}
                trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
              />
              {syncError && (
                <div className="px-4 py-2.5 text-[11px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50/60 dark:bg-rose-950/20">
                  {syncError}
                </div>
              )}
              <IosRow
                icon={<LogOut className="w-4 h-4 text-rose-600 dark:text-rose-400" />}
                label={isZh ? '登出 Google 帳號' : 'Sign Out'}
                destructive
                onClick={() => logoutFirebase()}
              />
            </>
          ) : (
            <>
              <IosRow
                icon={<Cloud className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
                label={isZh ? '目前狀態' : 'Status'}
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
                disabled={isLoggingIn}
                label={
                  <span className="text-teal-700 dark:text-teal-400">
                    {isLoggingIn ? (isZh ? '正在登入...' : 'Signing in...') : t.googleLogin}
                  </span>
                }
                onClick={async () => {
                  if (isLoggingIn) return;
                  setIsLoggingIn(true);
                  setAuthError(null);
                  try {
                    const res = await loginWithGoogleDetailed();
                    if (!res.redirected) setIsLoggingIn(false);
                    if (!res.user && !res.redirected && !res.cancelled && res.errorMessage) {
                      setAuthError(res.errorMessage);
                    }
                  } catch {
                    setIsLoggingIn(false);
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

        {/* Section 3.5: Cloud Image Host & Optional BYOK AI */}
        <IosInsetGroup
          header={isZh ? '雲端圖床與 AI 進階設定' : 'Image Hosting & AI (Optional)'}
          footer={
            isZh
              ? '圖片預設以輕量 WebP（~80–150 KB）離線快取並同步；若有大量相簿或公開多人協作，可選接免費 Cloudinary 或 Cloudflare R2。自訂 Gemini Key 僅存於本機，讓純靜態部署（如 GitHub Pages）也能使用 AI 解析。'
              : 'Photos default to compact WebP (~80–150 KB). Optionally connect Cloudinary or Cloudflare R2, or add your own Gemini API key (stored locally only) for static deployments.'
          }
        >
          <IosDisclosureRow
            icon={<ImageIcon className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={isZh ? '圖片上傳圖床' : 'Image Host'}
            value={imageHostLabel}
            valueAccent={imageHostConfig.provider !== 'default'}
            expanded={isImageHostExpanded}
            onToggle={() => setIsImageHostExpanded((v) => !v)}
          >
            <div className="p-3.5 space-y-3 bg-[#FAF9F6]/70 dark:bg-slate-900/40">
              <div className="grid grid-cols-3 p-1 rounded-xl bg-[#EFECE5] dark:bg-slate-800 gap-1">
                {(
                  [
                    { id: 'default' as CloudImageProvider, label: isZh ? '預設 WebP' : 'Default' },
                    { id: 'cloudinary' as CloudImageProvider, label: 'Cloudinary' },
                    { id: 'r2' as CloudImageProvider, label: 'CF R2' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setImageHostConfig((prev) => ({ ...prev, provider: opt.id }))}
                    className={`min-h-[34px] rounded-lg text-xs font-bold transition cursor-pointer ${
                      imageHostConfig.provider === opt.id
                        ? 'bg-white dark:bg-[#111827] text-teal-700 dark:text-teal-300 shadow-2xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {imageHostConfig.provider === 'cloudinary' && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={imageHostConfig.cloudinaryCloudName}
                    onChange={(e) =>
                      setImageHostConfig((prev) => ({ ...prev, cloudinaryCloudName: e.target.value }))
                    }
                    placeholder="Cloud Name（例：demo）"
                    className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-[16px] sm:text-xs font-mono outline-none focus:border-teal-600"
                  />
                  <input
                    type="text"
                    value={imageHostConfig.cloudinaryUploadPreset}
                    onChange={(e) =>
                      setImageHostConfig((prev) => ({ ...prev, cloudinaryUploadPreset: e.target.value }))
                    }
                    placeholder="Unsigned Upload Preset（例：hiyori_unsigned）"
                    className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-[16px] sm:text-xs font-mono outline-none focus:border-teal-600"
                  />
                </div>
              )}

              {imageHostConfig.provider === 'r2' && (
                <div className="space-y-2">
                  <input
                    type="url"
                    value={imageHostConfig.r2UploadEndpoint}
                    onChange={(e) =>
                      setImageHostConfig((prev) => ({ ...prev, r2UploadEndpoint: e.target.value }))
                    }
                    placeholder="Worker 上傳端點（https://upload.your-domain.workers.dev）"
                    className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-[16px] sm:text-xs font-mono outline-none focus:border-teal-600"
                  />
                  <input
                    type="password"
                    value={imageHostConfig.r2AuthToken}
                    onChange={(e) =>
                      setImageHostConfig((prev) => ({ ...prev, r2AuthToken: e.target.value }))
                    }
                    placeholder="選填 Bearer Token"
                    className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-[16px] sm:text-xs font-mono outline-none focus:border-teal-600"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveImageHost}
                className="w-full min-h-[40px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                {imageHostSaved ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{isZh ? '已儲存圖床設定' : 'Image host saved'}</span>
                  </>
                ) : (
                  <span>{isZh ? '套用圖床設定' : 'Save Image Host'}</span>
                )}
              </button>
            </div>
          </IosDisclosureRow>

          <IosDisclosureRow
            icon={<KeyRound className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={isZh ? '自訂 Gemini API Key' : 'Custom Gemini API Key'}
            value={byokKeyInput.trim() ? (isZh ? '已設定' : 'Configured') : isZh ? '選填' : 'Optional'}
            valueAccent={Boolean(byokKeyInput.trim())}
            expanded={isByokExpanded}
            onToggle={() => setIsByokExpanded((v) => !v)}
          >
            <div className="p-3.5 space-y-2.5 bg-[#FAF9F6]/70 dark:bg-slate-900/40">
              <input
                type="password"
                value={byokKeyInput}
                onChange={(e) => setByokKeyInput(e.target.value)}
                placeholder="AIzaSy...（留空則清除）"
                className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-[16px] sm:text-xs font-mono outline-none focus:border-teal-600"
              />
              <button
                type="button"
                onClick={handleSaveByokKey}
                className="w-full min-h-[40px] rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                {byokSaved ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{isZh ? '已更新本機金鑰' : 'API key updated'}</span>
                  </>
                ) : (
                  <span>{isZh ? '儲存於本機瀏覽器' : 'Save Locally'}</span>
                )}
              </button>
            </div>
          </IosDisclosureRow>
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
                ? isZh
                  ? '正在檢查更新...'
                  : 'Checking...'
                : updateState.status === 'updating'
                ? isZh
                  ? '載入最新版本...'
                  : 'Updating...'
                : updateState.status === 'latest'
                ? updateState.message || (isZh ? '已是最新版本' : 'Up to date')
                : updateState.status === 'error'
                ? updateState.message || (isZh ? '檢查更新失敗' : 'Check failed')
                : isZh
                ? '檢查系統更新'
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
