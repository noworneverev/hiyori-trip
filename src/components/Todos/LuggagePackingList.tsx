import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Check,
  Info,
  Trash2,
  ChevronDown,
  ChevronUp,
  Luggage,
  Sparkles,
  FileText,
  Smartphone,
  Shirt,
  ShieldCheck,
} from 'lucide-react';
import { Trip, PackingItem, PackingCategory } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { SwipeableActionRow } from '../UI/SwipeableExpenseRow';
import { AutoGrowTitleInput } from './RemindersTodoList';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

interface LuggagePackingListProps {
  trip: Trip;
  lang: Language;
  canEdit?: boolean;
  onUpdateTrip: (updatedTrip: Trip) => void;
  requireAuth?: (action: () => void, reason?: string) => boolean;
}

const PACKING_CATEGORY_MAP: Record<
  PackingCategory,
  { label: string; enLabel: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  documents: { label: '證件與資金', enLabel: 'Docs & Money', Icon: FileText },
  electronics: { label: '電子 3C', enLabel: 'Electronics', Icon: Smartphone },
  clothing: { label: '衣物鞋帽', enLabel: 'Clothing', Icon: Shirt },
  medicine: { label: '個人醫藥', enLabel: 'Medicine', Icon: ShieldCheck },
  toiletries: { label: '衛浴保養', enLabel: 'Toiletries', Icon: Sparkles },
  other: { label: '其他隨身', enLabel: 'Other', Icon: Luggage },
};

const DEFAULT_ESSENTIALS: Array<{ name: string; category: PackingCategory }> = [
  { name: '護照正本（有效期 6 個月以上）', category: 'documents' },
  { name: '機票與住宿憑證截圖', category: 'documents' },
  { name: '海外刷卡信用卡 2 張', category: 'documents' },
  { name: '當地外幣現鈔', category: 'documents' },
  { name: '上網 eSIM 或實體上網卡', category: 'electronics' },
  { name: '行動電源 (隨身攜帶，勿託運)', category: 'electronics' },
  { name: '手機充電線與充電頭', category: 'electronics' },
  { name: '好穿耐走運動鞋', category: 'clothing' },
  { name: '輕便防風外套', category: 'clothing' },
  { name: '個人常備藥品 (腸胃藥、止痛藥)', category: 'medicine' },
  { name: '折疊晴雨兩用傘', category: 'other' },
];

