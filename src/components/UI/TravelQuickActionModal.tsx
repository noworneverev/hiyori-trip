import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trip, ExpenseItem } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { getTodayLocal, normalizeDateKey } from '../../utils/date';
import { compressImageFile, resolveMediaSrc, storeImageAsMediaRef, extractMediaId, isMediaRef } from '../../utils/image';
import { idbDeleteMedia } from '../../utils/indexedDb';
import { MediaImage } from './MediaImage';
import { IosModalSheet, IosNavBar } from './IosPrimitives';
import { useModalLayer } from '../../hooks/useModalHistory';
import { convertAmount, CURRENCY_MAP, detectTripCurrency } from '../../utils/currency';
import {
  TiantianExpenseEditor,
  TiantianExpenseDraft,
  parseExpenseDescription,
  evaluateExpenseAmount,
} from '../Expenses/TiantianExpenseEditor';
import { resolveExpenseCategoryMeta } from '../Expenses/expenseMeta';
import { RemindersTodoList } from '../Todos/RemindersTodoList';
import { DollarSign, CheckSquare } from 'lucide-react';

interface TravelQuickActionModalProps {
  trip: Trip;
  lang: Language;
  canEdit?: boolean;
  onUpdateTrip: (updatedTrip: Trip) => void;
  onClose: () => void;
  initialTab?: 'expense' | 'todos';
  defaultDate?: string;
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
  defaultDate,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'expense' | 'todos'>(initialTab);

  const defaultTripCurrency = trip.currency || detectTripCurrency(trip);
  const splitMembersList = React.useMemo(
    () => (trip.splitMembers && trip.splitMembers.length > 0 ? trip.splitMembers : ['我', '同行旅伴']),
    [trip.splitMembers]
  );

