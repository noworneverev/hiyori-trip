import React, { useState, useEffect, useRef } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, loginWithGoogle, logoutFirebase, saveTripToCloud } from '../../utils/firebase';
import { Trip } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { CloudCheck, LogOut, UploadCloud, User as UserIcon, Check } from 'lucide-react';

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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDropdown(false);
    };
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
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

  if (!user) {
    return (
      <button
        onClick={handleLogin}
        className="h-10 sm:h-9 px-2.5 sm:px-3 rounded-xl border border-[#E5E2DC] dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 transition active:scale-95 shrink-0 whitespace-nowrap cursor-pointer"
        title={lang === 'zh' ? 'Google 登入同步' : 'Sign in with Google'}
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
        <span className="hidden sm:inline text-xs font-semibold">{lang === 'zh' ? '登入' : 'Sign In'}</span>
      </button>
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
