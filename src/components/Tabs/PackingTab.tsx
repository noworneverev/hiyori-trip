import React, { useState, useMemo, useEffect } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { Trip, PackingItem, PackingCategory, TodoItem } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import {
  Plus,
  Trash2,
  Check,
  CheckSquare,
  Luggage,
  X,
  Sparkles,
  FileText,
  Smartphone,
  Shirt,
  ShieldCheck,
  Edit2,
} from 'lucide-react';
import { RemindersTodoList } from '../Todos/RemindersTodoList';

interface PackingTabProps {
  trip: Trip;
  lang: Language;
  canEdit?: boolean;
  onUpdateTrip: (updatedTrip: Trip) => void;
  requireAuth?: (action: () => void, reason?: string) => boolean;
}

const PACKING_CATEGORY_MAP: Record<
  PackingCategory,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  documents: { label: '證件與資金', Icon: FileText },
  electronics: { label: '電子 3C', Icon: Smartphone },
  clothing: { label: '衣物鞋帽', Icon: Shirt },
  medicine: { label: '個人醫藥', Icon: ShieldCheck },
  toiletries: { label: '衛浴保養', Icon: Sparkles },
  other: { label: '其他隨身', Icon: Luggage },
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

const DEFAULT_TODOS: TodoItem[] = [
  {
    id: 'todo-def-1',
    title: '確認護照效期大於 6 個月並備妥數位電子截圖',
    category: 'preparation',
    completed: false,
    essential: true,
  },
  {
    id: 'todo-def-2',
    title: '填寫入境審查與海關通關申報 (例如 Visit Japan Web)',
    category: 'preparation',
    completed: false,
    essential: true,
  },
  {
    id: 'todo-def-3',
    title: '開通海外刷卡與跨國提款功能',
    category: 'finance',
    completed: false,
    essential: true,
  },
  {
    id: 'todo-def-4',
    title: '確認抵達目的地之上網卡或漫遊方案',
    category: 'preparation',
    completed: false,
    essential: true,
  },
];

