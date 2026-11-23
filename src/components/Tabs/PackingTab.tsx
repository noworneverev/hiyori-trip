import React, { useMemo, useState } from 'react';
import { Trip, TodoItem, StickyNoteItem } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { copyTextToClipboard } from '../../utils/clipboard';
import { CheckSquare, Sparkles, Bookmark, Plus, Copy, Check, Trash2 } from 'lucide-react';
import { RemindersTodoList } from '../Todos/RemindersTodoList';

interface PackingTabProps {
  trip: Trip;
  lang: Language;
  canEdit?: boolean;
  onUpdateTrip: (updatedTrip: Trip) => void;
  requireAuth?: (action: () => void, reason?: string) => boolean;
}

const DEFAULT_TODOS: Array<Omit<TodoItem, 'id'>> = [
  {
    title: '確認護照效期大於 6 個月並備妥數位電子截圖',
    category: 'preparation',
    completed: false,
    essential: true,
  },
  {
    title: '填寫入境審查與海關通關申報 (如 Visit Japan Web / 入境卡)',
    category: 'preparation',
    completed: false,
    essential: true,
  },
  {
    title: '開通海外刷卡與跨國提款功能',
    category: 'finance',
    completed: false,
    essential: true,
  },
  {
    title: '確認抵達目的地之上網卡 / eSIM 或漫遊方案',
    category: 'preparation',
    completed: false,
    essential: true,
  },
  {
    title: '投保海外旅平險與不便險並保存保單編號',
    category: 'booking',
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
  const stickyNotes = trip.stickyNotes || [];

  const [quickNoteText, setQuickNoteText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const completedTodos = useMemo(() => todos.filter((t) => t.completed), [todos]);
  const progressPercent =
    todos.length > 0 ? Math.round((completedTodos.length / todos.length) * 100) : 0;

  const hasMissingDefaults = useMemo(() => {
    const existing = new Set(todos.map((t) => t.title));
    return DEFAULT_TODOS.some((d) => !existing.has(d.title));
  }, [todos]);

  const handleLoadRecommendedTodos = () => {
    if (!canEdit) return;
    if (
      requireAuth &&
      !requireAuth(handleLoadRecommendedTodos, isZh ? '載入建議清單' : 'Load default checklist')
    ) {
      return;
    }
    const existing = new Set(todos.map((t) => t.title));
    const additions: TodoItem[] = DEFAULT_TODOS.filter((t) => !existing.has(t.title)).map((t, idx) => ({
      ...t,
      id: `todo-rec-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
    }));
    if (additions.length === 0) return;
    onUpdateTrip({ ...trip, todos: [...todos, ...additions], updatedAt: Date.now() });
  };

  const handleAddQuickNote = (e: React.FormEvent) => {
    e.preventDefault();
    const content = quickNoteText.trim();
    if (!canEdit || !content) return;
    const newNote: StickyNoteItem = {
      id: `sticky-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category: 'other',
      label: isZh ? '隨手速記' : 'Quick Note',
      content,
      createdAt: Date.now(),
    };
    onUpdateTrip({
      ...trip,
      stickyNotes: [newNote, ...stickyNotes],
      updatedAt: Date.now(),
    });
    setQuickNoteText('');
  };

  const handleDeleteQuickNote = (id: string) => {
    if (!canEdit) return;
    onUpdateTrip({
      ...trip,
      stickyNotes: stickyNotes.filter((n) => n.id !== id),
      deletedItemIds: {
        ...(trip.deletedItemIds || {}),
        [id]: Date.now(),
      },
      updatedAt: Date.now(),
    });
  };

  const handleCopyQuickNote = async (text: string, id: string) => {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    }
  };

  return (
    <div className="relative pb-20 max-w-3xl mx-auto space-y-4">
      {/* 1. Native iPhone Reminders-style To-Do Checklist */}
      <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-[#E5E2DC] dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center shrink-0">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-tight">
                {isZh ? '行前待辦清單' : 'To-Do Checklist'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                {completedTodos.length} / {todos.length} {isZh ? '已完成' : 'Done'} · {progressPercent}%
              </p>
            </div>
          </div>

          {canEdit && hasMissingDefaults && (
            <button
              type="button"
              onClick={handleLoadRecommendedTodos}
              className="min-h-[40px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
              <span>{isZh ? '載入常用範本' : 'Load Defaults'}</span>
            </button>
          )}
        </div>

        {todos.length > 0 && (
          <div className="w-full bg-[#FAF9F6] dark:bg-slate-900 h-1 overflow-hidden">
            <div
              className="bg-teal-700 dark:bg-teal-500 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        <RemindersTodoList
          trip={trip}
          lang={lang}
          canEdit={canEdit}
          onUpdateTrip={onUpdateTrip}
          requireAuth={requireAuth}
        />
      </div>

      {/* 2. Lightweight Quick Scratchpad Notes (independent from Trip Overview in 編輯旅程) */}
      <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-[#E5E2DC] dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Bookmark className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-tight">
                {isZh ? '隨手速記' : 'Quick Notes'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isZh ? '隨時記下置物櫃編號、門禁密碼、車次或備忘事項' : 'Jot down locker codes, door PINs, or quick reminders'}
              </p>
            </div>
          </div>
          {stickyNotes.length > 0 && (
            <span className="text-[11px] font-mono tabular-nums font-bold text-slate-400 shrink-0">
              {stickyNotes.length} 則
            </span>
          )}
        </div>

        <div className="p-4 sm:p-5 space-y-3">
          {canEdit && (
            <form onSubmit={handleAddQuickNote} className="flex items-center gap-2">
              <input
                type="text"
                value={quickNoteText}
                onChange={(e) => setQuickNoteText(e.target.value)}
                placeholder={isZh ? '隨手記一筆（如：飯店密碼 7789、7車 14A...）' : 'Add a quick note...'}
                className="flex-1 min-w-0 min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl bg-[#FAF9F6] dark:bg-slate-900/70 border border-[#E5E2DC] dark:border-slate-700 text-[16px] sm:text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-teal-600"
              />
              <button
                type="submit"
                disabled={!quickNoteText.trim()}
                className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1 shrink-0 transition active:scale-95 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isZh ? '記下' : 'Add'}</span>
              </button>
            </form>
          )}

          {stickyNotes.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-3">
              {isZh ? '尚無隨手速記，輸入上方欄位即可快速記下' : 'No quick notes yet'}
            </p>
          ) : (
            <div className="divide-y divide-[#E5E2DC]/70 dark:divide-slate-800 rounded-2xl border border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6]/60 dark:bg-slate-900/40 overflow-hidden">
              {stickyNotes.map((note) => (
                <div
                  key={note.id}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    {note.label && note.label !== '隨手速記' && note.label !== 'Quick Note' && (
                      <span className="text-[10px] font-bold text-teal-700 dark:text-teal-400 block">
                        {note.label}
                      </span>
                    )}
                    <p className="text-slate-800 dark:text-slate-100 font-medium break-words whitespace-pre-wrap leading-relaxed">
                      {note.content}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyQuickNote(note.content, note.id)}
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer"
                      title="複製"
                      aria-label="複製"
                    >
                      {copiedId === note.id ? (
                        <Check className="w-3.5 h-3.5 text-teal-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleDeleteQuickNote(note.id)}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                        title="刪除"
                        aria-label="刪除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
