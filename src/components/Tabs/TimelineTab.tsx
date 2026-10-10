import React, { useState } from 'react';
import { Trip, DayPlan, ItineraryItem } from '../../types/itinerary';
import { LeafletMap, CATEGORY_COLORS } from '../Map/LeafletMap';
import { calculateDistanceKm, formatDistance, estimateTravelTime, getGoogleMapsNavigationUrl } from '../../utils/geo';
import { formatDateSlash, formatMonthDaySlash } from '../../utils/date';
import { Language, TRANSLATIONS } from '../../utils/i18n';
import { ItineraryOverviewTable } from '../Itinerary/ItineraryOverviewTable';
import {
  Calendar,
  Clock,
  MapPin,
  Navigation,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit2,
  CheckCircle2,
  Circle,
  Bus,
  Bookmark,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Map as MapIcon,
  Footprints,
  Landmark,
  Utensils,
  Train,
  Hotel,
  Camera,
  ShoppingBag,
  Sparkles,
  Pin,
  Compass,
} from 'lucide-react';

interface TimelineTabProps {
  trip: Trip;
  lang: Language;
  onUpdateTrip: (updatedTrip: Trip) => void;
  onOpenAddItem: (dayNumber: number) => void;
  onOpenEditItem: (item: ItineraryItem, dayNumber: number) => void;
  isPickMode: boolean;
  onStartMapPick: () => void;
  pickedCoords: { lat: number; lng: number } | null;
  onPickLocation: (lat: number, lng: number) => void;
  onOpenMemories?: (spotId?: string) => void;
}

const CATEGORY_MAP: Record<string, { labelKey: string; icon: React.ComponentType<{ className?: string }>; text: string }> = {
  spot: { labelKey: 'cat_spot', icon: Landmark, text: 'text-teal-700 dark:text-teal-300' },
  food: { labelKey: 'cat_food', icon: Utensils, text: 'text-orange-700 dark:text-orange-300' },
  transport: { labelKey: 'cat_transport', icon: Train, text: 'text-sky-700 dark:text-sky-300' },
  hotel: { labelKey: 'cat_hotel', icon: Hotel, text: 'text-violet-700 dark:text-violet-300' },
  shopping: { labelKey: 'cat_shopping', icon: ShoppingBag, text: 'text-pink-700 dark:text-pink-300' },
  activity: { labelKey: 'cat_activity', icon: Sparkles, text: 'text-rose-700 dark:text-rose-300' },
  other: { labelKey: 'cat_other', icon: Pin, text: 'text-slate-700 dark:text-slate-300' },
};

