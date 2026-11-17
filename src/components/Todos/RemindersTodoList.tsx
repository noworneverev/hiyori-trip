import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Check,
  Info,
  Calendar,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { Trip, TodoItem } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { getTodayLocal } from '../../utils/date';
import { SwipeableActionRow } from '../UI/SwipeableExpenseRow';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

interface RemindersTodoListProps {
  trip: Trip;
  lang: Language;
  canEdit: boolean;
  onUpdateTrip: (updatedTrip: Trip) => void;
  requireAuth?: (action: () => void, reason?: string) => boolean;
  onShowToast?: (msg: string) => void;
  compact?: boolean;
}

interface AutoGrowTitleInputProps {
  value: string;
  disabled?: boolean;
  completed?: boolean;
  placeholder?: string;
  onFocusRow?: () => void;
  onCommit: (nextTitle: string) => void;
}

export const AutoGrowTitleInput: React.FC<AutoGrowTitleInputProps> = ({
  value,
  disabled = false,
  completed = false,
  placeholder = '提醒事項...',
  onFocusRow,
  onCommit,
}) => {
  const [draft, setDraft] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isFocused) {
      setDraft(value);
    }
  }, [value, isFocused]);

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    resize();
  }, [draft]);

  useEffect(() => {
    const handleResize = () => resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (disabled) {
    return (
      <div
        className={`w-full text-base sm:text-[15px] leading-snug break-words py-0.5 ${
          completed
            ? 'line-through text-slate-400 dark:text-slate-500'
            : 'text-slate-900 dark:text-slate-100'
        }`}
      >
        {value}
      </div>
    );
  }

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      value={draft}
      placeholder={placeholder}
      enterKeyHint="done"
      onFocus={() => {
        setIsFocused(true);
        onFocusRow?.();
      }}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      onBlur={() => {
        setIsFocused(false);
        const trimmed = draft.trim();
        if (!trimmed) {
          setDraft(value);
          return;
        }
        if (trimmed !== value) {
          onCommit(trimmed);
        } else {
          setDraft(value);
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className={`w-full bg-transparent border-0 p-0 m-0 text-base sm:text-[15px] leading-snug resize-none overflow-hidden focus:outline-hidden focus:ring-0 placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
        completed
          ? 'line-through text-slate-400 dark:text-slate-500'
          : 'text-slate-900 dark:text-slate-100 font-normal'
      }`}
    />
  );
};

export const RemindersTodoList: React.FC<RemindersTodoListProps> = ({
  trip,
  lang,
  canEdit,
  onUpdateTrip,
  requireAuth,
  onShowToast,
  compact = false,
}) => {
  const todos = trip.todos || [];
  const pendingTodos = todos.filter((t) => !t.completed);
  const completedTodos = todos.filter((t) => t.completed);

  const [newTitle, setNewTitle] = useState('');
  const [focusedTodoId, setFocusedTodoId] = useState<string | null>(null);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  // iOS Reminders "(i)" Details Sheet State
  const [detailTodo, setDetailTodo] = useState<TodoItem | null>(null);
  const [detailTitle, setDetailTitle] = useState('');
  const [detailNotes, setDetailNotes] = useState('');
  const [detailHasDate, setDetailHasDate] = useState(false);
  const [detailDueDate, setDetailDueDate] = useState('');

  const newInputRef = useRef<HTMLInputElement | null>(null);
  const isZh = lang === 'zh' || lang === 'zh-CN';

  useBodyScrollLock(Boolean(detailTodo));

  useEffect(() => {
    if (!detailTodo) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDetailTodo(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detailTodo]);

  const handleToggleTodo = (id: string) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleToggleTodo(id), isZh ? '勾選待辦事項' : 'Toggle reminder')) {
      return;
    }
    const updated = todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
    onUpdateTrip({ ...trip, todos: updated, updatedAt: Date.now() });
    if (focusedTodoId === id) setFocusedTodoId(null);
  };

  const handleCommitInlineTitle = (id: string, nextTitle: string) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleCommitInlineTitle(id, nextTitle), isZh ? '編輯待辦事項' : 'Edit reminder')) {
      return;
    }
    const updated = todos.map((t) => (t.id === id ? { ...t, title: nextTitle } : t));
    onUpdateTrip({ ...trip, todos: updated, updatedAt: Date.now() });
  };

  const handleDeleteTodo = (id: string) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleDeleteTodo(id), isZh ? '刪除待辦事項' : 'Delete reminder')) {
      return;
    }
    const updated = todos.filter((t) => t.id !== id);
    onUpdateTrip({
      ...trip,
      todos: updated,
      deletedItemIds: { ...(trip.deletedItemIds || {}), [id]: Date.now() },
      updatedAt: Date.now(),
    });
    if (detailTodo?.id === id) setDetailTodo(null);
    if (focusedTodoId === id) setFocusedTodoId(null);
  };

  const handleClearCompleted = () => {
    if (!canEdit || completedTodos.length === 0) return;
    if (requireAuth && !requireAuth(handleClearCompleted, isZh ? '清除已完成待辦' : 'Clear completed')) {
      return;
    }
    const now = Date.now();
    const deletedMap = { ...(trip.deletedItemIds || {}) };
    completedTodos.forEach((t) => {
      deletedMap[t.id] = now;
    });
    onUpdateTrip({
      ...trip,
      todos: pendingTodos,
      deletedItemIds: deletedMap,
      updatedAt: now,
    });
    onShowToast?.(isZh ? '已清除所有已完成項目' : 'Cleared completed reminders');
  };

  const commitNewReminder = (keepFocus: boolean) => {
    if (!canEdit) return;
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    if (requireAuth && !requireAuth(() => commitNewReminder(false), isZh ? '新增待辦事項' : 'Add reminder')) {
      return;
    }

    const newTodo: TodoItem = {
      id: `todo-${Date.now()}`,
      title: trimmed,
      category: 'other',
      completed: false,
    };
    onUpdateTrip({
      ...trip,
      todos: [newTodo, ...todos],
      updatedAt: Date.now(),
    });
    setNewTitle('');
    if (keepFocus) {
      requestAnimationFrame(() => {
        newInputRef.current?.focus({ preventScroll: true });
      });
    }
  };

  const openDetailsSheet = (todo: TodoItem) => {
    if (!canEdit) return;
    setOpenSwipeId(null);
    setDetailTodo(todo);
    setDetailTitle(todo.title);
    setDetailNotes(todo.notes || '');
    setDetailHasDate(Boolean(todo.dueDate));
    setDetailDueDate(todo.dueDate || getTodayLocal());
  };

  const handleSaveDetails = () => {
    if (!canEdit || !detailTodo) return;
    const trimmedTitle = detailTitle.trim() || detailTodo.title;
    const doSave = () => {
      const updated = todos.map((t) =>
        t.id === detailTodo.id
          ? {
              ...t,
              title: trimmedTitle,
              notes: detailNotes.trim() || undefined,
              dueDate: detailHasDate && detailDueDate ? detailDueDate : undefined,
            }
          : t
      );
      onUpdateTrip({ ...trip, todos: updated, updatedAt: Date.now() });
      setDetailTodo(null);
    };
    if (requireAuth && !requireAuth(doSave, isZh ? '更新待辦詳情' : 'Update reminder details')) {
      return;
    }
    doSave();
  };

  const todayStr = getTodayLocal();
  const getTomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const renderReminderRow = (todo: TodoItem, allowSwipe: boolean) => {
    const isFocused = focusedTodoId === todo.id;

    const rowInner = (
      <div
        className={`flex items-start gap-1.5 ${
          compact ? 'px-3 py-2.5' : 'px-3.5 sm:px-5 py-3'
        } transition-colors ${
          isFocused
            ? 'bg-teal-50/35 dark:bg-teal-950/20'
            : 'md:hover:bg-[#FAF9F6] md:dark:hover:bg-slate-900/40'
        }`}
      >
        {/* Left Circular Reminder Checkbox (44px touch target) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleToggleTodo(todo.id);
          }}
          className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] -ml-2 -mt-1.5 flex items-center justify-center rounded-full shrink-0 cursor-pointer group/chk"
          aria-label={todo.completed ? '恢復為未完成' : '標記完成'}
        >
          <span
            className={`w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center transition-all ${
              todo.completed
                ? 'bg-teal-700 dark:bg-teal-500 border-teal-700 dark:border-teal-500 text-white'
                : 'border-slate-300 dark:border-slate-600 group-hover/chk:border-teal-600 dark:group-hover/chk:border-teal-400'
            }`}
          >
            {todo.completed && <Check className="w-3.5 h-3.5 stroke-[2.75]" />}
          </span>
        </button>

        {/* Middle Seamless In-Place Editable Title + Quiet Subtitle */}
        <div className="flex-1 min-w-0 pt-0.5">
          <AutoGrowTitleInput
            value={todo.title}
            disabled={!canEdit}
            completed={todo.completed}
            onFocusRow={() => {
              setOpenSwipeId(null);
              setFocusedTodoId(todo.id);
            }}
            onCommit={(nextTitle) => {
              setFocusedTodoId((prev) => (prev === todo.id ? null : prev));
              handleCommitInlineTitle(todo.id, nextTitle);
            }}
          />

          {(todo.notes || todo.dueDate) && (
            <button
              type="button"
              onClick={() => canEdit && openDetailsSheet(todo)}
              className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-left text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition cursor-pointer"
            >
              {todo.notes && (
                <span className="line-clamp-1 max-w-full">{todo.notes}</span>
              )}
              {todo.dueDate && (
                <span
                  className={`inline-flex items-center gap-1 font-mono tabular-nums ${
                    !todo.completed && todo.dueDate < todayStr
                      ? 'text-rose-500 dark:text-rose-400 font-semibold'
                      : ''
                  }`}
                >
                  <Calendar className="w-3 h-3" />
                  <span>{todo.dueDate}</span>
                </span>
              )}
            </button>
          )}
        </div>

        {/* Right iPhone-style (i) Details Button */}
        {canEdit && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              openDetailsSheet(todo);
            }}
            className={`min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] -mr-2 -mt-1.5 flex items-center justify-center rounded-full transition cursor-pointer shrink-0 ${
              isFocused
                ? 'text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 opacity-100'
                : 'text-slate-400 dark:text-slate-500 hover:text-teal-700 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 opacity-65 sm:opacity-45 hover:opacity-100'
            }`}
            title={isZh ? '詳細資訊' : 'Details'}
            aria-label={isZh ? '詳細資訊' : 'Reminder details'}
          >
            <Info className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>
    );

    if (allowSwipe && canEdit) {
      return (
        <SwipeableActionRow
          key={todo.id}
          id={todo.id}
          isOpen={openSwipeId === todo.id}
          canEdit={canEdit}
          onOpenChange={setOpenSwipeId}
          onDelete={() => handleDeleteTodo(todo.id)}
          containerClassName="bg-white dark:bg-[#111827]"
        >
          {rowInner}
        </SwipeableActionRow>
      );
    }

    return <div key={todo.id}>{rowInner}</div>;
  };

  return (
    <div className="flex flex-col">
      {/* Borderless iOS Reminders Quick-Add Row */}
      {canEdit && (
        <div
          className={`flex items-center gap-1.5 ${
            compact ? 'px-3 py-2' : 'px-3.5 sm:px-5 py-2.5'
          } border-b border-[#E5E2DC]/80 dark:border-slate-800 bg-[#FAF9F6]/60 dark:bg-slate-900/30`}
        >
          <div className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] -ml-2 flex items-center justify-center shrink-0">
            <span className="w-[22px] h-[22px] rounded-full bg-teal-700 dark:bg-teal-600 text-white flex items-center justify-center shadow-2xs">
              <Plus className="w-3.5 h-3.5 stroke-[2.75]" />
            </span>
          </div>
          <input
            ref={newInputRef}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                commitNewReminder(true);
              }
            }}
            onBlur={() => commitNewReminder(false)}
            enterKeyHint="done"
            placeholder={isZh ? '新增提醒事項...' : 'New Reminder...'}
            aria-label={isZh ? '新增提醒事項' : 'New reminder'}
            className="flex-1 min-h-[44px] sm:min-h-[36px] bg-transparent border-0 p-0 text-base sm:text-[15px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-0"
          />
          {newTitle.trim() && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commitNewReminder(true)}
              className="min-h-[36px] px-3 rounded-xl text-xs font-bold text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/50 transition cursor-pointer shrink-0"
            >
              {isZh ? '加入' : 'Add'}
            </button>
          )}
        </div>
      )}

      {/* Pending Reminders List */}
      {pendingTodos.length === 0 ? (
        <div className={compact ? 'py-10 text-center px-4' : 'py-14 text-center px-4'}>
          <div className="w-11 h-11 rounded-full bg-teal-50 dark:bg-slate-800 text-teal-700 dark:text-teal-400 flex items-center justify-center mx-auto mb-3">
            <Check className="w-5 h-5 stroke-[2.5]" />
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {todos.length === 0
              ? isZh ? '尚無提醒事項' : 'No Reminders'
              : isZh ? '全部項目已完成' : 'All Completed'}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {isZh ? '點選文字即可直接編輯，右側 (i) 可設定日期與備註' : 'Tap text to edit inline, tap (i) for date & notes'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[#E5E2DC]/70 dark:divide-slate-800/80">
          {pendingTodos.map((todo) => renderReminderRow(todo, true))}
        </div>
      )}

      {/* Collapsible Completed Section */}
      {completedTodos.length > 0 && (
        <div className="border-t border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6]/70 dark:bg-slate-900/40">
          <div className="px-4 sm:px-5 min-h-[44px] flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowCompleted((v) => !v)}
              className="flex items-center gap-1.5 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer select-none"
            >
              {showCompleted ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span className="tabular-nums">
                {isZh ? `已完成 (${completedTodos.length})` : `Completed (${completedTodos.length})`}
              </span>
            </button>

            {showCompleted && canEdit && (
              <button
                type="button"
                onClick={handleClearCompleted}
                className="min-h-[36px] px-2 text-xs font-semibold text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
              >
                {isZh ? '清除全部' : 'Clear'}
              </button>
            )}
          </div>

          {showCompleted && (
            <div className="divide-y divide-[#E5E2DC]/60 dark:divide-slate-800/60 border-t border-[#E5E2DC]/60 dark:border-slate-800/60 opacity-75">
              {completedTodos.map((todo) => renderReminderRow(todo, false))}
            </div>
          )}
        </div>
      )}

      {/* iPhone Reminders-style "(i)" Details Sheet Modal (Portaled & Scroll-Locked) */}
      {detailTodo &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-80 flex items-end sm:items-center justify-center pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:p-4 bg-black/55 backdrop-blur-xs touch-none overscroll-none animate-in fade-in duration-150"
            onClick={() => setDetailTodo(null)}
            role="dialog"
            aria-modal="true"
            aria-label={isZh ? '詳細資訊' : 'Details'}
          >
            <div
              className="w-full sm:max-w-md rounded-t-[24px] sm:rounded-3xl bg-[#F2F2F7] dark:bg-[#1C1C1E] border-t sm:border border-[#E5E2DC] dark:border-slate-800 shadow-2xl max-h-full sm:max-h-[85dvh] pb-[env(safe-area-inset-bottom,0px)] sm:pb-0 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* iOS Navigation Bar Header */}
              <div className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-[#2C2C2E]/90 backdrop-blur-md flex items-center justify-between shrink-0 touch-none">
                <button
                  type="button"
                  onClick={() => setDetailTodo(null)}
                  className="min-h-[44px] sm:min-h-[36px] px-2 text-base sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  {isZh ? '取消' : 'Cancel'}
                </button>
                <h4 className="font-bold text-base text-slate-900 dark:text-white">
                  {isZh ? '詳細資訊' : 'Details'}
                </h4>
                <button
                  type="button"
                  onClick={handleSaveDetails}
                  className="min-h-[44px] sm:min-h-[36px] px-2 text-base sm:text-sm font-bold text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 cursor-pointer"
                >
                  {isZh ? '完成' : 'Done'}
                </button>
              </div>

              {/* iOS Inset Grouped Sections */}
              <div className="p-4 space-y-4 overflow-y-auto overscroll-contain touch-pan-y flex-1">
              {/* Group 1: Title & Notes */}
              <div className="rounded-2xl bg-white dark:bg-[#2C2C2E] divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden shadow-2xs">
                <div className="px-4 py-2.5">
                  <input
                    type="text"
                    value={detailTitle}
                    onChange={(e) => setDetailTitle(e.target.value)}
                    placeholder={isZh ? '標題' : 'Title'}
                    className="w-full min-h-[38px] bg-transparent text-base sm:text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                  />
                </div>
                <div className="px-4 py-2.5">
                  <textarea
                    rows={3}
                    value={detailNotes}
                    onChange={(e) => setDetailNotes(e.target.value)}
                    placeholder={isZh ? '備註' : 'Notes'}
                    className="w-full bg-transparent text-base sm:text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-hidden resize-none"
                  />
                </div>
              </div>

              {/* Group 2: Date Toggle + Date Picker */}
              <div className="rounded-2xl bg-white dark:bg-[#2C2C2E] divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden shadow-2xs">
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-base sm:text-sm font-medium text-slate-900 dark:text-white">
                        {isZh ? '日期' : 'Date'}
                      </div>
                      {detailHasDate && detailDueDate && (
                        <div className="text-xs font-mono tabular-nums text-teal-700 dark:text-teal-400">
                          {detailDueDate}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* iOS Switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={detailHasDate}
                    onClick={() => {
                      const next = !detailHasDate;
                      setDetailHasDate(next);
                      if (next && !detailDueDate) {
                        setDetailDueDate(todayStr);
                      }
                    }}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                      detailHasDate ? 'bg-teal-600 dark:bg-teal-500' : 'bg-slate-200 dark:bg-slate-600'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition duration-200 ${
                        detailHasDate ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {detailHasDate && (
                  <div className="px-4 py-3 space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailDueDate(todayStr)}
                        className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                          detailDueDate === todayStr
                            ? 'bg-teal-700 text-white border-teal-700'
                            : 'bg-[#FAF9F6] dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        今天
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailDueDate(getTomorrowStr())}
                        className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                          detailDueDate === getTomorrowStr()
                            ? 'bg-teal-700 text-white border-teal-700'
                            : 'bg-[#FAF9F6] dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        明天
                      </button>
                      {detailDueDate && (
                        <button
                          type="button"
                          onClick={() => {
                            setDetailHasDate(false);
                            setDetailDueDate('');
                          }}
                          className="min-h-[36px] px-2.5 ml-auto text-xs text-slate-400 hover:text-rose-500 flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>清除</span>
                        </button>
                      )}
                    </div>
                    <input
                      type="date"
                      value={detailDueDate}
                      onChange={(e) => setDetailDueDate(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#F2F2F7] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-sm font-mono tabular-nums text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                )}
              </div>

                {/* Group 3: Explicit Delete Row */}
                <div className="rounded-2xl bg-white dark:bg-[#2C2C2E] overflow-hidden shadow-2xs">
                  <button
                    type="button"
                    onClick={() => handleDeleteTodo(detailTodo.id)}
                    className="w-full min-h-[48px] px-4 py-3 text-rose-600 dark:text-rose-400 hover:bg-rose-50/70 dark:hover:bg-rose-950/30 font-semibold text-base sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{isZh ? '刪除提醒事項' : 'Delete Reminder'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
