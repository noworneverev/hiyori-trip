import React, { useState, useEffect, useRef } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { Trip, ExpenseItem, PaymentMethod } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { compressImageFile } from '../../utils/image';
import { canUploadImages } from '../../utils/userPermissions';
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_MAP,
  convertAmount,
  detectTripCurrency,
} from '../../utils/currency';
import {
  X,
  DollarSign,
  Plus,
  Trash2,
  Check,
  CheckSquare,
  Utensils,
  Train,
  ShoppingBag,
  Ticket,
  Gift,
  Bed,
  MoreHorizontal,
  CreditCard,
  Wallet,
  Smartphone,
  Tag,
  Edit2,
  Users,
  Camera,
  ImageIcon,
  Loader2,
  Calendar,
  Maximize2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface TravelQuickActionModalProps {
  trip: Trip;
  lang: Language;
  onUpdateTrip: (updatedTrip: Trip) => void;
  onClose: () => void;
  initialTab?: 'expense' | 'todos';
  onShowToast?: (msg: string) => void;
}

export const getLocalTodayDate = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const CATEGORY_ITEMS = [
  { key: 'food', label: '美食餐飲', icon: Utensils },
  { key: 'transport', label: '交通車資', icon: Train },
  { key: 'shopping', label: '購物商場', icon: ShoppingBag },
  { key: 'tickets', label: '門票票券', icon: Ticket },
  { key: 'souvenir', label: '伴手禮', icon: Gift },
  { key: 'stay', label: '住宿飯店', icon: Bed },
  { key: 'other', label: '其他雜支', icon: MoreHorizontal },
];

const COMMON_EXPENSE_PRESETS = [
  { title: '超商飲料', category: 'food' },
  { title: '午餐', category: 'food' },
  { title: '晚餐', category: 'food' },
  { title: '咖啡點心', category: 'food' },
  { title: '地鐵車資', category: 'transport' },
  { title: '藥妝購物', category: 'shopping' },
  { title: '景點門票', category: 'tickets' },
  { title: '名產伴手禮', category: 'souvenir' },
];

const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: React.ElementType }[] = [
  { key: 'cash', label: '現金', icon: Wallet },
  { key: 'card', label: '信用卡', icon: CreditCard },
  { key: 'mobile', label: '行動支付', icon: Smartphone },
  { key: 'ic_card', label: '交通卡', icon: Tag },
];

