import React, { useState, useMemo } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
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
  Sparkles,
  FileText,
  Smartphone,
  Shirt,
  ShieldCheck,
} from 'lucide-react';

interface PackingTabProps {
  trip: Trip;
  lang: Language;
  onUpdateTrip: (updatedTrip: Trip) => void;
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

export const PackingTab: React.FC<PackingTabProps> = ({ trip, lang, onUpdateTrip }) => {
  const [showCompleted, setShowCompleted] = useState(false);

  // Luggage Packing Modal State (Quiet on-demand tool, separate from main to-dos)
  const [isPackingModalOpen, setIsPackingModalOpen] = useState(false);
  useBodyScrollLock(isPackingModalOpen);
  const [packingCategoryFilter, setPackingCategoryFilter] = useState<PackingCategory | 'all'>('all');
  const [inlinePackingTitle, setInlinePackingTitle] = useState('');

  // Quick Addition Sheet State for detailed Todo creation
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  useBodyScrollLock(isAddSheetOpen);
  const [inputTitle, setInputTitle] = useState('');
  const [inputDueDate, setInputDueDate] = useState('');

  // Inline Quick Add input
  const [inlineTitle, setInlineTitle] = useState('');

  const todos = trip.todos || [];
  const packingList = trip.packingList || [];

  const pendingTodos = useMemo(() => todos.filter((t) => !t.completed), [todos]);
  const completedTodos = useMemo(() => todos.filter((t) => t.completed), [todos]);

  const pendingPacking = useMemo(() => packingList.filter((p) => !p.packed), [packingList]);
  const completedPacking = useMemo(() => packingList.filter((p) => p.packed), [packingList]);

  const progressPercent = todos.length > 0
    ? Math.round((completedTodos.length / todos.length) * 100)
    : 0;

  // Display all pending todos cleanly without category clutter
  const displayedTodos = pendingTodos;

  // Filtered Packing items for modal
  const displayedPacking = useMemo(() => {
    let list = pendingPacking;
    if (packingCategoryFilter !== 'all') {
      list = list.filter((p) => p.category === packingCategoryFilter);
    }
    return list;
  }, [pendingPacking, packingCategoryFilter]);

  // Handlers for Todos
  const handleToggleTodo = (id: string) => {
    const updated = todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
    onUpdateTrip({ ...trip, todos: updated, updatedAt: Date.now() });
  };

  const handleDeleteTodo = (id: string) => {
    const updated = todos.filter((t) => t.id !== id);
    onUpdateTrip({ ...trip, todos: updated, updatedAt: Date.now() });
  };

  const handleInlineAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inlineTitle.trim();
    if (!text) return;

    const newTodo: TodoItem = {
      id: `todo-${Date.now()}`,
      title: text,
      category: 'other',
      completed: false,
    };
    onUpdateTrip({ ...trip, todos: [newTodo, ...todos], updatedAt: Date.now() });
    setInlineTitle('');
  };

  const handleDetailedAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputTitle.trim();
    if (!text) return;