export const PackingTab: React.FC<PackingTabProps> = ({ trip, lang, canEdit = true, onUpdateTrip, requireAuth }) => {
  // Luggage Packing Modal State (Quiet on-demand tool retained from Phase 1 clarification)
  const [isPackingModalOpen, setIsPackingModalOpen] = useState(false);
  useBodyScrollLock(isPackingModalOpen);
  const [packingCategoryFilter, setPackingCategoryFilter] = useState<PackingCategory | 'all'>('all');
  const [inlinePackingTitle, setInlinePackingTitle] = useState('');
  const [editingPackingId, setEditingPackingId] = useState<string | null>(null);
  const [editPackingName, setEditPackingName] = useState('');
  const [editPackingCategory, setEditPackingCategory] = useState<PackingCategory>('other');

  useEffect(() => {
    if (!isPackingModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPackingModalOpen(false);
        setEditingPackingId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPackingModalOpen]);

  const todos = trip.todos || [];
  const packingList = trip.packingList || [];

  const completedTodos = useMemo(() => todos.filter((t) => t.completed), [todos]);

  const pendingPacking = useMemo(() => packingList.filter((p) => !p.packed), [packingList]);
  const completedPacking = useMemo(() => packingList.filter((p) => p.packed), [packingList]);

  const progressPercent = todos.length > 0
    ? Math.round((completedTodos.length / todos.length) * 100)
    : 0;

  const displayedPacking = useMemo(() => {
    let list = pendingPacking;
    if (packingCategoryFilter !== 'all') {
      list = list.filter((p) => p.category === packingCategoryFilter);
    }
    return list;
  }, [pendingPacking, packingCategoryFilter]);

  const handleLoadRecommendedTodos = () => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(handleLoadRecommendedTodos, lang === 'zh' ? '載入建議清單' : 'Load default checklist')) {
      return;
    }
    const existing = new Set(todos.map((t) => t.title));
    const additions = DEFAULT_TODOS.filter((t) => !existing.has(t.title)).map((t, idx) => ({
      ...t,
      id: `todo-rec-${Date.now()}-${idx}`,
    }));
    if (additions.length === 0) return;
    onUpdateTrip({ ...trip, todos: [...todos, ...additions], updatedAt: Date.now() });
  };

  // Packing Modal Handlers
  const handleTogglePacking = (id: string) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleTogglePacking(id), lang === 'zh' ? '勾選行李清單' : 'Toggle packing')) {
      return;
    }
    const updated = packingList.map((p) => (p.id === id ? { ...p, packed: !p.packed } : p));
    onUpdateTrip({ ...trip, packingList: updated, updatedAt: Date.now() });
  };

  const handleDeletePacking = (id: string) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => handleDeletePacking(id), lang === 'zh' ? '刪除行李物品' : 'Delete packing item')) {
      return;
    }
    const updated = packingList.filter((p) => p.id !== id);
    onUpdateTrip({
      ...trip,
      packingList: updated,
      deletedItemIds: { ...(trip.deletedItemIds || {}), [id]: Date.now() },
      updatedAt: Date.now(),
    });
    if (editingPackingId === id) setEditingPackingId(null);
  };

  const startEditPacking = (item: PackingItem) => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(() => startEditPacking(item), lang === 'zh' ? '編輯行李物品' : 'Edit packing item')) {
      return;
    }
    setEditingPackingId(item.id);
    setEditPackingName(item.name);
    setEditPackingCategory(item.category || 'other');
  };

  const saveEditPacking = () => {
    if (!canEdit || !editingPackingId) return;
    const trimmed = editPackingName.trim();
    if (!trimmed) return;
    if (requireAuth && !requireAuth(saveEditPacking, lang === 'zh' ? '儲存行李物品' : 'Save packing item')) {
      return;
    }
    const updated = packingList.map((p) =>
      p.id === editingPackingId
        ? { ...p, name: trimmed, category: editPackingCategory }
        : p
    );
    onUpdateTrip({ ...trip, packingList: updated, updatedAt: Date.now() });
    setEditingPackingId(null);
  };

  const performInlineAddPacking = () => {
    if (!canEdit) return;
    const text = inlinePackingTitle.trim();
    if (!text) return;
    if (requireAuth && !requireAuth(performInlineAddPacking, lang === 'zh' ? '新增行李物品' : 'Add packing item')) {
      return;
    }

    const newPack: PackingItem = {
      id: `pack-${Date.now()}`,
      name: text,
      category: packingCategoryFilter !== 'all' ? packingCategoryFilter : 'other',
      packed: false,
    };
    onUpdateTrip({ ...trip, packingList: [newPack, ...packingList], updatedAt: Date.now() });
    setInlinePackingTitle('');
  };

  const handleInlineAddPacking = (e: React.FormEvent) => {
    e.preventDefault();
    performInlineAddPacking();
  };

  const handleLoadRecommendedPacking = () => {
    if (!canEdit) return;
    if (requireAuth && !requireAuth(handleLoadRecommendedPacking, lang === 'zh' ? '載入必備行李' : 'Load default packing')) {
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
    onUpdateTrip({ ...trip, packingList: [...packingList, ...additions], updatedAt: Date.now() });
  };

  return (
    <div className="relative pb-24 max-w-3xl mx-auto">
      {/* Clean Single Checklist Card */}
      <div className="rounded-3xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-800 shadow-2xs overflow-hidden">
        {/* Minimal Header Bar: Progress + Quiet Luggage Packing Button */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-[#E5E2DC] dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center shrink-0">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-tight">
                {lang === 'zh' ? '待辦清單' : 'To-Do Checklist'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                {completedTodos.length} / {todos.length} {lang === 'zh' ? '已完成' : 'Done'} · {progressPercent}%
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && todos.length === 0 && (
              <button
                type="button"
                onClick={handleLoadRecommendedTodos}
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                <span>載入常用範本</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsPackingModalOpen(true)}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-teal-200 dark:border-teal-800/80 bg-teal-50/70 dark:bg-teal-950/50 hover:bg-teal-100/70 dark:hover:bg-teal-900/40 text-teal-800 dark:text-teal-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="開啟出發前行李打包清單"
            >
              <Luggage className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
              <span>行李打包</span>
              <span className="font-mono tabular-nums text-[11px] opacity-85">
                ({pendingPacking.length})
              </span>
            </button>
          </div>
        </div>

        {/* Hairline Progress Bar */}
        {todos.length > 0 && (
          <div className="w-full bg-[#FAF9F6] dark:bg-slate-900 h-1 overflow-hidden">
            <div
              className="bg-teal-700 dark:bg-teal-500 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Native iPhone Reminders-style Interactive Checklist */}
        <RemindersTodoList
          trip={trip}
          lang={lang}
          canEdit={canEdit}
          onUpdateTrip={onUpdateTrip}
          requireAuth={requireAuth}
        />
      </div>

      {/* On-Demand Luggage Packing Modal (Retained cleanly per user choice) */}
      {isPackingModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs px-3 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] animate-in fade-in duration-150"
          onClick={() => setIsPackingModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-[#111827] rounded-3xl border border-[#E5E2DC] dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-full sm:max-h-[85dvh] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-[#E5E2DC] dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center">
                  <Luggage className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-slate-900 dark:text-white">
                    行李裝備打包清單
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    {completedPacking.length} / {packingList.length} 已打包
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && (
                  <button
                    type="button"
                    onClick={handleLoadRecommendedPacking}
                    className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-[#E5E2DC] dark:border-slate-700 bg-[#FAF9F6] dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs text-slate-700 dark:text-slate-200 font-semibold flex items-center gap-1 transition cursor-pointer"
                    title="載入行李打包範本"
                  >
                    <Sparkles className="w-3 h-3 text-teal-700 dark:text-teal-400" />
                    <span>載入範本</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsPackingModalOpen(false)}
                  className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  aria-label="關閉"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick Add Form in Modal */}
            {canEdit && (
              <form
                onSubmit={handleInlineAddPacking}
                className="p-3 border-b border-[#E5E2DC] dark:border-slate-800 bg-[#FAF9F6] dark:bg-slate-900/50 flex items-center gap-2 shrink-0"
              >
                <Plus className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={inlinePackingTitle}
                  onChange={(e) => setInlinePackingTitle(e.target.value)}
                  placeholder="新增隨身或託運行李物品..."
                  className="flex-1 min-h-[36px] bg-transparent text-base sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden"
                />
                {inlinePackingTitle.trim() && (
                  <button
                    type="submit"
                    className="min-h-[36px] px-3 py-1 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer transition shadow-2xs"
                  >
                    新增
                  </button>
                )}
              </form>
            )}

            {/* Category Filter Buttons in Modal */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none px-4 py-2.5 border-b border-[#E5E2DC] dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setPackingCategoryFilter('all')}
                className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-medium transition shrink-0 cursor-pointer tabular-nums ${
                  packingCategoryFilter === 'all'
                    ? 'bg-teal-700 dark:bg-teal-600 text-white font-bold'
                    : 'bg-[#FAF9F6] dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-[#E5E2DC] dark:border-slate-700'
                }`}
              >
                全部 ({pendingPacking.length})
              </button>

              {(Object.keys(PACKING_CATEGORY_MAP) as PackingCategory[]).map((cat) => {
                const meta = PACKING_CATEGORY_MAP[cat];
                const count = pendingPacking.filter((p) => p.category === cat).length;
                const isSelected = packingCategoryFilter === cat;
                const IconComp = meta.Icon;

                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setPackingCategoryFilter(cat)}
                    className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-medium transition shrink-0 flex items-center gap-1 cursor-pointer ${
                      isSelected
                        ? 'bg-teal-700 dark:bg-teal-600 text-white font-bold'
                        : 'bg-[#FAF9F6] dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-[#E5E2DC] dark:border-slate-700'
                    }`}
                  >
                    <IconComp className="w-3 h-3" />
                    <span>{meta.label}</span>
                    {count > 0 && <span className="opacity-75 font-mono tabular-nums text-[10px]">({count})</span>}
                  </button>
                );
              })}
            </div>

            {/* Scrollable Packing Items List */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#E5E2DC]/70 dark:divide-slate-800/80 p-2">
              {displayedPacking.length === 0 ? (
                <div className="py-12 text-center px-4">
                  <Check className="w-8 h-8 text-teal-600 dark:text-teal-400 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {packingCategoryFilter === 'all' ? '行李物品已全部打包完畢！' : '此分類下無待打包物品'}
                  </p>
                </div>
              ) : (
                displayedPacking.map((item) => {
                  const meta = PACKING_CATEGORY_MAP[item.category || 'other'];
                  const IconComp = meta?.Icon || Luggage;
                  const isEditingPack = editingPackingId === item.id;

                  if (isEditingPack) {
                    return (
                      <div
                        key={item.id}
                        className="p-2.5 my-1 rounded-xl bg-[#FAF9F6] dark:bg-slate-900 border border-teal-600/70 dark:border-teal-500/70 space-y-2"
                      >
                        <input
                          type="text"
                          value={editPackingName}
                          onChange={(e) => setEditPackingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              saveEditPacking();
                            } else if (e.key === 'Escape') {
                              setEditingPackingId(null);
                            }
                          }}
                          autoFocus
                          placeholder="物品名稱..."
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-700 text-base sm:text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-teal-600"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <select
                            value={editPackingCategory}
                            onChange={(e) => setEditPackingCategory(e.target.value as PackingCategory)}
                            className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1 rounded-xl bg-white dark:bg-[#111827] border border-[#E5E2DC] dark:border-slate-700 text-base sm:text-xs text-slate-700 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-teal-600"
                          >
                            {(Object.keys(PACKING_CATEGORY_MAP) as PackingCategory[]).map((cat) => (
                              <option key={cat} value={cat}>
                                {PACKING_CATEGORY_MAP[cat].label}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingPackingId(null)}
                              className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded-xl border border-[#E5E2DC] dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              onClick={saveEditPacking}
                              disabled={!editPackingName.trim()}
                              className="min-h-[44px] sm:min-h-[34px] px-3.5 py-1 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs font-bold disabled:opacity-50 cursor-pointer flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>儲存</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2.5 hover:bg-[#FAF9F6] dark:hover:bg-slate-900/50 transition rounded-xl"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => handleTogglePacking(item.id)}
                          className="w-11 h-11 sm:w-9 sm:h-9 -ml-1 flex items-center justify-center rounded-xl transition cursor-pointer shrink-0 group/pchk"
                          aria-label="標記打包"
                        >
                          <span className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 group-hover/pchk:border-teal-600 flex items-center justify-center transition">
                            {item.packed && <Check className="w-2.5 h-2.5 text-teal-700 dark:text-teal-400" />}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => canEdit && startEditPacking(item)}
                          disabled={!canEdit}
                          className={`min-w-0 flex-1 text-left flex items-center gap-1.5 ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                          <span className="text-xs sm:text-sm text-slate-900 dark:text-slate-100 font-medium truncate">
                            {item.name}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                            <span>·</span>
                            <IconComp className="w-3 h-3" />
                            <span>{meta?.label}</span>
                          </span>
                        </button>
                      </div>

                      {canEdit && (
                        <div className="flex items-center gap-0.5 ml-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditPacking(item)}
                            className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-teal-700 dark:text-slate-500 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition cursor-pointer"
                            aria-label="編輯物品"
                            title="編輯物品"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePacking(item.id)}
                            className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                            aria-label="刪除物品"
                            title="刪除物品"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* Completed Packing in Modal */}
              {completedPacking.length > 0 && (
                <div className="pt-2 mt-2 border-t border-[#E5E2DC] dark:border-slate-800">
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums">
                    已打包項目 ({completedPacking.length})
                  </div>
                  {completedPacking.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2 hover:bg-[#FAF9F6] dark:hover:bg-slate-800/30 transition rounded-xl opacity-60"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => handleTogglePacking(item.id)}
                          className="w-11 h-11 sm:w-8 sm:h-8 -ml-2 flex items-center justify-center rounded-xl shrink-0 cursor-pointer"
                          aria-label="恢復待打包"
                        >
                          <span className="w-4 h-4 rounded-full bg-teal-700 dark:bg-teal-500 text-white flex items-center justify-center">
                            <Check className="w-2.5 h-2.5" />
                          </span>
                        </button>
                        <span className="text-xs line-through text-slate-400 dark:text-slate-500 truncate">
                          {item.name}
                        </span>
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleDeletePacking(item.id)}
                          className="w-11 h-11 sm:w-8 sm:h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400 transition cursor-pointer ml-1"
                          aria-label="刪除物品"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
