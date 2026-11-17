import React, { useMemo } from 'react';
import { Trip, TodoItem } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { CheckSquare, Sparkles } from 'lucide-react';
import { RemindersTodoList } from '../Todos/RemindersTodoList';

interface PackingTabProps {
  trip: Trip;
  lang: Language;
  canEdit?: boolean;
  onUpdateTrip: (updatedTrip: Trip) => void;
  requireAuth?: (action: () => void, reason?: string) => boolean;
}

const DEFAULT_TODOS: TodoItem[] = [
  {
    id: 'todo-def-1',
    title: '確認護照效期大於 6 個月並備妥數位電子截圖',
    category: 'preparation',
    completed: false,
    essential: true,
  },
  {
    id: 'todo-def-2',
    title: '填寫入境審查與海關通關申報 (例如 Visit Japan Web)',
    category: 'preparation',
    completed: false,
    essential: true,
  },
  {
    id: 'todo-def-3',
    title: '開通海外刷卡與跨國提款功能',
    category: 'finance',
    completed: false,
    essential: true,
  },
  {
    id: 'todo-def-4',
    title: '確認抵達目的地之上網卡或漫遊方案',
    category: 'preparation',
    completed: false,
    essential: true,
  },
];

export const PackingTab: React.FC<PackingTabProps> = ({
  trip,
  lang,
  canEdit = true,
  onUpdateTrip,
  requireAuth,
}) => {
  const isZh = lang === 'zh' || lang === 'zh-CN';
  const todos = trip.todos || [];

  const completedTodos = useMemo(() => todos.filter((t) => t.completed), [todos]);
  const progressPercent =
    todos.length > 0 ? Math.round((completedTodos.length / todos.length) * 100) : 0;

  const handleLoadRecommendedTodos = () => {
    if (!canEdit) return;
    if (
      requireAuth &&
      !requireAuth(handleLoadRecommendedTodos, isZh ? '載入建議清單' : 'Load default checklist')
    ) {
      return;
    }
    const existing = new Set(todos.map((t) => t.title));
    const additions = DEFAULT_TODOS.filter((t) => !existing.has(t.title)).map((t, idx) => ({
      ...t,
      id: `todo-rec-${Date.now()}-${idx}`,
    }));
    if (additions.length === 0) return;
    onUpdateTrip({ ...trip, todos: [...todos, ...additions], updatedAt: Date.now() });
  };

  return (
    <div className="relative pb-24 max-w-3xl mx-auto">
      <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 shadow-2xs overflow-hidden">
        {/* Clean Header Bar */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-[#E5E2DC] dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center shrink-0">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-tight">
                {isZh ? '待辦清單' : 'To-Do Checklist'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                {completedTodos.length} / {todos.length} {isZh ? '已完成' : 'Done'} · {progressPercent}%
              </p>
            </div>
          </div>

          {canEdit && todos.length === 0 && (
            <button
              type="button"
              onClick={handleLoadRecommendedTodos}
              className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
              <span>{isZh ? '載入常用範本' : 'Load Defaults'}</span>
            </button>
          )}
        </div>

        {/* Hairline Progress Bar */}
        {todos.length > 0 && (
          <div className="w-full bg-[#FAF9F6] dark:bg-slate-900 h-1 overflow-hidden">
            <div
              className="bg-teal-700 dark:bg-teal-500 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Native iPhone Reminders-style Interactive Checklist */}
        <RemindersTodoList
          trip={trip}
          lang={lang}
          canEdit={canEdit}
          onUpdateTrip={onUpdateTrip}
          requireAuth={requireAuth}
        />
      </div>
    </div>
  );
};
