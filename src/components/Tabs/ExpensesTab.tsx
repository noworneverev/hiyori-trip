import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useModalLayer } from '../../hooks/useModalHistory';
import { Trip, ExpenseItem } from '../../types/itinerary';
import { formatDateSlash, getTodayLocal } from '../../utils/date';
import { Language, TRANSLATIONS } from '../../utils/i18n';
import { compressImageFile, storeImageAsMediaRef, resolveMediaSrc, garbageCollectOrphanedMedia, isMediaRef, extractMediaId } from '../../utils/image';
import { idbDeleteMedia } from '../../utils/indexedDb';
import { getStoredTrips } from '../../utils/storage';
import { copyTextToClipboard } from '../../utils/clipboard';
import { MediaImage } from '../UI/MediaImage';
import { SwipeableExpenseRow } from '../UI/SwipeableExpenseRow';
import {
  IosModalSheet,
  IosNavBar,
  IosInsetGroup,
  IosDisclosureRow,
  IosCheckmarkRow,
  IosRow,
  IosActionSheet,
} from '../UI/IosPrimitives';
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
  Calendar,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowRightLeft,
  Tag,
  RefreshCw,
  User,
  Users,
  Copy,
  UserPlus,
  Sparkles,
  Pencil,
  Wallet,
  Coins,
  TableProperties,
  Search,
  ShoppingBag,
  CreditCard,
  Check,
} from 'lucide-react';
import { calculateTripSplits, formatSplitsForSharing } from '../../utils/billSplitter';
import { CategoryManageModal } from '../Modals/CategoryManageModal';
import { ExpenseFilterDrawer } from '../Modals/ExpenseFilterDrawer';
import { ExpenseCalendarBar } from '../Expenses/ExpenseCalendarBar';
import { CategoryDonutChart } from '../Expenses/CategoryDonutChart';
import {
  TiantianExpenseEditor,
  TiantianExpenseDraft,
  formatExpenseDescriptionDraft,
  parseExpenseDescription,
  evaluateExpenseAmount,
} from '../Expenses/TiantianExpenseEditor';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  EXPENSE_ACCOUNT_MAP,
  resolveExpenseCategoryMeta,
} from '../Expenses/expenseMeta';
import {
  ResponsiveContainer,
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
  canEdit?: boolean;
  onUpdateTrip: (updatedTrip: Trip) => void;
  requireAuth?: (action: () => void, reason?: string) => boolean;
}

const DEFAULT_CATEGORIES = DEFAULT_EXPENSE_CATEGORIES;
const PAYMENT_LABELS = EXPENSE_ACCOUNT_MAP;

