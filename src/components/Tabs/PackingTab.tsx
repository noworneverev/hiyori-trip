import React, { useState } from 'react';
import { Trip, PackingItem, PackingCategory, TodoItem, TodoCategory } from '../../types/itinerary';
import { Language, TRANSLATIONS } from '../../utils/i18n';
import { formatDateSlash } from '../../utils/date';
import {
  Plus,
  Trash2,
  CheckCircle2,
  RotateCcw,
  FileCheck,
  Smartphone,
  Shirt,
  Pill,
  Sparkles,
  Luggage,
  Calendar,
  Ticket,
  Clock,
  Check,
  ListTodo,
  Tag,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

interface PackingTabProps {
  trip: Trip;
  lang: Language;
  onUpdateTrip: (updatedTrip: Trip) => void;
}

const PACKING_CATEGORY_MAP: Record<PackingCategory, Record<Language, string> & { icon: React.ComponentType<{ className?: string }> }> = {
  documents: { zh: '證件與資金', en: 'Docs & Money', ja: '書類・お金', ko: '신분증/경비', 'zh-CN': '证件与资金', icon: FileCheck },
  electronics: { zh: '電子 3C 產品', en: 'Electronics', ja: '電子機器・充電器', ko: '전자기기/충전기', 'zh-CN': '电子数码产品', icon: Smartphone },
  clothing: { zh: '衣物鞋帽', en: 'Clothing', ja: '衣類・靴', ko: '의류/신발', 'zh-CN': '衣物鞋帽', icon: Shirt },
  medicine: { zh: '個人醫藥', en: 'Medicine', ja: '常備薬・救急用品', ko: '상비약', 'zh-CN': '个人医药', icon: Pill },
  toiletries: { zh: '衛浴保養', en: 'Toiletries', ja: '洗面用具・コスメ', ko: '세면도구', 'zh-CN': '卫浴保养', icon: Sparkles },
  other: { zh: '其他隨身', en: 'Others', ja: 'その他必需品', ko: '기타 휴대품', 'zh-CN': '其他随身', icon: Luggage },
};

const TODO_CATEGORY_MAP: Record<TodoCategory, { label: string; icon: string; color: string; bg: string }> = {
  tickets: { label: '票券購買', icon: '🎟️', color: '#0d9488', bg: 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200 border-teal-200 dark:border-teal-800' },
  transport: { label: '交通預約', icon: '🚄', color: '#3b82f6', bg: 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800' },
  booking: { label: '預約確認', icon: '🏨', color: '#8b5cf6', bg: 'bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-800' },
  preparation: { label: '行前準備', icon: '💼', color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800' },
  finance: { label: '外幣資金', icon: '💵', color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800' },
  other: { label: '其他待辦', icon: '📌', color: '#64748b', bg: 'bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700' },
};

const DEFAULT_ESSENTIALS: Array<Record<Language, string> & { category: PackingCategory }> = [
  { zh: '護照正本（有效期6個月以上）', en: 'Valid Passport', ja: 'パスポート（残存期間確認）', ko: '여권 (유효기간 6개월 이상)', 'zh-CN': '护照原件（有效期6个月以上）', category: 'documents' },
  { zh: '機票與住宿憑證', en: 'Flight & Hotel Vouchers', ja: '航空券＆ホテル予約確認書', ko: '항공권 및 숙소 예약 바우처', 'zh-CN': '机票与住宿凭证', category: 'documents' },
  { zh: '海外刷卡信用卡 2 張', en: '2 Credit Cards', ja: 'クレジットカード2枚', ko: '해외 결제 신용카드 2장', 'zh-CN': '境外刷卡信用卡 2 张', category: 'documents' },
  { zh: '當地外幣現鈔', en: 'Local Currency Cash', ja: '現地通貨（現金）', ko: '현지 외화 현금', 'zh-CN': '当地外币现钞', category: 'documents' },
  { zh: '上網 eSIM 或上網卡', en: 'Travel eSIM / SIM card', ja: '海外用eSIM / SIMカード', ko: '해외 eSIM / 유심', 'zh-CN': '上网 eSIM 或电话卡', category: 'electronics' },
  { zh: '行動電源 (隨身攜帶)', en: 'Power Bank (Carry-on)', ja: 'モバイルバッテリー（機内持込）', ko: '보조배터리 (기내 수하物)', 'zh-CN': '充电宝 (随身携带)', category: 'electronics' },
  { zh: '充電線與插頭轉換器', en: 'Charging Cable & Adapter', ja: '充電ケーブル＆変換プラグ', ko: '충전 케이블 및 돼지코 변환기', 'zh-CN': '充电线与插头转换器', category: 'electronics' },
  { zh: '好穿耐走運動鞋', en: 'Comfortable Walking Shoes', ja: '歩きやすい靴・スニーカー', ko: '편안한 운동화', 'zh-CN': '舒适耐走运动鞋', category: 'clothing' },
  { zh: '薄風衣外套', en: 'Light Windbreaker Jacket', ja: '薄手のウィンドブレーカー', ko: '가벼운 바람막이 외투', 'zh-CN': '薄风衣外套', category: 'clothing' },
  { zh: '個人常備藥品', en: 'Personal Medicine', ja: '個人常備薬・胃腸薬', ko: '개인 상비약', 'zh-CN': '个人常备药品', category: 'medicine' },
  { zh: '折疊雨傘', en: 'Compact Umbrella', ja: '折りたたみ傘', ko: '접이식 우산', 'zh-CN': '折叠雨伞', category: 'other' },
];

const HOKURIKU_DEFAULT_TODOS: TodoItem[] = [
  {
    id: 'todo-hoku-1',
    title: '購買 JR 北陸地區鐵路周遊券 4 日券 (Hokuriku Area Pass)',
    category: 'tickets',
    completed: false,
    essential: true,
    dueDate: '2026-10-09',
    notes: '7,000 日圓，出發前於 Klook 或 KKday 下單取得 QR Code，10/13~10/14 在金澤車站綠色售票機掃護照換實體磁卡票',
  },
  {
    id: 'todo-hoku-2',
    title: '購買金澤文化之森出遊 Pass（文化の森おでかけパス 2日券）',
    category: 'tickets',
    completed: false,
    essential: true,
    dueDate: '2026-10-14',
    notes: '1,000 日圓，出發前或 10/14 前在 Klook/KKday 線上購買電子票（現省190円，免排隊進兼六園、五十間長屋、野村家）',
  },
  {
    id: 'todo-hoku-3',
    title: '確認三段高速巴士訂票憑證已存手機離線截圖',
    category: 'transport',
    completed: true,
    essential: true,
    dueDate: '2026-10-09',
    notes: '✓ 10/11 名古屋-高山(08:00)、✓ 10/13 高山-白川鄉(08:10)、✓ 10/13 白川鄉-金澤(15:10) 皆已全數鎖定',
  },
  {
    id: 'todo-hoku-4',
    title: '名鐵名古屋站人工窗口購買【名鐵犬山城下町套票】',
    category: 'transport',
    completed: false,
    essential: false,
    dueDate: '2026-10-10',
    notes: '約 1,630 日圓，抵達首日名鐵名古屋站人工窗口隨買隨用，含電車來回＋犬山城門票＋折價券',
  },
  {
    id: 'todo-hoku-5',
    title: '高山濃飛巴士中心現場購買【上高地往復乘車票】',
    category: 'transport',
    completed: false,
    essential: false,
    dueDate: '2026-10-12',
    notes: '5,800 日圓，10/12 一早在高山濃飛巴士中心窗口購票',
  },
  {
    id: 'todo-hoku-6',
    title: '開通日本上網 eSIM 或裝入實體漫遊 SIM 卡',
    category: 'preparation',
    completed: false,
    essential: true,
    dueDate: '2026-10-09',
    notes: '飛機降落前開啟漫遊並測試網路連線',
  },
  {
    id: 'todo-hoku-7',
    title: '填寫 Visit Japan Web 快速通關審查並截圖 QR Code',
    category: 'preparation',
    completed: false,
    essential: true,
    dueDate: '2026-10-08',
    notes: '包含入境審查與海關申報 QR Code 存至相簿以利離線出示',
  },
];

const GENERAL_DEFAULT_TODOS: TodoItem[] = [
  {
    id: 'todo-gen-1',
    title: '確認護照效期大於 6 個月並備妥數位電子截圖',
    category: 'preparation',
    completed: false,
    essential: true,
    notes: '出國前確認護照剩餘效期距回程日期至少 6 個月以上',
  },
  {
    id: 'todo-gen-2',
    title: '購買海外旅遊平安與急難救助不便險',
    category: 'preparation',
    completed: false,
    essential: true,
    notes: '留存英文投保證明單號與 24 小時海外急難救助專線',
  },
  {
    id: 'todo-gen-3',
    title: '開通海外上網 eSIM 或準備實體 SIM 卡',
    category: 'preparation',
    completed: false,
    essential: true,
    notes: '登機前安裝完成 eSIM 描述檔或備妥取卡針',
  },
  {
    id: 'todo-gen-4',
    title: '開啟信用卡海外交易功能與海外提款密碼',
    category: 'preparation',
    completed: false,
    essential: true,
    notes: '向發卡銀行確認已開通國外刷卡交易與即時消費簡訊',
  },
  {
    id: 'todo-gen-5',
    title: '準備適量外幣現鈔與當地交通票卡',
    category: 'preparation',
    completed: false,
    essential: false,
    notes: '備妥小額零錢與常用交通 IC 票卡加值',
  },
];

export const PackingTab: React.FC<PackingTabProps> = ({ trip, lang, onUpdateTrip }) => {
  const t = TRANSLATIONS[lang];

  // Primary Sub-Tab Switcher: 'todo' vs 'packing'
  const [subTab, setSubTab] = useState<'todo' | 'packing'>('todo');

  // --- To-Do List State ---
  const todos = Array.isArray(trip.todos)
    ? trip.todos
    : (trip.id === 'preset-hokuriku-chubu-9days' ? HOKURIKU_DEFAULT_TODOS : GENERAL_DEFAULT_TODOS);

  const [todoFilter, setTodoFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [showAddTodo, setShowAddTodo] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoCategory, setNewTodoCategory] = useState<TodoCategory>('tickets');
  const [newTodoDueDate, setNewTodoDueDate] = useState('');
  const [newTodoNotes, setNewTodoNotes] = useState('');

  const completedTodoCount = todos.filter((i) => i.completed).length;
  const totalTodoCount = todos.length;
  const todoProgress = totalTodoCount > 0 ? Math.round((completedTodoCount / totalTodoCount) * 100) : 0;

  const handleToggleTodo = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const updated = todos.map((item) =>
      item.id === id ? { ...item, completed: !item.completed } : item
    );
    onUpdateTrip({ ...trip, todos: updated, updatedAt: Date.now() });
  };

  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoTitle.trim()) return;

    const newItem: TodoItem = {
      id: `todo-${Date.now()}`,
      title: newTodoTitle.trim(),
      category: newTodoCategory,
      completed: false,
      dueDate: newTodoDueDate || undefined,
      notes: newTodoNotes.trim() || undefined,
    };

    onUpdateTrip({
      ...trip,
      todos: [newItem, ...todos],
      updatedAt: Date.now(),
    });

    setNewTodoTitle('');
    setNewTodoNotes('');
    setNewTodoDueDate('');
    setShowAddTodo(false);
  };

  const handleDeleteTodo = (id: string) => {
    const updated = todos.filter((item) => item.id !== id);
    onUpdateTrip({ ...trip, todos: updated, updatedAt: Date.now() });
  };

  const handleLoadRecommendedTodos = () => {
    const existingTitles = new Set(todos.map((t) => t.title));
    const toAdd = HOKURIKU_DEFAULT_TODOS.filter((item) => !existingTitles.has(item.title));
    onUpdateTrip({
      ...trip,
      todos: [...todos, ...toAdd],
      updatedAt: Date.now(),
    });
  };

  const filteredTodos = todos.filter((item) => {
    if (todoFilter === 'pending') return !item.completed;
    if (todoFilter === 'completed') return item.completed;
    return true;
  });

  // --- Packing List State ---
  const [newItemName, setNewItemName] = useState('');
  const [newItemCat, setNewItemCat] = useState<PackingCategory>('documents');
  const [packingFilter, setPackingFilter] = useState<'all' | 'unpacked' | 'packed'>('all');

  const packingList = trip.packingList || [];
  const packedCount = packingList.filter((item) => item.packed).length;
  const totalCount = packingList.length;
  const progressPercent = totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0;

  const handleTogglePack = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const updated = packingList.map((item) =>
      item.id === id ? { ...item, packed: !item.packed } : item
    );
    onUpdateTrip({ ...trip, packingList: updated, updatedAt: Date.now() });
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    const newItem: PackingItem = {
      id: `pack-${Date.now()}`,
      name: newItemName.trim(),
      category: newItemCat,
      packed: false,
      essential: false,
    };

    onUpdateTrip({
      ...trip,
      packingList: [...packingList, newItem],
      updatedAt: Date.now(),
    });
    setNewItemName('');
  };

  const handleDeleteItem = (id: string) => {
    const updated = packingList.filter((item) => item.id !== id);
    onUpdateTrip({ ...trip, packingList: updated, updatedAt: Date.now() });
  };

  const handleResetToRecommended = () => {
    const existingNames = new Set(packingList.map((i) => i.name));
    const toAdd: PackingItem[] = DEFAULT_ESSENTIALS.filter((e) => !existingNames.has(e[lang])).map(
      (e, idx) => ({
        id: `pack-def-${Date.now()}-${idx}`,
        name: e[lang],
        category: e.category,
        packed: false,
        essential: true,
      })
    );

    onUpdateTrip({
      ...trip,
      packingList: [...packingList, ...toAdd],
      updatedAt: Date.now(),
    });
  };

  const filteredPackingItems = packingList.filter((item) => {
    if (packingFilter === 'packed') return item.packed;
    if (packingFilter === 'unpacked') return !item.packed;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* 1. Master Tab Switcher Header (To-Do & Tickets vs Luggage Packing) */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <ListTodo className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              <span>隨身手帖清單與待辦</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              整合票券購買提醒、行前代辦事項與行李裝備清單
            </p>
          </div>

          {/* Sub-tab segmented button */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl self-start sm:self-auto">
            <button
              onClick={() => setSubTab('todo')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                subTab === 'todo'
                  ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Ticket className="w-3.5 h-3.5" />
              <span>行前待辦 & 票券 ({todos.length - completedTodoCount} 待辦)</span>
            </button>
            <button
              onClick={() => setSubTab('packing')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                subTab === 'packing'
                  ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Luggage className="w-3.5 h-3.5" />
              <span>行李打包清單 ({progressPercent}%)</span>
            </button>
          </div>
        </div>

        {/* Progress Bar for Current Sub-Tab */}
        <div className="pt-3">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">
            <span>
              {subTab === 'todo' ? (
                <>
                  已完成 <strong className="text-teal-700 dark:text-teal-300 font-mono font-bold">{completedTodoCount}</strong> / {totalTodoCount} 項待辦事項
                </>
              ) : (
                <>
                  已打包 <strong className="text-teal-700 dark:text-teal-300 font-mono font-bold">{packedCount}</strong> / {totalCount} 件行李裝備
                </>
              )}
            </span>
            <span className="font-mono font-bold text-teal-700 dark:text-teal-300">
              {subTab === 'todo' ? `${todoProgress}%` : `${progressPercent}%`}
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-teal-600 h-full transition-all duration-300 rounded-full"
              style={{ width: `${subTab === 'todo' ? todoProgress : progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2. SUB-TAB: TO-DO & TICKETS CHECKLIST */}
      {subTab === 'todo' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Controls Bar */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Filter buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <button
                onClick={() => setTodoFilter('all')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition shrink-0 ${
                  todoFilter === 'all'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                全部 ({todos.length})
              </button>
              <button
                onClick={() => setTodoFilter('pending')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition shrink-0 ${
                  todoFilter === 'pending'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                待處理 ({totalTodoCount - completedTodoCount})
              </button>
              <button
                onClick={() => setTodoFilter('completed')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition shrink-0 ${
                  todoFilter === 'completed'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                已完成 ({completedTodoCount})
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                onClick={handleLoadRecommendedTodos}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-medium flex items-center gap-1 transition"
                title="補齊北陸推薦待辦"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>載入推薦票券待辦</span>
              </button>
              <button
                onClick={() => setShowAddTodo(!showAddTodo)}
                className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1 transition active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新增待辦</span>
              </button>
            </div>
          </div>

          {/* Add Todo Form */}
          {showAddTodo && (
            <form
              onSubmit={handleAddTodo}
              className="rounded-3xl bg-teal-50/60 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-900 p-4 sm:p-5 space-y-3 text-xs animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between pb-2 border-b border-teal-200/40 dark:border-teal-900/40">
                <h4 className="font-bold text-teal-950 dark:text-teal-200 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-teal-600" />
                  <span>新增待辦或票券購買提醒</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setShowAddTodo(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  ✕
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  待辦事項名稱 *
                </label>
                <input
                  type="text"
                  required
                  value={newTodoTitle}
                  onChange={(e) => setNewTodoTitle(e.target.value)}
                  placeholder="如：購買北陸 4 日 Pass、預約白川鄉高速巴士、開通 eSIM..."
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 text-xs outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                    待辦類別
                  </label>
                  <select
                    value={newTodoCategory}
                    onChange={(e) => setNewTodoCategory(e.target.value as TodoCategory)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 text-xs outline-none"
                  >
                    {Object.entries(TODO_CATEGORY_MAP).map(([key, info]) => (
                      <option key={key} value={key}>
                        {info.icon} {info.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                    預計完成日期 (選填)
                  </label>
                  <input
                    type="date"
                    value={newTodoDueDate}
                    onChange={(e) => setNewTodoDueDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 text-xs outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  詳細備忘說明 (選填)
                </label>
                <input
                  type="text"
                  value={newTodoNotes}
                  onChange={(e) => setNewTodoNotes(e.target.value)}
                  placeholder="如：價格 7,000 日圓、需在綠色售票機掃描護照兌換..."
                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 text-xs outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-teal-200/40 dark:border-teal-900/40">
                <button
                  type="button"
                  onClick={() => setShowAddTodo(false)}
                  className="px-3.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl"
                >
                  加入待辦
                </button>
              </div>
            </form>
          )}

          {/* To-Do List Cards */}
          <div className="space-y-2">
            {filteredTodos.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800">
                <p>目前查無符合條件的待辦事項</p>
              </div>
            ) : (
              filteredTodos.map((item) => {
                const catMeta = TODO_CATEGORY_MAP[item.category] || TODO_CATEGORY_MAP.other;

                return (
                  <div
                    key={item.id}
                    onClick={(e) => handleToggleTodo(item.id, e)}
                    className={`p-3.5 rounded-2xl border transition flex items-start justify-between gap-3 cursor-pointer group select-none active:scale-[0.99] ${
                      item.completed
                        ? 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-65'
                        : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-teal-400 dark:hover:border-teal-600'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Checkbox (100% contained, no overflow, crisp checkmark) */}
                      <div className="mt-0.5 shrink-0">
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center transition-all duration-150 ${
                            item.completed
                              ? 'bg-teal-600 border border-teal-600 text-white shadow-2xs'
                              : 'border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover:border-teal-500'
                          }`}
                        >
                          {item.completed && (
                            <Check className="w-3.5 h-3.5 text-white stroke-[3] animate-in zoom-in-75 duration-150" />
                          )}
                        </div>
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${catMeta.bg}`}
                          >
                            {catMeta.icon} {catMeta.label}
                          </span>

                          <span
                            className={`font-bold text-xs sm:text-sm ${
                              item.completed
                                ? 'line-through text-slate-400 dark:text-slate-500'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {item.title}
                          </span>
                        </div>

                        {item.notes && (
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                            {item.notes}
                          </p>
                        )}

                        {item.dueDate && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>截止/預計: {formatDateSlash(item.dueDate)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTodo(item.id);
                      }}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition shrink-0"
                      title="刪除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 3. SUB-TAB: LUGGAGE PACKING CHECKLIST */}
      {subTab === 'packing' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Filter buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <button
                onClick={() => setPackingFilter('all')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition shrink-0 ${
                  packingFilter === 'all'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {t.all} ({packingList.length})
              </button>
              <button
                onClick={() => setPackingFilter('unpacked')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition shrink-0 ${
                  packingFilter === 'unpacked'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {t.unpacked} ({totalCount - packedCount})
              </button>
              <button
                onClick={() => setPackingFilter('packed')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition shrink-0 ${
                  packingFilter === 'packed'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {t.packed} ({packedCount})
              </button>
            </div>

            <button
              onClick={handleResetToRecommended}
              className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-medium flex items-center gap-1 transition self-end sm:self-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t.loadRecommendedPacking}</span>
            </button>
          </div>

          {/* Add Packing Item Form */}
          <form
            onSubmit={handleAddItem}
            className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs flex flex-col sm:flex-row gap-2"
          >
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="新增行李物品 (例如：相機腳架、充電轉接頭)..."
              className="flex-1 px-3.5 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs outline-none focus:border-teal-500"
            />
            <select
              value={newItemCat}
              onChange={(e) => setNewItemCat(e.target.value as PackingCategory)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs outline-none"
            >
              {(Object.keys(PACKING_CATEGORY_MAP) as PackingCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {PACKING_CATEGORY_MAP[cat][lang]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition active:scale-95 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新增</span>
            </button>
          </form>

          {/* Packing Items Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredPackingItems.length === 0 ? (
              <div className="col-span-full py-10 text-center text-slate-400 text-xs bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800">
                <p>目前查無符合條件的行李物品</p>
              </div>
            ) : (
              filteredPackingItems.map((item) => {
                const catInfo = PACKING_CATEGORY_MAP[item.category] || PACKING_CATEGORY_MAP.other;
                const IconComponent = catInfo.icon;

                return (
                  <div
                    key={item.id}
                    onClick={(e) => handleTogglePack(item.id, e)}
                    className={`p-3 rounded-2xl border transition flex items-center justify-between gap-2.5 text-xs cursor-pointer group select-none active:scale-[0.99] ${
                      item.packed
                        ? 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-65'
                        : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 shadow-2xs hover:border-teal-400 dark:hover:border-teal-600'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Checkbox (100% contained, no overflow, crisp checkmark) */}
                      <div className="shrink-0">
                        <div
                          className={`w-4 h-4 rounded-md flex items-center justify-center transition-all duration-150 ${
                            item.packed
                              ? 'bg-teal-600 border border-teal-600 text-white shadow-2xs'
                              : 'border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover:border-teal-500'
                          }`}
                        >
                          {item.packed && (
                            <Check className="w-2.5 h-2.5 text-white stroke-[3] animate-in zoom-in-75 duration-150" />
                          )}
                        </div>
                      </div>

                      <IconComponent className="w-3.5 h-3.5 text-slate-400 shrink-0" />

                      <span
                        className={`font-medium truncate ${
                          item.packed
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {item.name}
                      </span>

                      {item.essential && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[10px] font-bold shrink-0">
                          必備
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteItem(item.id);
                      }}
                      className="p-1 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
