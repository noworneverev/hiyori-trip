import React, { useState, useRef, useMemo } from 'react';
import { Trip, ExpenseItem, PaymentMethod } from '../../types/itinerary';
import { formatDateSlash } from '../../utils/date';
import { Language, TRANSLATIONS } from '../../utils/i18n';
import { compressImageFile } from '../../utils/image';
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_MAP,
  convertAmount,
  formatCurrencyAmount,
  fetchLiveExchangeRates,
  getCachedLiveRates,
  detectTripCurrency,
  LiveRatesCache,
} from '../../utils/currency';
import {
  DollarSign,
  Plus,
  Trash2,
  PieChart as PieChartIcon,
  BarChart3,
  Receipt,
  X,
  Eye,
  Camera,
  Check,
  Calendar,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  ArrowRightLeft,
  Tag,
  ImageIcon,
  RefreshCw,
  User,
  Users,
  Copy,
  CheckCheck,
  Share2,
  UserPlus,
  Sparkles,
  Pencil,
  Wallet,
  Coins,
  TableProperties,
} from 'lucide-react';
import { canUploadImages } from '../../utils/userPermissions';
import { calculateTripSplits, formatSplitsForSharing } from '../../utils/billSplitter';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

interface ExpensesTabProps {
  trip: Trip;
  lang: Language;
  onUpdateTrip: (updatedTrip: Trip) => void;
}