  const [draft, setDraft] = useState<TiantianExpenseDraft>(() => ({
    date: normalizeDateKey(defaultDate) || getLocalTodayDate(),
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
  const [isSubPickerOpen, setIsSubPickerOpen] = useState(false);

  const draftReceiptsRef = useRef<string[]>([]);
  const persistedReceiptsRef = useRef<Set<string>>(new Set());
  const saveToastTimerRef = useRef<number | null>(null);
  const prevTripIdRef = useRef<string>(trip.id);

  useEffect(() => {
    draftReceiptsRef.current = draft.receiptImages;
  }, [draft.receiptImages]);

  useEffect(() => {
    return () => {
      if (saveToastTimerRef.current) {
        window.clearTimeout(saveToastTimerRef.current);
      }
    };
  }, []);

  const splitMembersKey = splitMembersList.join('|');
  useEffect(() => {
    const tripChanged = prevTripIdRef.current !== trip.id;
    prevTripIdRef.current = trip.id;
    setDraft((prev) => {
      if (tripChanged) {
        return {
          ...prev,
          currency: trip.currency || detectTripCurrency(trip),
          splitWith: splitMembersList,
        };
      }
      // Keep user's explicit splitWith selection intact; only prune removed members or populate if empty
      const valid = prev.splitWith.filter((m) => splitMembersList.includes(m));
      if (valid.length === prev.splitWith.length && valid.length > 0) return prev;
      return {
        ...prev,
        splitWith: valid.length > 0 ? valid : splitMembersList,
      };
    });
  }, [trip.id, splitMembersKey]);

  useEffect(() => {
    setDraft((prev) => ({ ...prev, date: normalizeDateKey(defaultDate) || getLocalTodayDate() }));
    setIsSubPickerOpen(false);
  }, [initialTab, defaultDate]);

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
    const decimals = CURRENCY_MAP[draft.currency]?.decimals ?? 0;
    const parsedAmount = evaluateExpenseAmount(draft.amount, decimals);
    if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) return;

    const catMeta = resolveExpenseCategoryMeta(draft.category, trip);
    const { title: finalTitle, notes: finalNotes } = parseExpenseDescription(
      draft.description,
      catMeta.label || '旅途支出'
    );
    const isSplitMode = !trip.isSoloTrip && Boolean(trip.isSplitEnabled);
    const normalizedDraftDate = normalizeDateKey(draft.date) || draft.date;
    const matchedDay = (trip.days || []).find((d) => normalizeDateKey(d.date) === normalizedDraftDate);

    draft.receiptImages.forEach((ref) => persistedReceiptsRef.current.add(ref));

    const newExpense: ExpenseItem = {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: finalTitle,
      amount: parsedAmount,
      currency: draft.currency,
      category: draft.category,
      paymentMethod: draft.paymentMethod,
      date: draft.date,
      dayNumber: matchedDay ? matchedDay.dayNumber : undefined,
      convertedAmount: convertAmount(parsedAmount, draft.currency, trip.currency || defaultTripCurrency, trip.customExchangeRates),
      notes: finalNotes,
      tags: draft.tags.length > 0 ? draft.tags : undefined,
      receiptImages: draft.receiptImages.length > 0 ? draft.receiptImages : undefined,
      receiptImage: draft.receiptImages.length > 0 ? draft.receiptImages[0] : undefined,
      paidBy: isSplitMode ? (draft.paidBy || splitMembersList[0] || '我') : undefined,
      splitWith: isSplitMode && !draft.isPersonal
        ? (draft.splitWith.length > 0 ? draft.splitWith : splitMembersList)
        : undefined,
      isPersonal: isSplitMode ? draft.isPersonal : false,
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
      if (saveToastTimerRef.current) window.clearTimeout(saveToastTimerRef.current);
      saveToastTimerRef.current = window.setTimeout(() => setSaveStatusToast(null), 3200);
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

  useModalLayer(Boolean(previewImage), () => setPreviewImage(null));

  return (
    <>
      <IosModalSheet
        onClose={handleClose}
        maxWidthClass="sm:max-w-lg"
        variant="grouped"
        fullHeightOnMobile
        disableBackdropClose={Boolean(previewImage)}
        ariaLabel="旅途隨身手帖"
      >
        {!(activeTab === 'expense' && isSubPickerOpen) && (
          <>
            <IosNavBar
              title="旅途隨身手帖"
              leftLabel="關閉"
              onLeftClick={handleClose}
              rightLabel={activeTab === 'todos' ? '完成' : undefined}
              onRightClick={activeTab === 'todos' ? handleClose : undefined}
            />

            {/* iOS Segmented Control */}
            <div className="px-4 py-2.5 border-b border-[#E5E2DC]/80 dark:border-slate-800 bg-[#FAF9F6] dark:bg-[#0B1120] shrink-0">
              <div className="grid grid-cols-2 p-1 rounded-xl bg-[#EFECE5] dark:bg-slate-800/90 gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('expense')}
                  className={`min-h-[38px] sm:min-h-[34px] px-2.5 rounded-lg font-semibold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === 'expense'
                      ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                  <span>一秒記帳</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('todos')}
                  className={`min-h-[38px] sm:min-h-[34px] px-2.5 rounded-lg font-semibold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === 'todos'
                      ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <CheckSquare className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                  <span>
                    行程待辦{' '}
                    {pendingTodos.length > 0 && (
                      <span className="font-mono tabular-nums">({pendingTodos.length})</span>
                    )}
                  </span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* TAB 1: TIANTIAN-STYLE FAST EXPENSE */}
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
            onPickerActiveChange={setIsSubPickerOpen}
          />
        )}

        {/* TAB 2: iPHONE REMINDERS-STYLE TRIP TODOS */}
        {activeTab === 'todos' && (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden touch-pan-y pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
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
      </IosModalSheet>

      {/* Fullscreen Receipt Image Lightbox (portaled above sheets) */}
      {previewImage && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-xs flex flex-col items-center justify-center px-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] animate-in fade-in duration-150"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-2xl max-h-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <MediaImage
              src={previewImage}
              tripId={trip.id}
              ownerId={trip.ownerId}
              collabId={trip.collabId}
              alt="發票收據大圖"
              className="max-h-[78dvh] w-auto max-w-full rounded-2xl object-contain shadow-2xl border border-white/20"
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs backdrop-blur-md transition active:scale-95 cursor-pointer"
              >
                關閉大圖
              </button>
              <button
                type="button"
                onClick={handleDownloadLightboxImage}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition active:scale-95 shadow-xs cursor-pointer"
              >
                下載照片
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