export const LuggagePackingList: React.FC<LuggagePackingListProps> = ({
  trip,
  lang,
  canEdit = true,
  onUpdateTrip,
  requireAuth,
}) => {
  const isZh = lang === 'zh' || lang === 'zh-CN';
  const packingList = trip.packingList || [];

  const [categoryFilter, setCategoryFilter] = useState<PackingCategory | 'all'>('all');
  const [newName, setNewName] = useState('');
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  // iPhone Reminders "(i)" Details Sheet State
  const [detailItem, setDetailItem] = useState<PackingItem | null>(null);
  const [detailName, setDetailName] = useState('');
  const [detailCategory, setDetailCategory] = useState<PackingCategory>('other');

  const newInputRef = useRef<HTMLInputElement | null>(null);

  useBodyScrollLock(Boolean(detailItem));

  useEffect(() => {
    if (!detailItem) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDetailItem(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detailItem]);

  const pendingPacking = useMemo(
    () => packingList.filter((p) => !p.packed),
    [packingList]
  );
  const completedPacking = useMemo(
    () => packingList.filter((p) => p.packed),
    [packingList]
  );

  const displayedPending = useMemo(() => {
    if (categoryFilter === 'all') return pendingPacking;
    return pendingPacking.filter((p) => (p.category || 'other') === categoryFilter);
  }, [pendingPacking, categoryFilter]);

  const progressPercent =
    packingList.length > 0
      ? Math.round((completedPacking.length / packingList.length) * 100)
      : 0;

  const handleTogglePacking = (id: string) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleTogglePacking(id), isZh ? '勾選行李清單' : 'Toggle packing')) {
      return;
    }
    const updated = packingList.map((p) => (p.id === id ? { ...p, packed: !p.packed } : p));
    onUpdateTrip({ ...trip, packingList: updated, updatedAt: Date.now() });
    if (focusedItemId === id) setFocusedItemId(null);
  };

  const handleCommitInlineName = (id: string, nextName: string) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleCommitInlineName(id, nextName), isZh ? '編輯行李物品' : 'Edit packing item')) {
      return;
    }
    const updated = packingList.map((p) => (p.id === id ? { ...p, name: nextName } : p));
    onUpdateTrip({ ...trip, packingList: updated, updatedAt: Date.now() });
  };

  const handleDeletePacking = (id: string) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleDeletePacking(id), isZh ? '刪除行李物品' : 'Delete packing item')) {
      return;
    }
    const updated = packingList.filter((p) => p.id !== id);
    onUpdateTrip({
      ...trip,
      packingList: updated,
      deletedItemIds: { ...(trip.deletedItemIds || {}), [id]: Date.now() },
      updatedAt: Date.now(),
    });
    if (detailItem?.id === id) setDetailItem(null);
    if (focusedItemId === id) setFocusedItemId(null);
  };

  const handleClearCompletedPacking = () => {
    if (!canEdit || completedPacking.length === 0) return;
    if (requireAuth && !requireAuth(handleClearCompletedPacking, isZh ? '清除已打包項目' : 'Clear packed items')) {
      return;
    }
    const now = Date.now();
    const deletedMap = { ...(trip.deletedItemIds || {}) };
    completedPacking.forEach((p) => {
      deletedMap[p.id] = now;
    });
    onUpdateTrip({
      ...trip,
      packingList: pendingPacking,
      deletedItemIds: deletedMap,
      updatedAt: now,
    });
  };

  const commitNewPacking = (keepFocus: boolean) => {
    if (!canEdit) return;
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (requireAuth && !requireAuth(() => commitNewPacking(false), isZh ? '新增行李物品' : 'Add packing item')) {
      return;
    }

    const newItem: PackingItem = {
      id: `pack-${Date.now()}`,
      name: trimmed,
      category: categoryFilter !== 'all' ? categoryFilter : 'other',
      packed: false,
    };
    onUpdateTrip({
      ...trip,
      packingList: [newItem, ...packingList],
      updatedAt: Date.now(),
    });
    setNewName('');
    if (keepFocus) {
      requestAnimationFrame(() => {
        newInputRef.current?.focus({ preventScroll: true });
      });
    }
  };

  const handleLoadRecommendedPacking = () => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(handleLoadRecommendedPacking, isZh ? '載入必備行李' : 'Load default packing')) {
      return;
    }
    const existing = new Set(packingList.map((p) => p.name));
    const additions = DEFAULT_ESSENTIALS.filter((e) => !existing.has(e.name)).map((e, idx) => ({
      id: `pack-add-${Date.now()}-${idx}`,
      name: e.name,
      category: e.category,
      packed: false,
      essential: true,
    }));
    if (additions.length === 0) return;
    onUpdateTrip({ ...trip, packingList: [...packingList, ...additions], updatedAt: Date.now() });
  };

  const openDetailsSheet = (item: PackingItem) => {
    if (!canEdit) return;
    setOpenSwipeId(null);
    setDetailItem(item);
    setDetailName(item.name);
    setDetailCategory(item.category || 'other');
  };

  const handleSaveDetails = () => {
    if (!canEdit || !detailItem) return;
    const trimmedName = detailName.trim() || detailItem.name;
    const doSave = () => {
      const updated = packingList.map((p) =>
        p.id === detailItem.id
          ? { ...p, name: trimmedName, category: detailCategory }
          : p
      );
      onUpdateTrip({ ...trip, packingList: updated, updatedAt: Date.now() });
      setDetailItem(null);
    };
    if (requireAuth && !requireAuth(doSave, isZh ? '更新行李詳情' : 'Update packing item')) {
      return;
    }
    doSave();
  };

  const renderPackingRow = (item: PackingItem, allowSwipe: boolean) => {
    const isFocused = focusedItemId === item.id;
    const catKey: PackingCategory = item.category || 'other';
    const meta = PACKING_CATEGORY_MAP[catKey] || PACKING_CATEGORY_MAP.other;
    const IconComp = meta.Icon;

    const rowInner = (
      <div
        className={`flex items-start gap-1.5 px-3.5 sm:px-5 py-3 transition-colors ${
          isFocused
            ? 'bg-teal-50/35 dark:bg-teal-950/20'
            : 'md:hover:bg-[#FAF9F6] md:dark:hover:bg-slate-900/40'
        }`}
      >
        {/* Left Circular Checkbox (44px hitbox) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleTogglePacking(item.id);
          }}
          className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] -ml-2 -mt-1.5 flex items-center justify-center rounded-full shrink-0 cursor-pointer group/pchk"
          aria-label={item.packed ? '恢復為未打包' : '標記已打包'}
        >
          <span
            className={`w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center transition-all ${
              item.packed
                ? 'bg-teal-700 dark:bg-teal-500 border-teal-700 dark:border-teal-500 text-white'
                : 'border-slate-300 dark:border-slate-600 group-hover/pchk:border-teal-600 dark:group-hover/pchk:border-teal-400'
            }`}
          >
            {item.packed && <Check className="w-3.5 h-3.5 stroke-[2.75]" />}
          </span>
        </button>

        {/* Middle Seamless In-Place Editable Name + Quiet Unboxed Category Subtitle */}
        <div className="flex-1 min-w-0 pt-0.5">
          <AutoGrowTitleInput
            value={item.name}
            disabled={!canEdit}
            completed={item.packed}
            placeholder={isZh ? '物品名稱...' : 'Item name...'}
            onFocusRow={() => {
              setOpenSwipeId(null);
              setFocusedItemId(item.id);
            }}
            onCommit={(nextName) => {
              setFocusedItemId((prev) => (prev === item.id ? null : prev));
              handleCommitInlineName(item.id, nextName);
            }}
          />

          <button
            type="button"
            onClick={() => canEdit && openDetailsSheet(item)}
            className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 hover:text-teal-700 dark:hover:text-teal-400 transition cursor-pointer"
          >
            <IconComp className="w-3 h-3" />
            <span>{isZh ? meta.label : meta.enLabel}</span>
          </button>
        </div>

        {/* Right iPhone-style (i) Details Button */}
        {canEdit && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              openDetailsSheet(item);
            }}
            className={`min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] -mr-2 -mt-1.5 flex items-center justify-center rounded-full transition cursor-pointer shrink-0 ${
              isFocused
                ? 'text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 opacity-100'
                : 'text-slate-400 dark:text-slate-500 hover:text-teal-700 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 opacity-65 sm:opacity-45 hover:opacity-100'
            }`}
            title={isZh ? '詳細資訊與分類' : 'Details & Category'}
            aria-label={isZh ? '詳細資訊與分類' : 'Item details & category'}
          >
            <Info className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>
    );

    if (allowSwipe && canEdit) {
      return (
        <SwipeableActionRow
          key={item.id}
          id={item.id}
          isOpen={openSwipeId === item.id}
          canEdit={canEdit}
          onOpenChange={setOpenSwipeId}
          onDelete={() => handleDeletePacking(item.id)}
          containerClassName="bg-white dark:bg-[#111827]"
        >
          {rowInner}
        </SwipeableActionRow>
      );
    }

    return <div key={item.id}>{rowInner}</div>;
  };

  return (
    <div className="relative pb-24 max-w-3xl mx-auto">
      <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 shadow-2xs overflow-hidden">
        {/* Clean Header Bar */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-[#E5E2DC] dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Luggage className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-tight">
                {isZh ? '行李打包清單' : 'Luggage Packing'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                {completedPacking.length} / {packingList.length} {isZh ? '已打包' : 'Packed'} · {progressPercent}%
              </p>
            </div>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={handleLoadRecommendedPacking}
              className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
              title={isZh ? '加入旅遊常用必備行李範本' : 'Load default packing essentials'}
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
              <span>{isZh ? '載入常用範本' : 'Load Defaults'}</span>
            </button>
          )}
        </div>

        {/* Hairline Progress Bar */}
        {packingList.length > 0 && (
          <div className="w-full bg-[#FAF9F6] dark:bg-slate-900 h-1 overflow-hidden">
            <div
              className="bg-teal-700 dark:bg-teal-500 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Interactive Category Filter Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none px-4 sm:px-5 py-2.5 border-b border-[#E5E2DC] dark:border-slate-800 bg-white dark:bg-[#111827]">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-medium transition shrink-0 cursor-pointer tabular-nums ${
              categoryFilter === 'all'
                ? 'bg-teal-700 dark:bg-teal-600 text-white font-bold shadow-2xs'
                : 'bg-[#FAF9F6] dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-[#E5E2DC] dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            {isZh ? '全部' : 'All'} ({pendingPacking.length})
          </button>

          {(Object.keys(PACKING_CATEGORY_MAP) as PackingCategory[]).map((cat) => {
            const meta = PACKING_CATEGORY_MAP[cat];
            const count = pendingPacking.filter((p) => (p.category || 'other') === cat).length;
            const isSelected = categoryFilter === cat;
            const IconComp = meta.Icon;

            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-medium transition shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-teal-700 dark:bg-teal-600 text-white font-bold shadow-2xs'
                    : 'bg-[#FAF9F6] dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-[#E5E2DC] dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <IconComp className="w-3.5 h-3.5" />
                <span>{isZh ? meta.label : meta.enLabel}</span>
                {count > 0 && (
                  <span className="opacity-80 font-mono tabular-nums text-[11px]">({count})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Borderless iPhone Reminders-style Quick Add Row */}
        {canEdit && (
          <div className="flex items-center gap-1.5 px-3.5 sm:px-5 py-2.5 border-b border-[#E5E2DC]/80 dark:border-slate-800 bg-[#FAF9F6]/60 dark:bg-slate-900/30">
            <div className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] -ml-2 flex items-center justify-center shrink-0">
              <span className="w-[22px] h-[22px] rounded-full bg-teal-700 dark:bg-teal-600 text-white flex items-center justify-center shadow-2xs">
                <Plus className="w-3.5 h-3.5 stroke-[2.75]" />
              </span>
            </div>
            <input
              ref={newInputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  commitNewPacking(true);
                }
              }}
              onBlur={() => commitNewPacking(false)}
              enterKeyHint="done"
              placeholder={
                categoryFilter !== 'all'
                  ? isZh
                    ? `新增至「${PACKING_CATEGORY_MAP[categoryFilter].label}」...`
                    : `Add to ${PACKING_CATEGORY_MAP[categoryFilter].enLabel}...`
                  : isZh
                  ? '新增隨身或託運行李物品...'
                  : 'New Packing Item...'
              }
              aria-label={isZh ? '新增行李物品' : 'New packing item'}
              className="flex-1 min-h-[44px] sm:min-h-[36px] bg-transparent border-0 p-0 text-base sm:text-[15px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-0"
            />
            {newName.trim() && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitNewPacking(true)}
                className="min-h-[36px] px-3 rounded-xl text-xs font-bold text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/50 transition cursor-pointer shrink-0"
              >
                {isZh ? '加入' : 'Add'}
              </button>
            )}
          </div>
        )}

        {/* Pending Packing Items */}
        {displayedPending.length === 0 ? (
          <div className="py-14 text-center px-4">
            <div className="w-11 h-11 rounded-full bg-teal-50 dark:bg-slate-800 text-teal-700 dark:text-teal-400 flex items-center justify-center mx-auto mb-3">
              <Check className="w-5 h-5 stroke-[2.5]" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {packingList.length === 0
                ? isZh ? '尚未建立行李清單' : 'No packing items yet'
                : categoryFilter !== 'all'
                ? isZh ? '此分類已全數打包' : 'All items in this category packed'
                : isZh ? '行李物品已全部打包完畢' : 'Everything is packed'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {isZh
                ? '點選名稱即可無邊框原位編輯，右側 (i) 可切換分類或刪除'
                : 'Tap item name to edit inline, tap (i) to change category'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E5E2DC]/70 dark:divide-slate-800/80">
            {displayedPending.map((item) => renderPackingRow(item, true))}
          </div>
        )}

        {/* Collapsible Packed Section */}
        {completedPacking.length > 0 && (
          <div className="border-t border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6]/70 dark:bg-slate-900/40">
            <div className="px-4 sm:px-5 min-h-[44px] flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowCompleted((v) => !v)}
                className="flex items-center gap-1.5 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer select-none"
              >
                {showCompleted ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                <span className="tabular-nums">
                  {isZh ? `已打包 (${completedPacking.length})` : `Packed (${completedPacking.length})`}
                </span>
              </button>

              {showCompleted && canEdit && (
                <button
                  type="button"
                  onClick={handleClearCompletedPacking}
                  className="min-h-[36px] px-2 text-xs font-semibold text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                >
                  {isZh ? '清除全部' : 'Clear'}
                </button>
              )}
            </div>

            {showCompleted && (
              <div className="divide-y divide-[#E5E2DC]/60 dark:divide-slate-800/60 border-t border-[#E5E2DC]/60 dark:border-slate-800/60 opacity-75">
                {completedPacking.map((item) => renderPackingRow(item, false))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* iPhone Reminders-style "(i)" Details & Category Sheet Modal (Portaled & Scroll-Locked) */}
      {detailItem &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-80 flex items-end sm:items-center justify-center pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:p-4 bg-black/55 backdrop-blur-xs touch-none overscroll-none animate-in fade-in duration-150"
            onClick={() => setDetailItem(null)}
            role="dialog"
            aria-modal="true"
            aria-label={isZh ? '詳細資訊' : 'Details'}
          >
            <div
              className="w-full sm:max-w-md rounded-t-[24px] sm:rounded-3xl bg-[#F2F2F7] dark:bg-[#1C1C1E] border-t sm:border border-[#E5E2DC] dark:border-slate-800 shadow-2xl max-h-full sm:max-h-[85dvh] pb-[env(safe-area-inset-bottom,0px)] sm:pb-0 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* iOS Navigation Bar Header */}
              <div className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-[#2C2C2E]/90 backdrop-blur-md flex items-center justify-between shrink-0 touch-none">
                <button
                  type="button"
                  onClick={() => setDetailItem(null)}
                  className="min-h-[44px] sm:min-h-[36px] px-2 text-base sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  {isZh ? '取消' : 'Cancel'}
                </button>
                <h4 className="font-bold text-base text-slate-900 dark:text-white">
                  {isZh ? '詳細資訊' : 'Details'}
                </h4>
                <button
                  type="button"
                  onClick={handleSaveDetails}
                  className="min-h-[44px] sm:min-h-[36px] px-2 text-base sm:text-sm font-bold text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 cursor-pointer"
                >
                  {isZh ? '完成' : 'Done'}
                </button>
              </div>

              {/* iOS Inset Grouped Sections */}
              <div className="p-4 space-y-4 overflow-y-auto overscroll-contain touch-pan-y flex-1">
                {/* Group 1: Item Name */}
                <div className="rounded-2xl bg-white dark:bg-[#2C2C2E] overflow-hidden shadow-2xs">
                  <div className="px-4 py-2.5">
                    <input
                      type="text"
                      value={detailName}
                      onChange={(e) => setDetailName(e.target.value)}
                      placeholder={isZh ? '物品名稱' : 'Item name'}
                      className="w-full min-h-[38px] bg-transparent text-base sm:text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Group 2: Category Picker (iOS Grouped List) */}
                <div>
                  <div className="px-2 pb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {isZh ? '分類' : 'Category'}
                  </div>
                  <div className="rounded-2xl bg-white dark:bg-[#2C2C2E] divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden shadow-2xs">
                    {(Object.keys(PACKING_CATEGORY_MAP) as PackingCategory[]).map((cat) => {
                      const meta = PACKING_CATEGORY_MAP[cat];
                      const IconComp = meta.Icon;
                      const isSelected = detailCategory === cat;

                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setDetailCategory(cat)}
                          className="w-full min-h-[46px] px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                                isSelected
                                  ? 'bg-teal-700 dark:bg-teal-500 text-white'
                                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              <IconComp className="w-3.5 h-3.5" />
                            </span>
                            <span
                              className={`text-base sm:text-sm ${
                                isSelected
                                  ? 'font-semibold text-teal-700 dark:text-teal-400'
                                  : 'font-normal text-slate-900 dark:text-white'
                              }`}
                            >
                              {isZh ? meta.label : meta.enLabel}
                            </span>
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 text-teal-700 dark:text-teal-400 stroke-[2.75]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Group 3: Explicit Delete Row */}
                <div className="rounded-2xl bg-white dark:bg-[#2C2C2E] overflow-hidden shadow-2xs">
                  <button
                    type="button"
                    onClick={() => handleDeletePacking(detailItem.id)}
                    className="w-full min-h-[48px] px-4 py-3 text-rose-600 dark:text-rose-400 hover:bg-rose-50/70 dark:hover:bg-rose-950/30 font-semibold text-base sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{isZh ? '刪除此物品' : 'Delete Item'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
