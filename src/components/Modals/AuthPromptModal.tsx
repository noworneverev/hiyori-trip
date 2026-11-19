import React, { useState, useEffect } from 'react';
import { isEmbeddedInAppBrowser, loginWithGoogleDetailed } from '../../utils/firebase';
import { Language } from '../../utils/i18n';
import { IosModalSheet, IosNavBar, IosInsetGroup, IosRow } from '../UI/IosPrimitives';
import { Cloud, Check } from 'lucide-react';

interface AuthPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: string;
  onLoginSuccess?: () => void;
  lang?: Language;
}

export const AuthPromptModal: React.FC<AuthPromptModalProps> = ({
  isOpen,
  onClose,
  reason,
  onLoginSuccess,
  lang = 'zh',
}) => {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inAppBrowser = isEmbeddedInAppBrowser();

  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setStatusMessage(null);
    setIsLoggingIn(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const isZh = lang === 'zh';

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await loginWithGoogleDetailed();
      if (res.user) {
        onClose();
        if (onLoginSuccess) {
          onLoginSuccess();
        }
        return;
      }
      if (res.redirected) {
        setStatusMessage(isZh ? '正在前往 Google 登入頁面…' : 'Redirecting to Google Sign-In...');
        return;
      }
      if (!res.cancelled && res.errorMessage) {
        setErrorMessage(res.errorMessage);
      }
      setIsLoggingIn(false);
    } catch (err) {
      console.error('Google Sign In failed:', err);
      setErrorMessage(
        isZh ? '登入未完成，請稍後再試。' : 'Sign in incomplete, please try again.'
      );
      setIsLoggingIn(false);
    }
  };

  return (
    <IosModalSheet
      onClose={onClose}
      maxWidthClass="sm:max-w-sm"
      zIndexClass="z-[85]"
      variant="grouped"
      disableBackdropClose={isLoggingIn}
      ariaLabel={isZh ? '登入以編輯並雲端備份' : 'Sign in to Edit & Sync'}
    >
      <IosNavBar
        title={isZh ? '登入雲端同步' : 'Cloud Sign In'}
        leftLabel={isZh ? '略過' : 'Skip'}
        onLeftClick={onClose}
        leftDisabled={isLoggingIn}
      />

      <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] space-y-4">
        <div className="flex items-center gap-3 px-1">
          <div className="w-11 h-11 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200/80 dark:border-teal-800 flex items-center justify-center text-teal-700 dark:text-teal-400 shrink-0">
            <Cloud className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              {isZh ? '登入以編輯並跨裝置同步' : 'Sign in to Edit & Sync'}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              {reason
                ? isZh
                  ? `操作「${reason}」前請先登入 Google 帳號`
                  : `Sign in required to ${reason}`
                : isZh
                ? '登入後可跨手機與電腦即時同步所有旅程與變更'
                : 'Stay signed in and auto-sync trips across devices'}
            </p>
          </div>
        </div>

        <IosInsetGroup>
          <IosRow
            icon={<Check className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={isZh ? '即時雲端雙向同步' : 'Real-time cloud sync'}
          />
          <IosRow
            icon={<Check className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={isZh ? '跨裝置刪除與備份一致' : 'Consistent cross-device deletion'}
          />
          <IosRow
            icon={<Check className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label={isZh ? '本機草稿自動無縫匯入' : 'Seamless local draft import'}
          />
        </IosInsetGroup>

        {inAppBrowser && (
          <div className="px-3.5 py-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            {isZh
              ? '偵測到目前為 App 內建瀏覽器，建議改用 Safari / Chrome 開啟以穩定維持登入狀態。'
              : 'In-app browser detected. Open in Safari or Chrome for reliable login.'}
          </div>
        )}

        {statusMessage && (
          <p className="text-xs text-teal-700 dark:text-teal-300 font-semibold text-center leading-relaxed">
            {statusMessage}
          </p>
        )}
        {errorMessage && (
          <p className="text-xs text-rose-600 dark:text-rose-400 font-medium text-center leading-relaxed bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-2xl px-3.5 py-2.5">
            {errorMessage}
          </p>
        )}

        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoggingIn}
            className="w-full min-h-[48px] py-3 px-4 rounded-2xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2.5 transition active:scale-[0.98] disabled:opacity-60 cursor-pointer"
          >
            {isLoggingIn ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4 shrink-0 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
            )}
            <span>{isZh ? '使用 Google 帳號登入' : 'Sign in with Google'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={isLoggingIn}
            className="w-full min-h-[44px] py-2.5 px-4 rounded-2xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 hover:bg-[#F3F1EC] dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-xs transition cursor-pointer"
          >
            {isZh ? '繼續唯讀瀏覽' : 'Continue Read-Only'}
          </button>
        </div>
      </div>
    </IosModalSheet>
  );
};