export const TravelQuickActionModal: React.FC<TravelQuickActionModalProps> = ({
  trip,
  lang,
  onUpdateTrip,
  onClose,
  initialTab = 'expense',
  onShowToast,
}) => {
  useBodyScrollLock(true);
  // Default to 'expense'
  const [activeTab, setActiveTab] = useState<'expense' | 'todos'>(initialTab);

  // Auto-detect trip currency (e.g. EUR for Europe, JPY for Japan, USD for USA, or trip.currency)
  const defaultTripCurrency = detectTripCurrency(trip);
  const [expenseCur, setExpenseCur] = useState<string>(defaultTripCurrency);

  // --- 1. Fast Expense States ---
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [expenseTitle, setExpenseTitle] = useState<string>('');
  const [expenseNotes, setExpenseNotes] = useState<string>('');
  const [expenseCat, setExpenseCat] = useState<string>('food');
  const [expensePayment, setExpensePayment] = useState<PaymentMethod>('cash');
  const [expenseDate, setExpenseDate] = useState<string>(() => getLocalTodayDate());
  const amountInputRef = useRef<HTMLInputElement | null>(null);

  // Smooth focus on mount / tab change without aggressive scroll jumps
  useEffect(() => {
    if (activeTab === 'expense') {
      const timer = setTimeout(() => {
        amountInputRef.current?.focus({ preventScroll: true });
      }, 180);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  // Adaptive font sizing based on length of input value
  const getAmountFontSize = (val: string) => {
    const raw = val.replace(/[^0-9]/g, '');
    const len = raw.length;
    if (len >= 10) return 'text-base sm:text-lg';
    if (len >= 7) return 'text-lg sm:text-xl';
    if (len >= 5) return 'text-xl sm:text-2xl';
    return 'text-2xl sm:text-3xl';
  };

  // Quick preset increments based on currency denomination
  const quickPresets = React.useMemo(() => {
    if (['JPY', 'KRW', 'VND', 'IDR'].includes(expenseCur)) {
      return [500, 1000, 5000, 10000];
    }
    if (['TWD', 'THB', 'PHP', 'INR'].includes(expenseCur)) {
      return [50, 100, 500, 1000];
    }
    return [5, 10, 20, 50];
  }, [expenseCur]);

  const handleAmountChange = (val: string) => {
    let cleaned = val.replace(/,/g, '.');
    cleaned = cleaned.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    if (['JPY', 'KRW', 'VND'].includes(expenseCur) && cleaned.includes('.')) {
      cleaned = cleaned.split('.')[0];
    }
    setExpenseAmount(cleaned);
  };

  const handleQuickIncrement = (delta: number) => {
    const current = parseFloat(expenseAmount) || 0;
    const next = Math.round((current + delta) * 100) / 100;
    setExpenseAmount(String(next));
  };

  const handleClearAmount = () => {
    setExpenseAmount('');
    amountInputRef.current?.focus({ preventScroll: true });
  };

  // Custom Category & Editing States in Quick Modal
  const [showQuickNewCat, setShowQuickNewCat] = useState<boolean>(false);
  const [quickNewCatName, setQuickNewCatName] = useState<string>('');
  const [isManagingCats, setIsManagingCats] = useState<boolean>(false);
  const [editingCatName, setEditingCatName] = useState<string | null>(null);
  const [catRenameVal, setCatRenameVal] = useState<string>('');

  // Ensure default date is always today's date when opening or switching tabs
  useEffect(() => {
    setExpenseDate(getLocalTodayDate());
  }, [initialTab]);

  // Receipts / Invoice Upload States
  const [receiptImages, setReceiptImages] = useState<string[]>([]);
  const [isCompressingReceipts, setIsCompressingReceipts] = useState<boolean>(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  // Friend split states in Quick Modal
  const splitMembersList = React.useMemo(() => {
    return trip.splitMembers && trip.splitMembers.length > 0
      ? trip.splitMembers
      : ['我', '同行旅伴'];
  }, [trip.splitMembers]);

  const [quickPaidBy, setQuickPaidBy] = useState<string>('我');
  const [quickSplitWith, setQuickSplitWith] = useState<string[]>(['我', '同行旅伴']);
  const [quickIsPersonal, setQuickIsPersonal] = useState<boolean>(false);

  // Sync split with members list when trip updates
  React.useEffect(() => {
    if (splitMembersList.length > 0) {
      setQuickSplitWith(splitMembersList);
    }
  }, [splitMembersList]);

  // Handle uploading receipt/invoice photos
  const handleReceiptFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsCompressingReceipts(true);
    try {
      const compressedList: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressed = await compressImageFile(file, 840, 0.68);
        compressedList.push(compressed);
      }
      setReceiptImages((prev) => [...prev, ...compressedList]);
      if (onShowToast) {
        onShowToast(`已上傳 ${files.length} 張發票收據！`);
      }
    } catch (err) {
      console.error('Failed to compress receipt images:', err);
      if (onShowToast) {
        onShowToast('發票上傳失敗，請再試一次');
      }
    } finally {
      setIsCompressingReceipts(false);
      e.target.value = '';
    }
  };

  const handleRemoveReceiptImage = (indexToRemove: number) => {
    setReceiptImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const customCategories = trip.customExpenseCategories || [];

  const handleAddQuickCategory = () => {
    const trimmed = quickNewCatName.trim();
    if (!trimmed) return;
    if (CATEGORY_ITEMS.some((c) => c.key === trimmed) || customCategories.includes(trimmed)) {
      setExpenseCat(trimmed);
      setQuickNewCatName('');
      setShowQuickNewCat(false);
      return;
    }
    const updated = [...customCategories, trimmed];
    onUpdateTrip({
      ...trip,
      customExpenseCategories: updated,
      updatedAt: Date.now(),
    });
    setExpenseCat(trimmed);
    setQuickNewCatName('');
    setShowQuickNewCat(false);
    onShowToast?.(`已新增自訂類別「${trimmed}」`);
  };

  const handleRenameQuickCategory = (oldCat: string, newCat: string) => {
    const trimmed = newCat.trim();
    if (!trimmed || trimmed === oldCat) {
      setEditingCatName(null);
      return;
    }
    const updatedCats = customCategories.map((c) => (c === oldCat ? trimmed : c));
    const updatedExpenses = trip.expenses.map((e) =>
      e.category === oldCat ? { ...e, category: trimmed } : e
    );
    onUpdateTrip({
      ...trip,
      customExpenseCategories: updatedCats,
      expenses: updatedExpenses,
      updatedAt: Date.now(),
    });
    if (expenseCat === oldCat) {
      setExpenseCat(trimmed);
    }
    setEditingCatName(null);
    onShowToast?.(`已將類別「${oldCat}」修改為「${trimmed}」`);
  };

  const handleDeleteQuickCategory = (catToDelete: string) => {
    const updatedCats = customCategories.filter((c) => c !== catToDelete);
    onUpdateTrip({
      ...trip,
      customExpenseCategories: updatedCats,
      updatedAt: Date.now(),
    });
    if (expenseCat === catToDelete) {
      setExpenseCat('food');
    }
    onShowToast?.(`已刪除類別「${catToDelete}」`);
  };

  const parsedAmount = parseFloat(expenseAmount) || 0;
  const convertedToTwd = convertAmount(parsedAmount, expenseCur, 'TWD', trip.customExchangeRates);

  const handleSaveQuickExpense = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) return;

    const matchedCat = CATEGORY_ITEMS.find((c) => c.key === expenseCat);
    const isSplitMode = !trip.isSoloTrip && Boolean(trip.isSplitEnabled);

    const newExpense: ExpenseItem = {
      id: `exp-${Date.now()}`,
      title: expenseTitle.trim() || matchedCat?.label || (customCategories.includes(expenseCat) ? expenseCat : '旅途隨手支出'),
      amount: parsedAmount,
      currency: expenseCur,
      category: expenseCat,
      paymentMethod: expensePayment,
      date: expenseDate,
      convertedAmount: convertAmount(parsedAmount, expenseCur, trip.currency || 'TWD', trip.customExchangeRates),
      notes: expenseNotes.trim() || undefined,
      receiptImages: receiptImages.length > 0 ? receiptImages : undefined,
      receiptImage: receiptImages.length > 0 ? receiptImages[0] : undefined,
      paidBy: isSplitMode ? (quickPaidBy || '我') : undefined,
      splitWith: isSplitMode && !quickIsPersonal
        ? (quickSplitWith.length > 0 ? quickSplitWith : splitMembersList)
        : undefined,
      isPersonal: !isSplitMode ? true : quickIsPersonal,
    };

    onUpdateTrip({
      ...trip,
      expenses: [newExpense, ...trip.expenses],
      updatedAt: Date.now(),
    });

    if (onShowToast) {
      const receiptSuffix = receiptImages.length > 0 ? ` · 附 ${receiptImages.length} 張發票` : '';
      if (isSplitMode && !quickIsPersonal) {
        onShowToast(
          `已記帳並分攤：${expenseCur} ${parsedAmount.toLocaleString()} (${newExpense.title} · 由 ${quickPaidBy} 代墊${receiptSuffix})`
        );
      } else {
        onShowToast(`已記帳：${expenseCur} ${parsedAmount.toLocaleString()} (${newExpense.title}${receiptSuffix})`);
      }
    }

    setExpenseAmount('');
    setExpenseTitle('');
    setExpenseNotes('');
    setReceiptImages([]);
    setExpenseDate(getLocalTodayDate());
    onClose();
  };

  // --- 2. Synced Trip Todos States & Handlers ---
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoDueDate, setNewTodoDueDate] = useState('');
  const [showTodoDatePicker, setShowTodoDatePicker] = useState(false);
  const [showCompletedTodos, setShowCompletedTodos] = useState(false);

  const todos = trip.todos || [];
  const pendingTodos = todos.filter((t) => !t.completed);
  const completedTodos = todos.filter((t) => t.completed);

  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTodoTitle.trim();
    if (!title) return;

    const newTodo = {
      id: `todo-${Date.now()}`,
      title,
      category: 'other' as const,
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

  const handleToggleTodo = (id: string) => {
    const updated = todos.map((t) =>
      t.id === id ? { ...t, completed: !t.completed } : t
    );
    onUpdateTrip({
      ...trip,
      todos: updated,
      updatedAt: Date.now(),
    });
  };

  const handleDeleteTodo = (id: string) => {
    const updated = todos.filter((t) => t.id !== id);
    onUpdateTrip({
      ...trip,
      todos: updated,
      updatedAt: Date.now(),
    });
    onShowToast?.('已刪除待辦事項');
  };

  const handleClearCompletedTodos = () => {
    const remaining = todos.filter((t) => !t.completed);
    onUpdateTrip({
      ...trip,
      todos: remaining,
      updatedAt: Date.now(),
    });
    onShowToast?.('已清除所有已完成項目');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150 overflow-hidden touch-none"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-full sm:max-w-lg bg-white dark:bg-[#1c1c1e] rounded-t-[28px] sm:rounded-3xl shadow-2xl border-t sm:border border-slate-200/80 dark:border-white/10 overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[88vh] overscroll-contain touch-pan-y animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Indicator Handle (visual affordance, locked to sheet) */}
        <div className="sm:hidden pt-2.5 pb-1 bg-teal-800 dark:bg-teal-950 flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/30" />
        </div>

        {/* Top Header */}
        <div className="px-5 py-3.5 bg-teal-800 dark:bg-teal-950 text-white flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-bold tracking-tight">
              旅途隨身手帖
            </h3>
            <p className="text-xs text-teal-200/90 mt-0.5">
              一秒快速記帳 · 行程待辦事項
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'expense' && parsedAmount > 0 && (
              <button
                type="button"
                onClick={() => handleSaveQuickExpense()}
                className="px-3 py-1 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-bold text-xs flex items-center gap-1 transition active:scale-95 shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>儲存</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition active:scale-95"
              aria-label="關閉"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Clean Segmented Tab Switcher (Expense & Todos) */}
        <div className="p-1.5 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 shrink-0 flex items-center gap-1">
          <button
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

        {/* ================= TAB 1: FAST EXPENSE (DEFAULT) ================= */}
        {activeTab === 'expense' && (
          <form onSubmit={handleSaveQuickExpense} className="flex-1 flex flex-col min-h-0 overflow-hidden max-w-full">
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 space-y-3.5 touch-pan-y max-w-full overscroll-contain">
              {/* Currency Quick Bar & Amount Input */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-2 max-w-full overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">
                    記帳幣別：
                  </span>
                  {/* Currency selector chips & dropdown */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar scroll-smooth max-w-full overscroll-x-contain touch-pan-x">
                    {['EUR', 'JPY', 'USD', 'KRW', 'GBP', 'THB', 'TWD'].map((code) => {
                      const meta = CURRENCY_MAP[code];
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setExpenseCur(code)}
                          className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border transition shrink-0 ${
                            expenseCur === code
                              ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {meta?.flag} {code}
                        </button>
                      );
                    })}
                    <select
                      value={expenseCur}
                      onChange={(e) => setExpenseCur(e.target.value)}
                      className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 shrink-0"
                    >
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.code} ({c.name})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Amount input: dynamic adaptive font size with smooth mobile keyboard interaction */}
                <div className="flex items-center rounded-2xl bg-white dark:bg-slate-900 border-2 border-teal-600/80 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 overflow-hidden shadow-xs min-h-[52px] sm:min-h-[56px] transition-all">
                  <span className="inline-flex items-center justify-center px-3.5 self-stretch bg-teal-50 dark:bg-teal-950/60 border-r border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 font-bold font-mono text-base select-none shrink-0">
                    {CURRENCY_MAP[expenseCur]?.symbol || expenseCur}
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
                    value={expenseAmount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="0.00"
                    className={`flex-1 px-3.5 py-2 bg-transparent font-bold font-mono tabular-nums text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:text-sm sm:placeholder:text-base placeholder:font-normal outline-none min-w-0 transition-all ${getAmountFontSize(expenseAmount)}`}
                  />
                  {expenseAmount && (
                    <button
                      type="button"
                      onClick={handleClearAmount}
                      className="p-1.5 mr-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition active:scale-95 shrink-0 cursor-pointer"
                      aria-label="清除金額"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <span className="inline-flex items-center pr-3.5 text-xs font-bold text-slate-400 font-mono shrink-0 select-none">
                    {expenseCur}
                  </span>
                </div>

                {/* Quick Amount Increment Chips */}
                <div className="flex items-center gap-1.5 pt-0.5 overflow-x-auto no-scrollbar overscroll-x-contain touch-pan-x">
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium shrink-0">快速累加:</span>
                  {quickPresets.map((delta) => (
                    <button
                      key={delta}
                      type="button"
                      onClick={() => handleQuickIncrement(delta)}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800/90 hover:bg-teal-50 dark:hover:bg-teal-950/40 text-slate-700 dark:text-slate-200 hover:text-teal-700 dark:hover:text-teal-300 border border-slate-200 dark:border-slate-700 text-xs font-mono font-semibold transition active:scale-95 shadow-2xs shrink-0 cursor-pointer"
                    >
                      +{delta >= 1000 ? `${(delta / 1000).toLocaleString()}k` : delta}
                    </button>
                  ))}
                </div>

                {/* Live Home Currency Conversion line */}
                {parsedAmount > 0 && expenseCur !== 'TWD' && (
                  <div className="text-[11px] font-mono text-teal-800 dark:text-teal-300 font-bold flex items-center justify-between pt-0.5 px-1">
                    <span>
                      折合台幣約 ≈ NT$ {Math.round(convertedToTwd).toLocaleString()}
                    </span>
                    <span className="text-slate-400 font-normal">
                      (1 {expenseCur} ≈ {(convertAmount(1000, expenseCur, 'TWD', trip.customExchangeRates) / 1000).toFixed(2)} TWD)
                    </span>
                  </div>
                )}
              </div>

            {/* 2. 付款方式 (Method) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                付款方式：
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {PAYMENT_METHODS.map((pm) => {
                  const Icon = pm.icon;
                  const isSelected = expensePayment === pm.key;
                  return (
                    <button
                      key={pm.key}
                      type="button"
                      onClick={() => setExpensePayment(pm.key)}
                      className={`py-2 px-1.5 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{pm.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. 消費種類 (Category) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  消費種類：
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowQuickNewCat(!showQuickNewCat)}
                    className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" />
                    <span>新增自訂</span>
                  </button>
                  {customCategories.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsManagingCats(!isManagingCats)}
                      className={`text-[11px] flex items-center gap-0.5 px-1.5 py-0.5 rounded transition ${
                        isManagingCats
                          ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-bold'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      <Edit2 className="w-2.5 h-2.5" />
                      <span>{isManagingCats ? '完成修改' : '編輯類別'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Inline Add Custom Category */}
              {showQuickNewCat && (
                <div className="flex items-center gap-1.5 p-1.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 animate-in fade-in duration-100">
                  <input
                    type="text"
                    value={quickNewCatName}
                    onChange={(e) => setQuickNewCatName(e.target.value)}
                    placeholder="輸入新類別 (如：居酒屋、扭蛋)"
                    className="flex-1 px-2.5 py-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-600 text-xs outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddQuickCategory();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddQuickCategory}
                    className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold"
                  >
                    新增
                  </button>
                </div>
              )}

              {/* Category Grid */}
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                {CATEGORY_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isSelected = expenseCat === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setExpenseCat(item.key)}
                      className={`py-2 px-1 rounded-xl text-xs font-bold border transition flex flex-col items-center justify-center gap-1 ${
                        isSelected
                          ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[11px] truncate">{item.label}</span>
                    </button>
                  );
                })}

                {/* Custom Categories */}
                {customCategories.map((catKey) => {
                  const isSelected = expenseCat === catKey;
                  const isEditingThis = editingCatName === catKey;

                  if (isEditingThis) {
                    return (
                      <div
                        key={catKey}
                        className="col-span-2 py-1 px-1.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl flex items-center gap-1"
                      >
                        <input
                          type="text"
                          value={catRenameVal}
                          onChange={(e) => setCatRenameVal(e.target.value)}
                          className="flex-1 px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-xs outline-none"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleRenameQuickCategory(catKey, catRenameVal);
                            }
                          }}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleRenameQuickCategory(catKey, catRenameVal)}
                          className="p-1 bg-amber-600 text-white rounded text-[10px]"
                          title="確認修改"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCatName(null)}
                          className="p-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-[10px]"
                          title="取消"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div key={catKey} className="relative group">
                      <button
                        type="button"
                        onClick={() => setExpenseCat(catKey)}
                        className={`w-full py-2 px-1 rounded-xl text-xs font-bold border transition flex flex-col items-center justify-center gap-1 ${
                          isSelected
                            ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                        }`}
                      >
                        <Tag className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                        <span className="text-[11px] truncate max-w-full px-1">{catKey}</span>
                      </button>

                      {/* Edit / Delete badges for custom category */}
                      {(isManagingCats || isSelected) && (
                        <div className="absolute -top-1.5 -right-1 flex items-center gap-0.5 bg-white dark:bg-slate-900 shadow-sm rounded-md border border-slate-200 dark:border-slate-700 px-0.5 z-10">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCatName(catKey);
                              setCatRenameVal(catKey);
                            }}
                            className="p-0.5 text-slate-500 hover:text-amber-600 transition"
                            title="修改類別名稱"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteQuickCategory(catKey);
                            }}
                            className="p-0.5 text-slate-500 hover:text-rose-600 transition"
                            title="刪除此自訂類別"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. 品項描述 (Description) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                品項描述：
              </label>
              <input
                type="text"
                value={expenseTitle}
                onChange={(e) => setExpenseTitle(e.target.value)}
                placeholder="輸入消費品項描述，如：一蘭拉麵、晴空塔門票、超商飲料..."
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500"
              />
            </div>

            {/* 5. 消費日期 (Date) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>消費日期：</span>
                  <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold bg-teal-50 dark:bg-teal-950/60 px-1.5 py-0.5 rounded-md">
                    預設當天
                  </span>
                </label>
                {expenseDate !== getLocalTodayDate() && (
                  <button
                    type="button"
                    onClick={() => setExpenseDate(getLocalTodayDate())}
                    className="text-[10px] text-teal-600 dark:text-teal-400 hover:underline font-bold"
                  >
                    設為今天
                  </button>
                )}
              </div>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500"
              />
            </div>

            {/* 6. 發票憑證上傳 (僅 n9102125@gmail.com 顯示上傳功能) */}
            {canUploadImages() && (
              <div className="p-3.5 rounded-2xl bg-teal-50/70 dark:bg-slate-800/80 border border-teal-200 dark:border-teal-800/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-teal-900 dark:text-teal-200 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span>發票 / 收據憑證 (選填，支援多張相片)</span>
                  </label>
                  {receiptImages.length > 0 && (
                    <span className="text-[11px] font-bold text-teal-700 dark:text-teal-300">
                      已附加 {receiptImages.length} 張發票
                    </span>
                  )}
                </div>

                {/* Hidden file input (triggers OS-native photo library or camera picker) */}
                <input
                  ref={receiptInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleReceiptFiles}
                  className="hidden"
                />

                {/* Single unified Action Button */}
                <button
                  type="button"
                  onClick={() => receiptInputRef.current?.click()}
                  disabled={isCompressingReceipts}
                  className="w-full py-2.5 px-3 rounded-xl bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 hover:bg-teal-50 dark:hover:bg-slate-800 text-teal-900 dark:text-teal-200 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span>上傳發票收據 (拍照或相簿)</span>
                </button>

                {/* Compressing indicator */}
                {isCompressingReceipts && (
                  <div className="py-1.5 flex items-center justify-center gap-2 text-xs font-bold text-teal-700 dark:text-teal-300">
                    <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                    <span>照片最佳化壓縮中...</span>
                  </div>
                )}

                {/* Thumbnails preview strip */}
                {receiptImages.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto py-1">
                    {receiptImages.map((imgUrl, idx) => (
                      <div
                        key={idx}
                        className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 border-teal-500 shadow-xs group"
                      >
                        <img
                          src={imgUrl}
                          alt={`發票 ${idx + 1}`}
                          onClick={() => setPreviewImage(imgUrl)}
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveReceiptImage(idx)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 hover:bg-rose-600 text-white flex items-center justify-center text-xs transition"
                          title="移除此張發票"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        <span className="absolute bottom-0.5 left-0.5 px-1 rounded bg-black/60 text-[9px] text-white font-mono">
                          #{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Friend Bill Splitting Section */}
            {!trip.isSoloTrip && trip.isSplitEnabled ? (
              <div className="p-3.5 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>🤝 朋友分帳模式</span>
                  </span>
                  <label className="flex items-center gap-1.5 text-xs text-indigo-700 dark:text-indigo-300 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={quickIsPersonal}
                      onChange={(e) => setQuickIsPersonal(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                    />
                    <span>個人私費 (免分攤)</span>
                  </label>
                </div>

                {!quickIsPersonal && (
                  <div className="space-y-2.5 pt-1">
                    {/* Paid By selector */}
                    <div>
                      <span className="block text-[11px] font-bold text-indigo-800 dark:text-indigo-300 mb-1">
                        代墊付款人：
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {splitMembersList.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setQuickPaidBy(m)}
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition ${
                              quickPaidBy === m
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                : 'bg-white dark:bg-slate-800 border-indigo-200 dark:border-indigo-900/60 text-indigo-900 dark:text-indigo-200 hover:bg-indigo-50'
                            }`}
                          >
                            {m} {quickPaidBy === m && '✓'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Split With selector */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300">
                          參與分攤成員：
                        </span>
                        <button
                          type="button"
                          onClick={() => setQuickSplitWith(splitMembersList)}
                          className="text-[10px] text-indigo-600 dark:text-indigo-400 underline font-bold"
                        >
                          全體均分
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {splitMembersList.map((m) => {
                          const isIncluded = quickSplitWith.includes(m);
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                if (isIncluded) {
                                  if (quickSplitWith.length > 1) {
                                    setQuickSplitWith(quickSplitWith.filter((name) => name !== m));
                                  }
                                } else {
                                  setQuickSplitWith([...quickSplitWith, m]);
                                }
                              }}
                              className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition ${
                                isIncluded
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                  : 'bg-white/80 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-400 line-through'
                              }`}
                            >
                              {m}
                            </button>
                          );
                        })}
                      </div>
                      {parsedAmount > 0 && (
                        <p className="text-[10px] text-indigo-600/90 dark:text-indigo-400/90 mt-1 font-mono">
                          每人預計分攤：{expenseCur} {(parsedAmount / Math.max(quickSplitWith.length, 1)).toFixed(0)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700 text-xs">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] flex items-center gap-1">
                  <span>👤 目前為個人獨旅模式</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateTrip({
                      ...trip,
                      isSplitEnabled: true,
                      splitMembers: trip.splitMembers && trip.splitMembers.length > 0 ? trip.splitMembers : ['我', '同行旅伴'],
                    });
                  }}
                  className="px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold hover:bg-indigo-100 transition text-[11px] border border-indigo-200 dark:border-indigo-800"
                >
                  切換為朋友分帳
                </button>
              </div>
            )}

            </div>

            {/* Pinned Sticky Bottom Action Bar (Always visible without scrolling) */}
            <div className="p-3.5 sm:p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/90 dark:border-slate-800 shrink-0 shadow-lg pb-safe">
              <button
                type="submit"
                disabled={!parsedAmount || parsedAmount <= 0}
                className="w-full py-3.5 px-4 rounded-2xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm shadow-md transition active:scale-95 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>立即儲存記帳</span>
                {parsedAmount > 0 && (
                  <span className="font-mono text-xs opacity-90 ml-1">
                    ({expenseCur} {parsedAmount.toLocaleString()})
                  </span>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ================= TAB 2: TRIP TODOS (SYNCED DIRECTLY WITH TRIP.TODOS) ================= */}
        {activeTab === 'todos' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden max-w-full">
            {/* Inline Quick Add Form */}
            <form
              onSubmit={handleAddTodo}
              className="p-3.5 sm:p-4 bg-slate-50/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 shrink-0 space-y-2.5"
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full border border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center shrink-0">
                  <Plus className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                </div>
                <input
                  type="text"
                  value={newTodoTitle}
                  onChange={(e) => setNewTodoTitle(e.target.value)}
                  placeholder="新增待辦事項... (例如：購買新幹線車票、領取網卡)"
                  className="flex-1 bg-transparent text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowTodoDatePicker(!showTodoDatePicker)}
                  className={`p-1.5 rounded-xl border transition cursor-pointer ${
                    showTodoDatePicker || newTodoDueDate
                      ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500 text-teal-700 dark:text-teal-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                  title="設定到期日"
                >
                  <Calendar className="w-4 h-4" />
                </button>
                <button
                  type="submit"
                  disabled={!newTodoTitle.trim()}
                  className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs font-bold transition shadow-xs cursor-pointer shrink-0"
                >
                  新增
                </button>
              </div>

              {/* Optional Collapsible Due Date Selector */}
              {showTodoDatePicker && (
                <div className="flex items-center gap-2 pt-1 animate-in slide-in-from-top-1 duration-150">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                    預計日期：
                  </span>
                  <input
                    type="date"
                    value={newTodoDueDate}
                    onChange={(e) => setNewTodoDueDate(e.target.value)}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-teal-500"
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
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 space-y-3 touch-pan-y max-w-full">
              {pendingTodos.length === 0 ? (
                <div className="py-12 text-center px-4">
                  <div className="w-12 h-12 rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto mb-3">
                    <Check className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                    目前沒有未完成的待辦事項！
                  </p>
                  <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
                    於上方快速輸入，將立即同步至行程總覽與待辦清單
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 overflow-hidden shadow-2xs">
                  {pendingTodos.map((todo) => (
                    <div
                      key={todo.id}
                      className="flex items-center justify-between p-3 sm:p-3.5 hover:bg-slate-50/70 dark:hover:bg-white/5 transition group"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {/* Apple-style circular checkbox */}
                        <button
                          type="button"
                          onClick={() => handleToggleTodo(todo.id)}
                          className="mt-0.5 w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600 hover:border-teal-500 dark:hover:border-teal-400 flex items-center justify-center transition cursor-pointer shrink-0"
                          title="標記完成"
                        >
                          {todo.completed && <Check className="w-3 h-3 text-teal-600" />}
                        </button>

                        <div className="min-w-0 flex-1">
                          <span className="text-xs sm:text-sm text-slate-900 dark:text-zinc-100 font-medium block leading-snug break-words">
                            {todo.title}
                          </span>
                          {todo.dueDate && (
                            <div className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400 font-mono text-[11px] mt-1">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              <span>{todo.dueDate}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteTodo(todo.id)}
                        className="p-1.5 text-slate-300 hover:text-rose-500 dark:text-zinc-600 dark:hover:text-rose-400 transition cursor-pointer opacity-70 sm:opacity-0 group-hover:opacity-100 ml-2"
                        title="刪除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Completed Todos Accordion */}
              {completedTodos.length > 0 && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/50 dark:bg-slate-900/40">
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
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/60 border-t border-slate-200/80 dark:border-slate-800 px-2 py-1">
                      {completedTodos.map((todo) => (
                        <div
                          key={todo.id}
                          className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-800/40 transition group opacity-75"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => handleToggleTodo(todo.id)}
                              className="w-5 h-5 rounded-full bg-teal-600 dark:bg-teal-500 text-white flex items-center justify-center shrink-0 cursor-pointer shadow-xs"
                              title="恢復待辦"
                            >
                              <Check className="w-3 h-3 stroke-[2.5]" />
                            </button>
                            <span className="text-xs sm:text-sm line-through text-slate-400 dark:text-zinc-500 truncate flex-1">
                              {todo.title}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteTodo(todo.id)}
                            className="p-1 text-slate-300 hover:text-rose-500 dark:text-zinc-600 dark:hover:text-rose-400 transition cursor-pointer opacity-70 group-hover:opacity-100"
                            title="刪除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
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
            <img
              src={previewImage}
              alt="發票收據大圖"
              className="max-h-[78vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl border border-white/20"
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs backdrop-blur-md transition active:scale-95"
              >
                關閉大圖
              </button>
              <a
                href={previewImage}
                download="receipt-photo.jpg"
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition active:scale-95 shadow-xs"
              >
                下載照片
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
