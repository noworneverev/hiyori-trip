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
  X,
  AlertCircle,
  BookOpen,
  MapPin,
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
  completed?: boolean;
}

const STICKY_CATS = [
  { key: 'locker', label: '置物櫃', icon: Package, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300' },
  { key: 'seat', label: '車次座位', icon: Train, color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/60 dark:text-sky-300' },
  { key: 'hotel', label: '住宿密碼', icon: Key, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300' },
  { key: 'other', label: '隨身速記', icon: Bookmark, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300' },
] as const;

const OFFICIAL_EMERGENCY_HOTLINES = [
  {
    id: 'jp-police',
    name: '警察報案專線 (報警/遺失物)',
    shortName: '警察 110',
    number: '110',
    description: '遺失物品、遭竊、交通意外報警 (日本與台灣皆為 110)',
    badge: '24小時',
    badgeColor: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
  },
  {
    id: 'jp-ambulance',
    name: '消防與救護車急救專線',
    shortName: '救護 119',
    number: '119',
    description: '突發重大傷病、火警求援 (日本與台灣皆為 119)',
    badge: '緊急救護',
    badgeColor: 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300',
  },
  {
    id: 'mofa-hotline',
    name: '外交部旅外國人急難救助專線',
    shortName: '外交部全球專線',
    number: '+886-800-085-095',
    altNumber: '+886-3-398-2629',
    description: '護照遺失、重大天災、傷病急難 (諧音：您幫我 您救我)',
    badge: '全球免付費',
    badgeColor: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300',
  },
  {
    id: 'jnto-callcenter',
    name: '日本觀光局 (JNTO) 旅客求助熱線',
    shortName: 'JNTO 訪日諮詢',
    number: '050-3816-2720',
    description: '多語支援 (中文/英/日/韓)、天災避難諮詢與即時交通受阻引導',
    badge: '支援中文',
    badgeColor: 'bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300',
  },
  {
    id: 'teco-japan',
    name: '台北駐日經濟文化代表處 (東京總處)',
    shortName: '駐日代表處',
    number: '+81-3-3280-7811',
    description: '駐日館處代表號 (緊急急難手機: +81-80-1009-7179 / 7435)',
    badge: '駐外館處',
    badgeColor: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300',
  },
  {
    id: 'jp-medical-advice',
    name: '日本急診醫療諮詢專線 (#7119)',
    shortName: '急診諮詢 #7119',
    number: '#7119',
    description: '不確定是否需叫救護車時之專業醫師/護理師電話諮詢評估',
    badge: '急診諮詢',
    badgeColor: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
  },
] as const;

export const MemoTab: React.FC<MemoTabProps> = ({ trip, lang, onUpdateTrip }) => {
  const t = TRANSLATIONS[lang];
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showEmergencyGuide, setShowEmergencyGuide] = useState(false);
  const [tripNotes, setTripNotes] = useState(trip.notes || '');
  const [isSavedNotes, setIsSavedNotes] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);

  // Close guide modal on Escape
  useEffect(() => {
    if (!showEmergencyGuide) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowEmergencyGuide(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showEmergencyGuide]);

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

  const handleToggleStickyComplete = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setStickyNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, completed: !n.completed } : n))
    );
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

              const isDone = !!note.completed;

              return (
                <div
                  key={note.id}
                  className={`p-3.5 rounded-2xl border flex items-start gap-3 transition shadow-2xs ${
                    isDone
                      ? 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800 opacity-80'
                      : 'bg-slate-50/80 dark:bg-slate-800/80 border-slate-200/90 dark:border-slate-700/80 hover:border-amber-400 dark:hover:border-amber-600/80'
                  }`}
                >
                  {/* Checkbox button */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleStickyComplete(note.id, e)}
                    className={`mt-0.5 shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition active:scale-90 ${
                      isDone
                        ? 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700'
                        : 'border-2 border-slate-300 dark:border-slate-600 hover:border-amber-500 bg-white dark:bg-slate-900 text-transparent hover:text-slate-300'
                    }`}
                    title={isDone ? '點擊取消打勾 (標記為未完成)' : '點擊打勾 (標記為已完成)'}
                  >
                    <Check className={`w-3.5 h-3.5 ${isDone ? 'stroke-[3]' : 'opacity-0 hover:opacity-40'}`} />
                  </button>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-lg font-bold text-[11px] flex items-center gap-1 ${
                        isDone
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          : matched.color
                      }`}>
                        <Icon className="w-3 h-3" />
                        <span>{matched.label}</span>
                      </span>
                      <h4 className={`font-bold text-xs truncate ${isDone ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-900 dark:text-white'}`}>
                        {note.label}
                      </h4>
                      {isDone && (
                        <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[10px] flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5" />
                          <span>已完成</span>
                        </span>
                      )}
                    </div>

                    <div
                      onClick={() => handleStartEditSticky(note)}
                      className={`text-xs font-bold font-mono p-2.5 rounded-xl border break-words cursor-pointer transition ${
                        isDone
                          ? 'line-through text-slate-400 dark:text-slate-500 bg-slate-100/60 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-800/50'
                          : 'text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-600'
                      }`}
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

      {/* 3. Emergency & Safety Section (行前準備與備忘 - 安全專區) */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-4">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
              <span>當地緊急聯絡電話與安全專區</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {lang === 'zh'
                ? '內建官方警察、救護車、外交部急難救助熱線，並可新增飯店及隨行緊急聯絡人'
                : 'Built-in police, ambulance, embassy emergency contacts and custom personal contacts'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowEmergencyGuide(true)}
              className="px-3.5 py-2 min-h-[40px] rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-semibold text-xs flex items-center gap-1.5 transition active:scale-95 border border-rose-200/60 dark:border-rose-900/60"
            >
              <BookOpen className="w-4 h-4" />
              <span>求助應變指引</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddContact(!showAddContact)}
              className="px-3.5 py-2 min-h-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center gap-1.5 transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>新增聯絡人</span>
            </button>
          </div>
        </div>

        {/* 1. Official Preset Emergency Hotlines Grid */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">
              官方與當地緊急求助專線 (一鍵快速撥號)
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {OFFICIAL_EMERGENCY_HOTLINES.map((hotline) => (
              <div
                key={hotline.id}
                className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition"
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-bold text-slate-900 dark:text-white text-xs truncate">
                      {hotline.shortName}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${hotline.badgeColor}`}
                    >
                      {hotline.badge}
                    </span>
                  </div>
                  <p className="font-mono font-black text-rose-600 dark:text-rose-400 text-base mt-1 tracking-wide">
                    {hotline.number}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {hotline.description}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/50 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyText(hotline.number, hotline.id)}
                    className="flex-1 min-h-[38px] py-1.5 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold flex items-center justify-center gap-1 shadow-2xs hover:bg-slate-100 transition active:scale-95"
                  >
                    {copiedId === hotline.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedId === hotline.id ? '已複製' : '複製'}</span>
                  </button>

                  <a
                    href={`tel:${hotline.number}`}
                    className="flex-1 min-h-[38px] py-1.5 px-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-2xs transition active:scale-95"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>撥打</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add Contact Inline Form */}
        {showAddContact && (
          <form
            onSubmit={handleAddContact}
            className="p-4 rounded-2xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 space-y-3 text-xs animate-in fade-in duration-150"
          >
            <div className="font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5 text-xs">
              <Plus className="w-4 h-4" />
              <span>新增個人或飯店緊急聯絡人</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <span className="font-semibold text-slate-700 dark:text-slate-300">單位或名稱：</span>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="例如：東京王子飯店櫃檯、海外保險救援專線"
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
                <span className="font-semibold text-slate-700 dark:text-slate-300">地址或位置（選填）：</span>
                <input
                  type="text"
                  value={contactAddress}
                  onChange={(e) => setContactAddress(e.target.value)}
                  placeholder="例如：東京都港區芝公園..."
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 outline-hidden text-xs"
                />
              </div>

              <div className="space-y-1">
                <span className="font-semibold text-slate-700 dark:text-slate-300">備註說明（選填）：</span>
                <input
                  type="text"
                  value={contactNote}
                  onChange={(e) => setContactNote(e.target.value)}
                  placeholder="例如：24小時中文櫃檯、房號 1204"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 outline-hidden text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddContact(false)}
                className="px-4 py-2 min-h-[40px] border border-slate-300 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 font-semibold"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-5 py-2 min-h-[40px] bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs"
              >
                儲存聯絡人
              </button>
            </div>
          </form>
        )}

        {/* 2. Custom User Contacts List */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">
              自訂旅程聯絡人 (飯店 / 保險 / 旅伴 / 家屬)
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                        title="刪除此聯絡人"
                        aria-label="刪除此聯絡人"
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
                      className="px-3 min-h-[38px] py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold flex items-center gap-1 shadow-2xs hover:bg-slate-100 transition active:scale-95"
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
                      className="px-4 min-h-[38px] py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-2xs transition active:scale-95"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>撥打電話</span>
                    </a>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-5 text-center text-xs text-slate-400 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                尚未新增自訂聯絡人，點擊上方「新增聯絡人」按鈕即可填入飯店或私人急難號碼。
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Full Emergency Guide Modal with Guaranteed Easy-to-Close UX */}
      {showEmergencyGuide && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-150"
          onClick={() => setShowEmergencyGuide(false)}
        >
          <div
            className="max-w-xl w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header with Enlarged Touch Hitbox Close Button (>=44px) */}
            <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200/60 dark:border-rose-900/60">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    海外旅遊急難求助與應變指南
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    離線時亦可隨時查閱撥打，保障行車、財物與生命安全
                  </p>
                </div>
              </div>

              {/* Enlarged 44px Close Button */}
              <button
                type="button"
                onClick={() => setShowEmergencyGuide(false)}
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition active:scale-90 cursor-pointer shadow-2xs"
                title="關閉求助熱線卡片"
                aria-label="關閉求助熱線卡片"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs">
              {/* Important Emergency Call List */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5 uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  <Phone className="w-3.5 h-3.5" />
                  <span>各項官方急難求助電話</span>
                </h4>

                <div className="space-y-2.5">
                  {OFFICIAL_EMERGENCY_HOTLINES.map((item) => (
                    <div
                      key={`modal-${item.id}`}
                      className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white text-xs">
                            {item.name}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${item.badgeColor}`}
                          >
                            {item.badge}
                          </span>
                        </div>
                        <p className="font-mono font-black text-rose-600 dark:text-rose-400 text-sm">
                          {item.number}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          {item.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyText(item.number, `modal-${item.id}`)}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center gap-1 shadow-2xs hover:bg-slate-100 transition active:scale-95"
                        >
                          {copiedId === `modal-${item.id}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedId === `modal-${item.id}` ? '已複製' : '複製'}</span>
                        </button>
                        <a
                          href={`tel:${item.number}`}
                          className="min-h-[40px] px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition active:scale-95"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>立刻撥號</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4 Steps Checklist for Emergencies */}
              <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 space-y-2.5">
                <h4 className="font-bold text-amber-900 dark:text-amber-200 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>遇到緊急意外處理標準流程 (SOP)</span>
                </h4>
                <ol className="space-y-1.5 text-slate-700 dark:text-slate-300 text-[11px] list-decimal list-inside leading-relaxed">
                  <li>
                    <strong className="text-slate-900 dark:text-white">遺失物品或遭竊：</strong>
                    前往就近交番（派出所）報警（110），務必索取「受害屆出證明書」，以備回國向保險公司申請理賠。
                  </li>
                  <li>
                    <strong className="text-slate-900 dark:text-white">身體不適或急性就醫：</strong>
                    撥打 119 或 #7119。就醫後務必向醫院索取英文診斷證明書（Medical Certificate）與正本醫療收據。
                  </li>
                  <li>
                    <strong className="text-slate-900 dark:text-white">護照不慎遺失：</strong>
                    先向當地警局報案取得報案證明，再聯絡駐外代表處（+81-3-3280-7811）申辦返國用的入國證明書。
                  </li>
                  <li>
                    <strong className="text-slate-900 dark:text-white">重大事故急難救助：</strong>
                    直撥外交部旅外國人 24 小時急難救助專線（+886-800-085-095），由專責人員提供即時跨國協助。
                  </li>
                </ol>
              </div>
            </div>

            {/* Modal Footer with Guaranteed Prominent Large Close Button */}
            <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
              <button
                type="button"
                onClick={() => setShowEmergencyGuide(false)}
                className="w-full min-h-[48px] py-3.5 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-white font-bold text-sm shadow-md transition active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
                <span>完成 · 關閉求助熱線卡片</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
