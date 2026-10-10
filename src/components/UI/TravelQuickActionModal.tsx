import React, { useState, useEffect, useRef } from 'react';
import { Trip, ExpenseItem, PaymentMethod } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { compressImageFile } from '../../utils/image';
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_MAP,
  convertAmount,
  detectTripCurrency,
} from '../../utils/currency';
import {
  X,
  Calculator,
  DollarSign,
  FileText,
  Plus,
  Trash2,
  Copy,
  Check,
  ArrowRightLeft,
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
  Package,
  Key,
  Bookmark,
  Edit2,
  Users,
  Camera,
  ImageIcon,
  Loader2,
  Calendar,
  Maximize2,
} from 'lucide-react';

interface TravelQuickActionModalProps {
  trip: Trip;
  lang: Language;
  onUpdateTrip: (updatedTrip: Trip) => void;
  onClose: () => void;
  initialTab?: 'expense' | 'scratchpad' | 'calc';
  onShowToast?: (msg: string) => void;
}

interface ScratchpadNote {
  id: string;
  category: 'locker' | 'seat' | 'hotel' | 'other';
  label: string;
  content: string;
  createdAt: number;
  completed?: boolean;
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
  { key: 'card', label: '信用卡', icon: CreditCard },
  { key: 'cash', label: '現金', icon: Wallet },
  { key: 'mobile', label: '行動支付', icon: Smartphone },
  { key: 'ic_card', label: '交通卡', icon: Tag },
];

const SCRATCHPAD_CATS = [
  { key: 'locker', label: '置物櫃', icon: Package },
  { key: 'seat', label: '車次座位', icon: Train },
  { key: 'hotel', label: '住宿密碼', icon: Key },
  { key: 'other', label: '隨身備忘', icon: Bookmark },
] as const;

