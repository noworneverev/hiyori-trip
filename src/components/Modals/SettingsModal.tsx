import React, { useState, useEffect } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { getStorageUsage, getStorageUsageAsync, exportAllTripsToJSON } from '../../utils/storage';
import { auth, loginWithGoogleDetailed, logoutFirebase, saveTripToCloud } from '../../utils/firebase';
import { Trip } from '../../types/itinerary';
import { Language, TRANSLATIONS } from '../../utils/i18n';
import { onAuthStateChanged, User } from 'firebase/auth';
import { APP_VERSION, BUILD_DATE } from '../../constants/version';
import { getSavedAccessibilityScale, applyAccessibilityScale, AccessibilityScale, ACCESSIBILITY_OPTIONS } from '../../utils/accessibility';
import { performAppUpdate, UpdateState } from '../../utils/pwaUpdater';
import {
  X,
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
  useBodyScrollLock(true);
  const t = TRANSLATIONS[lang];
  const [currentUser, setCurrentUser] = useState<User | null>(() => auth.currentUser);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [scale, setScale] = useState<AccessibilityScale>(getSavedAccessibilityScale);
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' });
  const [storageInfo, setStorageInfo] = useState(getStorageUsage);

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
      for (const trip of trips) {
        await saveTripToCloud(currentUser.uid, trip);
      }
      setSyncDone(true);
      setTimeout(() => setSyncDone(false), 3000);
    } catch (err) {
      console.error('Manual sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const handlePerformReset = () => {
    onResetData();
    setShowConfirmReset(false);
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs px-3 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] overflow-hidden"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#111827] shadow-2xl border border-[#E5E2DC] dark:border-slate-800 text-slate-800 dark:text-slate-100 my-auto animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-full sm:max-h-[90dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-900/70">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              {t.settings}
            </h3>
          </div>

          <div className="flex items-center gap-1.5">
            {/* GitHub Project Link Icon */}
            <a
              href="https://github.com/noworneverev/hiyori-trip"
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-[#EFECE5] dark:hover:bg-slate-800 transition"
              title="GitHub Repository"
            >
              <Github className="w-4 h-4" />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-[#EFECE5] dark:hover:bg-slate-800 transition cursor-pointer"
              aria-label={lang === 'zh' ? '關閉' : 'Close'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Cloud Sync & Account Status */}
          <div className="p-4 rounded-2xl bg-teal-50/50 dark:bg-teal-950/25 border border-teal-200/70 dark:border-teal-900/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-teal-950 dark:text-teal-200 flex items-center gap-1.5 text-xs">
                <Cloud className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                {t.syncStatus}
              </span>
              <span
                className={`text-[11px] font-bold flex items-center gap-1 ${
                  currentUser
                    ? 'text-teal-700 dark:text-teal-300'
                    : 'text-amber-700 dark:text-amber-300'
                }`}
              >
                {currentUser ? (
                  <>
                    <CloudCheck className="w-3.5 h-3.5" />
                    {t.cloudSynced}
                  </>
                ) : (
                  t.guestOffline
                )}
              </span>
            </div>

            {currentUser ? (
              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-teal-200/50 dark:border-teal-900/40 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 truncate">
                  {currentUser.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt="Avatar"
                      className="w-7 h-7 rounded-full object-cover border border-teal-500/30 shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-teal-700 text-white flex items-center justify-center shrink-0">
                      <UserIcon className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <div className="truncate">
                    <p className="font-bold text-slate-800 dark:text-slate-100 truncate">
                      {currentUser.displayName || 'Google User'}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate font-mono">
                      {currentUser.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleManualSync}
                    disabled={isSyncing}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-semibold text-xs flex items-center gap-1 shadow-2xs transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{syncDone ? (lang === 'zh' ? '已同步' : 'Synced') : t.syncNow}</span>
                  </button>

                  <button
                    onClick={() => logoutFirebase()}
                    className="min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    title={lang === 'zh' ? '登出' : 'Sign out'}
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                  {t.loginPrompt}
                </p>
                <button
                  onClick={async () => {
                    setAuthError(null);
                    const res = await loginWithGoogleDetailed();
                    if (!res.user && !res.redirected && !res.cancelled && res.errorMessage) {
                      setAuthError(res.errorMessage);
                    }
                  }}
                  className="w-full min-h-[44px] py-2 px-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-[#E5E2DC] dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-2xs transition active:scale-98 cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>{t.googleLogin}</span>
                </button>
                {authError && (
                  <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400 leading-relaxed">
                    {authError}
                  </p>
                )}
              </div>
            )}

            {onSimulateConflict && (
              <div className="pt-2.5 border-t border-teal-200/50 dark:border-teal-900/40 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {lang === 'zh' ? '離線狀態衝突解決策略' : 'Conflict Strategy'}
                </span>
                <button
                  type="button"
                  onClick={onSimulateConflict}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-teal-100 hover:bg-teal-200 dark:bg-teal-900/60 dark:hover:bg-teal-800 text-teal-800 dark:text-teal-200 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>{lang === 'zh' ? '預覽衝突提示對話框' : 'Preview Conflict Modal'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Local Storage Status */}
          <div className="p-4 rounded-2xl bg-[#FAF9F6] dark:bg-slate-800/40 border border-[#E5E2DC] dark:border-slate-800 space-y-3">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
              <HardDrive className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              {lang === 'zh' ? '離線快取與本地儲存' : 'Offline Cache & Local Storage'}
            </h4>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">{lang === 'zh' ? '旅程總數' : 'Trips'}:</span>
                <span className="font-bold font-mono tabular-nums text-slate-900 dark:text-white">{trips.length}</span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">{lang === 'zh' ? '快取佔用' : 'Cache'}:</span>
                <span className="font-bold font-mono tabular-nums text-slate-900 dark:text-white">{storageInfo.formatted}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => void exportAllTripsToJSON(trips)}
                className="min-h-[44px] sm:min-h-[38px] py-2 px-3 bg-white dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700 hover:border-teal-600 rounded-xl font-semibold text-slate-700 dark:text-slate-300 hover:text-teal-700 text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{lang === 'zh' ? '下載完整備份' : 'Export All JSON'}</span>
              </button>

              {showConfirmReset ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handlePerformReset}
                    className="flex-1 min-h-[44px] sm:min-h-[38px] py-2 px-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer"
                  >
                    確定清空
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirmReset(false)}
                    className="min-h-[44px] sm:min-h-[38px] px-2.5 py-2 border border-[#E5E2DC] dark:border-slate-700 rounded-xl text-slate-500 text-xs cursor-pointer"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowConfirmReset(true)}
                  className="min-h-[44px] sm:min-h-[38px] py-2 px-3 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{lang === 'zh' ? '重設快取資料' : 'Reset Cache'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Accessibility & Typography Scale */}
          <div className="p-4 rounded-2xl bg-teal-50/40 dark:bg-teal-950/20 border border-teal-200/70 dark:border-teal-900/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5 text-xs">
                <Eye className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <span>{lang === 'zh' ? '文字大小' : 'Text Size'}</span>
              </span>
              <span className="text-[11px] font-bold font-mono tabular-nums text-teal-700 dark:text-teal-400">
                {scale === 'senior' ? '特大 130%' : scale === 'comfortable' ? '放大 115%' : '標準 100%'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {ACCESSIBILITY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setScale(opt.id);
                    applyAccessibilityScale(opt.id);
                  }}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                    scale === opt.id
                      ? 'border-teal-600 bg-white dark:bg-slate-800 ring-2 ring-teal-500/30 shadow-xs'
                      : 'border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-900/60 hover:bg-[#F3F1EC] dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1">
                      {opt.label}
                    </span>
                    <span className="text-[10px] font-mono tabular-nums font-bold text-teal-700 dark:text-teal-400">
                      {opt.badge}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-tight">
                    {opt.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* System Version & Update Engine */}
          <div className="p-4 rounded-2xl bg-[#FAF9F6] dark:bg-slate-800/40 border border-[#E5E2DC] dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white text-xs">
                  {lang === 'zh' ? '系統版本資訊' : 'App Version'}
                </span>
                <span aria-hidden="true" className="text-slate-400">·</span>
                <span className="text-slate-600 dark:text-slate-300 font-mono tabular-nums text-[11px] font-bold">
                  {APP_VERSION}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                {lang === 'zh' ? `構建日期：${BUILD_DATE} · PWA 離線快取支援` : `Build Date: ${BUILD_DATE} · PWA Cache`}
              </p>
            </div>

            <button
              type="button"
              disabled={updateState.status === 'checking' || updateState.status === 'updating'}
              onClick={async () => {
                await performAppUpdate((s) => setUpdateState(s));
              }}
              className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-xs disabled:opacity-60 cursor-pointer self-start sm:self-auto"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${updateState.status === 'checking' || updateState.status === 'updating' ? 'animate-spin' : ''}`} />
              <span>
                {updateState.status === 'checking'
                  ? (lang === 'zh' ? '檢查中...' : 'Checking...')
                  : updateState.status === 'updating'
                  ? (lang === 'zh' ? '載入新版...' : 'Loading...')
                  : (lang === 'zh' ? '檢查更新 / 重新整理' : 'Check for Updates')}
              </span>
            </button>
          </div>

          {/* Smart Parser Mode (Read-only Status) */}
          <div className="p-4 rounded-2xl bg-[#FAF9F6] dark:bg-slate-800/40 border border-[#E5E2DC] dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                <ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                {lang === 'zh' ? '智慧行程解析模式' : 'Smart Itinerary Parser'}
              </span>
              <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-400">
                {lang === 'zh' ? '雙環境自動切換' : 'Dual-Env Auto'}
              </span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
              {lang === 'zh'
                ? '在 AI Studio 預覽環境會自動透過伺服器安全代理執行智慧解析；於靜態網頁或離線環境則自動無縫降級為純本機規則解析，無需輸入任何 API Key。'
                : 'Uses the secure server proxy in AI Studio preview and falls back automatically to zero-key local rule parsing on static hosts or offline.'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-900/60 flex items-center justify-between">
          <a
            href="https://github.com/noworneverev/hiyori-trip"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 text-xs transition"
          >
            <Github className="w-4 h-4" />
            <span className="font-semibold">GitHub Source Code</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] sm:min-h-[38px] px-4 py-1.5 rounded-xl bg-[#EFECE5] dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold text-xs transition cursor-pointer"
          >
            {lang === 'zh' ? '關閉' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
