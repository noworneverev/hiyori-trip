import React, { useState } from 'react';
import { loginWithGoogle } from '../../utils/firebase';
import { Language } from '../../utils/i18n';
import { X, Cloud, ShieldCheck, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';

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
        // User closed the popup or cancelled
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoggingIn) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 p-6 overflow-hidden animate-in zoom-in-95 duration-200 text-slate-900 dark:text-slate-100">
        {/* Decorative background blur element */}
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-teal-500/15 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-cyan-500/15 rounded-full blur-2xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isLoggingIn}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          aria-label="關閉"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon & Title */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 flex items-center justify-center text-teal-600 dark:text-teal-400 shadow-xs">
            <Cloud className="w-6 h-6" />
          </div>
          <div>
            <h3 id="auth-modal-title" className="text-lg font-bold text-slate-900 dark:text-white">
              {isZh ? '登入 Google 帳號以啟用編輯' : 'Sign in to Enable Editing'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isZh ? '確保所有修改即時儲存至雲端，永不遺失' : 'Ensure all your changes are securely backed up'}
            </p>
          </div>
        </div>

        {/* Action Reason Notice */}
        {reason && (
          <div className="mb-4 px-3.5 py-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <p className="line-clamp-2">
              {isZh ? `您正在嘗試【${reason}】，請先登入帳號。` : `Signing in is required to ${reason}.`}
            </p>
          </div>
        )}

        {/* Feature Benefits List */}
        <div className="space-y-2.5 mb-6 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
            <div className="w-5 h-5 rounded-lg bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {isZh ? '雲端資料庫即時雙向備份' : 'Real-time Cloud Sync'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isZh
                  ? '所有行程、景點筆記與花費記帳自動同步至雲端，電腦與手機隨時一致。'
                  : 'All spots, notes, and expenses auto-sync across your desktop and mobile.'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
            <div className="w-5 h-5 rounded-lg bg-cyan-100 dark:bg-cyan-900/60 text-cyan-700 dark:text-cyan-300 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {isZh ? '相片回憶永久安全儲存' : 'Safe Memory Photos'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isZh
                  ? '打卡相片與發票收據妥善儲存，清理瀏覽器快取也不用擔心照片消失。'
                  : 'Check-in photos and receipts are stored safely without losing data.'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
            <div className="w-5 h-5 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {isZh ? '現有本機行程自動上傳' : 'Auto-claim Local Trips'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isZh
                  ? '登入後會立即自動將您在此裝置上的行程與相片備份至您的帳號中。'
                  : 'Your local itinerary and photos will automatically migrate to your cloud database.'}
              </p>
            </div>
          </div>
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
            className="w-full py-3 px-4 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2.5 transition active:scale-[0.98] disabled:opacity-60 cursor-pointer"
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
            <span>{isZh ? '使用 Google 帳號快速登入' : 'Sign in with Google'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={isLoggingIn}
            className="w-full py-2.5 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium text-xs transition"
          >
            {isZh ? '先繼續唯讀瀏覽' : 'Continue in Read-Only Mode'}
          </button>
        </div>
      </div>
    </div>
  );
};
