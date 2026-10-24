import React, { useState, useMemo } from 'react';
import { Trip, PackingItem, PackingCategory, TodoItem, TodoCategory } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import {
  Plus,
  Trash2,
  Check,
  CheckSquare,
  Luggage,
  Calendar,
  X,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface PackingTabProps {
  trip: Trip;
  lang: Language;
  onUpdateTrip: (updatedTrip: Trip) => void;
}

const PACKING_CATEGORY_MAP: Record<PackingCategory, { label: string; icon: string }> = {
  documents: { label: '證件與資金', icon: '📄' },
  electronics: { label: '電子 3C', icon: '📱' },
  clothing: { label: '衣物鞋帽', icon: '👕' },
  medicine: { label: '個人醫藥', icon: '💊' },
  toiletries: { label: '衛浴保養', icon: '🧴' },
  other: { label: '其他隨身', icon: '🎒' },
};

const TODO_CATEGORY_MAP: Record<TodoCategory, { label: string; icon: string }> = {
  tickets: { label: '票券預約', icon: '🎟️' },
  transport: { label: '交通乘車', icon: '🚄' },
  booking: { label: '住宿登記', icon: '🏨' },
  preparation: { label: '行前準備', icon: '💼' },
  finance: { label: '外幣資金', icon: '💵' },
  other: { label: '其他待辦', icon: '📌' },
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

export const PackingTab: React.FC<PackingTabProps> = ({ trip, lang, onUpdateTrip }) => {
  // Main sub-view: Todos vs Packing
  const [activeType, setActiveType] = useState<'todo' | 'packing'>('todo');
  const [filterState, setFilterState] = useState<'all' | 'pending' | 'completed'>('all');
  const [showCompleted, setShowCompleted] = useState(false);

  // Quick Addition Sheet State
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [inputTitle, setInputTitle] = useState('');
  const [selectedTodoCategory, setSelectedTodoCategory] = useState<TodoCategory>('preparation');
  const [selectedPackingCategory, setSelectedPackingCategory] = useState<PackingCategory>('documents');
  const [inputDueDate, setInputDueDate] = useState('');

  // 1. Data Collections
  const todos = useMemo<TodoItem[]>(() => {
    if (Array.isArray(trip.todos) && trip.todos.length > 0) return trip.todos;
    return DEFAULT_TODOS;
  }, [trip.todos]);

  const packingList = useMemo<PackingItem[]>(() => {
    if (Array.isArray(trip.packingList) && trip.packingList.length > 0) return trip.packingList;
    return DEFAULT_ESSENTIALS.map((item, idx) => ({
      id: `pack-def-${idx}`,
      name: item.name,
      category: item.category,
      packed: false,
      essential: true,
    }));
  }, [trip.packingList]);

  // Counts
  const pendingTodos = todos.filter((t) => !t.completed);
  const completedTodos = todos.filter((t) => t.completed);

  const pendingPacking = packingList.filter((p) => !p.packed);
  const completedPacking = packingList.filter((p) => p.packed);

  // Filtered Items
  const displayedTodos = useMemo(() => {
    if (filterState === 'pending') return pendingTodos;
    if (filterState === 'completed') return completedTodos;
    return pendingTodos;
  }, [filterState, pendingTodos, completedTodos]);

  const displayedPacking = useMemo(() => {
    if (filterState === 'pending') return pendingPacking;
    if (filterState === 'completed') return completedPacking;
    return pendingPacking;
  }, [filterState, pendingPacking, completedPacking]);

  // 2. Handlers
  const handleToggleTodo = (id: string) => {
    const nextTodos = todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
    onUpdateTrip({ ...trip, todos: nextTodos, updatedAt: Date.now() });
  };

  const handleDeleteTodo = (id: string) => {
    const nextTodos = todos.filter((t) => t.id !== id);
    onUpdateTrip({ ...trip, todos: nextTodos, updatedAt: Date.now() });
  };

  const handleTogglePacking = (id: string) => {
    const nextPacking = packingList.map((p) => (p.id === id ? { ...p, packed: !p.packed } : p));
    onUpdateTrip({ ...trip, packingList: nextPacking, updatedAt: Date.now() });
  };

  const handleDeletePacking = (id: string) => {
    const nextPacking = packingList.filter((p) => p.id !== id);
    onUpdateTrip({ ...trip, packingList: nextPacking, updatedAt: Date.now() });
  };

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const title = inputTitle.trim();
    if (!title) return;

    if (activeType === 'todo') {
      const newTodo: TodoItem = {
        id: `todo-${Date.now()}`,
        title,
        category: selectedTodoCategory,
        dueDate: inputDueDate || undefined,
        completed: false,
      };
      onUpdateTrip({ ...trip, todos: [newTodo, ...todos], updatedAt: Date.now() });
    } else {
      const newPack: PackingItem = {
        id: `pack-${Date.now()}`,
        name: title,
        category: selectedPackingCategory,
        packed: false,
      };
      onUpdateTrip({ ...trip, packingList: [newPack, ...packingList], updatedAt: Date.now() });
    }

    setInputTitle('');
    setInputDueDate('');
    setIsAddSheetOpen(false);
  };

  const handleResetRecommended = () => {
    if (activeType === 'todo') {
      const existing = new Set(todos.map((t) => t.title));
      const additions = DEFAULT_TODOS.filter((t) => !existing.has(t.title));
      onUpdateTrip({ ...trip, todos: [...todos, ...additions], updatedAt: Date.now() });
    } else {
      const existing = new Set(packingList.map((p) => p.name));
      const additions = DEFAULT_ESSENTIALS.filter((e) => !existing.has(e.name)).map((e, idx) => ({
        id: `pack-add-${Date.now()}-${idx}`,
        name: e.name,
        category: e.category,
        packed: false,
        essential: true,
      }));
      onUpdateTrip({ ...trip, packingList: [...packingList, ...additions], updatedAt: Date.now() });
    }
  };

  return (
    <div className="relative pb-24 max-w-3xl mx-auto">
      {/* Apple-style Top Bar & Segmented Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 px-1">
        {/* Apple Segmented Switcher */}
        <div className="inline-flex p-1 bg-slate-200/80 dark:bg-zinc-800 rounded-2xl border border-slate-300/40 dark:border-zinc-750 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveType('todo')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeType === 'todo'
                ? 'bg-white dark:bg-[#1C1C1E] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>待辦事項</span>
            <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500 ml-0.5">
              ({pendingTodos.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveType('packing')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeType === 'packing'
                ? 'bg-white dark:bg-[#1C1C1E] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Luggage className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>行李裝備</span>
            <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500 ml-0.5">
              ({pendingPacking.length})
            </span>
          </button>
        </div>

        {/* Quiet Quick Actions */}
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-zinc-400 self-end sm:self-auto">
          <button
            type="button"
            onClick={handleResetRecommended}
            className="hover:text-teal-600 dark:hover:text-teal-400 flex items-center gap-1 transition cursor-pointer"
            title="載入推薦必備清單"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-500" />
            <span>載入推薦</span>
          </button>
        </div>
      </div>

      {/* Main Checklist Card Container */}
      <div className="rounded-3xl bg-white dark:bg-[#1C1C1E] border border-slate-200/90 dark:border-zinc-800 shadow-sm overflow-hidden">
        {/* Active Items List */}
        {activeType === 'todo' ? (
          displayedTodos.length === 0 ? (
            <div className="py-16 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-teal-50 dark:bg-zinc-800 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6 stroke-[2.5]" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                {filterState === 'all' || filterState === 'pending'
                  ? '目前沒有未完成待辦！'
                  : '尚無已完成項目'}
              </p>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
                點擊右下角「+」快速新增事項
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-zinc-800/80">
              {displayedTodos.map((todo) => {
                const categoryInfo = TODO_CATEGORY_MAP[todo.category || 'preparation'];
                return (
                  <div
                    key={todo.id}
                    className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-slate-50/70 dark:hover:bg-zinc-850/50 transition group"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {/* Apple Round Checkbox */}
                      <button
                        type="button"
                        onClick={() => handleToggleTodo(todo.id)}
                        className="mt-0.5 w-5 h-5 rounded-full border-2 border-slate-300 dark:border-zinc-600 hover:border-teal-500 dark:hover:border-teal-400 flex items-center justify-center transition cursor-pointer shrink-0"
                        title="標記完成"
                      >
                        {todo.completed && <Check className="w-3 h-3 text-teal-600" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-slate-900 dark:text-zinc-100 font-medium block leading-snug break-words">
                          {todo.title}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-zinc-400 mt-1">
                          <span>
                            {categoryInfo?.icon} {categoryInfo?.label || '待辦'}
                          </span>
                          {todo.dueDate && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="flex items-center gap-1 text-slate-500 dark:text-zinc-400">
                                <Calendar className="w-3 h-3" />
                                {todo.dueDate}
                              </span>
                            </>
                          )}
                        </div>
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
                );
              })}
            </div>
          )
        ) : displayedPacking.length === 0 ? (
          <div className="py-16 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-teal-50 dark:bg-zinc-800 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 stroke-[2.5]" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
              {filterState === 'all' || filterState === 'pending'
                ? '行李裝備已全部打包完畢！'
                : '尚無已打包物品'}
            </p>
            <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
              點擊右下角「+」快速添加隨身裝備
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-zinc-800/80">
            {displayedPacking.map((item) => {
              const categoryInfo = PACKING_CATEGORY_MAP[item.category || 'other'];
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-slate-50/70 dark:hover:bg-zinc-850/50 transition group"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Apple Round Checkbox */}
                    <button
                      type="button"
                      onClick={() => handleTogglePacking(item.id)}
                      className="mt-0.5 w-5 h-5 rounded-full border-2 border-slate-300 dark:border-zinc-600 hover:border-teal-500 dark:hover:border-teal-400 flex items-center justify-center transition cursor-pointer shrink-0"
                      title="標記打包"
                    >
                      {item.packed && <Check className="w-3 h-3 text-teal-600" />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <span className="text-sm text-slate-900 dark:text-zinc-100 font-medium block leading-snug break-words">
                        {item.name}
                      </span>
                      <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-zinc-400 mt-1">
                        <span>
                          {categoryInfo?.icon} {categoryInfo?.label || '物品'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeletePacking(item.id)}
                    className="p-1.5 text-slate-300 hover:text-rose-500 dark:text-zinc-600 dark:hover:text-rose-400 transition cursor-pointer opacity-70 sm:opacity-0 group-hover:opacity-100 ml-2"
                    title="刪除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Apple-style Collapsible Completed Section */}
        {((activeType === 'todo' && completedTodos.length > 0) ||
          (activeType === 'packing' && completedPacking.length > 0)) && (
          <div className="border-t border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/40">
            <button
              type="button"
              onClick={() => setShowCompleted(!showCompleted)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition cursor-pointer select-none"
            >
              <span>
                已完成項目 (
                {activeType === 'todo' ? completedTodos.length : completedPacking.length})
              </span>
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <span>{showCompleted ? '收起' : '展開'}</span>
                {showCompleted ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </div>
            </button>

            {showCompleted && (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800/60 px-2 pb-2">
                {activeType === 'todo'
                  ? completedTodos.map((todo) => (
                      <div
                        key={todo.id}
                        className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100/50 dark:hover:bg-zinc-800/40 transition group opacity-75"
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
                          <span className="text-sm line-through text-slate-400 dark:text-zinc-500 truncate flex-1">
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
                    ))
                  : completedPacking.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100/50 dark:hover:bg-zinc-800/40 transition group opacity-75"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => handleTogglePacking(item.id)}
                            className="w-5 h-5 rounded-full bg-teal-600 dark:bg-teal-500 text-white flex items-center justify-center shrink-0 cursor-pointer shadow-xs"
                            title="移回待打包"
                          >
                            <Check className="w-3 h-3 stroke-[2.5]" />
                          </button>
                          <span className="text-sm line-through text-slate-400 dark:text-zinc-500 truncate flex-1">
                            {item.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeletePacking(item.id)}
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

      {/* Apple Floating Action Button (FAB +) - Vertically stacked cleanly above global quick action button */}
      <button
        type="button"
        onClick={() => setIsAddSheetOpen(true)}
        className="fixed bottom-[calc(8.5rem+env(safe-area-inset-bottom,0px))] right-4 sm:bottom-25 sm:right-8 z-40 w-13 h-13 rounded-full bg-teal-600 hover:bg-teal-500 active:scale-95 text-white shadow-xl flex items-center justify-center transition-all cursor-pointer focus:outline-none focus:ring-4 focus:ring-teal-500/30"
        title="新增事項"
        aria-label="新增事項"
      >
        <Plus className="w-6 h-6 stroke-[2.5]" />
      </button>

      {/* Apple-style Bottom Drawer / Add Modal */}
      {isAddSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setIsAddSheetOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white dark:bg-[#1C1C1E] rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden p-5 animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
              <h4 className="font-bold text-base text-slate-900 dark:text-white">
                新增{activeType === 'todo' ? '待辦事項' : '行李裝備'}
              </h4>
              <button
                type="button"
                onClick={() => setIsAddSheetOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleQuickAdd} className="mt-4 space-y-4">
              <div>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder={
                    activeType === 'todo'
                      ? '輸入待辦名稱（例如：購買環球影城門票）'
                      : '輸入裝備名稱（例如：相機電池充電器）'
                  }
                  value={inputTitle}
                  onChange={(e) => setInputTitle(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-slate-400 dark:placeholder:text-zinc-500"
                />
              </div>

              {/* Category Picker */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-2">
                  分類標籤
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {activeType === 'todo'
                    ? (Object.keys(TODO_CATEGORY_MAP) as TodoCategory[]).map((cat) => {
                        const meta = TODO_CATEGORY_MAP[cat];
                        const isSelected = selectedTodoCategory === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedTodoCategory(cat)}
                            className={`py-2 px-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                              isSelected
                                ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500 text-teal-800 dark:text-teal-200'
                                : 'bg-slate-50 dark:bg-zinc-800/50 border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:border-slate-300'
                            }`}
                          >
                            <span>{meta.icon}</span>
                            <span>{meta.label}</span>
                          </button>
                        );
                      })
                    : (Object.keys(PACKING_CATEGORY_MAP) as PackingCategory[]).map((cat) => {
                        const meta = PACKING_CATEGORY_MAP[cat];
                        const isSelected = selectedPackingCategory === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedPackingCategory(cat)}
                            className={`py-2 px-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                              isSelected
                                ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500 text-teal-800 dark:text-teal-200'
                                : 'bg-slate-50 dark:bg-zinc-800/50 border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:border-slate-300'
                            }`}
                          >
                            <span>{meta.icon}</span>
                            <span>{meta.label}</span>
                          </button>
                        );
                      })}
                </div>
              </div>

              {/* Due Date (for Todos only) */}
              {activeType === 'todo' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-2">
                    預計完成日期 (選填)
                  </label>
                  <input
                    type="date"
                    value={inputDueDate}
                    onChange={(e) => setInputDueDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddSheetOpen(false)}
                  className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!inputTitle.trim()}
                  className="px-5 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  確認新增
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
