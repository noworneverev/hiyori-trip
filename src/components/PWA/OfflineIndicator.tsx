import React, { useEffect, useState } from 'react';
import { WifiOff, Cloud, HardDrive, Smartphone } from 'lucide-react';
import { getStorageUsage } from '../../utils/storage';

interface SyncArchitectureModalProps {
  onClose: () => void;
}

export const SyncArchitectureModal: React.FC<SyncArchitectureModalProps> = ({ onClose }) => {
  const [storageInfo] = useState(() => getStorageUsage());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-2xl bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 flex items-center justify-center">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">跨裝置同步與離線隨行</h3>
            <p className="text-xs text-teal-600 dark:text-teal-400 font-medium">混合儲存架構 · 登入與免登入皆可</p>
          </div>
        </div>

        <div className="mt-4 space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <div className="flex items-start gap-2 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
            <Smartphone className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-200">跨裝置雲端即時同步</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                使用 Google 帳號一鍵登入，行程會在您的手機、平板與電腦之間自動即時同步，多人共編時亦能即時連動。
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
            <HardDrive className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-200">免登入訪客模式（本地儲存）</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                若不想登入也完全沒問題！資料會自動儲存在本地設備（目前已儲存 {storageInfo.count} 個旅程，使用 {storageInfo.formatted} 空間）。
              </p>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-teal-50/60 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-900/60 text-teal-900 dark:text-teal-200 text-[11px]">
            ✈️ <strong>海外離線隨身：</strong>出國在飛機上或無網路時，皆能自由翻閱每日景點、訂位編號與地圖備忘。
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2.5 text-xs transition active:scale-95 shadow-xs"
        >
          確定
        </button>
      </div>
    </div>
  );
};

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return null;
  }

  return (
    /* Offline Notification Banner - Only shows when network is genuinely disconnected */
    <div className="fixed bottom-4 left-4 right-4 md:left-6 md:right-auto md:max-w-md z-50 flex items-center gap-2.5 rounded-2xl bg-slate-900/95 text-white px-4 py-3 shadow-2xl backdrop-blur-md border border-slate-700 animate-bounce duration-1000">
      <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
        <WifiOff className="w-4 h-4" />
      </div>
      <div className="flex-1 text-xs">
        <p className="font-bold text-amber-300">離線快取模式已啟動</p>
        <p className="text-slate-300 text-[11px]">您仍可隨時查閱已儲存的行程、景點與備忘，連線時將自動同步！</p>
      </div>
    </div>
  );
};
