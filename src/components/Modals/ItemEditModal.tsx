import React, { useState, useEffect, useRef } from 'react';
import { ItineraryItem, CategoryType } from '../../types/itinerary';
import { searchLocationOSM } from '../../utils/geo';
import { compressImageFile } from '../../utils/image';
import {
  X,
  MapPin,
  Search,
  Clock,
  DollarSign,
  Bookmark,
  Bus,
  FileText,
  Check,
  Navigation,
  Landmark,
  Utensils,
  Train,
  Hotel,
  ShoppingBag,
  Sparkles,
  Pin,
  Camera,
  Trash2,
  Plus,
  Image as ImageIcon,
} from 'lucide-react';

interface ItemEditModalProps {
  item?: ItineraryItem | null;
  dayNumber: number;
  currency: string;
  onSave: (itemData: Omit<ItineraryItem, 'id'>, existingId?: string) => void;
  onClose: () => void;
  onStartMapPick?: () => void;
  pickedCoords?: { lat: number; lng: number } | null;
}

const CATEGORIES: {
  type: CategoryType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}[] = [
  { type: 'spot', label: '景點觀光', icon: Landmark, color: 'border-teal-500 text-teal-700 bg-teal-50 dark:bg-teal-950/40 dark:text-teal-300' },
  { type: 'food', label: '美食品嚐', icon: Utensils, color: 'border-orange-500 text-orange-700 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-300' },
  { type: 'transport', label: '交通移動', icon: Train, color: 'border-sky-500 text-sky-700 bg-sky-50 dark:bg-sky-950/40 dark:text-sky-300' },
  { type: 'hotel', label: '住宿飯店', icon: Hotel, color: 'border-violet-500 text-violet-700 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-300' },
  { type: 'shopping', label: '購物採買', icon: ShoppingBag, color: 'border-pink-500 text-pink-700 bg-pink-50 dark:bg-pink-950/40 dark:text-pink-300' },
  { type: 'activity', label: '特色體驗', icon: Sparkles, color: 'border-rose-500 text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300' },
  { type: 'other', label: '其他行程', icon: Pin, color: 'border-slate-500 text-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-slate-300' },
];

