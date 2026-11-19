import React, { useState, useEffect, useRef } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  connectGoogleDrive,
  fetchUserTombstones,
  hasDriveAccessToken,
  loginWithGoogleDetailed,
  logoutFirebase,
  saveTripToCloud,
} from '../../utils/firebase';
import { getDeletedTripIds, getStoredTrips, saveTrips } from '../../utils/storage';
import { useIsMobileViewport } from '../../hooks/useIsMobileViewport';
import { Trip } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import {
  IosModalSheet,
  IosNavBar,
  IosInsetGroup,
  IosRow,
  IosActionSheet,
} from '../UI/IosPrimitives';
import { CloudCheck, HardDrive, LogOut, UploadCloud, User as UserIcon, Check, X } from 'lucide-react';

interface AuthButtonProps {
  lang: Language;
  localTrips: Trip[];
  onCloudSyncSuccess?: () => void;
  onOpenChange?: (isOpen: boolean) => void;
}

export const AuthButton: React.FC<AuthButtonProps> = ({
  lang,
  localTrips,
  onCloudSyncSuccess,
  onOpenChange,
}) => {
  const isMobile = useIsMobileViewport();
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

  const isOverlayOpen = showDropdown || Boolean(authError);

  useEffect(() => {
    onOpenChange?.(isOverlayOpen);
  }, [isOverlayOpen, onOpenChange]);

  useEffect(() => {
    const syncDriveState = () => setDriveConnected(hasDriveAccessToken());
    window.addEventListener('hiyori_drive_auth_changed', syncDriveState);
    return () => window.removeEventListener('hiyori_drive_auth_changed', syncDriveState);
  }, []);

  // Desktop popover click outside / Escape handling
  useEffect(() => {
    if (!isOverlayOpen || isMobile) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (!authDropdownRef.current?.contains(e.target as Node)) {
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
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOverlayOpen, isMobile]);

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
      const localDeletedIds = new Set(getDeletedTripIds());
      const cloudTombstones = await fetchUserTombstones(user.uid);
      const TOMBSTONE_SKEW_MS = 15 * 60 * 1000;

      const validTrips = localTrips.filter((trip) => {
        if (localDeletedIds.has(trip.id)) return false;
        const deletedAt = cloudTombstones[trip.id];
        if (typeof deletedAt === 'number' && deletedAt + TOMBSTONE_SKEW_MS >= (trip.updatedAt || 0)) {
          return false;
        }
        return true;
      });

      const syncedMap: Record<string, number> = {};
      for (const trip of validTrips) {
        const saved = await saveTripToCloud(user.uid, trip);
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

        {authError && !isMobile && (
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

        {authError && isMobile && (
          <IosActionSheet
            title={lang === 'zh' ? '無法完成 Google 登入' : 'Google Sign-In Failed'}
            message={authError}
            options={[
              {
                label: lang === 'zh' ? '重試登入' : 'Try Again',
                tone: 'primary',
                onClick: () => {
                  setAuthError(null);
                  handleLogin();
                },
              },
            ]}
            cancelLabel={lang === 'zh' ? '關閉' : 'Close'}
            onClose={() => setAuthError(null)}
            zIndexClass="z-[90]"
          />
        )}
      </div>
    );
  }

  const renderGroupedAccountActions = () => (
    <div className="space-y-3">
      <IosInsetGroup header={lang === 'zh' ? '雲端與備份' : 'Cloud & Backup'}>
        <IosRow
          onClick={handleUploadAllLocalToCloud}
          disabled={isSyncing}
          icon={<UploadCloud className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
          label={lang === 'zh' ? '同步全部旅程至雲端' : 'Sync All Trips to Cloud'}
          trailing={
            syncDone ? (
              <Check className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            ) : isSyncing ? (
              <span className="text-[11px] text-teal-700 dark:text-teal-400 font-mono">...</span>
            ) : null
          }
        />
        <IosRow
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
          icon={<HardDrive className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
          label={
            driveConnected
              ? lang === 'zh'
                ? 'Drive 原圖備份已連線'
                : 'Drive Originals Connected'
              : lang === 'zh'
              ? '連線 Google Drive 原圖空間'
              : 'Connect Google Drive Originals'
          }
          trailing={
            driveConnected ? (
              <Check className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            ) : (
              <span className="text-xs font-bold text-teal-700 dark:text-teal-400">
                {isConnectingDrive ? '...' : '授權'}
              </span>
            )
          }
        />
      </IosInsetGroup>

      {driveError && (
        <p className="px-2 text-[11px] font-medium text-amber-700 dark:text-amber-300 leading-snug">
          {driveError}
        </p>
      )}

      <IosInsetGroup>
        <IosRow
          onClick={handleLogout}
          destructive
          icon={<LogOut className="w-4 h-4 text-rose-600 dark:text-rose-400" />}
          label={lang === 'zh' ? '登出帳號' : 'Sign Out'}
        />
      </IosInsetGroup>
    </div>
  );

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

      {/* Mobile Bottom Sheet */}
      {showDropdown && isMobile && (
        <IosModalSheet
          onClose={() => setShowDropdown(false)}
          zIndexClass="z-[80]"
          variant="grouped"
          ariaLabel={user.displayName || '使用者帳戶'}
        >
          <IosNavBar
            title={user.displayName || (lang === 'zh' ? '已登入帳號' : 'Account')}
            subtitle={activeEmail || undefined}
            leftLabel=""
            rightLabel={lang === 'zh' ? '完成' : 'Done'}
            onRightClick={() => setShowDropdown(false)}
          />
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
            {renderGroupedAccountActions()}
          </div>
        </IosModalSheet>
      )}

      {/* Desktop Dropdown Popover */}
      {showDropdown && !isMobile && (
        <div className="absolute right-0 top-full mt-1.5 w-72 bg-[#FAF9F6] dark:bg-[#0B1120] rounded-2xl shadow-xl border border-[#E5E2DC] dark:border-slate-800 z-50 text-xs animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-[#E5E2DC] dark:border-slate-800 bg-white/85 dark:bg-[#111827] space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                {user.displayName || (lang === 'zh' ? '已登入用戶' : 'Signed In')}
              </p>
              <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 shrink-0">
                {lang === 'zh' ? '雲端同步' : 'Synced'}
              </span>
            </div>
            {activeEmail && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">
                {activeEmail}
              </p>
            )}
          </div>
          <div className="p-2.5">
            {renderGroupedAccountActions()}
          </div>
        </div>
      )}
    </div>
  );
};
