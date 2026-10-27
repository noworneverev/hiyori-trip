import React, { useState } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { TripConflict, resolveTripConflict } from '../../utils/syncManager';
import { Trip } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import {
  AlertTriangle,
  Smartphone,
  Cloud,
  GitMerge,
  Check,
  X,
  Clock,
  MapPin,
  CheckSquare,
  Luggage,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  FileText,
} from 'lucide-react';

interface ConflictResolutionModalProps {
  conflicts: TripConflict[];
  userId?: string | null;
  lang: Language;
  onResolved: (resolvedTrip: Trip) => void;
  onClose: () => void;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  conflicts,
  userId,
  lang,
  onResolved,
  onClose,
}) => {
  useBodyScrollLock(Boolean(conflicts && conflicts.length > 0));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showDetailedDiff, setShowDetailedDiff] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<'keep_local' | 'keep_cloud' | 'smart_merge' | null>(null);

  if (!conflicts || conflicts.length === 0) return null;
  const currentConflict = conflicts[currentIndex] || conflicts[0];

  const handleResolve = async (strategy: 'keep_local' | 'keep_cloud' | 'smart_merge') => {
    setSelectedStrategy(strategy);
    setIsResolving(true);
    try {
      const resolved = await resolveTripConflict(currentConflict, strategy, userId);
      onResolved(resolved);

      if (currentIndex + 1 < conflicts.length) {
        setCurrentIndex(currentIndex + 1);
      } else {
        onClose();
      }
    } catch (e) {
      console.error('Failed to resolve trip conflict:', e);
      onClose();
    } finally {
      setIsResolving(false);
      setSelectedStrategy(null);
    }
  };

  const { localSummary, cloudSummary, newerVersion, timeDiffMinutes } = currentConflict;
  const isZh = lang === 'zh';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-3xl bg-white dark:bg-[#1C1C1E] shadow-2xl border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-100 my-auto animate-in fade-in zoom-in-95 duration-150 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800 bg-amber-500/10 dark:bg-amber-950/30 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                  {isZh ? '偵測到版本衝突 · 離線與雲端不一致' : 'Version Conflict Detected'}
                </h3>
                {conflicts.length > 1 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                    {currentIndex + 1} / {conflicts.length}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                {isZh
                  ? `旅程【${currentConflict.tripTitle}】在離線狀態下有所修改，與雲端版本產生差異。請選擇您偏好的保留策略：`
                  : `Trip "${currentConflict.tripTitle}" has offline changes that differ from cloud version.`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-200/50 dark:hover:bg-zinc-800 transition cursor-pointer"
            title="稍後處理"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* Time Difference Alert Pill */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-white/10 text-xs">
            <div className="flex items-center gap-2 text-slate-600 dark:text-zinc-300">
              <Clock className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
              <span>
                {newerVersion === 'local' ? (
                  <>
                    本地端版本 <strong className="text-teal-600 dark:text-teal-400 font-bold">較新</strong> (領先約 {timeDiffMinutes} 分鐘)
                  </>
                ) : newerVersion === 'cloud' ? (
                  <>
                    雲端版本 <strong className="text-sky-600 dark:text-sky-400 font-bold">較新</strong> (領先約 {timeDiffMinutes} 分鐘)
                  </>
                ) : (
                  '兩端修改時間接近但內容不同'
                )}
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500 font-medium">
              ID: {currentConflict.tripId.slice(0, 8)}...
            </span>
          </div>

          {/* Two Visual Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* 1. Local Version Card */}
            <div
              className={`rounded-2xl p-4 border transition-all flex flex-col justify-between ${
                newerVersion === 'local'
                  ? 'bg-teal-50/40 dark:bg-teal-950/30 border-teal-300 dark:border-teal-700/80 shadow-2xs'
                  : 'bg-white dark:bg-[#252528] border-slate-200 dark:border-zinc-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 flex items-center justify-center">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                        {isZh ? '本地最新版' : 'Local Version'}
                      </h4>
                      <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold">
                        {isZh ? '📱 手機離線編輯' : 'Device Storage'}
                      </span>
                    </div>
                  </div>
                  {newerVersion === 'local' && (
                    <span className="px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 text-[10px] font-bold">
                      {isZh ? '最新修改' : 'Newer'}
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-600 dark:text-zinc-300 font-mono mb-3 bg-slate-100/90 dark:bg-zinc-800/90 p-2.5 rounded-xl border border-slate-200/60 dark:border-zinc-700/60">
                  <span className="text-[10px] text-slate-400 dark:text-zinc-400 block font-sans">最後修改時間</span>
                  {localSummary.formattedDate}
                </div>

                {/* Metrics */}
                <div className="space-y-1.5 text-xs text-slate-600 dark:text-zinc-300 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400">
                      <MapPin className="w-3.5 h-3.5 text-teal-500" />
                      <span>景點總數</span>
                    </span>
                    <strong className="font-bold text-slate-900 dark:text-white">{localSummary.spotCount} 個</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400">
                      <CheckSquare className="w-3.5 h-3.5 text-sky-500" />
                      <span>待辦票券</span>
                    </span>
                    <strong className="font-bold text-slate-900 dark:text-white">{localSummary.todoCount} 項</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400">
                      <Luggage className="w-3.5 h-3.5 text-amber-500" />
                      <span>行李裝備</span>
                    </span>
                    <strong className="font-bold text-slate-900 dark:text-white">{localSummary.packingCount} 件</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                      <span>支出筆數</span>
                    </span>
                    <strong className="font-bold text-slate-900 dark:text-white">{localSummary.expenseCount} 筆</strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={isResolving}
                onClick={() => handleResolve('keep_local')}
                className="w-full py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-98 cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                {isResolving && selectedStrategy === 'keep_local' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>{isZh ? '保留本地最新版' : 'Keep Local Version'}</span>
              </button>
            </div>

            {/* 2. Cloud Version Card */}
            <div
              className={`rounded-2xl p-4 border transition-all flex flex-col justify-between ${
                newerVersion === 'cloud'
                  ? 'bg-sky-50/40 dark:bg-sky-950/30 border-sky-300 dark:border-sky-700/80 shadow-2xs'
                  : 'bg-white dark:bg-[#252528] border-slate-200 dark:border-zinc-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 flex items-center justify-center">
                      <Cloud className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                        {isZh ? '雲端最新版' : 'Cloud Version'}
                      </h4>
                      <span className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold">
                        {isZh ? '☁️ 雲端已同步' : 'Cloud Synced'}
                      </span>
                    </div>
                  </div>
                  {newerVersion === 'cloud' && (
                    <span className="px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300 text-[10px] font-bold">
                      {isZh ? '最新修改' : 'Newer'}
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-600 dark:text-zinc-300 font-mono mb-3 bg-slate-100/90 dark:bg-zinc-800/90 p-2.5 rounded-xl border border-slate-200/60 dark:border-zinc-700/60">
                  <span className="text-[10px] text-slate-400 dark:text-zinc-400 block font-sans">最後同步時間</span>
                  {cloudSummary.formattedDate}
                </div>

                {/* Metrics */}
                <div className="space-y-1.5 text-xs text-slate-600 dark:text-zinc-300 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400">
                      <MapPin className="w-3.5 h-3.5 text-teal-500" />
                      <span>景點總數</span>
                    </span>
                    <strong className="font-bold text-slate-900 dark:text-white">{cloudSummary.spotCount} 個</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400">
                      <CheckSquare className="w-3.5 h-3.5 text-sky-500" />
                      <span>待辦票券</span>
                    </span>
                    <strong className="font-bold text-slate-900 dark:text-white">{cloudSummary.todoCount} 項</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400">
                      <Luggage className="w-3.5 h-3.5 text-amber-500" />
                      <span>行李裝備</span>
                    </span>
                    <strong className="font-bold text-slate-900 dark:text-white">{cloudSummary.packingCount} 件</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                      <span>支出筆數</span>
                    </span>
                    <strong className="font-bold text-slate-900 dark:text-white">{cloudSummary.expenseCount} 筆</strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={isResolving}
                onClick={() => handleResolve('keep_cloud')}
                className="w-full py-2.5 px-3 rounded-xl bg-slate-800 dark:bg-zinc-700 hover:bg-slate-900 dark:hover:bg-zinc-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-98 cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                {isResolving && selectedStrategy === 'keep_cloud' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Cloud className="w-3.5 h-3.5" />
                )}
                <span>{isZh ? '保留雲端最新版' : 'Keep Cloud Version'}</span>
              </button>
            </div>
          </div>

          {/* 3. Featured Smart Merge Option (Recommended) */}
          <div className="rounded-2xl p-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 dark:from-emerald-950/40 dark:via-teal-950/40 dark:to-cyan-950/40 border border-teal-200 dark:border-teal-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-teal-800 dark:text-teal-200 font-bold text-xs sm:text-sm">
                <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>{isZh ? '推薦進階策略：智慧雙向合併' : 'Recommended: Smart Merge'}</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-zinc-300 leading-relaxed">
                {isZh
                  ? '雙方變更都不遺失！系統將依項目 ID 智慧合併兩端新增的每日景點、行李清單與記帳記錄。'
                  : 'Keep additions from both sides by smart ID-level union merge.'}
              </p>
            </div>

            <button
              type="button"
              disabled={isResolving}
              onClick={() => handleResolve('smart_merge')}
              className="py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shrink-0 shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isResolving && selectedStrategy === 'smart_merge' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <GitMerge className="w-3.5 h-3.5" />
              )}
              <span>{isZh ? '一鍵智慧合併兩端' : 'Smart Merge Both'}</span>
            </button>
          </div>

          {/* Collapsible Detailed Diff Accordion */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowDetailedDiff(!showDetailedDiff)}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/70 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-semibold text-slate-600 dark:text-zinc-300 transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400" />
                <span>{isZh ? '檢視兩版本詳細差異細節' : 'View Detailed Differences'}</span>
              </div>
              {showDetailedDiff ? (
                <ChevronUp className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
              )}
            </button>

            {showDetailedDiff && (
              <div className="mt-2 p-3.5 rounded-2xl bg-slate-50/70 dark:bg-zinc-900/90 border border-slate-200/60 dark:border-zinc-800 text-xs space-y-2.5">
                <div className="grid grid-cols-2 gap-2 text-[11px] pb-2 border-b border-slate-200/50 dark:border-zinc-800 font-bold text-slate-500 dark:text-zinc-400">
                  <span>📱 本機版本內容</span>
                  <span>☁️ 雲端版本內容</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 dark:text-zinc-500 block text-[10px]">標題</span>
                    <span className="font-medium text-slate-800 dark:text-zinc-200">{currentConflict.localTrip.title}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-zinc-500 block text-[10px]">標題</span>
                    <span className="font-medium text-slate-800 dark:text-zinc-200">{currentConflict.cloudTrip.title}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 dark:text-zinc-500 block text-[10px]">天數與日程</span>
                    <span className="font-medium text-slate-800 dark:text-zinc-200">
                      {currentConflict.localTrip.days.length} 天 (
                      {currentConflict.localTrip.startDate} ~ {currentConflict.localTrip.endDate})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-zinc-500 block text-[10px]">天數與日程</span>
                    <span className="font-medium text-slate-800 dark:text-zinc-200">
                      {currentConflict.cloudTrip.days.length} 天 (
                      {currentConflict.cloudTrip.startDate} ~ {currentConflict.cloudTrip.endDate})
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 dark:text-zinc-500 block text-[10px]">備忘筆記</span>
                    <span className="text-slate-600 dark:text-zinc-300 truncate block">
                      {currentConflict.localTrip.notes || '(無備忘)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-zinc-500 block text-[10px]">備忘筆記</span>
                    <span className="text-slate-600 dark:text-zinc-300 truncate block">
                      {currentConflict.cloudTrip.notes || '(無備忘)'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 flex items-center justify-between text-xs">
          <p className="text-[11px] text-slate-400 dark:text-zinc-400">
            {isZh ? '提示：選擇後立即更新本地快取並背景同步' : 'Selected strategy updates local cache instantly'}
          </p>

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 border border-slate-300 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 rounded-xl font-medium transition cursor-pointer"
          >
            {isZh ? '稍後決定' : 'Decide Later'}
          </button>
        </div>
      </div>
    </div>
  );
};
