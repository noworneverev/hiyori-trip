import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Trip, BookingVoucher, BookingCategory, ItineraryItem } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { copyTextToClipboard } from '../../utils/clipboard';
import { sanitizeExternalUrl } from '../../utils/url';
import { compressImageFile, storeImageAsMediaRef, garbageCollectOrphanedMedia, isMediaRef, extractMediaId } from '../../utils/image';
import { idbDeleteMedia } from '../../utils/indexedDb';
import { normalizeDateKey } from '../../utils/date';
import { generateQrSvgPath } from '../../utils/qrCode';
import { getStoredTrips } from '../../utils/storage';
import { MediaImage } from '../UI/MediaImage';
import {
  IosModalSheet,
  IosNavBar,
  IosInsetGroup,
  IosDisclosureRow,
  IosCheckmarkRow,
  IosActionSheet,
} from '../UI/IosPrimitives';
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
  QrCode,
  Upload,
  Loader2,
} from 'lucide-react';

interface BookingVaultViewProps {
  trip: Trip;
  lang: Language;
  canEdit?: boolean;
  onUpdateTrip: (updatedTrip: Trip) => void;
  requireAuth?: (action: () => void, reason?: string) => boolean;
  onJumpToDay?: (dayNumber: number) => void;
  hideInlineAddButton?: boolean;
  externalAddTrigger?: number;
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

export function isPlaceholderBookingCode(code?: string): boolean {
  const trimmed = (code || '').trim();
  if (!trimmed) return true;
  return /(待填|待補|待兌換|待確認|待預約|待綁定|待購買|待領取|待開通|未填|未定|尚未|預定後|預約後|TBD|TBA|PENDING|N\/A|PLACEHOLDER)/i.test(
    trimmed
  );
}

function mapItineraryCategoryToBooking(cat: ItineraryItem['category']): BookingCategory {
  if (cat === 'hotel') return 'hotel';
  if (cat === 'transport') return 'rail';
  if (cat === 'spot' || cat === 'activity') return 'ticket';
  return 'other';
}

export const BookingVaultView: React.FC<BookingVaultViewProps> = ({
  trip,
  lang,
  canEdit = true,
  onUpdateTrip,
  requireAuth,
  onJumpToDay,
  hideInlineAddButton = false,
  externalAddTrigger = 0,
}) => {
  const isZh = lang === 'zh' || lang === 'zh-CN';
  const lastExternalTriggerRef = useRef(externalAddTrigger);
  const [filterCat, setFilterCat] = useState<'all' | BookingCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingVoucherId, setEditingVoucherId] = useState<string | null>(null);
  const [pendingDeleteVoucher, setPendingDeleteVoucher] = useState<BookingVoucher | null>(null);
  const [expandedFormPicker, setExpandedFormPicker] = useState<'category' | 'day' | null>(null);
  const [counterCard, setCounterCard] = useState<{
    voucher?: BookingVoucher;
    title: string;
    category: BookingCategory;
    bookingCode: string;
    secondaryCode?: string;
    provider?: string;
    dateLabel?: string;
    location?: string;
    notes?: string;
    voucherImages?: string[];
  } | null>(null);

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
  const [formVoucherImages, setFormVoucherImages] = useState<string[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [voucherImageError, setVoucherImageError] = useState<string | null>(null);
  const [showGeneratedQrInCounter, setShowGeneratedQrInCounter] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialFormImagesRef = useRef<string[]>([]);
  const formImagesRef = useRef<string[]>([]);
  formImagesRef.current = formVoucherImages;

  // Keep screen awake while showing a boarding pass / voucher at airport or hotel counters
  useEffect(() => {
    if (!counterCard) {
      setShowGeneratedQrInCounter(false);
      return;
    }
    let sentinel: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const requestWakeLock = async () => {
      try {
        const wl = (navigator as any)?.wakeLock;
        if (!wl || typeof wl.request !== 'function' || cancelled) return;
        sentinel = await wl.request('screen');
      } catch {
        // Ignore unsupported or battery-saver denial
      }
    };
    requestWakeLock();
    const onVis = () => {
      if (document.visibilityState === 'visible' && !cancelled) requestWakeLock();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      sentinel?.release().catch(() => {});
    };
  }, [counterCard]);

  const counterCodeIsPlaceholder = useMemo(
    () => isPlaceholderBookingCode(counterCard?.bookingCode),
    [counterCard?.bookingCode]
  );

  const counterQr = useMemo(() => {
    if (!counterCard?.bookingCode || counterCodeIsPlaceholder) return null;
    const trimmed = counterCard.bookingCode.trim();
    if (!trimmed || trimmed.length > 180) return null;
    return generateQrSvgPath(trimmed);
  }, [counterCard?.bookingCode, counterCodeIsPlaceholder]);

  const cleanupUnsavedVoucherImages = () => {
    formImagesRef.current.forEach((ref) => {
      if (isMediaRef(ref) && !initialFormImagesRef.current.includes(ref)) {
        const mid = extractMediaId(ref);
        if (mid) idbDeleteMedia(mid).catch(() => {});
      }
    });
  };

  const closeFormWithCleanup = () => {
    cleanupUnsavedVoucherImages();
    setShowForm(false);
    resetForm();
  };

  const resetForm = () => {
    setEditingVoucherId(null);
    setFormCat('flight');
    setFormTitle('');
    setFormCode('');
    setFormSecondary('');
    setFormProvider('');
    // Leave startDate empty by default so whole-trip vouchers (eSIM, insurance) don't falsely pin to Day 1
    setFormStartDate('');
    setFormEndDate('');
    setFormTimeLabel('');
    setFormLocation('');
    setFormDayNumber('');
    setFormUrl('');
    setFormNotes('');
    setFormVoucherImages([]);
    setVoucherImageError(null);
    initialFormImagesRef.current = [];
    setExpandedFormPicker(null);
  };

  const openCreateForm = () => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(openCreateForm, isZh ? '新增訂位憑證' : 'Add booking voucher')) {
      return;
    }
    resetForm();
    setShowForm(true);
  };

  useEffect(() => {
    if (externalAddTrigger > 0 && externalAddTrigger !== lastExternalTriggerRef.current) {
      lastExternalTriggerRef.current = externalAddTrigger;
      openCreateForm();
    }
  }, [externalAddTrigger]);

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
    setFormVoucherImages(v.voucherImages || []);
    initialFormImagesRef.current = v.voucherImages || [];
    setVoucherImageError(null);
    setShowForm(true);
  };

  const handleUploadVoucherImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const remainingSlots = Math.max(0, 4 - formVoucherImages.length);
    if (remainingSlots === 0) {
      e.target.value = '';
      return;
    }

    setIsUploadingImage(true);
    setVoucherImageError(null);
    try {
      const selected = Array.from(files).slice(0, remainingSlots);
      const uploadedRefs: string[] = [];
      let failed = 0;
      for (const file of selected) {
        try {
          // Keep QR codes sharp at 1280px max width and 0.85 quality
          const dataUrl = await compressImageFile(file, 1280, 0.85);
          const ref = await storeImageAsMediaRef(trip.id, dataUrl);
          uploadedRefs.push(ref);
        } catch (err) {
          console.warn('Voucher image compression failed:', err);
          failed += 1;
        }
      }
      if (uploadedRefs.length > 0) {
        setFormVoucherImages((prev) => [...prev, ...uploadedRefs].slice(0, 4));
      }
      if (failed > 0) {
        setVoucherImageError(
          isZh
            ? `有 ${failed} 張圖片無法解碼或儲存，請確認格式為 JPG / PNG / WebP 後重試。`
            : `${failed} image(s) failed to process. Please retry with JPG / PNG.`
        );
      }
    } finally {
      setIsUploadingImage(false);
      e.target.value = '';
    }
  };

  const performSaveVoucher = () => {
    if (!canEdit || !formTitle.trim() || !formCode.trim()) return;
    if (requireAuth && !requireAuth(performSaveVoucher, isZh ? '儲存訂位憑證' : 'Save booking voucher')) {
      return;
    }

    const parsedDay = formDayNumber ? parseInt(formDayNumber, 10) : undefined;
    const now = Date.now();
    const existingList = trip.bookings || [];
    const rawUrl = formUrl.trim();
    const normalizedUrl = rawUrl
      ? sanitizeExternalUrl(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`)
      : undefined;

    const cleanStart = formStartDate.trim().slice(0, 30) || undefined;
    let cleanEnd = formEndDate.trim().slice(0, 30) || undefined;
    if (cleanStart && cleanEnd && cleanEnd < cleanStart) {
      cleanEnd = cleanStart;
    }

    const cleanImages = formVoucherImages.length > 0 ? formVoucherImages : undefined;

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
              startDate: cleanStart,
              endDate: cleanEnd,
              timeLabel: formTimeLabel.trim().slice(0, 40) || undefined,
              location: formLocation.trim().slice(0, 200) || undefined,
              dayNumber: parsedDay && !isNaN(parsedDay) ? parsedDay : undefined,
              url: normalizedUrl?.slice(0, 500),
              notes: formNotes.trim().slice(0, 500) || undefined,
              voucherImages: cleanImages,
              updatedAt: now,
            }
          : b
      );
      const updatedTrip: Trip = { ...trip, bookings: updated, updatedAt: now };
      onUpdateTrip(updatedTrip);
      const removedOldImages = initialFormImagesRef.current.some((ref) => !formVoucherImages.includes(ref));
      if (removedOldImages) {
        garbageCollectOrphanedMedia(
          getStoredTrips().map((stored) => (stored.id === updatedTrip.id ? updatedTrip : stored))
        ).catch(() => {});
      }
    } else {
      const newVoucher: BookingVoucher = {
        id: `bk-${now}-${Math.random().toString(36).slice(2, 6)}`,
        category: formCat,
        title: formTitle.trim().slice(0, 120),
        bookingCode: formCode.trim().slice(0, 100),
        secondaryCode: formSecondary.trim().slice(0, 100) || undefined,
        provider: formProvider.trim().slice(0, 100) || undefined,
        startDate: cleanStart,
        endDate: cleanEnd,
        timeLabel: formTimeLabel.trim().slice(0, 40) || undefined,
        location: formLocation.trim().slice(0, 200) || undefined,
        dayNumber: parsedDay && !isNaN(parsedDay) ? parsedDay : undefined,
        url: normalizedUrl?.slice(0, 500),
        notes: formNotes.trim().slice(0, 500) || undefined,
        voucherImages: cleanImages,
        createdAt: now,
        updatedAt: now,
      };
      onUpdateTrip({ ...trip, bookings: [newVoucher, ...existingList], updatedAt: now });
    }

    setShowForm(false);
    resetForm();
  };

  const handleSaveVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    performSaveVoucher();
  };

  const handleDeleteVoucher = (id: string) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleDeleteVoucher(id), isZh ? '刪除訂位憑證' : 'Delete booking voucher')) {
      return;
    }
    const now = Date.now();
    const updatedTrip: Trip = {
      ...trip,
      bookings: (trip.bookings || []).filter((b) => b.id !== id),
      deletedItemIds: {
        ...(trip.deletedItemIds || {}),
        [id]: now,
      },
      updatedAt: now,
    };
    onUpdateTrip(updatedTrip);
    setPendingDeleteVoucher(null);
    garbageCollectOrphanedMedia(
      getStoredTrips().map((stored) => (stored.id === updatedTrip.id ? updatedTrip : stored))
    ).catch(() => {});
  };

  const handleCopy = async (value: string, keyId: string) => {
    const ok = await copyTextToClipboard(value);
    if (ok) {
      setCopiedKey(keyId);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === keyId ? null : prev));
      }, 1800);
    }
  };

  // Merge standalone bookings + auto-extracted itinerary items (deduplicated by code + sorted chronologically)
  const unifiedEntries = useMemo<UnifiedBookingEntry[]>(() => {
    const list: UnifiedBookingEntry[] = [];
    const seenVoucherCodes = new Set<string>();

    (trip.bookings || []).forEach((voucher) => {
      const normCode = (voucher.bookingCode || '').trim().toUpperCase();
      if (normCode) seenVoucherCodes.add(normCode);
      list.push({ source: 'voucher', voucher });
    });

    const seenItinCodes = new Set<string>();
    (trip.days || []).forEach((day) => {
      (day.items || []).forEach((item) => {
        const trimmed = (item.bookingCode || '').trim();
        const normCode = trimmed.toUpperCase();
        if (trimmed && !seenVoucherCodes.has(normCode) && !seenItinCodes.has(normCode)) {
          seenItinCodes.add(normCode);
          list.push({
            source: 'itinerary',
            id: `itin-${day.dayNumber}-${item.id}`,
            category: mapItineraryCategoryToBooking(item.category),
            title: item.title,
            bookingCode: trimmed,
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

    const getSortTuple = (entry: UnifiedBookingEntry): [number, string, number, string] => {
      if (entry.source === 'voucher') {
        const dKey = normalizeDateKey(entry.voucher.startDate) || '';
        const dayNum = entry.voucher.dayNumber ?? 0;
        const isWholeTrip = !dKey && !dayNum;
        return [isWholeTrip ? 0 : 1, dKey || '9999-12-31', dayNum || 999, entry.voucher.timeLabel || ''];
      }
      return [1, normalizeDateKey(entry.date) || '9999-12-31', entry.dayNumber || 999, entry.timeLabel || ''];
    };

    list.sort((a, b) => {
      const ta = getSortTuple(a);
      const tb = getSortTuple(b);
      if (ta[0] !== tb[0]) return ta[0] - tb[0];
      if (ta[1] !== tb[1]) return ta[1].localeCompare(tb[1]);
      if (ta[2] !== tb[2]) return ta[2] - tb[2];
      return ta[3].localeCompare(tb[3]);
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

  const pendingPlaceholderCount = useMemo(() => {
    return unifiedEntries.filter((e) => {
      const code = e.source === 'voucher' ? e.voucher.bookingCode : e.bookingCode;
      return isPlaceholderBookingCode(code);
    }).length;
  }, [unifiedEntries]);

  return (
    <div className="space-y-5 pb-24 sm:pb-12">
      {/* Header & Toolbar Card */}
      <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5E2DC] dark:border-slate-800">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2 flex-wrap">
              <Ticket className="w-5 h-5 text-teal-700 dark:text-teal-400" />
              <span className="tabular-nums">
                {isZh ? `訂位憑證夾 (${unifiedEntries.length})` : `Booking Vault (${unifiedEntries.length})`}
              </span>
              {pendingPlaceholderCount > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/70">
                  {isZh ? `${pendingPlaceholderCount} 筆待補確認碼` : `${pendingPlaceholderCount} code(s) pending`}
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {isZh
                ? '集中管理機票、訂房、QR Code 憑證截圖與網卡代號，離線即可放大出示給櫃檯人員掃描。'
                : 'Centralize PNRs, hotel confirmations, and offline QR screenshots for counter display.'}
            </p>
          </div>

          {canEdit && !hideInlineAddButton && (
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
              className="w-full min-h-[42px] sm:min-h-[38px] pl-8 pr-8 py-1.5 rounded-xl bg-[#FAF9F6] dark:bg-slate-900 border border-[#E5E2DC] dark:border-slate-700 text-[16px] sm:text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-teal-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Voucher iOS Sheet */}
      {showForm && (
        <IosModalSheet
          onClose={closeFormWithCleanup}
          variant="grouped"
          maxWidthClass="sm:max-w-lg"
          zIndexClass="z-[75]"
          ariaLabel={editingVoucherId ? '編輯訂位憑證' : '新增訂位憑證'}
        >
          <IosNavBar
            title={
              editingVoucherId
                ? isZh ? '編輯訂位憑證' : 'Edit Voucher'
                : isZh ? '新增訂位憑證' : 'New Voucher'
            }
            leftLabel={isZh ? '取消' : 'Cancel'}
            onLeftClick={closeFormWithCleanup}
            rightLabel={editingVoucherId ? (isZh ? '儲存' : 'Save') : isZh ? '加入' : 'Add'}
            rightType="submit"
            rightFormId="booking-voucher-form"
            rightDisabled={!formTitle.trim() || !formCode.trim() || isUploadingImage}
          />

          <form
            id="booking-voucher-form"
            onSubmit={handleSaveVoucher}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
          >
            <IosInsetGroup header={isZh ? '憑證類別與核心代號' : 'Voucher Details'}>
              <IosDisclosureRow
                label={isZh ? '憑證類別' : 'Category'}
                value={(() => {
                  const found = BOOKING_CATEGORIES.find((c) => c.key === formCat);
                  return found ? (isZh ? found.labelZh : found.labelEn) : formCat;
                })()}
                valueAccent
                expanded={expandedFormPicker === 'category'}
                onToggle={() =>
                  setExpandedFormPicker((prev) => (prev === 'category' ? null : 'category'))
                }
              >
                <div className="divide-y divide-[#E5E2DC]/60 dark:divide-slate-800/70">
                  {BOOKING_CATEGORIES.map((c) => {
                    const Icon = c.icon;
                    return (
                      <IosCheckmarkRow
                        key={c.key}
                        icon={<Icon className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
                        label={isZh ? c.labelZh : c.labelEn}
                        selected={formCat === c.key}
                        onSelect={() => {
                          setFormCat(c.key);
                          setExpandedFormPicker(null);
                        }}
                      />
                    );
                  })}
                </div>
              </IosDisclosureRow>

              <div className="px-4 py-2.5 flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {isZh ? '憑證標題 *' : 'Title *'}
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={isZh ? '如：長榮 BR198 台北→東京、金澤日航飯店' : 'e.g., EVA Air BR198, Hotel Nikko'}
                  className="w-full min-h-[36px] bg-transparent text-[16px] sm:text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                />
              </div>

              <div className="px-4 py-2.5 flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {isZh ? '訂位代號 / 確認碼 *' : 'Booking Reference / PNR *'}
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder={isZh ? '如：XYZ89K / AGD-992018' : 'e.g., XYZ89K / CONF-992018'}
                  className="w-full min-h-[36px] bg-transparent text-[16px] sm:text-xs font-mono font-bold tracking-wide text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                />
              </div>

              <div className="px-4 py-2.5 flex items-center justify-between gap-3 min-h-[48px]">
                <span className="text-sm sm:text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                  {isZh ? '座位 / PIN 碼' : 'Seat / PIN'}
                </span>
                <input
                  type="text"
                  maxLength={100}
                  value={formSecondary}
                  onChange={(e) => setFormSecondary(e.target.value)}
                  placeholder={isZh ? '如：T2 · 14A' : 'Optional'}
                  className="flex-1 min-w-0 bg-transparent text-right text-[16px] sm:text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                />
              </div>

              <div className="px-4 py-2.5 flex items-center justify-between gap-3 min-h-[48px]">
                <span className="text-sm sm:text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                  {isZh ? '業者 / 平台' : 'Provider'}
                </span>
                <input
                  type="text"
                  maxLength={100}
                  value={formProvider}
                  onChange={(e) => setFormProvider(e.target.value)}
                  placeholder={isZh ? '如：Agoda、長榮航空' : 'Optional'}
                  className="flex-1 min-w-0 bg-transparent text-right text-[16px] sm:text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                />
              </div>
            </IosInsetGroup>

            {/* Offline QR Code / Voucher Screenshot Attachment */}
            <IosInsetGroup
              header={isZh ? '離線 QR Code / 憑證截圖（最多 4 張）' : 'Offline QR / Voucher Screenshots (Max 4)'}
              footer={isZh ? '上傳的登機證、門票 QR Code 或訂房確認截圖會儲存在本機，搭機無網路時也可全螢幕放大出示。' : 'Saved offline for airport & hotel check-in without mobile data.'}
            >
              <div className="p-4 space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUploadVoucherImages}
                  className="hidden"
                />
                {formVoucherImages.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {formVoucherImages.map((imgRef, idx) => (
                      <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-[#E5E2DC] dark:border-slate-700 bg-slate-100 dark:bg-slate-900">
                        <MediaImage
                          tripId={trip.id}
                          ownerId={trip.ownerId}
                          collabId={trip.collabId}
                          src={imgRef}
                          alt={`Voucher ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (isMediaRef(imgRef) && !initialFormImagesRef.current.includes(imgRef)) {
                              const mid = extractMediaId(imgRef);
                              if (mid) idbDeleteMedia(mid).catch(() => {});
                            }
                            setFormVoucherImages((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/75 text-white flex items-center justify-center cursor-pointer"
                          aria-label="移除圖片"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {voucherImageError && (
                  <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                    {voucherImageError}
                  </p>
                )}

                {formVoucherImages.length < 4 && (
                  <button
                    type="button"
                    disabled={isUploadingImage}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full min-h-[44px] rounded-xl border-2 border-dashed border-[#E5E2DC] dark:border-slate-700 hover:border-teal-600 text-slate-600 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-300 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingImage ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                        <span>{isZh ? '處理圖片中...' : 'Processing...'}</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                        <span>{isZh ? '選擇 QR Code / 憑證截圖' : 'Attach QR / Screenshot'}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </IosInsetGroup>

            <IosInsetGroup header={isZh ? '日期、時段與行程天數' : 'Dates & Trip Day'}>
              <IosDisclosureRow
                label={isZh ? '關聯天數' : 'Trip Day'}
                value={
                  formDayNumber
                    ? `Day ${formDayNumber}`
                    : isZh ? '全程 / 不指定' : 'Whole trip'
                }
                valueAccent={Boolean(formDayNumber)}
                expanded={expandedFormPicker === 'day'}
                onToggle={() =>
                  setExpandedFormPicker((prev) => (prev === 'day' ? null : 'day'))
                }
              >
                <div className="divide-y divide-[#E5E2DC]/60 dark:divide-slate-800/70 max-h-56 overflow-y-auto">
                  <IosCheckmarkRow
                    label={isZh ? '全程 / 不指定' : 'Whole trip'}
                    selected={!formDayNumber}
                    onSelect={() => {
                      setFormDayNumber('');
                      setExpandedFormPicker(null);
                    }}
                  />
                  {(trip.days || []).map((d) => (
                    <IosCheckmarkRow
                      key={d.id}
                      label={`Day ${d.dayNumber}`}
                      subtitle={d.theme}
                      trailingMeta={
                        <span className="text-[11px] font-mono tabular-nums text-slate-400">{d.date}</span>
                      }
                      selected={formDayNumber === String(d.dayNumber)}
                      onSelect={() => {
                        setFormDayNumber(String(d.dayNumber));
                        setExpandedFormPicker(null);
                      }}
                    />
                  ))}
                </div>
              </IosDisclosureRow>

              <div className="px-4 py-2.5 flex items-center justify-between gap-3 min-h-[48px]">
                <span className="text-sm sm:text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                  {isZh ? '開始日期' : 'Start Date'}
                </span>
                <input
                  type="date"
                  value={formStartDate}
                  onChange={(e) => {
                    const nextStart = e.target.value;
                    setFormStartDate(nextStart);
                    if (formEndDate && nextStart && formEndDate < nextStart) {
                      setFormEndDate(nextStart);
                    }
                  }}
                  className="bg-transparent text-right text-[16px] sm:text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div className="px-4 py-2.5 flex items-center justify-between gap-3 min-h-[48px]">
                <span className="text-sm sm:text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                  {isZh ? '結束 / 退房日' : 'End Date'}
                </span>
                <input
                  type="date"
                  min={formStartDate || undefined}
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                  className="bg-transparent text-right text-[16px] sm:text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div className="px-4 py-2.5 flex items-center justify-between gap-3 min-h-[48px]">
                <span className="text-sm sm:text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                  {isZh ? '班次 / 時段' : 'Time Label'}
                </span>
                <input
                  type="text"
                  maxLength={40}
                  value={formTimeLabel}
                  onChange={(e) => setFormTimeLabel(e.target.value)}
                  placeholder={isZh ? '如：10:15 起飛' : 'e.g., 10:15'}
                  className="flex-1 min-w-0 bg-transparent text-right text-[16px] sm:text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                />
              </div>
            </IosInsetGroup>

            <IosInsetGroup header={isZh ? '地點、電子連結與備註' : 'Location, URL & Notes'}>
              <div className="px-4 py-2.5 flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {isZh ? '機場 / 車站 / 飯店地址' : 'Address / Terminal'}
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder={isZh ? '方便現場一鍵複製地址給計程車或導航' : 'Address or terminal location'}
                  className="w-full min-h-[34px] bg-transparent text-[16px] sm:text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                />
              </div>

              <div className="px-4 py-2.5 flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {isZh ? '電子憑證 / 訂單連結 (選填)' : 'Booking URL (Optional)'}
                </label>
                {/* type="text" + inputMode="url" allows bare domains (e.g. agoda.com/123) without native validation rejection */}
                <input
                  type="text"
                  inputMode="url"
                  maxLength={500}
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://... 或 agoda.com/..."
                  className="w-full min-h-[34px] bg-transparent text-[16px] sm:text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                />
              </div>

              <div className="px-4 py-2.5 flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {isZh ? '備註' : 'Notes'}
                </label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder={isZh ? '行李額度、取票方式、退改規則等...' : 'Baggage, pickup, policy...'}
                  className="w-full bg-transparent text-[16px] sm:text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none resize-none"
                />
              </div>
            </IosInsetGroup>
          </form>
        </IosModalSheet>
      )}

      {/* Empty State */}
      {filteredEntries.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#FAF9F6] dark:bg-slate-800 border border-[#E5E2DC] dark:border-slate-700 flex items-center justify-center mx-auto text-teal-700 dark:text-teal-400">
            <Ticket className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              {unifiedEntries.length === 0
                ? isZh ? '尚未建立任何訂位憑證' : 'No booking vouchers yet'
                : isZh ? '找不到符合條件的憑證' : 'No matching vouchers found'}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {unifiedEntries.length === 0
                ? isZh
                  ? '新增機票確認碼、飯店憑證或 QR Code 截圖，離線即可放大出示給櫃檯。'
                  : 'Add flights, hotels, QR screenshots, or itinerary booking codes here.'
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
              const dateRangeText = v.startDate
                ? v.endDate && v.endDate !== v.startDate
                  ? `${v.startDate} ~ ${v.endDate}`
                  : v.startDate
                : '';
              const isPendingCode = isPlaceholderBookingCode(v.bookingCode);

              return (
                <div
                  key={v.id}
                  className="rounded-2xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 shadow-2xs flex flex-col justify-between divide-y divide-[#E5E2DC]/75 dark:divide-slate-800 overflow-hidden"
                >
                  <div className="px-4 sm:px-5 pt-4 pb-3.5 space-y-1.5">
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
                        {isPendingCode && (
                          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/70">
                            {isZh ? '待補編號' : 'Pending'}
                          </span>
                        )}
                        {v.voucherImages && v.voucherImages.length > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-0.5 text-teal-700 dark:text-teal-400 font-semibold">
                              <QrCode className="w-3 h-3" />
                              <span>{v.voucherImages.length}</span>
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-0.5 -mr-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setCounterCard({
                              voucher: v,
                              title: v.title,
                              category: v.category,
                              bookingCode: v.bookingCode,
                              secondaryCode: v.secondaryCode,
                              provider: v.provider,
                              dateLabel: [dateRangeText, v.timeLabel].filter(Boolean).join(' · '),
                              location: v.location,
                              notes: v.notes,
                              voucherImages: v.voucherImages,
                            })
                          }
                          title={isZh ? '全螢幕出示給櫃檯' : 'Show fullscreen card'}
                          className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-300 hover:bg-[#FAF9F6] dark:hover:bg-slate-800 transition cursor-pointer"
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditForm(v)}
                              title={isZh ? '編輯憑證' : 'Edit voucher'}
                              className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-[#FAF9F6] dark:hover:bg-slate-800 transition cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteVoucher(v)}
                              title={isZh ? '刪除憑證' : 'Delete voucher'}
                              className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <h4 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                      {v.title}
                    </h4>
                  </div>

                  {/* Flat Hairline Code Band with 1-Tap Copy or Quick Fill */}
                  <div className="px-4 sm:px-5 py-3 bg-[#FAF9F6]/65 dark:bg-slate-900/40 flex items-center justify-between gap-2.5">
                    <div className="min-w-0">
                      <span className="text-[11px] text-slate-400 block">
                        {isZh ? '訂位代號 / 確認碼' : 'Booking Code'}
                      </span>
                      <span
                        className={`font-mono tabular-nums font-bold text-base tracking-wider break-all select-all ${
                          isPendingCode
                            ? 'text-amber-700 dark:text-amber-300'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {v.bookingCode}
                      </span>
                    </div>

                    {isPendingCode && canEdit ? (
                      <button
                        type="button"
                        onClick={() => openEditForm(v)}
                        className="min-h-[42px] sm:min-h-[38px] px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shrink-0 transition active:scale-95 cursor-pointer bg-amber-600 hover:bg-amber-700 text-white shadow-2xs"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>{isZh ? '填入編號' : 'Fill Code'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleCopy(v.bookingCode, copyMainId)}
                        className={`min-h-[42px] sm:min-h-[38px] px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shrink-0 transition active:scale-95 cursor-pointer ${
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
                    )}
                  </div>

                  {/* Attached QR / Voucher Screenshot Preview Strip */}
                  {v.voucherImages && v.voucherImages.length > 0 && (
                    <div className="px-4 sm:px-5 py-2.5 flex items-center gap-2 overflow-x-auto scrollbar-none">
                      {v.voucherImages.map((imgRef, idx) => (
                        <button
                          key={idx}
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
                              voucherImages: v.voucherImages,
                            })
                          }
                          className="w-14 h-14 rounded-xl overflow-hidden border border-[#E5E2DC] dark:border-slate-700 shrink-0 hover:scale-105 transition cursor-pointer"
                          title="點擊全螢幕出示截圖 / QR Code"
                        >
                          <MediaImage
                            tripId={trip.id}
                            ownerId={trip.ownerId}
                            collabId={trip.collabId}
                            src={imgRef}
                            alt={`Voucher ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                      <span className="text-[11px] text-teal-700 dark:text-teal-400 font-semibold ml-1 shrink-0">
                        點圖放大出示 →
                      </span>
                    </div>
                  )}

                  {/* Secondary Details */}
                  {(v.secondaryCode || dateRangeText || v.timeLabel || v.location || v.notes) && (
                    <div className="px-4 sm:px-5 py-3 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                      {v.secondaryCode && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200 font-mono tabular-nums truncate">
                            <KeyRound className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
                            <span className="truncate">{v.secondaryCode}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(v.secondaryCode!, copySecId)}
                            className="min-h-[34px] px-2 rounded-lg text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 shrink-0 cursor-pointer flex items-center gap-1"
                          >
                            {copiedKey === copySecId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedKey === copySecId ? (isZh ? '已複製' : 'Copied') : isZh ? '複製細節' : 'Copy'}</span>
                          </button>
                        </div>
                      )}

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
                            className="min-h-[34px] px-2 text-[11px] font-semibold text-slate-500 hover:text-teal-700 shrink-0 cursor-pointer"
                          >
                            {copiedKey === copyLocId ? (isZh ? '已複製' : 'Copied') : isZh ? '複製地址' : 'Copy'}
                          </button>
                        </div>
                      )}

                      {v.notes && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
                          {v.notes}
                        </p>
                      )}
                    </div>
                  )}

                  {(v.url || (v.dayNumber && onJumpToDay)) && (
                    <div className="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-2 text-xs">
                      {v.dayNumber && onJumpToDay ? (
                        <button
                          type="button"
                          onClick={() => onJumpToDay(v.dayNumber!)}
                          className="min-h-[36px] font-semibold text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>{isZh ? `前往 Day ${v.dayNumber} 行程` : `Go to Day ${v.dayNumber}`}</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span />
                      )}
                      {(() => {
                        const safeUrl = sanitizeExternalUrl(v.url);
                        return safeUrl ? (
                          <a
                            href={safeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[36px] font-semibold text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1"
                          >
                            <span>{isZh ? '開啟電子憑證' : 'Open Link'}</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        ) : null;
                      })()}
                    </div>
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
                className="rounded-2xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 shadow-2xs flex flex-col justify-between divide-y divide-[#E5E2DC]/75 dark:divide-slate-800 overflow-hidden"
              >
                <div className="px-4 sm:px-5 pt-4 pb-3.5 space-y-1.5">
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
                      className="w-10 h-10 sm:w-9 sm:h-9 -mr-1.5 rounded-lg flex items-center justify-center text-slate-500 hover:text-teal-700 hover:bg-[#FAF9F6] dark:hover:bg-slate-800 transition shrink-0 cursor-pointer"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>

                  <h4 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                    {entry.title}
                  </h4>
                </div>

                <div className="px-4 sm:px-5 py-3 bg-[#FAF9F6]/65 dark:bg-slate-900/40 flex items-center justify-between gap-2.5">
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
                    className={`min-h-[42px] sm:min-h-[38px] px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shrink-0 transition active:scale-95 cursor-pointer ${
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
                  <div className="px-4 sm:px-5 py-2.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{entry.location}</span>
                  </div>
                )}

                {onJumpToDay && (
                  <div className="px-4 sm:px-5 py-2.5 text-xs">
                    <button
                      type="button"
                      onClick={() => onJumpToDay(entry.dayNumber)}
                      className="min-h-[36px] font-semibold text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
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

      {/* Delete Voucher Confirmation iOS Action Sheet */}
      {pendingDeleteVoucher && (
        <IosActionSheet
          title={isZh ? '確定刪除此訂位憑證？' : 'Delete Booking Voucher?'}
          message={pendingDeleteVoucher.title}
          options={[
            {
              label: isZh ? '刪除憑證' : 'Delete Voucher',
              tone: 'destructive',
              onClick: () => handleDeleteVoucher(pendingDeleteVoucher.id),
            },
          ]}
          cancelLabel={isZh ? '取消' : 'Cancel'}
          onClose={() => setPendingDeleteVoucher(null)}
        />
      )}

      {/* Fullscreen Counter Display iOS Sheet (High-Contrast Code + Offline QR / Screenshots) */}
      {counterCard && (
        <IosModalSheet
          onClose={() => setCounterCard(null)}
          variant="surface"
          maxWidthClass="sm:max-w-lg"
          zIndexClass="z-[80]"
          ariaLabel={counterCard.title}
        >
          <IosNavBar
            title={
              counterCard.provider ||
              (isZh
                ? BOOKING_CATEGORIES.find((c) => c.key === counterCard.category)?.labelZh
                : BOOKING_CATEGORIES.find((c) => c.key === counterCard.category)?.labelEn) ||
              (isZh ? '櫃檯出示憑證' : 'Booking Card')
            }
            rightLabel={isZh ? '完成' : 'Done'}
            onRightClick={() => setCounterCard(null)}
          />

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-5 sm:p-6 space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight text-center">
              {counterCard.title}
            </h3>

            <div className="py-5 px-4 rounded-2xl bg-[#FAF9F6] dark:bg-slate-900/80 border border-[#E5E2DC] dark:border-slate-800 text-center space-y-2">
              <span className="text-[11px] font-bold tracking-wider text-slate-400 block">
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

            {/* Full-Width High-Contrast QR / Screenshot Showcase for Counter Scanning */}
            {counterCard.voucherImages && counterCard.voucherImages.length > 0 ? (
              <div className="space-y-3">
                {counterCard.voucherImages.map((imgRef, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl overflow-hidden bg-white p-3 border border-[#E5E2DC] shadow-xs"
                  >
                    <MediaImage
                      tripId={trip.id}
                      ownerId={trip.ownerId}
                      collabId={trip.collabId}
                      src={imgRef}
                      alt={`${counterCard.title} QR ${idx + 1}`}
                      className="w-full max-h-[60vh] object-contain mx-auto rounded-lg"
                    />
                  </div>
                ))}
                {counterQr && (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setShowGeneratedQrInCounter((v) => !v)}
                      className="min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>
                        {showGeneratedQrInCounter
                          ? isZh ? '隱藏訂位代號 QR Code' : 'Hide Generated QR'
                          : isZh ? '同時顯示訂位代號 QR Code' : 'Show Code as QR'}
                      </span>
                    </button>
                    {showGeneratedQrInCounter && (
                      <div className="mt-2 inline-flex flex-col items-center p-4 rounded-2xl bg-white border border-[#E5E2DC] shadow-xs">
                        <svg
                          viewBox={`0 0 ${counterQr.size} ${counterQr.size}`}
                          className="w-44 h-44"
                          shapeRendering="crispEdges"
                          aria-label={counterCard.bookingCode}
                        >
                          <rect width={counterQr.size} height={counterQr.size} fill="#FFFFFF" />
                          <path d={counterQr.path} fill="#0F172A" />
                        </svg>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : counterQr ? (
              <div className="flex flex-col items-center py-4 px-5 rounded-2xl bg-white border border-[#E5E2DC] shadow-xs space-y-2">
                <svg
                  viewBox={`0 0 ${counterQr.size} ${counterQr.size}`}
                  className="w-48 h-48 sm:w-52 sm:h-52"
                  shapeRendering="crispEdges"
                  aria-label={counterCard.bookingCode}
                >
                  <rect width={counterQr.size} height={counterQr.size} fill="#FFFFFF" />
                  <path d={counterQr.path} fill="#0F172A" />
                </svg>
                <span className="text-[11px] font-medium text-slate-500">
                  {isZh ? '離線即時產生 · 螢幕已保持常亮供櫃檯掃描' : 'Offline QR · Screen kept awake for scanning'}
                </span>
              </div>
            ) : counterCodeIsPlaceholder ? (
              <div className="flex flex-col items-center text-center py-5 px-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 space-y-2.5">
                <QrCode className="w-7 h-7 text-amber-600 dark:text-amber-400" />
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 leading-relaxed">
                  {isZh
                    ? '尚未填入真實確認碼，已暫停產生 QR Code。完成預訂並補填編號（或上傳憑證截圖）後，即可離線供櫃檯掃描。'
                    : 'Placeholder booking code detected. Fill in your confirmed reference or attach a QR screenshot to display here.'}
                </p>
                {canEdit && counterCard.voucher && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = counterCard.voucher!;
                      setCounterCard(null);
                      openEditForm(target);
                    }}
                    className="min-h-[38px] px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>{isZh ? '立即補填確認碼' : 'Fill Confirmation Code'}</span>
                  </button>
                )}
              </div>
            ) : null}

            {(counterCard.dateLabel || counterCard.location || counterCard.notes) && (
              <IosInsetGroup>
                {counterCard.dateLabel && (
                  <div className="px-4 py-3 flex items-center gap-2.5 text-xs sm:text-sm font-mono tabular-nums text-slate-700 dark:text-slate-200">
                    <Calendar className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                    <span>{counterCard.dateLabel}</span>
                  </div>
                )}
                {counterCard.location && (
                  <div className="px-4 py-3 flex items-start gap-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-200">
                    <MapPin className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                    <span>{counterCard.location}</span>
                  </div>
                )}
                {counterCard.notes && (
                  <div className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {counterCard.notes}
                  </div>
                )}
              </IosInsetGroup>
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
        </IosModalSheet>
      )}
    </div>
  );
};
