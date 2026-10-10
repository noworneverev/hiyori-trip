import React, { useState, useEffect, useRef } from 'react';
import { Trip, EmergencyContact } from '../../types/itinerary';
import { Language, TRANSLATIONS } from '../../utils/i18n';
import {
  ShieldAlert,
  Phone,
  Plus,
  Trash2,
  Copy,
  Check,
  FileText,
  Plane,
  Building,
  Wifi,
  ShoppingBag,
  Info,
  CheckCircle,
  ExternalLink,
  Edit2,
  Package,
  Key,
  Train,
  Bookmark,
  Sparkles,
} from 'lucide-react';

interface MemoTabProps {
  trip: Trip;
  lang: Language;
  onUpdateTrip: (updatedTrip: Trip) => void;
}

interface StickyNoteItem {
  id: string;
  category: 'locker' | 'seat' | 'hotel' | 'other';
  label: string;
  content: string;
  createdAt: number;
}

const STICKY_CATS = [
  { key: 'locker', label: '置物櫃', icon: Package, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300' },
  { key: 'seat', label: '車次座位', icon: Train, color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/60 dark:text-sky-300' },
  { key: 'hotel', label: '住宿密碼', icon: Key, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300' },
  { key: 'other', label: '隨身速記', icon: Bookmark, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300' },
] as const;

export const MemoTab: React.FC<MemoTabProps> = ({ trip, lang, onUpdateTrip }) => {
  const t = TRANSLATIONS[lang];
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tripNotes, setTripNotes] = useState(trip.notes || '');
  const [isSavedNotes, setIsSavedNotes] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);

  // Sync state whenever trip changes
  useEffect(() => {
    setTripNotes(trip.notes || '');
  }, [trip.id, trip.notes]);

  // Debounced auto-save so user never loses what they typed
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setIsAutoSaving(true);
    const timer = setTimeout(() => {
      if (tripNotes !== (trip.notes || '')) {
        onUpdateTrip({
          ...trip,
          notes: tripNotes,
          updatedAt: Date.now(),
        });
        setIsSavedNotes(true);
        setIsAutoSaving(false);
        setTimeout(() => setIsSavedNotes(false), 2000);
      } else {
        setIsAutoSaving(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [tripNotes]);

  // Quick Sticky Notes synced with local storage (same as quick action modal)
  const STORAGE_KEY_NOTES = `hiyori_scratchpad_${trip.id}`;
  const [stickyNotes, setStickyNotes] = useState<StickyNoteItem[]>(() => {
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

  const [newStickyLabel, setNewStickyLabel] = useState('');
  const [newStickyContent, setNewStickyContent] = useState('');
  const [newStickyCat, setNewStickyCat] = useState<'locker' | 'seat' | 'hotel' | 'other'>('locker');
  const [showAddSticky, setShowAddSticky] = useState(false);

  const [editingStickyId, setEditingStickyId] = useState<string | null>(null);
  const [editStickyLabel, setEditStickyLabel] = useState('');
  const [editStickyContent, setEditStickyContent] = useState('');
  const [editStickyCat, setEditStickyCat] = useState<'locker' | 'seat' | 'hotel' | 'other'>('locker');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(stickyNotes));
    } catch {}
  }, [stickyNotes, STORAGE_KEY_NOTES]);

  const handleAddSticky = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStickyContent.trim()) return;
    const cat = STICKY_CATS.find((c) => c.key === newStickyCat) || STICKY_CATS[0];
    const newNote: StickyNoteItem = {
      id: `sticky-${Date.now()}`,
      category: newStickyCat,
      label: newStickyLabel.trim() || cat.label,
      content: newStickyContent.trim(),
      createdAt: Date.now(),
    };
    setStickyNotes([newNote, ...stickyNotes]);
    setNewStickyLabel('');
    setNewStickyContent('');
    setShowAddSticky(false);
  };

  const handleStartEditSticky = (note: StickyNoteItem) => {
    setEditingStickyId(note.id);
    setEditStickyLabel(note.label);
    setEditStickyContent(note.content);
    setEditStickyCat(note.category);
  };

  const handleSaveEditSticky = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingStickyId || !editStickyContent.trim()) return;
    setStickyNotes((prev) =>
      prev.map((n) =>
        n.id === editingStickyId
          ? {
              ...n,
              label: editStickyLabel.trim() || '隨身便籤',
              content: editStickyContent.trim(),
              category: editStickyCat,
            }
          : n
      )
    );
    setEditingStickyId(null);
  };

  const handleDeleteSticky = (id: string) => {
    setStickyNotes(stickyNotes.filter((n) => n.id !== id));
    if (editingStickyId === id) setEditingStickyId(null);
  };

  const [showAddContact, setShowAddContact] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactAddress, setContactAddress] = useState('');
  const [contactNote, setContactNote] = useState('');

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveNotes = () => {
    onUpdateTrip({
      ...trip,
      notes: tripNotes,
      updatedAt: Date.now(),
    });
    setIsSavedNotes(true);
    setTimeout(() => setIsSavedNotes(false), 2000);
  };

  const handleAppendTemplate = (templateText: string) => {
    const updated = tripNotes.trim()
      ? `${tripNotes.trim()}\n\n${templateText}`
      : templateText;
    setTripNotes(updated);
    onUpdateTrip({
      ...trip,
      notes: updated,
      updatedAt: Date.now(),
    });
    setIsSavedNotes(true);
    setTimeout(() => setIsSavedNotes(false), 2000);
  };

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactPhone.trim()) return;

    const newContact: EmergencyContact = {
      id: `em-${Date.now()}`,
      name: contactName.trim(),
      phone: contactPhone.trim(),
      address: contactAddress.trim() || undefined,
      note: contactNote.trim() || undefined,
      type: 'custom',
    };

    onUpdateTrip({
      ...trip,
      emergencyContacts: [...trip.emergencyContacts, newContact],
      updatedAt: Date.now(),
    });

    setContactName('');
    setContactPhone('');
    setContactAddress('');
    setContactNote('');
    setShowAddContact(false);
  };

  const handleDeleteContact = (id: string) => {
    onUpdateTrip({
      ...trip,
      emergencyContacts: trip.emergencyContacts.filter((c) => c.id !== id),
      updatedAt: Date.now(),
    });
  };

  return (
    <div className="space-y-5 pb-8">
      {/* 1. Quick Sticky Notes Section (隨身便籤卡片：置物櫃、房號、車次等) */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 gap-2">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Bookmark className="w-5 h-5 text-amber-500" />
              <span>隨身速記便籤 ({stickyNotes.length})</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {lang === 'zh'
                ? '出國隨手記錄置物櫃密碼、新幹線車次座位、住宿大門密碼，隨時查看'
                : 'Quick notes for locker codes, train seats, and hotel door codes'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddSticky(!showAddSticky)}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-2xs self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新增速記便籤</span>
          </button>
        </div>

        {/* Add Sticky Note Form */}
        {showAddSticky && (
          <form
            onSubmit={handleAddSticky}
            className="p-4 rounded-2xl bg-amber-50/50 dark:bg-slate-800/80 border border-amber-200 dark:border-slate-700 space-y-3 animate-in fade-in duration-100 text-xs"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>新增隨身便籤</span>
              </span>
              <button
                type="button"
                onClick={() => setShowAddSticky(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                取消
              </button>
            </div>

            {/* Category Select Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {STICKY_CATS.map((c) => {
                const Icon = c.icon;
                const isSelected = newStickyCat === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setNewStickyCat(c.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border flex items-center gap-1.5 shrink-0 ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-600 font-black shadow-xs'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              value={newStickyLabel}
              onChange={(e) => setNewStickyLabel(e.target.value)}
              placeholder="便籤標題 (如：金澤站置物櫃 / 車次 8 車 12B / 飯店大門密碼)..."
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-white outline-none focus:border-amber-500"
            />

            <div className="flex items-center gap-2">
              <input
                type="text"
                required
                value={newStickyContent}
                onChange={(e) => setNewStickyContent(e.target.value)}
                placeholder="便籤內容 (如：#24 號櫃密碼 7789 / 密碼 1234*)..."
                className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono font-medium text-slate-800 dark:text-white outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shrink-0 transition active:scale-95"
              >
                確認新增
              </button>
            </div>
          </form>
        )}

        {/* Sticky Notes Grid */}
        {stickyNotes.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            尚無速記便籤，點擊「新增速記便籤」快速記錄房號、置物櫃或密碼！
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {stickyNotes.map((note) => {
              const matched = STICKY_CATS.find((c) => c.key === note.category) || STICKY_CATS[3];
              const Icon = matched.icon;
              const isEditing = editingStickyId === note.id;

              if (isEditing) {
                return (
                  <form
                    key={note.id}
                    onSubmit={handleSaveEditSticky}
                    className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-slate-800 border-2 border-amber-500 space-y-2.5 shadow-md animate-in fade-in duration-100 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                        <Edit2 className="w-3.5 h-3.5 text-amber-600" />
                        <span>編輯便籤</span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingStickyId(null)}
                          className="px-2.5 py-1 rounded-lg text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-700 text-xs font-medium"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveEditSticky}
                          className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center gap-1 shadow-xs transition active:scale-95"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>儲存</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1">
                      {STICKY_CATS.map((cat) => {
                        const CatIcon = cat.icon;
                        return (
                          <button
                            key={cat.key}
                            type="button"
                            onClick={() => setEditStickyCat(cat.key)}
                            className={`py-1 px-1 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition ${
                              editStickyCat === cat.key
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
                      value={editStickyLabel}
                      onChange={(e) => setEditStickyLabel(e.target.value)}
                      placeholder="便籤標題..."
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-amber-500"
                    />

                    <textarea
                      rows={2}
                      value={editStickyContent}
                      onChange={(e) => setEditStickyContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          handleSaveEditSticky();
                        }
                      }}
                      placeholder="便籤內容..."
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold font-mono text-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                    />
                  </form>
                );
              }

              return (
                <div
                  key={note.id}
                  className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 flex items-start justify-between gap-3 shadow-2xs hover:border-amber-400 dark:hover:border-amber-600/80 transition"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-lg font-bold text-[11px] flex items-center gap-1 ${matched.color}`}>
                        <Icon className="w-3 h-3" />
                        <span>{matched.label}</span>
                      </span>
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                        {note.label}
                      </h4>
                    </div>

                    <div
                      onClick={() => handleStartEditSticky(note)}
                      className="text-xs font-bold font-mono text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 break-words cursor-pointer hover:border-amber-400 dark:hover:border-amber-600 transition"
                      title="點擊可直接編輯此便籤"
                    >
                      {note.content}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                    <button
                      type="button"
                      onClick={() => handleCopyText(note.content, note.id)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition"
                      title="複製內容"
                    >
                      {copiedId === note.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartEditSticky(note)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-slate-500 hover:text-amber-600 transition"
                      title="編輯此便籤"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSticky(note.id)}
                      className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 transition"
                      title="刪除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Main Travel Memo & Scratchpad Notebook (Top Priority) */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 gap-2">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <FileText className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              <span>{t.travelMemo}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {lang === 'zh'
                ? '隨意編輯筆記、出發叮嚀、預約號碼，輸入即時自動保存'
                : 'Freeform notes, booking codes, and itineraries with real-time auto-save'}
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
            {/* Real-time Auto-save Indicator */}
            <div className="text-[11px] font-medium flex items-center gap-1.5">
              {isAutoSaving ? (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>自動儲存中...</span>
                </span>
              ) : isSavedNotes ? (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>已自動儲存</span>
                </span>
              ) : (
                <span className="text-slate-400">已同步</span>
              )}
            </div>

            <button
              onClick={handleSaveNotes}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>手動立即儲存</span>
            </button>
          </div>
        </div>

        {/* Quick Template Insert Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-slate-400 font-medium">快速插入範本：</span>
          <button
            type="button"
            onClick={() =>
              handleAppendTemplate('【航班資訊】\n• 去程航班：\n• 起飛時間：\n• 航廈航廈：\n• 訂位代號：\n• 回程航班：')
            }
            className="px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1 transition active:scale-95"
          >
            <Plane className="w-3 h-3 text-sky-600" />
            <span>+ 航班資訊</span>
          </button>

          <button
            type="button"
            onClick={() =>
              handleAppendTemplate('【飯店入住憑證】\n• 飯店名稱：\n• 地址：\n• 入住時間：15:00 後\n• 退房時間：11:00 前\n• 訂房代號：')
            }
            className="px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1 transition active:scale-95"
          >
            <Building className="w-3 h-3 text-indigo-600" />
            <span>+ 飯店憑證</span>
          </button>

          <button
            type="button"
            onClick={() =>
              handleAppendTemplate('【上網與通訊】\n• eSIM / SIM卡供應商：\n• 開通 APN 設定：\n• 漫遊客服專線：')
            }
            className="px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1 transition active:scale-95"
          >
            <Wifi className="w-3 h-3 text-emerald-600" />
            <span>+ 上網設定</span>
          </button>

          <button
            type="button"
            onClick={() =>
              handleAppendTemplate('【必買伴手禮清單】\n• 1. \n• 2. \n• 3. ')
            }
            className="px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1 transition active:scale-95"
          >
            <ShoppingBag className="w-3 h-3 text-rose-600" />
            <span>+ 伴手禮清單</span>
          </button>
        </div>

        <textarea
          rows={9}
          value={tripNotes}
          onChange={(e) => setTripNotes(e.target.value)}
          onBlur={handleSaveNotes}
          placeholder={
            lang === 'zh'
              ? '在此隨意輸入此趟旅程的所有自由筆記、出發叮嚀、預約確認信內容或貼入重要資訊 (即時自動儲存)...'
              : 'Type notes, confirmation numbers, reservations here (auto-saved)...'
          }
          className="w-full p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 focus:ring-2 focus:ring-teal-500/25 focus:border-teal-500 outline-hidden text-xs leading-relaxed font-mono bg-slate-50/60 dark:bg-slate-800/50 text-slate-800 dark:text-slate-100"
        />

        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
          <span>共 {tripNotes.length} 個字元</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleCopyText(tripNotes, 'all-memo')}
              className="text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 font-semibold"
            >
              {copiedId === 'all-memo' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copiedId === 'all-memo' ? '已複製全部' : '複製全部筆記'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Pre-trip Checklist & Reminders (Middle) */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-3">
        <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
          <Info className="w-4 h-4 text-teal-600" />
          <span>出國出發前必查叮嚀事項</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/40 space-y-1">
            <span className="font-bold text-teal-900 dark:text-teal-200 block">護照有效期限</span>
            <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
              確認護照有效期限距回程日期至少有 6 個月以上，並備妥手機電子檔截圖。
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-sky-50/50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 space-y-1">
            <span className="font-bold text-sky-900 dark:text-sky-200 block">海外刷卡與換匯</span>
            <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
              開啟信用卡海外交易功能，並準備部分外幣現鈔應付交通票卡加值或傳統小吃。
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 space-y-1">
            <span className="font-bold text-amber-900 dark:text-amber-200 block">旅遊平安與不便險</span>
            <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
              投保海外急難救助與班機延誤不便險，並將保單英文證明與救援專線號碼留存。
            </p>
          </div>
        </div>
      </div>

      {/* 3. Emergency Contacts (Firmly at the Very Bottom as Requested!) */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
              <span>當地緊急聯絡電話與救助 (備用參考)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {lang === 'zh'
                ? '當地警察、救護車、駐外館處及飯店緊急聯絡方式（置於頁面最底端便於快速查閱）'
                : 'Local emergency numbers, medical aid, and embassy contacts'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddContact(!showAddContact)}
            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center gap-1 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新增聯絡人</span>
          </button>
        </div>

        {/* Add Contact Inline Form */}
        {showAddContact && (
          <form
            onSubmit={handleAddContact}
            className="p-4 rounded-2xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 space-y-3 text-xs animate-in fade-in duration-150"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <span className="font-semibold text-slate-700 dark:text-slate-300">單位或名稱：</span>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="例如：海外緊急救援專線、飯店櫃檯"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 outline-hidden text-xs"
                />
              </div>

              <div className="space-y-1">
                <span className="font-semibold text-slate-700 dark:text-slate-300">電話號碼：</span>
                <input
                  type="tel"
                  required
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="例如：+81-3-1234-5678"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 outline-hidden text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <span className="font-semibold text-slate-700 dark:text-slate-300">地址（選填）：</span>
                <input
                  type="text"
                  value={contactAddress}
                  onChange={(e) => setContactAddress(e.target.value)}
                  placeholder="例如：東京都港區..."
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 outline-hidden text-xs"
                />
              </div>

              <div className="space-y-1">
                <span className="font-semibold text-slate-700 dark:text-slate-300">備註說明（選填）：</span>
                <input
                  type="text"
                  value={contactNote}
                  onChange={(e) => setContactNote(e.target.value)}
                  placeholder="例如：24小時中文服務"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 outline-hidden text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddContact(false)}
                className="px-3.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 font-semibold"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs"
              >
                儲存聯絡人
              </button>
            </div>
          </form>
        )}

        {/* Contacts Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {trip.emergencyContacts && trip.emergencyContacts.length > 0 ? (
            trip.emergencyContacts.map((contact) => (
              <div
                key={contact.id}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-800 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white text-xs">
                      {contact.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteContact(contact.id)}
                      className="p-1 text-slate-400 hover:text-rose-500 rounded-lg transition"
                      title="刪除此聯絡人"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="font-mono font-bold text-teal-700 dark:text-teal-400 text-sm mt-1">
                    {contact.phone}
                  </p>

                  {contact.note && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {contact.note}
                    </p>
                  )}

                  {contact.address && (
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {contact.address}
                    </p>
                  )}
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyText(contact.phone, contact.id)}
                    className="px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold flex items-center gap-1 shadow-2xs hover:bg-slate-100 transition active:scale-95"
                  >
                    {copiedId === contact.id ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedId === contact.id ? '已複製' : '複製號碼'}</span>
                  </button>

                  <a
                    href={`tel:${contact.phone}`}
                    className="px-3.5 py-1 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold flex items-center gap-1 shadow-2xs transition active:scale-95"
                  >
                    <Phone className="w-3 h-3" />
                    <span>撥打電話</span>
                  </a>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-2 py-4 text-center text-xs text-slate-400">
              尚無緊急聯絡人，點擊上方按鈕即可快速新增。
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
