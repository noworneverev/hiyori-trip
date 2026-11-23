import React, { useMemo } from 'react';
import { Trip } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { getTodayLocal, normalizeDateKey } from '../../utils/date';
import {
  CalendarClock,
  Sparkles,
  CheckCircle2,
  Camera,
  Wallet,
  Route,
  X,
  ArrowRight,
} from 'lucide-react';

export type TripPhase = 'pre' | 'during' | 'post';

interface TripPhaseBannerProps {
  trip: Trip;
  lang: Language;
  activeTab: 'timeline' | 'live' | 'expenses' | 'prep' | 'memories';
  onSwitchTab: (tab: 'timeline' | 'live' | 'expenses' | 'prep' | 'memories') => void;
  onJumpToDay?: (dayNumber: number) => void;
  onDismiss?: () => void;
}

function diffIsoDays(fromIso: string, toIso: string): number {
  const [y1, m1, d1] = fromIso.split('-').map(Number);
  const [y2, m2, d2] = toIso.split('-').map(Number);
  const utc1 = Date.UTC(y1, (m1 || 1) - 1, d1 || 1);
  const utc2 = Date.UTC(y2, (m2 || 1) - 1, d2 || 1);
  return Math.round((utc2 - utc1) / (1000 * 60 * 60 * 24));
}

export const TripPhaseBanner: React.FC<TripPhaseBannerProps> = ({
  trip,
  lang,
  activeTab,
  onSwitchTab,
  onJumpToDay,
  onDismiss,
}) => {
  const isZh = lang === 'zh' || lang === 'zh-CN';

  const phaseInfo = useMemo(() => {
    const startIso = normalizeDateKey(trip.startDate);
    const endIso = normalizeDateKey(trip.endDate || trip.startDate);
    if (!startIso || !endIso) return null;

    const todayIso = getTodayLocal();
    const pendingTodos = (trip.todos || []).filter((td) => !td.completed).length;
    const totalMemories = (trip.memories || []).length;
    const totalExpenses = (trip.expenses || []).length;

    if (todayIso < startIso) {
      const daysUntil = diffIsoDays(todayIso, startIso);
      return {
        phase: 'pre' as TripPhase,
        daysUntil,
        pendingTodos,
        totalMemories,
        totalExpenses,
      };
    }

    if (todayIso >= startIso && todayIso <= endIso) {
      const matchedDay = (trip.days || []).find((d) => normalizeDateKey(d.date) === todayIso);
      const currentDayNumber = matchedDay?.dayNumber || Math.max(1, diffIsoDays(startIso, todayIso) + 1);
      return {
        phase: 'during' as TripPhase,
        currentDayNumber,
        totalDays: Math.max(trip.days?.length || 1, currentDayNumber),
        pendingTodos,
        totalMemories,
        totalExpenses,
      };
    }

    return {
      phase: 'post' as TripPhase,
      daysAgo: diffIsoDays(endIso, todayIso),
      pendingTodos,
      totalMemories,
      totalExpenses,
    };
  }, [trip.startDate, trip.endDate, trip.days, trip.todos, trip.memories, trip.expenses]);

  if (!phaseInfo) return null;

  return (
    <div className="rounded-2xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 px-3.5 py-2.5 shadow-2xs flex items-center justify-between gap-2.5 animate-in fade-in duration-150">
      {/* Left Context Message */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {phaseInfo.phase === 'pre' && (
          <>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <CalendarClock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {phaseInfo.daysUntil === 1
                  ? isZh
                    ? '明天就要出發囉！'
                    : 'Departing tomorrow!'
                  : isZh
                  ? `距離出發還有 ${phaseInfo.daysUntil} 天`
                  : `${phaseInfo.daysUntil} days until departure`}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {phaseInfo.pendingTodos > 0
                  ? isZh
                    ? `尚有 ${phaseInfo.pendingTodos} 項待辦未完成`
                    : `${phaseInfo.pendingTodos} prep items left`
                  : isZh
                  ? '行前待辦已全部完成，隨時準備起飛'
                  : 'All prep items ready'}
              </div>
            </div>
          </>
        )}

        {phaseInfo.phase === 'during' && (
          <>
            <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0 relative">
              <Sparkles className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-teal-500 animate-ping" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-teal-600" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                <span>
                  {isZh
                    ? `旅途中 · Day ${phaseInfo.currentDayNumber} / ${phaseInfo.totalDays}`
                    : `In Progress · Day ${phaseInfo.currentDayNumber}/${phaseInfo.totalDays}`}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {isZh ? '已為您鎖定今日行程與隨行狀態' : 'Focused on today’s schedule & live companion'}
              </div>
            </div>
          </>
        )}

        {phaseInfo.phase === 'post' && (
          <>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {isZh ? '旅程圓滿完成' : 'Trip Completed'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                {isZh
                  ? `${phaseInfo.totalExpenses} 筆消費紀錄 · ${phaseInfo.totalMemories} 張相片回憶`
                  : `${phaseInfo.totalExpenses} expenses · ${phaseInfo.totalMemories} photos`}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right Contextual Quick Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {phaseInfo.phase === 'pre' && activeTab !== 'prep' && (
          <button
            type="button"
            onClick={() => onSwitchTab('prep')}
            className="min-h-[34px] px-2.5 py-1 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 text-white text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer"
          >
            <span>{isZh ? '待辦' : 'To-Do'}</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        )}

        {phaseInfo.phase === 'during' && (
          <>
            {activeTab !== 'live' ? (
              <button
                type="button"
                onClick={() => onSwitchTab('live')}
                className="min-h-[34px] px-2.5 py-1 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 text-white text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                <span>{isZh ? '隨行模式' : 'Live'}</span>
              </button>
            ) : (
              onJumpToDay && (
                <button
                  type="button"
                  onClick={() => onJumpToDay(phaseInfo.currentDayNumber!)}
                  className="min-h-[34px] px-2.5 py-1 rounded-xl bg-teal-50 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 border border-teal-200/80 dark:border-teal-800 text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer"
                >
                  <Route className="w-3 h-3" />
                  <span>{isZh ? '今日行程' : 'Today'}</span>
                </button>
              )
            )}
          </>
        )}

        {phaseInfo.phase === 'post' && (
          <>
            {activeTab !== 'expenses' && (
              <button
                type="button"
                onClick={() => onSwitchTab('expenses')}
                className="min-h-[34px] px-2.5 py-1 rounded-xl bg-[#FAF9F6] dark:bg-slate-800 hover:bg-teal-50 dark:hover:bg-teal-950/50 border border-[#E5E2DC] dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer"
              >
                <Wallet className="w-3 h-3 text-teal-700 dark:text-teal-400" />
                <span>{isZh ? '結算' : 'Settle'}</span>
              </button>
            )}
            {activeTab !== 'memories' && (
              <button
                type="button"
                onClick={() => onSwitchTab('memories')}
                className="min-h-[34px] px-2.5 py-1 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 text-white text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer"
              >
                <Camera className="w-3 h-3" />
                <span>{isZh ? '回憶' : 'Memories'}</span>
              </button>
            )}
          </>
        )}

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            aria-label={isZh ? '隱藏階段提示' : 'Dismiss banner'}
            title={isZh ? '收合提示' : 'Dismiss'}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
