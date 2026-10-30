import React, { useState, useEffect } from 'react';
import { performAppUpdate, UpdateState } from '../../utils/pwaUpdater';
import { APP_VERSION } from '../../constants/version';
import { Sparkles, RotateCcw, X, ArrowUpCircle } from 'lucide-react';
import { Language } from '../../utils/i18n';

interface UpdateNotificationBannerProps {
  lang: Language;
}

export const UpdateNotificationBanner: React.FC<UpdateNotificationBannerProps> = ({ lang }) => {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' });

  useEffect(() => {
    const handleUpdateFound = () => {
      setHasUpdate(true);
      setIsDismissed(false);
    };

    window.addEventListener('pwa_update_available', handleUpdateFound);
    return () => window.removeEventListener('pwa_update_available', handleUpdateFound);
  }, []);

  if (!hasUpdate || isDismissed) {
    return null;
  }

  const isUpdating = updateState.status === 'checking' || updateState.status === 'updating';

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-90 animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-xl border border-teal-500/40 text-white rounded-3xl p-4 shadow-2xl flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 text-teal-400 border border-teal-400/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-white">
                  {lang === 'zh' ? '發現日和手帳新版本！' : 'New Update Available!'}
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-[10px] font-mono font-bold border border-teal-400/30">
                  {APP_VERSION}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {lang === 'zh'
                  ? '已為您下載最新功能與介面顯示最佳化，點擊立即套用。'
                  : 'Latest features downloaded. Reload now to apply.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsDismissed(true)}
            className="p-1 rounded-full text-slate-400 hover:text-white transition"
            title={lang === 'zh' ? '稍後提醒' : 'Dismiss'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800">
          <button
            onClick={() => setIsDismissed(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            {lang === 'zh' ? '稍後' : 'Later'}
          </button>
          <button
            disabled={isUpdating}
            onClick={async () => {
              await performAppUpdate((s) => setUpdateState(s));
            }}
            className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition shadow-md active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {isUpdating ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                <span>{updateState.message || (lang === 'zh' ? '套用中...' : 'Applying...')}</span>
              </>
            ) : (
              <>
                <ArrowUpCircle className="w-4 h-4" />
                <span>{lang === 'zh' ? '立即更新' : 'Update Now'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
