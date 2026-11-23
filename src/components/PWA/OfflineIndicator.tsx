import React, { useEffect, useRef, useState } from 'react';
import { WifiOff, Cloud, HardDrive, Smartphone, CheckCircle, Plane, X } from 'lucide-react';
import { getStorageUsage } from '../../utils/storage';
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
        subtitle="離線優先混合架構 · 免登入可用"
        leftLabel=""
        rightLabel="完成"
        onRightClick={onClose}
      />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] space-y-4">
        <IosInsetGroup header="同步與保存機制">
          <IosRow
            icon={<Smartphone className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label="跨裝置雲端即時同步"
            subtitle="登入 Google 帳號後，行程會在 iPhone、平板與電腦之間自動即時同步，多人共編亦即時連動。"
          />
          <IosRow
            icon={<HardDrive className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label="免登入離線完整編輯"
            subtitle={`所有行程、記帳與照片會安全儲存在您的本機裝置中（目前共 ${storageInfo.count} 個旅程 · 使用 ${storageInfo.formatted}）。`}
          />
          <IosRow
            icon={<Plane className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label="海外飛航與離線隨身"
            subtitle="搭機或無漫遊網路時，仍可完整瀏覽與編輯行程、憑證、待辦與離線記帳。"
          />
        </IosInsetGroup>

        <div className="px-2 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <Cloud className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
          <span>重新連上網路後，離線期間的修改會由單一同步佇列自動合併上雲。</span>
        </div>
      </div>
    </IosModalSheet>
  );
};

/**
 * Passive, non-intrusive connectivity pill.
 * Never calls flushPendingSyncQueue directly (App.tsx owns authenticated queue flushing)
 * and listens for authoritative `hiyori_sync_completed` events instead.
 */
export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [dismissedOffline, setDismissedOffline] = useState(false);
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      setDismissedOffline(false);
    };

    const handleOffline = () => {
      clearTimer();
      setIsOnline(false);
      setDismissedOffline(false);
      setShowSyncSuccess(false);
    };

    const handleSyncCompleted = (e: Event) => {
      const detail = (e as CustomEvent<{ count?: number }>).detail;
      const count = detail?.count ?? 0;
      if (count <= 0) return;
      clearTimer();
      setSyncedCount(count);
      setShowSyncSuccess(true);
      timerRef.current = window.setTimeout(() => {
        setShowSyncSuccess(false);
        timerRef.current = null;
      }, 3400);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('hiyori_sync_completed', handleSyncCompleted);

    return () => {
      clearTimer();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('hiyori_sync_completed', handleSyncCompleted);
    };
  }, []);

  if (showSyncSuccess) {
    return (
      <div className="fixed top-[calc(3.75rem+env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 max-w-[calc(100vw-1.5rem)] z-[55] pointer-events-auto flex items-center gap-2 rounded-full bg-emerald-950/95 text-white px-4 py-2 shadow-xl backdrop-blur-md border border-emerald-500/40 animate-in fade-in slide-in-from-top-2 duration-200">
        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="text-xs font-semibold whitespace-nowrap truncate">
          已連線 · 已自動同步 {syncedCount} 筆離線變更
        </span>
      </div>
    );
  }

  if (isOnline || dismissedOffline) {
    return null;
  }

  return (
    <div className="fixed top-[calc(3.75rem+env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 max-w-[calc(100vw-1.5rem)] z-[55] flex items-center gap-2 rounded-full bg-slate-900/95 text-white pl-3.5 pr-1.5 py-1.5 shadow-xl backdrop-blur-md border border-amber-500/35 animate-in fade-in slide-in-from-top-2 duration-200">
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span className="text-xs font-semibold text-amber-100 truncate">
        離線模式 · 編輯會先保存在本機
      </span>
      <button
        type="button"
        onClick={() => setDismissedOffline(true)}
        className="min-w-[32px] min-h-[32px] rounded-full flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer shrink-0"
        aria-label="收合離線提示"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