    const newTodo: TodoItem = {
      id: `todo-${Date.now()}`,
      title: text,
      category: 'other',
      completed: false,
      dueDate: inputDueDate || undefined,
    };
    onUpdateTrip({ ...trip, todos: [newTodo, ...todos], updatedAt: Date.now() });
    setInputTitle('');
    setInputDueDate('');
    setIsAddSheetOpen(false);
  };

  const handleLoadRecommendedTodos = () => {
    const existing = new Set(todos.map((t) => t.title));
    const additions = DEFAULT_TODOS.filter((t) => !existing.has(t.title));
    onUpdateTrip({ ...trip, todos: [...todos, ...additions], updatedAt: Date.now() });
  };

  // Handlers for Packing Items (Inside Modal)
  const handleTogglePacking = (id: string) => {
    const updated = packingList.map((p) => (p.id === id ? { ...p, packed: !p.packed } : p));
    onUpdateTrip({ ...trip, packingList: updated, updatedAt: Date.now() });
  };

  const handleDeletePacking = (id: string) => {
    const updated = packingList.filter((p) => p.id !== id);
    onUpdateTrip({ ...trip, packingList: updated, updatedAt: Date.now() });
  };

  const handleInlineAddPacking = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inlinePackingTitle.trim();
    if (!text) return;

    const newPack: PackingItem = {
      id: `pack-${Date.now()}`,
      name: text,
      category: packingCategoryFilter !== 'all' ? packingCategoryFilter : 'other',
      packed: false,
    };
    onUpdateTrip({ ...trip, packingList: [newPack, ...packingList], updatedAt: Date.now() });
    setInlinePackingTitle('');
  };

  const handleLoadRecommendedPacking = () => {
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
    <div className="relative pb-24 max-w-3xl mx-auto space-y-4">
      {/* Top Header Card: Title, Progress & Quiet Luggage Tool Button */}
      <div className="bg-white dark:bg-[#1C1C1E] rounded-3xl p-4 sm:p-5 border border-slate-200/90 dark:border-zinc-800 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <CheckSquare className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg">
                {lang === 'zh' ? '待辦清單' : 'To-Do Checklist'}
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400 mt-1.5">
              <span>
                {completedTodos.length} / {todos.length} {lang === 'zh' ? '已完成' : 'Completed'} ({progressPercent}%)
              </span>
            </div>
          </div>

          {/* Quick Actions (Quiet Luggage Button & Recommended Templates) */}
          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <button
              type="button"
              onClick={handleLoadRecommendedTodos}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs active:scale-95"
              title="載入常用行前待辦範本"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>載入推薦</span>
            </button>

            {/* Quiet Luggage Button: opens packing modal without cluttering the main screen */}
            <button
              type="button"
              onClick={() => setIsPackingModalOpen(true)}
              className="px-3 py-1.5 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/50 hover:bg-teal-100/60 dark:hover:bg-teal-900/40 text-teal-800 dark:text-teal-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs active:scale-95"
              title="開啟出發前行李打包清單"
            >
              <Luggage className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>行李裝備</span>
              <span className="text-[10px] font-mono opacity-80">
                ({pendingPacking.length})
              </span>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        {todos.length > 0 && (
          <div className="w-full bg-slate-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-3.5">
            <div
              className="bg-teal-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

      </div>

      {/* Main Checklist Card Container */}
      <div className="rounded-3xl bg-white dark:bg-[#1C1C1E] border border-slate-200/90 dark:border-zinc-800 shadow-sm overflow-hidden">
        {/* Apple Reminders-style Inline Quick Add Input */}
        <form
          onSubmit={handleInlineAdd}
          className="p-3 sm:p-3.5 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/40 flex items-center gap-2.5 transition"
        >
          <div className="w-5 h-5 rounded-full border border-dashed border-slate-300 dark:border-zinc-600 flex items-center justify-center shrink-0">
            <Plus className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
          </div>
          <input
            type="text"
            value={inlineTitle}
            onChange={(e) => setInlineTitle(e.target.value)}
            placeholder="新增待辦事項... (例如：購買環球影城快通票、開通漫遊)"
            className="flex-1 bg-transparent text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-hidden"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsAddSheetOpen(true)}
              className="px-2.5 py-1 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition cursor-pointer text-xs font-medium"
              title="展開詳細到期日設定"
            >
              詳細
            </button>
            {inlineTitle.trim() && (
              <button
                type="submit"
                className="px-3 py-1 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer transition shadow-xs"
              >
                新增
              </button>
            )}
          </div>
        </form>

        {/* Active Todos List */}
        {displayedTodos.length === 0 ? (
          <div className="py-16 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-teal-50 dark:bg-zinc-800 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 stroke-[2.5]" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
              目前沒有未完成的待辦事項！
            </p>
            <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
              可於上方輸入框鍵入項目，或點擊「載入推薦」取得常用待辦
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-zinc-800/80">
            {displayedTodos.map((todo) => {
              return (
                <div
                  key={todo.id}
                  className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-slate-50/70 dark:hover:bg-white/5 transition group"
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
              );
            })}
          </div>
        )}

        {/* Apple-style Collapsible Completed Section */}
        {completedTodos.length > 0 && (
          <div className="border-t border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/40">
            <button
              type="button"
              onClick={() => setShowCompleted(!showCompleted)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition cursor-pointer select-none"
            >
              <span>已完成項目 ({completedTodos.length})</span>
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <span>{showCompleted ? '收起' : '展開'}</span>
                {showCompleted ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </div>
            </button>

            {showCompleted && (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800/60 px-2 pb-2">
                {completedTodos.map((todo) => (
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
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* On-Demand Luggage Packing Modal (Apple Sheet Style, clean, no emojis) */}
      {isPackingModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setIsPackingModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-[#1C1C1E] rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                  <Luggage className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-slate-900 dark:text-white">
                    行李裝備打包清單
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    {completedPacking.length} / {packingList.length} 已打包
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLoadRecommendedPacking}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 hover:bg-slate-100 text-xs text-slate-600 dark:text-zinc-300 font-semibold flex items-center gap-1 transition cursor-pointer"
                  title="載入行李打包範本"
                >
                  <Sparkles className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                  <span>載入範本</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPackingModalOpen(false)}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick Add Form in Modal */}
            <form
              onSubmit={handleInlineAddPacking}
              className="p-3 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/40 flex items-center gap-2 shrink-0"
            >
              <Plus className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={inlinePackingTitle}
                onChange={(e) => setInlinePackingTitle(e.target.value)}
                placeholder="新增隨身或託運行李物品..."
                className="flex-1 bg-transparent text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-hidden"
              />
              {inlinePackingTitle.trim() && (
                <button
                  type="submit"
                  className="px-3 py-1 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer transition shadow-xs"
                >
                  新增
                </button>
              )}
            </form>

            {/* Category Pills in Modal (Clean text and icons, NO EMOJIS) */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none px-4 py-2.5 border-b border-slate-100 dark:border-zinc-800 shrink-0">
              <button
                type="button"
                onClick={() => setPackingCategoryFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition shrink-0 cursor-pointer ${
                  packingCategoryFilter === 'all'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400'
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition shrink-0 flex items-center gap-1 cursor-pointer ${
                      isSelected
                        ? 'bg-teal-600 text-white font-bold'
                        : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    <IconComp className="w-3 h-3" />
                    <span>{meta.label}</span>
                    {count > 0 && <span className="opacity-75 font-mono text-[10px]">({count})</span>}
                  </button>
                );
              })}
            </div>

            {/* Scrollable Packing Items List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800/80 p-2">
              {displayedPacking.length === 0 ? (
                <div className="py-12 text-center px-4">
                  <Check className="w-8 h-8 text-teal-500 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                    {packingCategoryFilter === 'all' ? '行李物品已全部打包完畢！' : '此分類下無待打包物品'}
                  </p>
                </div>
              ) : (
                displayedPacking.map((item) => {
                  const meta = PACKING_CATEGORY_MAP[item.category || 'other'];
                  const IconComp = meta?.Icon || Luggage;

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2.5 hover:bg-slate-50/70 dark:hover:bg-white/5 transition rounded-xl"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => handleTogglePacking(item.id)}
                          className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-zinc-600 hover:border-teal-500 flex items-center justify-center transition cursor-pointer shrink-0"
                        >
                          {item.packed && <Check className="w-2.5 h-2.5 text-teal-600" />}
                        </button>
                        <span className="text-xs sm:text-sm text-slate-900 dark:text-zinc-100 font-medium truncate">
                          {item.name}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-zinc-500 shrink-0 ml-1">
                          <IconComp className="w-3 h-3" />
                          <span>{meta?.label}</span>
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeletePacking(item.id)}
                        className="p-1 text-slate-300 hover:text-rose-500 dark:text-zinc-600 dark:hover:text-rose-400 transition cursor-pointer ml-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}

              {/* Completed Packing in Modal */}
              {completedPacking.length > 0 && (
                <div className="pt-2 mt-2 border-t border-slate-100 dark:border-zinc-800">
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 dark:text-zinc-500">
                    已打包項目 ({completedPacking.length})
                  </div>
                  {completedPacking.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2 hover:bg-slate-50/50 dark:hover:bg-zinc-800/30 transition rounded-xl opacity-60"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => handleTogglePacking(item.id)}
                          className="w-4 h-4 rounded-full bg-teal-600 text-white flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          <Check className="w-2.5 h-2.5" />
                        </button>
                        <span className="text-xs line-through text-slate-400 dark:text-zinc-500 truncate">
                          {item.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeletePacking(item.id)}
                        className="p-1 text-slate-300 hover:text-rose-500 dark:text-zinc-600 dark:hover:text-rose-400 transition cursor-pointer ml-1"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detailed Todo Modal (Detailed Sheet) */}
      {isAddSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setIsAddSheetOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white dark:bg-[#1C1C1E] rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden p-5 animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
              <h4 className="font-bold text-base text-slate-900 dark:text-white">
                新增待辦事項
              </h4>
              <button
                type="button"
                onClick={() => setIsAddSheetOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDetailedAdd} className="mt-4 space-y-4">
              <div>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="輸入待辦名稱（例如：購買環球影城快通門票）"
                  value={inputTitle}
                  onChange={(e) => setInputTitle(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500 placeholder:text-slate-400 dark:placeholder:text-zinc-500"
                />
              </div>



              {/* Due Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-2">
                  預計完成日期 (選填)
                </label>
                <input
                  type="date"
                  value={inputDueDate}
                  onChange={(e) => setInputDueDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>

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
