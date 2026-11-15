import React, { useState, useMemo, useEffect } from 'react';
import { Trip, BookingVoucher, BookingCategory, ItineraryItem } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import {
  Ticket,
  Plane,
  Hotel,
  Train,
  Wifi,
  Bookmark,
  Plus,
  Copy,
  Check,
  Search,
  Edit2,
  Trash2,
  Maximize2,
  X,
  MapPin,
  Calendar,
  ExternalLink,
  KeyRound,
  ArrowUpRight,
} from 'lucide-react';

interface BookingVaultViewProps {
  trip: Trip;
  lang: Language;
  canEdit?: boolean;
  onUpdateTrip: (updatedTrip: Trip) => void;
  requireAuth?: (action: () => void, reason?: string) => boolean;
  onJumpToDay?: (dayNumber: number) => void;
}

const BOOKING_CATEGORIES: Array<{
  key: BookingCategory;
  labelZh: string;
  labelEn: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'flight', labelZh: '航班機票', labelEn: 'Flight', icon: Plane },
  { key: 'hotel', labelZh: '住宿訂房', labelEn: 'Hotel', icon: Hotel },
  { key: 'rail', labelZh: '鐵路交通', labelEn: 'Rail & Bus', icon: Train },
  { key: 'ticket', labelZh: '門票預約', labelEn: 'Tickets', icon: Ticket },
  { key: 'connectivity', labelZh: '網卡/eSIM', labelEn: 'eSIM & WiFi', icon: Wifi },
  { key: 'other', labelZh: '其他憑證', labelEn: 'Other', icon: Bookmark },
];

type UnifiedBookingEntry =
  | {
      source: 'voucher';
      voucher: BookingVoucher;
    }
  | {
      source: 'itinerary';
      id: string;
      category: BookingCategory;
      title: string;
      bookingCode: string;
      dayNumber: number;
      date: string;
      timeLabel?: string;
      location?: string;
      notes?: string;
      item: ItineraryItem;
    };

function mapItineraryCategoryToBooking(cat: ItineraryItem['category']): BookingCategory {
  if (cat === 'hotel') return 'hotel';
  if (cat === 'transport') return 'rail';
  if (cat === 'spot' || cat === 'activity') return 'ticket';
  return 'other';
}

