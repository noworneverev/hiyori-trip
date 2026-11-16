import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Plus,
  Edit2,
  Trash2,
  Tag,
  Camera,
  Loader2,
  Users,
  UserPlus,
  Coins,
} from 'lucide-react';
import { PaymentMethod, Trip } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { getTodayLocal } from '../../utils/date';
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_MAP,
  convertAmount,
  formatCurrencyAmount,
} from '../../utils/currency';
import { canUploadImages } from '../../utils/userPermissions';
import { MediaImage } from '../UI/MediaImage';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_EXPENSE_TAGS,
  EXPENSE_ACCOUNTS,
  EXPENSE_ACCOUNT_MAP,
  getAccountLabel,
  resolveExpenseCategoryMeta,
} from './expenseMeta';

export interface TiantianExpenseDraft {
  date: string;
  amount: string;
  currency: string;
  category: string;
  paymentMethod: PaymentMethod;
  paidBy: string;
  splitWith: string[];
  isPersonal: boolean;
  tags: string[];
  receiptImages: string[];
  description: string;
}

export const formatExpenseDescriptionDraft = (title?: string, notes?: string): string => {
  const cleanTitle = (title || '').trim();
  const cleanNotes = (notes || '').trim();
  if (cleanTitle && cleanNotes && cleanTitle !== cleanNotes) {
    return `${cleanTitle}\n${cleanNotes}`;
  }
  return cleanTitle || cleanNotes;
};

export const parseExpenseDescription = (
  description: string,
  fallbackCategoryLabel: string
): { title: string; notes?: string } => {
  const normalized = (description || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return { title: fallbackCategoryLabel || '旅途支出', notes: undefined };
  }
  const lines = normalized.split('\n');
  const firstNonEmptyIdx = lines.findIndex((line) => line.trim().length > 0);
  const title = firstNonEmptyIdx >= 0 ? lines[firstNonEmptyIdx].trim() : fallbackCategoryLabel;
  const remaining = firstNonEmptyIdx >= 0 ? lines.slice(firstNonEmptyIdx + 1).join('\n').trim() : '';
  return {
    title: title || fallbackCategoryLabel || '旅途支出',
    notes: remaining || undefined,
  };
};

interface TiantianExpenseEditorProps {
  trip: Trip;
  lang: Language;
  canEdit: boolean;
  baseCurrency: string;
  isEditing: boolean;
  draft: TiantianExpenseDraft;
  onChangeDraft: (updater: (prev: TiantianExpenseDraft) => TiantianExpenseDraft) => void;
  onUpdateTrip: (updatedTrip: Trip) => void;
  requireAuth?: (action: () => void, reason?: string) => boolean;
  onSave: (continueAdding: boolean) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onUploadReceipts: (files: FileList) => Promise<void>;
  onRemoveReceipt: (index: number) => void;
  onPreviewReceipt?: (src: string, index: number) => void;
  isCompressingReceipts?: boolean;
  receiptError?: string | null;
  onOpenManageCategoriesModal?: () => void;
  saveStatusToast?: string | null;
  focusTrigger?: number;
}

type PickerPanel = 'none' | 'date' | 'currency' | 'category' | 'account' | 'member' | 'tags';

