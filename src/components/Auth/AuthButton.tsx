import React, { useState, useEffect, useRef } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, loginWithGoogle, logoutFirebase, saveTripToCloud } from '../../utils/firebase';
import { Trip } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { CloudCheck, LogOut, UploadCloud, User as UserIcon, Check, ShieldCheck } from 'lucide-react';
import { ADMIN_UPLOAD_EMAIL, canUploadImages, setActiveUserEmail, clearActiveUserEmail } from '../../utils/userPermissions';

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
  const [simulatedEmail, setSimulatedEmail] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('app_user_email') || '' : '';
  });
  const authDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleAuthChange = () => {
      setSimulatedEmail(localStorage.getItem('app_user_email') || '');
    };
    window.addEventListener('auth_state_change', handleAuthChange);
    return () => window.removeEventListener('auth_state_change', handleAuthChange);
  }, []);

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

  const activeEmail = user?.email || simulatedEmail;
  const hasUploadAccess = canUploadImages(activeEmail);

  if (!user && !simulatedEmail) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={handleLogin}
          className="h-9 px-2 sm:px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 transition shadow-2xs active:scale-95"
          title={lang === 'zh' ? '使用 Google 帳號登入同步行程' : 'Sign in with Google to sync trips'}
          aria-label="Google 登入"
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
          <span className="hidden sm:inline">{lang === 'zh' ? 'Google 登入' : 'Sign In'}</span>
        </button>
        <button
          onClick={() => setActiveUserEmail(ADMIN_UPLOAD_EMAIL)}
          className="hidden lg:flex h-9 px-2 py-1.5 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 text-[11px] font-bold text-teal-800 dark:text-teal-300 items-center gap-1 transition shadow-2xs"
          title="以管理員 n9102125@gmail.com 身分使用 (開啟相片上傳權限)"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
          <span>管理員</span>
        </button>
      </div>
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
        <span className="hidden sm:inline max-w-[75px] truncate text-[11px] font-bold">
          {user?.displayName?.split(' ')[0] || (hasUploadAccess ? '管理員' : '已登入')}
        </span>
        {hasUploadAccess ? (
          <ShieldCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
        ) : (
          <CloudCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-full mt-1.5 w-64 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2.5 py-2 border-b border-slate-100 dark:border-slate-800 space-y-1">
            <p className="font-bold text-slate-800 dark:text-slate-100 truncate">
              {user?.displayName || (hasUploadAccess ? '主要管理員' : '使用者')}
            </p>
            <p className="text-[10px] text-slate-400 truncate">{activeEmail}</p>
            
            {hasUploadAccess ? (
              <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-[10px] text-teal-800 dark:text-teal-300 font-bold border border-teal-200 dark:border-teal-800">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>相片上傳權限：已啟用 (n9102125@gmail.com)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-500 font-medium">
                <span>相片上傳：僅管理員可用 (未授權)</span>
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

            {!hasUploadAccess ? (
              <button
                onClick={() => {
                  setActiveUserEmail(ADMIN_UPLOAD_EMAIL);
                  setShowDropdown(false);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-950/40 text-teal-700 dark:text-teal-300 flex items-center gap-1.5 transition text-[11px] font-bold"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                <span>切換為 n9102125@gmail.com</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  clearActiveUserEmail();
                  setShowDropdown(false);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center gap-1.5 transition text-[11px]"
              >
                <span>清除管理員身分切換</span>
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
