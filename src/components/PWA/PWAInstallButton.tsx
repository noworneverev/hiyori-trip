import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Download, Smartphone, CheckCircle2, Share } from 'lucide-react';
import { IosModalSheet, IosNavBar, IosInsetGroup, IosRow } from '../UI/IosPrimitives';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showOfflineTip, setShowOfflineTip] = useState(false);

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
        className="flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition active:scale-95 cursor-pointer"
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
          className="flex items-center gap-2 rounded-xl border border-teal-600/30 dark:border-teal-700/60 bg-teal-50/80 dark:bg-teal-950/40 hover:bg-teal-100/80 dark:hover:bg-teal-900/50 px-3 py-1.5 text-xs font-semibold text-teal-900 dark:text-teal-200 transition active:scale-95 cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
          <span>加到 iPhone 主畫面</span>
        </button>

        {showIOSGuide && (
          <IosModalSheet
            onClose={() => setShowIOSGuide(false)}
            maxWidthClass="sm:max-w-sm"
            zIndexClass="z-[90]"
            variant="grouped"
            ariaLabel="加到 iPhone 主畫面"
          >
            <IosNavBar
              title="加到 iPhone 主畫面"
              subtitle="以全螢幕 App 離線開啟"
              leftLabel=""
              rightLabel="完成"
              onRightClick={() => setShowIOSGuide(false)}
            />
            <div className="p-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] space-y-4 overflow-y-auto overscroll-contain">
              <IosInsetGroup header="Safari 步驟指引">
                <IosRow
                  icon={
                    <span className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-200 font-bold flex items-center justify-center text-xs">
                      1
                    </span>
                  }
                  label={
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-normal leading-relaxed">
                      點選 Safari 底部工具列的 <strong className="inline-flex items-center gap-0.5 text-teal-700 dark:text-teal-300"><Share className="w-3.5 h-3.5 inline" /> 分享</strong> 按鈕。
                    </span>
                  }
                />
                <IosRow
                  icon={
                    <span className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-200 font-bold flex items-center justify-center text-xs">
                      2
                    </span>
                  }
                  label={
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-normal leading-relaxed">
                      向上滑動分享選單，選擇 <strong>「加入主畫面」</strong>。
                    </span>
                  }
                />
                <IosRow
                  icon={
                    <span className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-200 font-bold flex items-center justify-center text-xs">
                      3
                    </span>
                  }
                  label={
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-normal leading-relaxed">
                      點擊右上角 <strong>「新增」</strong>，即可全螢幕啟動並離線查看行程！
                    </span>
                  }
                />
              </IosInsetGroup>
            </div>
          </IosModalSheet>
        )}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowOfflineTip(true)}
        className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition cursor-pointer"
      >
        <Smartphone className="w-3.5 h-3.5" />
        <span>離線隨行模式</span>
      </button>

      {showOfflineTip && (
        <IosModalSheet
          onClose={() => setShowOfflineTip(false)}
          maxWidthClass="sm:max-w-sm"
          zIndexClass="z-[90]"
          variant="grouped"
          ariaLabel="離線隨行已就緒"
        >
          <IosNavBar
            title="離線隨行已就緒"
            leftLabel=""
            rightLabel="完成"
            onRightClick={() => setShowOfflineTip(false)}
          />
          <div className="p-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] space-y-4">
            <IosInsetGroup>
              <IosRow
                icon={<CheckCircle2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
                label={
                  <span className="text-xs text-slate-700 dark:text-slate-200 whitespace-normal leading-relaxed">
                    行程與記帳皆支援離線瀏覽與記錄；透過手機瀏覽器選單「加入主畫面」即可全螢幕啟動。
                  </span>
                }
              />
            </IosInsetGroup>
          </div>
        </IosModalSheet>
      )}
    </>
  );
};
