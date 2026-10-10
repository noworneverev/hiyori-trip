import React, { useState, useEffect } from 'react';
import { getCustomGeminiKey, setCustomGeminiKey } from '../../utils/aiClient';
import { getStorageUsage, exportAllTripsToJSON } from '../../utils/storage';
import { auth, loginWithGoogle, logoutFirebase, saveTripToCloud } from '../../utils/firebase';
import { Trip } from '../../types/itinerary';
import { Language, TRANSLATIONS } from '../../utils/i18n';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  X,
  Key,
  ShieldCheck,
  HardDrive,
  Download,
  Trash2,
  Github,
  ExternalLink,
  Check,
  Cloud,
  CloudCheck,
  LogOut,
  RefreshCw,
  User as UserIcon,
} from 'lucide-react';

interface SettingsModalProps {
  trips: Trip[];
  lang: Language;
  onResetData: () => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  trips,
  lang,
  onResetData,
  onClose,
}) => {
  const t = TRANSLATIONS[lang];
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [geminiKey, setGeminiKeyState] = useState(getCustomGeminiKey());
  const [isSavedKey, setIsSavedKey] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const storageInfo = getStorageUsage();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomGeminiKey(geminiKey);
    setIsSavedKey(true);
    setTimeout(() => setIsSavedKey(false), 2000);
  };

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/90 dark:border-slate-800 text-slate-800 dark:text-slate-100 my-auto animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              {t.settings}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'zh' ? '帳號同步、離線儲存與自訂偏好' : 'Account sync, storage & preferences'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* GitHub Project Link Icon */}
            <a
              href="https://github.com/noworneverev/hiyori-trip"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
              title="GitHub Repository"
            >
              <Github className="w-4 h-4" />
            </a>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Cloud Sync & Account Status */}
          <div className="p-4 rounded-2xl bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200/70 dark:border-teal-900/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-teal-950 dark:text-teal-200 flex items-center gap-1.5 text-xs">
                <Cloud className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                {t.syncStatus}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  currentUser
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                }`}
              >
                {currentUser ? (
                  <>
                    <CloudCheck className="w-3 h-3" />
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
                    className="px-2.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs flex items-center gap-1 shadow-2xs transition"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{syncDone ? (lang === 'zh' ? '已同步' : 'Synced') : t.syncNow}</span>
                  </button>

                  <button
                    onClick={() => logoutFirebase()}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    title={lang === 'zh' ? '登出' : 'Sign out'}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                  {t.loginPrompt}
                </p>
                <button
                  onClick={() => loginWithGoogle()}
                  className="w-full py-2 px-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-2xs transition active:scale-98"
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
              </div>
            )}
          </div>

          {/* Local Storage Status */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/90 dark:border-slate-800 space-y-3">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
              <HardDrive className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              {lang === 'zh' ? '離線快取與本地儲存' : 'Offline Cache & Local Storage'}
            </h4>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">{lang === 'zh' ? '旅程總數' : 'Trips'}:</span>
                <span className="font-bold font-mono text-slate-900 dark:text-white">{trips.length}</span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">{lang === 'zh' ? '快取佔用' : 'Cache'}:</span>
                <span className="font-bold font-mono text-slate-900 dark:text-white">{storageInfo.formatted}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => exportAllTripsToJSON(trips)}
                className="py-2 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-teal-500 rounded-xl font-semibold text-slate-700 dark:text-slate-300 hover:text-teal-700 text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{lang === 'zh' ? '下載完整備份' : 'Export All JSON'}</span>
              </button>

              {showConfirmReset ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handlePerformReset}
                    className="flex-1 py-2 px-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-xs transition"
                  >
                    確定清空！
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirmReset(false)}
                    className="px-2.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-500 text-xs"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowConfirmReset(true)}
                  className="py-2 px-3 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{lang === 'zh' ? '重設快取資料' : 'Reset Cache'}</span>
                </button>
              )}
            </div>
          </div>

          {/* AI Parser Key (Optional) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/90 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                <Key className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                {lang === 'zh' ? '自訂 Gemini API Key (選填)' : 'Custom Gemini API Key (Optional)'}
              </span>
              <span className="text-[10px] text-slate-400 font-semibold">
                {lang === 'zh' ? '免費後端預設處理' : 'Free Backend Default'}
              </span>
            </div>

            <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
              {lang === 'zh'
                ? '系統已內建免設定的 AI 行程解析服務。若您希望使用個人配額，可填入個人的 Google Gemini API Key。'
                : 'System includes free AI parsing by default. You can optionally use your personal Google Gemini API key.'}
            </p>

            <form onSubmit={handleSaveKey} className="space-y-1.5">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKeyState(e.target.value)}
                  placeholder="AIzaSy... (留空即使用預設免費解析)"
                  className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 font-mono text-xs outline-none focus:border-teal-500 text-slate-800 dark:text-slate-100"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-xs transition"
                >
                  {isSavedKey ? <Check className="w-3.5 h-3.5" /> : null}
                  <span>{isSavedKey ? (lang === 'zh' ? '已儲存' : 'Saved') : (lang === 'zh' ? '儲存' : 'Save')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
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
            className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 font-semibold text-xs transition"
          >
            {lang === 'zh' ? '關閉' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