export const TiantianExpenseEditor: React.FC<TiantianExpenseEditorProps> = ({
  trip,
  lang,
  canEdit,
  baseCurrency,
  isEditing,
  draft,
  onChangeDraft,
  onUpdateTrip,
  requireAuth,
  onSave,
  onCancel,
  onDelete,
  onUploadReceipts,
  onRemoveReceipt,
  onPreviewReceipt,
  isCompressingReceipts = false,
  receiptError = null,
  onOpenManageCategoriesModal,
  saveStatusToast = null,
  focusTrigger = 0,
}) => {
  const [activePicker, setActivePicker] = useState<PickerPanel>('none');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Category picker management states
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingCatKey, setEditingCatKey] = useState<string | null>(null);
  const [editingCatVal, setEditingCatVal] = useState('');

  // Tag picker input states
  const [newTagInput, setNewTagInput] = useState('');

  // Split quick-add companion state
  const [newMemberName, setNewMemberName] = useState('');

  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setActivePicker('none');
    setConfirmingDelete(false);
    const t = setTimeout(() => {
      amountInputRef.current?.focus({ preventScroll: true });
    }, 120);
    return () => clearTimeout(t);
  }, [focusTrigger]);

  const todayStr = getTodayLocal();
  const customCategories = trip.customExpenseCategories || [];
  const customTags = trip.customExpenseTags || [];
  const splitMembersList = useMemo(
    () => (trip.splitMembers && trip.splitMembers.length > 0 ? trip.splitMembers : ['我', '同行旅伴']),
    [trip.splitMembers]
  );

  const allAvailableTags = useMemo(() => {
    return Array.from(new Set([...DEFAULT_EXPENSE_TAGS, ...customTags, ...(draft.tags || [])]));
  }, [customTags, draft.tags]);

  const parsedAmount = parseFloat(draft.amount) || 0;
  const convertedPreview = convertAmount(parsedAmount, draft.currency, baseCurrency, trip.customExchangeRates);
  const currencyMeta = CURRENCY_MAP[draft.currency];
  const catMeta = resolveExpenseCategoryMeta(draft.category, trip);
  const accountMeta = EXPENSE_ACCOUNT_MAP[draft.paymentMethod] || EXPENSE_ACCOUNT_MAP.cash;
  const isSplitMode = !trip.isSoloTrip && Boolean(trip.isSplitEnabled);

  const handleAmountChange = (rawVal: string) => {
    let cleaned = rawVal.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) cleaned = parts[0] + '.' + parts.slice(1).join('');
    if (['JPY', 'KRW', 'VND'].includes(draft.currency) && cleaned.includes('.')) {
      cleaned = cleaned.split('.')[0];
    }
    onChangeDraft((prev) => ({ ...prev, amount: cleaned }));
  };

  const handleAddCustomCategory = () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    if (DEFAULT_EXPENSE_CATEGORIES[trimmed] || customCategories.includes(trimmed)) {
      onChangeDraft((prev) => ({ ...prev, category: trimmed }));
      setNewCatName('');
      setShowNewCatInput(false);
      setActivePicker('none');
      return;
    }
    const doAdd = () => {
      onUpdateTrip({
        ...trip,
        customExpenseCategories: [...customCategories, trimmed],
        updatedAt: Date.now(),
      });
      onChangeDraft((prev) => ({ ...prev, category: trimmed }));
      setNewCatName('');
      setShowNewCatInput(false);
      setActivePicker('none');
    };
    if (requireAuth && !requireAuth(doAdd, '新增自訂類別')) return;
    doAdd();
  };

  const handleRenameCustomCategory = (oldKey: string) => {
    const trimmed = editingCatVal.trim();
    if (!trimmed || trimmed === oldKey) {
      setEditingCatKey(null);
      return;
    }
    const doRename = () => {
      const updatedCats = customCategories.map((c) => (c === oldKey ? trimmed : c));
      const updatedExpenses = trip.expenses.map((e) =>
        e.category === oldKey ? { ...e, category: trimmed } : e
      );
      onUpdateTrip({
        ...trip,
        customExpenseCategories: updatedCats,
        expenses: updatedExpenses,
        updatedAt: Date.now(),
      });
      if (draft.category === oldKey) {
        onChangeDraft((prev) => ({ ...prev, category: trimmed }));
      }
      setEditingCatKey(null);
    };
    if (requireAuth && !requireAuth(doRename, '修改自訂類別')) return;
    doRename();
  };

  const handleDeleteCustomCategory = (catKey: string) => {
    const doDelete = () => {
      onUpdateTrip({
        ...trip,
        customExpenseCategories: customCategories.filter((c) => c !== catKey),
        updatedAt: Date.now(),
      });
      if (draft.category === catKey) {
        onChangeDraft((prev) => ({ ...prev, category: 'food' }));
      }
    };
    if (requireAuth && !requireAuth(doDelete, '刪除自訂類別')) return;
    doDelete();
  };

  const handleToggleTag = (tag: string) => {
    onChangeDraft((prev) => {
      const exists = prev.tags.includes(tag);
      return {
        ...prev,
        tags: exists ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
      };
    });
  };

  const handleAddCustomTag = () => {
    const trimmed = newTagInput.trim();
    if (!trimmed) return;
    if (!draft.tags.includes(trimmed)) {
      onChangeDraft((prev) => ({ ...prev, tags: [...prev.tags, trimmed] }));
    }
    if (!DEFAULT_EXPENSE_TAGS.includes(trimmed) && !customTags.includes(trimmed)) {
      onUpdateTrip({
        ...trip,
        customExpenseTags: [...customTags, trimmed],
        updatedAt: Date.now(),
      });
    }
    setNewTagInput('');
  };

  const handleRemoveCustomTagFromTrip = (tag: string) => {
    onUpdateTrip({
      ...trip,
      customExpenseTags: customTags.filter((t) => t !== tag),
      updatedAt: Date.now(),
    });
    onChangeDraft((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }));
  };

  const handleAddSplitMember = () => {
    const trimmed = newMemberName.trim();
    if (!trimmed) return;
    if (!splitMembersList.includes(trimmed)) {
      onUpdateTrip({
        ...trip,
        isSplitEnabled: true,
        splitMembers: [...splitMembersList, trimmed],
        updatedAt: Date.now(),
      });
    }
    onChangeDraft((prev) => ({
      ...prev,
      isPersonal: false,
      splitWith: prev.splitWith.includes(trimmed) ? prev.splitWith : [...prev.splitWith, trimmed],
    }));
    setNewMemberName('');
  };

  const matchedTripDay = useMemo(() => {
    const target = (draft.date || '').slice(0, 10);
    return (trip.days || []).find((d) => (d.date || '').slice(0, 10) === target);
  }, [trip.days, draft.date]);

  const memberSummaryText = useMemo(() => {
    if (!isSplitMode) return '個人獨旅';
    if (draft.isPersonal) return '個人私用 · 不分攤';
    const count = draft.splitWith.length || splitMembersList.length;
    return `${draft.paidBy || '我'}代墊 · ${count} 人分攤`;
  }, [isSplitMode, draft.isPersonal, draft.paidBy, draft.splitWith.length, splitMembersList.length]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activePicker !== 'none') {
      setActivePicker('none');
      return;
    }
    if (!canEdit || parsedAmount <= 0) return;
    onSave(false);
  };

  // Picker Header helper
  const renderPickerHeader = (title: string, rightSlot?: React.ReactNode) => (
    <div className="px-4 py-3 border-b border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-900/60 flex items-center justify-between gap-2 shrink-0">
      <button
        type="button"
        onClick={() => setActivePicker('none')}
        className="min-h-[38px] px-2.5 py-1 rounded-xl hover:bg-slate-200/70 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 transition cursor-pointer"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>返回</span>
      </button>
      <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">{title}</span>
      <div className="min-w-[56px] flex justify-end">{rightSlot}</div>
    </div>
  );

  // ================= SUB-PICKER PANEL VIEWS (天天記帳點選進入子選單) =================
  if (activePicker !== 'none') {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white dark:bg-[#111827]">
        {activePicker === 'date' && (
          <>
            {renderPickerHeader('選擇消費日期')}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  自訂日期
                </label>
                <input
                  type="date"
                  value={draft.date}
                  onChange={(e) => onChangeDraft((prev) => ({ ...prev, date: e.target.value }))}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-sm font-mono tabular-nums text-slate-900 dark:text-white outline-hidden focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                  快速選擇行程天數
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onChangeDraft((prev) => ({ ...prev, date: todayStr }));
                      setActivePicker('none');
                    }}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-xs font-semibold transition cursor-pointer ${
                      draft.date === todayStr
                        ? 'bg-teal-700 text-white border-teal-700'
                        : 'bg-[#FAF9F6] dark:bg-slate-800 border-[#E5E2DC] dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-teal-500'
                    }`}
                  >
                    <span className="block font-bold">今天</span>
                    <span className="text-[10px] font-mono opacity-80">{todayStr.slice(5).replace('-', '/')}</span>
                  </button>

                  {(trip.days || []).map((d) => {
                    const isSel = draft.date === d.date;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          onChangeDraft((prev) => ({ ...prev, date: d.date }));
                          setActivePicker('none');
                        }}
                        className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-xs font-semibold transition cursor-pointer ${
                          isSel
                            ? 'bg-teal-700 text-white border-teal-700'
                            : 'bg-[#FAF9F6] dark:bg-slate-800 border-[#E5E2DC] dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-teal-500'
                        }`}
                      >
                        <span className="block font-bold">Day {d.dayNumber}</span>
                        <span className="text-[10px] font-mono opacity-80">{d.date.slice(5).replace('-', '/')}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="p-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))] sm:pb-3.5 border-t border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-900/60 shrink-0">
              <button
                type="button"
                onClick={() => setActivePicker('none')}
                className="w-full min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer transition"
              >
                完成
              </button>
            </div>
          </>
        )}

        {activePicker === 'currency' && (
          <>
            {renderPickerHeader('選擇消費幣別')}
            <div className="flex-1 overflow-y-auto divide-y divide-[#E5E2DC]/60 dark:divide-slate-800">
              {SUPPORTED_CURRENCIES.map((cur) => {
                const isSel = draft.currency === cur.code;
                return (
                  <button
                    key={cur.code}
                    type="button"
                    onClick={() => {
                      onChangeDraft((prev) => ({ ...prev, currency: cur.code }));
                      setActivePicker('none');
                    }}
                    className={`w-full min-h-[48px] px-4 py-2.5 flex items-center justify-between text-xs transition cursor-pointer ${
                      isSel
                        ? 'bg-teal-50/80 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200 font-bold'
                        : 'hover:bg-[#FAF9F6] dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="text-base">{cur.flag}</span>
                      <span>{cur.code}</span>
                      <span className="text-slate-400 font-normal">{cur.name}</span>
                    </span>
                    <span className="flex items-center gap-2 font-mono">
                      <span className="text-slate-500">{cur.symbol}</span>
                      {isSel && <Check className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {activePicker === 'category' && (
          <>
            {renderPickerHeader(
              '選擇消費類別',
              <div className="flex items-center gap-1.5">
                {onOpenManageCategoriesModal && (
                  <button
                    type="button"
                    onClick={onOpenManageCategoriesModal}
                    className="min-h-[34px] px-2 py-1 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    管理
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNewCatInput((v) => !v)}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>自訂</span>
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {showNewCatInput && (
                <div className="flex items-center gap-2 p-2 rounded-2xl bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700">
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomCategory();
                      }
                    }}
                    placeholder="輸入新類別名稱 (如：居酒屋、伴手禮)"
                    autoFocus
                    className="flex-1 min-h-[36px] px-2.5 bg-white dark:bg-slate-800 rounded-xl border border-[#E5E2DC] dark:border-slate-700 text-xs outline-hidden focus:ring-2 focus:ring-teal-600"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomCategory}
                    className="min-h-[36px] px-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer"
                  >
                    加入
                  </button>
                </div>
              )}

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {Object.keys(DEFAULT_EXPENSE_CATEGORIES).map((catKey) => {
                  const meta = resolveExpenseCategoryMeta(catKey, trip);
                  const isSel = draft.category === catKey;
                  return (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => {
                        onChangeDraft((prev) => ({ ...prev, category: catKey }));
                        setActivePicker('none');
                      }}
                      className={`min-h-[64px] p-2 rounded-2xl border flex flex-col items-center justify-center gap-1.5 text-xs transition cursor-pointer ${
                        isSel
                          ? 'bg-teal-700 text-white border-teal-700 font-bold shadow-xs'
                          : 'bg-[#FAF9F6] dark:bg-slate-800/70 border-[#E5E2DC] dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-teal-500'
                      }`}
                    >
                      <meta.Icon className="w-4 h-4" />
                      <span className="text-[11px] truncate max-w-full px-1">{meta.label}</span>
                    </button>
                  );
                })}

                {customCategories.map((catKey) => {
                  const isSel = draft.category === catKey;
                  const displayName = trip.customCategoryLabels?.[catKey] || catKey;
                  if (editingCatKey === catKey) {
                    return (
                      <div
                        key={catKey}
                        className="col-span-3 sm:col-span-2 p-2 rounded-2xl border border-teal-500 bg-teal-50/40 dark:bg-teal-950/30 flex items-center gap-1.5"
                      >
                        <input
                          type="text"
                          value={editingCatVal}
                          onChange={(e) => setEditingCatVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleRenameCustomCategory(catKey);
                            } else if (e.key === 'Escape') {
                              setEditingCatKey(null);
                            }
                          }}
                          autoFocus
                          className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-xs outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => handleRenameCustomCategory(catKey)}
                          className="p-1.5 rounded-lg bg-teal-700 text-white cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCatKey(null)}
                          className="p-1.5 text-slate-500 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div key={catKey} className="relative group">
                      <button
                        type="button"
                        onClick={() => {
                          onChangeDraft((prev) => ({ ...prev, category: catKey }));
                          setActivePicker('none');
                        }}
                        className={`w-full min-h-[64px] p-2 rounded-2xl border flex flex-col items-center justify-center gap-1.5 text-xs transition cursor-pointer ${
                          isSel
                            ? 'bg-teal-700 text-white border-teal-700 font-bold shadow-xs'
                            : 'bg-[#FAF9F6] dark:bg-slate-800/70 border-[#E5E2DC] dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-teal-500'
                        }`}
                      >
                        <Tag className="w-4 h-4" />
                        <span className="text-[11px] truncate max-w-full px-1">{displayName}</span>
                      </button>
                      <div className="absolute -top-1.5 -right-1 flex items-center gap-0.5 bg-white dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 rounded-lg px-0.5 shadow-xs">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCatKey(catKey);
                            setEditingCatVal(catKey);
                          }}
                          className="p-1 text-slate-400 hover:text-teal-700 cursor-pointer"
                          title="改名"
                        >
                          <Edit2 className="w-2.5 h-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCustomCategory(catKey);
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="刪除"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {activePicker === 'account' && (
          <>
            {renderPickerHeader('選擇帳戶（支付方式）')}
            <div className="flex-1 overflow-y-auto divide-y divide-[#E5E2DC]/60 dark:divide-slate-800">
              {EXPENSE_ACCOUNTS.map((acc) => {
                const isSel = draft.paymentMethod === acc.key;
                const AccIcon = acc.Icon || Coins;
                return (
                  <button
                    key={acc.key}
                    type="button"
                    onClick={() => {
                      onChangeDraft((prev) => ({ ...prev, paymentMethod: acc.key }));
                      setActivePicker('none');
                    }}
                    className={`w-full min-h-[54px] px-4 py-3 flex items-center justify-between text-xs sm:text-sm transition cursor-pointer ${
                      isSel
                        ? 'bg-teal-50/80 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200 font-bold'
                        : 'hover:bg-[#FAF9F6] dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        isSel
                          ? 'bg-teal-700 text-white'
                          : 'bg-[#FAF9F6] dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}>
                        <AccIcon className="w-4 h-4" />
                      </span>
                      <span>{getAccountLabel(acc.key, lang)}</span>
                    </span>
                    {isSel && <Check className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {activePicker === 'member' && (
          <>
            {renderPickerHeader('成員與分帳歸屬')}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {!isSplitMode ? (
                <div className="p-4 rounded-2xl bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-800 space-y-3 text-center">
                  <Users className="w-8 h-8 text-teal-700 dark:text-teal-400 mx-auto" />
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white text-sm">目前為個人獨旅模式</p>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                      若與朋友同行，可一鍵啟用多成員分帳與結算
                    </p>
                  </div>
                  {!trip.isSoloTrip && (
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateTrip({
                          ...trip,
                          isSplitEnabled: true,
                          splitMembers:
                            trip.splitMembers && trip.splitMembers.length > 0
                              ? trip.splitMembers
                              : ['我', '同行旅伴'],
                          updatedAt: Date.now(),
                        });
                      }}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold cursor-pointer transition"
                    >
                      啟用朋友分帳模式
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <label className="min-h-[44px] px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-800 flex items-center justify-between cursor-pointer">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      此筆為個人私費（不列入公費分帳）
                    </span>
                    <input
                      type="checkbox"
                      checked={draft.isPersonal}
                      onChange={(e) =>
                        onChangeDraft((prev) => ({ ...prev, isPersonal: e.target.checked }))
                      }
                      className="w-4 h-4 rounded accent-teal-700 cursor-pointer"
                    />
                  </label>

                  {!draft.isPersonal && (
                    <div className="space-y-4">
                      <div>
                        <span className="block font-bold text-slate-600 dark:text-slate-400 mb-2">
                          代墊付款人
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {splitMembersList.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => onChangeDraft((prev) => ({ ...prev, paidBy: m }))}
                              className={`min-h-[38px] px-3 py-1.5 rounded-xl border font-bold transition cursor-pointer ${
                                draft.paidBy === m
                                  ? 'bg-teal-700 text-white border-teal-700'
                                  : 'bg-[#FAF9F6] dark:bg-slate-800 border-[#E5E2DC] dark:border-slate-700 text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-slate-600 dark:text-slate-400">
                            參與分攤成員
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onChangeDraft((prev) => ({
                                ...prev,
                                splitWith:
                                  prev.splitWith.length === splitMembersList.length
                                    ? ['我']
                                    : splitMembersList,
                              }))
                            }
                            className="text-teal-700 dark:text-teal-400 font-bold hover:underline cursor-pointer"
                          >
                            {draft.splitWith.length === splitMembersList.length ? '只選自己' : '全體均分'}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {splitMembersList.map((m) => {
                            const included = draft.splitWith.includes(m);
                            return (
                              <button
                                key={m}
                                type="button"
                                onClick={() =>
                                  onChangeDraft((prev) => {
                                    if (prev.splitWith.includes(m)) {
                                      if (prev.splitWith.length <= 1) return prev;
                                      return { ...prev, splitWith: prev.splitWith.filter((x) => x !== m) };
                                    }
                                    return { ...prev, splitWith: [...prev.splitWith, m] };
                                  })
                                }
                                className={`min-h-[38px] px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1 transition cursor-pointer ${
                                  included
                                    ? 'bg-teal-700 text-white border-teal-700'
                                    : 'bg-[#FAF9F6] dark:bg-slate-800 border-[#E5E2DC] dark:border-slate-700 text-slate-400'
                                }`}
                              >
                                {included && <Check className="w-3 h-3" />}
                                <span>{m}</span>
                              </button>
                            );
                          })}
                        </div>
                        {parsedAmount > 0 && draft.splitWith.length > 0 && (
                          <p className="mt-2 font-mono tabular-nums text-teal-700 dark:text-teal-300 font-semibold">
                            每人應攤約 {formatCurrencyAmount(convertedPreview / draft.splitWith.length, baseCurrency)}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 border-t border-[#E5E2DC] dark:border-slate-800 flex items-center gap-2">
                        <UserPlus className="w-4 h-4 text-slate-400 shrink-0" />
                        <input
                          type="text"
                          value={newMemberName}
                          onChange={(e) => setNewMemberName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddSplitMember();
                            }
                          }}
                          placeholder="快速新增旅伴名稱..."
                          className="flex-1 min-h-[36px] px-3 py-1 rounded-xl bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 outline-hidden focus:ring-2 focus:ring-teal-600"
                        />
                        <button
                          type="button"
                          onClick={handleAddSplitMember}
                          className="min-h-[36px] px-3 rounded-xl bg-slate-800 dark:bg-slate-700 text-white font-bold cursor-pointer"
                        >
                          加入
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="p-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))] sm:pb-3.5 border-t border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-900/60 shrink-0">
              <button
                type="button"
                onClick={() => setActivePicker('none')}
                className="w-full min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer transition"
              >
                完成
              </button>
            </div>
          </>
        )}

        {activePicker === 'tags' && (
          <>
            {renderPickerHeader('選擇或新增標籤')}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomTag();
                    }
                  }}
                  placeholder="輸入自訂標籤（如：退稅、朋友託買、夜市）..."
                  className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 outline-hidden focus:ring-2 focus:ring-teal-600"
                />
                <button
                  type="button"
                  onClick={handleAddCustomTag}
                  disabled={!newTagInput.trim()}
                  className="min-h-[40px] px-3.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white font-bold cursor-pointer"
                >
                  新增
                </button>
              </div>

              <div className="space-y-2">
                <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  點選可複選標籤（再次點擊可取消）
                </span>
                <div className="flex flex-wrap gap-2">
                  {allAvailableTags.map((tag) => {
                    const isSel = draft.tags.includes(tag);
                    const isCustom = customTags.includes(tag);
                    return (
                      <div key={tag} className="inline-flex items-center">
                        <button
                          type="button"
                          onClick={() => handleToggleTag(tag)}
                          className={`min-h-[38px] px-3 py-1.5 border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                            isCustom ? 'rounded-l-xl border-r-0' : 'rounded-xl'
                          } ${
                            isSel
                              ? 'bg-teal-700 border-teal-700 text-white'
                              : 'bg-[#FAF9F6] dark:bg-slate-800 border-[#E5E2DC] dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-teal-500'
                          }`}
                        >
                          {isSel && <Check className="w-3 h-3" />}
                          <span>#{tag}</span>
                        </button>
                        {isCustom && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomTagFromTrip(tag)}
                            className={`min-h-[38px] px-2 border border-l-0 rounded-r-xl transition cursor-pointer ${
                              isSel
                                ? 'bg-teal-800 border-teal-700 text-teal-100 hover:text-white'
                                : 'bg-[#FAF9F6] dark:bg-slate-800 border-[#E5E2DC] dark:border-slate-700 text-slate-400 hover:text-rose-500'
                            }`}
                            title="移除自訂標籤"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="p-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))] sm:pb-3.5 border-t border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-900/60 shrink-0">
              <button
                type="button"
                onClick={() => setActivePicker('none')}
                className="w-full min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer transition"
              >
                完成 ({draft.tags.length} 個標籤)
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ================= MAIN TIANTIAN BOOKKEEPING ROW LAYOUT =================
  return (
    <form onSubmit={handleFormSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white dark:bg-[#111827]">
      {saveStatusToast && (
        <div className="px-4 py-2 bg-teal-50 dark:bg-teal-950/70 border-b border-teal-200 dark:border-teal-800 text-xs font-semibold text-teal-800 dark:text-teal-200 flex items-center gap-1.5 shrink-0 animate-in fade-in duration-150">
          <Check className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
          <span className="truncate">{saveStatusToast}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto divide-y divide-[#E5E2DC]/80 dark:divide-slate-800 overscroll-contain touch-pan-y">
        {/* 1. 日期 */}
        <button
          type="button"
          onClick={() => setActivePicker('date')}
          className="w-full min-h-[50px] px-4 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-[#FAF9F6] dark:hover:bg-slate-800/40 transition text-left cursor-pointer"
        >
          <span className="w-20 shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
            日期
          </span>
          <div className="flex-1 min-w-0 flex items-center justify-end gap-2 text-xs sm:text-sm font-mono tabular-nums font-bold text-slate-900 dark:text-white">
            <span>{(draft.date || todayStr).replace(/-/g, '/')}</span>
            {matchedTripDay ? (
              <span className="text-[11px] font-sans text-teal-700 dark:text-teal-300 font-semibold">
                · Day {matchedTripDay.dayNumber}
              </span>
            ) : draft.date === todayStr ? (
              <span className="text-[11px] font-sans text-teal-700 dark:text-teal-300 font-semibold">
                · 今天
              </span>
            ) : null}
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>

        {/* 2. 金額 */}
        <div className="px-4 sm:px-5 py-3 space-y-2 bg-[#FAF9F6]/60 dark:bg-slate-900/30">
          <div className="flex items-center gap-2.5">
            <span className="w-20 shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
              金額
            </span>

            <button
              type="button"
              onClick={() => setActivePicker('currency')}
              className="min-h-[36px] px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700 hover:border-teal-600 text-xs font-bold font-mono text-slate-800 dark:text-slate-100 flex items-center gap-1 shrink-0 cursor-pointer transition"
              title="切換幣別"
            >
              <span>{currencyMeta?.flag}</span>
              <span>{draft.currency}</span>
              <span className="text-slate-400">▾</span>
            </button>

            <div className="flex-1 min-w-0 flex items-center justify-end gap-1.5">
              <span className="text-sm font-mono font-bold text-slate-400 select-none">
                {currencyMeta?.symbol}
              </span>
              <input
                ref={amountInputRef}
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                required
                value={draft.amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0"
                className="w-full min-w-0 text-right bg-transparent text-xl sm:text-2xl font-black font-mono tabular-nums text-teal-800 dark:text-teal-300 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-hidden"
              />
              {draft.amount && (
                <button
                  type="button"
                  onClick={() => {
                    onChangeDraft((prev) => ({ ...prev, amount: '' }));
                    amountInputRef.current?.focus({ preventScroll: true });
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer shrink-0"
                  aria-label="清除金額"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {parsedAmount > 0 && draft.currency !== baseCurrency && (
            <div className="flex justify-end">
              <span className="text-[11px] font-mono tabular-nums font-semibold text-teal-700 dark:text-teal-300">
                ≈ {formatCurrencyAmount(convertedPreview, baseCurrency)}
              </span>
            </div>
          )}
        </div>

        {/* 3. 類別（點一下進入挑選，不全部展開） */}
        <button
          type="button"
          onClick={() => setActivePicker('category')}
          className="w-full min-h-[50px] px-4 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-[#FAF9F6] dark:hover:bg-slate-800/40 transition text-left cursor-pointer"
        >
          <span className="w-20 shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
            類別
          </span>
          <div className="flex-1 min-w-0 flex items-center justify-end gap-2 text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
            <span className="w-6 h-6 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
              <catMeta.Icon className="w-3.5 h-3.5" />
            </span>
            <span className="truncate">{catMeta.label}</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>

        {/* 4. 帳戶（對應支付方式，點一下進入挑選） */}
        <button
          type="button"
          onClick={() => setActivePicker('account')}
          className="w-full min-h-[50px] px-4 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-[#FAF9F6] dark:hover:bg-slate-800/40 transition text-left cursor-pointer"
        >
          <span className="w-20 shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
            帳戶
          </span>
          <div className="flex-1 min-w-0 flex items-center justify-end gap-2 text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
            <accountMeta.Icon className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
            <span className="truncate">{getAccountLabel(draft.paymentMethod, lang)}</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>

        {/* 5. 成員 */}
        <button
          type="button"
          onClick={() => setActivePicker('member')}
          className="w-full min-h-[50px] px-4 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-[#FAF9F6] dark:hover:bg-slate-800/40 transition text-left cursor-pointer"
        >
          <span className="w-20 shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
            成員
          </span>
          <div className="flex-1 min-w-0 flex items-center justify-end gap-1.5 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
            <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{memberSummaryText}</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>

        {/* 6. 標籤 */}
        <button
          type="button"
          onClick={() => setActivePicker('tags')}
          className="w-full min-h-[50px] px-4 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-[#FAF9F6] dark:hover:bg-slate-800/40 transition text-left cursor-pointer"
        >
          <span className="w-20 shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
            標籤
          </span>
          <div className="flex-1 min-w-0 text-right">
            {draft.tags.length > 0 ? (
              <span className="text-xs sm:text-sm font-semibold text-teal-700 dark:text-teal-300 truncate block">
                {draft.tags.map((t) => `#${t}`).join(' · ')}
              </span>
            ) : (
              <span className="text-xs text-slate-400 dark:text-slate-500">選填標籤</span>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>

        {/* 7. 收據照片 */}
        {canUploadImages({ canEdit }) && (
          <div className="px-4 sm:px-5 py-3 space-y-2.5">
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onUploadReceipts(e.target.files);
                }
                e.target.value = '';
              }}
            />

            <div className="flex items-center justify-between gap-3">
              <span className="w-20 shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                收據照片
              </span>
              <button
                type="button"
                onClick={() => receiptInputRef.current?.click()}
                disabled={isCompressingReceipts || draft.receiptImages.length >= 5}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-800 hover:border-teal-600 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer ml-auto"
              >
                {isCompressingReceipts ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                    <span>壓縮處理中...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                    <span>
                      {draft.receiptImages.length > 0
                        ? `新增照片 (${draft.receiptImages.length}/5)`
                        : '拍照或上傳收據'}
                    </span>
                  </>
                )}
              </button>
            </div>

            {receiptError && (
              <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 pl-20">
                {receiptError}
              </p>
            )}

            {draft.receiptImages.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto py-1 pl-0 sm:pl-20">
                {draft.receiptImages.map((imgUrl, idx) => (
                  <div
                    key={`${imgUrl}-${idx}`}
                    className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-[#E5E2DC] dark:border-slate-700 shadow-2xs"
                  >
                    <MediaImage
                      src={imgUrl}
                      tripId={trip.id}
                      ownerId={trip.ownerId}
                      collabId={trip.collabId}
                      alt={`收據 ${idx + 1}`}
                      onClick={() => onPreviewReceipt?.(imgUrl, idx)}
                      className={`w-full h-full object-cover ${onPreviewReceipt ? 'cursor-pointer' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveReceipt(idx)}
                      className="absolute top-0.5 right-0.5 w-6 h-6 rounded-full bg-black/70 hover:bg-rose-600 text-white flex items-center justify-center cursor-pointer transition"
                      title="移除此張收據"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 8. 單一描述與備註文字輸入框 */}
        <div className="px-4 sm:px-5 py-3.5">
          <textarea
            rows={3}
            value={draft.description}
            onChange={(e) => onChangeDraft((prev) => ({ ...prev, description: e.target.value }))}
            placeholder={`輸入消費品項或備註（選填，預設：${catMeta.label}）`}
            aria-label="消費品項或備註"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-teal-600 resize-none"
          />
        </div>
      </div>

      {/* 9. 底部固定操作區：儲存 / 再記一筆 */}
      <div className="px-4 sm:px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-3 border-t border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-900/90 flex items-center justify-between gap-2.5 shrink-0">
        {isEditing ? (
          <>
            <div>
              {onDelete && (
                confirmingDelete ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={onDelete}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                    >
                      確認刪除
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="min-h-[40px] px-2.5 py-1.5 text-xs text-slate-500 cursor-pointer"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold flex items-center gap-1 cursor-pointer transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>刪除</span>
                  </button>
                )
              )}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onCancel}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!canEdit || parsedAmount <= 0}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition"
              >
                <Check className="w-4 h-4" />
                <span>儲存變更</span>
              </button>
            </div>
          </>
        ) : (
          <div className="w-full flex items-center gap-2.5">
            <button
              type="button"
              disabled={!canEdit || parsedAmount <= 0}
              onClick={() => onSave(true)}
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-teal-700 dark:border-teal-500 text-teal-800 dark:text-teal-300 bg-white dark:bg-slate-900 hover:bg-teal-50 dark:hover:bg-teal-950/40 disabled:opacity-40 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-98"
            >
              <Plus className="w-4 h-4" />
              <span>再記一筆</span>
            </button>
            <button
              type="submit"
              disabled={!canEdit || parsedAmount <= 0}
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-40 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition active:scale-98"
            >
              <Check className="w-4 h-4" />
              <span>儲存</span>
            </button>
          </div>
        )}
      </div>
    </form>
  );
};