async function copyToClipboardSafe(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export const BookingVaultView: React.FC<BookingVaultViewProps> = ({
  trip,
  lang,
  canEdit = true,
  onUpdateTrip,
  requireAuth,
  onJumpToDay,
}) => {
  const isZh = lang === 'zh' || lang === 'zh-CN';
  const [filterCat, setFilterCat] = useState<'all' | BookingCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingVoucherId, setEditingVoucherId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [counterCard, setCounterCard] = useState<{
    title: string;
    category: BookingCategory;
    bookingCode: string;
    secondaryCode?: string;
    provider?: string;
    dateLabel?: string;
    location?: string;
    notes?: string;
  } | null>(null);

  useBodyScrollLock(Boolean(counterCard));

  useEffect(() => {
    if (!counterCard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCounterCard(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [counterCard]);

  // Form states
  const [formCat, setFormCat] = useState<BookingCategory>('flight');
  const [formTitle, setFormTitle] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formSecondary, setFormSecondary] = useState('');
  const [formProvider, setFormProvider] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formTimeLabel, setFormTimeLabel] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formDayNumber, setFormDayNumber] = useState<string>('');
  const [formUrl, setFormUrl] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const resetForm = () => {
    setEditingVoucherId(null);
    setFormCat('flight');
    setFormTitle('');
    setFormCode('');
    setFormSecondary('');
    setFormProvider('');
    setFormStartDate(trip.startDate || '');
    setFormEndDate('');
    setFormTimeLabel('');
    setFormLocation('');
    setFormDayNumber('');
    setFormUrl('');
    setFormNotes('');
  };

  const openCreateForm = () => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(openCreateForm, isZh ? '新增訂位憑證' : 'Add booking voucher')) {
      return;
    }
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (v: BookingVoucher) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => openEditForm(v), isZh ? '編輯訂位憑證' : 'Edit booking voucher')) {
      return;
    }
    setEditingVoucherId(v.id);
    setFormCat(v.category);
    setFormTitle(v.title);
    setFormCode(v.bookingCode);
    setFormSecondary(v.secondaryCode || '');
    setFormProvider(v.provider || '');
    setFormStartDate(v.startDate || '');
    setFormEndDate(v.endDate || '');
    setFormTimeLabel(v.timeLabel || '');
    setFormLocation(v.location || '');
    setFormDayNumber(v.dayNumber ? String(v.dayNumber) : '');
    setFormUrl(v.url || '');
    setFormNotes(v.notes || '');
    setShowForm(true);
  };

  const handleSaveVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !formTitle.trim() || !formCode.trim()) return;
    if (requireAuth && !requireAuth(() => handleSaveVoucher(e), isZh ? '儲存訂位憑證' : 'Save booking voucher')) {
      return;
    }

    const parsedDay = formDayNumber ? parseInt(formDayNumber, 10) : undefined;
    const now = Date.now();
    const existingList = trip.bookings || [];

    if (editingVoucherId) {
      const updated = existingList.map((b) =>
        b.id === editingVoucherId
          ? {
              ...b,
              category: formCat,
              title: formTitle.trim().slice(0, 120),
              bookingCode: formCode.trim().slice(0, 100),
              secondaryCode: formSecondary.trim().slice(0, 100) || undefined,
              provider: formProvider.trim().slice(0, 100) || undefined,
              startDate: formStartDate.trim().slice(0, 30) || undefined,
              endDate: formEndDate.trim().slice(0, 30) || undefined,
              timeLabel: formTimeLabel.trim().slice(0, 40) || undefined,
              location: formLocation.trim().slice(0, 200) || undefined,
              dayNumber: parsedDay && !isNaN(parsedDay) ? parsedDay : undefined,
              url: formUrl.trim().slice(0, 500) || undefined,
              notes: formNotes.trim().slice(0, 500) || undefined,
              updatedAt: now,
            }
          : b
      );
      onUpdateTrip({ ...trip, bookings: updated, updatedAt: now });
    } else {
      const newVoucher: BookingVoucher = {
        id: `bk-${now}-${Math.random().toString(36).slice(2, 6)}`,
        category: formCat,
        title: formTitle.trim().slice(0, 120),
        bookingCode: formCode.trim().slice(0, 100),
        secondaryCode: formSecondary.trim().slice(0, 100) || undefined,
        provider: formProvider.trim().slice(0, 100) || undefined,
        startDate: formStartDate.trim().slice(0, 30) || undefined,
        endDate: formEndDate.trim().slice(0, 30) || undefined,
        timeLabel: formTimeLabel.trim().slice(0, 40) || undefined,
        location: formLocation.trim().slice(0, 200) || undefined,
        dayNumber: parsedDay && !isNaN(parsedDay) ? parsedDay : undefined,
        url: formUrl.trim().slice(0, 500) || undefined,
        notes: formNotes.trim().slice(0, 500) || undefined,
        createdAt: now,
        updatedAt: now,
      };
      onUpdateTrip({ ...trip, bookings: [newVoucher, ...existingList].slice(0, 100), updatedAt: now });
    }

    setShowForm(false);
    resetForm();
  };

  const handleDeleteVoucher = (id: string) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleDeleteVoucher(id), isZh ? '刪除訂位憑證' : 'Delete booking voucher')) {
      return;
    }
    const now = Date.now();
    onUpdateTrip({
      ...trip,
      bookings: (trip.bookings || []).filter((b) => b.id !== id),
      deletedItemIds: {
        ...(trip.deletedItemIds || {}),
        [id]: now,
      },
      updatedAt: now,
    });
    setDeletingId(null);
  };

  const handleCopy = async (value: string, keyId: string) => {
    const ok = await copyToClipboardSafe(value);
    if (ok) {
      setCopiedKey(keyId);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === keyId ? null : prev));
      }, 1800);
    }
  };

  // Merge standalone bookings + auto-extracted itinerary items with bookingCode
  const unifiedEntries = useMemo<UnifiedBookingEntry[]>(() => {
    const list: UnifiedBookingEntry[] = [];

    (trip.bookings || []).forEach((voucher) => {
      list.push({ source: 'voucher', voucher });
    });

    (trip.days || []).forEach((day) => {
      (day.items || []).forEach((item) => {
        if (item.bookingCode && item.bookingCode.trim()) {
          list.push({
            source: 'itinerary',
            id: `itin-${day.dayNumber}-${item.id}`,
            category: mapItineraryCategoryToBooking(item.category),
            title: item.title,
            bookingCode: item.bookingCode.trim(),
            dayNumber: day.dayNumber,
            date: day.date,
            timeLabel: item.endTime ? `${item.startTime} - ${item.endTime}` : item.startTime,
            location: item.locationName || item.address,
            notes: item.notes,
            item,
          });
        }
      });
    });

    return list;
  }, [trip.bookings, trip.days]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return unifiedEntries.filter((entry) => {
      const cat = entry.source === 'voucher' ? entry.voucher.category : entry.category;
      if (filterCat !== 'all' && cat !== filterCat) return false;
      if (!q) return true;

      if (entry.source === 'voucher') {
        const v = entry.voucher;
        return [v.title, v.bookingCode, v.secondaryCode, v.provider, v.location, v.notes]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(q));
      }
      return [entry.title, entry.bookingCode, entry.location, entry.notes]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q));
    });
  }, [unifiedEntries, filterCat, searchQuery]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: unifiedEntries.length };
    for (const c of BOOKING_CATEGORIES) counts[c.key] = 0;
    for (const e of unifiedEntries) {
      const cat = e.source === 'voucher' ? e.voucher.category : e.category;
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [unifiedEntries]);

  return (
    <div className="space-y-5 pb-12">
      {/* Header & Toolbar Card */}
      <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5E2DC] dark:border-slate-800">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Ticket className="w-5 h-5 text-teal-700 dark:text-teal-400" />
              <span className="tabular-nums">
                {isZh ? `訂位憑證夾 (${unifiedEntries.length})` : `Booking Vault (${unifiedEntries.length})`}
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {isZh
                ? '集中管理機票、訂房、鐵路票券與網卡代號，同時自動彙整行程內的預約編號，支援一鍵複製與櫃檯出示。'
                : 'Centralize flight PNRs, hotel confirmations, rail passes, and itinerary booking codes with 1-tap copy.'}
            </p>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={openCreateForm}
              className="min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isZh ? '新增訂位憑證' : 'Add Voucher'}</span>
            </button>
          )}
        </div>

        {/* Category Filter Tabs & Search */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setFilterCat('all')}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition shrink-0 cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                filterCat === 'all'
                  ? 'bg-teal-700 dark:bg-teal-600 text-white border-teal-700 dark:border-teal-600'
                  : 'bg-[#FAF9F6] dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-[#E5E2DC] dark:border-slate-700 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>{isZh ? '全部' : 'All'}</span>
              <span className="font-mono tabular-nums opacity-80">{categoryCounts.all}</span>
            </button>

            {BOOKING_CATEGORIES.map((c) => {
              const Icon = c.icon;
              const isActive = filterCat === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setFilterCat(c.key)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition shrink-0 cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? 'bg-teal-700 dark:bg-teal-600 text-white border-teal-700 dark:border-teal-600'
                      : 'bg-[#FAF9F6] dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-[#E5E2DC] dark:border-slate-700 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{isZh ? c.labelZh : c.labelEn}</span>
                  {categoryCounts[c.key] > 0 && (
                    <span className="font-mono tabular-nums opacity-80">{categoryCounts[c.key]}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="relative w-full lg:w-64 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isZh ? '搜尋代號、航班或飯店...' : 'Search code, hotel, flight...'}
              className="w-full min-h-[40px] pl-8 pr-8 py-1.5 rounded-xl bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-teal-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Add / Edit Voucher Form */}
        {showForm && (
          <form
            onSubmit={handleSaveVoucher}
            className="p-4 sm:p-5 rounded-2xl bg-[#FAF9F6] dark:bg-slate-900/70 border border-[#E5E2DC] dark:border-slate-700 space-y-3.5 text-xs animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#E5E2DC] dark:border-slate-800">
              <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <Ticket className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <span>
                  {editingVoucherId
                    ? isZh
                      ? '編輯訂位憑證'
                      : 'Edit Booking Voucher'
                    : isZh
                    ? '新增獨立訂位憑證'
                    : 'New Booking Voucher'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="min-h-[36px] px-2.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-semibold cursor-pointer"
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
            </div>

            {/* Category selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {BOOKING_CATEGORIES.map((c) => {
                const Icon = c.icon;
                const active = formCat === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setFormCat(c.key)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl font-semibold border transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                      active
                        ? 'bg-teal-700 dark:bg-teal-600 text-white border-teal-700 dark:border-teal-600'
                        : 'bg-white dark:bg-[#111827] text-slate-600 dark:text-slate-300 border-[#E5E2DC] dark:border-slate-700'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{isZh ? c.labelZh : c.labelEn}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isZh ? '憑證標題 *' : 'Title *'}
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={isZh ? '如：長榮 BR198 台北→東京、金澤日航飯店' : 'e.g., EVA Air BR198, Hotel Nikko'}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-700 text-slate-900 dark:text-white font-semibold outline-none focus:border-teal-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isZh ? '訂位代號 / 確認碼 *' : 'Booking Reference / PNR *'}
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder={isZh ? '如：XYZ89K / AGD-992018' : 'e.g., XYZ89K / CONF-992018'}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-700 text-slate-900 dark:text-white font-mono font-bold tracking-wide outline-none focus:border-teal-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isZh ? '座位 / 航廈 / PIN 碼 (選填)' : 'Seat / Gate / PIN (Optional)'}
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={formSecondary}
                  onChange={(e) => setFormSecondary(e.target.value)}
                  placeholder={isZh ? '如：T2 · 14A 或 入住密碼 5183*' : 'e.g., T2 · Seat 14A or PIN 5183*'}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-700 text-slate-900 dark:text-white font-mono outline-none focus:border-teal-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isZh ? '平台 / 航空公司 / 業者 (選填)' : 'Provider / Airline (Optional)'}
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={formProvider}
                  onChange={(e) => setFormProvider(e.target.value)}
                  placeholder={isZh ? '如：Agoda、JR West、長榮航空' : 'e.g., Agoda, JR West, ANA'}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:border-teal-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isZh ? '開始日期' : 'Start Date'}
                  </label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full min-h-[42px] px-2.5 py-2 rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-700 text-slate-900 dark:text-white font-mono outline-none focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isZh ? '結束 / 退房日' : 'End Date'}
                  </label>
                  <input
                    type="date"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    className="w-full min-h-[42px] px-2.5 py-2 rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-700 text-slate-900 dark:text-white font-mono outline-none focus:border-teal-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isZh ? '班次 / 時段' : 'Time Label'}
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={formTimeLabel}
                    onChange={(e) => setFormTimeLabel(e.target.value)}
                    placeholder={isZh ? '如：10:15 起飛 / 15:00 入住' : 'e.g., 10:15 / Check-in 15:00'}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-700 text-slate-900 dark:text-white font-mono outline-none focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isZh ? '關聯天數' : 'Trip Day'}
                  </label>
                  <select
                    value={formDayNumber}
                    onChange={(e) => setFormDayNumber(e.target.value)}
                    className="w-full min-h-[42px] px-2.5 py-2 rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:border-teal-600"
                  >
                    <option value="">{isZh ? '全程 / 不指定' : 'Whole trip'}</option>
                    {(trip.days || []).map((d) => (
                      <option key={d.id} value={String(d.dayNumber)}>
                        Day {d.dayNumber} ({d.date})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isZh ? '機場 / 車站 / 飯店地址' : 'Airport / Station / Address'}
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder={isZh ? '方便現場一鍵複製地址給計程車或導航' : 'Address or terminal location'}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:border-teal-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isZh ? '電子憑證 / 訂單連結 (選填)' : 'Booking URL (Optional)'}
                </label>
                <input
                  type="url"
                  maxLength={500}
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:border-teal-600"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {isZh ? '備註 (行李額度、取票方式、退改規則等)' : 'Notes (Baggage, pickup, policy)'}
              </label>
              <textarea
                rows={2}
                maxLength={500}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder={isZh ? '例：託運 23kg x2、護照需與訂位拼音一致...' : 'e.g., 23kg checked bag, passport required...'}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:border-teal-600 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="submit"
                className="min-h-[44px] px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{editingVoucherId ? (isZh ? '儲存變更' : 'Save Changes') : isZh ? '加入憑證夾' : 'Save Voucher'}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Empty State */}
      {filteredEntries.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#FAF9F6] dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700 flex items-center justify-center mx-auto text-teal-700 dark:text-teal-400">
            <Ticket className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              {unifiedEntries.length === 0
                ? isZh
                  ? '尚未建立任何訂位憑證'
                  : 'No booking vouchers yet'
                : isZh
                ? '找不到符合條件的憑證'
                : 'No matching vouchers found'}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {unifiedEntries.length === 0
                ? isZh
                  ? '新增航班訂位代號、飯店確認碼或車票編號，或在行程景點填寫預約代號後皆會自動集中於此。'
                  : 'Add flights, hotels, rail passes, or fill booking codes on itinerary spots to collect them here.'
                : isZh
                ? '請嘗試更換分類篩選或清除搜尋關鍵字。'
                : 'Try changing the category filter or clearing your search.'}
            </p>
          </div>
          {canEdit && unifiedEntries.length === 0 && (
            <button
              type="button"
              onClick={openCreateForm}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isZh ? '新增第一筆憑證' : 'Add First Voucher'}</span>
            </button>
          )}
        </div>
      ) : (
        /* 2-Column Editorial Voucher Cards Grid */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredEntries.map((entry) => {
            if (entry.source === 'voucher') {
              const v = entry.voucher;
              const catMeta = BOOKING_CATEGORIES.find((c) => c.key === v.category) || BOOKING_CATEGORIES[5];
              const CatIcon = catMeta.icon;
              const copyMainId = `code-${v.id}`;
              const copySecId = `sec-${v.id}`;
              const copyLocId = `loc-${v.id}`;
              const isConfirmingDelete = deletingId === v.id;
              const dateRangeText = v.startDate
                ? v.endDate && v.endDate !== v.startDate
                  ? `${v.startDate} ~ ${v.endDate}`
                  : v.startDate
                : '';

              return (
                <div
                  key={v.id}
                  className="rounded-2xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-3.5"
                >
                  <div className="space-y-3">
                    {/* Quiet unboxed metadata line */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium flex-wrap min-w-0">
                        <span className="flex items-center gap-1 text-teal-700 dark:text-teal-400 font-semibold shrink-0">
                          <CatIcon className="w-3.5 h-3.5" />
                          <span>{isZh ? catMeta.labelZh : catMeta.labelEn}</span>
                        </span>
                        {v.provider && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{v.provider}</span>
                          </>
                        )}
                        {v.dayNumber && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">Day {v.dayNumber}</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setCounterCard({
                              title: v.title,
                              category: v.category,
                              bookingCode: v.bookingCode,
                              secondaryCode: v.secondaryCode,
                              provider: v.provider,
                              dateLabel: [dateRangeText, v.timeLabel].filter(Boolean).join(' · '),
                              location: v.location,
                              notes: v.notes,
                            })
                          }
                          title={isZh ? '全螢幕出示給櫃檯' : 'Show fullscreen card'}
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-300 hover:bg-[#FAF9F6] dark:hover:bg-slate-800 transition cursor-pointer"
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditForm(v)}
                              title={isZh ? '編輯憑證' : 'Edit voucher'}
                              className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-[#FAF9F6] dark:hover:bg-slate-800 transition cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingId(isConfirmingDelete ? null : v.id)}
                              title={isZh ? '刪除憑證' : 'Delete voucher'}
                              className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Title */}
                    <h4 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                      {v.title}
                    </h4>

                    {/* Prominent Code Row with 1-Tap Copy */}
                    <div className="flex items-center justify-between gap-2.5 p-3 rounded-xl bg-[#FAF9F6] dark:bg-slate-900/70 border border-[#E5E2DC] dark:border-slate-800">
                      <div className="min-w-0">
                        <span className="text-[11px] text-slate-400 block">
                          {isZh ? '訂位代號 / 確認碼' : 'Booking Code'}
                        </span>
                        <span className="font-mono tabular-nums font-bold text-base text-slate-900 dark:text-white tracking-wider break-all select-all">
                          {v.bookingCode}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopy(v.bookingCode, copyMainId)}
                        className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shrink-0 transition active:scale-95 cursor-pointer ${
                          copiedKey === copyMainId
                            ? 'bg-teal-700 text-white'
                            : 'bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:border-teal-600'
                        }`}
                      >
                        {copiedKey === copyMainId ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>{isZh ? '已複製' : 'Copied'}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                            <span>{isZh ? '複製' : 'Copy'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Secondary Code / Seat / Gate / PIN */}
                    {v.secondaryCode && (
                      <div className="flex items-center justify-between gap-2 text-xs px-1">
                        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-mono tabular-nums truncate">
                          <KeyRound className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
                          <span className="truncate">{v.secondaryCode}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(v.secondaryCode!, copySecId)}
                          className="min-h-[34px] px-2.5 rounded-lg text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 shrink-0 cursor-pointer flex items-center gap-1"
                        >
                          {copiedKey === copySecId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === copySecId ? (isZh ? '已複製' : 'Copied') : isZh ? '複製細節' : 'Copy'}</span>
                        </button>
                      </div>
                    )}

                    {/* Date, Time & Location */}
                    {(dateRangeText || v.timeLabel || v.location) && (
                      <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                        {(dateRangeText || v.timeLabel) && (
                          <div className="flex items-center gap-1.5 font-mono tabular-nums">
                            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{[dateRangeText, v.timeLabel].filter(Boolean).join(' · ')}</span>
                          </div>
                        )}
                        {v.location && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 min-w-0">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{v.location}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(v.location!, copyLocId)}
                              className="text-[11px] font-semibold text-slate-500 hover:text-teal-700 dark:hover:text-teal-400 shrink-0 cursor-pointer"
                            >
                              {copiedKey === copyLocId ? (isZh ? '已複製' : 'Copied') : isZh ? '複製地址' : 'Copy'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {v.notes && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed border-t border-[#E5E2DC]/70 dark:border-slate-800 pt-2.5">
                        {v.notes}
                      </p>
                    )}
                  </div>

                  {/* Delete confirm or Footer Actions */}
                  {isConfirmingDelete ? (
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-rose-200 dark:border-rose-900/50 text-xs">
                      <span className="font-semibold text-rose-600 dark:text-rose-400">
                        {isZh ? '確定刪除此憑證？' : 'Delete this voucher?'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDeletingId(null)}
                          className="min-h-[36px] px-3 rounded-lg border border-[#E5E2DC] dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold cursor-pointer"
                        >
                          {isZh ? '取消' : 'Cancel'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteVoucher(v.id)}
                          className="min-h-[36px] px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                        >
                          {isZh ? '確認刪除' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    (v.url || (v.dayNumber && onJumpToDay)) && (
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E5E2DC]/70 dark:border-slate-800 text-xs">
                        {v.dayNumber && onJumpToDay ? (
                          <button
                            type="button"
                            onClick={() => onJumpToDay(v.dayNumber!)}
                            className="font-semibold text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <span>{isZh ? `前往 Day ${v.dayNumber} 行程` : `Go to Day ${v.dayNumber}`}</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span />
                        )}
                        {v.url && (
                          <a
                            href={v.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1"
                          >
                            <span>{isZh ? '開啟電子憑證' : 'Open Link'}</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    )
                  )}
                </div>
              );
            }

            // Auto-extracted from ItineraryItem
            const catMeta = BOOKING_CATEGORIES.find((c) => c.key === entry.category) || BOOKING_CATEGORIES[5];
            const CatIcon = catMeta.icon;
            const copyId = `itin-copy-${entry.id}`;

            return (
              <div
                key={entry.id}
                className="rounded-2xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-3.5"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium flex-wrap min-w-0">
                      <span className="flex items-center gap-1 text-teal-700 dark:text-teal-400 font-semibold shrink-0">
                        <CatIcon className="w-3.5 h-3.5" />
                        <span>{isZh ? catMeta.labelZh : catMeta.labelEn}</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {isZh ? `行程 Day ${entry.dayNumber}` : `Itinerary Day ${entry.dayNumber}`}
                      </span>
                      {entry.timeLabel && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{entry.timeLabel}</span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setCounterCard({
                          title: entry.title,
                          category: entry.category,
                          bookingCode: entry.bookingCode,
                          dateLabel: [entry.date, entry.timeLabel].filter(Boolean).join(' · '),
                          location: entry.location,
                          notes: entry.notes,
                        })
                      }
                      title={isZh ? '全螢幕出示給櫃檯' : 'Show fullscreen card'}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-300 hover:bg-[#FAF9F6] dark:hover:bg-slate-800 transition shrink-0 cursor-pointer"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>

                  <h4 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                    {entry.title}
                  </h4>

                  <div className="flex items-center justify-between gap-2.5 p-3 rounded-xl bg-[#FAF9F6] dark:bg-slate-900/70 border border-[#E5E2DC] dark:border-slate-800">
                    <div className="min-w-0">
                      <span className="text-[11px] text-slate-400 block">
                        {isZh ? '行程預約代號' : 'Itinerary Booking Code'}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-base text-slate-900 dark:text-white tracking-wider break-all select-all">
                        {entry.bookingCode}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopy(entry.bookingCode, copyId)}
                      className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shrink-0 transition active:scale-95 cursor-pointer ${
                        copiedKey === copyId
                          ? 'bg-teal-700 text-white'
                          : 'bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:border-teal-600'
                      }`}
                    >
                      {copiedKey === copyId ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>{isZh ? '已複製' : 'Copied'}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                          <span>{isZh ? '複製' : 'Copy'}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {entry.location && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{entry.location}</span>
                    </div>
                  )}
                </div>

                {onJumpToDay && (
                  <div className="pt-2 border-t border-[#E5E2DC]/70 dark:border-slate-800 text-xs">
                    <button
                      type="button"
                      onClick={() => onJumpToDay(entry.dayNumber)}
                      className="font-semibold text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>{isZh ? `查看 Day ${entry.dayNumber} 時間軸` : `View Day ${entry.dayNumber}`}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Fullscreen Counter Display Modal (Airport / Hotel Check-in Card) */}
      {counterCard && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setCounterCard(null)}
        >
          <div
            className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-700 p-6 sm:p-8 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                  {counterCard.provider ||
                    (isZh
                      ? BOOKING_CATEGORIES.find((c) => c.key === counterCard.category)?.labelZh
                      : BOOKING_CATEGORIES.find((c) => c.key === counterCard.category)?.labelEn)}
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {counterCard.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCounterCard(null)}
                className="w-11 h-11 rounded-full bg-[#FAF9F6] dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-800 text-center space-y-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                {isZh ? '訂位確認編號 · BOOKING REFERENCE' : 'BOOKING REFERENCE'}
              </span>
              <div className="font-mono tabular-nums font-black text-2xl sm:text-3xl tracking-widest text-slate-900 dark:text-white break-all select-all">
                {counterCard.bookingCode}
              </div>
              {counterCard.secondaryCode && (
                <div className="font-mono tabular-nums text-sm font-bold text-teal-700 dark:text-teal-400 pt-1">
                  {counterCard.secondaryCode}
                </div>
              )}
            </div>

            {(counterCard.dateLabel || counterCard.location || counterCard.notes) && (
              <div className="space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 border-t border-[#E5E2DC] dark:border-slate-800 pt-4">
                {counterCard.dateLabel && (
                  <div className="font-mono tabular-nums flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                    <span>{counterCard.dateLabel}</span>
                  </div>
                )}
                {counterCard.location && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                    <span>{counterCard.location}</span>
                  </div>
                )}
                {counterCard.notes && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 pt-1 leading-relaxed">
                    {counterCard.notes}
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => handleCopy(counterCard.bookingCode, 'counter-modal-copy')}
              className="w-full min-h-[48px] rounded-2xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition active:scale-[0.99] cursor-pointer"
            >
              {copiedKey === 'counter-modal-copy' ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>{isZh ? '已複製訂位編號' : 'Booking Code Copied'}</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>{isZh ? '一鍵複製訂位編號' : 'Copy Booking Code'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