export const ItemEditModal: React.FC<ItemEditModalProps> = ({
  item,
  dayNumber,
  currency,
  onSave,
  onClose,
  onStartMapPick,
  pickedCoords,
}) => {
  const [title, setTitle] = useState(item?.title || '');
  const [category, setCategory] = useState<CategoryType>(item?.category || 'spot');
  const [startTime, setStartTime] = useState(item?.startTime || '09:00');
  const [endTime, setEndTime] = useState(item?.endTime || '');
  const [locationName, setLocationName] = useState(item?.locationName || '');
  const [address, setAddress] = useState(item?.address || '');
  const [lat, setLat] = useState<number | undefined>(pickedCoords ? pickedCoords.lat : item?.lat);
  const [lng, setLng] = useState<number | undefined>(pickedCoords ? pickedCoords.lng : item?.lng);
  const [transportNote, setTransportNote] = useState(item?.transportNote || '');
  const [notes, setNotes] = useState(item?.notes || '');
  const [bookingCode, setBookingCode] = useState(item?.bookingCode || '');
  const [cost, setCost] = useState<string>(item?.cost ? String(item.cost) : '');
  const [costPaid, setCostPaid] = useState(item?.costPaid || false);
  const [memoryPhotos, setMemoryPhotos] = useState<string[]>(item?.memoryPhotos || []);
  const [memoryMood, setMemoryMood] = useState<string>(item?.memoryMood || '✨');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploadingPhoto(true);
    try {
      const compressed: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const url = await compressImageFile(files[i], 1200, 0.8);
        compressed.push(url);
      }
      setMemoryPhotos((prev) => [...prev, ...compressed]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (idx: number) => {
    setMemoryPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  // Free OpenStreetMap search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ name: string; address: string; lat: number; lng: number }>>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Sync pickedCoords if updated externally
  React.useEffect(() => {
    if (pickedCoords) {
      setLat(pickedCoords.lat);
      setLng(pickedCoords.lng);
    }
  }, [pickedCoords]);

  const handleSearchOSM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchLocationOSM(searchQuery);
      setSearchResults(results);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (res: { name: string; address: string; lat: number; lng: number }) => {
    if (!title) setTitle(res.name);
    setLocationName(res.name);
    setAddress(res.address);
    setLat(res.lat);
    setLng(res.lng);
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSave(
      {
        title: title.trim(),
        category,
        startTime,
        endTime: endTime || undefined,
        locationName: locationName.trim() || undefined,
        address: address.trim() || undefined,
        lat,
        lng,
        transportNote: transportNote.trim() || undefined,
        notes: notes.trim() || undefined,
        bookingCode: bookingCode.trim() || undefined,
        cost: cost ? parseFloat(cost) : undefined,
        costPaid,
        memoryPhotos: memoryPhotos.length > 0 ? memoryPhotos : undefined,
        memoryMood: memoryMood || '✨',
        completed: item?.completed || false,
      },
      item?.id
    );
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 my-auto animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50">
          <div>
            <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
              {item ? '編輯行程景點' : `新增第 ${dayNumber} 天行程景點`}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">規劃景點、時間、交通叮嚀與預約代碼</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-3.5 text-xs">
          {/* Category selection */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">行程類別</label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 sm:gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  type="button"
                  key={cat.type}
                  onClick={() => setCategory(cat.type)}
                  className={`flex items-center justify-center gap-1.5 py-1.5 sm:py-2 px-2 rounded-xl border text-[11px] sm:text-xs font-semibold transition ${
                    category === cat.type
                      ? `${cat.color} shadow-xs ring-2 ring-teal-500/20`
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <cat.icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              行程名稱 / 景點名 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：熱田神宮、高山陣屋、兼六園"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none text-xs text-slate-800 dark:text-slate-100 font-medium"
            />
          </div>

          {/* Time schedule */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-teal-600" />
                <span>開始時間</span> <span className="text-rose-500">*</span>
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-teal-500 outline-none font-medium"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>結束時間 (可選)</span>
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-teal-500 outline-none font-medium"
              />
            </div>
          </div>

          {/* Location & Map Coordinates */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-3 sm:p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                <MapPin className="w-4 h-4 text-teal-600" />
                地點與地圖座標
              </span>
              {onStartMapPick && (
                <button
                  type="button"
                  onClick={onStartMapPick}
                  className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 shadow-xs transition"
                >
                  <MapPin className="w-3 h-3" />
                  地圖選點
                </button>
              )}
            </div>

            {/* Free OSM Search */}
            <div className="relative">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="免費搜尋地名或景點 (例如：清水寺、金澤鼓門)"
                  className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:border-teal-500 outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearchOSM(e);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleSearchOSM}
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-3 py-1.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 disabled:opacity-50 text-white rounded-lg font-medium text-xs flex items-center gap-1 transition"
                >
                  <Search className="w-3 h-3" />
                  <span>{isSearching ? '搜尋中...' : '搜尋'}</span>
                </button>
              </div>

              {/* Search suggestions dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 max-h-48 overflow-y-auto z-30 p-1 divide-y divide-slate-100 dark:divide-slate-700">
                  {searchResults.map((res, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => handleSelectSearchResult(res)}
                      className="w-full text-left p-2 hover:bg-teal-50 dark:hover:bg-slate-700 rounded-lg transition text-[11px]"
                    >
                      <p className="font-bold text-slate-800 dark:text-slate-100">{res.name}</p>
                      <p className="text-slate-500 dark:text-slate-400 truncate text-[10px]">{res.address}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-600 dark:text-slate-400 block mb-0.5">地點名稱</label>
                <input
                  type="text"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="例如：名古屋城"
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-600 dark:text-slate-400 block mb-0.5">地址</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="詳細地址 (選填)"
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-600 dark:text-slate-400 block mb-0.5">緯度 (Latitude)</label>
                <input
                  type="number"
                  step="any"
                  value={lat ?? ''}
                  onChange={(e) => setLat(e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="例如：35.1856"
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs outline-none font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-600 dark:text-slate-400 block mb-0.5">經度 (Longitude)</label>
                <input
                  type="number"
                  step="any"
                  value={lng ?? ''}
                  onChange={(e) => setLng(e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="例如：136.8991"
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs outline-none font-mono"
                />
              </div>
            </div>
          </div>

          {/* Transport guidance */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
              <Bus className="w-3.5 h-3.5 text-teal-600" />
              <span>交通與轉乘指引</span>
            </label>
            <input
              type="text"
              value={transportNote}
              onChange={(e) => setTransportNote(e.target.value)}
              placeholder="例如：搭乘地鐵至名古屋城站、公車206號至兼六園下"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-teal-500 outline-none text-xs"
            />
          </div>

          {/* Notes and Booking Code */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Bookmark className="w-3.5 h-3.5 text-teal-600" />
                <span>預約代碼 / 票券編號 (選填)</span>
              </label>
              <input
                type="text"
                value={bookingCode}
                onChange={(e) => setBookingCode(e.target.value)}
                placeholder="例如：100名城-No.44 或 預訂號"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-teal-500 outline-none text-xs font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-teal-600" />
                <span>預估花費 ({currency})</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-teal-500 outline-none text-xs font-mono"
                />
                <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 cursor-pointer text-[11px] select-none hover:text-teal-600 transition">
                  <input
                    type="checkbox"
                    checked={costPaid}
                    onChange={(e) => setCostPaid(e.target.checked)}
                    className="w-4 h-4 rounded accent-teal-600 cursor-pointer"
                  />
                  <span>已付款</span>
                </label>
              </div>
            </div>
          </div>

          {/* Detailed Memo Notes */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-teal-600" />
              <span>景點參觀備忘與推薦特色</span>
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例如：參觀重點、必嚐招牌、門票折扣、開放時間提醒..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-teal-500 outline-none text-xs leading-relaxed"
            />
          </div>

          {/* Journey Memory Photos for Album & Polaroid */}
          <div className="p-3.5 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-rose-950 dark:text-rose-200 flex items-center gap-1.5 text-xs">
                <Camera className="w-4 h-4 text-rose-600" />
                <span>景點打卡回憶相片 (事後回憶相簿與拍立得)</span>
              </label>
              <span className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">
                已選 {memoryPhotos.length} 張
              </span>
            </div>

            {/* Mood selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-[10px] font-bold text-slate-500 shrink-0">打卡心情：</span>
              {['✨', '❄️', '☀️', '🍜', '🌸', '🍁', '☕', '🏯', '🛍️'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setMemoryMood(emoji)}
                  className={`w-7 h-7 rounded-xl text-xs flex items-center justify-center transition shrink-0 ${
                    memoryMood === emoji
                      ? 'bg-rose-600 text-white shadow-2xs scale-105'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <input
              type="file"
              ref={photoInputRef}
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoFiles}
            />

            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={isUploadingPhoto}
              className="w-full py-2.5 px-3 border-2 border-dashed border-rose-300 dark:border-rose-800/80 hover:border-rose-500 bg-white/70 dark:bg-slate-800/60 rounded-xl flex items-center justify-center gap-2 text-rose-700 dark:text-rose-300 text-xs font-semibold transition active:scale-98"
            >
              <ImageIcon className="w-4 h-4 text-rose-600" />
              <span>
                {isUploadingPhoto ? '照片壓縮處理中...' : '拍照或選取打卡回憶相片 (自動排版為相簿/拍立得)'}
              </span>
            </button>

            {memoryPhotos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
                {memoryPhotos.map((photo, idx) => (
                  <div key={idx} className="relative group rounded-xl overflow-hidden border border-rose-200 dark:border-rose-900/60 aspect-square">
                    <img src={photo} alt={`Memory ${idx}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(idx)}
                      className="absolute top-1 right-1 p-1 bg-black/70 hover:bg-rose-600 text-white rounded-full transition"
                      title="移除此相片"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-400">
              💡 儲存後可前往「旅程相簿」頁面一鍵匯出或拿至照相館沖印拍立得卡片！
            </p>
          </div>

          {/* Footer Submit */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs transition"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-md transition active:scale-95 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>儲存景點行程</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