export const ExpensesTab: React.FC<ExpensesTabProps> = ({ trip, lang, canEdit = true, onUpdateTrip, requireAuth }) => {
  const t = TRANSLATIONS[lang];

  // Base display currency (auto-detected from trip destination or trip.currency)
  const defaultDetectedCurrency = detectTripCurrency(trip);
  const [baseCurrency, setBaseCurrency] = useState<string>(trip.currency || defaultDetectedCurrency);
  const initialEditReceiptsRef = useRef<string[]>([]);

  const getInitialExpenseDate = () => {
    const today = getTodayLocal();
    if (trip.startDate && trip.endDate && today >= trip.startDate && today <= trip.endDate) return today;
    return trip.startDate || today;
  };

  // Split members list
  const splitMembersList = useMemo(() => {
    return trip.splitMembers && trip.splitMembers.length > 0 ? trip.splitMembers : ['我', '同行旅伴'];
  }, [trip.splitMembers]);

  // Form states (Tiantian Bookkeeping Draft)
  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditorSubPickerOpen, setIsEditorSubPickerOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [splitNotice, setSplitNotice] = useState<string | null>(null);
  const [expenseDraft, setExpenseDraft] = useState<TiantianExpenseDraft>(() => ({
    date: getInitialExpenseDate(),
    amount: '',
    currency: trip.currency || defaultDetectedCurrency,
    category: 'food',
    paymentMethod: 'cash',
    paidBy: '我',
    splitWith: trip.splitMembers && trip.splitMembers.length > 0 ? trip.splitMembers : ['我', '同行旅伴'],
    isPersonal: false,
    tags: [],
    receiptImages: [],
    description: '',
  }));
  const [isCompressingReceipts, setIsCompressingReceipts] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [editorFocusTrigger, setEditorFocusTrigger] = useState(0);

  // Filter Drawer Bottom Sheet state
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  // Custom Category Dedicated Modal state
  const [showCategoryManageModal, setShowCategoryManageModal] = useState(false);

  // Exchange rate config modal & Live Market Rates
  const [showRateModal, setShowRateModal] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [showBaseCurrencySheet, setShowBaseCurrencySheet] = useState(false);
  const [tempRateInputs, setTempRateInputs] = useState<Record<string, string>>({});
  const [liveRatesInfo, setLiveRatesInfo] = useState<LiveRatesCache | null>(() => getCachedLiveRates());
  const [isFetchingRates, setIsFetchingRates] = useState(false);

  const ratesVersion = liveRatesInfo?.updatedAt ?? 0;

  React.useEffect(() => {
    fetchLiveExchangeRates().then((res) => setLiveRatesInfo(res));
  }, []);

  React.useEffect(() => {
    if (showRateModal) {
      const nextInputs: Record<string, string> = {};
      SUPPORTED_CURRENCIES.filter((c) => c.code !== 'JPY').forEach((cur) => {
        const val =
          trip.customExchangeRates?.[cur.code] ??
          liveRatesInfo?.rates?.[cur.code] ??
          cur.defaultRateToJPY;
        nextInputs[cur.code] = String(val);
      });
      setTempRateInputs(nextInputs);
    }
  }, [showRateModal, trip.customExchangeRates, liveRatesInfo]);

  const handleRefreshLiveRates = async () => {
    setIsFetchingRates(true);
    try {
      const res = await fetchLiveExchangeRates(true);
      setLiveRatesInfo(res);
      if (showRateModal && res?.rates) {
        const refreshedInputs: Record<string, string> = {};
        SUPPORTED_CURRENCIES.filter((c) => c.code !== 'JPY').forEach((cur) => {
          refreshedInputs[cur.code] = String(res.rates[cur.code] ?? cur.defaultRateToJPY);
        });
        setTempRateInputs(refreshedInputs);
      }
    } finally {
      setIsFetchingRates(false);
    }
  };

  // Chart view: 'daily' vs 'category'
  const [chartView, setChartView] = useState<'daily' | 'category'>('daily');

  // Navigation subtabs (Consolidated into 3 crisp tabs: 明細 / 統計 / 分帳)
  const [expenseSubTab, setExpenseSubTab] = useState<'records' | 'stats' | 'split'>('records');
  const effectiveSubTab = (trip.isSoloTrip || !trip.isSplitEnabled) && expenseSubTab === 'split' ? 'records' : expenseSubTab;

  const getTransferSettlementKey = (from: string, to: string, amount: number) =>
    `${from.trim()}->${to.trim()}::${baseCurrency}::${Math.round(amount * 100)}`;

  const handleToggleTransferSettled = (from: string, to: string, amount: number) => {
    if (!canEdit) return;
    const key = getTransferSettlementKey(from, to, amount);
    const prevMap = trip.settledTransfers || {};
    const nextSettled = !prevMap[key]?.settled;
    const nextMap: Record<string, { settled: boolean; settledAt?: number }> = { ...prevMap };
    if (nextSettled) {
      nextMap[key] = { settled: true, settledAt: Date.now() };
    } else {
      delete nextMap[key];
    }
    onUpdateTrip({
      ...trip,
      settledTransfers: Object.keys(nextMap).length > 0 ? nextMap : undefined,
      updatedAt: Date.now(),
    });
  };
  const [expandedTableDate, setExpandedTableDate] = useState<string | null>(null);
  const [newCompanionName, setNewCompanionName] = useState('');
  const [showAddCompanionInput, setShowAddCompanionInput] = useState(false);
  const [pendingRemoveCompanion, setPendingRemoveCompanion] = useState<string | null>(null);
  const [copiedSplitToast, setCopiedSplitToast] = useState(false);
  const [expenseSearchQuery, setExpenseSearchQuery] = useState('');

  // Calculated splits (recomputes whenever live rates update)
  const splitsResult = useMemo(() => {
    return calculateTripSplits(trip, baseCurrency, trip.customExchangeRates);
  }, [trip, baseCurrency, trip.customExchangeRates, ratesVersion]);

  // Filter & Lightbox states
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('all');
  const [cashOnlyFilter, setCashOnlyFilter] = useState<boolean>(false);
  const [withReceiptFilter, setWithReceiptFilter] = useState<boolean>(false);
  const [chartCategoryDetail, setChartCategoryDetail] = useState<string | null>(null);
  const [chartDateDetail, setChartDateDetail] = useState<string | null>(null);
  const [viewingReceiptGallery, setViewingReceiptGallery] = useState<{
    images: string[];
    currentIndex: number;
    title: string;
    amount: number;
    currency: string;
    expenseId?: string;
  } | null>(null);
  const receiptSwipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [pendingDeleteExpense, setPendingDeleteExpense] = useState<ExpenseItem | null>(null);
  const [showCashCurrencyPicker, setShowCashCurrencyPicker] = useState(false);
  const [hasSeenSwipeHint, setHasSeenSwipeHint] = useState<boolean>(() => {
    try {
      return localStorage.getItem('hiyori_expense_swipe_hint_seen') === '1';
    } catch {
      return false;
    }
  });

  const saveToastTimerRef = useRef<number | null>(null);
  const copiedSplitTimerRef = useRef<number | null>(null);
  const splitNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (saveToastTimerRef.current) window.clearTimeout(saveToastTimerRef.current);
      if (copiedSplitTimerRef.current) window.clearTimeout(copiedSplitTimerRef.current);
      if (splitNoticeTimerRef.current) window.clearTimeout(splitNoticeTimerRef.current);
    };
  }, []);

  // Reset per-trip currency & filters when switching trips
  useEffect(() => {
    const nextCur = trip.currency || detectTripCurrency(trip);
    setBaseCurrency(nextCur);
    setExpenseDraft((prev) => ({ ...prev, currency: nextCur }));
    setSelectedCategoryFilter('all');
    setSelectedDateFilter('all');
    setCashOnlyFilter(false);
    setWithReceiptFilter(false);
    setChartCategoryDetail(null);
    setChartDateDetail(null);
    setExpenseSearchQuery('');
    setExpandedTableDate(null);
  }, [trip.id, trip.currency]);

  const dismissSwipeHint = () => {
    if (hasSeenSwipeHint) return;
    setHasSeenSwipeHint(true);
    try {
      localStorage.setItem('hiyori_expense_swipe_hint_seen', '1');
    } catch {}
  };

  useEffect(() => {
    setOpenSwipeId(null);
  }, [trip.id, selectedCategoryFilter, selectedDateFilter, cashOnlyFilter, withReceiptFilter, expenseSearchQuery, effectiveSubTab, showAddModal, pendingDeleteExpense]);

  // Lock background scroll & push history layer for receipt lightbox
  useBodyScrollLock(Boolean(viewingReceiptGallery));
  useModalLayer(Boolean(viewingReceiptGallery), () => setViewingReceiptGallery(null));

  // Keyboard arrow navigation inside receipt lightbox
  useEffect(() => {
    if (!viewingReceiptGallery || viewingReceiptGallery.images.length <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setViewingReceiptGallery((prev) =>
          prev
            ? { ...prev, currentIndex: (prev.currentIndex - 1 + prev.images.length) % prev.images.length }
            : null
        );
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setViewingReceiptGallery((prev) =>
          prev ? { ...prev, currentIndex: (prev.currentIndex + 1) % prev.images.length } : null
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [Boolean(viewingReceiptGallery), viewingReceiptGallery?.images.length]);

  const closeAddExpenseModal = () => {
    const stagedAdded = expenseDraft.receiptImages.filter(
      (ref) => isMediaRef(ref) && !initialEditReceiptsRef.current.includes(ref)
    );
    if (stagedAdded.length > 0) {
      stagedAdded.forEach((ref) => {
        const mid = extractMediaId(ref);
        if (mid) idbDeleteMedia(mid).catch(() => {});
      });
    }
    initialEditReceiptsRef.current = [];
    setShowAddModal(false);
    setIsEditorSubPickerOpen(false);
    setEditingExpenseId(null);
    setSaveToast(null);
    setExpenseDraft((prev) => ({ ...prev, receiptImages: [] }));
    setReceiptError(null);
  };

  // Custom categories list from trip
  const customCategories = trip.customExpenseCategories || [];

  const categoryUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (trip.expenses || []).forEach((exp) => {
      const key = exp.category || 'other';
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [trip.expenses]);

  // Helper: get display info for a category
  const getCategoryMeta = (catKey: string) => resolveExpenseCategoryMeta(catKey, trip);

  // Convert an expense to the selected baseCurrency
  const getItemConvertedAmount = (item: ExpenseItem): number => {
    return convertAmount(item.amount, item.currency, baseCurrency, trip.customExchangeRates);
  };

  const baseDecimals = CURRENCY_MAP[baseCurrency]?.decimals ?? 0;
  const roundForBase = (val: number) => {
    const f = Math.pow(10, baseDecimals);
    return Math.round(val * f) / f;
  };

  // Total Spending in base currency
  const totalSpentInBase = useMemo(() => {
    return roundForBase(trip.expenses.reduce((sum, item) => sum + getItemConvertedAmount(item), 0));
  }, [trip.expenses, baseCurrency, trip.customExchangeRates, ratesVersion]);

  // Budget converted into baseCurrency (trip.budgetTotal is denominated in trip.currency || defaultDetectedCurrency)
  const tripPrimaryCurrency = trip.currency || defaultDetectedCurrency;
  const budgetInBase = useMemo(() => {
    if (!trip.budgetTotal || trip.budgetTotal <= 0) return 0;
    return convertAmount(trip.budgetTotal, tripPrimaryCurrency, baseCurrency, trip.customExchangeRates);
  }, [trip.budgetTotal, tripPrimaryCurrency, baseCurrency, trip.customExchangeRates, ratesVersion]);

  // Today's spending in base currency (local timezone)
  const todayStr = getTodayLocal();

  const todaySpentInBase = useMemo(() => {
    return roundForBase(
      trip.expenses
        .filter((item) => item.date === todayStr)
        .reduce((sum, item) => sum + getItemConvertedAmount(item), 0)
    );
  }, [trip.expenses, baseCurrency, trip.customExchangeRates, todayStr, ratesVersion]);

  // Cash on hand tracker (手頭現金管理)
  const initialCashCur = trip.initialCashCurrency || tripPrimaryCurrency || 'JPY';
  const hasInitialCash = typeof trip.initialCashAmount === 'number' && Number.isFinite(trip.initialCashAmount);
  const initialCashAmt = hasInitialCash ? trip.initialCashAmount! : 0;

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
  }, [trip.expenses, initialCashCur, trip.customExchangeRates, ratesVersion]);

  const remainingCash = initialCashAmt - totalCashSpent;
  const cashSpentPercent = initialCashAmt > 0
    ? Math.min(100, Math.round((totalCashSpent / initialCashAmt) * 100))
    : (totalCashSpent > 0 ? 100 : 0);

  const [cashInputAmt, setCashInputAmt] = useState<string>(hasInitialCash ? String(initialCashAmt) : '');
  const [cashInputCur, setCashInputCur] = useState<string>(initialCashCur);

  // Live preview cash spent in the currency currently selected inside the Cash Modal
  const modalCashSpent = useMemo(() => {
    return trip.expenses
      .filter((item) => item.paymentMethod === 'cash')
      .reduce((sum, item) => {
        return sum + convertAmount(item.amount, item.currency, cashInputCur, trip.customExchangeRates);
      }, 0);
  }, [trip.expenses, cashInputCur, trip.customExchangeRates, ratesVersion]);

  useEffect(() => {
    setCashInputCur(initialCashCur);
  }, [trip.id, initialCashCur]);

  const handleSaveInitialCash = () => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(handleSaveInitialCash, lang === 'zh' ? '儲存手頭現金設定' : 'Save cash setting')) {
      return;
    }
    const trimmed = cashInputAmt.trim();
    if (trimmed === '') {
      onUpdateTrip({
        ...trip,
        initialCashAmount: undefined,
        initialCashCurrency: undefined,
        updatedAt: Date.now(),
      });
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem(`trip_cash_${trip.id}`);
        } catch {}
      }
      setShowCashModal(false);
      return;
    }
    const parsed = parseFloat(trimmed);
    if (isNaN(parsed) || parsed < 0) return;
    onUpdateTrip({
      ...trip,
      initialCashAmount: parsed,
      initialCashCurrency: cashInputCur,
      updatedAt: Date.now(),
    });
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(`trip_cash_${trip.id}`);
      } catch {}
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
  }, [trip.expenses, baseCurrency, trip.customExchangeRates, ratesVersion]);

  const pieChartData = useMemo(() => {
    return Object.entries(categoryTotals)
      .map(([catKey, val]) => {
        const meta = getCategoryMeta(catKey);
        const roundedVal = roundForBase(val);
        return {
          key: catKey,
          name: meta.label,
          value: roundedVal,
          color: meta.color,
          Icon: meta.Icon,
          percentage: totalSpentInBase > 0 ? ((val / totalSpentInBase) * 100).toFixed(1) : '0',
        };
      })
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [categoryTotals, totalSpentInBase, baseDecimals, trip.customCategoryLabels]);

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
        amount: roundForBase(val),
      };
    });
  }, [trip.expenses, trip.days, trip.startDate, baseCurrency, trip.customExchangeRates, ratesVersion]);

  // Filtered expenses for chart interactive breakdown detail
  const chartFilteredExpenses = useMemo(() => {
    if (chartView === 'category') {
      if (!chartCategoryDetail) return trip.expenses;
      return trip.expenses.filter((e) => e.category === chartCategoryDetail);
    } else {
      if (!chartDateDetail) return trip.expenses;
      return trip.expenses.filter((e) => e.date === chartDateDetail);
    }
  }, [trip.expenses, chartView, chartCategoryDetail, chartDateDetail]);

  const chartFilteredTotal = useMemo(() => {
    return roundForBase(chartFilteredExpenses.reduce((sum, e) => sum + getItemConvertedAmount(e), 0));
  }, [chartFilteredExpenses, baseCurrency, trip.customExchangeRates, ratesVersion]);

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
        const isToday = d === todayStr;
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
          } else if (d === todayStr) {
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
  }, [trip.expenses, trip.days, trip.startDate, baseCurrency, trip.customExchangeRates, todayStr, ratesVersion]);

  // Multi-file receipt upload handler (max 5 receipts per expense)
  const handleUploadReceiptsForDraft = async (files: FileList) => {
    if (!files || files.length === 0) return;

    setReceiptError(null);
    const remainingSlots = Math.max(0, 5 - expenseDraft.receiptImages.length);
    if (remainingSlots <= 0) {
      setReceiptError(lang === 'zh' ? '每筆支出最多附加 5 張發票收據' : 'Maximum 5 receipts per expense');
      return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      setReceiptError(
        lang === 'zh'
          ? `發票上限為 5 張，已為您自動選取前 ${remainingSlots} 張`
          : `Max 5 receipts; selected first ${remainingSlots}`
      );
    }

    setIsCompressingReceipts(true);
    try {
      const compressedList: string[] = [];
      for (const file of filesToProcess) {
        const compressed = await compressImageFile(file);
        const ref = await storeImageAsMediaRef(trip.id, compressed);
        compressedList.push(ref);
      }
      setExpenseDraft((prev) => ({
        ...prev,
        receiptImages: [...prev.receiptImages, ...compressedList].slice(0, 5),
      }));
    } catch (err) {
      console.error('Failed to compress receipt images:', err);
      setReceiptError(err instanceof Error ? err.message : '發票處理失敗，請確認檔案格式與大小（25MB 以內）');
    } finally {
      setIsCompressingReceipts(false);
    }
  };

  const handleRemoveReceiptForDraft = (indexToRemove: number) => {
    const removed = expenseDraft.receiptImages[indexToRemove];
    if (removed && isMediaRef(removed) && !initialEditReceiptsRef.current.includes(removed)) {
      const mid = extractMediaId(removed);
      if (mid) idbDeleteMedia(mid).catch(() => {});
    }
    setExpenseDraft((prev) => ({
      ...prev,
      receiptImages: prev.receiptImages.filter((_, idx) => idx !== indexToRemove),
    }));
    setReceiptError(null);
  };

  const handleDownloadCurrentReceipt = async () => {
    if (!viewingReceiptGallery) return;
    const rawSrc = viewingReceiptGallery.images[viewingReceiptGallery.currentIndex];
    if (!rawSrc) return;
    const resolved = await resolveMediaSrc(rawSrc, {
      tripId: trip.id,
      ownerId: trip.ownerId,
      collabId: trip.collabId,
    });
    if (!resolved) return;
    const a = document.createElement('a');
    a.href = resolved;
    a.download = `receipt-${viewingReceiptGallery.title}-${viewingReceiptGallery.currentIndex + 1}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Add custom category (supports CategoryManageModal callback)
  const handleAddCustomCategory = (categoryNameInput: string) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleAddCustomCategory(categoryNameInput), lang === 'zh' ? '新增自訂類別' : 'Add category')) {
      return;
    }
    const trimmed = (categoryNameInput || '').trim();
    if (!trimmed) return;
    if (DEFAULT_CATEGORIES[trimmed] || customCategories.includes(trimmed)) {
      setExpenseDraft((prev) => ({ ...prev, category: trimmed }));
      return;
    }

    const updated = [...customCategories, trimmed];
    onUpdateTrip({
      ...trip,
      customExpenseCategories: updated,
      updatedAt: Date.now(),
    });

    setExpenseDraft((prev) => ({ ...prev, category: trimmed }));
  };

  // Rename custom category or customize default category display name
  const handleRenameCategory = (oldKey: string, newName: string) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleRenameCategory(oldKey, newName), lang === 'zh' ? '重新命名支出類別' : 'Rename category')) {
      return;
    }
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldKey) {
      return;
    }

    if (DEFAULT_CATEGORIES[oldKey]) {
      const updatedLabels = {
        ...(trip.customCategoryLabels || {}),
        [oldKey]: trimmed,
      };
      onUpdateTrip({
        ...trip,
        customCategoryLabels: updatedLabels,
        updatedAt: Date.now(),
      });
      return;
    }

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

    if (expenseDraft.category === oldKey) {
      setExpenseDraft((prev) => ({ ...prev, category: trimmed }));
    }
  };

  // Delete custom category (migrates existing expenses to 'other' and clears stale filter)
  const handleDeleteCategory = (catKey: string) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleDeleteCategory(catKey), lang === 'zh' ? '刪除自訂類別' : 'Delete category')) {
      return;
    }
    const updatedCats = customCategories.filter((c) => c !== catKey);
    const updatedExpenses = trip.expenses.map((e) =>
      e.category === catKey ? { ...e, category: 'other' } : e
    );
    onUpdateTrip({
      ...trip,
      customExpenseCategories: updatedCats,
      expenses: updatedExpenses,
      updatedAt: Date.now(),
    });

    if (expenseDraft.category === catKey) {
      setExpenseDraft((prev) => ({ ...prev, category: 'food' }));
    }
    if (selectedCategoryFilter === catKey) {
      setSelectedCategoryFilter('all');
    }
    if (chartCategoryDetail === catKey) {
      setChartCategoryDetail(null);
    }
  };

  // Open Modal to Add New Expense
  const handleOpenAddExpense = (overrideDate?: string) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleOpenAddExpense(overrideDate), lang === 'zh' ? '新增支出記帳' : 'Add expense')) {
      return;
    }
    const defaultDate =
      overrideDate ||
      (todayStr >= trip.startDate && todayStr <= trip.endDate ? todayStr : trip.startDate || todayStr);

    setEditingExpenseId(null);
    setReceiptError(null);
    setSaveToast(null);
    initialEditReceiptsRef.current = [];
    setExpenseDraft({
      date: defaultDate,
      amount: '',
      currency: baseCurrency,
      category: 'food',
      paymentMethod: 'cash',
      paidBy: '我',
      splitWith: splitMembersList,
      isPersonal: false,
      tags: [],
      receiptImages: [],
      description: '',
    });
    setEditorFocusTrigger((c) => c + 1);
    setShowAddModal(true);
  };

  // Open Modal to Edit Existing Expense
  const handleOpenEditExpense = (item: ExpenseItem) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleOpenEditExpense(item), lang === 'zh' ? '編輯支出紀錄' : 'Edit expense')) {
      return;
    }
    const imgs = item.receiptImages && item.receiptImages.length > 0
      ? [...item.receiptImages]
      : item.receiptImage
      ? [item.receiptImage]
      : [];
    initialEditReceiptsRef.current = imgs;

    setEditingExpenseId(item.id);
    setReceiptError(null);
    setSaveToast(null);
    setExpenseDraft({
      date: item.date || todayStr,
      amount: item.amount.toString(),
      currency: item.currency || baseCurrency,
      category: item.category || 'food',
      paymentMethod: item.paymentMethod || 'cash',
      paidBy: item.paidBy || '我',
      splitWith: item.splitWith && item.splitWith.length > 0 ? [...item.splitWith] : [...splitMembersList],
      isPersonal: !!item.isPersonal,
      tags: item.tags ? [...item.tags] : [],
      receiptImages: imgs,
      description: formatExpenseDescriptionDraft(item.title, item.notes),
    });
    setEditorFocusTrigger((c) => c + 1);
    setShowAddModal(true);
  };

  // Save Expense Item (New or Edit; supports continueAdding = "再記一筆")
  const handleSaveExpense = (continueAdding: boolean) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleSaveExpense(continueAdding), editingExpenseId ? '編輯支出紀錄' : '新增支出記帳')) {
      return;
    }
    const draftDecimals = CURRENCY_MAP[expenseDraft.currency]?.decimals ?? 0;
    const parsedAmount = evaluateExpenseAmount(expenseDraft.amount, draftDecimals);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    const resolvedCatMeta = getCategoryMeta(expenseDraft.category);
    const { title: finalTitle, notes: finalNotes } = parseExpenseDescription(
      expenseDraft.description,
      resolvedCatMeta.label
    );
    const matchedDay = trip.days.find((d) => d.date === expenseDraft.date);
    const isSplitMode = !trip.isSoloTrip && Boolean(trip.isSplitEnabled);
    const finalTags = expenseDraft.tags.length > 0 ? expenseDraft.tags : undefined;

    if (editingExpenseId) {
      const updatedExpenses = trip.expenses.map((exp) => {
        if (exp.id === editingExpenseId) {
          return {
            ...exp,
            title: finalTitle,
            amount: parsedAmount,
            currency: expenseDraft.currency,
            category: expenseDraft.category,
            paymentMethod: expenseDraft.paymentMethod,
            date: expenseDraft.date,
            dayNumber: matchedDay ? matchedDay.dayNumber : undefined,
            notes: finalNotes,
            tags: finalTags,
            receiptImages: expenseDraft.receiptImages.length > 0 ? expenseDraft.receiptImages : undefined,
            receiptImage: expenseDraft.receiptImages[0] || undefined,
            convertedAmount: convertAmount(parsedAmount, expenseDraft.currency, baseCurrency, trip.customExchangeRates),
            // Preserve existing split metadata untouched if split mode is currently toggled off
            paidBy: isSplitMode ? (expenseDraft.paidBy || splitMembersList[0] || '我') : exp.paidBy,
            splitWith: isSplitMode
              ? (!expenseDraft.isPersonal
                  ? (expenseDraft.splitWith.length > 0 ? expenseDraft.splitWith : splitMembersList)
                  : undefined)
              : exp.splitWith,
            isPersonal: isSplitMode ? expenseDraft.isPersonal : (exp.isPersonal ?? false),
          };
        }
        return exp;
      });

      const updatedTrip: Trip = {
        ...trip,
        expenses: updatedExpenses,
        updatedAt: Date.now(),
      };
      onUpdateTrip(updatedTrip);
      garbageCollectOrphanedMedia(
        getStoredTrips().map((t) => (t.id === updatedTrip.id ? updatedTrip : t))
      ).catch(() => {});
    } else {
      const newExpense: ExpenseItem = {
        id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: finalTitle,
        amount: parsedAmount,
        currency: expenseDraft.currency,
        category: expenseDraft.category,
        paymentMethod: expenseDraft.paymentMethod,
        date: expenseDraft.date,
        dayNumber: matchedDay ? matchedDay.dayNumber : undefined,
        notes: finalNotes,
        tags: finalTags,
        receiptImages: expenseDraft.receiptImages.length > 0 ? expenseDraft.receiptImages : undefined,
        receiptImage: expenseDraft.receiptImages[0] || undefined,
        convertedAmount: convertAmount(parsedAmount, expenseDraft.currency, baseCurrency, trip.customExchangeRates),
        paidBy: isSplitMode ? (expenseDraft.paidBy || splitMembersList[0] || '我') : undefined,
        splitWith: isSplitMode && !expenseDraft.isPersonal
          ? (expenseDraft.splitWith.length > 0 ? expenseDraft.splitWith : splitMembersList)
          : undefined,
        isPersonal: isSplitMode ? expenseDraft.isPersonal : false,
      };

      const updatedTrip: Trip = {
        ...trip,
        expenses: [newExpense, ...trip.expenses],
        updatedAt: Date.now(),
      };
      onUpdateTrip(updatedTrip);
      garbageCollectOrphanedMedia(
        getStoredTrips().map((t) => (t.id === updatedTrip.id ? updatedTrip : t))
      ).catch(() => {});
    }

    if (continueAdding && !editingExpenseId) {
      // Receipts just saved are now committed to trip — keep them untouched in IndexedDB
      initialEditReceiptsRef.current = [];
      setSaveToast(`已儲存「${finalTitle}」(${formatCurrencyAmount(parsedAmount, expenseDraft.currency)})`);
      setExpenseDraft((prev) => ({
        ...prev,
        amount: '',
        description: '',
        tags: [],
        receiptImages: [],
      }));
      setReceiptError(null);
      setEditorFocusTrigger((c) => c + 1);
      if (saveToastTimerRef.current) window.clearTimeout(saveToastTimerRef.current);
      saveToastTimerRef.current = window.setTimeout(() => setSaveToast(null), 2600);
      return;
    }

    // Close modal cleanly
    initialEditReceiptsRef.current = [];
    setEditingExpenseId(null);
    setSaveToast(null);
    setIsEditorSubPickerOpen(false);
    setExpenseDraft((prev) => ({ ...prev, receiptImages: [] }));
    setShowAddModal(false);
  };


  const handleDeleteExpense = (id: string) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleDeleteExpense(id), lang === 'zh' ? '刪除支出紀錄' : 'Delete expense')) {
      return;
    }
    const now = Date.now();
    const deletedItemIds: Record<string, number> = {
      ...(trip.deletedItemIds || {}),
      [id]: now,
    };
    const updatedTrip: Trip = {
      ...trip,
      expenses: trip.expenses.filter((e) => e.id !== id),
      deletedItemIds,
      updatedAt: now,
    };
    onUpdateTrip(updatedTrip);
    garbageCollectOrphanedMedia(
      getStoredTrips().map((t) => (t.id === updatedTrip.id ? updatedTrip : t))
    ).catch(() => {});
  };

  const handleConfirmDeleteCurrentlyEditing = () => {
    if (!editingExpenseId) return;
    handleDeleteExpense(editingExpenseId);
    initialEditReceiptsRef.current = [];
    setShowAddModal(false);
    setEditingExpenseId(null);
  };

  const requestDeleteExpense = (item: ExpenseItem) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => requestDeleteExpense(item), lang === 'zh' ? '刪除支出紀錄' : 'Delete expense')) {
      return;
    }
    setOpenSwipeId(null);
    setPendingDeleteExpense(item);
  };

  const performAddCompanion = () => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(performAddCompanion, lang === 'zh' ? '新增分帳旅伴' : 'Add companion')) {
      return;
    }
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

  // Add a companion to splitting list
  const handleAddCompanion = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    performAddCompanion();
  };

  // Request removing a companion member (confirmed via IosActionSheet)
  const requestRemoveCompanion = (memberToRemove: string) => {
    if (!canEdit) return;
    if (memberToRemove === '我') {
      setSplitNotice(lang === 'zh' ? '「我」為預設成員，無法移除。' : 'Cannot remove primary member "我".');
      if (splitNoticeTimerRef.current) window.clearTimeout(splitNoticeTimerRef.current);
      splitNoticeTimerRef.current = window.setTimeout(() => setSplitNotice(null), 2500);
      return;
    }
    if (requireAuth && !requireAuth(() => requestRemoveCompanion(memberToRemove), lang === 'zh' ? '移除分帳旅伴' : 'Remove companion')) {
      return;
    }
    setPendingRemoveCompanion(memberToRemove);
  };

  const handleConfirmRemoveCompanion = (memberToRemove: string) => {
    const updated = splitMembersList.filter((m) => m !== memberToRemove);
    onUpdateTrip({
      ...trip,
      splitMembers: updated.length > 0 ? updated : ['我'],
      updatedAt: Date.now(),
    });
    setPendingRemoveCompanion(null);
  };

  // Copy formatted split summary for LINE / messages (uses current display baseCurrency & custom rates)
  const handleCopySplitSummary = async () => {
    const text = formatSplitsForSharing(trip, baseCurrency, trip.customExchangeRates);
    const copied = await copyTextToClipboard(text);
    if (copied) {
      setCopiedSplitToast(true);
      if (copiedSplitTimerRef.current) window.clearTimeout(copiedSplitTimerRef.current);
      copiedSplitTimerRef.current = window.setTimeout(() => setCopiedSplitToast(false), 2500);
    }
  };

  // Save exchange rates (validating > 0)
  const handleSaveRates = () => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(handleSaveRates, lang === 'zh' ? '儲存自訂匯率' : 'Save exchange rates')) {
      return;
    }
    const nextRates: Record<string, number> = {};
    for (const cur of SUPPORTED_CURRENCIES) {
      if (cur.code === 'JPY') continue;
      const raw = tempRateInputs[cur.code];
      if (raw !== undefined && raw.trim() !== '') {
        const parsed = parseFloat(raw);
        if (Number.isFinite(parsed) && parsed > 0) {
          nextRates[cur.code] = parsed;
        }
      }
    }
    onUpdateTrip({
      ...trip,
      customExchangeRates: Object.keys(nextRates).length > 0 ? nextRates : undefined,
      updatedAt: Date.now(),
    });
    setShowRateModal(false);
  };

  // Today's expenses count
  const todayExpensesCount = useMemo(() => {
    return trip.expenses.filter((e) => e.date === todayStr).length;
  }, [trip.expenses, todayStr]);

  // Filtered expenses list based on date, category, composable flags & search query
  const filteredExpenses = useMemo(() => {
    return trip.expenses.filter((item) => {
      // Search keyword filter
      if (expenseSearchQuery.trim()) {
        const q = expenseSearchQuery.toLowerCase().trim();
        const titleMatch = (item.title || '').toLowerCase().includes(q);
        const notesMatch = (item.notes || '').toLowerCase().includes(q);
        const catMatch = (item.category || '').toLowerCase().includes(q);
        const catMeta = resolveExpenseCategoryMeta(item.category, trip);
        const catLabelMatch = (catMeta?.label || '').toLowerCase().includes(q);
        const payMethodMatch = (item.paymentMethod || '').toLowerCase().includes(q);
        const payInfo = PAYMENT_LABELS[item.paymentMethod];
        const payLabelMatch = (payInfo?.zh || '').toLowerCase().includes(q);
        const paidByMatch = (item.paidBy || '').toLowerCase().includes(q);
        const tagsMatch = (item.tags || []).some((tg) => tg.toLowerCase().includes(q));
        const amountMatch = String(item.amount).includes(q) || String(item.convertedAmount || '').includes(q);
        if (!titleMatch && !notesMatch && !catMatch && !catLabelMatch && !payMethodMatch && !payLabelMatch && !paidByMatch && !tagsMatch && !amountMatch) {
          return false;
        }
      }

      // Composable flags
      if (cashOnlyFilter && item.paymentMethod !== 'cash') return false;
      if (withReceiptFilter && !((item.receiptImages && item.receiptImages.length > 0) || !!item.receiptImage)) {
        return false;
      }

      // Date filter
      const itemDateStr = (item.date || '').slice(0, 10).replace(/\//g, '-');
      if (selectedDateFilter === 'today') {
        if (itemDateStr !== todayStr) return false;
      } else if (selectedDateFilter === 'pre') {
        const start = (trip.startDate || '').slice(0, 10).replace(/\//g, '-');
        if (!start || itemDateStr >= start) return false;
      } else if (selectedDateFilter === 'cash_only') {
        if (item.paymentMethod !== 'cash') return false;
      } else if (selectedDateFilter !== 'all') {
        const filterDateStr = selectedDateFilter.slice(0, 10).replace(/\//g, '-');
        let matches = itemDateStr === filterDateStr;

        if (!matches) {
          const matchedDay = (trip.days || []).find(
            (d) => (d.date || '').slice(0, 10).replace(/\//g, '-') === filterDateStr
          );
          if (matchedDay) {
            if (item.dayNumber === matchedDay.dayNumber) matches = true;
            if ((item.date || '').slice(0, 10).replace(/\//g, '-') === (matchedDay.date || '').slice(0, 10).replace(/\//g, '-')) matches = true;
          }
        }

        if (!matches && (selectedDateFilter === `D${item.dayNumber}` || selectedDateFilter === String(item.dayNumber))) {
          matches = true;
        }

        if (!matches) return false;
      }

      // Category filter
      if (selectedCategoryFilter === 'all') return true;
      if (selectedCategoryFilter === 'with_receipt') {
        return (item.receiptImages && item.receiptImages.length > 0) || !!item.receiptImage;
      }
      return item.category === selectedCategoryFilter;
    });
  }, [trip.expenses, expenseSearchQuery, selectedDateFilter, selectedCategoryFilter, cashOnlyFilter, withReceiptFilter, todayStr, trip.startDate, trip.days, trip.customCategoryLabels]);

  // Total for currently filtered expenses in base currency
  const filteredTotalInBase = useMemo(() => {
    return roundForBase(filteredExpenses.reduce((sum, item) => sum + getItemConvertedAmount(item), 0));
  }, [filteredExpenses, baseCurrency, trip.customExchangeRates, ratesVersion]);

  // Group filtered expenses by date for Apple Wallet style daily cards
  const groupedDailyExpenses = useMemo(() => {
    const groups: {
      date: string;
      label: string;
      dayNumber?: number;
      totalInBase: number;
      items: ExpenseItem[];
    }[] = [];

    const map = new Map<string, ExpenseItem[]>();
    filteredExpenses.forEach((item) => {
      const d = (item.date || '').slice(0, 10).replace(/\//g, '-') || 'other';
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(item);
    });

    // Sort dates descending (most recent date first)
    const sortedDates = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));

    sortedDates.forEach((d) => {
      const items = map.get(d)!;
      const totalInBase = roundForBase(items.reduce((sum, it) => sum + getItemConvertedAmount(it), 0));

      let label = d;
      let dayNumber: number | undefined;

      if (d === 'other') {
        label = '其他 / 未定日期';
      } else if (trip.startDate && d < trip.startDate.slice(0, 10)) {
        label = `行前準備 (${d.slice(5).replace('-', '/')})`;
      } else {
        const dayIdx = trip.days.findIndex((dp) => (dp.date || '').slice(0, 10) === d);
        if (dayIdx >= 0) {
          dayNumber = dayIdx + 1;
          const weekdayNames = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
          const dateObj = new Date(`${d}T00:00:00`);
          const weekday = !isNaN(dateObj.getTime()) ? weekdayNames[dateObj.getDay()] : '';
          label = `Day ${dayIdx + 1} · ${d.slice(5).replace('-', '/')} ${weekday}`;
        } else {
          const weekdayNames = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
          const dateObj = new Date(`${d}T00:00:00`);
          const weekday = !isNaN(dateObj.getTime()) ? ` ${weekdayNames[dateObj.getDay()]}` : '';
          label = `${d.slice(5).replace('-', '/')}${weekday}`;
        }
      }

      groups.push({
        date: d,
        label,
        dayNumber,
        totalInBase,
        items,
      });
    });

    return groups;
  }, [filteredExpenses, trip.startDate, trip.days, baseCurrency, trip.customExchangeRates, ratesVersion]);

  // Smart exchange rate badge comparing baseCurrency vs TWD (or tripPrimaryCurrency when base is TWD)
  const displayRateSource = baseCurrency;
  const displayRateTarget = baseCurrency === 'TWD'
    ? (tripPrimaryCurrency !== 'TWD' ? tripPrimaryCurrency : 'JPY')
    : 'TWD';
  const getRateToJpy = (code: string) =>
    trip.customExchangeRates?.[code] ??
    liveRatesInfo?.rates?.[code] ??
    CURRENCY_MAP[code]?.defaultRateToJPY ??
    1;
  const displayRateValue = (() => {
    const src = getRateToJpy(displayRateSource);
    const dst = getRateToJpy(displayRateTarget);
    if (!src || !dst) return 1;
    return src / dst;
  })();
  const displayRateFormatted =
    displayRateValue < 0.05
      ? displayRateValue.toFixed(4)
      : displayRateValue < 1
      ? displayRateValue.toFixed(3)
      : displayRateValue.toFixed(2);

  // Quick currency pills: prioritize baseCurrency, tripPrimaryCurrency, TWD, JPY (up to 3 unique)
  const quickCurrencyCodes = useMemo(() => {
    const list = Array.from(new Set([tripPrimaryCurrency, 'TWD', 'JPY', baseCurrency]));
    return list.slice(0, 3).map((code) => CURRENCY_MAP[code]).filter(Boolean);
  }, [tripPrimaryCurrency, baseCurrency]);

  const activeFilterCount =
    (selectedDateFilter !== 'all' ? 1 : 0) +
    (selectedCategoryFilter !== 'all' ? 1 : 0) +
    (cashOnlyFilter ? 1 : 0) +
    (withReceiptFilter ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* 1. 預算資訊與財務總覽卡 */}
      <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E5E2DC]/60 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  {lang === 'zh' ? '旅程支出' : 'Trip Expenses'}
                </h3>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Live Exchange Rate Indicator */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-teal-50/80 dark:bg-teal-950/50 border border-teal-200/80 dark:border-teal-800 text-[11px] font-semibold text-teal-800 dark:text-teal-300 font-mono tabular-nums">
              <span>1 {displayRateSource} ≈ {displayRateFormatted} {displayRateTarget}</span>
              <button
                type="button"
                onClick={handleRefreshLiveRates}
                disabled={isFetchingRates}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-teal-100 dark:hover:bg-teal-900 text-[10px] font-bold text-teal-800 dark:text-teal-300 transition disabled:opacity-50 ml-0.5 cursor-pointer"
                title="更新匯率"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${isFetchingRates ? 'animate-spin' : ''}`} />
                <span className="font-sans">{isFetchingRates ? '更新中' : '更新'}</span>
              </button>
            </div>

            {/* Base Display Currency Selector (Quick Pills + All 13 Currencies Sheet) */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl text-xs font-semibold">
              <span className="text-[10px] text-slate-400 pl-1.5 hidden sm:flex items-center gap-1">
                <ArrowRightLeft className="w-3 h-3" />
                <span>幣別:</span>
              </span>
              {quickCurrencyCodes.map((cur) => (
                <button
                  key={cur.code}
                  type="button"
                  onClick={() => setBaseCurrency(cur.code)}
                  className={`px-2 py-1 rounded-lg text-xs transition cursor-pointer ${
                    baseCurrency === cur.code
                      ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 font-bold shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {cur.flag} {cur.code}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowBaseCurrencySheet(true)}
                className={`px-2 py-1 rounded-lg text-xs transition flex items-center gap-0.5 cursor-pointer ${
                  !quickCurrencyCodes.some((c) => c.code === baseCurrency)
                    ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 font-bold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-white dark:hover:bg-slate-700'
                }`}
                title="切換全部 13 種支援幣別"
                aria-label="更多幣別"
              >
                <span>
                  {!quickCurrencyCodes.some((c) => c.code === baseCurrency)
                    ? `${CURRENCY_MAP[baseCurrency]?.flag || ''} ${baseCurrency}`
                    : '更多'}
                </span>
                <ChevronDown className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setShowRateModal(true)}
                className="px-2 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-white dark:hover:bg-slate-700 transition flex items-center gap-1 cursor-pointer"
                title="自訂匯率"
              >
                <Tag className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                <span>匯率</span>
              </button>
            </div>

            {/* Solo Traveler vs Friends Split Mode Toggle */}
            {!trip.isSoloTrip && canEdit && (
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    onUpdateTrip({ ...trip, isSplitEnabled: false, updatedAt: Date.now() });
                    setExpenseSubTab('records');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
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
                      updatedAt: Date.now(),
                    });
                    setExpenseSubTab('split');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                    trip.isSplitEnabled
                      ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="啟用旅伴共同分帳與自動結算"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{lang === 'zh' ? '朋友分帳' : 'Split'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Unified Hairline-Divided 4-KPI Summary Strip (No cards-within-cards or pill clutter) */}
        <div className="mt-4 rounded-2xl bg-[#FAF9F6] dark:bg-slate-900/50 border border-[#E5E2DC] dark:border-slate-800 grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-[#E5E2DC]/80 dark:divide-slate-800 overflow-hidden">
          {/* Metric 1: Grand Total */}
          <div className="p-3.5 sm:p-4 bg-teal-50/40 dark:bg-teal-950/20 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-[11px] text-teal-900 dark:text-teal-300 font-semibold mb-1">
                <span>{lang === 'zh' ? '累計支出總金額' : 'Total Spent'}</span>
                <span className="font-mono text-teal-700 dark:text-teal-400">
                  {baseCurrency}
                </span>
              </div>
              <div className="font-black font-mono tabular-nums text-lg sm:text-2xl text-teal-950 dark:text-teal-100 tracking-tight truncate">
                {formatCurrencyAmount(totalSpentInBase, baseCurrency)}
              </div>
            </div>
            {baseCurrency !== 'TWD' ? (
              <p className="text-[10px] text-teal-700 dark:text-teal-400 mt-1 font-mono tabular-nums truncate">
                ≈ {formatCurrencyAmount(convertAmount(totalSpentInBase, baseCurrency, 'TWD', trip.customExchangeRates), 'TWD')}
              </p>
            ) : (
              <p className="text-[10px] text-teal-700 dark:text-teal-400 mt-1 font-mono tabular-nums truncate">
                ≈ {formatCurrencyAmount(convertAmount(totalSpentInBase, 'TWD', 'JPY', trip.customExchangeRates), 'JPY')}
              </p>
            )}
          </div>

          {/* Metric 2: Budget Progress (accurately converted from tripPrimaryCurrency -> baseCurrency) */}
          <div className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-300 font-semibold mb-1">
                <span className="flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                  <span>預算執行率</span>
                </span>
                {budgetInBase > 0 && (
                  <span className={`font-mono tabular-nums font-bold ${
                    totalSpentInBase > budgetInBase
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-teal-700 dark:text-teal-400'
                  }`}>
                    {Math.round((totalSpentInBase / budgetInBase) * 100)}%
                  </span>
                )}
              </div>
              <div className="font-black font-mono tabular-nums text-lg sm:text-2xl text-slate-900 dark:text-white tracking-tight truncate">
                {budgetInBase > 0 ? (
                  formatCurrencyAmount(budgetInBase, baseCurrency)
                ) : (
                  <span className="text-sm font-bold text-slate-400">尚未設定總預算</span>
                )}
              </div>
            </div>
            {budgetInBase > 0 ? (
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <span>剩餘 {formatCurrencyAmount(Math.max(0, roundForBase(budgetInBase - totalSpentInBase)), baseCurrency)}</span>
                  <span>{totalSpentInBase > budgetInBase ? '已超支' : '可支配'}</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#E5E2DC] dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full transition-all ${totalSpentInBase > budgetInBase ? 'bg-rose-500' : 'bg-teal-600'}`}
                    style={{ width: `${Math.min(100, (totalSpentInBase / budgetInBase) * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-400 mt-1">
                可在編輯旅程資訊中設定預算
              </p>
            )}
          </div>

          {/* Metric 3: Today's Expense (Clickable filter) */}
          <button
            type="button"
            onClick={() => {
              setExpenseSubTab('records');
              setSelectedDateFilter((prev) => (prev === 'today' ? 'all' : 'today'));
            }}
            className={`p-3.5 sm:p-4 text-left transition flex flex-col justify-between cursor-pointer ${
              selectedDateFilter === 'today' && expenseSubTab === 'records'
                ? 'bg-teal-50/75 dark:bg-teal-950/45'
                : 'hover:bg-[#F3F1EC]/70 dark:hover:bg-slate-800/60'
            }`}
            title="點擊只檢視當日支出明細"
          >
            <div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600 dark:text-slate-300 font-semibold">
                  {lang === 'zh' ? '今日消費' : 'Today'}
                </span>
                <span className={`font-bold ${
                  selectedDateFilter === 'today' && expenseSubTab === 'records'
                    ? 'text-teal-700 dark:text-teal-400'
                    : 'text-slate-400'
                }`}>
                  {selectedDateFilter === 'today' && expenseSubTab === 'records' ? '篩選中' : '檢視 ›'}
                </span>
              </div>
              <div className="font-black font-mono tabular-nums text-lg sm:text-2xl text-teal-800 dark:text-teal-300 mt-1 truncate">
                {formatCurrencyAmount(todaySpentInBase, baseCurrency)}
              </div>
            </div>
            <span className="text-[10px] text-slate-400 font-mono tabular-nums block mt-1">
              {formatDateSlash(todayStr)} · {todayExpensesCount} 筆
            </span>
          </button>

          {/* Metric 4: Cash on Hand */}
          <button
            type="button"
            onClick={() => {
              setCashInputAmt(hasInitialCash ? String(initialCashAmt) : '');
              setCashInputCur(initialCashCur);
              setShowCashCurrencyPicker(false);
              setShowCashModal(true);
            }}
            className="p-3.5 sm:p-4 text-left cursor-pointer hover:bg-[#F3F1EC]/70 dark:hover:bg-slate-800/60 transition flex flex-col justify-between group"
            title="點擊設定或修改手頭初始現金"
          >
            <div>
              <div className="flex items-center justify-between text-[11px] text-emerald-800 dark:text-emerald-300 font-semibold mb-1">
                <span className="flex items-center gap-1">
                  <Wallet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>手頭現金餘額</span>
                </span>
                <span className="text-emerald-700 dark:text-emerald-400 group-hover:underline flex items-center gap-0.5">
                  <Pencil className="w-2.5 h-2.5" />
                  <span>{hasInitialCash ? '修改' : '設定'}</span>
                </span>
              </div>
              <div className={`font-black font-mono tabular-nums text-lg sm:text-2xl tracking-tight truncate ${
                hasInitialCash && remainingCash < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-950 dark:text-emerald-100'
              }`}>
                {hasInitialCash
                  ? formatCurrencyAmount(remainingCash, initialCashCur)
                  : <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">+ 輸入初始現金</span>}
              </div>
            </div>

            {hasInitialCash ? (
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center justify-between gap-1 text-[10px] text-emerald-800 dark:text-emerald-300 font-mono tabular-nums">
                  <span className="truncate">初始 {formatCurrencyAmount(initialCashAmt, initialCashCur)}</span>
                  <span className="truncate">已付 {formatCurrencyAmount(totalCashSpent, initialCashCur)}</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950 overflow-hidden">
                  <div
                    className={`h-full transition-all ${remainingCash < 0 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${cashSpentPercent}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
                掌控錢包剩餘鈔票與硬幣
              </p>
            )}
          </button>
        </div>


        {/* Navigation Segmented Control for Expenses: 明細 / 統計 / 分帳 */}
        <div className="pt-4 border-t border-[#E5E2DC]/80 dark:border-slate-800 mt-4">
          <div
            className={`grid ${
              !trip.isSoloTrip && trip.isSplitEnabled ? 'grid-cols-3' : 'grid-cols-2'
            } p-1 rounded-xl bg-[#EFECE5] dark:bg-slate-800/90 gap-1`}
          >
            <button
              type="button"
              onClick={() => setExpenseSubTab('records')}
              className={`min-h-[38px] sm:min-h-[34px] px-2.5 rounded-lg text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
                effectiveSubTab === 'records'
                  ? 'bg-white dark:bg-[#111827] text-teal-800 dark:text-teal-300 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-semibold'
              }`}
            >
              <Receipt className="w-3.5 h-3.5 shrink-0" />
              <span>{lang === 'zh' ? '明細' : 'Records'}</span>
            </button>
            <button
              type="button"
              onClick={() => setExpenseSubTab('stats')}
              className={`min-h-[38px] sm:min-h-[34px] px-2.5 rounded-lg text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
                effectiveSubTab === 'stats'
                  ? 'bg-white dark:bg-[#111827] text-teal-800 dark:text-teal-300 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-semibold'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 shrink-0" />
              <span>{lang === 'zh' ? '統計' : 'Stats'}</span>
            </button>
            {!trip.isSoloTrip && trip.isSplitEnabled && (
              <button
                type="button"
                onClick={() => setExpenseSubTab('split')}
                className={`min-h-[38px] sm:min-h-[34px] px-2.5 rounded-lg text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  effectiveSubTab === 'split'
                    ? 'bg-white dark:bg-[#111827] text-teal-800 dark:text-teal-300 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-semibold'
                }`}
              >
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>{lang === 'zh' ? `分帳 (${splitMembersList.length})` : `Split (${splitMembersList.length})`}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ================= SECTION A: FRIEND BILL SPLITTING & SETTLEMENT VIEW ================= */}
      {effectiveSubTab === 'split' && !trip.isSoloTrip && trip.isSplitEnabled && splitsResult && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Member Management Box */}
          <div className="bg-white dark:bg-[#111827] rounded-3xl p-4 sm:p-5 border border-[#E5E2DC] dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                  <span>同行分帳夥伴</span>
                </h4>
              </div>

              {canEdit && !showAddCompanionInput && (
                <button
                  type="button"
                  onClick={() => setShowAddCompanionInput(true)}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 text-teal-800 dark:text-teal-300 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>新增旅伴</span>
                </button>
              )}
            </div>

            {splitNotice && (
              <div className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 font-medium">
                {splitNotice}
              </div>
            )}

            {/* Add Companion Form */}
            {canEdit && showAddCompanionInput && (
              <form onSubmit={handleAddCompanion} className="flex items-center gap-2 p-2 bg-[#FAF9F6] dark:bg-slate-800/60 rounded-2xl border border-[#E5E2DC] dark:border-slate-700">
                <input
                  type="text"
                  value={newCompanionName}
                  onChange={(e) => setNewCompanionName(e.target.value)}
                  placeholder="輸入旅伴名字..."
                  className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold outline-none"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  加入
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddCompanionInput(false)}
                  className="px-2.5 py-1.5 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
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
                  className="px-3 py-1.5 rounded-2xl bg-[#FAF9F6] dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2"
                >
                  <User className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                  <span>{m}</span>
                  {m === '我' ? (
                    <span className="text-[10px] text-teal-700 dark:text-teal-400 font-normal">主帳號</span>
                  ) : canEdit ? (
                    <button
                      type="button"
                      onClick={() => requestRemoveCompanion(m)}
                      className="p-1 rounded-full hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                      title="移除此旅伴"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* Member Balance Breakdown Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {splitsResult.members.map((m) => {
              const summary = splitsResult.summaries[m];
              const net = roundForBase(summary.netBalance);
              const isCreditor = summary.netBalance > 0.005;
              const isDebtor = summary.netBalance < -0.005;

              return (
                <div
                  key={m}
                  className="rounded-2xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 shadow-2xs divide-y divide-[#E5E2DC]/75 dark:divide-slate-800 overflow-hidden"
                >
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold flex items-center justify-center text-xs">
                        {m.slice(0, 1)}
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white text-sm">
                        {m}
                      </span>
                    </div>

                    <span
                      className={`text-xs font-bold font-mono tabular-nums ${
                        isCreditor
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : isDebtor
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {isCreditor && `應收回 +${formatCurrencyAmount(net, baseCurrency)}`}
                      {isDebtor && `應補付 -${formatCurrencyAmount(-net, baseCurrency)}`}
                      {!isCreditor && !isDebtor && '已平衡'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-[#E5E2DC]/75 dark:divide-slate-800 text-xs">
                    <div className="px-4 py-2.5">
                      <span className="text-[10px] text-slate-400 block font-medium">公費代墊</span>
                      <span className="font-bold font-mono tabular-nums text-slate-800 dark:text-slate-100 text-sm mt-0.5 block truncate">
                        {formatCurrencyAmount(roundForBase(summary.groupPaid ?? summary.totalPaid), baseCurrency)}
                      </span>
                    </div>

                    <div className="px-4 py-2.5">
                      <span className="text-[10px] text-slate-400 block font-medium">公費應攤</span>
                      <span className="font-bold font-mono tabular-nums text-slate-800 dark:text-slate-100 text-sm mt-0.5 block truncate">
                        {formatCurrencyAmount(roundForBase(summary.totalShare), baseCurrency)}
                      </span>
                    </div>
                  </div>

                  {summary.personalExpense > 0 && (
                    <div className="px-4 py-2.5 flex items-center justify-between text-[11px] text-slate-400 bg-[#FAF9F6]/60 dark:bg-slate-900/30">
                      <span className="flex items-center gap-1">
                        <ShoppingBag className="w-3 h-3 text-slate-500" />
                        <span>個人自費總計</span>
                      </span>
                      <span className="font-mono tabular-nums font-bold text-slate-600 dark:text-slate-300">
                        {formatCurrencyAmount(roundForBase(summary.personalExpense), baseCurrency)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Settlement Recommendation Card */}
          <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
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
                className="min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition active:scale-95 shrink-0 cursor-pointer"
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

            {/* Transfers List with Settled Checkboxes */}
            {splitsResult.transfers.length === 0 ? (
              <div className="py-6 px-4 rounded-2xl bg-[#FAF9F6] dark:bg-slate-800/50 border border-[#E5E2DC]/80 dark:border-slate-800 text-center space-y-1">
                <Sparkles className="w-6 h-6 mx-auto text-teal-600 dark:text-teal-400 mb-1" />
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  太棒了！大家的代墊與消費完全打平，目前無須轉帳！
                </p>
                <p className="text-xs text-slate-400">
                  所有公費支出皆已平衡
                </p>
              </div>
            ) : (() => {
              const settledCount = splitsResult.transfers.filter((tr) =>
                Boolean(trip.settledTransfers?.[getTransferSettlementKey(tr.from, tr.to, tr.amount)]?.settled)
              ).length;
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] px-1">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">
                      點擊左側圓圈可標記已完成轉帳
                    </span>
                    <span
                      className={`font-mono tabular-nums font-bold ${
                        settledCount === splitsResult.transfers.length
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-teal-700 dark:text-teal-400'
                      }`}
                    >
                      已結清 {settledCount} / {splitsResult.transfers.length} 筆
                    </span>
                  </div>
                  <div className="rounded-2xl bg-[#FAF9F6] dark:bg-slate-900/40 border border-[#E5E2DC] dark:border-slate-800 divide-y divide-[#E5E2DC]/75 dark:divide-slate-800 overflow-hidden">
                    {splitsResult.transfers.map((tr, idx) => {
                      const settleKey = getTransferSettlementKey(tr.from, tr.to, tr.amount);
                      const isSettled = Boolean(trip.settledTransfers?.[settleKey]?.settled);
                      return (
                        <div
                          key={settleKey || idx}
                          className={`px-3.5 sm:px-4 py-3 flex items-center justify-between gap-3 transition ${
                            isSettled ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => handleToggleTransferSettled(tr.from, tr.to, tr.amount)}
                              className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition cursor-pointer disabled:opacity-50 ${
                                isSettled
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-teal-600'
                              }`}
                              title={isSettled ? '取消已還清標記' : '標記為已還清'}
                              aria-label={isSettled ? '取消已還清標記' : '標記為已還清'}
                            >
                              {isSettled && <Check className="w-4 h-4 stroke-[2.8]" />}
                            </button>
                            <div className="min-w-0">
                              <div
                                className={`flex items-center gap-1.5 text-xs font-bold flex-wrap ${
                                  isSettled ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'
                                }`}
                              >
                                <span className={isSettled ? '' : 'text-rose-600 dark:text-rose-400'}>{tr.from}</span>
                                <span className="text-slate-400 font-normal">➜ 應付給</span>
                                <span className={isSettled ? '' : 'text-emerald-700 dark:text-emerald-400'}>{tr.to}</span>
                              </div>
                              {isSettled && (
                                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                                  已還清結案
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`font-black font-mono tabular-nums text-base ${
                                isSettled
                                  ? 'line-through text-slate-400 dark:text-slate-500'
                                  : 'text-teal-700 dark:text-teal-300'
                              }`}
                            >
                              {formatCurrencyAmount(tr.amount, baseCurrency)}
                            </span>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => handleToggleTransferSettled(tr.from, tr.to, tr.amount)}
                                className={`hidden sm:inline-flex min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                                  isSettled
                                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                    : 'bg-white dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-teal-600'
                                }`}
                              >
                                {isSettled ? '已結清' : '標記已還'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ================= SECTION B: CHARTS & EXPENSES LIST ================= */}
      {effectiveSubTab !== 'split' && (
        <>
          {/* 2. Unified Stats Section (Charts + Daily Summary Table combined) */}
          {effectiveSubTab === 'stats' && (
      <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-4 sm:p-6 shadow-xs">
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
            <p>{lang === 'zh' ? '目前尚無花費記錄，點擊右下角 ＋ 新增支出與發票' : 'No expenses recorded yet. Tap + at bottom-right to add.'}</p>
          </div>
        ) : chartView === 'daily' ? (
          /* Daily Spending Bar Chart */
          <div className="space-y-4">
            <div className="w-full h-56 sm:h-64 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                  <XAxis
                    dataKey="label"
                    interval="preserveStartEnd"
                    minTickGap={16}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1', opacity: 0.3 }}
                  />
                  <YAxis
                    width={42}
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
                    isAnimationActive={false}
                    onClick={(entry: any) => {
                      if (entry && entry.date) {
                        setChartDateDetail((prev) => (prev === entry.date ? null : entry.date));
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
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
                {dailyChartData.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setChartDateDetail((prev) => (prev === d.date ? null : d.date))}
                    className={`px-2.5 py-1.5 rounded-xl border shrink-0 text-center transition cursor-pointer select-none ${
                      chartDateDetail === d.date
                        ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500 ring-2 ring-teal-500/20'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-800 hover:border-teal-400'
                    }`}
                    title="點擊查看此日明細"
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
          /* Category Pie Chart (High-DPI interactive SVG Donut) */
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-6 flex flex-col items-center justify-center w-full">
              <CategoryDonutChart
                data={pieChartData}
                totalValue={totalSpentInBase}
                baseCurrency={baseCurrency}
                selectedKey={chartCategoryDetail}
                onSelectKey={(key) =>
                  setChartCategoryDetail((prev) => (prev === key ? null : key))
                }
                totalLabel={lang === 'zh' ? '總支出' : 'Total'}
              />
            </div>

            <div className="md:col-span-6 space-y-2">
              <div className="text-[11px] text-slate-400 font-bold mb-1 flex items-center justify-between">
                <span>點擊類別即時篩選下方明細：</span>
                {chartCategoryDetail && (
                  <button
                    type="button"
                    onClick={() => setChartCategoryDetail(null)}
                    className="text-teal-600 dark:text-teal-400 hover:underline"
                  >
                    重設全部
                  </button>
                )}
              </div>
              {pieChartData.map((item) => (
                <div
                  key={item.key}
                  onClick={() => setChartCategoryDetail((prev) => (prev === item.key ? null : item.key))}
                  className={`p-2.5 rounded-2xl border flex items-center justify-between text-xs cursor-pointer transition select-none ${
                    chartCategoryDetail === item.key
                      ? 'bg-teal-50/90 dark:bg-teal-950/70 border-teal-500 ring-2 ring-teal-500/25 shadow-2xs'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/90'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <item.Icon className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                      <span>{item.name}</span>
                    </span>
                    {chartCategoryDetail === item.key && (
                      <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400">
                        ✓ 已選取
                      </span>
                    )}
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

        {/* Interactive Detail Breakdown Section (Summary + Detail on same screen) */}
        {trip.expenses.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>
                    {chartView === 'category'
                      ? (chartCategoryDetail ? `【${getCategoryMeta(chartCategoryDetail).label || chartCategoryDetail}】花費明細` : '全部類別花費明細')
                      : (chartDateDetail ? `【${formatDateSlash(chartDateDetail)}】花費明細` : '全部日期花費明細')}
                  </span>
                  <span className="text-[11px] font-mono text-teal-600 dark:text-teal-400 font-semibold">
                    ({chartFilteredExpenses.length} 筆)
                  </span>
                </h4>
                {(chartCategoryDetail || chartDateDetail) && (
                  <button
                    type="button"
                    onClick={() => {
                      setChartCategoryDetail(null);
                      setChartDateDetail(null);
                    }}
                    className="text-[10px] font-bold text-teal-600 dark:text-teal-400 hover:underline px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/60"
                  >
                    清除篩選 · 檢視全部
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200">
                  小計: {formatCurrencyAmount(chartFilteredTotal, baseCurrency)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (chartCategoryDetail) setSelectedCategoryFilter(chartCategoryDetail);
                    if (chartDateDetail) setSelectedDateFilter(chartDateDetail);
                    setExpenseSubTab('records');
                  }}
                  className="text-[11px] font-bold text-teal-600 dark:text-teal-400 hover:underline"
                >
                  在明細頁管理 ➜
                </button>
              </div>
            </div>

            {/* Transactions List */}
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {chartFilteredExpenses.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">查無符合條件的支出記錄</p>
              ) : (
                chartFilteredExpenses.map((exp) => {
                  const catMeta = getCategoryMeta(exp.category);
                  return (
                    <div
                      key={exp.id}
                      onClick={() => canEdit && handleOpenEditExpense(exp)}
                      className={`p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 text-xs transition ${
                        canEdit
                          ? 'cursor-pointer hover:border-teal-600/50 hover:bg-teal-50/40 dark:hover:bg-slate-800 active:scale-[0.99] group'
                          : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="p-1.5 rounded-lg bg-slate-200/60 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 shrink-0">
                          <catMeta.Icon className="w-3.5 h-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 dark:text-white truncate group-hover:text-teal-700 dark:group-hover:text-teal-300 transition">
                            {exp.title}
                          </p>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 font-mono">
                            <span>{formatDateSlash(exp.date)}</span>
                            <span>·</span>
                            <span>{PAYMENT_LABELS[exp.paymentMethod || 'cash']?.zh || '現金'}</span>
                            {exp.paidBy && (
                              <>
                                <span>·</span>
                                <span>由 {exp.paidBy} 付款</span>
                              </>
                            )}
                            {exp.receiptImages && exp.receiptImages.length > 0 && (
                              <span className="text-teal-600 dark:text-teal-400 font-bold flex items-center gap-0.5">
                                · <Receipt className="w-3 h-3 inline" /> 附發票
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <p className="font-black font-mono tabular-nums text-sm text-slate-900 dark:text-white">
                            {formatCurrencyAmount(exp.amount, exp.currency)}
                          </p>
                          {exp.currency !== baseCurrency && (
                            <p className="text-[10px] font-mono tabular-nums text-teal-600 dark:text-teal-400">
                              ≈ {formatCurrencyAmount(getItemConvertedAmount(exp), baseCurrency)}
                            </p>
                          )}
                        </div>
                        {canEdit && (
                          <span
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 group-hover:text-teal-700 dark:group-hover:text-teal-300 group-hover:bg-teal-50 dark:group-hover:bg-teal-950/40 transition shrink-0"
                            aria-hidden="true"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
          )}

          {/* 2.5 Daily Expense Table Section (shown right beneath Charts inside unified Stats tab) */}
          {effectiveSubTab === 'stats' && (
            <div className="bg-white dark:bg-[#111827] rounded-3xl p-4 sm:p-6 border border-[#E5E2DC] dark:border-slate-800 shadow-xs space-y-4 animate-in fade-in duration-150">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm sm:text-base flex items-center gap-2">
                    <TableProperties className="w-4 h-4 text-teal-600" />
                    <span>{lang === 'zh' ? '每日支出統計表' : 'Daily Expenses Table'}</span>
                  </h4>
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
                </div>
              </div>

              {/* Table Container */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 font-bold select-none">
                      <th className="py-3 px-3.5 whitespace-nowrap">日期 / 行程天數</th>
                      <th className="py-3 px-3 text-center whitespace-nowrap">筆數</th>
                      <th className="py-3 px-3.5 text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 justify-end">
                          <Coins className="w-3.5 h-3.5 text-amber-500" />
                          <span>現金支出</span>
                        </span>
                      </th>
                      <th className="py-3 px-3.5 text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 justify-end">
                          <CreditCard className="w-3.5 h-3.5 text-blue-500" />
                          <span>信用卡/電子</span>
                        </span>
                      </th>
                      <th className="py-3 px-3.5 text-right whitespace-nowrap">當日總計 ({baseCurrency})</th>
                      <th className="py-3 px-3.5 text-center whitespace-nowrap">明細操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                    {dailyTableData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                          目前尚無支出記錄，點擊右下角 ＋ 即可新增
                        </td>
                      </tr>
                    ) : (
                      dailyTableData.map((row) => {
                        const isExpanded = expandedTableDate === row.date;
                        const isToday = row.date === todayStr;
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
                                        此日期尚無任何消費記錄，點擊右下角 ＋ 即可新增！
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
                                              onClick={() => canEdit && handleOpenEditExpense(item)}
                                              className={`p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex items-start justify-between gap-2.5 shadow-2xs transition ${
                                                canEdit ? 'cursor-pointer hover:border-teal-500/60 dark:hover:border-teal-600/60' : ''
                                              }`}
                                            >
                                              <div className="flex items-start gap-2.5 min-w-0">
                                                <div className={`w-8 h-8 rounded-xl ${catMeta.bg} flex items-center justify-center text-sm shrink-0`}>
                                                  <catMeta.Icon className="w-4 h-4" />
                                                </div>

                                                <div className="min-w-0">
                                                  <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-bold text-slate-900 dark:text-white text-xs truncate">
                                                      {item.title}
                                                    </span>
                                                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400 font-semibold flex items-center gap-1">
                                                      {PAYMENT_LABELS[item.paymentMethod]?.Icon ? (
                                                        React.createElement(PAYMENT_LABELS[item.paymentMethod].Icon, { className: 'w-3 h-3' })
                                                      ) : (
                                                        <Coins className="w-3 h-3" />
                                                      )}
                                                      <span>{PAYMENT_LABELS[item.paymentMethod]?.[lang] || item.paymentMethod}</span>
                                                    </span>
                                                    <span className="text-[10px] text-slate-400">
                                                      {catMeta.label}
                                                    </span>
                                                    {item.tags && item.tags.length > 0 && (
                                                      <span className="text-[10px] text-teal-700 dark:text-teal-300 font-medium">
                                                        {item.tags.map((tg) => `#${tg}`).join(' ')}
                                                      </span>
                                                    )}
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
                                                          <MediaImage tripId={trip.id} ownerId={trip.ownerId} collabId={trip.collabId} src={img} alt="發票" className="w-full h-full object-cover" />
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

                                                  {canEdit && (
                                                    <div className="flex items-center gap-1.5 mt-1.5">
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          handleOpenEditExpense(item);
                                                        }}
                                                        className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-slate-800 flex items-center gap-1 border border-slate-200 dark:border-slate-700 cursor-pointer"
                                                        title="編輯此筆"
                                                      >
                                                        <Pencil className="w-3 h-3" />
                                                        <span>編輯</span>
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          requestDeleteExpense(item);
                                                        }}
                                                        className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 flex items-center gap-1 border border-slate-200 dark:border-slate-700 cursor-pointer"
                                                        title="刪除此筆"
                                                      >
                                                        <Trash2 className="w-3 h-3" />
                                                        <span>刪除</span>
                                                      </button>
                                                    </div>
                                                  )}
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

          {/* ================= SECTION B: LAYERED CARDS (PIE CHART + RECENT TRANSACTIONS) ================= */}
          {effectiveSubTab === 'records' && (
            <>
              {/* Card 2: 支出圓餅圖與類別佔比卡 */}
              <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-4 animate-in fade-in duration-150">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
                      <PieChartIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                        {lang === 'zh' ? '支出圓餅圖與類別佔比' : 'Spending Breakdown by Category'}
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        {lang === 'zh' ? '點擊扇形或標籤可直接篩選下方交易明細' : 'Tap any category slice to filter transactions below'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    {selectedCategoryFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategoryFilter('all');
                          setChartCategoryDetail(null);
                        }}
                        className="px-2.5 py-1 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 text-xs font-bold hover:underline transition"
                      >
                        重設全部類別
                      </button>
                    )}
                    <span className="text-[11px] font-mono text-slate-400 font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                      {baseCurrency} 計價
                    </span>
                  </div>
                </div>

                {pieChartData.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs space-y-2">
                    <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                      <PieChartIcon className="w-6 h-6 stroke-1 text-slate-300 dark:text-slate-600" />
                    </div>
                    <p>{lang === 'zh' ? '目前尚無花費記錄，點擊右下角 ＋ 即可快速記一筆' : 'No expenses yet. Tap + at bottom-right to add one.'}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                    {/* High-DPI Interactive SVG Donut Chart */}
                    <div className="md:col-span-5 flex flex-col items-center justify-center w-full">
                      <CategoryDonutChart
                        data={pieChartData}
                        totalValue={totalSpentInBase}
                        baseCurrency={baseCurrency}
                        selectedKey={selectedCategoryFilter !== 'all' ? selectedCategoryFilter : null}
                        onSelectKey={(key) => {
                          const nextKey = selectedCategoryFilter === key ? 'all' : key;
                          setSelectedCategoryFilter(nextKey);
                          setChartCategoryDetail(nextKey === 'all' ? null : nextKey);
                        }}
                        totalLabel={lang === 'zh' ? '總支出' : 'Total'}
                      />
                    </div>

                    {/* Category List Breakdown */}
                    <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {pieChartData.map((item) => {
                        const isSelected = selectedCategoryFilter === item.key;
                        return (
                          <div
                            key={item.key}
                            onClick={() => {
                              const nextKey = isSelected ? 'all' : item.key;
                              setSelectedCategoryFilter(nextKey);
                              setChartCategoryDetail(nextKey === 'all' ? null : nextKey);
                            }}
                            className={`p-2.5 rounded-2xl border flex items-center justify-between text-xs cursor-pointer transition select-none ${
                              isSelected
                                ? 'bg-teal-50/90 dark:bg-teal-950/70 border-teal-500 ring-2 ring-teal-500/25 shadow-2xs'
                                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/90'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                                <item.Icon className="w-3 h-3 shrink-0 text-slate-500" />
                                <span>{item.name}</span>
                              </span>
                              {isSelected && (
                                <span className="text-[9px] font-bold text-teal-600 dark:text-teal-400 shrink-0">
                                  ✓ 已選
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 font-mono shrink-0 pl-1">
                              <span className="text-[10px] font-bold text-slate-400">
                                {item.percentage}%
                              </span>
                              <span className="font-black text-slate-900 dark:text-white text-xs">
                                {formatCurrencyAmount(item.value, baseCurrency)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Card 3: 近期交易明細記錄卡 */}
              <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm tabular-nums">
              {lang === 'zh' ? '支出明細記錄' : 'Expense Records'} ({filteredExpenses.length})
            </h4>
            {totalReceiptsCount > 0 && (
              <span className="text-teal-700 dark:text-teal-400 font-semibold text-[11px] font-mono tabular-nums flex items-center gap-1">
                <span>·</span>
                <Receipt className="w-3 h-3" />
                <span>{totalReceiptsCount} 張發票</span>
              </span>
            )}
          </div>
        </div>

        {/* Collapsible Month Calendar Date Switcher */}
        <ExpenseCalendarBar
          trip={trip}
          baseCurrency={baseCurrency}
          selectedDateFilter={selectedDateFilter}
          onSelectDateFilter={setSelectedDateFilter}
          todayStr={todayStr}
          lang={lang}
          hasPreTripExpenses={trip.expenses.some((e) => trip.startDate && e.date < trip.startDate)}
          ratesVersion={ratesVersion}
        />

        {/* Compact Search & Filter Action Bar */}
        <div className="flex items-center gap-2">
          {/* Instant Search Bar */}
          <div className="relative flex-1">
            <div className="flex items-center gap-2 px-3 min-h-[44px] sm:min-h-[40px] rounded-xl bg-[#FAF9F6] dark:bg-slate-800/60 border border-[#E5E2DC] dark:border-slate-700/80 focus-within:ring-2 focus-within:ring-teal-500/40 focus-within:border-teal-600 transition">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={expenseSearchQuery}
                onChange={(e) => setExpenseSearchQuery(e.target.value)}
                placeholder={lang === 'zh' ? '搜尋品名、標籤、付款方式、備註或金額...' : 'Search expenses...'}
                className="w-full bg-transparent text-[16px] sm:text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden"
              />
              {expenseSearchQuery && (
                <button
                  type="button"
                  onClick={() => setExpenseSearchQuery('')}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition shrink-0"
                  aria-label="清除搜尋"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Filter Drawer Trigger Button */}
          <button
            type="button"
            onClick={() => setShowFilterDrawer(true)}
            className={`min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 border shadow-2xs active:scale-95 cursor-pointer ${
              activeFilterCount > 0
                ? 'bg-teal-700 text-white border-teal-700 shadow-teal-600/20'
                : 'bg-white dark:bg-slate-800 border-[#E5E2DC] dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-[#FAF9F6] dark:hover:bg-slate-700'
            }`}
            title="開啟篩選抽屜"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{lang === 'zh' ? '篩選' : 'Filter'}</span>
            {activeFilterCount > 0 && (
              <span className="font-mono tabular-nums font-black">
                ({activeFilterCount})
              </span>
            )}
          </button>
        </div>

        {/* Quiet Active Filter Ribbon (僅在有條件時顯示，完全不佔用多餘版面) */}
        {(activeFilterCount > 0 || expenseSearchQuery.trim()) && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/50 dark:border-teal-900/40 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="text-[11px] font-medium text-slate-400 shrink-0">
                {lang === 'zh' ? '已套用：' : 'Active: '}
              </span>

              {/* Date active chip */}
              {selectedDateFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-teal-200/80 dark:border-teal-800 text-[11px] font-semibold text-teal-800 dark:text-teal-200">
                  <span>
                    {selectedDateFilter === 'today'
                      ? `今日 (${todayStr.slice(5).replace('-', '/')})`
                      : selectedDateFilter === 'pre'
                      ? '行前準備'
                      : selectedDateFilter === 'cash_only'
                      ? '僅看現金'
                      : (() => {
                          const matchedDay = trip.days.find((d) => d.date === selectedDateFilter);
                          const dateLabel = selectedDateFilter.slice(5).replace('-', '/');
                          return matchedDay ? `Day ${matchedDay.dayNumber} (${dateLabel})` : dateLabel;
                        })()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedDateFilter('all')}
                    className="hover:text-rose-500 transition p-0.5 cursor-pointer"
                    aria-label="移除日期篩選"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {/* Category active chip */}
              {selectedCategoryFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-teal-200/80 dark:border-teal-800 text-[11px] font-semibold text-teal-800 dark:text-teal-200">
                  <span>
                    {selectedCategoryFilter === 'with_receipt'
                      ? '附發票'
                      : (getCategoryMeta(selectedCategoryFilter).label || selectedCategoryFilter)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategoryFilter('all');
                      setChartCategoryDetail(null);
                    }}
                    className="hover:text-rose-500 transition p-0.5 cursor-pointer"
                    aria-label="移除類別篩選"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {/* Cash Only composable chip */}
              {cashOnlyFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-teal-200/80 dark:border-teal-800 text-[11px] font-semibold text-teal-800 dark:text-teal-200">
                  <span>僅看現金</span>
                  <button
                    type="button"
                    onClick={() => setCashOnlyFilter(false)}
                    className="hover:text-rose-500 transition p-0.5 cursor-pointer"
                    aria-label="移除僅看現金篩選"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {/* With Receipt composable chip */}
              {withReceiptFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-teal-200/80 dark:border-teal-800 text-[11px] font-semibold text-teal-800 dark:text-teal-200">
                  <span>附發票憑證</span>
                  <button
                    type="button"
                    onClick={() => setWithReceiptFilter(false)}
                    className="hover:text-rose-500 transition p-0.5 cursor-pointer"
                    aria-label="移除附發票篩選"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {/* Search query chip */}
              {expenseSearchQuery.trim() && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-teal-200/80 dark:border-teal-800 text-[11px] font-semibold text-teal-800 dark:text-teal-200">
                  <span>搜尋「{expenseSearchQuery}」</span>
                  <button
                    type="button"
                    onClick={() => setExpenseSearchQuery('')}
                    className="hover:text-rose-500 transition p-0.5 cursor-pointer"
                    aria-label="移除搜尋關鍵字"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              <span className="text-[10px] text-slate-400 font-mono">
                ({filteredExpenses.length} 筆 · {formatCurrencyAmount(filteredTotalInBase, baseCurrency)})
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedDateFilter('all');
                setSelectedCategoryFilter('all');
                setCashOnlyFilter(false);
                setWithReceiptFilter(false);
                setChartCategoryDetail(null);
                setExpenseSearchQuery('');
              }}
              className="text-[11px] font-bold text-teal-700 dark:text-teal-300 hover:underline shrink-0 cursor-pointer"
            >
              {lang === 'zh' ? '全部清除' : 'Clear All'}
            </button>
          </div>
        )}

        {filteredExpenses.length === 0 ? (
          <div className="py-12 px-4 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
              <Calendar className="w-6 h-6 text-slate-400" />
            </div>
            <div>
              <p className="font-bold text-sm text-slate-700 dark:text-slate-200">
                {expenseSearchQuery.trim()
                  ? `找不到符合「${expenseSearchQuery}」的記帳記錄`
                  : activeFilterCount > 0
                  ? '目前篩選條件下尚無支出記錄'
                  : '尚未有任何記帳支出'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {expenseSearchQuery.trim()
                  ? '可嘗試更換關鍵字，或點擊下方按鈕顯示全部明細'
                  : activeFilterCount > 0
                  ? '點擊下方按鈕可為此日期新增支出，或重設檢視全部'
                  : '旅途中隨手記下一筆，即時換算匯率與掌握預算'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              {(activeFilterCount > 0 || expenseSearchQuery.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDateFilter('all');
                    setSelectedCategoryFilter('all');
                    setCashOnlyFilter(false);
                    setWithReceiptFilter(false);
                    setChartCategoryDetail(null);
                    setExpenseSearchQuery('');
                  }}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold transition active:scale-95 cursor-pointer"
                >
                  顯示全部明細
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {canEdit && !hasSeenSwipeHint && (
              <div className="md:hidden flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#F3F1EC] dark:bg-slate-800/75 border border-[#E5E2DC] dark:border-slate-700/80 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronLeft className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                  <span className="truncate">
                    {lang === 'zh'
                      ? '向左滑動任一支出列，可快速編輯或刪除'
                      : 'Swipe left on any row to edit or delete'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={dismissSwipeHint}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg font-semibold text-teal-700 dark:text-teal-300 hover:bg-white/70 dark:hover:bg-slate-700/60 transition shrink-0 cursor-pointer"
                >
                  {lang === 'zh' ? '知道了' : 'Got it'}
                </button>
              </div>
            )}
            {groupedDailyExpenses.map((group) => (
              <div key={group.date} className="space-y-1.5">
                {/* Apple Wallet Style Date Group Header */}
                <div className="flex items-center justify-between px-1 text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <span>{group.label}</span>
                    <span className="text-[11px] font-normal text-slate-400">({group.items.length} 筆)</span>
                  </span>
                  <span className="font-mono text-slate-500 dark:text-slate-400 font-semibold tabular-nums text-[11px]">
                    小計 {formatCurrencyAmount(group.totalInBase, baseCurrency)}
                  </span>
                </div>

                {/* Apple Wallet Grouped Inset Card */}
                <div className="rounded-2xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 divide-y divide-[#E5E2DC]/60 dark:divide-slate-800 shadow-2xs overflow-hidden">
                  {group.items.map((item) => {
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
                      <SwipeableExpenseRow
                        key={item.id}
                        id={item.id}
                        isOpen={openSwipeId === item.id}
                        canEdit={canEdit}
                        onOpenChange={setOpenSwipeId}
                        onSwipeRevealed={dismissSwipeHint}
                        onRowClick={() => {
                          if (canEdit) {
                            handleOpenEditExpense(item);
                          } else if (allImages.length > 0) {
                            setViewingReceiptGallery({
                              images: allImages,
                              currentIndex: 0,
                              title: item.title,
                              amount: item.amount,
                              currency: item.currency,
                              expenseId: item.id,
                            });
                          }
                        }}
                        onEdit={() => handleOpenEditExpense(item)}
                        onDelete={() => requestDeleteExpense(item)}
                        editLabel={lang === 'zh' || lang === 'zh-CN' ? '編輯' : 'Edit'}
                        deleteLabel={lang === 'zh' || lang === 'zh-CN' ? '刪除' : 'Delete'}
                        className={`p-3 sm:px-4 md:hover:bg-slate-50/80 md:dark:hover:bg-white/5 transition-colors flex items-center justify-between gap-3 group ${canEdit || allImages.length > 0 ? 'cursor-pointer' : ''}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-white/10 flex items-center justify-center shrink-0 text-slate-700 dark:text-slate-200 md:group-hover:scale-105 transition-transform">
                            <catMeta.Icon className="w-5 h-5" />
                          </div>

                          <div className="min-w-0 space-y-0.5 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm truncate md:group-hover:text-teal-600 md:dark:group-hover:text-teal-400 transition">
                                {item.title}
                              </span>
                              {allImages.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingReceiptGallery({
                                      images: allImages,
                                      currentIndex: 0,
                                      title: item.title,
                                      amount: item.amount,
                                      currency: item.currency,
                                      expenseId: item.id,
                                    });
                                  }}
                                  className="px-1.5 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-[10px] text-teal-700 dark:text-teal-300 font-bold flex items-center gap-0.5 shrink-0 cursor-pointer transition"
                                  title="直接檢視發票收據"
                                >
                                  <Receipt className="w-3 h-3" />
                                  <span>{allImages.length}</span>
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                              <span>{catMeta.label}</span>
                              <span>·</span>
                              <span className="flex items-center gap-1">
                                {payInfo.Icon ? (
                                  React.createElement(payInfo.Icon, { className: 'w-3 h-3' })
                                ) : (
                                  <Coins className="w-3 h-3" />
                                )}
                                <span>{payInfo[lang]}</span>
                              </span>
                              {item.paidBy && !trip.isSoloTrip && trip.isSplitEnabled && (
                                <>
                                  <span>·</span>
                                  <span className="text-teal-700 dark:text-teal-400 font-medium">
                                    {item.paidBy} 代墊
                                  </span>
                                </>
                              )}
                              {item.tags && item.tags.length > 0 && (
                                <>
                                  <span>·</span>
                                  <span className="text-teal-700 dark:text-teal-300 font-medium">
                                    {item.tags.map((tg) => `#${tg}`).join(' ')}
                                  </span>
                                </>
                              )}
                              {item.notes && (
                                <>
                                  <span>·</span>
                                  <span className="italic text-slate-500 dark:text-slate-400 truncate max-w-[140px] sm:max-w-[200px]">
                                    {item.notes}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right Amount Display & Desktop Hover Action Buttons */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right font-mono">
                            <div className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-slate-100 tabular-nums">
                              {formatCurrencyAmount(convertedEquivalent, baseCurrency)}
                            </div>
                            {isDiffCurrency && (
                              <div className="text-[10px] text-teal-600 dark:text-teal-400 tabular-nums font-medium">
                                ≈ {formatCurrencyAmount(item.amount, item.currency)}
                              </div>
                            )}
                          </div>

                          {canEdit && (
                            <>
                              <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 md:hidden shrink-0" aria-hidden="true" />
                              <div className="hidden md:flex items-center gap-1 md:opacity-70 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditExpense(item)}
                                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition cursor-pointer"
                                  title="編輯"
                                  aria-label="編輯"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => requestDeleteExpense(item)}
                                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                                  title="刪除"
                                  aria-label="刪除"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </SwipeableExpenseRow>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )}
        </>
      )}

      {/* 4. Add / Edit Expense iOS Sheet (天天記帳排版) */}
      {showAddModal && (
        <IosModalSheet
          onClose={closeAddExpenseModal}
          variant="surface"
          fullHeightOnMobile
          maxWidthClass="sm:max-w-lg"
          zIndexClass="z-[70]"
          disableBackdropClose={Boolean(viewingReceiptGallery)}
          ariaLabel={editingExpenseId ? '編輯支出' : '新增支出'}
        >
          {!isEditorSubPickerOpen && (
            <IosNavBar
              title={
                editingExpenseId
                  ? (lang === 'zh' ? '編輯支出' : 'Edit Expense')
                  : (lang === 'zh' ? '新增支出' : 'Add Expense')
              }
              leftLabel={lang === 'zh' ? '取消' : 'Cancel'}
              onLeftClick={closeAddExpenseModal}
              rightLabel={lang === 'zh' ? '儲存' : 'Save'}
              onRightClick={() => handleSaveExpense(false)}
              rightDisabled={
                !canEdit ||
                evaluateExpenseAmount(
                  expenseDraft.amount,
                  CURRENCY_MAP[expenseDraft.currency]?.decimals ?? 0
                ) <= 0
              }
            />
          )}

          <TiantianExpenseEditor
            trip={trip}
            lang={lang}
            canEdit={canEdit}
            baseCurrency={baseCurrency}
            isEditing={Boolean(editingExpenseId)}
            draft={expenseDraft}
            onChangeDraft={setExpenseDraft}
            onUpdateTrip={onUpdateTrip}
            requireAuth={requireAuth}
            onSave={handleSaveExpense}
            onCancel={closeAddExpenseModal}
            onDelete={editingExpenseId ? handleConfirmDeleteCurrentlyEditing : undefined}
            onUploadReceipts={handleUploadReceiptsForDraft}
            onRemoveReceipt={handleRemoveReceiptForDraft}
            onPreviewReceipt={(_src, index) => {
              setViewingReceiptGallery({
                images: expenseDraft.receiptImages,
                currentIndex: index,
                title: parseExpenseDescription(
                  expenseDraft.description,
                  getCategoryMeta(expenseDraft.category).label
                ).title,
                amount: evaluateExpenseAmount(
                  expenseDraft.amount,
                  CURRENCY_MAP[expenseDraft.currency]?.decimals ?? 0
                ),
                currency: expenseDraft.currency,
              });
            }}
            isCompressingReceipts={isCompressingReceipts}
            receiptError={receiptError}
            onOpenManageCategoriesModal={() => setShowCategoryManageModal(true)}
            saveStatusToast={saveToast}
            focusTrigger={editorFocusTrigger}
            hideFooterSaveCancel={true}
            onPickerActiveChange={setIsEditorSubPickerOpen}
          />
        </IosModalSheet>
      )}

      {/* 4.5 Base Currency Picker iOS Sheet (All 13 Supported Currencies) */}
      {showBaseCurrencySheet && (
        <IosModalSheet
          onClose={() => setShowBaseCurrencySheet(false)}
          variant="grouped"
          maxWidthClass="sm:max-w-md"
          zIndexClass="z-[75]"
          ariaLabel="切換顯示幣別"
        >
          <IosNavBar
            title={lang === 'zh' ? '選擇顯示幣別' : 'Display Currency'}
            subtitle="所有圖表與總計將即時換算"
            leftLabel={lang === 'zh' ? '關閉' : 'Close'}
            onLeftClick={() => setShowBaseCurrencySheet(false)}
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
                  selected={baseCurrency === cur.code}
                  onSelect={() => {
                    setBaseCurrency(cur.code);
                    setShowBaseCurrencySheet(false);
                  }}
                />
              ))}
            </IosInsetGroup>
          </div>
        </IosModalSheet>
      )}

      {/* 5. Custom Exchange Rate Configuration iOS Sheet */}
      {showRateModal && (
        <IosModalSheet
          onClose={() => setShowRateModal(false)}
          variant="grouped"
          maxWidthClass="sm:max-w-md"
          zIndexClass="z-[75]"
          ariaLabel="匯率換算設定"
        >
          <IosNavBar
            title={lang === 'zh' ? '匯率換算設定' : 'Exchange Rates'}
            leftLabel={lang === 'zh' ? '取消' : 'Cancel'}
            onLeftClick={() => setShowRateModal(false)}
            rightLabel={lang === 'zh' ? '套用' : 'Apply'}
            onRightClick={handleSaveRates}
          />

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
            <IosInsetGroup header="即時匯率同步">
              <IosRow
                icon={<RefreshCw className={`w-4 h-4 text-teal-700 dark:text-teal-400 ${isFetchingRates ? 'animate-spin' : ''}`} />}
                label="更新今日網路匯率"
                subtitle={liveRatesInfo?.source || '將自動填入參考外幣匯率'}
                onClick={handleRefreshLiveRates}
                disabled={isFetchingRates}
                trailing={
                  <span className="text-xs font-bold text-teal-700 dark:text-teal-400">
                    {isFetchingRates ? '更新中...' : '立即更新'}
                  </span>
                }
              />
            </IosInsetGroup>

            <IosInsetGroup header="自訂外幣匯率（以日圓 JPY 計價，須大於 0）">
              {SUPPORTED_CURRENCIES.filter((c) => c.code !== 'JPY').map((cur) => {
                const rawVal = tempRateInputs[cur.code] ?? String(cur.defaultRateToJPY);
                const parsedVal = parseFloat(rawVal);
                const isInvalid = rawVal.trim() !== '' && (!Number.isFinite(parsedVal) || parsedVal <= 0);
                return (
                  <div
                    key={cur.code}
                    className="px-4 py-2.5 min-h-[48px] flex items-center justify-between gap-3"
                  >
                    <span className="text-sm sm:text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <span className="text-base leading-none">{cur.flag}</span>
                      <span>1 {cur.code} =</span>
                    </span>
                    <div className="flex items-center gap-1.5 font-mono tabular-nums">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={rawVal}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                          setTempRateInputs((prev) => ({ ...prev, [cur.code]: cleaned }));
                        }}
                        placeholder={String(cur.defaultRateToJPY)}
                        className={`w-24 bg-transparent text-right text-[16px] sm:text-xs font-bold outline-none ${
                          isInvalid ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
                        }`}
                      />
                      <span className="text-xs text-slate-400">JPY</span>
                    </div>
                  </div>
                );
              })}
            </IosInsetGroup>

            <IosInsetGroup divided={false}>
              <IosRow
                label="恢復系統預設匯率"
                destructive
                onClick={() => {
                  setTempRateInputs({});
                  onUpdateTrip({ ...trip, customExchangeRates: undefined, updatedAt: Date.now() });
                  setShowRateModal(false);
                }}
              />
            </IosInsetGroup>
          </div>
        </IosModalSheet>
      )}

      {/* 5.5 Cash on Hand Configuration iOS Sheet */}
      {showCashModal && (
        <IosModalSheet
          onClose={() => setShowCashModal(false)}
          variant="grouped"
          maxWidthClass="sm:max-w-md"
          zIndexClass="z-[75]"
          ariaLabel="設定手頭現金"
        >
          <IosNavBar
            title={lang === 'zh' ? '設定手頭現金' : 'Set Initial Cash'}
            subtitle="自動扣除現金支付支出"
            leftLabel={lang === 'zh' ? '取消' : 'Cancel'}
            onLeftClick={() => setShowCashModal(false)}
            rightLabel={lang === 'zh' ? '儲存' : 'Save'}
            onRightClick={handleSaveInitialCash}
          />

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
            <IosInsetGroup header="現金幣別與金額">
              <IosDisclosureRow
                label="現金幣別"
                value={`${CURRENCY_MAP[cashInputCur]?.flag || ''} ${cashInputCur}`}
                valueAccent
                expanded={showCashCurrencyPicker}
                onToggle={() => setShowCashCurrencyPicker((v) => !v)}
              >
                <div className="divide-y divide-[#E5E2DC]/60 dark:divide-slate-800/70">
                  {SUPPORTED_CURRENCIES.map((cur) => (
                    <IosCheckmarkRow
                      key={cur.code}
                      icon={<span className="text-base leading-none">{cur.flag}</span>}
                      label={`${cur.code} · ${cur.name}`}
                      selected={cashInputCur === cur.code}
                      onSelect={() => {
                        setCashInputCur(cur.code);
                        setShowCashCurrencyPicker(false);
                      }}
                    />
                  ))}
                </div>
              </IosDisclosureRow>

              <div className="px-4 py-3 flex items-center justify-between gap-3 min-h-[52px]">
                <span className="text-sm sm:text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                  初始金額
                </span>
                <div className="flex-1 min-w-0 flex items-center justify-end gap-1.5">
                  <span className="text-sm font-mono font-bold text-slate-400">
                    {CURRENCY_MAP[cashInputCur]?.symbol || cashInputCur}
                  </span>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={cashInputAmt}
                    onChange={(e) => setCashInputAmt(e.target.value)}
                    placeholder="0"
                    className="w-full min-w-0 text-right bg-transparent text-xl font-mono tabular-nums font-black text-teal-800 dark:text-teal-300 outline-none"
                  />
                </div>
              </div>

              <div className="px-4 py-2.5 flex items-center gap-1.5 flex-wrap bg-[#FAF9F6]/60 dark:bg-slate-900/30">
                <span className="text-[11px] text-slate-400 font-semibold mr-1">快速帶入：</span>
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
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-teal-800 dark:text-teal-300 border border-[#E5E2DC] dark:border-slate-700 hover:border-teal-600 font-mono tabular-nums text-[11px] font-bold transition cursor-pointer"
                  >
                    {quickVal.toLocaleString()}
                  </button>
                ))}
              </div>
            </IosInsetGroup>

            {cashInputAmt.trim() !== '' && parseFloat(cashInputAmt) >= 0 && (
              <IosInsetGroup header="預估手頭現金結算">
                <IosRow
                  label="初始設定金額"
                  trailing={
                    <span className="text-xs font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200">
                      {formatCurrencyAmount(parseFloat(cashInputAmt) || 0, cashInputCur)}
                    </span>
                  }
                />
                <IosRow
                  label="累計現金支出扣除"
                  trailing={
                    <span className="text-xs font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                      - {formatCurrencyAmount(modalCashSpent, cashInputCur)}
                    </span>
                  }
                />
                <IosRow
                  label="預估手頭剩餘"
                  trailing={
                    <span className={`text-sm font-mono tabular-nums font-black ${
                      (parseFloat(cashInputAmt) || 0) - modalCashSpent < 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-700 dark:text-emerald-300'
                    }`}>
                      {formatCurrencyAmount((parseFloat(cashInputAmt) || 0) - modalCashSpent, cashInputCur)}
                    </span>
                  }
                />
              </IosInsetGroup>
            )}
          </div>
        </IosModalSheet>
      )}

      {/* 6. Multi-Receipt Fullscreen Lightbox / Gallery (Portaled above z-[70] sheets) */}
      {viewingReceiptGallery && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[110] bg-black/88 backdrop-blur-sm flex items-center justify-center px-2 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] animate-in fade-in duration-150"
          onClick={() => setViewingReceiptGallery(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-full sm:max-h-[92dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Receipt className="w-4 h-4 text-teal-600 shrink-0" />
                <div className="min-w-0">
                  <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                    {viewingReceiptGallery.title}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {formatCurrencyAmount(viewingReceiptGallery.amount, viewingReceiptGallery.currency)} · 第 {viewingReceiptGallery.currentIndex + 1} / {viewingReceiptGallery.images.length} 張發票
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingReceiptGallery(null)}
                className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                aria-label="關閉"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Image Preview with Touch Swipe + Next/Prev Carousel */}
            <div
              className="relative p-2 sm:p-4 flex-1 overflow-auto flex items-center justify-center bg-slate-950/20 min-h-[300px]"
              onTouchStart={(e) => {
                if (e.touches.length === 1 && viewingReceiptGallery.images.length > 1) {
                  receiptSwipeStartRef.current = {
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY,
                  };
                }
              }}
              onTouchEnd={(e) => {
                const start = receiptSwipeStartRef.current;
                receiptSwipeStartRef.current = null;
                if (!start || e.changedTouches.length !== 1 || viewingReceiptGallery.images.length <= 1) return;
                const dx = e.changedTouches[0].clientX - start.x;
                const dy = e.changedTouches[0].clientY - start.y;
                if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
                  setViewingReceiptGallery((prev) =>
                    prev
                      ? {
                          ...prev,
                          currentIndex:
                            dx < 0
                              ? (prev.currentIndex + 1) % prev.images.length
                              : (prev.currentIndex - 1 + prev.images.length) % prev.images.length,
                        }
                      : null
                  );
                }
              }}
            >
              <MediaImage
                tripId={trip.id}
                ownerId={trip.ownerId}
                collabId={trip.collabId}
                src={viewingReceiptGallery.images[viewingReceiptGallery.currentIndex]}
                alt="Receipt Image"
                className="max-h-[65dvh] max-w-full rounded-2xl object-contain shadow-lg border border-slate-200 dark:border-slate-800"
              />

              {/* Prev / Next Buttons */}
              {viewingReceiptGallery.images.length > 1 && (
                <>
                  <button
                    type="button"
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
                    className="absolute left-3 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-xs transition shadow-md cursor-pointer"
                    aria-label="上一張"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-xs transition shadow-md cursor-pointer"
                    aria-label="下一張"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* Bottom bar */}
            <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[11px] text-slate-400">
                {viewingReceiptGallery.images.length > 1 ? '可左右滑動或方向鍵切換' : '發票收據原圖檢視'}
              </span>
              <div className="flex items-center gap-2">
                {canEdit && viewingReceiptGallery.expenseId && (
                  <button
                    type="button"
                    onClick={() => {
                      const targetExp = trip.expenses.find((e) => e.id === viewingReceiptGallery.expenseId);
                      setViewingReceiptGallery(null);
                      if (targetExp) {
                        handleOpenEditExpense(targetExp);
                      }
                    }}
                    className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-300 font-bold flex items-center gap-1 transition cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>{lang === 'zh' ? '編輯此筆記帳' : 'Edit Expense'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDownloadCurrentReceipt}
                  className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>下載圖片</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingReceiptGallery(null)}
                  className="min-h-[44px] sm:min-h-[36px] px-4 py-1.5 rounded-xl bg-teal-700 text-white font-bold hover:bg-teal-800 transition cursor-pointer"
                >
                  完成
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Dedicated Category Manage Modal */}
      {showCategoryManageModal && (
        <CategoryManageModal
          customCategories={customCategories}
          customCategoryLabels={trip.customCategoryLabels}
          categoryUsageCounts={categoryUsageCounts}
          onAddCategory={handleAddCustomCategory}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
          onClose={() => setShowCategoryManageModal(false)}
        />
      )}

      {/* Expense Filter Drawer */}
      <ExpenseFilterDrawer
        isOpen={showFilterDrawer}
        onClose={() => setShowFilterDrawer(false)}
        selectedDateFilter={selectedDateFilter}
        onSelectDateFilter={setSelectedDateFilter}
        selectedCategoryFilter={selectedCategoryFilter}
        onSelectCategoryFilter={(next) => {
          setSelectedCategoryFilter(next);
          setChartCategoryDetail(next === 'all' ? null : next);
        }}
        cashOnly={cashOnlyFilter}
        onToggleCashOnly={setCashOnlyFilter}
        withReceipt={withReceiptFilter}
        onToggleWithReceipt={setWithReceiptFilter}
        defaultCategories={DEFAULT_CATEGORIES}
        customCategories={customCategories}
        customCategoryLabels={trip.customCategoryLabels}
        tripDays={trip.days}
        todayStr={todayStr}
        hasPreTripExpenses={trip.expenses.some((e) => trip.startDate && e.date < trip.startDate)}
        filteredCount={filteredExpenses.length}
        onResetAll={() => {
          setSelectedDateFilter('all');
          setSelectedCategoryFilter('all');
          setCashOnlyFilter(false);
          setWithReceiptFilter(false);
          setChartCategoryDetail(null);
        }}
        lang={lang}
      />

      {/* Safe Remove Companion Confirmation iOS Action Sheet */}
      {pendingRemoveCompanion && (
        <IosActionSheet
          title={lang === 'zh' ? `確定要移除旅伴「${pendingRemoveCompanion}」？` : `Remove companion "${pendingRemoveCompanion}"?`}
          message={(() => {
            const refCount = trip.expenses.filter(
              (e) =>
                e.paidBy === pendingRemoveCompanion ||
                (Array.isArray(e.splitWith) && e.splitWith.includes(pendingRemoveCompanion))
            ).length;
            if (refCount > 0) {
              return `「${pendingRemoveCompanion}」共有 ${refCount} 筆歷史分帳紀錄，移除後新支出將不再預設分攤，但歷史結算明細會完整保留。`;
            }
            return `移除後「${pendingRemoveCompanion}」將不再出現在分帳成員名單中。`;
          })()}
          options={[
            {
              label: lang === 'zh' ? '確認移除' : 'Remove',
              tone: 'destructive',
              onClick: () => handleConfirmRemoveCompanion(pendingRemoveCompanion),
            },
          ]}
          cancelLabel={lang === 'zh' ? '取消' : 'Cancel'}
          onClose={() => setPendingRemoveCompanion(null)}
        />
      )}

      {/* Safe Delete Confirmation iOS Action Sheet */}
      {pendingDeleteExpense && (
        <IosActionSheet
          title={lang === 'zh' ? '確定要刪除此筆支出？' : 'Delete this expense?'}
          message={
            lang === 'zh'
              ? `「${pendingDeleteExpense.title}」（${formatCurrencyAmount(pendingDeleteExpense.amount, pendingDeleteExpense.currency)}）刪除後將同步移除且無法復原。`
              : `"${pendingDeleteExpense.title}" (${formatCurrencyAmount(pendingDeleteExpense.amount, pendingDeleteExpense.currency)}) will be permanently removed.`
          }
          options={[
            {
              label: lang === 'zh' ? '確認刪除' : 'Delete',
              tone: 'destructive',
              onClick: () => {
                const idToDelete = pendingDeleteExpense.id;
                setPendingDeleteExpense(null);
                handleDeleteExpense(idToDelete);
              },
            },
          ]}
          cancelLabel={lang === 'zh' ? '取消' : 'Cancel'}
          onClose={() => setPendingDeleteExpense(null)}
        />
      )}

      {/* Bottom-Right Floating Action Button (+) for Quick Add Expense */}
      {canEdit &&
        !showAddModal &&
        !showRateModal &&
        !showCashModal &&
        !showFilterDrawer &&
        !showCategoryManageModal &&
        !viewingReceiptGallery &&
        typeof document !== 'undefined' &&
        createPortal(
          <button
            type="button"
            onClick={() => {
              const targetDate =
                selectedDateFilter !== 'all' &&
                selectedDateFilter !== 'pre' &&
                selectedDateFilter !== 'today' &&
                selectedDateFilter !== 'cash_only'
                  ? selectedDateFilter
                  : selectedDateFilter === 'today'
                  ? todayStr
                  : undefined;
              handleOpenAddExpense(targetDate);
            }}
            aria-label={lang === 'zh' ? '新增記帳' : 'Add expense'}
            title={lang === 'zh' ? '記一筆' : 'Add expense'}
            className="fixed right-4 sm:right-6 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] sm:bottom-6 z-40 w-14 h-14 rounded-full bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white shadow-lg shadow-teal-900/25 flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>,
          document.body
        )}
    </div>
  );
};


