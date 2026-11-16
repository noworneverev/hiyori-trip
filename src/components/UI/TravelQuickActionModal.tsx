import React, { useState, useEffect, useRef } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { Trip, ExpenseItem, TodoItem } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { getTodayLocal } from '../../utils/date';
import { compressImageFile, resolveMediaSrc, storeImageAsMediaRef, extractMediaId, isMediaRef } from '../../utils/image';
import { idbDeleteMedia } from '../../utils/indexedDb';
import { MediaImage } from './MediaImage';
import { SwipeableActionRow } from './SwipeableExpenseRow';
import { convertAmount, detectTripCurrency } from '../../utils/currency';
import {
  TiantianExpenseEditor,
  TiantianExpenseDraft,
} from '../Expenses/TiantianExpenseEditor';
import { resolveExpenseCategoryMeta } from '../Expenses/expenseMeta';
import {
  X,
  DollarSign,
  Plus,
  Trash2,
  Check,
  CheckSquare,
  Edit2,
  Calendar,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface TravelQuickActionModalProps {
  trip: Trip;
  lang: Language;
  canEdit?: boolean;
  onUpdateTrip: (updatedTrip: Trip) => void;
  onClose: () => void;
  initialTab?: 'expense' | 'todos';
  onShowToast?: (msg: string) => void;
}

export const getLocalTodayDate = getTodayLocal;

export const TravelQuickActionModal: React.FC<TravelQuickActionModalProps> = ({
  trip,
  lang,
  canEdit = true,
  onUpdateTrip,
  onClose,
  initialTab = 'expense',
  onShowToast,
}) => {
  useBodyScrollLock(true);
  const [activeTab, setActiveTab] = useState<'expense' | 'todos'>(initialTab);

  const defaultTripCurrency = trip.currency || detectTripCurrency(trip);
  const splitMembersList = React.useMemo(
    () => (trip.splitMembers && trip.splitMembers.length > 0 ? trip.splitMembers : ['我', '同行旅伴']),
    [trip.splitMembers]
  );

  // --- 1. Fast Expense Draft State (Tiantian Bookkeeping Layout) ---
  const [draft, setDraft] = useState<TiantianExpenseDraft>(() => ({
    date: getLocalTodayDate(),
    amount: '',
    currency: defaultTripCurrency,
    category: 'food',
    paymentMethod: 'cash',
    paidBy: '我',
    splitWith: splitMembersList,
    isPersonal: false,
    tags: [],
    receiptImages: [],
    title: '',
    notes: '',
  }));

  const [isCompressingReceipts, setIsCompressingReceipts] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [saveStatusToast, setSaveStatusToast] = useState<string | null>(null);
  const [focusTrigger, setFocusTrigger] = useState(0);

  // Track receipt media refs staged in current unsubmitted draft so cancel cleans up only unsaved refs
  const draftReceiptsRef = useRef<string[]>([]);
  const persistedReceiptsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    draftReceiptsRef.current = draft.receiptImages;
  }, [draft.receiptImages]);

  useEffect(() => {
    setDraft((prev) => ({
      ...prev,
      splitWith: splitMembersList,
    }));
  }, [splitMembersList]);

  useEffect(() => {
    setDraft((prev) => ({ ...prev, date: getLocalTodayDate() }));
  }, [initialTab]);

  const handleClose = () => {
    draftReceiptsRef.current.forEach((ref) => {
      if (isMediaRef(ref) && !persistedReceiptsRef.current.has(ref)) {
        const mid = extractMediaId(ref);
        if (mid) idbDeleteMedia(mid).catch(() => {});
      }
    });
    onClose();
  };

  const handleUploadReceipts = async (files: FileList) => {
    if (!canEdit) return;
    setReceiptError(null);
    const remainingSlots = Math.max(0, 5 - draft.receiptImages.length);
    if (remainingSlots <= 0) {
      setReceiptError('每筆支出最多附加 5 張發票收據');
      return;
    }

    setIsCompressingReceipts(true);
    try {
      const refsList: string[] = [];
      const countToProcess = Math.min(files.length, remainingSlots);
      for (let i = 0; i < countToProcess; i++) {
        const file = files[i];
        const compressed = await compressImageFile(file, 840, 0.68);
        const mediaRef = await storeImageAsMediaRef(trip.id, compressed);
        refsList.push(mediaRef);
      }
      setDraft((prev) => ({
        ...prev,
        receiptImages: [...prev.receiptImages, ...refsList].slice(0, 5),
      }));
      onShowToast?.(`已附加 ${refsList.length} 張收據照片`);
    } catch (err) {
      console.error('Failed to compress receipt images:', err);
      setReceiptError(err instanceof Error ? err.message : '收據上傳失敗，請確認格式後重試');
    } finally {
      setIsCompressingReceipts(false);
    }
  };

  const handleRemoveReceipt = (indexToRemove: number) => {
    const removed = draft.receiptImages[indexToRemove];
    if (removed && isMediaRef(removed) && !persistedReceiptsRef.current.has(removed)) {
      const mid = extractMediaId(removed);
      if (mid) idbDeleteMedia(mid).catch(() => {});
    }
    setDraft((prev) => ({
      ...prev,
      receiptImages: prev.receiptImages.filter((_, idx) => idx !== indexToRemove),
    }));
    setReceiptError(null);
  };

  const handleSaveQuickExpense = (continueAdding: boolean) => {
    if (!canEdit) {
      onShowToast?.('目前為僅檢視權限');
      return;
    }
    const parsedAmount = parseFloat(draft.amount);
    if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) return;

    const catMeta = resolveExpenseCategoryMeta(draft.category, trip);
    const isSplitMode = !trip.isSoloTrip && Boolean(trip.isSplitEnabled);
    const matchedDay = (trip.days || []).find((d) => d.date === draft.date);

    draft.receiptImages.forEach((ref) => persistedReceiptsRef.current.add(ref));

    const newExpense: ExpenseItem = {
      id: `exp-${Date.now()}`,
      title: draft.title.trim() || catMeta.label || '旅途支出',
      amount: parsedAmount,
      currency: draft.currency,
      category: draft.category,
      paymentMethod: draft.paymentMethod,
      date: draft.date,
      dayNumber: matchedDay ? matchedDay.dayNumber : undefined,
      convertedAmount: convertAmount(parsedAmount, draft.currency, trip.currency || 'TWD', trip.customExchangeRates),
      notes: draft.notes.trim() || undefined,
      tags: draft.tags.length > 0 ? draft.tags : undefined,
      receiptImages: draft.receiptImages.length > 0 ? draft.receiptImages : undefined,
      receiptImage: draft.receiptImages.length > 0 ? draft.receiptImages[0] : undefined,
      paidBy: isSplitMode ? (draft.paidBy || '我') : undefined,
      splitWith: isSplitMode && !draft.isPersonal
        ? (draft.splitWith.length > 0 ? draft.splitWith : splitMembersList)
        : undefined,
      isPersonal: !isSplitMode ? true : draft.isPersonal,
    };

    onUpdateTrip({
      ...trip,
      expenses: [newExpense, ...trip.expenses],
      updatedAt: Date.now(),
    });

    const summaryMsg = `已記帳：${draft.currency} ${parsedAmount.toLocaleString()} (${newExpense.title})`;
    onShowToast?.(summaryMsg);

    if (continueAdding) {
      setSaveStatusToast(`已儲存「${newExpense.title}」(${draft.currency} ${parsedAmount.toLocaleString()})，可繼續記下一筆`);
      setTimeout(() => setSaveStatusToast(null), 3200);
      setDraft((prev) => ({
        ...prev,
        amount: '',
        title: '',
        notes: '',
        receiptImages: [],
        tags: [],
      }));
      setFocusTrigger((v) => v + 1);
    } else {
      onClose();
    }
  };

  // --- 2. Synced Trip Todos States & Handlers (Simple Inline Add + Click Row to Edit) ---
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoDueDate, setNewTodoDueDate] = useState('');
  const [showTodoDatePicker, setShowTodoDatePicker] = useState(false);
  const [showCompletedTodos, setShowCompletedTodos] = useState(false);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editTodoTitle, setEditTodoTitle] = useState('');
  const [editTodoDueDate, setEditTodoDueDate] = useState('');
  const [openTodoSwipeId, setOpenTodoSwipeId] = useState<string | null>(null);

  const todos = trip.todos || [];
  const pendingTodos = todos.filter((t) => !t.completed);
  const completedTodos = todos.filter((t) => t.completed);

  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      onShowToast?.('目前為僅檢視權限');
      return;
    }
    const title = newTodoTitle.trim();
    if (!title) return;

    const newTodo: TodoItem = {
      id: `todo-${Date.now()}`,
      title,
      category: 'other',
      completed: false,
      dueDate: newTodoDueDate || undefined,
    };

    onUpdateTrip({
      ...trip,
      todos: [newTodo, ...todos],
      updatedAt: Date.now(),
    });
    setNewTodoTitle('');
    setNewTodoDueDate('');
    setShowTodoDatePicker(false);
    onShowToast?.('已新增待辦事項！');
  };

  const handleStartEditTodo = (todo: TodoItem) => {
    if (!canEdit) return;
    setOpenTodoSwipeId(null);
    setEditingTodoId(todo.id);
    setEditTodoTitle(todo.title);
    setEditTodoDueDate(todo.dueDate || '');
  };

  const handleSaveEditTodo = () => {
    if (!canEdit || !editingTodoId) return;
    const trimmed = editTodoTitle.trim();
    if (!trimmed) return;
    const updated = todos.map((t) =>
      t.id === editingTodoId
        ? { ...t, title: trimmed, dueDate: editTodoDueDate || undefined }
        : t
    );
    onUpdateTrip({
      ...trip,
      todos: updated,
      updatedAt: Date.now(),
    });
    setEditingTodoId(null);
    onShowToast?.('已更新待辦事項');
  };

  const handleToggleTodo = (id: string) => {
    if (!canEdit) return;
    const updated = todos.map((t) =>
      t.id === id ? { ...t, completed: !t.completed } : t
    );
    onUpdateTrip({
      ...trip,
      todos: updated,
      updatedAt: Date.now(),
    });
    if (editingTodoId === id) setEditingTodoId(null);
  };

  const handleDeleteTodo = (id: string) => {
    if (!canEdit) return;
    const updated = todos.filter((t) => t.id !== id);
    onUpdateTrip({
      ...trip,
      todos: updated,
      deletedItemIds: {
        ...(trip.deletedItemIds || {}),
        [id]: Date.now(),
      },
      updatedAt: Date.now(),
    });
    if (editingTodoId === id) setEditingTodoId(null);
    onShowToast?.('已刪除待辦事項');
  };

  const handleClearCompletedTodos = () => {
    if (!canEdit) return;
    const now = Date.now();
    const removedIds: Record<string, number> = {};
    todos.filter((t) => t.completed).forEach((t) => {
      removedIds[t.id] = now;
    });
    const remaining = todos.filter((t) => !t.completed);
    onUpdateTrip({
      ...trip,
      todos: remaining,
      deletedItemIds: {
        ...(trip.deletedItemIds || {}),
        ...removedIds,
      },
      updatedAt: now,
    });
    onShowToast?.('已清除所有已完成項目');
  };

  const handleDownloadLightboxImage = async () => {
    if (!previewImage) return;
    const resolved = await resolveMediaSrc(previewImage, {
      tripId: trip.id,
      ownerId: trip.ownerId,
      collabId: trip.collabId,
    });
    const href = resolved || previewImage;
    const link = document.createElement('a');
    link.href = href;
    link.download = `receipt-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewImage) {
          setPreviewImage(null);
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImage]);

  const renderInlineTodoEditRow = (todo: TodoItem) => (
    <div key={todo.id} className="p-3 sm:p-3.5 bg-teal-50/45 dark:bg-teal-950/20 space-y-2.5">
      <input
        type="text"
        value={editTodoTitle}
        onChange={(e) => setEditTodoTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSaveEditTodo();
          } else if (e.key === 'Escape') {
            setEditingTodoId(null);
          }
        }}
        autoFocus
        placeholder="待辦名稱..."
        className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-teal-600/70 dark:border-teal-500/70 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          type="date"
          value={editTodoDueDate}
          onChange={(e) => setEditTodoDueDate(e.target.value)}
          className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono tabular-nums text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
        />
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={() => handleDeleteTodo(todo.id)}
            className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>刪除</span>
          </button>
          <button
            type="button"
            onClick={() => setEditingTodoId(null)}
            className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSaveEditTodo}
            disabled={!editTodoTitle.trim()}
            className="min-h-[44px] sm:min-h-[34px] px-3.5 py-1 rounded-xl bg-teal-700 hover:bg-teal-600 text-white text-xs font-bold disabled:opacity-40 cursor-pointer flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" />
            <span>儲存</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150 overflow-hidden"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-full sm:max-w-lg bg-white dark:bg-[#111827] rounded-t-[28px] sm:rounded-3xl shadow-2xl border-t sm:border border-[#E5E2DC] dark:border-slate-800 overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[88vh] overscroll-contain touch-pan-y animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Indicator Handle */}
        <div className="sm:hidden pt-2.5 pb-1 bg-teal-800 dark:bg-teal-950 flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/30" />
        </div>

        {/* Top Header */}
        <div className="px-5 py-3 bg-teal-800 dark:bg-teal-950 text-white flex items-center justify-between shrink-0">
          <h3 className="text-base font-bold tracking-tight">
            旅途隨身手帖
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition active:scale-95 cursor-pointer"
            aria-label="關閉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Clean Segmented Tab Switcher (一秒記帳 / 行程待辦) */}
        <div className="p-1.5 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 shrink-0 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('expense')}
            className={`flex-1 py-2 px-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'expense'
                ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>一秒記帳</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('todos')}
            className={`flex-1 py-2 px-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'todos'
                ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>行程待辦 {pendingTodos.length > 0 && `(${pendingTodos.length})`}</span>
          </button>
        </div>

        {/* ================= TAB 1: TIANTIAN-STYLE FAST EXPENSE ================= */}
        {activeTab === 'expense' && (
          <TiantianExpenseEditor
            trip={trip}
            lang={lang}
            canEdit={canEdit}
            baseCurrency={trip.currency || defaultTripCurrency}
            isEditing={false}
            draft={draft}
            onChangeDraft={setDraft}
            onUpdateTrip={onUpdateTrip}
            onSave={handleSaveQuickExpense}
            onCancel={handleClose}
            onUploadReceipts={handleUploadReceipts}
            onRemoveReceipt={handleRemoveReceipt}
            onPreviewReceipt={(src) => setPreviewImage(src)}
            isCompressingReceipts={isCompressingReceipts}
            receiptError={receiptError}
            showQuickIncrements={true}
            saveStatusToast={saveStatusToast}
            focusTrigger={focusTrigger}
          />
        )}

        {/* ================= TAB 2: SIMPLE INLINE TRIP TODOS ================= */}
        {activeTab === 'todos' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden max-w-full">
            {/* Inline Quick Add Form */}
            <form
              onSubmit={handleAddTodo}
              className="p-3.5 sm:p-4 bg-[#FAF9F6] dark:bg-slate-900/50 border-b border-[#E5E2DC] dark:border-slate-800 shrink-0 space-y-2.5"
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full border border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center shrink-0">
                  <Plus className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                </div>
                <input
                  type="text"
                  value={newTodoTitle}
                  onChange={(e) => setNewTodoTitle(e.target.value)}
                  placeholder="新增待辦，或點擊下方項目直接編輯..."
                  className="flex-1 min-h-[38px] bg-transparent text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowTodoDatePicker(!showTodoDatePicker)}
                  className={`min-w-[38px] min-h-[38px] rounded-xl border transition cursor-pointer flex items-center justify-center ${
                    showTodoDatePicker || newTodoDueDate
                      ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500 text-teal-700 dark:text-teal-300'
                      : 'border-[#E5E2DC] dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                  title="設定到期日"
                >
                  <Calendar className="w-4 h-4" />
                </button>
                <button
                  type="submit"
                  disabled={!newTodoTitle.trim()}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-600 disabled:opacity-40 text-white text-xs font-bold transition shadow-xs cursor-pointer shrink-0"
                >
                  新增
                </button>
              </div>

              {showTodoDatePicker && (
                <div className="flex items-center gap-2 pt-1 animate-in fade-in duration-150">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                    預計日期：
                  </span>
                  <input
                    type="date"
                    value={newTodoDueDate}
                    onChange={(e) => setNewTodoDueDate(e.target.value)}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-slate-900 dark:text-white text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                  />
                  {newTodoDueDate && (
                    <button
                      type="button"
                      onClick={() => setNewTodoDueDate('')}
                      className="text-[11px] text-slate-400 hover:text-rose-500 transition cursor-pointer"
                    >
                      清除
                    </button>
                  )}
                </div>
              )}
            </form>

            {/* Todos List Container */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 sm:p-4 space-y-3 touch-pan-y max-w-full">
              {pendingTodos.length === 0 ? (
                <div className="py-12 text-center px-4">
                  <div className="w-12 h-12 rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto mb-3">
                    <Check className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                    目前沒有未完成的待辦事項！
                  </p>
                  <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
                    於上方快速輸入，或點擊任何列即可行內編輯
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#E5E2DC]/80 dark:divide-slate-800 rounded-2xl bg-white dark:bg-slate-800/70 border border-[#E5E2DC] dark:border-slate-700/80 overflow-hidden shadow-2xs">
                  {pendingTodos.map((todo) => {
                    if (editingTodoId === todo.id) {
                      return renderInlineTodoEditRow(todo);
                    }

                    return (
                      <SwipeableActionRow
                        key={todo.id}
                        id={todo.id}
                        isOpen={openTodoSwipeId === todo.id}
                        canEdit={canEdit}
                        onOpenChange={setOpenTodoSwipeId}
                        onRowClick={canEdit ? () => handleStartEditTodo(todo) : undefined}
                        onEdit={() => handleStartEditTodo(todo)}
                        onDelete={() => handleDeleteTodo(todo.id)}
                        className={`flex items-center justify-between p-3 sm:p-3.5 md:hover:bg-[#FAF9F6] md:dark:hover:bg-white/5 transition group ${
                          canEdit ? 'cursor-pointer' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleTodo(todo.id);
                            }}
                            className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] -ml-1.5 flex items-center justify-center rounded-xl transition cursor-pointer shrink-0 group/qchk"
                            title="標記完成"
                            aria-label="標記完成"
                          >
                            <span className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600 group-hover/qchk:border-teal-500 dark:group-hover/qchk:border-teal-400 flex items-center justify-center transition">
                              {todo.completed && <Check className="w-3 h-3 text-teal-600" />}
                            </span>
                          </button>

                          <div className="min-w-0 flex-1 text-left">
                            <span className="text-xs sm:text-sm text-slate-900 dark:text-zinc-100 font-medium block leading-snug break-words">
                              {todo.title}
                            </span>
                            {todo.dueDate && (
                              <div className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400 font-mono tabular-nums text-[11px] mt-1">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span>{todo.dueDate}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {canEdit && (
                          <div
                            className="hidden md:flex items-center gap-0.5 ml-1 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => handleStartEditTodo(todo)}
                              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:text-teal-600 dark:text-zinc-500 dark:hover:text-teal-400 transition cursor-pointer opacity-70 group-hover:opacity-100"
                              title="編輯"
                              aria-label="編輯待辦"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTodo(todo.id)}
                              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400 transition cursor-pointer opacity-70 group-hover:opacity-100"
                              title="刪除"
                              aria-label="刪除待辦"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </SwipeableActionRow>
                    );
                  })}
                </div>
              )}

              {/* Completed Todos Accordion */}
              {completedTodos.length > 0 && (
                <div className="rounded-2xl border border-[#E5E2DC] dark:border-slate-800 overflow-hidden bg-[#FAF9F6] dark:bg-slate-900/40">
                  <div className="px-3.5 py-2.5 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowCompletedTodos(!showCompletedTodos)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-zinc-200 transition cursor-pointer select-none"
                    >
                      {showCompletedTodos ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                      <span>已完成項目 ({completedTodos.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClearCompletedTodos}
                      className="text-[11px] text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 font-semibold transition cursor-pointer"
                    >
                      全部清除
                    </button>
                  </div>

                  {showCompletedTodos && (
                    <div className="divide-y divide-[#E5E2DC]/60 dark:divide-slate-800/60 border-t border-[#E5E2DC]/80 dark:border-slate-800 px-2 py-1">
                      {completedTodos.map((todo) => {
                        if (editingTodoId === todo.id) {
                          return renderInlineTodoEditRow(todo);
                        }
                        return (
                          <div
                            key={todo.id}
                            onClick={() => canEdit && handleStartEditTodo(todo)}
                            className={`flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-800/40 transition group opacity-75 ${
                              canEdit ? 'cursor-pointer' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleTodo(todo.id);
                                }}
                                className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] -ml-1.5 flex items-center justify-center rounded-xl shrink-0 cursor-pointer"
                                title="恢復待辦"
                                aria-label="恢復待辦"
                              >
                                <span className="w-5 h-5 rounded-full bg-teal-600 dark:bg-teal-500 text-white flex items-center justify-center shadow-xs">
                                  <Check className="w-3 h-3 stroke-[2.5]" />
                                </span>
                              </button>
                              <span className="text-xs sm:text-sm line-through text-slate-400 dark:text-zinc-500 truncate flex-1">
                                {todo.title}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTodo(todo.id);
                              }}
                              className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center text-slate-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400 transition cursor-pointer opacity-80 sm:opacity-0 sm:group-hover:opacity-100"
                              title="刪除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Receipt Image Lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-60 bg-black/90 backdrop-blur-xs flex flex-col items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-2xl max-h-[85vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <MediaImage
              src={previewImage}
              tripId={trip.id}
              ownerId={trip.ownerId}
              collabId={trip.collabId}
              alt="發票收據大圖"
              className="max-h-[78vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl border border-white/20"
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs backdrop-blur-md transition active:scale-95 cursor-pointer"
              >
                關閉大圖
              </button>
              <button
                type="button"
                onClick={handleDownloadLightboxImage}
                className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition active:scale-95 shadow-xs cursor-pointer"
              >
                下載照片
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
