import React, { useState, useEffect } from 'react';
import { loginWithGoogle } from '../../utils/firebase';
import { Language } from '../../utils/i18n';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { X, Cloud, Check } from 'lucide-react';

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoggingIn) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoggingIn, onClose]);

  if (!isOpen) return null;

  const isZh = lang === 'zh';

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    setErrorMessage(null);
    try {
      const user = await loginWithGoogle();
      if (user) {
        onClose();
        if (onLoginSuccess) {
          onLoginSuccess();
        }
      } else {
        setIsLoggingIn(false);
      }
    } catch (err) {
      console.error('Google Sign In failed:', err);
      setErrorMessage(
        isZh ? '登入未完成，請稍後再試。' : 'Sign in incomplete, please try again.'
      );
      setIsLoggingIn(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoggingIn) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 text-slate-900 dark:text-slate-100">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isLoggingIn}
          className="absolute top-4 right-4 min-w-[40px] min-h-[40px] rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition"
          aria-label="關閉"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4 pr-8">
          <div className="w-11 h-11 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <h3 id="auth-modal-title" className="text-base font-bold text-slate-900 dark:text-white">
              {isZh ? '登入以編輯並雲端備份' : 'Sign in to Edit & Sync'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {reason
                ? isZh
                  ? `操作「${reason}」前請先登入`
                  : `Sign in required to ${reason}`
                : isZh
                ? '登入後自動上傳本機行程並跨裝置同步'
                : 'Auto-sync local trips across devices'}
            </p>
          </div>
        </div>

        {/* Minimal 1-row benefit strip */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-5 px-3 py-2 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-[11px] font-medium text-slate-600 dark:text-slate-300">
          <span className="flex items-center gap-1">
            <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            {isZh ? '即時雲端同步' : 'Cloud sync'}
          </span>
          <span className="flex items-center gap-1">
            <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            {isZh ? '相片安全保存' : 'Photo backup'}
          </span>
          <span className="flex items-center gap-1">
            <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            {isZh ? '本機自動匯入' : 'Auto import'}
          </span>
        </div>

        {/* Error message */}
        {errorMessage && (
          <p className="text-xs text-rose-500 font-semibold mb-3 text-center">
            {errorMessage}
          </p>
        )}

        {/* Action Buttons */}
        <div className="space-y-2">
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoggingIn}
            className="w-full min-h-[48px] py-3 px-4 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2.5 transition active:scale-[0.98] disabled:opacity-60 cursor-pointer"
          >
            {isLoggingIn ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4 shrink-0 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
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
            <span>{isZh ? '使用 Google 帳號登入' : 'Sign in with Google'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={isLoggingIn}
            className="w-full min-h-[44px] py-2.5 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium text-xs transition"
          >
            {isZh ? '繼續唯讀瀏覽' : 'Continue Read-Only'}
          </button>
        </div>
      </div>
    </div>
  );
};
