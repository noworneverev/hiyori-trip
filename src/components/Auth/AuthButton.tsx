import React, { useState, useEffect, useRef } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  connectGoogleDrive,
  hasDriveAccessToken,
  loginWithGoogleDetailed,
  logoutFirebase,
  saveTripToCloud,
} from '../../utils/firebase';
import { Trip } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { CloudCheck, HardDrive, LogOut, UploadCloud, User as UserIcon, Check, X } from 'lucide-react';

interface AuthButtonProps {
  lang: Language;
  localTrips: Trip[];
  onCloudSyncSuccess?: () => void;
}

export const AuthButton: React.FC<AuthButtonProps> = ({ lang, localTrips, onCloudSyncSuccess }) => {
  const [user, setUser] = useState<User | null>(() => auth.currentUser);
  const [authReady, setAuthReady] = useState<boolean>(() => Boolean(auth.currentUser));
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [driveConnected, setDriveConnected] = useState<boolean>(() => hasDriveAccessToken());
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const authDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncDriveState = () => setDriveConnected(hasDriveAccessToken());
    window.addEventListener('hiyori_drive_auth_changed', syncDriveState);
    return () => window.removeEventListener('hiyori_drive_auth_changed', syncDriveState);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (authDropdownRef.current && !authDropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setAuthError(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDropdown(false);
        setAuthError(null);
      }
    };
    if (showDropdown || authError) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showDropdown, authError]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (currentUser) {
        setAuthError(null);
        setIsLoggingIn(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setAuthError(null);
    setIsLoggingIn(true);
    try {
      const res = await loginWithGoogleDetailed();
      if (!res.redirected) {
        setIsLoggingIn(false);
      }
      if (!res.user && !res.redirected && !res.cancelled && res.errorMessage) {
        setAuthError(res.errorMessage);
      }
    } catch {
      setIsLoggingIn(false);
    }
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

  if (!authReady) {
    return (
      <div
        className="h-10 sm:h-9 w-10 sm:w-20 rounded-xl border border-[#E5E2DC] dark:border-slate-800 bg-[#F3F1EC] dark:bg-slate-800/70 animate-pulse shrink-0"
        aria-hidden="true"
      />
    );
  }

  if (!user) {
    return (
      <div className="relative" ref={authDropdownRef}>
        <button
          onClick={handleLogin}
          disabled={isLoggingIn}
          className="h-10 sm:h-9 px-2.5 sm:px-3 rounded-xl border border-[#E5E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 transition active:scale-95 shrink-0 whitespace-nowrap cursor-pointer disabled:opacity-60"
          title={lang === 'zh' ? 'Google 登入同步' : 'Sign in with Google'}
          aria-label="Google 登入同步"
        >
          {isLoggingIn ? (
            <div className="w-4 h-4 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin shrink-0" />
          ) : (
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
          )}
          <span className="hidden sm:inline text-xs font-semibold">
            {isLoggingIn ? (lang === 'zh' ? '登入中...' : 'Signing in...') : lang === 'zh' ? '登入' : 'Sign In'}
          </span>
        </button>

        {authError && (
          <div className="absolute right-0 top-full mt-1.5 w-72 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-[#111827] rounded-2xl shadow-xl border border-rose-200 dark:border-rose-900/60 p-3 z-50 text-xs space-y-2 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300 leading-relaxed">
                {authError}
              </p>
              <button
                type="button"
                onClick={() => setAuthError(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0 cursor-pointer"
                aria-label="關閉提示"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={authDropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-1.5 h-10 sm:h-9 px-2 sm:px-2.5 rounded-xl border border-[#E5E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 transition active:scale-95 cursor-pointer"
        title={user.displayName || activeEmail || '使用者帳號'}
      >
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName || 'User'}
            className="w-5 h-5 rounded-full object-cover border border-teal-700/30 shrink-0"
          />
        ) : (
          <div className="w-5 h-5 rounded-full bg-teal-700 text-white flex items-center justify-center text-[10px] shrink-0">
            <UserIcon className="w-3 h-3" />
          </div>
        )}
        <span className="hidden sm:inline-block max-w-[85px] truncate text-xs font-semibold">
          {user.displayName?.split(' ')[0] || (lang === 'zh' ? '已登入' : 'Account')}
        </span>
        <CloudCheck className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-full mt-1.5 w-64 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-[#111827] rounded-2xl shadow-xl border border-[#E5E2DC] dark:border-slate-800 p-2.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100 space-y-1.5">
          <div className="px-2 py-1.5 border-b border-[#E5E2DC] dark:border-slate-800 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                {user.displayName || (lang === 'zh' ? '已登入用戶' : 'Signed In')}
              </p>
              <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 shrink-0">
                {lang === 'zh' ? '雲端同步' : 'Synced'}
              </span>
            </div>
            {activeEmail && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">{activeEmail}</p>
            )}
          </div>

          <button
            onClick={handleUploadAllLocalToCloud}
            disabled={isSyncing}
            className="w-full min-h-[44px] text-left px-2.5 py-1.5 rounded-xl hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-between transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <UploadCloud className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
              <span>{lang === 'zh' ? '同步全部旅程至雲端' : 'Sync All Trips'}</span>
            </div>
            {syncDone ? (
              <Check className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
            ) : isSyncing ? (
              <span className="text-[11px] text-teal-700 dark:text-teal-400 font-mono">...</span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={async () => {
              if (driveConnected || isConnectingDrive) return;
              setDriveError(null);
              setIsConnectingDrive(true);
              try {
                const token = await connectGoogleDrive();
                const ok = Boolean(token) || hasDriveAccessToken();
                setDriveConnected(ok);
                if (!ok) {
                  setDriveError(
                    lang === 'zh'
                      ? 'Google Drive 授權已取消或彈窗被封鎖'
                      : 'Drive authorization cancelled or popup blocked'
                  );
                }
              } finally {
                setIsConnectingDrive(false);
              }
            }}
            className="w-full min-h-[44px] text-left px-2.5 py-1.5 rounded-xl hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-between gap-2 transition cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <HardDrive className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
              <span className="truncate">
                {driveConnected
                  ? lang === 'zh'
                    ? 'Drive 原圖備份已連線'
                    : 'Drive Originals Connected'
                  : lang === 'zh'
                  ? '連線 Google Drive 原圖空間'
                  : 'Connect Google Drive Originals'}
              </span>
            </div>
            {driveConnected ? (
              <Check className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
            ) : (
              <span className="text-[11px] font-bold text-teal-700 dark:text-teal-400 shrink-0">
                {isConnectingDrive ? '...' : '授權'}
              </span>
            )}
          </button>

          {driveError && (
            <p className="px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 leading-snug">
              {driveError}
            </p>
          )}

          <div className="pt-1 border-t border-[#E5E2DC] dark:border-slate-800">
            <button
              onClick={handleLogout}
              className="w-full min-h-[44px] text-left px-2.5 py-1.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-400 flex items-center gap-2 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{lang === 'zh' ? '登出帳號' : 'Sign Out'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