export const TimelineTab: React.FC<TimelineTabProps> = ({
  trip,
  lang,
  onUpdateTrip,
  onOpenAddItem,
  onOpenEditItem,
  isPickMode,
  onStartMapPick,
  pickedCoords,
  onPickLocation,
  onOpenMemories,
}) => {
  const t = TRANSLATIONS[lang];
  const [timelineViewMode, setTimelineViewMode] = useState<'daily' | 'overview'>('daily');
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(1);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  const activeDay = trip.days.find((d) => d.dayNumber === selectedDayNumber) || trip.days[0] || {
    id: 'empty',
    dayNumber: 1,
    date: trip.startDate,
    items: [],
  };

  const handleSelectDay = (dayNum: number) => {
    setSelectedDayNumber(dayNum);
    setSelectedItemId(null);
  };

  const handleToggleComplete = (itemId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const updatedDays = trip.days.map((day) => ({
      ...day,
      items: day.items.map((it) => (it.id === itemId ? { ...it, completed: !it.completed } : it)),
    }));
    onUpdateTrip({ ...trip, days: updatedDays, updatedAt: Date.now() });
  };

  const handleDeleteItem = (itemId: string) => {
    const updatedDays = trip.days.map((day) => {
      if (day.dayNumber !== selectedDayNumber) return day;
      return {
        ...day,
        items: day.items.filter((it) => it.id !== itemId),
      };
    });
    onUpdateTrip({ ...trip, days: updatedDays, updatedAt: Date.now() });
  };

  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    const items = [...activeDay.items];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= items.length) return;

    const temp = items[index];
    items[index] = items[targetIdx];
    items[targetIdx] = temp;

    const updatedDays = trip.days.map((day) => {
      if (day.dayNumber !== selectedDayNumber) return day;
      return { ...day, items };
    });
    onUpdateTrip({ ...trip, days: updatedDays, updatedAt: Date.now() });
  };

  const handleAddDay = () => {
    const newDayNum = trip.days.length + 1;
    const lastDay = trip.days[trip.days.length - 1];
    let nextDate = trip.endDate;
    if (lastDay) {
      const d = new Date(lastDay.date);
      d.setDate(d.getDate() + 1);
      nextDate = d.toISOString().slice(0, 10);
    }

    const newDay: DayPlan = {
      id: `day-${Date.now()}-${newDayNum}`,
      dayNumber: newDayNum,
      date: nextDate,
      theme: lang === 'zh' ? `第 ${newDayNum} 天行程` : `Day ${newDayNum} Schedule`,
      items: [],
    };

    onUpdateTrip({
      ...trip,
      days: [...trip.days, newDay],
      endDate: nextDate,
      updatedAt: Date.now(),
    });
    setSelectedDayNumber(newDayNum);
  };

  return (
    <div className="space-y-4">
      {/* View Mode Switcher: 每日時序 vs 全程總覽大表 */}
      <div className="flex items-center justify-between gap-2 pb-1">
        <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTimelineViewMode('daily')}
            className={`px-3.5 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
              timelineViewMode === 'daily'
                ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 font-bold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>{lang === 'zh' ? '每日行程時序' : 'Daily Timeline'}</span>
          </button>
          <button
            type="button"
            onClick={() => setTimelineViewMode('overview')}
            className={`px-3.5 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
              timelineViewMode === 'overview'
                ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 font-bold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{lang === 'zh' ? '全程 9 天總覽大表' : 'Trip Overview Table'}</span>
          </button>
        </div>

        {timelineViewMode === 'daily' && (
          <button
            onClick={() => setIsMapExpanded(!isMapExpanded)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold shrink-0 transition"
          >
            <MapIcon className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>{isMapExpanded ? (lang === 'zh' ? '收合地圖' : 'Hide Map') : (lang === 'zh' ? '展開地圖' : 'Show Map')}</span>
            {isMapExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* If overview mode: show ItineraryOverviewTable */}
      {timelineViewMode === 'overview' ? (
        <ItineraryOverviewTable
          trip={trip}
          selectedDayNumber={selectedDayNumber}
          onSelectDay={(dayNum) => {
            handleSelectDay(dayNum);
            setTimelineViewMode('daily');
          }}
          lang={lang}
          defaultExpanded={true}
        />
      ) : (
        <>
          {/* Day Selector Segmented Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {trip.days.map((day) => {
              const isCurrent = day.dayNumber === selectedDayNumber;
              const completedCount = day.items.filter((i) => i.completed).length;
              return (
                <button
                  key={day.id}
                  onClick={() => handleSelectDay(day.dayNumber)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                    isCurrent
                      ? 'bg-teal-700 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <span>{t.day.replace('{n}', String(day.dayNumber))}</span>
                  <span className="text-[10px] opacity-75 font-normal">
                    ({formatMonthDaySlash(day.date)})
                  </span>
                  {day.items.length > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                        isCurrent
                          ? 'bg-teal-900/60 text-teal-100'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {completedCount}/{day.items.length}
                    </span>
                  )}
                </button>
              );
            })}

            <button
              onClick={handleAddDay}
              className="px-2.5 py-2 rounded-xl border border-dashed border-teal-500 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 text-xs font-semibold flex items-center gap-1 shrink-0 transition"
              title={lang === 'zh' ? '增加一天' : 'Add Day'}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+</span>
            </button>
          </div>

          {/* Interactive Map (When expanded) */}
          {isMapExpanded && (
            <LeafletMap
              items={activeDay.items}
              selectedItemId={selectedItemId}
              onSelectItem={(it) => setSelectedItemId(it.id)}
              isPickMode={isPickMode}
              onPickLocation={onPickLocation}
              pickedLocation={pickedCoords}
            />
          )}

          {/* Day Memories Banner (if any exist) */}
          {(() => {
            const dayMems = (trip.memories || []).filter((m) => m.dayNumber === activeDay.dayNumber);
            if (dayMems.length === 0) return null;
            return (
              <div
                onClick={() => onOpenMemories?.()}
                className="rounded-2xl p-3 bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/40 flex items-center justify-between cursor-pointer hover:bg-rose-50 transition shadow-2xs group"
              >
                <div className="flex items-center gap-2 text-xs">
                  <Camera className="w-4 h-4 text-rose-500" />
                  <span className="font-bold text-rose-900 dark:text-rose-200">
                    Day {activeDay.dayNumber} 共有 {dayMems.length} 張回憶相片與隨拍
                  </span>
                </div>
                <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 group-hover:translate-x-0.5 transition flex items-center gap-1">
                  <span>前往相簿</span>
                  <span>→</span>
                </span>
              </div>
            );
          })()}

      {/* Active Day Header Bar */}
      <div id="day-schedule-section" className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 scroll-mt-20">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-bold text-teal-700 dark:text-teal-300">
              {t.day.replace('{n}', String(activeDay.dayNumber))}
            </span>
            <span>·</span>
            <span className="flex items-center gap-1 font-mono">
              <Calendar className="w-3.5 h-3.5" />
              {formatDateSlash(activeDay.date)}
            </span>
          </div>
          <h3 className="font-bold text-slate-900 dark:text-white text-base mt-1">
            {activeDay.theme || t.day.replace('{n}', String(activeDay.dayNumber))}
          </h3>
          {activeDay.notes && (
            <p className="text-slate-600 dark:text-slate-400 text-xs mt-1">
              {activeDay.notes}
            </p>
          )}
        </div>

        <button
          onClick={() => onOpenAddItem(activeDay.dayNumber)}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t.addSpot}</span>
        </button>
      </div>

      {/* Timeline Items List */}
      {activeDay.items.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
          <p className="text-slate-500 dark:text-slate-400 text-xs">
            {lang === 'zh' ? '目前尚無行程，點選按鈕開始規劃' : 'No schedule yet. Tap below to add a spot.'}
          </p>
          <button
            onClick={() => onOpenAddItem(activeDay.dayNumber)}
            className="mt-3 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.addSpot}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {activeDay.items.map((item, index) => {
            const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP.other;
            const catLabel = (t as any)[cat.labelKey] || cat.labelKey;
            const isSelected = item.id === selectedItemId;
            const pinColor = CATEGORY_COLORS[item.category] || '#0d9488';

            // Distance & Travel time to next spot
            const nextItem = activeDay.items[index + 1];
            let distanceInfo = null;
            if (item.lat && item.lng && nextItem && nextItem.lat && nextItem.lng) {
              const km = calculateDistanceKm(
                { lat: item.lat, lng: item.lng },
                { lat: nextItem.lat, lng: nextItem.lng }
              );
              const times = estimateTravelTime(km);
              distanceInfo = {
                distStr: formatDistance(km),
                walkingMin: times.walkingMin,
                transitMin: times.transitMin,
              };
            }

            return (
              <div key={item.id} className="space-y-2">
                {/* Spot Card */}
                <div
                  id={`spot-card-${item.id}`}
                  onClick={() => setSelectedItemId(item.id)}
                  className={`rounded-2xl p-4 sm:p-5 transition shadow-2xs bg-white dark:bg-slate-900 border cursor-pointer ${
                    isSelected
                      ? 'border-teal-500 ring-2 ring-teal-500/20 shadow-md'
                      : item.completed
                      ? 'border-emerald-200 dark:border-emerald-950 bg-emerald-50/10 opacity-75'
                      : 'border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3.5">
                    {/* Left Info with Map Pin Twin Badge */}
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      {/* Map Pin Matcher Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItemId(item.id);
                          if (typeof window !== 'undefined' && window.innerWidth < 768) {
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }
                        }}
                        title={lang === 'zh' ? `點擊在地圖定位第 ${index + 1} 站` : `Locate stop #${index + 1} on map`}
                        className="relative shrink-0 flex flex-col items-center group/pin transition-transform active:scale-95 cursor-pointer mt-0.5 select-none"
                      >
                        <div
                          style={{ backgroundColor: pinColor }}
                          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full text-white flex items-center justify-center font-black text-xs shadow-md border-2 border-white dark:border-slate-800 transition-all ${
                            isSelected
                              ? 'ring-4 ring-teal-400 scale-110 shadow-lg'
                              : 'group-hover/pin:scale-105'
                          }`}
                        >
                          <span>{index + 1}</span>
                        </div>
                        <div
                          style={{ borderTopColor: pinColor }}
                          className="w-0 h-0 border-l-[3.5px] border-l-transparent border-r-[3.5px] border-r-transparent border-t-[4.5px] -mt-0.5"
                        />
                      </button>

                      {/* Text details */}
                      <div className="space-y-1.5 flex-1 min-w-0">
                        {/* Quiet unboxed metadata */}
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium flex-wrap">
                          <span className="flex items-center gap-1 font-mono text-teal-700 dark:text-teal-400 font-semibold bg-teal-50/80 dark:bg-teal-950/40 px-2 py-0.5 rounded-md">
                            <Clock className="w-3.5 h-3.5" />
                            {item.startTime}
                            {item.endTime ? ` - ${item.endTime}` : ''}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className={`flex items-center gap-1 ${cat.text}`}>
                            <cat.icon className="w-3.5 h-3.5 shrink-0" />
                            <span>{catLabel}</span>
                          </span>
                          {item.bookingCode && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-amber-700 dark:text-amber-400 font-semibold">
                                #{item.bookingCode}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Spot Title */}
                        <h4
                          className={`text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white ${
                            item.completed ? 'line-through text-slate-400 dark:text-slate-500' : ''
                          }`}
                        >
                          {item.title}
                        </h4>

                        {/* Location Address */}
                        {(item.locationName || item.address) && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{item.locationName || item.address}</span>
                          </p>
                        )}

                      {/* Notes / Transport info */}
                      {item.transportNote && (
                        <p className="text-xs text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 p-2.5 rounded-xl border border-teal-100 dark:border-teal-900/60 flex items-start gap-1.5">
                          <Bus className="w-3.5 h-3.5 shrink-0 mt-0.5 text-teal-600 dark:text-teal-400" />
                          <span>{item.transportNote}</span>
                        </p>
                      )}

                      {item.notes && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                          {item.notes}
                        </p>
                      )}

                      {/* Spot Memory Photos Thumbnail Badges */}
                      {item.memoryPhotos && item.memoryPhotos.length > 0 && (
                        <div
                          onClick={(e) => {
                            if (onOpenMemories) {
                              e.stopPropagation();
                              onOpenMemories(item.id);
                            }
                          }}
                          className={`flex items-center gap-1.5 pt-1 overflow-x-auto pb-0.5 ${
                            onOpenMemories ? 'cursor-pointer group/mem' : ''
                          }`}
                          title={onOpenMemories ? (lang === 'zh' ? '點擊前往相簿查看此景點回憶照' : 'View in photo album') : undefined}
                        >
                          {item.memoryPhotos.map((photo, pIdx) => (
                            <img
                              key={pIdx}
                              src={photo}
                              alt="Spot memory"
                              className="w-10 h-10 rounded-lg object-cover border border-rose-200 dark:border-rose-900/60 shrink-0 group-hover/mem:scale-105 transition"
                            />
                          ))}
                          <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold shrink-0 flex items-center gap-1 bg-rose-50 dark:bg-rose-950/60 px-2 py-1 rounded-lg">
                            <Camera className="w-3 h-3" />
                            <span>{item.memoryPhotos.length} 張回憶照 {onOpenMemories && '→'}</span>
                          </span>
                        </div>
                      )}

                      {typeof item.cost === 'number' && item.cost > 0 && (
                        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-mono pt-0.5">
                          <DollarSign className="w-3.5 h-3.5 text-teal-600" />
                          <span>{trip.currency} {item.cost.toLocaleString()}</span>
                          <span className="text-[10px] text-slate-400">
                            ({item.costPaid ? (lang === 'zh' ? '已付款' : 'Paid') : (lang === 'zh' ? '現場付' : 'Unpaid')})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                    {/* Right Control Actions */}
                    <div className="flex items-center sm:flex-col gap-1.5 self-end sm:self-start shrink-0">
                      {/* Check-in toggle */}
                      <button
                        type="button"
                        onClick={(e) => handleToggleComplete(item.id, e)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                          item.completed
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                            : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {item.completed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        <span>{item.completed ? t.checked : t.checkin}</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          disabled={index === 0}
                          onClick={() => handleMoveItem(index, 'up')}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20"
                          title={lang === 'zh' ? '上移' : 'Move up'}
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>

                        <button
                          disabled={index === activeDay.items.length - 1}
                          onClick={() => handleMoveItem(index, 'down')}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20"
                          title={lang === 'zh' ? '下移' : 'Move down'}
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onOpenEditItem(item, selectedDayNumber)}
                          className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title={lang === 'zh' ? '編輯' : 'Edit'}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          title={lang === 'zh' ? '刪除' : 'Delete'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Navigation and Location Bar */}
                  <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <a
                        href={getGoogleMapsNavigationUrl(item)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-2xs transition active:scale-95"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>{t.navGoogle}</span>
                      </a>

                      {onOpenMemories && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenMemories(item.id);
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-semibold text-xs flex items-center gap-1.5 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition active:scale-95 border border-rose-200/80 dark:border-rose-800/60"
                          title="上傳或查看此景點回憶照片"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>
                            {item.memoryPhotos && item.memoryPhotos.length > 0
                              ? `${item.memoryPhotos.length} 張回憶`
                              : (lang === 'zh' ? '回憶相片' : 'Memories')}
                          </span>
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setSelectedItemId(item.id);
                        setIsMapExpanded(true);
                      }}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span>{t.locateMap}</span>
                    </button>
                  </div>
                </div>

                {/* Transit Step Connector to Next Spot */}
                {distanceInfo && (
                  <div className="py-1 px-4 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-medium bg-slate-100/80 dark:bg-slate-800/80 px-3 py-1 rounded-full border border-slate-200/60 dark:border-slate-700/60">
                      <Footprints className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span>{t.distToNext} {distanceInfo.distStr}</span>
                      <span aria-hidden="true">·</span>
                      <span>{t.walkMin.replace('{m}', String(distanceInfo.walkingMin))}</span>
                      <span aria-hidden="true">·</span>
                      <span>{t.driveMin.replace('{m}', String(distanceInfo.transitMin))}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  )}
</div>
);
};
