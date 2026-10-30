import React, { useState, useEffect, useRef } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, loginWithGoogle, logoutFirebase, saveTripToCloud } from '../../utils/firebase';
import { Trip } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { CloudCheck, LogOut, UploadCloud, User as UserIcon, Check, ShieldCheck } from 'lucide-react';
import { canUploadImages } from '../../utils/userPermissions';

interface AuthButtonProps {
  lang: Language;
  localTrips: Trip[];
  onCloudSyncSuccess?: () => void;
}

export const AuthButton: React.FC<AuthButtonProps> = ({ lang, localTrips, onCloudSyncSuccess }) => {
  const [user, setUser] = useState<User | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const authDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (authDropdownRef.current && !authDropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    await loginWithGoogle();
  };

  const handleLogout = async () => {
    await logoutFirebase();
    setShowDropdown(false);
  };

  const handleUploadAllLocalToCloud = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      for (const trip of localTrips) {
        await saveTripToCloud(user.uid, trip);
      }
      setSyncDone(true);
      if (onCloudSyncSuccess) onCloudSyncSuccess();
      setTimeout(() => setSyncDone(false), 3000);
    } catch (e) {
      console.error('Failed to sync trips to cloud:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const activeEmail = user?.email;
  const hasUploadAccess = canUploadImages(activeEmail);

  if (!user) {
    return (
      <button
        onClick={handleLogin}
        className="h-9 px-2 sm:px-2.5 rounded-xl border border-teal-300 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 text-xs font-bold text-teal-800 dark:text-teal-200 flex items-center justify-center gap-1.5 transition shadow-2xs active:scale-95 shrink-0 cursor-pointer"
        title={lang === 'zh' ? '使用 Google 帳號登入同步行程 (電腦與手機雙向即時一致)' : 'Sign in with Google to sync trips'}
        aria-label="Google 登入同步"
      >
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
        <span className="text-[11px] font-bold">{lang === 'zh' ? '登入同步' : 'Sign In'}</span>
      </button>
    );
  }

  return (
    <div className="relative" ref={authDropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-1.5 h-9 px-2 sm:px-2.5 rounded-xl border border-teal-200 dark:border-teal-900 bg-teal-50/60 dark:bg-teal-950/40 hover:bg-teal-100 text-xs font-semibold text-teal-950 dark:text-teal-200 transition active:scale-95"
        title={user?.displayName || activeEmail || '使用者帳號'}
      >
        {user?.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName || 'User'}
            className="w-5 h-5 rounded-full object-cover border border-teal-600/30 shrink-0"
          />
        ) : (
          <div className="w-5 h-5 rounded-full bg-teal-700 text-white flex items-center justify-center text-[10px] shrink-0">
            <UserIcon className="w-3 h-3" />
          </div>
        )}
        <span className="inline-block max-w-[60px] sm:max-w-[85px] truncate text-[11px] font-bold">
          {user?.displayName?.split(' ')[0] || (hasUploadAccess ? '管理員' : '已登入')}
        </span>
        {user ? (
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="雲端連線同步中" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="本機單機模式" />
        )}
        {hasUploadAccess ? (
          <ShieldCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
        ) : (
          <CloudCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-full mt-1.5 w-72 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-2.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100 space-y-2">
          <div className="px-2 py-1.5 border-b border-slate-100 dark:border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-800 dark:text-slate-100 truncate">
                {user?.displayName || (hasUploadAccess ? '主要管理員' : '使用者')}
              </p>
              {user && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  已同步
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 truncate font-mono">{activeEmail || '未綁定 Email'}</p>

            {user ? (
              <div className="flex items-center gap-1.5 p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-[10px] text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-200/80 dark:border-emerald-800">
                <CloudCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>雲端雙向即時連線：電腦與手機內容 100% 一致</span>
              </div>
            ) : (
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-[10px] text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <span>⚠️ 目前為本機單機模式</span>
                </p>
                <p className="text-amber-700 dark:text-amber-300">
                  登入 Google 帳號即可與電腦版雙向即時同步照片與行程！
                </p>
                <button
                  onClick={handleLogin}
                  className="w-full mt-1 py-1.5 px-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition active:scale-95 shadow-xs"
                >
                  <UserIcon className="w-3.5 h-3.5" />
                  <span>立即登入 Google 帳號同步</span>
                </button>
              </div>
            )}
            
            {hasUploadAccess && (
              <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-[10px] text-teal-800 dark:text-teal-300 font-bold border border-teal-200 dark:border-teal-800">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>相片上傳權限：已啟用 (n9102125@gmail.com)</span>
              </div>
            )}
          </div>

          <div className="py-1">
            {user && (
              <button
                onClick={handleUploadAllLocalToCloud}
                disabled={isSyncing}
                className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-between transition"
              >
                <div className="flex items-center gap-1.5">
                  <UploadCloud className="w-3.5 h-3.5 text-teal-600" />
                  <span>{lang === 'zh' ? '同步全部旅程到雲端' : 'Sync All Trips to Cloud'}</span>
                </div>
                {syncDone ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : isSyncing ? (
                  <span className="text-[10px] text-teal-600">...</span>
                ) : null}
              </button>
            )}
          </div>

          <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
            {user ? (
              <button
                onClick={handleLogout}
                className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 flex items-center gap-1.5 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{lang === 'zh' ? '登出帳號' : 'Sign Out'}</span>
              </button>
            ) : (
              <button
                onClick={handleLogin}
                className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-950/40 text-teal-700 flex items-center gap-1.5 transition"
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>Google 帳號登入</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
