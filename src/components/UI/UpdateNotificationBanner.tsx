import React, { useState, useEffect } from 'react';
import { performAppUpdate, UpdateState } from '../../utils/pwaUpdater';
import { Sparkles, RotateCcw, X, ArrowUpCircle } from 'lucide-react';
import { Language } from '../../utils/i18n';

interface UpdateNotificationBannerProps {
  lang: Language;
}

const COPY: Record<
  Language,
  {
    title: string;
    badge: string;
    desc: string;
    dismiss: string;
    later: string;
    updateNow: string;
    applying: string;
  }
> = {
  zh: {
    title: '發現日和手帳新版本',
    badge: 'NEW',
    desc: '最新功能與體驗最佳化已準備就緒，點擊即可平滑更新。',
    dismiss: '稍後提醒',
    later: '稍後',
    updateNow: '立即更新',
    applying: '套用中...',
  },
  'zh-CN': {
    title: '发现日和手帐新版本',
    badge: 'NEW',
    desc: '最新功能与体验优化已准备就绪，点击即可平滑更新。',
    dismiss: '稍后提醒',
    later: '稍后',
    updateNow: '立即更新',
    applying: '应用中...',
  },
  en: {
    title: 'New Hiyori Update Ready',
    badge: 'NEW',
    desc: 'Latest improvements are ready offline. Tap to refresh smoothly.',
    dismiss: 'Dismiss',
    later: 'Later',
    updateNow: 'Update Now',
    applying: 'Updating...',
  },
  ja: {
    title: '新しいバージョンがあります',
    badge: 'NEW',
    desc: '最新の改善と機能の準備ができました。タップして更新できます。',
    dismiss: 'あとで',
    later: 'あとで',
    updateNow: '今すぐ更新',
    applying: '更新中...',
  },
  ko: {
    title: '새 버전 업데이트 준비 완료',
    badge: 'NEW',
    desc: '최신 기능과 개선 사항이 준비되었습니다. 탭하여 업데이트하세요.',
    dismiss: '나중에',
    later: '나중에',
    updateNow: '지금 업데이트',
    applying: '적용 중...',
  },
};

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

  const copy = COPY[lang] || COPY.zh;
  const isUpdating = updateState.status === 'checking' || updateState.status === 'updating';

  return (
    <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm z-[60] animate-in fade-in slide-in-from-bottom-4 duration-250">
      <div className="bg-slate-900/95 dark:bg-[#111827]/95 backdrop-blur-xl border border-teal-500/35 text-white rounded-3xl p-4 shadow-2xl flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 text-teal-300 border border-teal-400/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-white truncate">{copy.title}</h4>
                <span className="px-1.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-[10px] font-mono font-bold border border-teal-400/30 shrink-0">
                  {copy.badge}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">{copy.desc}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] -mr-2 -mt-2 flex items-center justify-center rounded-full text-slate-400 hover:text-white transition cursor-pointer shrink-0"
            title={copy.dismiss}
            aria-label={copy.dismiss}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
          >
            {copy.later}
          </button>
          <button
            type="button"
            disabled={isUpdating}
            onClick={async () => {
              await performAppUpdate((s) => setUpdateState(s), { forceApplyWaiting: true });
            }}
            className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition shadow-md active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {isUpdating ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                <span>{updateState.message || copy.applying}</span>
              </>
            ) : (
              <>
                <ArrowUpCircle className="w-4 h-4" />
                <span>{copy.updateNow}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