// Built-in categories
const DEFAULT_CATEGORIES: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  food: { label: '美食餐飲', icon: '🍜', color: '#F59E0B', bg: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  transport: { label: '交通車資', icon: '🚄', color: '#3B82F6', bg: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  tickets: { label: '門票票券', icon: '🎟️', color: '#10B981', bg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  shopping: { label: '購物商場', icon: '🛍️', color: '#EC4899', bg: 'bg-pink-500/10 text-pink-700 dark:text-pink-300' },
  souvenir: { label: '紀念品伴手禮', icon: '🎁', color: '#8B5CF6', bg: 'bg-purple-500/10 text-purple-700 dark:text-purple-300' },
  stay: { label: '住宿飯店', icon: '🏨', color: '#6366F1', bg: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' },
  other: { label: '其他雜支', icon: '📌', color: '#64748B', bg: 'bg-slate-500/10 text-slate-700 dark:text-slate-300' },
};

const PAYMENT_LABELS: Record<PaymentMethod, Record<Language, string> & { icon: string }> = {
  cash: { zh: '現金', en: 'Cash', ja: '現金', ko: '현금', 'zh-CN': '现金', icon: '💵' },
  card: { zh: '信用卡', en: 'Credit Card', ja: 'クレジットカード', ko: '신용카드', 'zh-CN': '信用卡', icon: '💳' },
  ic_card: { zh: '交通卡/IC卡', en: 'Transit Card', ja: '交通系ICカード', ko: '교통카드', 'zh-CN': '交通卡', icon: '🏷️' },
  mobile: { zh: '行動支付', en: 'Mobile Pay', ja: 'スマホ決済', ko: '간편결제', 'zh-CN': '移动支付', icon: '📱' },
};

export const ExpensesTab: React.FC<ExpensesTabProps> = ({ trip, lang, onUpdateTrip }) => {
  const t = TRANSLATIONS[lang];
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Base display currency (auto-detected from trip destination or trip.currency)
  const defaultDetectedCurrency = detectTripCurrency(trip);
  const [baseCurrency, setBaseCurrency] = useState<string>(trip.currency || defaultDetectedCurrency);

  // Form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [itemCurrency, setItemCurrency] = useState<string>(trip.currency || defaultDetectedCurrency);
  const [category, setCategory] = useState<string>('food');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [date, setDate] = useState<string>(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (today >= trip.startDate && today <= trip.endDate) return today;
    return trip.startDate || today;
  });
  const [notes, setNotes] = useState('');
  const [receiptImages, setReceiptImages] = useState<string[]>([]);
  const [isCompressingReceipts, setIsCompressingReceipts] = useState(false);

  // Custom Category Add input
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // Exchange rate config modal & Live Market Rates
  const [showRateModal, setShowRateModal] = useState(false);
  const [tempRates, setTempRates] = useState<Record<string, number>>(trip.customExchangeRates || {});
  const [liveRatesInfo, setLiveRatesInfo] = useState<LiveRatesCache | null>(() => getCachedLiveRates());
  const [isFetchingRates, setIsFetchingRates] = useState(false);

  React.useEffect(() => {
    fetchLiveExchangeRates().then((res) => setLiveRatesInfo(res));
  }, []);

  const handleRefreshLiveRates = async () => {
    setIsFetchingRates(true);
    try {
      const res = await fetchLiveExchangeRates(true);
      setLiveRatesInfo(res);
    } finally {
      setIsFetchingRates(false);
    }
  };

  // Chart view: 'daily' vs 'category'
  const [chartView, setChartView] = useState<'daily' | 'category'>('daily');

  // Navigation subtabs & states
  const [expenseSubTab, setExpenseSubTab] = useState<'records' | 'table' | 'charts' | 'split'>('records');
  const [expandedTableDate, setExpandedTableDate] = useState<string | null>(null);
  const [newCompanionName, setNewCompanionName] = useState('');
  const [showAddCompanionInput, setShowAddCompanionInput] = useState(false);
  const [copiedSplitToast, setCopiedSplitToast] = useState(false);

  // Split members list
  const splitMembersList = useMemo(() => {
    return trip.splitMembers && trip.splitMembers.length > 0 ? trip.splitMembers : ['我', '同行夥伴'];
  }, [trip.splitMembers]);

  // Form split fields
  const [itemPaidBy, setItemPaidBy] = useState<string>('我');
  const [itemSplitWith, setItemSplitWith] = useState<string[]>(['我', '同行夥伴']);
  const [itemIsPersonal, setItemIsPersonal] = useState<boolean>(false);

  // Calculated splits
  const splitsResult = useMemo(() => {
    if (!trip.isSplitEnabled) return null;
    return calculateTripSplits(trip);
  }, [trip]);

  // Filter & Lightbox states
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('all');
  const [viewingReceiptGallery, setViewingReceiptGallery] = useState<{
    images: string[];
    currentIndex: number;
    title: string;
    amount: number;
    currency: string;
    expenseId?: string;
  } | null>(null);

  // Custom categories list from trip
  const customCategories = trip.customExpenseCategories || [];

  // Helper: get display info for a category
  const getCategoryMeta = (catKey: string) => {
    if (DEFAULT_CATEGORIES[catKey]) {
      return DEFAULT_CATEGORIES[catKey];
    }
    return {
      label: catKey,
      icon: '🏷️',
      color: '#0d9488',
      bg: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
    };
  };

  // Convert an expense to the selected baseCurrency
  const getItemConvertedAmount = (item: ExpenseItem): number => {
    return convertAmount(item.amount, item.currency, baseCurrency, trip.customExchangeRates);
  };

  // Total Spending in base currency
  const totalSpentInBase = useMemo(() => {
    return trip.expenses.reduce((sum, item) => sum + getItemConvertedAmount(item), 0);
  }, [trip.expenses, baseCurrency, trip.customExchangeRates]);

  // Today's spending in base currency (supporting local date and UTC date)
  const getTodayLocal = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const todayStr = getTodayLocal();
  const todayUtcStr = new Date().toISOString().slice(0, 10);

  const todaySpentInBase = useMemo(() => {
    return trip.expenses
      .filter((item) => item.date === todayStr || item.date === todayUtcStr)
      .reduce((sum, item) => sum + getItemConvertedAmount(item), 0);
  }, [trip.expenses, baseCurrency, trip.customExchangeRates, todayStr, todayUtcStr]);

  // Cash on hand tracker (手頭現金管理)
  const initialCashCur = trip.initialCashCurrency || baseCurrency || 'JPY';
  const initialCashAmt = typeof trip.initialCashAmount === 'number'
    ? trip.initialCashAmount
    : (typeof window !== 'undefined' ? parseFloat(localStorage.getItem(`trip_cash_${trip.id}`) || '0') || 0 : 0);

  const totalCashSpent = useMemo(() => {
    return trip.expenses
      .filter((item) => item.paymentMethod === 'cash')
      .reduce((sum, item) => {
        const itemValInCashCur = convertAmount(
          item.amount,
          item.currency,
          initialCashCur,
          trip.customExchangeRates
        );
        return sum + itemValInCashCur;
      }, 0);
  }, [trip.expenses, initialCashCur, trip.customExchangeRates]);

  const remainingCash = initialCashAmt - totalCashSpent;
  const cashSpentPercent = initialCashAmt > 0
    ? Math.min(100, Math.round((totalCashSpent / initialCashAmt) * 100))
    : 0;

  const [showCashModal, setShowCashModal] = useState(false);
  const [cashInputAmt, setCashInputAmt] = useState<string>(String(initialCashAmt || ''));
  const [cashInputCur, setCashInputCur] = useState<string>(initialCashCur);

  const handleSaveInitialCash = () => {
    const parsed = parseFloat(cashInputAmt) || 0;
    onUpdateTrip({
      ...trip,
      initialCashAmount: parsed,
      initialCashCurrency: cashInputCur,
      updatedAt: Date.now(),
    });
    if (typeof window !== 'undefined') {
      localStorage.setItem(`trip_cash_${trip.id}`, String(parsed));
    }
    setShowCashModal(false);
  };

  // Total receipts count
  const totalReceiptsCount = useMemo(() => {
    return trip.expenses.reduce((sum, item) => {
      if (item.receiptImages && item.receiptImages.length > 0) return sum + item.receiptImages.length;
      if (item.receiptImage) return sum + 1;
      return sum;
    }, 0);
  }, [trip.expenses]);

  // Category totals for pie chart
  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    trip.expenses.forEach((item) => {
      const cat = item.category || 'other';
      const val = getItemConvertedAmount(item);
      map[cat] = (map[cat] || 0) + val;
    });
    return map;
  }, [trip.expenses, baseCurrency, trip.customExchangeRates]);

  const pieChartData = useMemo(() => {
    return Object.entries(categoryTotals)
      .map(([catKey, val]) => {
        const meta = getCategoryMeta(catKey);
        return {
          key: catKey,
          name: meta.label,
          value: Math.round(val),
          color: meta.color,
          icon: meta.icon,
          percentage: totalSpentInBase > 0 ? ((val / totalSpentInBase) * 100).toFixed(1) : '0',
        };
      })
      .filter((d) => d.value > 0);
  }, [categoryTotals, totalSpentInBase]);

  // Daily totals for bar chart
  const dailyChartData = useMemo(() => {
    const map: Record<string, number> = {};

    trip.expenses.forEach((item) => {
      const d = item.date || 'other';
      const val = getItemConvertedAmount(item);
      map[d] = (map[d] || 0) + val;
    });

    const entries = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));

    return entries.map(([d, val]) => {
      let label = d.slice(5).replace('-', '/'); // "10/10"
      if (trip.startDate && d < trip.startDate) {
        label = `行前 (${label})`;
      } else {
        const dayIdx = trip.days.findIndex((dp) => dp.date === d);
        if (dayIdx >= 0) {
          label = `D${dayIdx + 1} ${label}`;
        }
      }
      return {
        date: d,
        label,
        amount: Math.round(val),
      };
    });
  }, [trip.expenses, trip.days, trip.startDate, baseCurrency, trip.customExchangeRates]);

  // Daily Breakdown Rows for Table (每日記帳統計總覽表)
  const dailyTableData = useMemo(() => {
    const map: Record<string, {
      date: string;
      label: string;
      dayNumber?: number;
      totalAmount: number;
      count: number;
      cashCount: number;
      cardCount: number;
      cashAmount: number;
      cardAmount: number;
      items: ExpenseItem[];
    }> = {};

    // 1. Populate all itinerary days from trip
    (trip.days || []).forEach((day, idx) => {
      const d = (day.date || '').slice(0, 10);
      if (d) {
        const dayNum = day.dayNumber || idx + 1;
        const datePart = d.length >= 10 ? d.slice(5).replace('-', '/') : d;
        const isToday = d === todayStr || d === todayUtcStr;
        map[d] = {
          date: d,
          label: isToday ? `今日 · Day ${dayNum} (${datePart})` : `Day ${dayNum} (${datePart})`,
          dayNumber: dayNum,
          totalAmount: 0,
          count: 0,
          cashCount: 0,
          cardCount: 0,
          cashAmount: 0,
          cardAmount: 0,
          items: [],
        };
      }
    });

    // 2. Iterate expenses and populate
    trip.expenses.forEach((item) => {
      const d = (item.date || '').slice(0, 10) || 'other';
      if (!map[d]) {
        let label = d.length >= 10 ? d.slice(5).replace('-', '/') : d;
        let dayNum: number | undefined;
        if (trip.startDate && d < trip.startDate.slice(0, 10)) {
          label = `行前準備 (${label})`;
        } else {
          const dayIdx = trip.days.findIndex((dp) => (dp.date || '').slice(0, 10) === d);
          if (dayIdx >= 0) {
            dayNum = dayIdx + 1;
            label = `Day ${dayIdx + 1} (${label})`;
          } else if (d === todayStr || d === todayUtcStr) {
            label = `今日 (${label})`;
          } else {
            label = `額外 (${label})`;
          }
        }
        map[d] = {
          date: d,
          label,
          dayNumber: dayNum,
          totalAmount: 0,
          count: 0,
          cashCount: 0,
          cardCount: 0,
          cashAmount: 0,
          cardAmount: 0,
          items: [],
        };
      }
      const val = getItemConvertedAmount(item);
      map[d].totalAmount += val;
      map[d].count += 1;
      map[d].items.push(item);
      if (item.paymentMethod === 'cash') {
        map[d].cashCount += 1;
        map[d].cashAmount += val;
      } else {
        map[d].cardCount += 1;
        map[d].cardAmount += val;
      }
    });

    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [trip.expenses, trip.days, trip.startDate, baseCurrency, trip.customExchangeRates, todayStr, todayUtcStr]);

  // Multi-file receipt upload handler
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
    } catch (err) {
      console.error('Failed to compress receipt images:', err);
    } finally {
      setIsCompressingReceipts(false);
      e.target.value = '';
    }
  };

  const handleRemoveReceiptImage = (indexToRemove: number) => {
    setReceiptImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Add custom category
  const handleAddCustomCategory = () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    if (DEFAULT_CATEGORIES[trimmed] || customCategories.includes(trimmed)) {
      setCategory(trimmed);
      setNewCatName('');
      setShowNewCatInput(false);
      return;
    }

    const updated = [...customCategories, trimmed];
    onUpdateTrip({
      ...trip,
      customExpenseCategories: updated,
      updatedAt: Date.now(),
    });

    setCategory(trimmed);
    setNewCatName('');
    setShowNewCatInput(false);
  };

  // Open Modal to Add New Expense
  const handleOpenAddExpense = () => {
    setEditingExpenseId(null);
    setTitle('');
    setAmount('');
    setItemCurrency(baseCurrency);
    setCategory('food');
    setPaymentMethod('card');
    const defaultDate = todayStr >= trip.startDate && todayStr <= trip.endDate
      ? todayStr
      : (trip.startDate || todayStr);
    setDate(defaultDate);
    setNotes('');
    setReceiptImages([]);
    setItemPaidBy('我');
    setItemSplitWith(splitMembersList);
    setItemIsPersonal(false);
    setShowAddModal(true);
  };

  // Open Modal to Edit Existing Expense
  const handleOpenEditExpense = (item: ExpenseItem) => {
    setEditingExpenseId(item.id);
    setTitle(item.title);
    setAmount(item.amount.toString());
    setItemCurrency(item.currency || baseCurrency);
    setCategory(item.category || 'food');
    setPaymentMethod(item.paymentMethod || 'card');
    setDate(item.date || todayStr);
    setNotes(item.notes || '');

    const imgs = item.receiptImages && item.receiptImages.length > 0
      ? [...item.receiptImages]
      : item.receiptImage
      ? [item.receiptImage]
      : [];
    setReceiptImages(imgs);

    setItemPaidBy(item.paidBy || '我');
    setItemSplitWith(item.splitWith && item.splitWith.length > 0 ? item.splitWith : splitMembersList);
    setItemIsPersonal(!!item.isPersonal);
    setShowAddModal(true);
  };

  // Save Expense Item (New or Edit)
  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!title.trim() || isNaN(parsedAmount) || parsedAmount <= 0) return;

    // calculate dayNumber if date matches a trip day
    const matchedDay = trip.days.find((d) => d.date === date);

    if (editingExpenseId) {
      // Edit existing expense
      const updatedExpenses = trip.expenses.map((exp) => {
        if (exp.id === editingExpenseId) {
          return {
            ...exp,
            title: title.trim(),
            amount: parsedAmount,
            currency: itemCurrency,
            category,
            paymentMethod,
            date,
            dayNumber: matchedDay ? matchedDay.dayNumber : undefined,
            notes: notes.trim() || undefined,
            receiptImages: receiptImages.length > 0 ? receiptImages : undefined,
            receiptImage: receiptImages[0] || undefined,
            convertedAmount: convertAmount(parsedAmount, itemCurrency, baseCurrency, trip.customExchangeRates),
            paidBy: trip.isSplitEnabled ? itemPaidBy : undefined,
            splitWith: trip.isSplitEnabled && !itemIsPersonal ? (itemSplitWith.length > 0 ? itemSplitWith : splitMembersList) : undefined,
            isPersonal: trip.isSplitEnabled ? itemIsPersonal : undefined,
          };
        }
        return exp;
      });

      onUpdateTrip({
        ...trip,
        expenses: updatedExpenses,
        updatedAt: Date.now(),
      });
    } else {
      // Create new expense
      const newExpense: ExpenseItem = {
        id: `exp-${Date.now()}`,
        title: title.trim(),
        amount: parsedAmount,
        currency: itemCurrency,
        category,
        paymentMethod,
        date,
        dayNumber: matchedDay ? matchedDay.dayNumber : undefined,
        notes: notes.trim() || undefined,
        receiptImages: receiptImages.length > 0 ? receiptImages : undefined,
        receiptImage: receiptImages[0] || undefined,
        convertedAmount: convertAmount(parsedAmount, itemCurrency, baseCurrency, trip.customExchangeRates),
        paidBy: trip.isSplitEnabled ? itemPaidBy : undefined,
        splitWith: trip.isSplitEnabled && !itemIsPersonal ? (itemSplitWith.length > 0 ? itemSplitWith : splitMembersList) : undefined,
        isPersonal: trip.isSplitEnabled ? itemIsPersonal : undefined,
      };

      onUpdateTrip({
        ...trip,
        expenses: [newExpense, ...trip.expenses],
        updatedAt: Date.now(),
      });
    }

    // Reset Form
    setEditingExpenseId(null);
    setTitle('');
    setAmount('');
    setNotes('');
    setReceiptImages([]);
    setItemPaidBy('我');
    setItemSplitWith(splitMembersList);
    setItemIsPersonal(false);
    setShowAddModal(false);
  };

  const handleDeleteExpense = (id: string) => {
    onUpdateTrip({
      ...trip,
      expenses: trip.expenses.filter((e) => e.id !== id),
      updatedAt: Date.now(),
    });
  };

  const handleDeleteCurrentlyEditing = () => {
    if (!editingExpenseId) return;
    if (confirm(lang === 'zh' ? '確定要刪除這筆支出明細嗎？' : 'Delete this expense record?')) {
      handleDeleteExpense(editingExpenseId);
      setShowAddModal(false);
      setEditingExpenseId(null);
    }
  };

  // Add a companion to splitting list
  const handleAddCompanion = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newCompanionName.trim();
    if (!trimmed) return;
    if (splitMembersList.includes(trimmed)) {
      setNewCompanionName('');
      setShowAddCompanionInput(false);
      return;
    }

    const updated = [...splitMembersList, trimmed];
    onUpdateTrip({
      ...trip,
      isSplitEnabled: true,
      splitMembers: updated,
      updatedAt: Date.now(),
    });
    setNewCompanionName('');
    setShowAddCompanionInput(false);
  };

  // Remove companion member
  const handleRemoveCompanion = (memberToRemove: string) => {
    if (memberToRemove === '我') {
      alert(lang === 'zh' ? '「我」為預設成員，無法移除。' : 'Cannot remove primary member "我".');
      return;
    }
    const updated = splitMembersList.filter((m) => m !== memberToRemove);
    onUpdateTrip({
      ...trip,
      splitMembers: updated.length > 0 ? updated : ['我'],
      updatedAt: Date.now(),
    });
  };

  // Copy formatted split summary for LINE / messages
  const handleCopySplitSummary = () => {
    const text = formatSplitsForSharing(trip);
    navigator.clipboard.writeText(text);
    setCopiedSplitToast(true);
    setTimeout(() => setCopiedSplitToast(false), 2500);
  };

  // Save exchange rates
  const handleSaveRates = () => {
    onUpdateTrip({
      ...trip,
      customExchangeRates: tempRates,
      updatedAt: Date.now(),
    });
    setShowRateModal(false);
  };

  // Today's expenses count
  const todayExpensesCount = useMemo(() => {
    return trip.expenses.filter((e) => e.date === todayStr || e.date === todayUtcStr).length;
  }, [trip.expenses, todayStr, todayUtcStr]);

  // Filtered expenses list based on date & category
  const filteredExpenses = useMemo(() => {
    return trip.expenses.filter((item) => {
      // Date filter
      const itemDateStr = (item.date || '').slice(0, 10);
      if (selectedDateFilter === 'today') {
        if (itemDateStr !== todayStr && itemDateStr !== todayUtcStr) return false;
      } else if (selectedDateFilter === 'pre') {
        if (trip.startDate && itemDateStr && itemDateStr >= trip.startDate.slice(0, 10)) return false;
      } else if (selectedDateFilter === 'cash_only') {
        if (item.paymentMethod !== 'cash') return false;
      } else if (selectedDateFilter !== 'all') {
        const filterDateStr = selectedDateFilter.slice(0, 10);
        if (itemDateStr !== filterDateStr) {
          if ((filterDateStr === todayStr || filterDateStr === todayUtcStr) &&
              (itemDateStr === todayStr || itemDateStr === todayUtcStr)) {
            // Match
          } else {
            return false;
          }
        }
      }

      // Category filter
      if (selectedCategoryFilter === 'all') return true;
      if (selectedCategoryFilter === 'with_receipt') {
        return (item.receiptImages && item.receiptImages.length > 0) || !!item.receiptImage;
      }
      return item.category === selectedCategoryFilter;
    });
  }, [trip.expenses, selectedDateFilter, selectedCategoryFilter, todayStr, todayUtcStr, trip.startDate]);

  // Total for currently filtered expenses in base currency
  const filteredTotalInBase = useMemo(() => {
    return filteredExpenses.reduce((sum, item) => sum + getItemConvertedAmount(item), 0);
  }, [filteredExpenses, baseCurrency, trip.customExchangeRates]);

  return (
    <div className="space-y-4">
      {/* 1. Main Header & Spending Summary Card */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  {lang === 'zh' ? '旅程支出記帳' : 'Trip Expenses'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {lang === 'zh' ? '支援台幣/日圓多幣別即時換算與多張發票拍照存檔' : 'Multi-currency auto conversion & receipt management'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Live Exchange Rate Indicator */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span>1 TWD ≈ {(liveRatesInfo?.rates['TWD'] || 4.8).toFixed(2)} JPY</span>
              <button
                type="button"
                onClick={handleRefreshLiveRates}
                disabled={isFetchingRates}
                className="p-0.5 hover:text-emerald-950 dark:hover:text-white transition disabled:opacity-50 ml-0.5"
                title="立即更新今日國際即時匯率"
              >
                <RefreshCw className={`w-3 h-3 ${isFetchingRates ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Base Display Currency Selector */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl text-xs font-semibold">
              <span className="text-[10px] text-slate-400 pl-1.5 flex items-center gap-1">
                <ArrowRightLeft className="w-3 h-3" />
                <span>顯示計價:</span>
              </span>
              {SUPPORTED_CURRENCIES.slice(0, 3).map((cur) => (
                <button
                  key={cur.code}
                  onClick={() => setBaseCurrency(cur.code)}
                  className={`px-2 py-1 rounded-lg text-xs transition ${
                    baseCurrency === cur.code
                      ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 font-bold shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {cur.flag} {cur.code}
                </button>
              ))}
              <button
                onClick={() => setShowRateModal(true)}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-400"
                title="自訂匯率設定"
              >
                <Tag className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Solo Traveler vs Friends Split Mode Toggle */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  onUpdateTrip({ ...trip, isSplitEnabled: false });
                  setExpenseSubTab('records');
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                  !trip.isSplitEnabled
                    ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="純個人自用記帳，無分帳欄位"
              >
                <User className="w-3.5 h-3.5" />
                <span>{lang === 'zh' ? '個人獨旅' : 'Solo'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateTrip({
                    ...trip,
                    isSplitEnabled: true,
                    splitMembers: trip.splitMembers && trip.splitMembers.length > 0
                      ? trip.splitMembers
                      : ['我', '同行旅伴'],
                  });
                  setExpenseSubTab('split');
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                  trip.isSplitEnabled
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="啟用旅伴共同分帳與自動結算"
              >
                <Users className="w-3.5 h-3.5" />
                <span>{lang === 'zh' ? '朋友分帳' : 'Split'}</span>
              </button>
            </div>

            {/* Add Expense Button */}
            <button
              onClick={handleOpenAddExpense}
              className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>{t.addExpense}</span>
            </button>
          </div>
        </div>

        {/* Big Total & Summary Cards (Grand Total, Cash on Hand, Today, Records) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mt-4">
          {/* Card 1: Grand Total Card */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-transparent border border-teal-200/60 dark:border-teal-800/50 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs text-teal-900 dark:text-teal-300 font-semibold mb-1">
                <span>{lang === 'zh' ? '累計支出總金額' : 'Total Spent'}</span>
                <span className="text-[10px] font-mono bg-teal-100 dark:bg-teal-900 px-1.5 py-0.5 rounded text-teal-800 dark:text-teal-200">
                  以 {baseCurrency}
                </span>
              </div>
              <div className="font-black font-mono text-xl sm:text-2xl text-teal-950 dark:text-teal-100 tracking-tight">
                {formatCurrencyAmount(totalSpentInBase, baseCurrency)}
              </div>
            </div>
            {baseCurrency !== 'TWD' ? (
              <p className="text-[10px] text-teal-700 dark:text-teal-400 mt-1 font-mono truncate">
                ≈ {formatCurrencyAmount(convertAmount(totalSpentInBase, baseCurrency, 'TWD', trip.customExchangeRates), 'TWD')}
              </p>
            ) : (
              <p className="text-[10px] text-teal-700 dark:text-teal-400 mt-1 font-mono truncate">
                ≈ {formatCurrencyAmount(convertAmount(totalSpentInBase, 'TWD', 'JPY', trip.customExchangeRates), 'JPY')}
              </p>
            )}
          </div>

          {/* Card 2: Cash on Hand Card (手頭現金餘額) */}
          <div
            onClick={() => {
              setCashInputAmt(initialCashAmt > 0 ? String(initialCashAmt) : '');
              setCashInputCur(initialCashCur);
              setShowCashModal(true);
            }}
            className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent border border-emerald-300/80 dark:border-emerald-800/80 cursor-pointer hover:border-emerald-500 hover:shadow-xs transition flex flex-col justify-between group"
            title="點擊設定或修改手頭初始現金"
          >
            <div>
              <div className="flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-200 font-semibold mb-1">
                <span className="flex items-center gap-1">
                  <Wallet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>手頭現金餘額</span>
                </span>
                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 group-hover:underline flex items-center gap-0.5">
                  <Pencil className="w-2.5 h-2.5" />
                  <span>{initialCashAmt > 0 ? '修改' : '設定'}</span>
                </span>
              </div>
              <div className={`font-black font-mono text-xl sm:text-2xl tracking-tight truncate ${
                initialCashAmt > 0 && remainingCash < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-950 dark:text-emerald-100'
              }`}>
                {initialCashAmt > 0
                  ? formatCurrencyAmount(remainingCash, initialCashCur)
                  : <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">+ 輸入初始現金</span>}
              </div>
            </div>

            {initialCashAmt > 0 ? (
              <div className="mt-1 space-y-1">
                <div className="flex items-center justify-between text-[10px] text-emerald-800 dark:text-emerald-300 font-mono">
                  <span>初始 {initialCashAmt.toLocaleString()}</span>
                  <span>已付 {totalCashSpent.toLocaleString()}</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950 overflow-hidden">
                  <div
                    className={`h-full transition-all ${remainingCash < 0 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, (totalCashSpent / initialCashAmt) * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
                掌控錢包剩餘鈔票與硬幣
              </p>
            )}
          </div>

          {/* Card 3: Today's Expense Card (Clickable filter) */}
          <button
            type="button"
            onClick={() => {
              setExpenseSubTab('records');
              setSelectedDateFilter((prev) => (prev === 'today' ? 'all' : 'today'));
            }}
            className={`p-3.5 sm:p-4 rounded-2xl border text-left transition flex flex-col justify-between ${
              selectedDateFilter === 'today' && expenseSubTab === 'records'
                ? 'bg-teal-500/10 dark:bg-teal-950/60 border-teal-500 ring-2 ring-teal-500/30'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700/60'
            }`}
            title="點擊只檢視當日支出明細"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                  {lang === 'zh' ? '今日消費' : 'Today'}
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                  selectedDateFilter === 'today' && expenseSubTab === 'records'
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-200/80 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                }`}>
                  {selectedDateFilter === 'today' && expenseSubTab === 'records' ? '篩選中' : '點擊查看'}
                </span>
              </div>
              <div className="font-black font-mono text-xl sm:text-2xl text-teal-800 dark:text-teal-300 mt-1 truncate">
                {formatCurrencyAmount(todaySpentInBase, baseCurrency)}
              </div>
            </div>
            <span className="text-[10px] text-slate-400 block mt-1">
              {formatDateSlash(todayStr)} · {todayExpensesCount} 筆
            </span>
          </button>

          {/* Card 4: Records & Receipts Count */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                {lang === 'zh' ? '帳目與發票' : 'Records'}
              </span>
              <div className="font-black font-mono text-xl sm:text-2xl text-slate-900 dark:text-white mt-1">
                {trip.expenses.length} <span className="text-xs font-normal text-slate-400">筆</span>
              </div>
            </div>
            <span className="text-[10px] text-teal-600 dark:text-teal-400 block mt-1 font-medium">
              {totalReceiptsCount} 張發票存根
            </span>
          </div>
        </div>

        {/* Navigation Tabs for Expenses: Records, Table, Charts, Split */}
        <div className="flex items-center gap-2 pt-4 border-t border-slate-100 dark:border-slate-800 mt-4 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setExpenseSubTab('records')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              expenseSubTab === 'records'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}
          >
            <span>📋 支出明細記錄</span>
          </button>
          <button
            type="button"
            onClick={() => setExpenseSubTab('table')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              expenseSubTab === 'table'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}
          >
            <TableProperties className="w-3.5 h-3.5" />
            <span>📅 每日支出統計表</span>
          </button>
          <button
            type="button"
            onClick={() => setExpenseSubTab('charts')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              expenseSubTab === 'charts'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>📊 統計圖表</span>
          </button>
          {trip.isSplitEnabled && (
            <button
              type="button"
              onClick={() => setExpenseSubTab('split')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                expenseSubTab === 'split'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>🤝 朋友分帳與結算 ({splitMembersList.length} 人)</span>
            </button>
          )}
        </div>
      </div>

      {/* ================= SECTION A: FRIEND BILL SPLITTING & SETTLEMENT VIEW ================= */}
      {trip.isSplitEnabled && expenseSubTab === 'split' && splitsResult && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Member Management Box */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <span>同行分帳夥伴名單</span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  可隨時新增或修改旅伴暱稱，記帳時選擇誰代墊、誰參與均分
                </p>
              </div>

              {!showAddCompanionInput && (
                <button
                  type="button"
                  onClick={() => setShowAddCompanionInput(true)}
                  className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center gap-1 transition"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>新增旅伴</span>
                </button>
              )}
            </div>

            {/* Add Companion Form */}
            {showAddCompanionInput && (
              <form onSubmit={handleAddCompanion} className="flex items-center gap-2 p-2 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/40">
                <input
                  type="text"
                  value={newCompanionName}
                  onChange={(e) => setNewCompanionName(e.target.value)}
                  placeholder="輸入旅伴名字 (如：小明、阿華、Emily)"
                  className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold outline-none"
                  autoFocus
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold"
                >
                  加入
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddCompanionInput(false)}
                  className="px-2.5 py-1.5 text-slate-400 hover:text-slate-600 text-xs"
                >
                  取消
                </button>
              </form>
            )}

            {/* Member Chips */}
            <div className="flex items-center gap-2 flex-wrap">
              {splitMembersList.map((m) => (
                <div
                  key={m}
                  className="px-3 py-1.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span>{m}</span>
                  {m === '我' ? (
                    <span className="text-[10px] text-teal-600 dark:text-teal-400 font-normal">主帳號</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRemoveCompanion(m)}
                      className="p-0.5 rounded-full hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-400 hover:text-rose-600 transition"
                      title="移除此旅伴"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Member Balance Breakdown Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {splitsResult.members.map((m) => {
              const summary = splitsResult.summaries[m];
              const net = Math.round(summary.netBalance);
              const isCreditor = net > 0;
              const isDebtor = net < 0;

              return (
                <div
                  key={m}
                  className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs space-y-3"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-xs">
                        {m.slice(0, 1)}
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white text-sm">
                        {m}
                      </span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold font-mono ${
                        isCreditor
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : isDebtor
                          ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {isCreditor && `應收回 +${formatCurrencyAmount(net, baseCurrency)}`}
                      {isDebtor && `應補付 -${formatCurrencyAmount(-net, baseCurrency)}`}
                      {!isCreditor && !isDebtor && '已平衡'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      <span className="text-[10px] text-slate-400 block font-medium">總代墊金額</span>
                      <span className="font-bold font-mono text-slate-800 dark:text-slate-100 text-sm mt-0.5 block truncate">
                        {formatCurrencyAmount(Math.round(summary.totalPaid), baseCurrency)}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      <span className="text-[10px] text-slate-400 block font-medium">應分攤公費</span>
                      <span className="font-bold font-mono text-slate-800 dark:text-slate-100 text-sm mt-0.5 block truncate">
                        {formatCurrencyAmount(Math.round(summary.totalShare), baseCurrency)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Settlement Recommendation Card */}
          <div className="rounded-3xl bg-gradient-to-br from-indigo-50/70 via-indigo-50/30 to-white dark:from-indigo-950/30 dark:via-slate-900 dark:to-slate-900 border border-indigo-200/80 dark:border-indigo-900/60 p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-sm sm:text-base text-indigo-950 dark:text-indigo-200 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>最少轉帳次數 · 還款結算建議</span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  系統自動消除三角多角債務，計算出最簡潔的還款路徑
                </p>
              </div>

              {/* Copy LINE Summary Button */}
              <button
                type="button"
                onClick={handleCopySplitSummary}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition active:scale-95 shrink-0"
              >
                {copiedSplitToast ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>已複製 LINE 明細！</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>複製 LINE 分帳結算</span>
                  </>
                )}
              </button>
            </div>

            {/* Transfers List */}
            {splitsResult.transfers.length === 0 ? (
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-center space-y-1">
                <span className="text-2xl">✨</span>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  太棒了！大家的代墊與消費完全打平，目前無須轉帳！
                </p>
                <p className="text-xs text-slate-400">
                  所有公費支出皆已平衡
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {splitsResult.transfers.map((t, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                      <span className="px-2.5 py-1 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold">
                        {t.from}
                      </span>
                      <span className="text-slate-400">➜ 應付給</span>
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold">
                        {t.to}
                      </span>
                    </div>

                    <div className="font-black font-mono text-base text-indigo-700 dark:text-indigo-300 shrink-0">
                      {formatCurrencyAmount(t.amount, baseCurrency)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= SECTION B: CHARTS & EXPENSES LIST ================= */}
      {(!trip.isSplitEnabled || expenseSubTab !== 'split') && (
        <>
          {/* 2. Charts Section */}
          {expenseSubTab === 'charts' && (
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-6 shadow-2xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setChartView('daily')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                chartView === 'daily'
                  ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{lang === 'zh' ? '每日花費長條圖' : 'Daily Trend'}</span>
            </button>
            <button
              onClick={() => setChartView('category')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                chartView === 'category'
                  ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <PieChartIcon className="w-3.5 h-3.5" />
              <span>{lang === 'zh' ? '類別占比圓餅圖' : 'Category Breakdown'}</span>
            </button>
          </div>

          <span className="text-[11px] font-mono text-slate-400 font-bold hidden sm:inline-block">
            {baseCurrency} 計價
          </span>
        </div>

        {trip.expenses.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-xs space-y-2">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <DollarSign className="w-6 h-6 stroke-1" />
            </div>
            <p>{lang === 'zh' ? '目前尚無花費記錄，點擊上方「記一筆」新增支出與發票' : 'No expenses recorded yet. Tap "Add Expense" to start.'}</p>
          </div>
        ) : chartView === 'daily' ? (
          /* Daily Spending Bar Chart */
          <div className="space-y-4">
            <div className="w-full h-56 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1', opacity: 0.3 }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `${val >= 1000 ? `${Math.round(val / 1000)}k` : val}`}
                  />
                  <RechartsTooltip
                    cursor={{ fill: 'rgba(15, 118, 110, 0.08)' }}
                    formatter={(val: any) => [`${formatCurrencyAmount(Number(val), baseCurrency)}`, '當日花費']}
                    labelFormatter={(label) => `日期: ${label}`}
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      border: 'none',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                      padding: '8px 12px',
                    }}
                  />
                  <Bar
                    dataKey="amount"
                    fill="#0f766e"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                    onClick={(entry: any) => {
                      if (entry && entry.date) {
                        setSelectedDateFilter(entry.date);
                        setExpenseSubTab('records');
                      }
                    }}
                    className="cursor-pointer hover:opacity-85 transition"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Quick Daily Badges (Clickable to view day's details) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-bold">點擊任一日期查看當日明細：</span>
                <button
                  type="button"
                  onClick={() => setExpenseSubTab('table')}
                  className="text-teal-600 dark:text-teal-400 hover:underline font-bold flex items-center gap-1"
                >
                  <TableProperties className="w-3 h-3" />
                  <span>查看每日統計總覽表 ➜</span>
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
                {dailyChartData.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => {
                      setSelectedDateFilter(d.date);
                      setExpenseSubTab('records');
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 shrink-0 text-center hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition cursor-pointer"
                    title="點擊查看此日全部明細"
                  >
                    <span className="text-[10px] text-slate-400 block font-mono">{d.label}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 font-mono text-[11px]">
                      {formatCurrencyAmount(d.amount, baseCurrency)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Category Pie Chart */
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-6 flex flex-col items-center justify-center relative min-h-[210px] w-full">
              <div className="w-full h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {pieChartData.map((entry) => (
                        <Cell key={`cell-${entry.key}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(val: any, name: any, item: any) => [
                        `${formatCurrencyAmount(Number(val), baseCurrency)} (${item.payload.percentage}%)`,
                        name,
                      ]}
                      contentStyle={{
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        border: 'none',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '12px',
                        padding: '8px 12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="absolute pointer-events-none flex flex-col items-center justify-center">
                <span className="text-[10px] text-slate-400 font-semibold">{lang === 'zh' ? '總支出' : 'Total'}</span>
                <span className="text-xs sm:text-sm font-black font-mono text-slate-800 dark:text-slate-100">
                  {formatCurrencyAmount(totalSpentInBase, baseCurrency)}
                </span>
              </div>
            </div>

            <div className="md:col-span-6 space-y-2">
              {pieChartData.map((item) => (
                <div
                  key={item.key}
                  className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {item.icon} {item.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-[11px] font-bold text-slate-400">
                      {item.percentage}%
                    </span>
                    <span className="font-black text-slate-900 dark:text-white">
                      {formatCurrencyAmount(item.value, baseCurrency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
          )}

          {/* 2.5 Daily Expense Table Section (每日支出統計表) */}
          {expenseSubTab === 'table' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-6 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-4 animate-in fade-in duration-150">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm sm:text-base flex items-center gap-2">
                    <TableProperties className="w-4 h-4 text-teal-600" />
                    <span>{lang === 'zh' ? '每日支出統計總覽表' : 'Daily Expenses Overview Table'}</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {lang === 'zh'
                      ? '點擊任一日期橫列即可直接展開該日所有消費明細與收據憑證，亦可一鍵切換至明細篩選'
                      : 'Click any row to view all expenses and receipt photos for that day'}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      if (expandedTableDate) {
                        setExpandedTableDate(null);
                      } else {
                        const firstWithExp = dailyTableData.find((d) => d.count > 0);
                        if (firstWithExp) setExpandedTableDate(firstWithExp.date);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-xs transition"
                  >
                    {expandedTableDate ? '全部折疊' : '展開最近明細'}
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenAddExpense}
                    className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{lang === 'zh' ? '記一筆' : 'Add Expense'}</span>
                  </button>
                </div>
              </div>

              {/* Table Container */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 font-bold select-none">
                      <th className="py-3 px-3.5 whitespace-nowrap">日期 / 行程天數</th>
                      <th className="py-3 px-3 text-center whitespace-nowrap">筆數</th>
                      <th className="py-3 px-3.5 text-right whitespace-nowrap">💵 現金支出</th>
                      <th className="py-3 px-3.5 text-right whitespace-nowrap">💳 信用卡/電子</th>
                      <th className="py-3 px-3.5 text-right whitespace-nowrap">當日總計 ({baseCurrency})</th>
                      <th className="py-3 px-3.5 text-center whitespace-nowrap">明細操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                    {dailyTableData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                          目前尚無支出記錄，點擊上方「記一筆」新增
                        </td>
                      </tr>
                    ) : (
                      dailyTableData.map((row) => {
                        const isExpanded = expandedTableDate === row.date;
                        const isToday = row.date === todayStr || row.date === todayUtcStr;
                        return (
                          <React.Fragment key={row.date}>
                            {/* Main Summary Row */}
                            <tr
                              onClick={() => setExpandedTableDate(isExpanded ? null : row.date)}
                              className={`transition cursor-pointer ${
                                isExpanded
                                  ? 'bg-teal-50/60 dark:bg-teal-950/30'
                                  : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/50'
                              }`}
                            >
                              {/* Date & Label */}
                              <td className="py-3 px-3.5">
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                                    row.count > 0 ? (isToday ? 'bg-emerald-500 animate-pulse' : 'bg-teal-600') : 'bg-slate-300 dark:bg-slate-600'
                                  }`} />
                                  <div>
                                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                      <span>{row.label}</span>
                                      {isToday && (
                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-600 text-white leading-none">
                                          今日
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {row.date}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* Count */}
                              <td className="py-3 px-3 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded-full font-mono text-[11px] font-bold ${
                                  row.count > 0
                                    ? 'bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300'
                                    : 'text-slate-400'
                                }`}>
                                  {row.count} 筆
                                </span>
                              </td>

                              {/* Cash Amount */}
                              <td className="py-3 px-3.5 text-right font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                                {row.cashAmount > 0 ? (
                                  formatCurrencyAmount(row.cashAmount, baseCurrency)
                                ) : (
                                  <span className="text-slate-300 dark:text-slate-600">-</span>
                                )}
                              </td>

                              {/* Card Amount */}
                              <td className="py-3 px-3.5 text-right font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                                {row.cardAmount > 0 ? (
                                  formatCurrencyAmount(row.cardAmount, baseCurrency)
                                ) : (
                                  <span className="text-slate-300 dark:text-slate-600">-</span>
                                )}
                              </td>

                              {/* Total Amount */}
                              <td className="py-3 px-3.5 text-right font-mono text-sm font-black text-slate-900 dark:text-white">
                                {row.totalAmount > 0 ? (
                                  formatCurrencyAmount(row.totalAmount, baseCurrency)
                                ) : (
                                  <span className="text-slate-300 dark:text-slate-600 font-normal">0</span>
                                )}
                              </td>

                              {/* Action */}
                              <td className="py-3 px-3.5 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <span className={`p-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                                    isExpanded
                                      ? 'text-teal-700 dark:text-teal-300 bg-teal-100/70 dark:bg-teal-900/50'
                                      : 'text-slate-500 hover:text-teal-600'
                                  }`}>
                                    <span>{isExpanded ? '收合明細' : '展開當日明細'}</span>
                                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                  </span>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedDateFilter(row.date);
                                      setExpenseSubTab('records');
                                    }}
                                    className="p-1 px-2 rounded-lg bg-slate-100 hover:bg-teal-100 dark:bg-slate-800 dark:hover:bg-teal-950 text-slate-600 hover:text-teal-700 dark:text-slate-300 text-[10px] font-bold transition"
                                    title="在明細清單中篩選此日"
                                  >
                                    篩選列表 ➜
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Inline Expandable Details Row */}
                            {isExpanded && (
                              <tr className="bg-slate-50/80 dark:bg-slate-800/40 border-y border-teal-200 dark:border-teal-800/60">
                                <td colSpan={6} className="p-3 sm:p-5">
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                                          {row.label} · 當日全部消費明細 ({row.items.length} 筆)
                                        </span>
                                        <span className="font-mono font-black text-xs text-teal-700 dark:text-teal-300">
                                          總計 {formatCurrencyAmount(row.totalAmount, baseCurrency)}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setDate(row.date);
                                            handleOpenAddExpense();
                                          }}
                                          className="px-2.5 py-1 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold flex items-center gap-1 shadow-2xs"
                                        >
                                          <Plus className="w-3 h-3" />
                                          <span>為這天記一筆</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedDateFilter(row.date);
                                            setExpenseSubTab('records');
                                          }}
                                          className="px-2.5 py-1 rounded-xl border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold"
                                        >
                                          移至明細頁完整檢視 ➜
                                        </button>
                                      </div>
                                    </div>

                                    {row.items.length === 0 ? (
                                      <div className="py-4 text-center text-slate-400 text-xs">
                                        此日期尚無任何消費記錄，可點擊上方「為這天記一筆」新增！
                                      </div>
                                    ) : (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                        {row.items.map((item) => {
                                          const catMeta = getCategoryMeta(item.category);
                                          const itemVal = getItemConvertedAmount(item);
                                          const isDiffCur = item.currency !== baseCurrency;
                                          const itemAllImages = item.receiptImages && item.receiptImages.length > 0
                                            ? item.receiptImages
                                            : (item.receiptImage ? [item.receiptImage] : []);

                                          return (
                                            <div
                                              key={item.id}
                                              className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex items-start justify-between gap-2.5 shadow-2xs hover:border-teal-300 dark:hover:border-teal-700 transition"
                                            >
                                              <div className="flex items-start gap-2.5 min-w-0">
                                                <div className={`w-8 h-8 rounded-xl ${catMeta.bg} flex items-center justify-center text-sm shrink-0`}>
                                                  {catMeta.icon}
                                                </div>

                                                <div className="min-w-0">
                                                  <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-bold text-slate-900 dark:text-white text-xs truncate">
                                                      {item.title}
                                                    </span>
                                                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400 font-semibold flex items-center gap-0.5">
                                                      <span>{PAYMENT_LABELS[item.paymentMethod]?.icon || '💵'}</span>
                                                      <span>{PAYMENT_LABELS[item.paymentMethod]?.[lang] || item.paymentMethod}</span>
                                                    </span>
                                                    <span className="text-[10px] text-slate-400">
                                                      {catMeta.label}
                                                    </span>
                                                  </div>

                                                  {item.notes && (
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                                      {item.notes}
                                                    </p>
                                                  )}

                                                  {itemAllImages.length > 0 && (
                                                    <div className="flex items-center gap-1.5 mt-1.5">
                                                      {itemAllImages.slice(0, 3).map((img, imgIdx) => (
                                                        <button
                                                          key={imgIdx}
                                                          type="button"
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            setViewingReceiptGallery({
                                                              images: itemAllImages,
                                                              currentIndex: imgIdx,
                                                              title: item.title,
                                                              amount: item.amount,
                                                              currency: item.currency,
                                                              expenseId: item.id,
                                                            });
                                                          }}
                                                          className="w-7 h-7 rounded-lg overflow-hidden border border-teal-300 dark:border-teal-700 hover:scale-105 transition"
                                                          title="點擊放大檢視發票"
                                                        >
                                                          <img src={img} alt="發票" className="w-full h-full object-cover" />
                                                        </button>
                                                      ))}
                                                      <span className="text-[10px] text-teal-600 dark:text-teal-400 font-medium">
                                                        {itemAllImages.length} 張發票
                                                      </span>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>

                                              <div className="flex flex-col items-end shrink-0">
                                                <span className="font-mono font-black text-slate-900 dark:text-white text-xs sm:text-base">
                                                  {formatCurrencyAmount(item.amount, item.currency)}
                                                </span>
                                                {isDiffCur && (
                                                  <span className="text-[10px] text-teal-600 dark:text-teal-400 font-mono">
                                                    ≈ {formatCurrencyAmount(itemVal, baseCurrency)}
                                                  </span>
                                                )}

                                                <div className="flex items-center gap-1 mt-1">
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleOpenEditExpense(item);
                                                    }}
                                                    className="p-1 rounded-md text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-slate-800"
                                                    title="編輯此筆"
                                                  >
                                                    <Pencil className="w-3 h-3" />
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleDeleteExpense(item.id);
                                                    }}
                                                    className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800"
                                                    title="刪除此筆"
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. Expense History List with Category Chips & Receipt Thumbnails */}
          {expenseSubTab === 'records' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-6 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm">
              {lang === 'zh' ? '支出明細記錄' : 'Expense Records'} ({filteredExpenses.length})
            </h4>
            {totalReceiptsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-300 font-bold text-[10px] border border-teal-200 dark:border-teal-800 flex items-center gap-1">
                <Receipt className="w-3 h-3 text-teal-600" />
                <span>{totalReceiptsCount} 張發票</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleOpenAddExpense}
            className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{lang === 'zh' ? '記一筆' : 'Add Expense'}</span>
          </button>
        </div>

        {/* Filters Section: Date Filter & Category Filter */}
        <div className="space-y-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
          {/* 1. Date Selector Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <span className="text-[11px] font-bold text-slate-400 shrink-0 pl-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-teal-600" />
              <span>日期:</span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedDateFilter('all')}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition shrink-0 ${
                selectedDateFilter === 'all'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              全部日期
            </button>
            <button
              type="button"
              onClick={() => setSelectedDateFilter('today')}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition flex items-center gap-1 shrink-0 ${
                selectedDateFilter === 'today'
                  ? 'bg-teal-600 text-white shadow-2xs'
                  : 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-100'
              }`}
            >
              <span>⭐ 今日</span>
              {todayExpensesCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-teal-800/40 text-[9px] font-mono">
                  {todayExpensesCount}
                </span>
              )}
            </button>

            {/* Pre-trip preparations chip */}
            {trip.expenses.some((e) => trip.startDate && e.date < trip.startDate) && (
              <button
                type="button"
                onClick={() => setSelectedDateFilter('pre')}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition shrink-0 ${
                  selectedDateFilter === 'pre'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                🎒 行前準備
              </button>
            )}

            {/* Trip days */}
            {trip.days.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDateFilter(d.date)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-mono font-bold transition shrink-0 ${
                  selectedDateFilter === d.date
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                D{d.dayNumber} ({d.date.slice(5).replace('-', '/')})
              </button>
            ))}

            {/* Cash Only Filter Chip */}
            <button
              type="button"
              onClick={() => setSelectedDateFilter(selectedDateFilter === 'cash_only' ? 'all' : 'cash_only')}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition flex items-center gap-1 shrink-0 ${
                selectedDateFilter === 'cash_only'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <span>💵 僅看現金</span>
            </button>
          </div>

          {/* Active Filter Banner */}
          {selectedDateFilter !== 'all' && (
            <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 flex items-center justify-between text-xs text-teal-900 dark:text-teal-200 animate-in fade-in duration-100">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold">
                  📅 目前顯示：{selectedDateFilter === 'today' ? `今日 (${todayStr})` : selectedDateFilter === 'pre' ? '行前準備' : selectedDateFilter === 'cash_only' ? '僅現金支出' : selectedDateFilter} 的全部明細
                </span>
                <span className="font-mono font-bold text-teal-700 dark:text-teal-300 text-[11px]">
                  (共 {filteredExpenses.length} 筆 · 合計 {formatCurrencyAmount(filteredTotalInBase, baseCurrency)})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDateFilter('all')}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-slate-700 font-bold text-[10px] transition border border-teal-200 dark:border-teal-700 shrink-0 shadow-2xs"
              >
                清除篩選 (查看全部)
              </button>
            </div>
          )}

          {/* 2. Category & Receipt Quick Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <span className="text-[11px] font-bold text-slate-400 shrink-0 pl-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>類別:</span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedCategoryFilter('all')}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition shrink-0 ${
                selectedCategoryFilter === 'all'
                  ? 'bg-teal-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {lang === 'zh' ? '全部分類' : 'All'}
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategoryFilter('with_receipt')}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 transition shrink-0 ${
                selectedCategoryFilter === 'with_receipt'
                  ? 'bg-teal-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <Receipt className="w-3 h-3" />
              <span>{lang === 'zh' ? '附發票' : 'Receipts'}</span>
            </button>

            {/* Standard and custom category filter buttons */}
            {Object.keys(DEFAULT_CATEGORIES).map((catKey) => {
              const count = trip.expenses.filter((e) => e.category === catKey).length;
              if (count === 0) return null;
              const meta = DEFAULT_CATEGORIES[catKey];
              return (
                <button
                  key={catKey}
                  type="button"
                  onClick={() => setSelectedCategoryFilter(catKey)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition shrink-0 ${
                    selectedCategoryFilter === catKey
                      ? 'bg-teal-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {meta.icon} {meta.label}
                </button>
              );
            })}

            {customCategories.map((catKey) => {
              const count = trip.expenses.filter((e) => e.category === catKey).length;
              if (count === 0) return null;
              return (
                <button
                  key={catKey}
                  type="button"
                  onClick={() => setSelectedCategoryFilter(catKey)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition shrink-0 ${
                    selectedCategoryFilter === catKey
                      ? 'bg-teal-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  🏷️ {catKey}
                </button>
              );
            })}
          </div>

          {/* Active Filter Summary Bar if filtered */}
          {(selectedDateFilter !== 'all' || selectedCategoryFilter !== 'all') && (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200/60 dark:border-teal-900/60 text-xs">
              <div className="flex items-center gap-1.5 text-teal-900 dark:text-teal-200 font-medium flex-wrap">
                <span>正在檢視：</span>
                <span className="font-bold underline">
                  {selectedDateFilter === 'today'
                    ? `今日 (${todayStr})`
                    : selectedDateFilter !== 'all'
                    ? selectedDateFilter
                    : '全部日期'}
                </span>
                {selectedCategoryFilter !== 'all' && (
                  <span>
                    · 類別: {selectedCategoryFilter === 'with_receipt' ? '附發票' : (getCategoryMeta(selectedCategoryFilter).label || selectedCategoryFilter)}
                  </span>
                )}
                <span className="font-mono font-bold ml-1">
                  (共 {filteredExpenses.length} 筆 · 小計 {formatCurrencyAmount(filteredTotalInBase, baseCurrency)})
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedDateFilter('all');
                  setSelectedCategoryFilter('all');
                }}
                className="text-[11px] font-bold text-teal-700 dark:text-teal-300 hover:underline shrink-0 ml-2"
              >
                清除篩選
              </button>
            </div>
          )}
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            <p>{lang === 'zh' ? '查無符合條件的支出明細' : 'No expenses match this filter'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 space-y-1">
            {filteredExpenses.map((item) => {
              const catMeta = getCategoryMeta(item.category);
              const payInfo = PAYMENT_LABELS[item.paymentMethod] || PAYMENT_LABELS.card;
              const allImages = item.receiptImages && item.receiptImages.length > 0
                ? item.receiptImages
                : item.receiptImage
                ? [item.receiptImage]
                : [];
              const convertedEquivalent = getItemConvertedAmount(item);
              const isDiffCurrency = item.currency !== baseCurrency;

              return (
                <div
                  key={item.id}
                  className="py-3 px-2 sm:px-3 rounded-2xl hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition flex items-start justify-between gap-3 text-xs group"
                >
                  <div
                    className="flex items-start gap-3 min-w-0 flex-1 cursor-pointer"
                    onClick={() => handleOpenEditExpense(item)}
                    title={lang === 'zh' ? '點擊編輯修改此筆記帳' : 'Click to edit'}
                  >
                    <span className="text-base shrink-0 p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 mt-0.5 group-hover:border-teal-300 dark:group-hover:border-teal-700 transition">
                      {catMeta.icon}
                    </span>
                    <div className="min-w-0 space-y-1 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-900 dark:text-slate-100 text-sm group-hover:text-teal-600 dark:group-hover:text-teal-400 transition">
                          {item.title}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium">
                          {catMeta.label}
                        </span>
                        {/* Day Tag or Date */}
                        <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-mono">
                          {item.dayNumber ? `Day ${item.dayNumber}` : '行前'} · {item.date}
                        </span>
                        {item.paidBy && trip.isSplitEnabled && (
                          <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px]">
                            {item.paidBy} 代墊
                          </span>
                        )}
                      </div>

                      {/* Payment & notes */}
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                        <span>{payInfo.icon} {payInfo[lang]}</span>
                        {item.notes && (
                          <>
                            <span>•</span>
                            <span className="text-slate-600 dark:text-slate-300 italic truncate max-w-[200px]">
                              {item.notes}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Receipt Image Thumbnails Gallery Preview */}
                      {allImages.length > 0 && (
                        <div className="flex items-center gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                          {allImages.slice(0, 3).map((imgUrl, imgIdx) => (
                            <img
                              key={imgIdx}
                              src={imgUrl}
                              alt={`Receipt ${imgIdx + 1}`}
                              onClick={() =>
                                setViewingReceiptGallery({
                                  images: allImages,
                                  currentIndex: imgIdx,
                                  title: item.title,
                                  amount: item.amount,
                                  currency: item.currency,
                                  expenseId: item.id,
                                })
                              }
                              className="w-9 h-9 object-cover rounded-lg border border-teal-200 dark:border-teal-800 shadow-2xs cursor-pointer hover:opacity-80 transition"
                            />
                          ))}
                          {allImages.length > 3 && (
                            <button
                              onClick={() =>
                                setViewingReceiptGallery({
                                  images: allImages,
                                  currentIndex: 0,
                                  title: item.title,
                                  amount: item.amount,
                                  currency: item.currency,
                                  expenseId: item.id,
                                })
                              }
                              className="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 text-[10px] font-bold flex items-center justify-center hover:bg-teal-100 transition"
                            >
                              +{allImages.length - 3}
                            </button>
                          )}
                          <span className="text-[10px] text-teal-600 dark:text-teal-400 font-medium ml-1">
                            {allImages.length} 張發票
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Amounts & Actions */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="text-right">
                      <div className="font-mono font-black text-slate-900 dark:text-white text-sm sm:text-base">
                        {formatCurrencyAmount(item.amount, item.currency)}
                      </div>
                      {isDiffCurrency && (
                        <div className="text-[10px] text-teal-600 dark:text-teal-400 font-mono font-semibold">
                          ≈ {formatCurrencyAmount(convertedEquivalent, baseCurrency)}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 mt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditExpense(item);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition"
                        title={lang === 'zh' ? '編輯修改此筆記帳' : 'Edit expense'}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteExpense(item.id);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                        title={lang === 'zh' ? '刪除此筆支出' : 'Delete expense'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
          )}
        </>
      )}

      {/* 4. Fullscreen Mobile / Centered Desktop Modal for Add / Edit Expense */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4"
          onClick={() => {
            setShowAddModal(false);
            setEditingExpenseId(null);
          }}
        >
          <div
            className="w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-lg bg-white dark:bg-slate-900 sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  editingExpenseId
                    ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                    : 'bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300'
                }`}>
                  {editingExpenseId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                    {editingExpenseId
                      ? (lang === 'zh' ? '編輯支出紀錄' : 'Edit Expense Record')
                      : (lang === 'zh' ? '記一筆新支出' : 'Add New Expense')}
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    {editingExpenseId
                      ? (lang === 'zh' ? '修改金額、幣別、分類或更新發票相片' : 'Modify amount, category, or receipt photos')
                      : (lang === 'zh' ? '選擇幣別、輸入金額與上傳多張收據' : 'Select currency & upload receipts')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingExpenseId(null);
                }}
                className="p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSaveExpense} id="expense-modal-form" className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* 1. 金額 (Currency & Amount) */}
              <div className="p-4 rounded-2xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/60 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    {lang === 'zh' ? '消費幣別' : 'Currency'}
                  </label>
                  <span className="text-[10px] text-teal-700 dark:text-teal-400 font-mono">
                    {itemCurrency !== baseCurrency && (
                      <>匯率自動換算至 {baseCurrency}</>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {SUPPORTED_CURRENCIES.map((cur) => (
                    <button
                      key={cur.code}
                      type="button"
                      onClick={() => setItemCurrency(cur.code)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                        itemCurrency === cur.code
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-teal-500'
                      }`}
                    >
                      {cur.flag} {cur.code} ({cur.symbol})
                    </button>
                  ))}
                </div>

                {/* Big Numeric Amount Input */}
                <div>
                  <div className="flex items-center rounded-xl bg-white dark:bg-slate-800 border-2 border-teal-200 dark:border-teal-700/80 focus-within:border-teal-600 dark:focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-500/20 transition overflow-hidden">
                    <div className="px-3.5 py-3 bg-teal-50/70 dark:bg-teal-950/40 border-r border-teal-200 dark:border-teal-800/80 text-teal-800 dark:text-teal-200 font-mono font-bold text-base sm:text-lg shrink-0 select-none flex items-center gap-1">
                      <span>{CURRENCY_MAP[itemCurrency]?.symbol || itemCurrency}</span>
                      <span className="text-[10px] text-teal-600 dark:text-teal-400 font-normal">({itemCurrency})</span>
                    </div>
                    <input
                      type="number"
                      step="any"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      className="flex-1 min-w-0 px-4 py-3 bg-transparent text-xl sm:text-2xl font-mono font-black text-slate-900 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                    />
                  </div>

                  {/* Converted Preview */}
                  {amount && !isNaN(parseFloat(amount)) && itemCurrency !== baseCurrency && (
                    <div className="mt-1.5 text-right font-mono text-xs text-teal-700 dark:text-teal-300 font-bold">
                      ≈ {formatCurrencyAmount(convertAmount(parseFloat(amount), itemCurrency, baseCurrency, trip.customExchangeRates), baseCurrency)}
                    </div>
                  )}
                </div>
              </div>

              {/* 2. 方式 (Payment Method) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  {lang === 'zh' ? '支付方式' : 'Payment Method'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`py-2 px-2.5 rounded-xl border text-center transition flex items-center justify-center gap-1 text-xs ${
                        paymentMethod === m
                          ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/60 font-bold text-teal-900 dark:text-teal-200'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span>{PAYMENT_LABELS[m].icon}</span>
                      <span>{PAYMENT_LABELS[m][lang]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. 種類 (Category) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    {lang === 'zh' ? '支出類別' : 'Category'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowNewCatInput(!showNewCatInput)}
                    className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{lang === 'zh' ? '新增自訂類別' : 'Custom Category'}</span>
                  </button>
                </div>

                {showNewCatInput && (
                  <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 animate-in fade-in duration-100">
                    <input
                      type="text"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      placeholder="輸入新類別名稱 (如：溫泉、模型玩具)"
                      className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-600 text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomCategory}
                      className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold"
                    >
                      加入
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {Object.entries(DEFAULT_CATEGORIES).map(([catKey, info]) => (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => setCategory(catKey)}
                      className={`p-2 rounded-xl text-left border transition flex items-center gap-1.5 ${
                        category === catKey
                          ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/60 font-bold text-teal-900 dark:text-teal-200'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="text-sm">{info.icon}</span>
                      <span className="truncate text-[11px]">{info.label}</span>
                    </button>
                  ))}

                  {customCategories.map((catKey) => (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => setCategory(catKey)}
                      className={`p-2 rounded-xl text-left border transition flex items-center gap-1.5 ${
                        category === catKey
                          ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/60 font-bold text-teal-900 dark:text-teal-200'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="text-sm">🏷️</span>
                      <span className="truncate text-[11px]">{catKey}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. 描述 (Description: Title & Notes) */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {lang === 'zh' ? '品項描述 / 支出名稱' : 'Title / Description'} *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={lang === 'zh' ? '如：一蘭拉麵、晴空塔門票、超商飲料、伴手禮盒' : 'e.g. Dinner, Ticket, Flight'}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {lang === 'zh' ? '備註細節 (選填)' : 'Notes (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={lang === 'zh' ? '如：退稅後金額、刷國外回饋卡、友人代買' : 'e.g. Tax refunded, friends split'}
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs outline-none"
                  />
                </div>
              </div>

              {/* 5. 日期 (Date) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-teal-600" />
                    <span>{lang === 'zh' ? '消費日期' : 'Date'} *</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="px-2.5 py-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono outline-none"
                  />
                </div>

                {/* Quick Date Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => {
                      const preDate = trip.startDate || todayStr;
                      setDate(preDate);
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 transition ${
                      date < trip.startDate
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    行前準備
                  </button>
                  {trip.days.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDate(d.date)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold shrink-0 transition ${
                        date === d.date
                          ? 'bg-teal-600 text-white shadow-2xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      D{d.dayNumber} ({d.date.slice(5).replace('-', '/')})
                    </button>
                  ))}
                </div>
              </div>

              {/* 6. 分帳設定 (若開啟) */}
              {trip.isSplitEnabled && (
                <div className="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{lang === 'zh' ? '朋友分帳設定' : 'Split Details'}</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-slate-600 dark:text-slate-400 select-none hover:text-indigo-600">
                      <input
                        type="checkbox"
                        checked={itemIsPersonal}
                        onChange={(e) => setItemIsPersonal(e.target.checked)}
                        className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer"
                      />
                      <span>{lang === 'zh' ? '此筆為個人私用 (不列入公費分帳)' : 'Personal (No Split)'}</span>
                    </label>
                  </div>

                  {!itemIsPersonal && (
                    <>
                      {/* Payer Selection */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                          {lang === 'zh' ? '誰先代墊 / 買單？' : 'Who Paid?'}
                        </span>
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                          {splitMembersList.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setItemPaidBy(m)}
                              className={`px-3 py-1 rounded-xl text-xs font-bold transition shrink-0 ${
                                itemPaidBy === m
                                  ? 'bg-indigo-600 text-white shadow-2xs'
                                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {m === '我' ? '🙋‍♂️ 我' : `👤 ${m}`}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Participants Selection */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                            {lang === 'zh' ? '誰參與分攤？' : 'Split Between'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (itemSplitWith.length === splitMembersList.length) {
                                setItemSplitWith(['我']);
                              } else {
                                setItemSplitWith(splitMembersList);
                              }
                            }}
                            className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            {itemSplitWith.length === splitMembersList.length ? '全選中' : '全選'}
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                          {splitMembersList.map((m) => {
                            const isIncluded = itemSplitWith.includes(m);
                            return (
                              <button
                                key={m}
                                type="button"
                                onClick={() => {
                                  if (isIncluded) {
                                    if (itemSplitWith.length > 1) {
                                      setItemSplitWith(itemSplitWith.filter((x) => x !== m));
                                    }
                                  } else {
                                    setItemSplitWith([...itemSplitWith, m]);
                                  }
                                }}
                                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 ${
                                  isIncluded
                                    ? 'bg-emerald-600 text-white shadow-2xs'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-transparent'
                                }`}
                              >
                                {isIncluded && <Check className="w-3 h-3" />}
                                <span>{m}</span>
                              </button>
                            );
                          })}
                        </div>
                        {amount && !isNaN(parseFloat(amount)) && itemSplitWith.length > 0 && (
                          <p className="text-[10px] text-indigo-600 dark:text-indigo-300 font-mono pt-0.5">
                            每人應攤約 {formatCurrencyAmount(Math.round(convertAmount(parseFloat(amount), itemCurrency, baseCurrency, trip.customExchangeRates) / itemSplitWith.length), baseCurrency)} ({itemSplitWith.length} 人均分)
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 7. 發票憑證上傳 (僅 n9102125@gmail.com 顯示上傳功能) */}
              {canUploadImages() && (
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Receipt className="w-3.5 h-3.5 text-teal-600" />
                      <span>{lang === 'zh' ? '發票憑證與明細收據 (可上傳多張)' : 'Receipt Photos (Multiple)'}</span>
                    </label>
                    <span className="text-[10px] text-teal-600 dark:text-teal-400 font-medium">
                      已選 {receiptImages.length} 張
                    </span>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleReceiptFiles}
                  />

                  {/* Upload Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isCompressingReceipts}
                    className="w-full py-3 px-4 border-2 border-dashed border-teal-300 dark:border-teal-800 hover:border-teal-500 bg-teal-50/30 dark:bg-slate-800/50 rounded-2xl flex items-center justify-center gap-2 text-teal-700 dark:text-teal-300 transition active:scale-98"
                  >
                    <Camera className="w-4 h-4 text-teal-600" />
                    <span className="font-semibold text-xs">
                      {isCompressingReceipts ? '處理壓縮相片中...' : '拍照或選取多張收據相片 (自動壓縮保存)'}
                    </span>
                  </button>

                  {/* Thumbnail Previews with Remove Button */}
                  {receiptImages.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
                      {receiptImages.map((img, idx) => (
                        <div key={idx} className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 aspect-square">
                          <img src={img} alt={`Receipt ${idx}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => handleRemoveReceiptImage(idx)}
                            className="absolute top-1 right-1 p-1 bg-black/70 hover:bg-rose-600 text-white rounded-full transition"
                            title="移除此張"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </form>

            {/* Sticky Modal Bottom Actions */}
            <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/80 flex items-center justify-between gap-2.5 shrink-0">
              <div>
                {editingExpenseId && (
                  <button
                    type="button"
                    onClick={handleDeleteCurrentlyEditing}
                    className="px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition font-semibold text-xs flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{lang === 'zh' ? '刪除此筆' : 'Delete'}</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingExpenseId(null);
                  }}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition font-semibold text-xs text-slate-700 dark:text-slate-300"
                >
                  {lang === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  form="expense-modal-form"
                  className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition active:scale-95 flex items-center gap-1.5 text-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {editingExpenseId
                      ? (lang === 'zh' ? '儲存修改' : 'Save Changes')
                      : (lang === 'zh' ? '確認儲存' : 'Save Expense')}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Custom Exchange Rate Configuration Modal */}
      {showRateModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowRateModal(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 animate-in fade-in zoom-in-95 duration-100 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-teal-600" />
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  {lang === 'zh' ? '匯率換算設定' : 'Exchange Rates'}
                </h4>
              </div>
              <button
                onClick={() => setShowRateModal(false)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-[11px] text-teal-900 dark:text-teal-200 space-y-1.5">
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>已啟用國際外匯市場自動換算</span>
                </span>
                <button
                  type="button"
                  onClick={handleRefreshLiveRates}
                  disabled={isFetchingRates}
                  className="px-2 py-0.5 rounded-lg bg-teal-600 text-white font-bold text-[10px] flex items-center gap-1 hover:bg-teal-700 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isFetchingRates ? 'animate-spin' : ''}`} />
                  <span>{isFetchingRates ? '抓取中...' : '重新抓取'}</span>
                </button>
              </div>
              <p className="text-[10px] text-teal-700 dark:text-teal-400">
                系統預設每日自動更新匯率，無需手動輸入。若有特定信用卡結算匯率，可在下方手動覆蓋設定：
              </p>
            </div>

            <div className="space-y-2.5">
              {SUPPORTED_CURRENCIES.filter((c) => c.code !== 'JPY').map((cur) => {
                const currentVal = tempRates[cur.code] ?? cur.defaultRateToJPY;
                return (
                  <div key={cur.code} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                      <span>{cur.flag}</span>
                      <span>1 {cur.code} =</span>
                    </span>
                    <div className="flex items-center gap-1.5 font-mono">
                      <input
                        type="number"
                        step="0.01"
                        value={currentVal}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            setTempRates((prev) => ({ ...prev, [cur.code]: val }));
                          }
                        }}
                        className="w-20 px-2 py-1 bg-white dark:bg-slate-700 rounded-lg border border-slate-300 dark:border-slate-600 text-right font-bold outline-none"
                      />
                      <span className="text-slate-400">JPY</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setTempRates({});
                  onUpdateTrip({ ...trip, customExchangeRates: undefined, updatedAt: Date.now() });
                  setShowRateModal(false);
                }}
                className="px-3 py-1.5 text-slate-500 hover:underline text-[11px]"
              >
                恢復預設值
              </button>
              <button
                type="button"
                onClick={handleSaveRates}
                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl"
              >
                套用設定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5.5 Cash on Hand Configuration Modal (手頭初始現金設定) */}
      {showCashModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
          onClick={() => setShowCashModal(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-100 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    {lang === 'zh' ? '設定手頭初始現金' : 'Set Initial Cash on Hand'}
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    隨時掌握錢包剩餘現金，自動扣除所有「現金支付」支出
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCashModal(false)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Currency Choice */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                現金幣別：
              </label>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {SUPPORTED_CURRENCIES.map((cur) => (
                  <button
                    key={cur.code}
                    type="button"
                    onClick={() => setCashInputCur(cur.code)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                      cashInputCur === cur.code
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-emerald-500'
                    }`}
                  >
                    {cur.flag} {cur.code}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount Input */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                初始準備金額 (現金總額)：
              </label>
              <div className="flex items-center rounded-2xl bg-white dark:bg-slate-800 border-2 border-emerald-300 dark:border-emerald-700/80 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-500/20 transition overflow-hidden">
                <div className="px-3.5 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 border-r border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-mono font-bold text-base shrink-0 select-none">
                  {CURRENCY_MAP[cashInputCur]?.symbol || cashInputCur}
                </div>
                <input
                  type="number"
                  step="any"
                  value={cashInputAmt}
                  onChange={(e) => setCashInputAmt(e.target.value)}
                  placeholder="輸入換匯或攜帶的現金總額..."
                  className="flex-1 px-4 py-2.5 bg-transparent text-xl font-mono font-black text-slate-900 dark:text-white outline-none"
                  autoFocus
                />
              </div>

              {/* Quick Amount Chips */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[10px] text-slate-400 font-semibold">快速帶入:</span>
                {(cashInputCur === 'JPY'
                  ? [30000, 50000, 100000, 150000, 200000]
                  : cashInputCur === 'TWD'
                  ? [5000, 10000, 20000, 30000, 50000]
                  : [300, 500, 1000, 2000, 5000]
                ).map((quickVal) => (
                  <button
                    key={quickVal}
                    type="button"
                    onClick={() => setCashInputAmt(String(quickVal))}
                    className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 font-mono text-[10px] font-bold transition"
                  >
                    {quickVal.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Calculation Preview Card */}
            {parseFloat(cashInputAmt) > 0 && (
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                  <span>初始設定金額：</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {formatCurrencyAmount(parseFloat(cashInputAmt) || 0, cashInputCur)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                  <span>累計現金支出扣除：</span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                    - {formatCurrencyAmount(totalCashSpent, cashInputCur)}
                  </span>
                </div>
                <div className="pt-1 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs font-bold">
                  <span className="text-emerald-800 dark:text-emerald-300">預估手頭剩餘：</span>
                  <span className={`font-mono text-sm font-black ${
                    (parseFloat(cashInputAmt) || 0) - totalCashSpent < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-700 dark:text-emerald-300'
                  }`}>
                    {formatCurrencyAmount((parseFloat(cashInputAmt) || 0) - totalCashSpent, cashInputCur)}
                  </span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowCashModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-50 transition"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveInitialCash}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs active:scale-95 transition"
              >
                確認儲存手頭現金
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Multi-Receipt Fullscreen Lightbox / Gallery */}
      {viewingReceiptGallery && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setViewingReceiptGallery(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-teal-600" />
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                    {viewingReceiptGallery.title}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {formatCurrencyAmount(viewingReceiptGallery.amount, viewingReceiptGallery.currency)} · 第 {viewingReceiptGallery.currentIndex + 1} / {viewingReceiptGallery.images.length} 張發票
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingReceiptGallery(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Image Preview with Next/Prev Carousel */}
            <div className="relative p-2 sm:p-4 flex-1 overflow-auto flex items-center justify-center bg-slate-950/20 min-h-[300px]">
              <img
                src={viewingReceiptGallery.images[viewingReceiptGallery.currentIndex]}
                alt="Receipt Image"
                className="max-h-[65vh] max-w-full rounded-2xl object-contain shadow-lg border border-slate-200 dark:border-slate-800"
              />

              {/* Prev Button */}
              {viewingReceiptGallery.images.length > 1 && (
                <>
                  <button
                    onClick={() =>
                      setViewingReceiptGallery((prev) =>
                        prev
                          ? {
                              ...prev,
                              currentIndex: (prev.currentIndex - 1 + prev.images.length) % prev.images.length,
                            }
                          : null
                      )
                    }
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-xs transition shadow-md"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() =>
                      setViewingReceiptGallery((prev) =>
                        prev
                          ? {
                              ...prev,
                              currentIndex: (prev.currentIndex + 1) % prev.images.length,
                            }
                          : null
                      )
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-xs transition shadow-md"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* Bottom bar */}
            <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-400">
                可多張左右滑動切換
              </span>
              <div className="flex items-center gap-2">
                {viewingReceiptGallery.expenseId && (
                  <button
                    type="button"
                    onClick={() => {
                      const targetExp = trip.expenses.find((e) => e.id === viewingReceiptGallery.expenseId);
                      setViewingReceiptGallery(null);
                      if (targetExp) {
                        handleOpenEditExpense(targetExp);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 text-amber-800 dark:text-amber-300 font-bold flex items-center gap-1 transition"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>{lang === 'zh' ? '編輯此筆記帳' : 'Edit Expense'}</span>
                  </button>
                )}
                <a
                  href={viewingReceiptGallery.images[viewingReceiptGallery.currentIndex]}
                  download={`receipt-${viewingReceiptGallery.title}-${viewingReceiptGallery.currentIndex + 1}.jpg`}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>下載圖片</span>
                </a>
                <button
                  onClick={() => setViewingReceiptGallery(null)}
                  className="px-4 py-1.5 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-700 transition"
                >
                  完成
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
