import React, { useState } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Download, Smartphone, X, CheckCircle2 } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  useBodyScrollLock(showIOSGuide);

  // If already installed in standalone mode, show clean installed badge
  if (isInstalled) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200 text-xs font-semibold">
        <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
        <span>已安裝應用 (離線支援)</span>
      </div>
    );
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition active:scale-95"
      >
        <Download className="w-3.5 h-3.5" />
        <span>安裝隨身 App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-2 rounded-xl border border-teal-600/30 dark:border-teal-700/60 bg-teal-50/80 dark:bg-teal-950/40 hover:bg-teal-100/80 dark:hover:bg-teal-900/50 px-3 py-1.5 text-xs font-semibold text-teal-900 dark:text-teal-200 transition active:scale-95"
        >
          <Smartphone className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
          <span>加到 iPhone 主畫面</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold">
                    旅
                  </div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">安裝至 iPhone / iPad</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-200 font-bold flex items-center justify-center shrink-0 text-xs">1</span>
                  <span>點選 Safari 底部工具列的 <strong>「分享」按鈕</strong> (方形帶向上箭頭 ⎋)。</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-200 font-bold flex items-center justify-center shrink-0 text-xs">2</span>
                  <span>在選單中向下滑動，找到並點擊 <strong>「加入主畫面」</strong>。</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-200 font-bold flex items-center justify-center shrink-0 text-xs">3</span>
                  <span>點擊右上角 <strong>「新增」</strong>，即可像原生 App 一樣離線快速啟動！</span>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition"
              >
                我知道了
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <button
      onClick={() => alert('已可直接離線使用！若使用手機瀏覽器，可透過瀏覽器選單「加入主畫面」以獲得全螢幕隨身 App 體驗。')}
      className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition"
    >
      <Smartphone className="w-3.5 h-3.5" />
      <span>離線隨行模式</span>
    </button>
  );
};