export const TravelQuickActionModal: React.FC<TravelQuickActionModalProps> = ({
  trip,
  lang,
  onUpdateTrip,
  onClose,
  initialTab = 'expense',
  onShowToast,
}) => {
  // Default to 'expense' as requested
  const [activeTab, setActiveTab] = useState<'expense' | 'scratchpad' | 'calc'>(initialTab);

  // Auto-detect trip currency (e.g. EUR for Europe, JPY for Japan, USD for USA, or trip.currency)
  const defaultTripCurrency = detectTripCurrency(trip);
  const [expenseCur, setExpenseCur] = useState<string>(defaultTripCurrency);

  // --- 1. Fast Expense States ---
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [expenseTitle, setExpenseTitle] = useState<string>('');
  const [expenseNotes, setExpenseNotes] = useState<string>('');
  const [expenseCat, setExpenseCat] = useState<string>('food');
  const [expensePayment, setExpensePayment] = useState<PaymentMethod>('card');
  const [expenseDate, setExpenseDate] = useState<string>(() => getLocalTodayDate());

  // Ensure default date is always today's date when opening or switching tabs
  useEffect(() => {
    setExpenseDate(getLocalTodayDate());
  }, [initialTab]);

  // Receipts / Invoice Upload States
  const [receiptImages, setReceiptImages] = useState<string[]>([]);
  const [isCompressingReceipts, setIsCompressingReceipts] = useState<boolean>(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

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
        const compressed = await compressImageFile(file, 900, 0.75);
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

  const parsedAmount = parseFloat(expenseAmount) || 0;
  const convertedToTwd = convertAmount(parsedAmount, expenseCur, 'TWD', trip.customExchangeRates);

  const handleSaveQuickExpense = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) return;

    const matchedCat = CATEGORY_ITEMS.find((c) => c.key === expenseCat);
    const isSplitMode = trip.isSplitEnabled;

    const newExpense: ExpenseItem = {
      id: `exp-${Date.now()}`,
      title: expenseTitle.trim() || matchedCat?.label || '旅途隨手支出',
      amount: parsedAmount,
      currency: expenseCur,
      category: expenseCat,
      paymentMethod: expensePayment,
      date: expenseDate,
      notes: expenseNotes.trim() || undefined,
      receiptImages: receiptImages.length > 0 ? receiptImages : undefined,
      receiptImage: receiptImages.length > 0 ? receiptImages[0] : undefined,
      paidBy: isSplitMode ? quickPaidBy : undefined,
      splitWith: isSplitMode && !quickIsPersonal
        ? (quickSplitWith.length > 0 ? quickSplitWith : splitMembersList)
        : undefined,
      isPersonal: isSplitMode ? quickIsPersonal : undefined,
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

  // --- 2. Scratchpad States (便簽免標題，直接快速記筆記，支援打勾完成) ---
  const STORAGE_KEY_NOTES = `hiyori_scratchpad_${trip.id}`;
  const [notes, setNotes] = useState<ScratchpadNote[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_NOTES);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [
      {
        id: '1',
        category: 'locker',
        label: '置物櫃',
        content: '剪票口旁 28 號置物櫃，密碼 5183',
        createdAt: Date.now(),
        completed: false,
      },
      {
        id: '2',
        category: 'seat',
        label: '車次座位',
        content: '車次 7 車 14A (靠窗位)',
        createdAt: Date.now(),
        completed: false,
      },
    ];
  });

  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteCat, setNewNoteCat] = useState<'locker' | 'seat' | 'hotel' | 'other'>('other');
  const [noteFilter, setNoteFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notes));
    } catch {}
  }, [notes, STORAGE_KEY_NOTES]);

  const handleToggleNoteComplete = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setNotes((prevNotes) =>
      prevNotes.map((n) =>
        n.id === id ? { ...n, completed: !n.completed } : n
      )
    );
  };

  const handleClearCompletedNotes = () => {
    const remaining = notes.filter((n) => !n.completed);
    setNotes(remaining);
    if (onShowToast) {
      onShowToast('已清除所有已打勾備忘');
    }
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim()) return;

    const matched = SCRATCHPAD_CATS.find((c) => c.key === newNoteCat);
    const item: ScratchpadNote = {
      id: `note-${Date.now()}`,
      category: newNoteCat,
      label: matched?.label || '隨手便簽',
      content: newNoteContent.trim(),
      createdAt: Date.now(),
      completed: false,
    };

    setNotes([item, ...notes]);
    setNewNoteContent('');
    if (onShowToast) {
      onShowToast('便簽已儲存！');
    }
  };

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteContent, setEditNoteContent] = useState('');
  const [editNoteCat, setEditNoteCat] = useState<'locker' | 'seat' | 'hotel' | 'other'>('other');

  const handleStartEditNote = (note: ScratchpadNote) => {
    setEditingNoteId(note.id);
    setEditNoteContent(note.content);
    setEditNoteCat(note.category);
  };

  const handleSaveEditNote = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingNoteId || !editNoteContent.trim()) return;

    const matched = SCRATCHPAD_CATS.find((c) => c.key === editNoteCat);
    setNotes((prevNotes) =>
      prevNotes.map((n) =>
        n.id === editingNoteId
          ? {
              ...n,
              label: matched?.label || n.label || '隨手便簽',
              content: editNoteContent.trim(),
              category: editNoteCat,
            }
          : n
      )
    );
    setEditingNoteId(null);
    if (onShowToast) {
      onShowToast('便簽內容已更新！');
    }
  };

  const handleCancelEditNote = () => {
    setEditingNoteId(null);
  };

  const handleDeleteNote = (id: string) => {
    if (editingNoteId === id) setEditingNoteId(null);
    setNotes(notes.filter((n) => n.id !== id));
  };

  const handleCopyNote = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedNoteId(id);
    setTimeout(() => setCopiedNoteId(null), 2000);
  };

  // --- 3. Streamlined Clean Currency Converter (No complex tax-free clutter) ---
  const [calcFromCur, setCalcFromCur] = useState<string>(expenseCur);
  const [calcToCur, setCalcToCur] = useState<string>('TWD');
  const [calcInput, setCalcInput] = useState<string>('100');
  const rawCalcNum = parseFloat(calcInput) || 0;
  const calcConvertedResult = convertAmount(rawCalcNum, calcFromCur, calcToCur, trip.customExchangeRates);

  const handleTransferCalcToExpense = () => {
    setExpenseAmount(String(rawCalcNum));
    setExpenseCur(calcFromCur);
    setExpenseTitle('換算支出');
    setActiveTab('expense');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-5 py-3.5 bg-teal-800 dark:bg-teal-950 text-white flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-bold tracking-tight">
              旅途隨身手帖
            </h3>
            <p className="text-xs text-teal-200/90 mt-0.5">
              一秒快速記帳 · 隨身便簽 · 即時外幣換算
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition active:scale-95"
            aria-label="關閉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Clean Segmented Tab Switcher (Expense is 1st & Default) */}
        <div className="p-1.5 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 shrink-0 flex items-center gap-1">
          <button
            onClick={() => setActiveTab('expense')}
            className={`flex-1 py-2 px-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 ${
              activeTab === 'expense'
                ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>一秒記帳</span>
          </button>

          <button
            onClick={() => setActiveTab('scratchpad')}
            className={`flex-1 py-2 px-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 ${
              activeTab === 'scratchpad'
                ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>隨身便籤</span>
          </button>

          <button
            onClick={() => setActiveTab('calc')}
            className={`flex-1 py-2 px-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 ${
              activeTab === 'calc'
                ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>匯率換算</span>
          </button>
        </div>

        {/* ================= TAB 1: FAST EXPENSE (DEFAULT) ================= */}
        {activeTab === 'expense' && (
          <form onSubmit={handleSaveQuickExpense} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* Currency Quick Bar & Amount Input */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  記帳幣別：
                </span>
                {/* Currency selector chips & dropdown */}
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                  {['EUR', 'JPY', 'USD', 'KRW', 'GBP', 'THB', 'TWD'].map((code) => {
                    const meta = CURRENCY_MAP[code];
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setExpenseCur(code)}
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border transition ${
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
                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:text-slate-200"
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.code} ({c.name})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Amount input */}
              <div className="flex items-stretch rounded-2xl bg-white dark:bg-slate-900 border-2 border-teal-600/80 focus-within:border-teal-500 overflow-hidden shadow-xs">
                <span className="inline-flex items-center px-3.5 bg-teal-50 dark:bg-teal-950/60 border-r border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 font-black font-mono text-base select-none shrink-0">
                  {CURRENCY_MAP[expenseCur]?.symbol || expenseCur}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  required
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="輸入消費金額..."
                  className="flex-1 px-3 py-2.5 bg-transparent text-2xl font-black font-mono text-slate-900 dark:text-white outline-none"
                  autoFocus
                />
                <span className="inline-flex items-center pr-3.5 text-xs font-bold text-slate-400 font-mono shrink-0">
                  {expenseCur}
                </span>
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

            {/* Quick Title Chips & Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                品項名稱：
              </label>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_EXPENSE_PRESETS.map((p) => (
                  <button
                    key={p.title}
                    type="button"
                    onClick={() => {
                      setExpenseTitle(p.title);
                      setExpenseCat(p.category);
                    }}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition active:scale-95 ${
                      expenseTitle === p.title
                        ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={expenseTitle}
                onChange={(e) => setExpenseTitle(e.target.value)}
                placeholder="或手動輸入品項，如：咖啡、博物館門票、藥妝..."
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500 mt-1"
              />
            </div>

            {/* Date & Optional Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  備註說明 (選填)：
                </label>
                <input
                  type="text"
                  value={expenseNotes}
                  onChange={(e) => setExpenseNotes(e.target.value)}
                  placeholder="如：店名、菜色、發票號碼..."
                  className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500"
                />
              </div>
            </div>

            {/* Clean Category Selector (No emoji spam) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                消費類別：
              </label>
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
              </div>
            </div>

            {/* Payment Method Selector (No emoji spam) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">
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

            {/* Receipt / Invoice Upload Section */}
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

              {/* Hidden file inputs */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleReceiptFiles}
                className="hidden"
              />
              <input
                ref={receiptInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleReceiptFiles}
                className="hidden"
              />

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isCompressingReceipts}
                  className="flex-1 py-2 px-3 rounded-xl bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 hover:bg-teal-50 dark:hover:bg-slate-800 text-teal-900 dark:text-teal-200 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition"
                >
                  <Camera className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>即時拍照</span>
                </button>

                <button
                  type="button"
                  onClick={() => receiptInputRef.current?.click()}
                  disabled={isCompressingReceipts}
                  className="flex-1 py-2 px-3 rounded-xl bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 hover:bg-teal-50 dark:hover:bg-slate-800 text-teal-900 dark:text-teal-200 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>相簿選取發票</span>
                </button>
              </div>

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

            {/* Friend Bill Splitting Section */}
            {trip.isSplitEnabled ? (
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
                                : 'bg-white dark:bg-slate-800 border-indigo-200 dark:border-indigo-850 text-indigo-900 dark:text-indigo-200 hover:bg-indigo-50'
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

            {/* Save Button */}
            <button
              type="submit"
              className="w-full py-3 px-4 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-md transition active:scale-95 flex items-center justify-center gap-2 mt-2"
            >
              <Check className="w-4 h-4" />
              <span>立即儲存記帳</span>
            </button>
          </form>
        )}

        {/* ================= TAB 2: SCRATCHPAD (CLEAN NOTE TAKING - 免標題) ================= */}
        {activeTab === 'scratchpad' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* Quick Add Form (免標題，直接輸入內容) */}
            <form onSubmit={handleAddNote} className="p-3.5 rounded-2xl bg-amber-50/50 dark:bg-slate-800/80 border border-amber-200/80 dark:border-slate-700 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>隨手速寫便簽</span>
                </span>
                <span className="text-[11px] text-amber-700/80 dark:text-amber-300/80 font-medium">
                  免填標題 · 隨手速記
                </span>
              </div>

              {/* Category chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {SCRATCHPAD_CATS.map((c) => {
                  const Icon = c.icon;
                  const isSelected = newNoteCat === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setNewNoteCat(c.key)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition border flex items-center gap-1 ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 border-amber-600 font-black shadow-xs'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{c.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Direct Content Input */}
              <textarea
                rows={3}
                required
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleAddNote(e);
                  }
                }}
                placeholder="直接輸入便簽內容（例如：#28 寄物櫃密碼 5183 / 房間WiFi密碼 / 集合時間 14:30）..."
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 resize-none leading-relaxed"
              />

              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[10px] text-slate-400">
                  按 Ctrl/Cmd + Enter 也可直接新增
                </span>
                <button
                  type="submit"
                  disabled={!newNoteContent.trim()}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-slate-950 font-bold text-xs shrink-0 transition active:scale-95 flex items-center gap-1 shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>新增便簽</span>
                </button>
              </div>
            </form>

            {/* Notes List Header & Controls */}
            {(() => {
              const pendingNotes = notes.filter((n) => !n.completed);
              const completedNotes = notes.filter((n) => n.completed);
              const displayedNotes =
                noteFilter === 'pending'
                  ? pendingNotes
                  : noteFilter === 'completed'
                  ? completedNotes
                  : notes;

              return (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    {/* Filter Tabs: 全部 / 待辦 / 已打勾 */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => setNoteFilter('all')}
                        className={`px-2.5 py-1 rounded-lg transition ${
                          noteFilter === 'all'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                      >
                        全部 ({notes.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setNoteFilter('pending')}
                        className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${
                          noteFilter === 'pending'
                            ? 'bg-amber-500 text-slate-950 font-black shadow-2xs'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                      >
                        <span>待辦</span>
                        <span>({pendingNotes.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setNoteFilter('completed')}
                        className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${
                          noteFilter === 'completed'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                        <span>已打勾</span>
                        <span>({completedNotes.length})</span>
                      </button>
                    </div>

                    {completedNotes.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearCompletedNotes}
                        className="text-[11px] text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 font-semibold transition flex items-center gap-1"
                        title="清除所有已打勾便簽"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>清除已打勾 ({completedNotes.length})</span>
                      </button>
                    )}
                  </div>

                  {displayedNotes.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      {noteFilter === 'completed'
                        ? '目前沒有已打勾的備忘項目'
                        : noteFilter === 'pending'
                        ? '太棒了！所有備忘項目都已打勾完成 🎉'
                        : '尚未記錄任何隨手便簽，在上方直接輸入內容即可儲存！'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {displayedNotes.map((note) => {
                        const matched = SCRATCHPAD_CATS.find((c) => c.key === note.category) || SCRATCHPAD_CATS[3];
                        const Icon = matched.icon;
                        const isEditingThis = editingNoteId === note.id;
                        const isDone = !!note.completed;

                        if (isEditingThis) {
                          return (
                            <form
                              key={note.id}
                              onSubmit={handleSaveEditNote}
                              className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-slate-800 border-2 border-amber-500 space-y-2.5 shadow-md animate-in fade-in duration-100 text-xs"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                                  <Edit2 className="w-3.5 h-3.5 text-amber-600" />
                                  <span>編輯便簽內容</span>
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={handleCancelEditNote}
                                    className="px-2 py-1 rounded-lg text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-700 text-[11px] font-medium"
                                  >
                                    取消
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveEditNote()}
                                    className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] flex items-center gap-1 shadow-xs transition active:scale-95"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>儲存修改</span>
                                  </button>
                                </div>
                              </div>

                              {/* Category selection */}
                              <div className="grid grid-cols-4 gap-1">
                                {SCRATCHPAD_CATS.map((cat) => {
                                  const CatIcon = cat.icon;
                                  return (
                                    <button
                                      key={cat.key}
                                      type="button"
                                      onClick={() => setEditNoteCat(cat.key)}
                                      className={`py-1 px-1 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition ${
                                        editNoteCat === cat.key
                                          ? 'bg-amber-500 text-slate-950 font-black'
                                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                                      }`}
                                    >
                                      <CatIcon className="w-3 h-3" />
                                      <span className="truncate">{cat.label}</span>
                                    </button>
                                  );
                                })}
                              </div>

                              <textarea
                                rows={3}
                                value={editNoteContent}
                                onChange={(e) => setEditNoteContent(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    handleSaveEditNote();
                                  }
                                }}
                                placeholder="便簽內容..."
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium font-mono text-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-amber-500 resize-none leading-relaxed"
                                autoFocus
                              />
                            </form>
                          );
                        }

                        return (
                          <div
                            key={note.id}
                            className={`p-3 sm:p-3.5 rounded-2xl border transition group flex items-start gap-2.5 sm:gap-3 ${
                              isDone
                                ? 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800 opacity-80'
                                : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 shadow-2xs hover:border-amber-400 dark:hover:border-amber-600'
                            }`}
                          >
                            {/* Checkbox button (打勾備忘) */}
                            <button
                              type="button"
                              onClick={(e) => handleToggleNoteComplete(note.id, e)}
                              className={`mt-0.5 shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition active:scale-90 ${
                                isDone
                                  ? 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700'
                                  : 'border-2 border-slate-300 dark:border-slate-600 hover:border-amber-500 bg-white dark:bg-slate-900 text-transparent hover:text-slate-300'
                              }`}
                              title={isDone ? '點擊取消打勾 (標記為未完成)' : '點擊打勾 (標記為已完成)'}
                            >
                              <Check className={`w-3.5 h-3.5 ${isDone ? 'stroke-[3]' : 'opacity-0 hover:opacity-40'}`} />
                            </button>

                            {/* Note Content */}
                            <div
                              onClick={() => handleStartEditNote(note)}
                              className="min-w-0 flex-1 space-y-1.5 cursor-pointer"
                              title="點擊可直接編輯"
                            >
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`px-2 py-0.5 rounded-lg font-bold text-[11px] flex items-center gap-1 ${
                                  isDone
                                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                    : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                }`}>
                                  <Icon className="w-3 h-3" />
                                  <span>{matched.label}</span>
                                </span>
                                {isDone && (
                                  <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[10px] flex items-center gap-0.5">
                                    <Check className="w-2.5 h-2.5" />
                                    <span>已完成</span>
                                  </span>
                                )}
                              </div>
                              <p className={`text-xs sm:text-sm font-semibold font-mono p-2.5 rounded-xl border break-words transition select-text whitespace-pre-wrap leading-relaxed ${
                                isDone
                                  ? 'line-through text-slate-400 dark:text-slate-500 bg-slate-100/60 dark:bg-slate-900/60 border-slate-200/60 dark:border-slate-800/60'
                                  : 'text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-600'
                              }`}>
                                {note.content}
                              </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                              <button
                                type="button"
                                onClick={() => handleCopyNote(note.content, note.id)}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition"
                                title="一鍵複製內容"
                              >
                                {copiedNoteId === note.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStartEditNote(note)}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-slate-500 hover:text-amber-600 transition"
                                title="編輯便簽"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteNote(note.id)}
                                className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 transition"
                                title="刪除此便簽"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ================= TAB 3: STREAMLINED CURRENCY CONVERTER ================= */}
        {activeTab === 'calc' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <select
                    value={calcFromCur}
                    onChange={(e) => setCalcFromCur(e.target.value)}
                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-slate-100"
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.code} ({c.name})
                      </option>
                    ))}
                  </select>
                  <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={calcToCur}
                    onChange={(e) => setCalcToCur(e.target.value)}
                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-slate-100"
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.code} ({c.name})
                      </option>
                    ))}
                  </select>
                </div>

                <span className="text-[11px] text-slate-400 font-mono">
                  1 {calcFromCur} ≈ {(convertAmount(1000, calcFromCur, calcToCur, trip.customExchangeRates) / 1000).toFixed(4)} {calcToCur}
                </span>
              </div>

              {/* Amount input */}
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  value={calcInput}
                  onChange={(e) => setCalcInput(e.target.value)}
                  placeholder="輸入外幣金額..."
                  className="w-full pl-4 pr-16 py-3 rounded-2xl bg-white dark:bg-slate-900 border-2 border-teal-500/80 text-2xl font-black font-mono text-slate-900 dark:text-white outline-none"
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  {calcFromCur}
                </span>
              </div>

              {/* Quick Add Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                {[10, 50, 100, 500, 1000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setCalcInput(String((parseFloat(calcInput) || 0) + v))}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 shrink-0 active:scale-95 transition"
                  >
                    +{v}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCalcInput('0')}
                  className="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold shrink-0"
                >
                  歸零
                </button>
              </div>
            </div>

            {/* Live Result Card */}
            <div className="p-4 rounded-3xl bg-teal-900 dark:bg-slate-950 text-white border border-teal-800 shadow-lg text-center space-y-1">
              <span className="text-xs font-semibold text-teal-200">
                折算後約等於
              </span>
              <div className="flex items-baseline justify-center gap-1.5 py-1">
                <span className="text-3xl sm:text-4xl font-black font-mono text-amber-300 tracking-tight">
                  {calcToCur} {Math.round(calcConvertedResult).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-teal-200/90 font-mono">
                {calcFromCur} {rawCalcNum.toLocaleString()} = {calcToCur} {Math.round(calcConvertedResult).toLocaleString()}
              </p>
            </div>

            {/* Transfer to Expense Button */}
            <button
              onClick={handleTransferCalcToExpense}
              className="w-full py-3 px-4 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition active:scale-95"
            >
              <DollarSign className="w-4 h-4" />
              <span>將此金額帶入「一秒記帳」</span>
            </button>
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
