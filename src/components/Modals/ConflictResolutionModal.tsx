import React, { useState } from 'react';
import { TripConflict, resolveTripConflict } from '../../utils/syncManager';
import { Trip } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import {
  IosModalSheet,
  IosNavBar,
  IosInsetGroup,
  IosRow,
  IosDisclosureRow,
} from '../UI/IosPrimitives';
import {
  AlertTriangle,
  Smartphone,
  Cloud,
  GitMerge,
  Check,
  Clock,
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
    <IosModalSheet
      onClose={onClose}
      maxWidthClass="sm:max-w-2xl"
      variant="grouped"
      ariaLabel={isZh ? '偵測到版本衝突' : 'Version Conflict'}
    >
      <IosNavBar
        title={isZh ? '版本衝突處理' : 'Version Conflict'}
        subtitle={
          conflicts.length > 1
            ? `${currentIndex + 1} / ${conflicts.length} · ${currentConflict.tripTitle}`
            : currentConflict.tripTitle
        }
        leftLabel={isZh ? '稍後' : 'Later'}
        onLeftClick={onClose}
      />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 sm:p-5 space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
        {/* Conflict Summary Group */}
        <IosInsetGroup
          header={isZh ? '同步狀態差異' : 'Sync Discrepancy'}
          footer={
            isZh
              ? '選擇保留版本後將立即更新本機快取與雲端資料。'
              : 'Your choice updates both local cache and cloud immediately.'
          }
        >
          <IosRow
            icon={
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            }
            label={
              newerVersion === 'local'
                ? isZh
                  ? `本機離線版本較新（領先約 ${timeDiffMinutes} 分鐘）`
                  : `Local version is newer (~${timeDiffMinutes}m ahead)`
                : newerVersion === 'cloud'
                ? isZh
                  ? `雲端同步版本較新（領先約 ${timeDiffMinutes} 分鐘）`
                  : `Cloud version is newer (~${timeDiffMinutes}m ahead)`
                : isZh
                ? '兩端修改時間接近，但內容存在差異'
                : 'Both versions modified near the same time'
            }
            subtitle={`旅程「${currentConflict.tripTitle}」`}
            trailing={
              <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {currentConflict.tripId.slice(0, 6)}
              </span>
            }
          />
        </IosInsetGroup>

        {/* Recommended Smart Merge */}
        <IosInsetGroup header={isZh ? '推薦方案' : 'Recommended'}>
          <IosRow
            onClick={() => handleResolve('smart_merge')}
            disabled={isResolving}
            icon={
              <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 flex items-center justify-center">
                {isResolving && selectedStrategy === 'smart_merge' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
              </div>
            }
            label={isZh ? '智慧雙向合併兩端紀錄' : 'Smart Merge Both Versions'}
            subtitle={
              isZh
                ? '依項目自動合併雙方新增的景點、行李與記帳，互不覆蓋'
                : 'Merge additions from both sides without overwriting'
            }
            trailing={
              <span className="px-3 py-1.5 rounded-xl bg-teal-700 dark:bg-teal-600 text-white text-xs font-bold flex items-center gap-1 shrink-0">
                <GitMerge className="w-3.5 h-3.5" />
                <span>{isZh ? '智慧合併' : 'Merge'}</span>
              </span>
            }
          />
        </IosInsetGroup>

        {/* Manual Choice Comparison */}
        <IosInsetGroup header={isZh ? '或單向覆蓋保留' : 'Or Choose One Version'}>
          {/* Local Version Row */}
          <div className="px-4 py-3.5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-xs font-bold text-slate-900 dark:text-white">
                      {isZh ? '本機離線版本' : 'Local Version'}
                    </span>
                    {newerVersion === 'local' && (
                      <span className="text-[11px] font-bold text-teal-700 dark:text-teal-400">
                        · {isZh ? '較新' : 'Newer'}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                    {localSummary.formattedDate}
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={isResolving}
                onClick={() => handleResolve('keep_local')}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5 transition shrink-0 disabled:opacity-50 cursor-pointer"
              >
                {isResolving && selectedStrategy === 'keep_local' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>{isZh ? '保留本機' : 'Keep Local'}</span>
              </button>
            </div>

            <div className="pl-12 grid grid-cols-4 gap-2 text-[11px] text-slate-600 dark:text-slate-300 font-mono tabular-nums">
              <div>
                <span className="block text-[10px] font-sans text-slate-400">景點</span>
                <strong className="text-slate-900 dark:text-white">{localSummary.spotCount}</strong>
              </div>
              <div>
                <span className="block text-[10px] font-sans text-slate-400">待辦</span>
                <strong className="text-slate-900 dark:text-white">{localSummary.todoCount}</strong>
              </div>
              <div>
                <span className="block text-[10px] font-sans text-slate-400">行李</span>
                <strong className="text-slate-900 dark:text-white">{localSummary.packingCount}</strong>
              </div>
              <div>
                <span className="block text-[10px] font-sans text-slate-400">記帳</span>
                <strong className="text-slate-900 dark:text-white">{localSummary.expenseCount}</strong>
              </div>
            </div>
          </div>

          {/* Cloud Version Row */}
          <div className="px-4 py-3.5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0">
                  <Cloud className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-xs font-bold text-slate-900 dark:text-white">
                      {isZh ? '雲端同步版本' : 'Cloud Version'}
                    </span>
                    {newerVersion === 'cloud' && (
                      <span className="text-[11px] font-bold text-sky-700 dark:text-sky-400">
                        · {isZh ? '較新' : 'Newer'}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                    {cloudSummary.formattedDate}
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={isResolving}
                onClick={() => handleResolve('keep_cloud')}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs flex items-center gap-1.5 transition shrink-0 disabled:opacity-50 cursor-pointer"
              >
                {isResolving && selectedStrategy === 'keep_cloud' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Cloud className="w-3.5 h-3.5" />
                )}
                <span>{isZh ? '保留雲端' : 'Keep Cloud'}</span>
              </button>
            </div>

            <div className="pl-12 grid grid-cols-4 gap-2 text-[11px] text-slate-600 dark:text-slate-300 font-mono tabular-nums">
              <div>
                <span className="block text-[10px] font-sans text-slate-400">景點</span>
                <strong className="text-slate-900 dark:text-white">{cloudSummary.spotCount}</strong>
              </div>
              <div>
                <span className="block text-[10px] font-sans text-slate-400">待辦</span>
                <strong className="text-slate-900 dark:text-white">{cloudSummary.todoCount}</strong>
              </div>
              <div>
                <span className="block text-[10px] font-sans text-slate-400">行李</span>
                <strong className="text-slate-900 dark:text-white">{cloudSummary.packingCount}</strong>
              </div>
              <div>
                <span className="block text-[10px] font-sans text-slate-400">記帳</span>
                <strong className="text-slate-900 dark:text-white">{cloudSummary.expenseCount}</strong>
              </div>
            </div>
          </div>
        </IosInsetGroup>

        {/* Detailed Diff Disclosure */}
        <IosInsetGroup>
          <IosDisclosureRow
            icon={<FileText className="w-4 h-4 text-slate-500" />}
            label={isZh ? '檢視兩版本詳細差異' : 'View Detailed Differences'}
            expanded={showDetailedDiff}
            onToggle={() => setShowDetailedDiff((v) => !v)}
          >
            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 pb-2 border-b border-[#E5E2DC]/75 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <span>本機版本</span>
                <span>雲端版本</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <span className="text-slate-400 block text-[10px]">標題</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{currentConflict.localTrip.title}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">標題</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{currentConflict.cloudTrip.title}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px] font-mono tabular-nums">
                <div>
                  <span className="text-slate-400 block text-[10px] font-sans">日期範圍</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {currentConflict.localTrip.days.length} 天 ({currentConflict.localTrip.startDate} ~ {currentConflict.localTrip.endDate})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-sans">日期範圍</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {currentConflict.cloudTrip.days.length} 天 ({currentConflict.cloudTrip.startDate} ~ {currentConflict.cloudTrip.endDate})
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <span className="text-slate-400 block text-[10px]">備忘筆記</span>
                  <span className="text-slate-600 dark:text-slate-300 truncate block">
                    {currentConflict.localTrip.notes || '(無)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">備忘筆記</span>
                  <span className="text-slate-600 dark:text-slate-300 truncate block">
                    {currentConflict.cloudTrip.notes || '(無)'}
                  </span>
                </div>
              </div>
            </div>
          </IosDisclosureRow>
        </IosInsetGroup>
      </div>
    </IosModalSheet>
  );
};
