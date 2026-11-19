import React, { useEffect, useState } from 'react';
import { WifiOff, Cloud, HardDrive, Smartphone, CheckCircle, Plane } from 'lucide-react';
import { getStorageUsage } from '../../utils/storage';
import { flushPendingSyncQueue, getPendingQueue } from '../../utils/syncManager';
import { IosModalSheet, IosNavBar, IosInsetGroup, IosRow } from '../UI/IosPrimitives';

interface SyncArchitectureModalProps {
  onClose: () => void;
}

export const SyncArchitectureModal: React.FC<SyncArchitectureModalProps> = ({ onClose }) => {
  const [storageInfo] = useState(() => getStorageUsage());

  return (
    <IosModalSheet
      onClose={onClose}
      maxWidthClass="sm:max-w-sm"
      zIndexClass="z-[85]"
      variant="grouped"
      ariaLabel="跨裝置同步與離線隨行"
    >
      <IosNavBar
        title="跨裝置同步與離線隨行"
        subtitle="混合儲存架構 · 登入與免登入皆可"
        leftLabel=""
        rightLabel="完成"
        onRightClick={onClose}
      />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] space-y-4">
        <IosInsetGroup header="同步與保存機制">
          <IosRow
            icon={<Smartphone className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label="跨裝置雲端即時同步"
            subtitle="使用 Google 帳號登入，行程會在 iPhone、平板與電腦之間自動即時同步，多人共編亦即時連動。"
          />
          <IosRow
            icon={<HardDrive className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label="免登入訪客模式（本機快取）"
            subtitle={`資料會安全儲存在您的本機裝置中（目前共 ${storageInfo.count} 個旅程 · 使用 ${storageInfo.formatted}）。`}
          />
          <IosRow
            icon={<Plane className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label="海外飛航與離線隨身"
            subtitle="搭機或無漫遊網路時，仍可完整查閱每日景點、訂位編號、地圖備忘與離線記帳。"
          />
        </IosInsetGroup>

        <div className="px-2 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <Cloud className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
          <span>連上網路後，離線期間的修改會自動與雲端合併對帳。</span>
        </div>
      </div>
    </IosModalSheet>
  );
};

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      const pendingBefore = getPendingQueue().length;
      try {
        const { successCount } = await flushPendingSyncQueue();
        if (successCount > 0 || pendingBefore > 0) {
          setSyncedCount(successCount || pendingBefore);
          setShowSyncSuccess(true);
          setTimeout(() => setShowSyncSuccess(false), 3500);
        }
      } catch (err) {
        console.warn('Reconnection auto-sync error:', err);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowSyncSuccess(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check: if online and there are pending items from previous session, flush them
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      flushPendingSyncQueue().then(({ successCount }) => {
        if (successCount > 0) {
          setSyncedCount(successCount);
          setShowSyncSuccess(true);
          setTimeout(() => setShowSyncSuccess(false), 3000);
        }
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // When reconnected and successfully synced
  if (showSyncSuccess) {
    return (
      <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-4 right-4 sm:bottom-6 sm:left-6 sm:right-auto sm:max-w-md z-50 flex items-center gap-2.5 rounded-2xl bg-emerald-950/95 text-white px-4 py-3 shadow-2xl backdrop-blur-md border border-emerald-600/70 animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex-1 text-xs">
          <p className="font-bold text-emerald-300">網路已重新連線</p>
          <p className="text-emerald-100 text-[11px]">
            {syncedCount > 0
              ? `已自動為您將 ${syncedCount} 筆離線變更同步至雲端！`
              : '離線資料已成功自動同步至雲端！'}
          </p>
        </div>
      </div>
    );
  }

  if (isOnline) {
    return null;
  }

  return (
    /* Offline Notification Banner - Only shows when network is genuinely disconnected */
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-4 right-4 sm:bottom-6 sm:left-6 sm:right-auto sm:max-w-md z-50 flex items-center gap-2.5 rounded-2xl bg-slate-900/95 text-white px-4 py-3 shadow-2xl backdrop-blur-md border border-slate-700 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
        <WifiOff className="w-4 h-4" />
      </div>
      <div className="flex-1 text-xs">
        <p className="font-bold text-amber-300">離線快取模式已啟動</p>
        <p className="text-slate-300 text-[11px]">
          您的行程資料已安全保存在本機，新增與編輯隨時可用，連線時將自動同步！
        </p>
      </div>
    </div>
  );
};
