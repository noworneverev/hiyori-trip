import React, { useState, useEffect, useRef } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { Trip, ExpenseItem } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { getTodayLocal } from '../../utils/date';
import { compressImageFile, resolveMediaSrc, storeImageAsMediaRef, extractMediaId, isMediaRef } from '../../utils/image';
import { idbDeleteMedia } from '../../utils/indexedDb';
import { MediaImage } from './MediaImage';
import { convertAmount, detectTripCurrency } from '../../utils/currency';
import {
  TiantianExpenseEditor,
  TiantianExpenseDraft,
  parseExpenseDescription,
} from '../Expenses/TiantianExpenseEditor';
import { resolveExpenseCategoryMeta } from '../Expenses/expenseMeta';
import { RemindersTodoList } from '../Todos/RemindersTodoList';
import {
  X,
  DollarSign,
  CheckSquare,
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
    description: '',
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
    const { title: finalTitle, notes: finalNotes } = parseExpenseDescription(
      draft.description,
      catMeta.label || '旅途支出'
    );
    const isSplitMode = !trip.isSoloTrip && Boolean(trip.isSplitEnabled);
    const matchedDay = (trip.days || []).find((d) => d.date === draft.date);

    draft.receiptImages.forEach((ref) => persistedReceiptsRef.current.add(ref));

    const newExpense: ExpenseItem = {
      id: `exp-${Date.now()}`,
      title: finalTitle,
      amount: parsedAmount,
      currency: draft.currency,
      category: draft.category,
      paymentMethod: draft.paymentMethod,
      date: draft.date,
      dayNumber: matchedDay ? matchedDay.dayNumber : undefined,
      convertedAmount: convertAmount(parsedAmount, draft.currency, trip.currency || 'TWD', trip.customExchangeRates),
      notes: finalNotes,
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
        description: '',
        receiptImages: [],
        tags: [],
      }));
      setFocusTrigger((v) => v + 1);
    } else {
      onClose();
    }
  };

  // --- 2. Synced Trip Todos Count for Tab Badge ---
  const pendingTodos = (trip.todos || []).filter((t) => !t.completed);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150 overflow-hidden"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-full sm:max-w-lg bg-white dark:bg-[#111827] rounded-t-[28px] sm:rounded-3xl shadow-2xl border-t sm:border border-[#E5E2DC] dark:border-slate-800 overflow-hidden flex flex-col max-h-full sm:max-h-[88dvh] overscroll-contain touch-pan-y animate-in slide-in-from-bottom duration-200"
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
            saveStatusToast={saveStatusToast}
            focusTrigger={focusTrigger}
          />
        )}

        {/* ================= TAB 2: iPHONE REMINDERS-STYLE TRIP TODOS ================= */}
        {activeTab === 'todos' && (
          <div className="flex-1 overflow-y-auto overflow-x-hidden touch-pan-y pb-[env(safe-area-inset-bottom,0px)]">
            <RemindersTodoList
              trip={trip}
              lang={lang}
              canEdit={canEdit}
              onUpdateTrip={onUpdateTrip}
              onShowToast={onShowToast}
              compact={true}
            />
          </div>
        )}
      </div>

      {/* Fullscreen Receipt Image Lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-60 bg-black/90 backdrop-blur-xs flex flex-col items-center justify-center px-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] animate-in fade-in duration-150"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-2xl max-h-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
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
