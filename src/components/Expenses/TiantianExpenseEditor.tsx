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
  IosNavBar,
  IosInsetGroup,
  IosCheckmarkRow,
  IosToggleRow,
} from '../UI/IosPrimitives';
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

/**
 * Safely parse numeric amounts or simple inline arithmetic expressions (e.g. "1,500", "850+320", "1200*2").
 * Avoids turning "1,500" into "1.5" by treating thousands-grouped commas as thousands separators.
 */
export const evaluateExpenseAmount = (raw: string, decimals = 2): number => {
  if (!raw || typeof raw !== 'string') return 0;
  // Normalize fullwidth symbols and ×/÷
  let expr = raw
    .trim()
    .replace(/＋/g, '+')
    .replace(/[－−]/g, '-')
    .replace(/[×✕＊xX]/g, '*')
    .replace(/[÷／]/g, '/')
    .replace(/\s+/g, '');

  if (!expr) return 0;

  // Handle commas safely:
  // - If decimals === 0 or comma is followed by 3 digits (thousands separator like 1,500), strip commas.
  // - Otherwise treat a lone decimal comma (e.g. 12,50) as a decimal point.
  if (decimals === 0) {
    expr = expr.replace(/,/g, '');
  } else {
    expr = expr.replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1').replace(/,/g, '.');
  }

  // Strip any disallowed characters
  expr = expr.replace(/[^0-9.+\-*/]/g, '');
  if (!expr) return 0;

  // Tokenize numbers and + - * / operators
  const tokens: Array<number | string> = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if ('+-*/'.includes(ch)) {
      // Allow unary minus only at start or right after another operator
      if (ch === '-' && (tokens.length === 0 || typeof tokens[tokens.length - 1] === 'string')) {
        let numStr = '-';
        i++;
        let seenDot = false;
        while (i < expr.length && (/[0-9]/.test(expr[i]) || (expr[i] === '.' && !seenDot))) {
          if (expr[i] === '.') seenDot = true;
          numStr += expr[i++];
        }
        const n = parseFloat(numStr);
        if (Number.isFinite(n)) tokens.push(n);
      } else {
        if (tokens.length > 0 && typeof tokens[tokens.length - 1] === 'number') {
          tokens.push(ch);
        }
        i++;
      }
    } else {
      let numStr = '';
      let seenDot = false;
      while (i < expr.length && (/[0-9]/.test(expr[i]) || (expr[i] === '.' && !seenDot))) {
        if (expr[i] === '.') seenDot = true;
        numStr += expr[i++];
      }
      if (numStr && numStr !== '.') {
        const n = parseFloat(numStr);
        if (Number.isFinite(n)) tokens.push(n);
      } else if (i < expr.length && expr[i] === '.') {
        i++;
      }
    }
  }

  // Drop trailing incomplete operator (e.g. "850+")
  while (tokens.length > 0 && typeof tokens[tokens.length - 1] === 'string') {
    tokens.pop();
  }
  if (tokens.length === 0) return 0;

  // Pass 1: * and /
  const addSub: Array<number | string> = [tokens[0]];
  for (let idx = 1; idx < tokens.length; idx += 2) {
    const op = tokens[idx] as string;
    const rhs = tokens[idx + 1] as number;
    if (typeof rhs !== 'number') break;
    if (op === '*' || op === '/') {
      const lhs = addSub.pop() as number;
      if (op === '*') {
        addSub.push(lhs * rhs);
      } else {
        addSub.push(rhs === 0 ? lhs : lhs / rhs);
      }
    } else {
      addSub.push(op, rhs);
    }
  }

  // Pass 2: + and -
  let result = addSub[0] as number;
  for (let idx = 1; idx < addSub.length; idx += 2) {
    const op = addSub[idx] as string;
    const rhs = addSub[idx + 1] as number;
    if (typeof rhs !== 'number') break;
    if (op === '+') result += rhs;
    else if (op === '-') result -= rhs;
  }

  if (!Number.isFinite(result) || result <= 0) return 0;
  const factor = Math.pow(10, Math.max(0, decimals));
  return Math.round(result * factor) / factor;
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
  hideFooterSaveCancel?: boolean;
  onPickerActiveChange?: (isSubPickerOpen: boolean) => void;
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
  hideFooterSaveCancel = false,
  onPickerActiveChange,
}) => {
  const [activePicker, setActivePicker] = useState<PickerPanel>('none');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Category picker management states
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingCatKey, setEditingCatKey] = useState<string | null>(null);
  const [editingCatVal, setEditingCatVal] = useState('');
  const [deletingCatKey, setDeletingCatKey] = useState<string | null>(null);

  // Tag picker input states
  const [newTagInput, setNewTagInput] = useState('');

  // Split quick-add companion state
  const [newMemberName, setNewMemberName] = useState('');

  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    onPickerActiveChange?.(activePicker !== 'none');
    return () => {
      onPickerActiveChange?.(false);
    };
  }, [activePicker, onPickerActiveChange]);

  useEffect(() => {
    setActivePicker('none');
    setConfirmingDelete(false);
    setShowNewCatInput(false);
    setNewCatName('');
    setEditingCatKey(null);
    setEditingCatVal('');
    setDeletingCatKey(null);
    setNewTagInput('');
    setNewMemberName('');
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

  const currencyMeta = CURRENCY_MAP[draft.currency];
  const currencyDecimals = currencyMeta?.decimals ?? 0;
  const parsedAmount = evaluateExpenseAmount(draft.amount, currencyDecimals);
  const hasMathExpression = /[+\-*/×÷＋－＊／]/.test((draft.amount || '').trim().slice(1));
  const convertedPreview = convertAmount(parsedAmount, draft.currency, baseCurrency, trip.customExchangeRates);
  const catMeta = resolveExpenseCategoryMeta(draft.category, trip);
  const accountMeta = EXPENSE_ACCOUNT_MAP[draft.paymentMethod] || EXPENSE_ACCOUNT_MAP.cash;
  const isSplitMode = !trip.isSoloTrip && Boolean(trip.isSplitEnabled);

  const handleAmountChange = (rawVal: string) => {
    // Allow digits, commas, dots (even for zero-decimal math like `1.08*500`), and operators (+ - * / × ÷ x)
    const cleaned = rawVal
      .replace(/＋/g, '+')
      .replace(/[－−]/g, '-')
      .replace(/[×✕＊xX]/g, '*')
      .replace(/[÷／]/g, '/')
      .replace(/[^0-9.,+\-*/]/g, '');

    onChangeDraft((prev) => ({ ...prev, amount: cleaned }));
  };

  const handleAmountBlur = () => {
    if (!draft.amount.trim()) return;
    if (hasMathExpression || draft.amount.includes(',') || (currencyDecimals === 0 && draft.amount.includes('.'))) {
      const evaluated = evaluateExpenseAmount(draft.amount, currencyDecimals);
      if (evaluated > 0) {
        onChangeDraft((prev) => ({ ...prev, amount: String(evaluated) }));
      }
    }
  };

  const handleSelectCurrency = (nextCode: string) => {
    const nextDecimals = CURRENCY_MAP[nextCode]?.decimals ?? 0;
    onChangeDraft((prev) => {
      let nextAmount = prev.amount;
      if (nextDecimals === 0 && nextAmount.trim()) {
        const evaluated = evaluateExpenseAmount(nextAmount, 0);
        nextAmount = evaluated > 0 ? String(evaluated) : nextAmount.replace(/,/g, '').split('.')[0];
      }
      return { ...prev, currency: nextCode, amount: nextAmount };
    });
    setActivePicker('none');
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
    if (
      DEFAULT_EXPENSE_CATEGORIES[trimmed] ||
      customCategories.some((c) => c !== oldKey && c.toLowerCase() === trimmed.toLowerCase())
    ) {
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
      const updatedExpenses = trip.expenses.map((e) =>
        e.category === catKey ? { ...e, category: 'other' } : e
      );
      onUpdateTrip({
        ...trip,
        customExpenseCategories: customCategories.filter((c) => c !== catKey),
        expenses: updatedExpenses,
        updatedAt: Date.now(),
      });
      if (draft.category === catKey) {
        onChangeDraft((prev) => ({ ...prev, category: 'food' }));
      }
      setDeletingCatKey(null);
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
    const cleanedExpenses = (trip.expenses || []).map((ex) => {
      if (!ex.tags || !ex.tags.includes(tag)) return ex;
      const nextTags = ex.tags.filter((t) => t !== tag);
      return { ...ex, tags: nextTags.length > 0 ? nextTags : undefined };
    });
    onUpdateTrip({
      ...trip,
      customExpenseTags: customTags.filter((t) => t !== tag),
      expenses: cleanedExpenses,
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

  // ================= SUB-PICKER PANEL VIEWS (iOS Push Lists inside Sheet) =================
  if (activePicker !== 'none') {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#FAF9F6] dark:bg-[#0B1120]">
        {activePicker === 'date' && (
          <>
            <IosNavBar
              title="選擇消費日期"
              leftLabel="返回"
              leftIcon={<ChevronLeft className="w-4 h-4" />}
              onLeftClick={() => setActivePicker('none')}
              rightLabel="完成"
              onRightClick={() => setActivePicker('none')}
            />
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
              <IosInsetGroup header="自訂日期">
                <div className="px-4 py-2.5 flex items-center justify-between gap-3 min-h-[48px]">
                  <span className="text-sm sm:text-xs font-semibold text-slate-700 dark:text-slate-300">
                    消費日
                  </span>
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(e) => onChangeDraft((prev) => ({ ...prev, date: e.target.value }))}
                    className="bg-transparent text-right text-[16px] sm:text-xs font-mono tabular-nums font-bold text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </IosInsetGroup>

              <IosInsetGroup header="快速選擇行程天數">
                <IosCheckmarkRow
                  icon={<Calendar className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
                  label="今天"
                  trailingMeta={
                    <span className="text-[11px] font-mono tabular-nums text-slate-400">
                      {todayStr.slice(5).replace('-', '/')}
                    </span>
                  }
                  selected={draft.date === todayStr}
                  onSelect={() => {
                    onChangeDraft((prev) => ({ ...prev, date: todayStr }));
                    setActivePicker('none');
                  }}
                />
                {(trip.days || []).map((d) => (
                  <IosCheckmarkRow
                    key={d.id}
                    label={`Day ${d.dayNumber}`}
                    subtitle={d.theme}
                    trailingMeta={
                      <span className="text-[11px] font-mono tabular-nums text-slate-400">
                        {d.date.slice(5).replace('-', '/')}
                      </span>
                    }
                    selected={draft.date === d.date}
                    onSelect={() => {
                      onChangeDraft((prev) => ({ ...prev, date: d.date }));
                      setActivePicker('none');
                    }}
                  />
                ))}
              </IosInsetGroup>
            </div>
          </>
        )}

        {activePicker === 'currency' && (
          <>
            <IosNavBar
              title="選擇消費幣別"
              leftLabel="返回"
              leftIcon={<ChevronLeft className="w-4 h-4" />}
              onLeftClick={() => setActivePicker('none')}
            />
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
              <IosInsetGroup>
                {SUPPORTED_CURRENCIES.map((cur) => (
                  <IosCheckmarkRow
                    key={cur.code}
                    icon={<span className="text-base leading-none">{cur.flag}</span>}
                    label={`${cur.code} · ${cur.name}`}
                    trailingMeta={
                      <span className="text-xs font-mono text-slate-500">{cur.symbol}</span>
                    }
                    selected={draft.currency === cur.code}
                    onSelect={() => handleSelectCurrency(cur.code)}
                  />
                ))}
              </IosInsetGroup>
            </div>
          </>
        )}

        {activePicker === 'category' && (
          <>
            <IosNavBar
              title="選擇消費類別"
              leftLabel="返回"
              leftIcon={<ChevronLeft className="w-4 h-4" />}
              onLeftClick={() => setActivePicker('none')}
              rightSlot={
                <div className="flex items-center gap-1">
                  {onOpenManageCategoriesModal && (
                    <button
                      type="button"
                      onClick={onOpenManageCategoriesModal}
                      className="min-h-[38px] px-2 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                    >
                      管理
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowNewCatInput((v) => !v)}
                    className="min-h-[38px] px-2 py-1 rounded-lg text-xs font-bold text-teal-700 dark:text-teal-400 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>自訂</span>
                  </button>
                </div>
              }
            />
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
              {showNewCatInput && (
                <IosInsetGroup header="新增自訂類別">
                  <div className="px-4 py-2.5 flex items-center gap-2 min-h-[48px]">
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
                      placeholder="輸入新類別（如：居酒屋、伴手禮）"
                      autoFocus
                      className="min-w-0 flex-1 bg-transparent text-[16px] sm:text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomCategory}
                      className="min-h-[36px] px-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer shrink-0"
                    >
                      加入
                    </button>
                  </div>
                </IosInsetGroup>
              )}

              <IosInsetGroup header="預設類別">
                {Object.keys(DEFAULT_EXPENSE_CATEGORIES).map((catKey) => {
                  const meta = resolveExpenseCategoryMeta(catKey, trip);
                  return (
                    <IosCheckmarkRow
                      key={catKey}
                      icon={<meta.Icon className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
                      label={meta.label}
                      selected={draft.category === catKey}
                      onSelect={() => {
                        onChangeDraft((prev) => ({ ...prev, category: catKey }));
                        setActivePicker('none');
                      }}
                    />
                  );
                })}
              </IosInsetGroup>

              {customCategories.length > 0 && (
                <IosInsetGroup header={`自訂類別 (${customCategories.length})`}>
                  {customCategories.map((catKey) => {
                    const isSel = draft.category === catKey;
                    const displayName = trip.customCategoryLabels?.[catKey] || catKey;

                    if (editingCatKey === catKey) {
                      return (
                        <div key={catKey} className="px-4 py-2 min-h-[48px] flex items-center gap-2 bg-amber-50/60 dark:bg-amber-950/30">
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
                            className="flex-1 min-w-0 bg-transparent text-[16px] sm:text-xs font-bold outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleRenameCustomCategory(catKey)}
                            className="min-h-[34px] px-2.5 rounded-lg bg-teal-700 text-white text-xs font-bold cursor-pointer"
                          >
                            儲存
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCatKey(null)}
                            className="min-h-[34px] min-w-[34px] flex items-center justify-center text-slate-500 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    }

                    if (deletingCatKey === catKey) {
                      const usageCount = trip.expenses.filter((e) => e.category === catKey).length;
                      return (
                        <div key={catKey} className="px-4 py-2.5 min-h-[48px] flex items-center justify-between gap-2 bg-rose-50/80 dark:bg-rose-950/35 text-xs">
                          <div className="min-w-0">
                            <span className="font-semibold text-rose-800 dark:text-rose-200 block truncate">
                              刪除「{displayName}」？
                            </span>
                            {usageCount > 0 && (
                              <span className="text-[10px] text-rose-700/80 dark:text-rose-300/80 block">
                                {usageCount} 筆消費將歸入「其他雜支」
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomCategory(catKey)}
                              className="min-h-[34px] px-2.5 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                            >
                              刪除
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingCatKey(null)}
                              className="min-h-[34px] px-2 rounded-lg text-slate-600 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={catKey} className="flex items-center">
                        <div className="flex-1 min-w-0">
                          <IosCheckmarkRow
                            icon={<Tag className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
                            label={displayName}
                            selected={isSel}
                            onSelect={() => {
                              onChangeDraft((prev) => ({ ...prev, category: catKey }));
                              setActivePicker('none');
                            }}
                          />
                        </div>
                        <div className="flex items-center pr-2 gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setDeletingCatKey(null);
                              setEditingCatKey(catKey);
                              setEditingCatVal(displayName);
                            }}
                            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-slate-400 hover:text-teal-700 cursor-pointer"
                            title="改名"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCatKey(null);
                              setDeletingCatKey(catKey);
                            }}
                            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                            title="刪除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </IosInsetGroup>
              )}
            </div>
          </>
        )}

        {activePicker === 'account' && (
          <>
            <IosNavBar
              title="選擇支付帳戶"
              leftLabel="返回"
              leftIcon={<ChevronLeft className="w-4 h-4" />}
              onLeftClick={() => setActivePicker('none')}
            />
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
              <IosInsetGroup>
                {EXPENSE_ACCOUNTS.map((acc) => {
                  const AccIcon = acc.Icon || Coins;
                  return (
                    <IosCheckmarkRow
                      key={acc.key}
                      icon={<AccIcon className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
                      label={getAccountLabel(acc.key, lang)}
                      selected={draft.paymentMethod === acc.key}
                      onSelect={() => {
                        onChangeDraft((prev) => ({ ...prev, paymentMethod: acc.key }));
                        setActivePicker('none');
                      }}
                    />
                  );
                })}
              </IosInsetGroup>
            </div>
          </>
        )}

        {activePicker === 'member' && (
          <>
            <IosNavBar
              title="成員與分帳歸屬"
              leftLabel="返回"
              leftIcon={<ChevronLeft className="w-4 h-4" />}
              onLeftClick={() => setActivePicker('none')}
              rightLabel="完成"
              onRightClick={() => setActivePicker('none')}
            />
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
              {!isSplitMode ? (
                <IosInsetGroup>
                  <div className="p-5 text-center space-y-3">
                    <Users className="w-8 h-8 text-teal-700 dark:text-teal-400 mx-auto" />
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">目前為個人獨旅模式</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
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
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer transition"
                      >
                        啟用朋友分帳模式
                      </button>
                    )}
                  </div>
                </IosInsetGroup>
              ) : (
                <>
                  <IosInsetGroup>
                    <IosToggleRow
                      label="此筆為個人私費"
                      subtitle="不列入公費與朋友分攤結算"
                      checked={draft.isPersonal}
                      onChange={(next) =>
                        onChangeDraft((prev) => ({ ...prev, isPersonal: next }))
                      }
                    />
                  </IosInsetGroup>

                  {!draft.isPersonal && (
                    <>
                      <IosInsetGroup header="代墊付款人">
                        {splitMembersList.map((m) => (
                          <IosCheckmarkRow
                            key={m}
                            label={m}
                            selected={draft.paidBy === m}
                            onSelect={() => onChangeDraft((prev) => ({ ...prev, paidBy: m }))}
                          />
                        ))}
                      </IosInsetGroup>

                      <IosInsetGroup
                        header="參與分攤成員"
                        headerRight={
                          <button
                            type="button"
                            onClick={() =>
                              onChangeDraft((prev) => ({
                                ...prev,
                                splitWith:
                                  prev.splitWith.length === splitMembersList.length
                                    ? [splitMembersList[0] || '我']
                                    : splitMembersList,
                              }))
                            }
                            className="text-teal-700 dark:text-teal-400 text-[11px] font-bold hover:underline cursor-pointer"
                          >
                            {draft.splitWith.length === splitMembersList.length ? '只選自己' : '全體均分'}
                          </button>
                        }
                        footer={
                          parsedAmount > 0 && draft.splitWith.length > 0
                            ? `每人應攤約 ${formatCurrencyAmount(convertedPreview / draft.splitWith.length, baseCurrency)}`
                            : undefined
                        }
                      >
                        {splitMembersList.map((m) => {
                          const included = draft.splitWith.includes(m);
                          return (
                            <IosCheckmarkRow
                              key={m}
                              label={m}
                              selected={included}
                              onSelect={() =>
                                onChangeDraft((prev) => {
                                  if (prev.splitWith.includes(m)) {
                                    if (prev.splitWith.length <= 1) return prev;
                                    return { ...prev, splitWith: prev.splitWith.filter((x) => x !== m) };
                                  }
                                  return { ...prev, splitWith: [...prev.splitWith, m] };
                                })
                              }
                            />
                          );
                        })}
                      </IosInsetGroup>

                      <IosInsetGroup header="新增同行旅伴">
                        <div className="px-4 py-2.5 flex items-center gap-2 min-h-[48px]">
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
                            placeholder="輸入旅伴名稱..."
                            className="flex-1 min-w-0 bg-transparent text-[16px] sm:text-xs outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleAddSplitMember}
                            disabled={!newMemberName.trim()}
                            className="min-h-[36px] px-3 rounded-xl bg-teal-700 text-white text-xs font-bold disabled:opacity-40 cursor-pointer shrink-0"
                          >
                            加入
                          </button>
                        </div>
                      </IosInsetGroup>
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {activePicker === 'tags' && (
          <>
            <IosNavBar
              title="選擇支出標籤"
              subtitle={draft.tags.length > 0 ? `已選 ${draft.tags.length} 個` : undefined}
              leftLabel="返回"
              leftIcon={<ChevronLeft className="w-4 h-4" />}
              onLeftClick={() => setActivePicker('none')}
              rightLabel="完成"
              onRightClick={() => setActivePicker('none')}
            />
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
              <IosInsetGroup header="新增自訂標籤">
                <div className="px-4 py-2.5 flex items-center gap-2 min-h-[48px]">
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
                    placeholder="如：退稅、朋友託買、夜市..."
                    className="flex-1 min-w-0 bg-transparent text-[16px] sm:text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomTag}
                    disabled={!newTagInput.trim()}
                    className="min-h-[36px] px-3 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white text-xs font-bold cursor-pointer shrink-0"
                  >
                    新增
                  </button>
                </div>
              </IosInsetGroup>

              <IosInsetGroup header="點選複選標籤">
                {allAvailableTags.map((tag) => {
                  const isSel = draft.tags.includes(tag);
                  const isCustom = customTags.includes(tag);
                  return (
                    <div key={tag} className="flex items-center">
                      <div className="flex-1 min-w-0">
                        <IosCheckmarkRow
                          icon={<Tag className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />}
                          label={`#${tag}`}
                          selected={isSel}
                          onSelect={() => handleToggleTag(tag)}
                        />
                      </div>
                      {isCustom && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomTagFromTrip(tag)}
                          className="min-w-[40px] min-h-[40px] mr-1 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                          title="移除自訂標籤"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </IosInsetGroup>
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
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                required
                value={draft.amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                onBlur={handleAmountBlur}
                placeholder="0（支援 850+320）"
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

          {(hasMathExpression || (parsedAmount > 0 && draft.currency !== baseCurrency)) && (
            <div className="flex items-center justify-end gap-2.5 flex-wrap">
              {hasMathExpression && parsedAmount > 0 && (
                <button
                  type="button"
                  onClick={handleAmountBlur}
                  className="text-[11px] font-mono tabular-nums font-bold px-2 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-200/80 dark:border-teal-800 text-teal-800 dark:text-teal-300 cursor-pointer"
                  title="點擊套用計算結果"
                >
                  = {formatCurrencyAmount(parsedAmount, draft.currency)}
                </button>
              )}
              {parsedAmount > 0 && draft.currency !== baseCurrency && (
                <span className="text-[11px] font-mono tabular-nums font-semibold text-teal-700 dark:text-teal-300">
                  ≈ {formatCurrencyAmount(convertedPreview, baseCurrency)}
                </span>
              )}
            </div>
          )}

          {/* Quick Tax-Free / Tax-Included / Split Calculator Strip */}
          {canEdit && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-0.5">
              {(
                [
                  {
                    label: '免稅 -10%',
                    title: '含 10% 消費稅價格換算為未稅價 (÷1.1)',
                    apply: (v: number) => v / 1.1,
                  },
                  {
                    label: '免稅 -8%',
                    title: '含 8% 飲食外帶稅換算為未稅價 (÷1.08)',
                    apply: (v: number) => v / 1.08,
                  },
                  {
                    label: '含稅 +10%',
                    title: '未稅價加上 10% 消費稅 (×1.1)',
                    apply: (v: number) => v * 1.1,
                  },
                  {
                    label: '÷2 均分',
                    title: '金額除以 2',
                    apply: (v: number) => v / 2,
                  },
                  ...(isSplitMode && splitMembersList.length > 2
                    ? [
                        {
                          label: `÷${splitMembersList.length} 人`,
                          title: `金額除以 ${splitMembersList.length} 位旅伴`,
                          apply: (v: number) => v / splitMembersList.length,
                        },
                      ]
                    : []),
                ] as const
              ).map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  disabled={parsedAmount <= 0}
                  title={chip.title}
                  onClick={() => {
                    if (parsedAmount <= 0) return;
                    const factor = Math.pow(10, Math.max(0, currencyDecimals));
                    const nextVal = Math.round(chip.apply(parsedAmount) * factor) / factor;
                    if (nextVal > 0) {
                      onChangeDraft((prev) => ({ ...prev, amount: String(nextVal) }));
                    }
                  }}
                  className="min-h-[30px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700 hover:border-teal-600 disabled:opacity-35 text-[11px] font-semibold font-mono tabular-nums text-slate-700 dark:text-slate-200 hover:text-teal-700 dark:hover:text-teal-300 shrink-0 transition cursor-pointer"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 3. 類別 */}
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

        {/* 4. 帳戶 */}
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
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-[16px] sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-teal-600 resize-none"
          />
        </div>
      </div>

      {/* 9. 底部操作區 */}
      {(!hideFooterSaveCancel || (isEditing && onDelete) || !isEditing) && (
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
                        className="min-h-[44px] sm:min-h-[40px] px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                      >
                        確認刪除
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(false)}
                        className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 text-xs text-slate-500 cursor-pointer"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(true)}
                      className="min-h-[44px] sm:min-h-[40px] px-3.5 py-1.5 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>刪除此筆紀錄</span>
                    </button>
                  )
                )}
              </div>
              {!hideFooterSaveCancel && (
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
              )}
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
                <span>儲存並再記一筆</span>
              </button>
              {!hideFooterSaveCancel && (
                <button
                  type="submit"
                  disabled={!canEdit || parsedAmount <= 0}
                  className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:opacity-40 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition active:scale-98"
                >
                  <Check className="w-4 h-4" />
                  <span>儲存</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </form>
  );
};
