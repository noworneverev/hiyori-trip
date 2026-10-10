import React, { useState, useEffect } from 'react';
import { Trip, ExpenseItem, PaymentMethod } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
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
}

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
  const [expenseCat, setExpenseCat] = useState<string>('food');
  const [expensePayment, setExpensePayment] = useState<PaymentMethod>('card');
  const [expenseDate, setExpenseDate] = useState<string>(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (today >= trip.startDate && today <= trip.endDate) return today;
    return trip.startDate || today;
  });

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
      if (isSplitMode && !quickIsPersonal) {
        onShowToast(
          `已記帳並分攤：${expenseCur} ${parsedAmount.toLocaleString()} (${newExpense.title} · 由 ${quickPaidBy} 代墊 · ${quickSplitWith.length} 人均分)`
        );
      } else {
        onShowToast(`已記帳：${expenseCur} ${parsedAmount.toLocaleString()} (${newExpense.title})`);
      }
    }

    setExpenseAmount('');
    setExpenseTitle('');
    onClose();
  };

  // --- 2. Scratchpad States (Cleaned of all emoji clutter) ---
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
        label: '車站寄物櫃',
        content: '剪票口旁 28 號置物櫃，密碼 5183',
        createdAt: Date.now(),
      },
      {
        id: '2',
        category: 'seat',
        label: '指定席座位',
        content: '車次 7 車 14A (靠窗位)',
        createdAt: Date.now(),
      },
    ];
  });

  const [newNoteLabel, setNewNoteLabel] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteCat, setNewNoteCat] = useState<'locker' | 'seat' | 'hotel' | 'other'>('locker');
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notes));
    } catch {}
  }, [notes, STORAGE_KEY_NOTES]);

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim()) return;

    const matched = SCRATCHPAD_CATS.find((c) => c.key === newNoteCat);
    const item: ScratchpadNote = {
      id: `note-${Date.now()}`,
      category: newNoteCat,
      label: newNoteLabel.trim() || matched?.label || '隨手便簽',
      content: newNoteContent.trim(),
      createdAt: Date.now(),
    };

    setNotes([item, ...notes]);
    setNewNoteLabel('');
    setNewNoteContent('');
  };

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteLabel, setEditNoteLabel] = useState('');
  const [editNoteContent, setEditNoteContent] = useState('');
  const [editNoteCat, setEditNoteCat] = useState<'locker' | 'seat' | 'hotel' | 'other'>('locker');

  const handleStartEditNote = (note: ScratchpadNote) => {
    setEditingNoteId(note.id);
    setEditNoteLabel(note.label);
    setEditNoteContent(note.content);
    setEditNoteCat(note.category);
  };

  const handleSaveEditNote = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingNoteId || !editNoteContent.trim()) return;

    setNotes((prevNotes) =>
      prevNotes.map((n) =>
        n.id === editingNoteId
          ? {
              ...n,
              label: editNoteLabel.trim() || '隨手便籤',
              content: editNoteContent.trim(),
              category: editNoteCat,
            }
          : n
      )
    );
    setEditingNoteId(null);
    if (onShowToast) {
      onShowToast('便籤內容已更新儲存！');
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
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  required
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="輸入金額，例如：15、480..."
                  className="w-full pl-4 pr-16 py-3 rounded-xl bg-white dark:bg-slate-900 border-2 border-teal-600/80 text-2xl font-black font-mono text-slate-900 dark:text-white outline-none focus:border-teal-600"
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500 dark:text-slate-400 font-mono">
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

            {/* Quick Title Chips */}
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

        {/* ================= TAB 2: SCRATCHPAD (CLEAN NOTE TAKING) ================= */}
        {activeTab === 'scratchpad' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* Quick Add Form */}
            <form onSubmit={handleAddNote} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
              <div className="flex items-center gap-1.5">
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
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{c.label}</span>
                    </button>
                  );
                })}
              </div>

              <input
                type="text"
                value={newNoteLabel}
                onChange={(e) => setNewNoteLabel(e.target.value)}
                placeholder="標題 (如：寄物櫃代號 / 飯店大門密碼 / 新幹線座位)..."
                className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-white outline-none focus:border-amber-500"
              />

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder="內容 (如：#45 櫃密碼 9821 / 房號 1402 / 7車14A)..."
                  className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-white outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shrink-0 transition active:scale-95 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>新增</span>
                </button>
              </div>
            </form>

            {/* Notes List */}
            <div className="space-y-2.5">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block">
                已記錄的便簽 ({notes.length})：
              </span>
              {notes.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  尚未記錄任何隨身速記，點上方按鈕立即新增！
                </div>
              ) : (
                notes.map((note) => {
                  const matched = SCRATCHPAD_CATS.find((c) => c.key === note.category) || SCRATCHPAD_CATS[3];
                  const Icon = matched.icon;
                  const isEditingThis = editingNoteId === note.id;

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
                            <span>編輯便籤</span>
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
                              <span>儲存便籤</span>
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

                        <input
                          type="text"
                          value={editNoteLabel}
                          onChange={(e) => setEditNoteLabel(e.target.value)}
                          placeholder="便籤標題 (例如：京都車站儲物櫃、房號)"
                          className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-amber-500"
                        />

                        <textarea
                          rows={2}
                          value={editNoteContent}
                          onChange={(e) => setEditNoteContent(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault();
                              handleSaveEditNote();
                            }
                          }}
                          placeholder="便籤內容 (例如：密碼、號碼、備忘)..."
                          className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold font-mono text-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                        />
                      </form>
                    );
                  }

                  return (
                    <div
                      key={note.id}
                      className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3 shadow-2xs hover:border-amber-400 dark:hover:border-amber-600 transition group"
                    >
                      <div
                        onClick={() => handleStartEditNote(note)}
                        className="min-w-0 flex-1 space-y-1.5 cursor-pointer"
                        title="點擊可直接編輯"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold text-[11px] flex items-center gap-1">
                            <Icon className="w-3 h-3" />
                            <span>{matched.label}</span>
                          </span>
                          <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                            {note.label}
                          </h4>
                        </div>
                        <p className="text-xs font-bold font-mono text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 break-words hover:border-amber-400 dark:hover:border-amber-600 transition">
                          {note.content}
                        </p>
                      </div>

                      <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                        <button
                          type="button"
                          onClick={() => handleCopyNote(note.content, note.id)}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition"
                          title="複製"
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
                          title="編輯便籤"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 transition"
                          title="刪除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
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
    </div>
  );
};
